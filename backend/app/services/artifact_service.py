"""
Artifact Service (Codename: Kestrel)
Manages standalone Markdown and HTML deliverables with CSP sanitization
and optimistic version control per IMPLEMENTATION_SPEC.md §5.8 & §9.1.
"""

from __future__ import annotations

import datetime
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.entities import Artifact
from backend.app.security.sanitizer import build_sandboxed_preview_html


class ArtifactService:
    @staticmethod
    async def create_artifact(
        db: AsyncSession,
        session_id: uuid.UUID,
        kind: str,
        title: str,
        content: str,
        source_message_id: uuid.UUID | None = None,
        growth_brief_id: uuid.UUID | None = None,
    ) -> Artifact:
        """
        Create artifact with automatic server-side preview derivation.
        HTML content is strictly sanitized and wrapped in an isolated CSP document.
        """
        now = datetime.datetime.now(datetime.UTC)
        preview: str | None = None
        if kind == "html":
            preview = build_sandboxed_preview_html(content, title=title)
        else:
            preview = content

        artifact = Artifact(
            session_id=session_id,
            source_message_id=source_message_id,
            growth_brief_id=growth_brief_id,
            kind=kind,
            title=title,
            content=content,
            preview_content=preview,
            version=1,
            created_at=now,
            updated_at=now,
        )
        db.add(artifact)
        await db.commit()
        await db.refresh(artifact)
        return artifact

    @staticmethod
    async def get_artifact(
        db: AsyncSession,
        artifact_id: uuid.UUID,
    ) -> Artifact | None:
        """Fetch artifact by ID."""
        stmt = select(Artifact).where(Artifact.id == artifact_id)
        result = await db.execute(stmt)
        return result.scalars().first()

    @staticmethod
    async def update_artifact(
        db: AsyncSession,
        artifact_id: uuid.UUID,
        content: str | None = None,
        title: str | None = None,
        expected_version: int | None = None,
    ) -> Artifact:
        """
        Update artifact content or title with optimistic version checks.
        Recomputes preview_content if content is modified.
        """
        artifact = await ArtifactService.get_artifact(db, artifact_id)
        if not artifact:
            raise KeyError(f"Artifact {artifact_id} not found")

        if expected_version is not None and artifact.version != expected_version:
            raise ValueError(
                f"Version conflict on artifact {artifact_id}: "
                f"expected {expected_version}, current {artifact.version}"
            )

        if title is not None:
            artifact.title = title

        if content is not None:
            artifact.content = content
            if artifact.kind == "html":
                artifact.preview_content = build_sandboxed_preview_html(
                    content, title=artifact.title
                )
            else:
                artifact.preview_content = content

        artifact.version += 1
        artifact.updated_at = datetime.datetime.now(datetime.UTC)

        await db.commit()
        await db.refresh(artifact)
        return artifact


default_artifact_service = ArtifactService()
