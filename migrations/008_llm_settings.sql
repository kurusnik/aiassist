-- Sprint 020: LLM Provider Layer
-- Таблица настроек LLM провайдера

CREATE TABLE IF NOT EXISTS llm_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  active_provider TEXT NOT NULL DEFAULT 'openrouter',
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT single_row CHECK (id = 1)
);

-- Устанавливаем провайдер по умолчанию
INSERT INTO llm_settings (id, active_provider, config)
VALUES (1, 'openrouter', '{}')
ON CONFLICT (id) DO NOTHING;