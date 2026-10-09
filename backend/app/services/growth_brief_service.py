"""
Growth Brief Service (Codename: Kestrel)
Implements structured brief persistence and optimistic versioning per IMPLEMENTATION_SPEC.md §5.7.
"""

from __future__ import annotations

import datetime
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.entities import GrowthBrief


class GrowthBriefService:
    @staticmethod
    async def create_growth_brief(
        db: AsyncSession,
        session_id: uuid.UUID,
        title: str,
        problem: str,
        research_summary: str,
        recommendation: str,
        assumptions: list[str],
        experiment: dict[str, Any],
        risks: list[str],
        next_deliverable: str,
        product_context: str | None = None,
        source_message_id: uuid.UUID | None = None,
    ) -> GrowthBrief:
        """Create and persist a structured growth brief."""
        now = datetime.datetime.now(datetime.UTC)
        data_payload = {
            "problem": problem,
            "research_summary": research_summary,
            "recommendation": recommendation,
            "assumptions": assumptions,
            "experiment": experiment,
            "risks": risks,
            "next_deliverable": next_deliverable,
        }

        brief = GrowthBrief(
            session_id=session_id,
            source_message_id=source_message_id,
            title=title,
            version=1,
            status="draft",
            product_context=product_context,
            data=data_payload,
            created_at=now,
            updated_at=now,
        )
        db.add(brief)
        await db.commit()
        await db.refresh(brief)
        return brief

    @staticmethod
    async def get_growth_brief(
        db: AsyncSession,
        brief_id: uuid.UUID,
    ) -> GrowthBrief | None:
        """Retrieve growth brief by ID."""
        stmt = select(GrowthBrief).where(GrowthBrief.id == brief_id)
        result = await db.execute(stmt)
        return result.scalars().first()

    @staticmethod
    async def update_growth_brief(
        db: AsyncSession,
        brief_id: uuid.UUID,
        title: str | None = None,
        data_update: dict[str, Any] | None = None,
        status: str | None = None,
        expected_version: int | None = None,
    ) -> GrowthBrief:
        """
        Update growth brief with optimistic version check.
        Raises ValueError if expected_version does not match current version.
        """
        brief = await GrowthBriefService.get_growth_brief(db, brief_id)
        if not brief:
            raise KeyError(f"Growth brief {brief_id} not found")

        if expected_version is not None and brief.version != expected_version:
            raise ValueError(
                f"Version conflict on growth brief {brief_id}: "
                f"expected {expected_version}, current {brief.version}"
            )

        if title is not None:
            brief.title = title
        if status is not None:
            brief.status = status
        if data_update is not None:
            current_data = dict(brief.data)
            current_data.update(data_update)
            brief.data = current_data

        brief.version += 1
        brief.updated_at = datetime.datetime.now(datetime.UTC)

        await db.commit()
        await db.refresh(brief)
        return brief


default_growth_brief_service = GrowthBriefService()
