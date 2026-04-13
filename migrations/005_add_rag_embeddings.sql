-- RAG: Добавление поддержки векторных представлений (pgvector)

-- Включаем расширение pgvector (должно быть установлено в PostgreSQL)
CREATE EXTENSION IF NOT EXISTS vector;

-- Таблица для векторных представлений документов
-- Общая база для всех пользователей с изоляцией на уровне прав доступа
CREATE TABLE IF NOT EXISTS document_embeddings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,      -- Владелец документа
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE, -- Привязка к проекту (опционально)
  document_id INTEGER,                                          -- ID документа (если есть)
  chunk_index INTEGER DEFAULT 0,                                -- Номер чанка в документе
  embedding vector(1536),                                       -- Вектор OpenAI text-embedding-3-small
  content TEXT NOT NULL,                                        -- Текст чанка
  metadata JSONB DEFAULT '{}',                                  -- Метаданные (filename, category, tags)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица для векторных представлений сообщений истории диалогов
CREATE TABLE IF NOT EXISTS message_embeddings (
  id SERIAL PRIMARY KEY,
  message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE, -- Ссылка на сообщение
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE, -- Проект для изоляции
  embedding vector(1536),                                       -- Вектор представления
  content TEXT NOT NULL,                                        -- Текст сообщения
  role VARCHAR(50) NOT NULL,                                    -- user/assistant
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица для общей базы знаний (публичные документы)
CREATE TABLE IF NOT EXISTS public_embeddings (
  id SERIAL PRIMARY KEY,
  category VARCHAR(50) NOT NULL DEFAULT 'general',              -- Категория: faq, documentation, guides
  title VARCHAR(255),                                           -- Заголовок документа
  embedding vector(1536),                                       -- Вектор представления
  content TEXT NOT NULL,                                        -- Текст чанка
  metadata JSONB DEFAULT '{}',                                  -- Дополнительные метаданные
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Индексы для ускорения векторного поиска

-- Индекс для document_embeddings (IVFFlat для быстрого поиска)
CREATE INDEX IF NOT EXISTS idx_doc_emb_vector 
  ON document_embeddings 
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Индексы для фильтрации
CREATE INDEX IF NOT EXISTS idx_doc_emb_user ON document_embeddings(user_id);
CREATE INDEX IF NOT EXISTS idx_doc_emb_project ON document_embeddings(project_id);
CREATE INDEX IF NOT EXISTS idx_doc_emb_document ON document_embeddings(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_emb_created ON document_embeddings(created_at DESC);

-- Индекс для message_embeddings
CREATE INDEX IF NOT EXISTS idx_msg_emb_vector 
  ON message_embeddings 
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_msg_emb_project ON message_embeddings(project_id);
CREATE INDEX IF NOT EXISTS idx_msg_emb_message ON message_embeddings(message_id);

-- Индекс для public_embeddings
CREATE INDEX IF NOT EXISTS idx_pub_emb_vector 
  ON public_embeddings 
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_pub_emb_category ON public_embeddings(category);

-- Индексы для метаданных (JSONB)
CREATE INDEX IF NOT EXISTS idx_doc_emb_metadata ON document_embeddings USING gin(metadata);
CREATE INDEX IF NOT EXISTS idx_pub_emb_metadata ON public_embeddings USING gin(metadata);

-- Триггер для обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_document_embeddings_updated_at
  BEFORE UPDATE ON document_embeddings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_public_embeddings_updated_at
  BEFORE UPDATE ON public_embeddings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Комментарии к таблицам
COMMENT ON TABLE document_embeddings IS 'Векторные представления документов пользователей для RAG поиска';
COMMENT ON TABLE message_embeddings IS 'Векторные представления сообщений истории диалогов';
COMMENT ON TABLE public_embeddings IS 'Общая база знаний (публичные документы, FAQ, документация)';

COMMENT ON COLUMN document_embeddings.embedding IS 'Векторное представление OpenAI text-embedding-3-small (1536 dimensions)';
COMMENT ON COLUMN document_embeddings.metadata IS 'JSONB метаданные: fileName, category, tags, fileSize, mimeType';

-- Представление для статистики использования RAG
CREATE OR REPLACE VIEW rag_stats AS
SELECT 
  'document_embeddings' as table_name,
  COUNT(*) as total_records,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(DISTINCT project_id) as unique_projects,
  pg_relation_size('document_embeddings') as table_size_bytes
FROM document_embeddings
UNION ALL
SELECT 
  'message_embeddings',
  COUNT(*),
  COUNT(DISTINCT project_id),
  COUNT(DISTINCT project_id),
  pg_relation_size('message_embeddings')
FROM message_embeddings
UNION ALL
SELECT 
  'public_embeddings',
  COUNT(*),
  COUNT(DISTINCT category),
  0,
  pg_relation_size('public_embeddings')
FROM public_embeddings;

-- Вывод информации о завершении
SELECT 'RAG embeddings tables created successfully!' as status;
SELECT 'Tables: document_embeddings, message_embeddings, public_embeddings' as info;
