# Миграции базы данных

## Первоначальная настройка (если БД пустая)

### Шаг 1: Создание всех таблиц

Выполните SQL-скрипт для создания полной схемы:

```bash
psql -U testuser -d testdb -f migrations/000_initial_schema.sql
```

Или через pgAdmin/DBeaver/любой SQL-клиент:
1. Откройте файл `000_initial_schema.sql`
2. Выполните SQL-запросы

### Что создается:

1. **Таблица users:**
   - `id` - первичный ключ
   - `name` - имя пользователя
   - `email` - email (уникальный)
   - `username` - логин (уникальный)
   - `password_hash` - хеш пароля (bcrypt)
   - `created_at` - дата создания

2. **Таблица projects:**
   - `id` - первичный ключ
   - `name` - название проекта
   - `user_id` - связь с пользователем
   - `summary` - сводка диалога
   - `model` - выбранная модель
   - `system_prompt` - кастомный промпт
   - `created_at` - дата создания

3. **Таблица messages:**
   - `id` - первичный ключ
   - `project_id` - связь с проектом
   - `role` - роль (user/assistant)
   - `content` - текст сообщения
   - `created_at` - дата создания

4. **Таблица session:**
   - Хранение сессий пользователей
   - Автоматическое управление через express-session

## Создание первого пользователя

После применения миграции создайте пользователя через регистрацию на странице `/login.html`

Или вручную через SQL (пароль будет "password123"):

```sql
INSERT INTO users (username, password_hash, email, name)
VALUES (
  'admin',
  '$2b$10$rKZvVqVqVqVqVqVqVqVqVuO7K7K7K7K7K7K7K7K7K7K7K7K7K7K7K',
  'admin@example.com',
  'Administrator'
);
```

## Переменные окружения

Добавьте в `.env`:

```
SESSION_SECRET=your-random-secret-key-here
```

Сгенерируйте случайный ключ:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
