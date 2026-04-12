-- Добавление таблицы для логов изменения паролей и системы лимитов
-- Миграция 004: Password change security and logging

-- Таблица для хранения логов изменения паролей
CREATE TABLE IF NOT EXISTS password_change_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    changed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    success BOOLEAN DEFAULT false,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица для отслеживания попыток изменения пароля (rate limiting)
CREATE TABLE IF NOT EXISTS password_change_attempts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    ip_address VARCHAR(45),
    attempt_count INTEGER DEFAULT 1,
    last_attempt_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, ip_address)
);

-- Индексы для оптимизации
CREATE INDEX IF NOT EXISTS idx_password_change_logs_user_id ON password_change_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_password_change_logs_created_at ON password_change_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_password_change_attempts_user_ip ON password_change_attempts(user_id, ip_address);
CREATE INDEX IF NOT EXISTS idx_password_change_attempts_last_attempt ON password_change_attempts(last_attempt_at);

-- Добавление поля для двухфакторной аутентификации (опционально)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT false;

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS two_factor_secret VARCHAR(255);

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Функция для очистки старых логов (автоматическая очистка через 90 дней)
CREATE OR REPLACE FUNCTION cleanup_old_password_logs()
RETURNS void AS $$
BEGIN
    DELETE FROM password_change_logs 
    WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- Вывод информации
SELECT 'Миграция 004 выполнена успешно! Таблицы для логирования изменения паролей созданы.' as status;