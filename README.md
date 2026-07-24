# AI Assistant — Персональная AI-платформа

Веб-приложение для работы с LLM-провайдерами, инженерными задачами (Programming Agent), семантическим поиском (RAG), метаданными 1С (Knowledge Layer) и интеграцией с MCP-инструментами.

## Возможности

### Основной функционал
- **Авторизация** — регистрация и вход по логину/паролю с одобрением администратором
- **Проекты** — создание и управление проектами с индивидуальными system prompt
- **История диалогов** — сохранение в PostgreSQL с автоматической суммаризацией
- **Streaming** — потоковая передача ответов (SSE)
- **Тёмная тема** — современный адаптивный UI

### LLM Провайдеры
- **LLM Aggregator** — универсальный провайдер для OpenAI-совместимых API (OpenRouter, MixRoute, Custom)
- **OpenAI** — прямая интеграция с OpenAI API
- **LM Studio** — локальный LLM-сервер
- **ModelManager** — администратор назначает модели ролям (chat, programming, reviewer, summarizer, vision, academy) через админ-панель

### Programming Agent
- Классификация задач (TaskAnalyzer) — код, ревью, баги, 1С-метаданные
- Планирование (ExecutionPlanner) — построение пошагового плана
- Исполнение (ExecutionPipeline) — через провайдеры: MCP (1С), Filesystem, RAG, Internal (PromptBuilder, Reviewer), OpenRouter
- Ревью кода (Reviewer) — проверка на соответствие языку, ключевым словам, оценка 0–100

### RAG (Semantic Search)
- Локальный эмбеддер — `@xenova/transformers` с моделью `Xenova/multilingual-e5-small` (384d)
- Векторный поиск через pgvector
- Индексация файлов, истории диалогов, общей базы знаний
- Маркеры источников в UI (RAG:SOURCE, RAG:ANALYSIS, MODEL:KNOWLEDGE)

### Knowledge Layer (1C)
- Импорт метаданных конфигурации 1С через MCP-протокол (RSV Data)
- Хранение в схеме `knowledge` (конфигурации, объекты, поля, связи)
- Context Builder — поиск и форматирование контекста для LLM
- Injection в системный промпт (до 3 объектов, до 4000 символов)

### MCP (Model Context Protocol)
- Два независимых MCP-контура: общий и 1С
- Транспорт: JSON-RPC 2.0 поверх HTTP
- Устойчивость к недоступности MCP-сервера

### OCR
- Распознавание текста с изображений (JPEG, PNG, WebP) через Tesseract.js
- Кэширование результатов (24 часа)
- Автоматическая отправка распознанного текста в модель

### Безопасность
- Хеширование паролей bcrypt с солью
- Сессии в PostgreSQL (httpOnly cookies, 30 дней)
- Rate limiting (5 попыток за 15 минут)
- Логирование всех изменений паролей
- Запрет повторения последних 5 паролей
- Одобрение пользователей администратором

### Админ-панель
- Управление пользователями (просмотр, редактирование, удаление, одобрение/блокировка)
- Назначение администраторов
- Управление моделями и назначение ролям
- Настройка LLM провайдера (Aggregator Type, Base URL, API Key)
- Смена паролей пользователей с логированием
- Просмотр логов изменений паролей

## Требования

- Docker и Docker Compose
- API ключ LLM Aggregator (OpenRouter, MixRoute или Custom OpenAI-совместимый API) или LM Studio

## Установка

### Через Docker Compose (единственный поддерживаемый способ)

```bash
git clone <repository-url>
cd aiassist
```

Создайте `.env`:

```env
DATABASE_URL=postgresql://ai_user:ai_password@db:5432/ai_assistant
OPENROUTER_API_KEY=your_api_key_here
SESSION_SECRET=your_random_secret_key_here
PORT=3000
NODE_ENV=production
```

