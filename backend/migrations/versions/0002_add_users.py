"""add users table and seed demo user

Revision ID: 0002_add_users
Revises: 0001_initial_schema
Create Date: 2026-10-09 17:30:00.000000

"""
import datetime
import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '0002_add_users'
down_revision: str | None = '0001_initial_schema'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

DEMO_USER_ID = uuid.UUID('00000000-0000-4000-8000-000000000001')


def upgrade() -> None:
    # 1. Table: users
    op.create_table(
        'users',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('full_name', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_users_email', 'users', ['email'], unique=True)

    # 2. Seed single-user local demo identity
    users_table = sa.table(
        'users',
        sa.column('id', postgresql.UUID(as_uuid=True)),
        sa.column('email', sa.String),
        sa.column('full_name', sa.String),
        sa.column('created_at', sa.DateTime(timezone=True)),
        sa.column('updated_at', sa.DateTime(timezone=True)),
    )
    now = datetime.datetime.now(datetime.timezone.utc)
    op.bulk_insert(
        users_table,
        [
            {
                'id': DEMO_USER_ID,
                'email': 'demo@kestrel.local',
                'full_name': 'Kestrel Demo User',
                'created_at': now,
                'updated_at': now,
            }
        ],
    )

    # 3. Add foreign key from chat_sessions.user_id -> users.id
    op.create_foreign_key(
        'fk_chat_sessions_user_id_users',
        'chat_sessions',
        'users',
        ['user_id'],
        ['id'],
        ondelete='CASCADE',
    )
    op.create_index('ix_chat_sessions_user_id', 'chat_sessions', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_chat_sessions_user_id', table_name='chat_sessions')
    op.drop_constraint('fk_chat_sessions_user_id_users', 'chat_sessions', type_='foreignkey')
    op.drop_index('ix_users_email', table_name='users')
    op.drop_table('users')
