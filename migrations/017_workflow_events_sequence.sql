-- Sprint 11.6 fix — workflow event ordering

ALTER TABLE workflow_events
ADD COLUMN IF NOT EXISTS sequence INTEGER;

CREATE INDEX IF NOT EXISTS idx_workflow_events_sequence
ON workflow_events(sequence);