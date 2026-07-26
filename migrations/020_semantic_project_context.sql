-- Sprint: Semantic Knowledge + Project Context Resolver
-- Добавляет поддержку проектных семантических маппингов
-- project_id = NULL означает глобальный маппинг (обратная совместимость)
-- source: 'project_mapping', 'user_confirmation', 'rag_fallback', 'llm_suggestion'

ALTER TABLE semantic_mappings
  ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'global',
  ADD COLUMN IF NOT EXISTS business_term TEXT;

CREATE INDEX IF NOT EXISTS idx_semantic_mappings_project
  ON semantic_mappings(project_id);

CREATE INDEX IF NOT EXISTS idx_semantic_mappings_term
  ON semantic_mappings(business_term);

CREATE INDEX IF NOT EXISTS idx_semantic_mappings_project_term
  ON semantic_mappings(project_id, business_term);

UPDATE semantic_mappings
  SET source = 'global', business_term = (SELECT name FROM semantic_concepts WHERE id = semantic_mappings.concept_id)
  WHERE source = 'global' AND business_term IS NULL;