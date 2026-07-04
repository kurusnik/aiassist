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

## Sprint 015 — Model Configuration
**Статус:** 🔄 planned

Настройка и переключение LLM-моделей в Programming Engine.

## Sprint 016 — MCP Integration
**Статус:** 🔄 planned

Подключение MCP-провайдера для доступа к внешним данным.

## Sprint 017 — Conversation Memory
**Статус:** 🔄 planned

Использование истории диалогов для контекста задач.

## Sprint 018 — Prompt Templates
**Статус:** 🔄 planned

Шаблоны промптов для разных типов задач.

## v1.0 — AI Programming Assistant
**Статус:** 🔄 planned

Полноценный AI-ассистент для разработчика. Pipeline: запрос → анализ → контекст → промпт → LLM → ревью → результат.

---

## Долгосрочное видение

Programming Engine — первый специализированный модуль универсальной AI-платформы. В перспективе AiAssist может включать модули для любых инженерных доменов: DevOps, аналитика данных, документооборот, тестирование. Каждый модуль строится по единой архитектурной схеме: Task Analyzer → Context → Prompt → LLM → Reviewer → Result.

Платформа не привязана к 1С или программированию — это инфраструктура для построения предметных AI-ассистентов.