-- Sprint 2 — Hybrid Retrieval: Full Text Search indices
-- Добавляет tsvector колонки и GIN индексы для document_embeddings, message_embeddings, public_embeddings

-- Автоматически обновляемый tsvector для document_embeddings
ALTER TABLE document_embeddings ADD COLUMN IF NOT EXISTS fts_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('russian', coalesce(content, ''))
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_doc_emb_fts ON document_embeddings USING gin(fts_vector);

-- message_embeddings
ALTER TABLE message_embeddings ADD COLUMN IF NOT EXISTS fts_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('russian', coalesce(content, ''))
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_msg_emb_fts ON message_embeddings USING gin(fts_vector);

-- public_embeddings
ALTER TABLE public_embeddings ADD COLUMN IF NOT EXISTS fts_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('russian', coalesce(content, ''))
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_pub_emb_fts ON public_embeddings USING gin(fts_vector);

-- Также добавим tsvector на metadata (fileName, category, tags)
-- через вспомогательный индекс на JSONB (используется для фильтрации, GIN уже есть)