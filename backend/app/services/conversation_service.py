"""
Conversation and Agent Orchestration Service (Codename: Kestrel)
Coordinates:
Context Loading -> Hybrid Retrieval -> Evidence Labeling -> Agent Drafting ->
Citation Grounding Validation -> Atomic Persistence -> Server-Sent Events.
Conforms strictly to IMPLEMENTATION_SPEC.md §6.4, §6.5, §7.5, §7.6, §8, §15.4.
"""

from __future__ import annotations

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
    build_system_prompt,
    format_evidence_block,
)
from backend.app.agent_client.validator import (
    ValidatedArtifactResponse,
    ValidatedEssayResponse,
    ValidatedGrowthBriefResponse,
    validate_agent_response,
)
from backend.app.core.config import settings
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


class ConversationService:
    def __init__(
        self,
        retrieval_service: HybridRetrievalService | None = None,
        gateway_client: AgentGatewayClient | None = None,
    ) -> None:
        self.retrieval_service = retrieval_service or HybridRetrievalService()
        self.gateway_client = gateway_client or default_gateway_client

    async def _resolve_model_id(self, provider: str, requested_model: str | None) -> str:
        if requested_model:
            return requested_model
        if provider == "cloud":
            if settings.DEFAULT_CLOUD_PROVIDER == "anthropic":
                return settings.ANTHROPIC_MODEL
            elif settings.DEFAULT_CLOUD_PROVIDER == "openai":
                return settings.OPENAI_MODEL
            return settings.GEMINI_MODEL
        return settings.OLLAMA_CHAT_MODEL

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
                err_data = event["data"].get("error", {})
                raise RuntimeError(err_data.get("message", "Conversation generation failed"))

        if final_result is None:
            raise RuntimeError("Conversation processing completed without output")
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
        effective_model_id = await self._resolve_model_id(provider, model_id)
        effective_cloud_provider = cloud_provider or settings.DEFAULT_CLOUD_PROVIDER

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

        # 2. Persist user message
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
            created_at=now,
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

        # 4. Fetch bounded conversation history (up to MAX_CONTEXT_MESSAGES)
        stmt = (
            select(Message)
            .where(
                Message.session_id == session_id,
                Message.status == "complete",
                Message.id != assistant_message.id,
            )
            .order_by(desc(Message.created_at))
            .limit(settings.MAX_CONTEXT_MESSAGES)
        )
        history_result = await db.execute(stmt)
        prior_messages = list(reversed(history_result.scalars().all()))
        conversation_context = [
            {"role": m.role, "content": m.content}
            for m in prior_messages
        ]

        try:
            # -------------------------------------------------------------
            # STAGE 2: RETRIEVING
            # -------------------------------------------------------------
            yield {
                "event": "stage",
                "data": {"stage": "retrieving", "label": "Retrieving podcast transcripts..."},
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
            # STAGE 3: DRAFTING
            # -------------------------------------------------------------
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

            # -------------------------------------------------------------
            # STAGE 4: VALIDATING
            # -------------------------------------------------------------
            yield {
                "event": "stage",
                "data": {"stage": "validating", "label": "Validating citations & grounding..."},
            }

            validated = validate_agent_response(
                raw_response_text=gw_result.raw_response,
                mode=mode,
                valid_evidence_ids=valid_evidence_ids,
            )

            # -------------------------------------------------------------
            # STAGE 5: SAVING
            # -------------------------------------------------------------
            yield {
                "event": "stage",
                "data": {"stage": "saving", "label": "Persisting session & evidence..."},
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

            # Persist message_sources join table records for validated citations
            citation_payloads: list[dict[str, Any]] = []
            for cit in getattr(validated, "citations", []):
                ev = evidence_map.get(cit.evidence_id)
                if ev and ev.chunk_id:
                    ms = MessageSource(
                        message_id=assistant_message.id,
                        chunk_id=ev.chunk_id,
                        evidence_id=cit.evidence_id,
                        supports=cit.supports or "",
                        retrieval_rank=getattr(ev, "dense_rank", 1) or 1,
                        semantic_score=getattr(ev, "rrf_score", None),
                        keyword_score=None,
                    )
                    db.add(ms)

                    citation_payloads.append({
                        "evidence_id": cit.evidence_id,
                        "source_id": str(ev.source_id),
                        "chunk_id": str(ev.chunk_id),
                        "guest": ev.guest,
                        "episode_title": ev.episode_title,
                        "episode_url": ev.episode_url,
                        "publish_date": str(ev.publish_date) if ev.publish_date else None,
                        "excerpt": ev.excerpt,  # Stored chunk content
                        "supports": cit.supports,
                    })

            # Update session last_message_at
            session.last_message_at = save_now
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
                    "insufficient_evidence": getattr(validated, "insufficient_evidence", False),
                    "growth_brief_id": str(growth_brief_id) if growth_brief_id else None,
                    "artifact_id": str(artifact_id) if artifact_id else None,
                },
            }

        except Exception as exc:  # noqa: BLE001
            logger.error(f"Error during conversation processing for session {session_id}: {exc}")
            assistant_message.status = "failed"
            assistant_message.error_code = "GENERATION_FAILED"
            await db.commit()

            yield {
                "event": "error",
                "data": {
                    "error": {
                        "code": "GENERATION_FAILED",
                        "message": str(exc),
                        "retryable": True,
                        "request_id": run_id,
                    }
                },
            }


default_conversation_service = ConversationService()
