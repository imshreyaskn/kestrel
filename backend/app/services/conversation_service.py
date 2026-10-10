"""
Conversation and Agent Orchestration Service (Codename: Kestrel)
Coordinates:
Context Loading -> Hybrid Retrieval -> Evidence Labeling -> Agent Drafting ->
Citation Grounding Validation -> Atomic Persistence -> Server-Sent Events.
Conforms strictly to IMPLEMENTATION_SPEC.md §6.4, §6.5, §7.5, §7.6, §8, §15.4.
"""

from __future__ import annotations

import asyncio
import datetime
import logging
import uuid
from collections.abc import AsyncGenerator
from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.agent_client.gateway_client import (
    AgentGatewayClient,
    default_gateway_client,
)
from backend.app.agent_client.prompts import (
    build_repair_system_prompt,
    build_system_prompt,
    format_evidence_block,
)
from backend.app.agent_client.validator import (
    EssayLengthError,
    ValidatedArtifactResponse,
    ValidatedEssayResponse,
    ValidatedGrowthBriefResponse,
    ValidatedResearchResponse,
    validate_agent_response,
)
from backend.app.core.config import settings
from backend.app.core.json_extractor import StructuredExtractionError
from backend.app.models.entities import (
    Message,
    MessageSource,
)
from backend.app.retrieval.hybrid_search import (
    EvidenceItem,
    HybridRetrievalService,
)
from backend.app.services.artifact_service import ArtifactService
from backend.app.services.growth_brief_service import GrowthBriefService
from backend.app.services.session_service import SessionService

logger = logging.getLogger("kestrel.conversation_service")

ABSTENTION_ANSWER = (
    "Not in the archive: I searched the Lenny's Podcast transcript corpus for "
    "this question and the retrieved evidence could not support a reliable, "
    "source-grounded answer. I'd rather show you the gap than invent a figure.\n\n"
    "Try a narrower question about a specific product or growth practice, "
    "framework, or guest story from the podcast."
)

ABSTENTION_FOLLOW_UP = (
    "Can you reframe the question around a specific growth practice, "
    "framework, or guest story from the podcast?"
)


class ModelNotAllowedError(ValueError):
    """Raised when a requested model_id is outside the server-configured allowlist."""


class ConversationFlowError(RuntimeError):
    """Typed failure raised by process_message (non-streaming path)."""

    def __init__(self, code: str, message: str, retryable: bool) -> None:
        super().__init__(message)
        self.code = code
        self.retryable = retryable


def classify_generation_error(exc: BaseException) -> tuple[str, str, bool]:
    """Map an internal exception to a safe, spec §6.1 error envelope triple.

    The raw exception text never crosses the API boundary; full details are
    logged server-side only.
    """
    if isinstance(exc, ModelNotAllowedError):
        return ("MODEL_NOT_ALLOWED", str(exc), False)
    if isinstance(exc, ConnectionError):
        return (
            "AGENT_UNAVAILABLE",
            "The generation service is unreachable. Verify the agent-gateway "
            "container is running, then retry.",
            True,
        )
    if isinstance(exc, TimeoutError):
        return (
            "GENERATION_TIMEOUT",
            "The model took too long to respond. Retry, or switch to a "
            "faster provider.",
            True,
        )
    if isinstance(exc, EssayLengthError):
        return (
            "ESSAY_LENGTH_OUT_OF_RANGE",
            f"The generated essay was {exc.actual_words} words; the Ship 30 "
            "for 30 contract requires 1,150-1,350 words (target ~1,250). "
            "Retry, or switch to a stronger provider.",
            True,
        )
    if isinstance(exc, StructuredExtractionError):
        return (
            "MODEL_OUTPUT_INVALID",
            "The model returned a response that failed validation. Retry, "
            "or switch to a stronger provider/model.",
            True,
        )
    return (
        "GENERATION_FAILED",
        "Generation failed unexpectedly. Retry, or switch provider.",
        True,
    )


