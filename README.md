# AI Assistant - Персональный AI-помощник

Веб-приложение для работы с различными LLM-моделями через OpenRouter API с сохранением истории диалогов, авторизацией пользователей и админ-панелью.

## 🚀 Возможности

### Основной функционал
- ✅ **Авторизация** — регистрация и вход по логину/паролю с проверкой администратором
- ✅ **Множественные проекты** — создание и управление проектами с индивидуальными настройками
- ✅ **История диалогов** — сохранение в PostgreSQL с автоматической суммаризацией
- ✅ **Выбор моделей** — GPT-5.2, Claude Opus 4.5, Claude Sonnet 4.5 и другие через OpenRouter
- ✅ **Автоматическая суммаризация** — при >20 сообщений история сжимается с сохранением контекста
- ✅ **Кастомный system prompt** — настройка поведения ассистента для каждого проекта
- ✅ **Современный UI** — тёмная тема, адаптивный дизайн

### Безопасность
- ✅ **Хеширование паролей** — bcrypt с солью
- ✅ **Сессии в PostgreSQL** — надёжное хранение сессий
- ✅ **Middleware авторизации** — защита всех API endpoints
- ✅ **Rate limiting** — ограничение попыток изменения пароля
- ✅ **Логирование изменений пароля** — аудит всех операций
- ✅ **Требования к паролям** — минимальная длина, сложность
- ✅ **Одобрение пользователей** — администратор подтверждает новые аккаунты

### Админ-панель
- ✅ **Управление пользователями** — просмотр, редактирование, удаление
- ✅ **Одобрение/блокировка** — контроль доступа
- ✅ **Смена паролей пользователей** — с логированием
- ✅ **Управление моделями** — добавление/удаление доступных моделей
- ✅ **Просмотр логов** — история изменений паролей

### Работа с файлами
- ✅ **Загрузка вложений** — до 10 файлов на сообщение (макс. 10MB каждый)
- ✅ **Текстовые файлы** — автоматическое чтение содержимого (txt, md, json, js, ts, sql, csv, и др.)
- ✅ **OCR** — распознавание текста с изображений (JPEG, PNG, WebP) через Tesseract.js
- ✅ **Кэширование OCR** — 24 часа для ускорения повторных запросов

### API
- ✅ **SSE Streaming** — потоковая передача ответов (Server-Sent Events)
- ✅ **OpenRouter Credits** — отображение баланса и расходов
- ✅ **Health check** — `/health` endpoint для мониторинга

## 📋 Требования

- Docker и Docker Compose
- OpenRouter API ключ

## 🛠️ Установка

### Установка через Docker Compose (единственный поддерживаемый способ)

#### 1. Клонирование репозитория

```bash
git clone <repository-url>
cd aiassist
```

#### 2. Настройка переменных окружения

Создайте файл `.env`:

```env
# База данных (для Docker)
DATABASE_URL=postgresql://ai_user:ai_password@db:5432/ai_assistant

# OpenRouter
OPENROUTER_API_KEY=your_openrouter_api_key_here

# Сессии
SESSION_SECRET=your_random_secret_key_here
PORT=3000

# Окружение
NODE_ENV=production
```

Сгенерируйте SESSION_SECRET:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### 3. Сборка и запуск

```bash
docker compose up -d --build
```

#### 4. Проверка статуса

```bash
docker compose ps
docker compose logs -f app
```

Контейнеры:
- **app** — Node.js приложение (порт 3000 внутри сети)
- **db** — PostgreSQL 15 (порт 5432 внутри сети, данные в volume)
- **nginx** — обратный прокси (порты 80, 443)
- **certbot** — SSL сертификаты Let's Encrypt
- **certbot-renew** — автоматическое обновление сертификатов

#### 5. Остановка

```bash
docker compose down
```

#### 6. Обновление

```bash
docker compose pull
docker compose up -d --build
```

Или одной командой:
```bash
docker compose restart
```

## 📖 Использование

### Первый запуск

1. Откройте `http://localhost` (или ваш домен)
2. Перейдите на страницу регистрации
3. Создайте учётную запись
4. **Дождитесь одобрения администратором** (или создайте админа через скрипт)

### Создание администратора

```bash
docker compose exec app node create-admin.js
```

Или напрямую в БД:

