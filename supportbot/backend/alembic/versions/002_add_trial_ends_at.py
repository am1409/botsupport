"""add trial_ends_at column

Revision ID: 002
Revises: 001
Create Date: 2025-04-01
"""
from alembic import op
import sqlalchemy as sa

revision = '002'
down_revision = '001'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('clients',
        sa.Column('trial_ends_at', sa.DateTime(timezone=True), nullable=True)
    )

def downgrade():
    op.drop_column('clients', 'trial_ends_at')
