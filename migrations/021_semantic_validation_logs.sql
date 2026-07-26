-- Sprint: Semantic Knowledge Validation Layer v1
-- Таблица для логирования результатов валидации семантических знаний

CREATE TABLE IF NOT EXISTS semantic_validation_logs (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  term TEXT NOT NULL,
  confidence REAL NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('execute', 'confirmation_required', 'blocked', 'conflict')),
  selected_mapping TEXT,
  warnings JSONB DEFAULT '[]'::jsonb,
  corrections JSONB DEFAULT '[]'::jsonb,
  source_summary JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_semantic_validation_project
  ON semantic_validation_logs(project_id);

CREATE INDEX IF NOT EXISTS idx_semantic_validation_term
  ON semantic_validation_logs(term);

CREATE INDEX IF NOT EXISTS idx_semantic_validation_created
  ON semantic_validation_logs(created_at DESC);