-- Migration 022: semantic_corrections table
-- Stores user corrections to AI-suggested semantic mappings.
-- When a user says "No, X should map to Y instead of Z", this table records it.

CREATE TABLE IF NOT EXISTS semantic_corrections (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  wrong_mapping TEXT NOT NULL,
  correct_mapping TEXT NOT NULL,
  wrong_metadata_object TEXT,
  wrong_metadata_field TEXT,
  correct_metadata_object TEXT NOT NULL,
  correct_metadata_field TEXT,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_semantic_corrections_project ON semantic_corrections(project_id);
CREATE INDEX IF NOT EXISTS idx_semantic_corrections_wrong ON semantic_corrections(wrong_metadata_object);
CREATE INDEX IF NOT EXISTS idx_semantic_corrections_correct ON semantic_corrections(correct_metadata_object);
CREATE INDEX IF NOT EXISTS idx_semantic_corrections_question ON semantic_corrections USING gin(to_tsvector('russian', question));
