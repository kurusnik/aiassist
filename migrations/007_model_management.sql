-- Sprint 015: Model Management Platform
-- Таблица каталога моделей из OpenRouter

CREATE TABLE IF NOT EXISTS models (
  id TEXT PRIMARY KEY,
  slug TEXT,
  name TEXT,
  provider TEXT,
  context_length BIGINT,
  pricing_prompt NUMERIC(12,6),
  pricing_completion NUMERIC(12,6),
  supports_tools BOOLEAN,
  supports_reasoning BOOLEAN,
  supports_vision BOOLEAN,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Таблица назначения моделей по ролям

CREATE TABLE IF NOT EXISTS model_assignments (
  role TEXT PRIMARY KEY,
  model_id TEXT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);