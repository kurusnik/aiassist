-- Sprint 11.6 — AIOS Workflow Execution Bridge
-- Adds columns for user-facing workflow metadata

ALTER TABLE workflow_instances ADD COLUMN IF NOT EXISTS workflow_type VARCHAR(100);
ALTER TABLE workflow_instances ADD COLUMN IF NOT EXISTS requested_by VARCHAR(255);
ALTER TABLE workflow_instances ADD COLUMN IF NOT EXISTS source VARCHAR(50) NOT NULL DEFAULT 'chat';

CREATE INDEX IF NOT EXISTS idx_workflow_instances_type ON workflow_instances(workflow_type);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_source ON workflow_instances(source);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_requested_by ON workflow_instances(requested_by);