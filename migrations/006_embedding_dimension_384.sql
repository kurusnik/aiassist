-- RAG: Переход на локальный эмбеддер Transformers.js
-- Меняем размерность векторов с 1536 (text-embedding-3-small) на 384 (all-MiniLM-L6-v2)

-- Удаляем старые IVFFlat индексы (зависят от типа колонки)
DROP INDEX IF EXISTS idx_doc_emb_vector;
DROP INDEX IF EXISTS idx_msg_emb_vector;
DROP INDEX IF EXISTS idx_pub_emb_vector;

-- Очищаем старые данные (размерность 1536 несовместима с 384)
DELETE FROM document_embeddings;
DELETE FROM message_embeddings;
DELETE FROM public_embeddings;

-- Меняем тип колонок на vector(384)
ALTER TABLE document_embeddings ALTER COLUMN embedding TYPE vector(384);
ALTER TABLE message_embeddings ALTER COLUMN embedding TYPE vector(384);
ALTER TABLE public_embeddings ALTER COLUMN embedding TYPE vector(384);

-- Создаём новые IVFFlat индексы для размерности 384
CREATE INDEX IF NOT EXISTS idx_doc_emb_vector 
  ON document_embeddings 
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_msg_emb_vector 
  ON message_embeddings 
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_pub_emb_vector 
  ON public_embeddings 
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Обновляем комментарии
COMMENT ON COLUMN document_embeddings.embedding IS 'Векторное представление all-MiniLM-L6-v2 (384 dimensions)';

SELECT 'Embedding dimension migrated from 1536 to 384 successfully!' as status;