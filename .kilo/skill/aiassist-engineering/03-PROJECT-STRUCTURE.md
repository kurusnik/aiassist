# AiAssist Engineering Skill — Project Structure

```
aiassist/
├── index.js                         # Express сервер (все эндпоинты, SSE, Prompt Assembly)
├── db.js                            # PostgreSQL connection pool (pg.Pool)
├── docker-compose.yml               # Docker Compose (app + db + nginx + certbot)
├── Dockerfile                       # Образ приложения
├── .env.example                     # Шаблон переменных окружения
├── package.json                     # Зависимости и скрипты
│
├── middleware/
│   └── auth.js                      # requireAuth, requireAdmin middleware
│
├── services/
│   ├── llm/                         # LLM сервис
│   │   ├── index.js                 #   LLMService facade (chat, stream)
│   │   ├── ProviderFactory.js       #   Выбор активного провайдера из БД
│   │   ├── register.js              #   Реестр провайдеров
│   │   └── providers/
│   │       ├── openrouter/          #   LLM Aggregator (OpenRouter, MixRoute, Custom)
│   │       ├── lmstudio/            #   LM Studio (local)
│   │       └── openai/              #   OpenAI API
│   │
│   ├── retrieval/                   # Hybrid Retrieval (Sprint 2)
│   │   ├── index.js                 #   HybridRetrievalService (facade)
│   │   ├── config.js                #   Конфигурация весов и лимитов
│   │   ├── ftsSearch.js             #   PostgreSQL Full Text Search
│   │   ├── merge.js                 #   Объединение + дедупликация
│   │   ├── normalize.js             #   Нормализация score
│   │   └── rank.js                  #   Ранжирование с объяснением
│   │
│   ├── context-intelligence/        # Context Intelligence (Sprint 3)
│   │   ├── index.js                 #   ContextIntelligenceService (facade)
│   │   ├── config.js                #   Конфигурация (threshold, веса, budget)
│   │   ├── qualityGate.js           #   Фильтр по combinedScore
│   │   ├── dedup.js                 #   Дедупликация по ID и содержимому
│   │   ├── sourceCoordination.js    #   Координация RAG + Knowledge 1C
│   │   ├── tokenBudgeting.js        #   Бюджетирование контекста
│   │   ├── relevancePrioritization.js#   Многофакторный приоритет
│   │   └── structuredContext.js     #   Структурированный вывод контекста
│   │
│   ├── models/
│   │   └── ModelManager.js          # Управление моделями (sync, getModel, assign)
│   │
│   ├── router/
│   │   └── TaskRouter.js            # Маршрутизация chat vs programming
│   │
│   ├── programming/                 # Programming Agent
│   │   ├── index.js                 #   ProgrammingService (facade)
│   │   ├── taskAnalyzer.js          #   Классификация задач (keywords + scoring)
│   │   ├── executionPlanner.js      #   Построение плана шагов
│   │   ├── executionPipeline.js     #   Оркестратор выполнения
│   │   ├── contextCollector.js      #   Сбор данных из projectContext
│   │   ├── providerManager.js       #   Регистр провайдеров
│   │   ├── promptBuilder.js         #   Секционная сборка промпта
│   │   ├── reviewer.js              #   Проверка кода (эвристики, без LLM)
│   │   ├── providers/
│   │   │   ├── BaseProvider.js      #   Базовый класс
│   │   │   ├── InternalProvider.js  #   PromptBuilder + Reviewer
│   │   │   ├── FilesystemProvider.js#   Файлы проекта
│   │   │   ├── RagProvider.js       #   RAG контекст
│   │   │   ├── McpProvider.js       #   MCP метаданные (1С)
│   │   │   └── OpenRouterProvider.js#   LLM вызов
│   │   └── rules/                   #   Правила классификации
│   │
│   ├── projectContext/
│   │   └── ProjectContextService.js # Единый фасад контекста проекта
│   │
│   ├── mcp/                         # MCP connection manager
│   │   ├── index.js                 #   ConnectionManager
│   │   ├── config.js                #   Конфигурация
│   │   ├── McpClientFactory.js      #   Фабрика транспортов
│   │   ├── McpConnectionManager.js  #   Управление жизненным циклом
│   │   ├── onecConfig.js            #   Конфигурация 1С MCP
│   │   ├── onecConnectionManager.js #   1С ConnectionManager (singleton)
│   │   ├── transports/
│   │   │   └── httpTransport.js     #   HttpMcpClient
│   │   └── tools/
│   │       └── McpToolClient.js     #   Единый клиент вызова инструментов
│   │
│   ├── rag/                         # RAG семантический поиск
│   │   ├── index.js                 #   Основной сервис
│   │   ├── embedding.js             #   Генерация эмбеддингов (transformers)
│   │   ├── chunking.js              #   Разбиение на чанки
│   │   ├── search.js                #   Векторный поиск
│   │   └── ingestion.js             #   Индексирование документов
│   │
│   ├── diagnostics/                 # Системная трассировка (Pipeline Diagnostics)
│   │   ├── index.js                 #   DiagnosticsService (facade, singleton)
│   │   ├── traceStore.js            #   In-memory circular buffer (500 traces)
│   │   ├── tracer.js                #   PipelineTracer (capture timing + data)
│   │   └── models/
│   │       ├── TraceContext.js       #   Легковесный контейнер Trace ID
│   │       ├── PipelineStep.js      #   Унифицированная модель этапа pipeline
│   │       └── PipelineTrace.js     #   Контейнер трейса со шагами
│   │
│   ├── knowledge/                   # Knowledge Layer (1C)
│   │   ├── importer.js              #   Импорт метаданных из 1C через MCP
│   │   ├── service.js               #   Read-only query API
│   │   └── contextBuilder.js        #   Поиск + форматирование для LLM
│   │
│   ├── passwordManager.js           # Управление паролями (валидация, bcrypt, лимиты)
│   └── ocr.js                       # OCR сервис (Tesseract.js)
│
├── scripts/
│   ├── build.js                     # Сборка проекта
│   ├── deploy.js                    # Развёртывание
│   ├── migrate.js                   # Миграции БД
│   ├── run-migrations.js            # Выполнение миграций
│   ├── backup.js                    # Резервное копирование
│   ├── update.js                    # Обновление проекта
│   ├── preload-model.mjs            # Предзагрузка модели эмбеддингов
│   ├── knowledge-import.js          # Импорт метаданных 1С
│   └── test-password-change.js      # Тест смены пароля
│
├── migrations/
│   ├── 000_initial_schema.sql       # users, projects, messages, session
│   ├── 001_add_auth.sql             # Поля авторизации
│   ├── 002_add_attachments.sql      # Таблица вложений
│   ├── 003_add_admin_fields.sql     # Поля администратора
│   ├── 004_password_change_logs.sql # Логирование паролей
│   ├── 005_add_rag_embeddings.sql   # pgvector, document_embeddings
│   ├── 006_embedding_dimension_384.sql
│   ├── 007_model_management.sql     # models, model_assignments
│   ├── 008_llm_settings.sql         # Настройки LLM провайдеров
│   ├── 009_knowledge_schema.sql     # knowledge.* (1C metadata)
│   ├── 010_diagnostics_traces.sql   # diagnostics_traces (Pipeline Trace)
│   └── 011_hybrid_retrieval_fts.sql # FTS indices (tsvector + GIN)
│
├── public/                          # Frontend SPA (Vanilla JS)
│   ├── index.html                   # Основной интерфейс
│   ├── login.html                   # Страница входа
│   ├── admin.html                   # Админ-панель
│   ├── app.js                       # Клиентский JS
│   └── styles.css                   # Стили + тёмная тема
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DEVELOPMENT.md
│   ├── deployment-guide.md
│   ├── knowledge-layer.md
│   ├── RAG_IMPLEMENTATION.md
│   ├── RAG_GETTING_STARTED.md
│   ├── ocr-feature.md
│   ├── password-management.md
│   ├── voice_input_plan.md
│   └── architecture/decisions/      # ADR (21 запись)
│
├── plans/                           # Устаревшие/выполненные планы
│
└── uploads/                         # Загруженные файлы (volume)
```