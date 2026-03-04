-- Добавление полей is_admin и is_approved в таблицу users

-- Добавить поле is_admin (по умолчанию false)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- Добавить поле is_approved (по умолчанию false)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT false;

-- Обновить существующего admin пользователя
UPDATE users 
SET is_admin = true, is_approved = true 
WHERE username = 'admin';

-- Создать пользователя admin, если его нет (пароль: password123)
INSERT INTO users (username, password_hash, email, name, is_admin, is_approved)
SELECT 'admin', '$2b$10$rKZvVqVqVqVqVqVqVqVqVuO7K7K7K7K7K7K7K7K7K7K7K7K7K7K7K', 'admin@example.com', 'Administrator', true, true
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'admin');

-- Вывод информации
SELECT 'Миграция 003 выполнена успешно!' as status;
