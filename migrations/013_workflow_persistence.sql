-- Workflow Persistence Schema (Sprint 8 — Production Infrastructure Layer)

-- Workflow instances — one row per workflow execution
CREATE TABLE IF NOT EXISTS workflow_instances (
  id UUID PRIMARY KEY,
  trace_id UUID NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'created',
  input JSONB,
  nodes JSONB NOT NULL DEFAULT '{}',
  variables JSONB NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_instances_status ON workflow_instances(status);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_created_at ON workflow_instances(created_at);

-- Workflow node states — one row per node per workflow
CREATE TABLE IF NOT EXISTS workflow_nodes (
  id SERIAL PRIMARY KEY,
  workflow_id UUID NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  node_id VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  result JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workflow_id, node_id)
);

CREATE INDEX IF NOT EXISTS idx_workflow_nodes_workflow_id ON workflow_nodes(workflow_id);

-- Workflow events — append-only event log for audit and replay
CREATE TABLE IF NOT EXISTS workflow_events (
  id UUID PRIMARY KEY,
  workflow_id UUID REFERENCES workflow_instances(id) ON DELETE CASCADE,
  node_id VARCHAR(255),
  type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_events_workflow_id ON workflow_events(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_events_type ON workflow_events(type);
CREATE INDEX IF NOT EXISTS idx_workflow_events_timestamp ON workflow_events(timestamp);

-- Workflow approvals — persistent approval requests
CREATE TABLE IF NOT EXISTS workflow_approvals (
  id UUID PRIMARY KEY,
  workflow_id UUID REFERENCES workflow_instances(id) ON DELETE CASCADE,
  node_id VARCHAR(255),
  action JSONB,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  requested_by VARCHAR(255),
  approved_by VARCHAR(255),
  rejection_reason TEXT,
  permission_decision JSONB,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_workflow_approvals_workflow_id ON workflow_approvals(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_approvals_status ON workflow_approvals(status);

-- Audit trail — who did what and why
CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor VARCHAR(255),
  action VARCHAR(255) NOT NULL,
  resource VARCHAR(255),
  workflow_id UUID,
  node_id VARCHAR(255),
  decision VARCHAR(50),
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_audit_events_timestamp ON audit_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor ON audit_events(actor);
CREATE INDEX IF NOT EXISTS idx_audit_events_action ON audit_events(action);
CREATE INDEX IF NOT EXISTS idx_audit_events_workflow_id ON audit_events(workflow_id);