Сгенерируйте `SESSION_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Сборка и запуск:

```bash
docker compose up -d --build
```

Контейнеры: **app** (Node.js), **db** (PostgreSQL 15), **nginx** (прокси + SSL), **certbot** (Let's Encrypt), **certbot-renew**.

### Создание администратора

```bash
docker compose exec app node create-admin.js
```

### Обновление

```bash
cd ~/aiassist && git pull && docker compose up -d --build
```

## Использование

1. Откройте `http://localhost` (или ваш домен)
2. Зарегистрируйтесь — дождитесь одобрения администратором
3. Создайте проект — настройте system prompt (опционально)
4. Начните диалог — прикрепляйте файлы, используйте OCR для изображений

### Назначение моделей (админ-панель)

1. Вкладка **AI → LLM Provider** — выберите провайдера, настройте Aggregator Type и API Key
2. Нажмите **Сохранить** — каталог моделей синхронизируется автоматически
3. Вкладка **Models → Assignments** — назначьте модель для каждой роли

### Импорт метаданных 1С

```bash
docker compose exec app npm run knowledge:import
```

## Структура проекта

```
aiassist/
├── index.js                    # Express сервер
├── db.js                       # PostgreSQL connection pool
├── docker-compose.yml          # Docker Compose (app + db + nginx + certbot)
├── Dockerfile                  # Образ приложения
│
├── middleware/
│   └── auth.js                 # Middleware авторизации
│
├── services/
│   ├── llm/                    # LLM сервис (ProviderFactory + провайдеры)
│   │   ├── index.js            # LLMService (chat, stream)
│   │   ├── ProviderFactory.js  # Выбор активного провайдера
│   │   ├── register.js         # Реестр провайдеров
│   │   └── providers/
│   │       ├── openrouter/     # LLM Aggregator (OpenRouter, MixRoute, Custom)
│   │       ├── lmstudio/
│   │       └── openai/
│   ├── models/                 # ModelManager (назначение моделей ролям)
│   ├── router/
│   │   └── TaskRouter.js       # Маршрутизация chat / programming
│   ├── programming/            # Programming Agent
│   │   ├── index.js            # ProgrammingService (фасад)
│   │   ├── taskAnalyzer.js     # Классификация задач
│   │   ├── executionPlanner.js # Планирование шагов
│   │   ├── executionPipeline.js# Исполнение пайплайна
│   │   ├── providerManager.js  # Регистр провайдеров
│   │   ├── promptBuilder.js    # Построение промптов
│   │   ├── reviewer.js         # Проверка кода
│   │   ├── providers/
│   │   │   ├── BaseProvider.js
│   │   │   ├── InternalProvider.js
│   │   │   ├── FilesystemProvider.js
│   │   │   ├── RagProvider.js
│   │   │   ├── McpProvider.js
│   │   │   └── OpenRouterProvider.js
│   │   └── rules/
│   ├── projectContext/         # Project Context система
│   ├── mcp/                    # MCP connection manager (общий + 1С)
│   ├── rag/                    # RAG семантический поиск
│   │   ├── index.js
│   │   ├── embedding.js
│   │   ├── chunking.js
│   │   ├── search.js
│   │   └── ingestion.js
│   ├── knowledge/              # Knowledge Layer (метаданные 1С)
│   │   ├── importer.js
│   │   ├── service.js
│   │   └── contextBuilder.js
│   ├── passwordManager.js      # Управление паролями
│   └── ocr.js                  # OCR сервис (Tesseract.js)
│
├── scripts/
│   ├── build.js, deploy.js, migrate.js, run-migrations.js
│   ├── backup.js, update.js, preload-model.mjs
│   └── knowledge-import.js
│
├── migrations/                 # SQL миграции (000–009 + knowledge)
├── public/                     # Frontend SPA
├── docs/                       # Документация
│   ├── ARCHITECTURE.md         # Архитектура компонентов
│   ├── DEVELOPMENT.md          # Процесс разработки
│   ├── deployment-guide.md     # Руководство по развёртыванию
│   ├── knowledge-layer.md      # Knowledge Layer
│   ├── RAG_IMPLEMENTATION.md   # RAG спецификация
│   ├── RAG_GETTING_STARTED.md  # RAG быстрый старт
│   ├── ocr-feature.md          # OCR документация
│   ├── password-management.md  # Управление паролями
│   └── architecture/decisions/ # ADR
├── plans/                      # Планы (см. раздел ниже)
└── uploads/                    # Загруженные файлы (volume)
```