```bash
docker compose exec db psql -U ai_user -d ai_assistant -c "UPDATE users SET is_admin = true, is_approved = true WHERE username = 'your_username';"
```

### Работа с проектами

1. **Создание проекта** — нажмите "Новый проект"
2. **Выбор модели** — выберите LLM-модель для проекта
3. **Настройка промпта** — отредактируйте system prompt (опционально)
4. **Диалог** — начните общение с ассистентом
5. **Вложения** — прикрепите файлы для анализа
6. **Управление** — удаление проекта или сброс диалога

### Доступные модели

| Модель | Описание |
|--------|----------|
| `arcee-ai/trinity-large-preview:free:online` | Бесплатная модель |
| `openai/gpt-5.2:online` | Универсальная модель |
| `openai/gpt-5.2-pro` | Максимальное качество |
| `anthropic/claude-opus-4.5` | SEO и сложные тексты |
| `anthropic/claude-sonnet-4.5` | Универсальная модель |

## 📁 Структура проекта

```
aiassist/
├── index.js                 # Основной сервер (Express)
├── db.js                    # Подключение к PostgreSQL
├── openrouter.js            # Клиент OpenRouter API
├── package.json             # Зависимости и скрипты
├── docker-compose.yml       # Docker конфигурация
├── Dockerfile               # Образ приложения
├── .env                     # Переменные окружения
│
├── middleware/
│   └── auth.js              # Middleware авторизации
│
├── services/
│   ├── passwordManager.js   # Управление паролями
│   └── ocr.js               # OCR сервис (Tesseract)
│
├── migrations/
│   ├── 000_initial_schema.sql
│   ├── 001_add_auth.sql
│   ├── 002_add_attachments.sql
│   ├── 003_add_admin_fields.sql
│   ├── 004_password_change_logs.sql
│   └── README.md
│
├── public/
│   ├── index.html           # Главная страница (чат)
│   ├── login.html           # Страница входа/регистрации
│   ├── admin.html           # Админ-панель
│   ├── app.js               # Логика приложения
│   ├── state.js             # Управление состоянием
│   └── stateActions.js      # Действия со состоянием
│
├── scripts/
│   ├── build.js             # Скрипт сборки
│   ├── deploy.js            # Скрипт деплоя
│   ├── migrate.js           # Миграции БД
│   ├── backup.js            # Резервное копирование
│   └── update.js            # Обновление проекта
│
├── uploads/                 # Загруженные файлы (volume)
└── logs/                    # Логи приложения (volume)
```

## 🔧 API Endpoints

### Авторизация
| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/register` | POST | Регистрация нового пользователя |
| `/login` | POST | Вход в систему |
| `/logout` | POST | Выход из системы |
| `/auth/check` | GET | Проверка авторизации |
| `/api/change-password` | PUT | Изменение своего пароля |

### Проекты (требуют авторизации)
| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/projects` | GET | Список проектов пользователя |
| `/projects` | POST | Создать проект |
| `/projects/:id` | GET | Получить проект |
| `/projects/:id` | DELETE | Удалить проект |
| `/projects/:id/messages` | GET | История сообщений |
| `/projects/:id/messages` | DELETE | Сбросить диалог |
| `/projects/:id/attachments` | POST | Загрузить вложение |
| `/projects/:id/attachments` | GET | Список вложений |

### Ассистент
| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/assistant` | POST | Отправить сообщение (поддерживает SSE) |
| `/models` | GET | Список доступных моделей |
| `/api/credits` | GET | Баланс OpenRouter |
| `/api/ocr` | POST | Распознавание текста с изображения |

### Админ-панель (требуют прав администратора)
| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/api/admin/users` | GET | Все пользователи |
| `/api/admin/users/:id` | PUT/DELETE | Редактировать/удалить |
| `/api/admin/users/:id/approve` | PUT | Одобрить пользователя |
| `/api/admin/users/:id/change-password` | PUT | Сменить пароль пользователя |
| `/api/admin/users/password-logs` | GET | Логи изменения паролей |
| `/api/admin/models` | GET/POST | Управление моделями |

## 🔒 Безопасность

### Пароли
- Минимальная длина: 8 символов
- Требуются: заглавные, строчные буквы, цифры, спецсимволы
- Rate limiting: 5 попыток за 15 минут
- Запрет повторения последних 5 паролей
- Логирование всех изменений

