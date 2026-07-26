-- Sprint 022: Model Assignment Fallback Chain
-- Таблица fallback-моделей для ролей

CREATE TABLE IF NOT EXISTS model_fallbacks (
  role TEXT PRIMARY KEY REFERENCES model_assignments(role) ON DELETE CASCADE,
  fallback_ids TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO model_fallbacks (role, fallback_ids, updated_at)
SELECT role, '{}', NOW() FROM model_assignments
ON CONFLICT (role) DO NOTHING;