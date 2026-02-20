-- Миграция: таблица вложений (attachments)
CREATE TABLE IF NOT EXISTS attachments (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  filename VARCHAR(512) NOT NULL,
  original_name VARCHAR(512),
  mime VARCHAR(255),
  size INTEGER,
  path TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS IDX_attachments_project_id ON attachments(project_id);

-- Конец миграции