### Сессии
- httpOnly cookies
- 30 дней время жизни
- Хранение в PostgreSQL
- CSRF защита

### Доступ
- Обязательное одобрение новых пользователей
- Разделение ролей (user/admin)
- Middleware защита endpoints

## 🐛 Отладка

### Просмотр логов
```bash
docker compose logs -f app
docker compose logs -f db
docker compose logs -f nginx
```

### Подключение к БД
```bash
docker compose exec db psql -U ai_user -d ai_assistant
```

### Проверка БД
```bash
docker compose exec db psql -U ai_user -d ai_assistant -c "SELECT * FROM users;"
```

### Health check
```bash
curl http://localhost/health
```

### Пересборка контейнера
```bash
docker compose up -d --build
```

## 📝 Скрипты npm

| Команда | Описание |
|---------|----------|
| `npm start` | Запуск сервера |
| `npm run dev` | Разработка с nodemon |
| `npm run build` | Сборка проекта |
| `npm run deploy` | Деплой на сервер |
| `npm run migrate` | Применение миграций |
| `npm run backup` | Резервное копирование БД |
| `npm run update` | Обновление проекта |
| `npm run lint` | Проверка кода ESLint |
| `npm run docker:build` | Docker сборка |
| `npm run docker:run` | Запуск Docker |
| `npm run docker:stop` | Остановка Docker |

## 🔄 Деплой на сервер

### Схема развёртывания
```
Рабочий компьютер
     │ git push
     ↓
GitHub
     │ git pull
     ↓
Сервер
     │ docker compose up -d --build
     ↓
Приложение доступно
```

### Команда обновления на сервере
```bash
cd ~/aiassist && git pull && docker compose up -d --build
```

### Через SSH
```bash
ssh user@192.168.0.84
cd ~/aiassist
git pull
docker compose up -d --build
```

## 📊 База данных

### Основные таблицы

**users** — пользователи
- id, username, email, name, password_hash
- is_admin, is_approved
- created_at

**projects** — проекты
- id, name, user_id, summary
- model, system_prompt
- created_at

**messages** — сообщения
- id, project_id, role, content
- created_at

**attachments** — вложения
- id, project_id, user_id
- filename, original_name, mime, size, path
- created_at

**session** — сессии Express
- sid, sess (JSON), expire

**password_change_logs** — логи паролей
- id, user_id, changed_by_user_id
- timestamp, ip_address, user_agent
- success, error_message

### Миграции

Миграции находятся в папке `migrations/` и применяются автоматически при первом запуске контейнера:

1. `000_initial_schema.sql` — основные таблицы (users, projects, messages, session)
2. `001_add_auth.sql` — поля авторизации
3. `002_add_attachments.sql` — таблица вложений
4. `003_add_admin_fields.sql` — поля администратора (is_admin, is_approved)
5. `004_password_change_logs.sql` — логирование изменений паролей

## 🚧 TODO

- [ ] Поиск по истории диалогов (семантический + RAG)
- [ ] Экспорт диалогов (JSON, PDF, Markdown)
- [ ] Markdown рендеринг в чате
- [ ] Темы оформления (светлая/тёмная)
- [ ] Уведомления (WebSocket/Push)
- [ ] Мобильное приложение (React Native)
- [ ] Telegram-бот интеграция
- [ ] Векторный поиск по истории (pgvector)
- [ ] Статистика использования токенов
- [ ] 2FA аутентификация

## 📄 Лицензия

ISC

## 👥 Авторы

Разработка ведётся в рамках проекта AI Assistant.

## 🆘 Поддержка

При возникновении проблем:

1. **Проверьте логи:**
   ```bash
   docker compose logs -f
   ```

2. **Убедитесь, что БД доступна:**
   ```bash
   docker compose exec db pg_isready
   ```

3. **Проверьте переменные окружения в `.env`**

4. **Убедитесь, что OpenRouter API ключ валиден:**
   ```bash
   docker compose exec app curl -H "Authorization: Bearer $OPENROUTER_API_KEY" https://openrouter.ai/api/v1/credits
   ```

5. **Пересоберите контейнер:**
   ```bash
   docker compose up -d --build
   ```