class ConversationService:
    def __init__(
        self,
        retrieval_service: HybridRetrievalService | None = None,
        gateway_client: AgentGatewayClient | None = None,
    ) -> None:
        self.retrieval_service = retrieval_service or HybridRetrievalService()
        self.gateway_client = gateway_client or default_gateway_client

    @staticmethod
    def allowed_model_ids(provider: str, cloud_provider: str | None) -> set[str]:
        """Server-side model allowlist per spec §6.6: model_id must come from
        configured settings, never accepted arbitrarily from the client."""
        if provider == "local":
            return {settings.OLLAMA_CHAT_MODEL}
        effective_cloud = cloud_provider or settings.DEFAULT_CLOUD_PROVIDER
        if effective_cloud == "anthropic":
            return {settings.ANTHROPIC_MODEL}
        if effective_cloud == "openai":
            return {settings.OPENAI_MODEL}
        return {settings.GEMINI_MODEL}

    @classmethod
    def resolve_model_id(
        cls,
        provider: str,
        cloud_provider: str | None,
        requested_model: str | None,
    ) -> str:
        """Resolve the effective model, enforcing the allowlist.

        Raises ModelNotAllowedError when an explicit request is outside the
        configured set (spec §3.2: the browser sends enums; the backend maps
        them to allowlisted configuration).
        """
        allowed = cls.allowed_model_ids(provider, cloud_provider)
        if requested_model:
            if requested_model not in allowed:
                raise ModelNotAllowedError(
                    f"Model '{requested_model}' is not in the configured "
                    f"allowlist for provider '{provider}'. "
                    f"Allowed: {sorted(allowed)}."
                )
            return requested_model
        return next(iter(allowed))

    async def process_message(
        self,
        db: AsyncSession,
        session_id: uuid.UUID,
        user_id: uuid.UUID,
        content: str,
        mode: str = "research",
        provider: str = "local",
        cloud_provider: str | None = None,
        model_id: str | None = None,
        product_context: str | None = None,
        request_id: str | None = None,
    ) -> dict[str, Any]:
        """
        Execute full conversation pipeline non-streaming.
        """
        final_result = None
        async for event in self.process_message_stream(
            db=db,
            session_id=session_id,
            user_id=user_id,
            content=content,
            mode=mode,
            provider=provider,
            cloud_provider=cloud_provider,
            model_id=model_id,
            product_context=product_context,
            request_id=request_id,
        ):
            if event["event"] == "completed":
                final_result = event["data"]
            elif event["event"] == "error":
                err = event["data"].get("error", {})
                raise ConversationFlowError(
                    code=err.get("code", "GENERATION_FAILED"),
                    message=err.get("message", "Conversation generation failed"),
                    retryable=bool(err.get("retryable", False)),
                )

        if final_result is None:
            raise ConversationFlowError(
                code="GENERATION_FAILED",
                message="Conversation processing completed without output",
                retryable=True,
            )
        return final_result

    async def process_message_stream(
        self,
        db: AsyncSession,
        session_id: uuid.UUID,
        user_id: uuid.UUID,
        content: str,
        mode: str = "research",
        provider: str = "local",
        cloud_provider: str | None = None,
        model_id: str | None = None,
        product_context: str | None = None,
        request_id: str | None = None,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """
        Execute conversation pipeline yielding structured Server-Sent Events:
        - run_started
        - stage (loading_context, retrieving, drafting, validating, saving)
        - completed
        - error
        """
        run_id = request_id or str(uuid.uuid4())
        now = datetime.datetime.now(datetime.UTC)
        effective_cloud_provider = cloud_provider or settings.DEFAULT_CLOUD_PROVIDER

        # Server-side model allowlist (spec §6.6). The router pre-validates;
        # this is defense-in-depth for direct service callers.
        try:
            effective_model_id = self.resolve_model_id(
                provider, effective_cloud_provider, model_id
            )
        except ModelNotAllowedError as exc:
            code, message, retryable = classify_generation_error(exc)
            yield {
                "event": "error",
                "data": {
                    "error": {
                        "code": code,
                        "message": message,
                        "retryable": retryable,
                        "request_id": run_id,
                    }
                },
            }
            return

        # -------------------------------------------------------------
        # STAGE 1: LOADING CONTEXT
        # -------------------------------------------------------------
        yield {
            "event": "stage",
            "data": {"stage": "loading_context", "label": "Loading session context..."},
        }

        # 1. Enforce user ownership of session
        session = await SessionService.get_session(db, session_id, user_id)
        if not session:
            yield {
                "event": "error",
                "data": {
                    "error": {
                        "code": "NOT_FOUND",
                        "message": f"Session {session_id} not found or unauthorized",
                        "retryable": False,
                        "request_id": run_id,
                    }
                },
            }
            return

        # 2. Persist user message. The assistant message is timestamped one
        # microsecond later so chronological ordering of the pair is
        # deterministic (created_at is otherwise identical for both rows).
        user_message = Message(
            session_id=session_id,
            role="user",
            content=content.strip(),
            status="complete",
            workflow_mode=mode,
            mode=mode,
            provider=provider,
            model_id=effective_model_id,
            created_at=now,
            completed_at=now,
        )
        db.add(user_message)

        # 3. Insert pending assistant message
        assistant_message = Message(
            session_id=session_id,
            role="assistant",
            content="",
            status="pending",
            workflow_mode=mode,
            mode=mode,
            provider=provider,
            model_id=effective_model_id,
            created_at=now + datetime.timedelta(microseconds=1),
        )
        db.add(assistant_message)
        await db.commit()
        await db.refresh(assistant_message)

        yield {
            "event": "run_started",
            "data": {
                "run_id": run_id,
                "message_id": str(assistant_message.id),
                "session_id": str(session_id),
            },
        }

        # 4. Fetch bounded conversation history (up to MAX_CONTEXT_MESSAGES).
        # The just-inserted user message is excluded: it is passed to the
        # gateway separately as current_user_message (spec §6.6), so
        # including it here would duplicate it in the model prompt.
        stmt = (
            select(Message)
            .where(
                Message.session_id == session_id,
                Message.status == "complete",
                Message.id != assistant_message.id,
                Message.id != user_message.id,
            )
            .order_by(desc(Message.created_at))
            .limit(settings.MAX_CONTEXT_MESSAGES)
        )
        history_result = await db.execute(stmt)
        prior_messages = list(reversed(history_result.scalars().all()))
        conversation_context = [
            {"role": m.role, "content": m.content} for m in prior_messages
        ]

        try:
            # -------------------------------------------------------------
            # STAGE 2: RETRIEVING
            # -------------------------------------------------------------
            yield {
                "event": "stage",
                "data": {
                    "stage": "retrieving",
                    "label": "Retrieving podcast transcripts...",
                },
            }

            retrieval_res = await self.retrieval_service.search(
                session=db,
                query=content,
                top_k=settings.RETRIEVAL_TOP_K,
            )

            # Map retrieved evidence items to request-scoped [E1..En]
            evidence_items: list[EvidenceItem] = list(retrieval_res)
            valid_evidence_ids = {e.evidence_id for e in evidence_items}
            evidence_map = {e.evidence_id: e for e in evidence_items}

            # -------------------------------------------------------------
            # STAGES 3–4: DRAFTING + VALIDATING (skipped on abstention)
            # -------------------------------------------------------------
            # Spec §7.6/§11.2/§12.1: when retrieval yields no usable
            # evidence the pipeline must NOT call generation. Abstain with
            # an explicit notice instead of letting the model improvise.
            if retrieval_res.insufficient_evidence or not evidence_items:
                yield {
                    "event": "stage",
                    "data": {
                        "stage": "validating",
                        "label": "Checking evidence sufficiency...",
                    },
                }
                validated_any: Any = ValidatedResearchResponse(
                    answer_markdown=ABSTENTION_ANSWER,
                    citations=[],
                    insufficient_evidence=True,
                    follow_up_question=ABSTENTION_FOLLOW_UP,
                )
            else:
                yield {
                    "event": "stage",
                    "data": {"stage": "drafting", "label": "Synthesizing answer..."},
                }

                evidence_block = format_evidence_block(evidence_items)
                system_prompt = build_system_prompt(
                    mode=mode,
                    evidence_block=evidence_block,
                    product_context=product_context,
                )

                # Call internal Agent Gateway
                gw_result = await self.gateway_client.generate(
                    session_id=str(session_id),
                    current_user_message=content,
                    mode=mode,
                    provider=provider,
                    cloud_provider=effective_cloud_provider,
                    model_id=effective_model_id,
                    conversation_context=conversation_context,
                    evidence=evidence_items,
                    product_context=product_context,
                    request_id=run_id,
                    system_prompt=system_prompt,
                )

                yield {
                    "event": "stage",
                    "data": {
                        "stage": "validating",
                        "label": "Validating citations & grounding...",
                    },
                }

                # Spec §7.6/§11.2: at most ONE constrained repair attempt
                # for a corrupt model response, then surface a recoverable
                # error. No unbounded retries.
                try:
                    validated_any = validate_agent_response(
                        raw_response_text=gw_result.raw_response,
                        mode=mode,
                        valid_evidence_ids=valid_evidence_ids,
                    )
                except StructuredExtractionError as first_error:
                    logger.warning(
                        "Run %s: initial model output failed validation (%s); "
                        "attempting one constrained repair",
                        run_id,
                        first_error,
                    )
                    yield {
                        "event": "stage",
                        "data": {
                            "stage": "validating",
                            "label": "Repairing response format...",
                        },
                    }
                    repair_prompt = build_repair_system_prompt(
                        mode=mode,
                        evidence_block=evidence_block,
                        product_context=product_context,
                        validation_error=str(first_error),
                    )
                    gw_result = await self.gateway_client.generate(
                        session_id=str(session_id),
                        current_user_message=content,
                        mode=mode,
                        provider=provider,
                        cloud_provider=effective_cloud_provider,
                        model_id=effective_model_id,
                        conversation_context=conversation_context,
                        evidence=evidence_items,
                        product_context=product_context,
                        request_id=run_id,
                        system_prompt=repair_prompt,
                    )
                    validated_any = validate_agent_response(
                        raw_response_text=gw_result.raw_response,
                        mode=mode,
                        valid_evidence_ids=valid_evidence_ids,
                    )

            validated = validated_any

            # -------------------------------------------------------------
            # STAGE 5: SAVING
            # -------------------------------------------------------------
            yield {
                "event": "stage",
                "data": {
                    "stage": "saving",
                    "label": "Persisting session & evidence...",
                },
            }

            save_now = datetime.datetime.now(datetime.UTC)
            growth_brief_id: uuid.UUID | None = None
            artifact_id: uuid.UUID | None = None

            # Determine assistant content based on validated type
            if isinstance(validated, ValidatedGrowthBriefResponse):
                assistant_message.content = (
                    f"## {validated.title}\n\n"
                    f"**Problem:** {validated.problem}\n\n"
                    f"**Recommendation:** {validated.recommendation}\n\n"
                    f"**Research Summary:** {validated.research_summary}\n\n"
                    f"*(Structured Growth Brief persisted to workbench)*"
                )
                if not validated.insufficient_evidence:
                    brief = await GrowthBriefService.create_growth_brief(
                        db=db,
                        session_id=session_id,
                        title=validated.title,
                        problem=validated.problem,
                        research_summary=validated.research_summary,
                        recommendation=validated.recommendation,
                        assumptions=validated.assumptions,
                        experiment=validated.experiment.model_dump(),
                        risks=validated.risks,
                        next_deliverable=validated.next_deliverable,
                        product_context=product_context,
                        source_message_id=assistant_message.id,
                    )
                    growth_brief_id = brief.id

            elif isinstance(validated, ValidatedEssayResponse):
                assistant_message.content = validated.essay_markdown

            elif isinstance(validated, ValidatedArtifactResponse):
                assistant_message.content = (
                    f"Created {validated.kind.upper()} artifact: **{validated.title}**"
                )
                artifact = await ArtifactService.create_artifact(
                    db=db,
                    session_id=session_id,
                    kind=validated.kind,
                    title=validated.title,
                    content=validated.content,
                    source_message_id=assistant_message.id,
                )
                artifact_id = artifact.id

            else:  # ValidatedResearchResponse
                assistant_message.content = validated.answer_markdown

            assistant_message.status = "complete"
            assistant_message.completed_at = save_now

            # Preserve honest retrieval provenance: the RRF fused score is
            # recorded in message metadata rather than being mislabeled as a
            # semantic or keyword score in message_sources (spec §5.6).
            assistant_message.metadata_ = {
                "evidence_rrf_scores": {
                    e.evidence_id: e.rrf_score for e in evidence_items
                }
            }

            # Persist message_sources join table records for validated citations.
            # retrieval_rank is the ordinal position in the final fused
            # evidence ranking for this run.
            citation_payloads: list[dict[str, Any]] = []
            for cit in getattr(validated, "citations", []):
                ev = evidence_map.get(cit.evidence_id)
                if ev and ev.chunk_id:
                    ms = MessageSource(
                        message_id=assistant_message.id,
                        chunk_id=ev.chunk_id,
                        evidence_id=cit.evidence_id,
                        supports=cit.supports or "",
                        retrieval_rank=len(citation_payloads) + 1,
                        semantic_score=None,
                        keyword_score=None,
                    )
                    db.add(ms)

                    citation_payloads.append(
                        {
                            "evidence_id": cit.evidence_id,
                            "source_id": str(ev.source_id),
                            "chunk_id": str(ev.chunk_id),
                            "guest": ev.guest,
                            "episode_title": ev.episode_title,
                            "episode_url": ev.episode_url,
                            "publish_date": str(ev.publish_date)
                            if ev.publish_date
                            else None,
                            "excerpt": ev.excerpt,  # Stored chunk content
                            "supports": cit.supports,
                        }
                    )

            # Update session last_message_at and derive a title from the
            # first user message when the session still has the default
            # title (spec §5.2).
            session.last_message_at = save_now
            current_title = (session.title or "").strip().lower()
            if current_title in ("", "new chat"):
                derived_title = content.strip()[:60]
                if derived_title:
                    session.title = derived_title
                    session.updated_at = save_now
            await db.commit()
            await db.refresh(assistant_message)

            # -------------------------------------------------------------
            # STAGE 6: COMPLETED
            # -------------------------------------------------------------
            yield {
                "event": "completed",
                "data": {
                    "message": {
                        "id": str(assistant_message.id),
                        "session_id": str(session_id),
                        "role": "assistant",
                        "status": "complete",
                        "content": assistant_message.content,
                        "mode": mode,
                        "provider": provider,
                        "model_id": effective_model_id,
                        "created_at": assistant_message.created_at.isoformat(),
                        "completed_at": assistant_message.completed_at.isoformat()
                        if assistant_message.completed_at
                        else None,
                    },
                    "citations": citation_payloads,
                    "insufficient_evidence": getattr(
                        validated, "insufficient_evidence", False
                    ),
                    "growth_brief_id": str(growth_brief_id)
                    if growth_brief_id
                    else None,
                    "artifact_id": str(artifact_id) if artifact_id else None,
                },
            }

        except (GeneratorExit, asyncio.CancelledError):
            # Client disconnected or the run was struck mid-flight (spec §6.5).
            # No partial draft is persisted as a complete answer: the pending
            # assistant row is closed as cancelled with no generated content.
            try:
                assistant_message.status = "cancelled"
                assistant_message.error_code = "CANCELLED"
                await db.commit()
                logger.info(
                    "Run %s cancelled for session %s; assistant message %s marked cancelled",
                    run_id,
                    session_id,
                    assistant_message.id,
                )
            except Exception:  # noqa: BLE001
                logger.exception(
                    "Failed to mark assistant message %s as cancelled for session %s",
                    assistant_message.id,
                    session_id,
                )
            raise

        except Exception as exc:  # noqa: BLE001
            # Full exception details stay in server-side logs; the client
            # receives only a classified, redacted envelope (spec §6.1/§11.1).
            code, safe_message, retryable = classify_generation_error(exc)
            logger.exception(
                "Conversation processing failed for session %s (run %s, code %s): %s",
                session_id,
                run_id,
                code,
                exc,
            )
            try:
                assistant_message.status = "failed"
                assistant_message.error_code = code
                await db.commit()
            except Exception:  # noqa: BLE001
                logger.exception(
                    "Failed to persist failed status for assistant message %s",
                    assistant_message.id,
                )

            yield {
                "event": "error",
                "data": {
                    "error": {
                        "code": code,
                        "message": safe_message,
                        "retryable": retryable,
                        "request_id": run_id,
                    }
                },
            }


default_conversation_service = ConversationService()
