-- Sprint 1 — Knowledge Platform v2: Observability & Diagnostics
-- Таблица хранения трейсов пайплайна Knowledge Layer

CREATE TABLE IF NOT EXISTS diagnostics_traces (
  id UUID PRIMARY KEY,
  user_query TEXT NOT NULL,
  stages JSONB DEFAULT '{}',
  metrics JSONB DEFAULT '{}',
  llm_prompt TEXT,
  llm_response TEXT,
  duration INTEGER,
  error JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_diagnostics_traces_created_at ON diagnostics_traces(created_at DESC);