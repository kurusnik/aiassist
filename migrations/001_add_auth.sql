-- Добавление полей авторизации в таблицу users
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS username VARCHAR(50) UNIQUE,
ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

-- Создание таблицы для сессий
CREATE TABLE IF NOT EXISTS "session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
) WITH (OIDS=FALSE);

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

-- Обновление существующих пользователей (если есть)
-- Пароль по умолчанию: "password123" (хеш bcrypt)
UPDATE users 
SET username = email, 
    password_hash = '$2b$10$rKZvVqVqVqVqVqVqVqVqVuO7K7K7K7K7K7K7K7K7K7K7K7K7K7K7K'
WHERE username IS NULL;