## API Endpoints

### Авторизация
| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/register` | POST | Регистрация |
| `/login` | POST | Вход |
| `/logout` | POST | Выход |
| `/auth/check` | GET | Проверка авторизации |
| `/api/change-password` | PUT | Изменение пароля |

### Проекты
| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/projects` | GET/POST | Список / создать |
| `/projects/:id` | GET/PUT/DELETE | Получить / обновить / удалить |
| `/projects/:id/messages` | GET/DELETE | История / сброс |
| `/projects/:id/attachments` | GET/POST | Вложения |

### Ассистент
| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/assistant` | POST | Отправить сообщение (SSE) |
| `/models` | GET | Список моделей |
| `/api/ocr` | POST | Распознавание текста с изображения |

### RAG
| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/api/rag/index` | POST | Индексировать текст |
| `/api/rag/index-file` | POST | Индексировать файл |
| `/api/rag/search` | GET | Поиск по базе знаний |
| `/api/rag/document/:id` | DELETE | Удалить документ |
| `/api/rag/stats` | GET | Статистика |

### Админ-панель
| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/api/admin/users` | GET | Все пользователи |
| `/api/admin/users/:id` | PUT/DELETE | Редактировать / удалить |
| `/api/admin/users/:id/approve` | PUT | Одобрить пользователя |
| `/api/admin/users/:id/change-password` | PUT | Сменить пароль |
| `/api/admin/users/password-logs` | GET | Логи изменений паролей |
| `/api/admin/models` | GET/POST | Управление моделями |
| `/api/settings/llm` | GET/POST | Настройки LLM провайдера |
| `/api/settings/llm/test` | POST | Проверка соединения |

## База данных

### Миграции (`migrations/`)

1. `000_initial_schema.sql` — основные таблицы (users, projects, messages, session)
2. `001_add_auth.sql` — поля авторизации
3. `002_add_attachments.sql` — таблица вложений
4. `003_add_admin_fields.sql` — поля администратора
5. `004_password_change_logs.sql` — логирование паролей
6. `005_add_rag_embeddings.sql` — векторные представления (pgvector)
7. `006_embedding_dimension_384.sql` — переход на 384d
8. `007_model_management.sql` — управление моделями
9. `008_llm_settings.sql` — настройки LLM провайдеров
10. `009_knowledge_schema.sql` — схема knowledge (метаданные 1С)

## Скрипты

| Команда | Описание |
|---------|----------|
| `npm start` | Запуск сервера |
| `npm run dev` | Разработка с nodemon |
| `npm run migrate` | Применение миграций |
| `npm run knowledge:import` | Импорт метаданных 1С |
| `npm run backup` | Резервное копирование БД |
| `npm run update` | Обновление проекта |
| `npm run lint` | Проверка кода ESLint |

## Планы и улучшения — оценка актуальности

### 🔴 Неактуально / Выполнено

| План | Статус | Комментарий |
|------|--------|-------------|
| Админ-панель (plans/admin-panel-plan.md) | ✅ Выполнено | Полноценная админ-панель реализована |
| OCR (plans/ocr-feature-plan.md, docs/ocr-feature.md) | ✅ Выполнено | Tesseract.js интегрирован, работает |
| RAG система (docs/RAG_*) | ✅ Выполнено | RAG с локальным эмбеддером реализован |
| Knowledge Layer (docs/ROADMAP.md) | ✅ Выполнено | Импорт метаданных 1С, Context Builder, Injection |
| Баланс OpenRouter (plans/openrouter-credits-display.md) | ❌ Отменён | OpenRouter — не единственный провайдер; концепция устарела |
| Развёртывание (plans/deployment-strategy.md, CHANGELOG.md plans v1.1.0, v1.2.0) | ❌ Устарел | Деплой через Docker Compose + nginx + certbot уже работает; Kubernetes, Prometheus, multi-region — избыточны |
| 2FA (docs/password-management.md) | ❌ Отменён | Поле `two_factor_enabled` — заглушка, не востребовано |

### 🟡 Частично выполнено

| План | Статус | Комментарий |
|------|--------|-------------|
| Голосовой ввод (docs/voice_input_plan.md) | 🔧 Реализован интерфейс, нет тестирования и документации | Web Speech API кнопка есть, но нет тестов (Chrome/Edge/Safari), нет README, нет документации API |
| Система меток RAG (RAG_SOURCE_MARKERS.md, README_RAG_MARKERS.md) | 🔧 Реализована, частично сломана | SSE-коррупция исправлена, но требуется проверка интеграции |
| Управление паролями (docs/password-management.md, IMPLEMENTATION_REPORT.md, PASSWORD_CHANGE_FIXES.md) | 🔧 Реализовано, валидация упрощена | Сложная валидация отключена по запросу, остальное работает |

### 🟢 Актуальные улучшения

| Улучшение | Приоритет | Обоснование |
|-----------|-----------|-------------|
| Экспорт диалогов (JSON, PDF, Markdown) | Средний | Востребовано пользователями, нет blocker'ов |
| Markdown рендеринг в чате | Средний | Улучшение UX, текущий plain-text неудобен |
| Гибридный поиск (вектор + полнотекстовый) | Низкий | RAG работает, но tsvector повысит качество на точных совпадениях |
| Статистика токенов | Средний | Полезно для контроля расходов |
| Автоматическая индексация RAG через триггеры | Низкий | Удобство, но не критично |
| Knowledge Layer: Semantic Search (замена ILIKE) | Низкий | ILIKE работает, семантика даст прирост на синонимах |
| Knowledge Layer: Incremental Import | Низкий | Full Refresh 279s на 3580 объектов — приемлемо |
| Knowledge Layer: Relations API | Низкий | Таблица создана, не заполняется — MVP достаточен |
| Knowledge Layer: Knowledge Ranking | Низкий | Срез первых 3 без сортировки — адекватно для MVP |
| Knowledge Layer: Programming Engine интеграция | Средний | Контекст метаданных полезен и в Programming Agent |
| Тестирование голосового ввода | Низкий | Функция есть, но не документирована |
| Кэширование эмбеддингов (Redis) | Низкий | Локальный эмбеддер уже достаточно быстр |
| Аналитика RAG (дашборд) | Низкий | Никто не запрашивал |

### 🔴 Удалено из планов (неактуально / избыточно)

- Kubernetes, Prometheus/Grafana, multi-region — избыточно для single-server проекта
- 2FA, LDAP, уведомления по email — не востребовано
- CDN для статики, Advanced security features — нет необходимости
- Мобильное приложение (React Native) — вне scope
- Telegram-бот интеграция — не требуется
- Уведомления (WebSocket/Push) — нет сценария использования

## История изменений

**Последняя версия: 1.1.0 (2026-07-24)**
- LLM Aggregator — универсальный провайдер (OpenRouter, MixRoute, Custom)
- Автоматическая синхронизация каталога моделей при смене провайдера
- Исправление 401 при смене провайдера

**1.0.0 (2026-02-24)**
- Скрипты сборки, деплоя, миграций, backup
- Docker Compose (app + db + nginx + certbot)
- CI/CD через GitHub Actions

## Лицензия

ISC