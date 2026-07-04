# AiAssist Roadmap

## v0.1 — Programming Skeleton
**Статус:** ✅ completed

Создана базовая структура Programming Engine: классы Task, Context, Result, Provider, сервис-синглтон, страница `/programming.html`, навигация.

## v0.2 — Task Analyzer
**Статус:** ✅ completed

Реализован Task Analyzer — модуль классификации текстового запроса в структурированную ProgrammingTask. Поддержка 7 типов задач, 5 языков, 4 доменов. Полностью локальный, без LLM.

## v0.3 — Provider Framework
**Статус:** ✅ completed

Создан Provider Framework: ProviderManager, базовый класс BaseProvider, 5 встроенных провайдеров (Internal, Filesystem, MCP, RAG, OpenRouter). Все внешние интеграции работают через Provider Framework.

## v0.4 — Execution Context
**Статус:** ✅ completed

Создан ExecutionContext — единый контейнер состояния выполнения через весь pipeline. Содержит task, plan, collectedData, prompt, result, metadata. Полностью сериализуем через toJSON/fromJSON.

## v0.5 — Execution Planner
**Статус:** ✅ completed

Создан ExecutionPlanner — составляет последовательность действий для выполнения задачи. Не выполняет действия. Использует ProviderManager для получения информации о провайдерах.

## v0.6 — Execution Pipeline
**Статус:** ✅ completed

Создан ExecutionPipeline — оркестратор выполнения. Последовательно проходит по шагам ExecutionPlan, получает провайдера через ProviderManager, вызывает его, сохраняет результат в ExecutionContext. Добавлен executionLog.

## Sprint 010 — RAG Integration
**Статус:** ✅ completed

Интеграция существующей RAG-системы в Programming Engine через RagProvider. RagProvider.execute() вызывает `rag.prepareRagContext()`.

## Sprint 011 — Project Context Foundation
**Статус:** ✅ completed

Создан ProjectContextService, ExecutionContext расширен полями projectId и projectContext. API принимает projectId, UI показывает селектор проекта.

## Sprint 012 — Project Context Integration
**Статус:** ✅ completed

ProjectContextService использует реальные источники: projects, messages, attachments, document_embeddings. В PromptBuilder добавлена секция [PROJECT].

## Sprint 013 — Context Collector
**Статус:** ✅ completed

Создан ContextCollector — единый слой подготовки данных перед Pipeline. Providers переведены на collectedData с сохранением fallback.

## Sprint 014 — Reviewer Engine
**Статус:** ✅ completed

Модуль проверки результата: эвристический анализ кода (наличие, языковые конструкции, соответствие запросу), оценка score 0–100, warnings/errors/recommendations. ProgrammingReview и Reviewer. Полностью локальный, без LLM. Результат ревью сохраняется в metadata.review. Обратная совместимость ProgrammingResult сохранена.

## Sprint 015 — Model Management Platform
**Статус:** ✅ completed

Создан ModelManager — единая точка доступа к моделям. Модели хранятся в БД (таблицы `models` и `model_assignments`). Администратор управляет моделями через Admin UI: синхронизация каталога с OpenRouter, назначение моделей по ролям (chat, programming, reviewer, academy, summarizer, vision). OpenRouterProvider получает модель через ModelManager. Ни один модуль не знает конкретного имени модели. Полная обратная совместимость сохранена.

## Sprint 016 — MCP Provider Foundation
**Статус:** ✅ completed

Реализован McpProvider с действием `collect_metadata`. Provider возвращает `{ available, metadata }`, не выбрасывает исключений при недоступности MCP. Данные сохраняются в `collectedData.collect_metadata`. Предусмотрен интерфейс для будущего MCP-клиента через конструктор. `collect_metadata` помечен как необязательный шаг плана (required: false). Pipeline продолжается при любой недоступности MCP. Полная обратная совместимость сохранена.

## Sprint 017 — Infrastructure Layer: MCP Connection Manager
**Статус:** ✅ completed

Создан инфраструктурный слой `services/mcp/`: `McpConnectionManager`, `McpClientFactory`, `config.js`. McpProvider переведён на использование `McpConnectionManager.getClient()`. Provider не знает о конфигурации, транспорте или местоположении MCP-сервера. Поддерживается архитектура транспортов (HTTP/stdio/TCP/SSE) через реестр фабрики. При `enabled: false` никаких ошибок не возникает. Programming Engine инициализирует MCP-соединение при старте. Полная обратная совместимость сохранена.

## Sprint 018 — Real MCP Connection (RSV Data)
**Статус:** ✅ completed

Создан `HttpMcpClient` в `services/mcp/transports/httpTransport.js` — полноценный HTTP-клиент на встроенном `fetch()`. URL строится полностью из config. McpClientFactory использует новый модуль без изменения публичного API. Добавлены admin endpoints: `GET /api/admin/mcp/status` и `POST /api/admin/mcp/reload`. Все ошибки сети обрабатываются безопасно (available=false). Подготовлена почва для подключения реального RSV Data MCP-сервера. McpProvider, Programming Engine, Chat, RAG не изменены.

## Sprint 019 — Conversation Memory
**Статус:** 🔄 planned

Использование истории диалогов для контекста задач.

## Sprint 020 — Prompt Templates
**Статус:** 🔄 planned

Шаблоны промптов для разных типов задач.

## v1.0 — AI Programming Assistant
**Статус:** 🔄 planned

Полноценный AI-ассистент для разработчика. Pipeline: запрос → анализ → контекст → промпт → LLM → ревью → результат.

---

## Долгосрочное видение

Programming Engine — первый специализированный модуль универсальной AI-платформы. В перспективе AiAssist может включать модули для любых инженерных доменов: DevOps, аналитика данных, документооборот, тестирование. Каждый модуль строится по единой архитектурной схеме: Task Analyzer → Context → Prompt → LLM → Reviewer → Result.

Платформа не привязана к 1С или программированию — это инфраструктура для построения предметных AI-ассистентов.