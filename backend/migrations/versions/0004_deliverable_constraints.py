"""Add CHECK constraints for growth_briefs.status and artifacts.kind

Implements IMPLEMENTATION_SPEC.md §5.7 (status IN ('draft','ready','archived'))
and §5.8 (kind IN ('markdown','html')) at the database level. The API layer
validates first; these constraints are defense in depth.

Revision ID: 0004_deliverable_constraints
Revises: 0003_align_spec_schema
Create Date: 2026-10-10
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0004_deliverable_constraints"
down_revision: str | None = "0003_align_spec_schema"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Validate existing rows before adding the constraints so a local
    # database with legacy values produces an actionable error instead of
    # a cryptic constraint violation.
    for table, column, allowed in (
        ("growth_briefs", "status", ("draft", "ready", "archived")),
        ("artifacts", "kind", ("markdown", "html")),
    ):
        values = ", ".join(f"'{v}'" for v in allowed)
        op.execute(
            f"UPDATE {table} SET {column} = {allowed[0]!r} "
            f"WHERE {column} IS NULL OR {column} NOT IN ({values})"
        )

    op.create_check_constraint(
        "chk_growth_briefs_status",
        "growth_briefs",
        "status IN ('draft', 'ready', 'archived')",
    )
    op.create_check_constraint(
        "chk_artifacts_kind",
        "artifacts",
        "kind IN ('markdown', 'html')",
    )


def downgrade() -> None:
    op.drop_constraint("chk_artifacts_kind", "artifacts", type_="check")
    op.drop_constraint("chk_growth_briefs_status", "growth_briefs", type_="check")
