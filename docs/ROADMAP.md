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

## v0.7 — Filesystem Provider
**Статус:** 🔄 planned

Реализация FilesystemProvider: чтение файлов проекта, поиск примеров, интеграция с ExecutionContext.

## v0.8 — Prompt Builder
**Статус:** 🔄 planned

Построение промпта для LLM на основе ProgrammingTask и ProgrammingContext. Шаблоны для каждого типа задачи.

## v0.9 — OpenRouter Integration
**Статус:** 🔄 planned

Подключение OpenRouter к Programming Engine. Отправка промпта, получение ответа, обработка ошибок и таймаутов.

## v0.10 — MCP RSV Data
**Статус:** 🔄 planned

Подключение MCP-провайдера для доступа к данным РСВ (расчёт страховых взносов). Интеграция с Context Collector.

## v0.11 — RAG Integration
**Статус:** 🔄 planned

Интеграция существующей RAG-системы в Programming Engine. Контекст из базы знаний для задач 1С, SQL, backend.

## v0.12 — Reviewer
**Статус:** 🔄 planned

Модуль проверки результата: синтаксический анализ, соответствие задаче, проверка безопасности. Локальный анализатор без LLM.

## v1.0 — AI 1C Developer
**Статус:** 🔄 planned

Полноценный AI-ассистент для разработчика 1С. Pipeline: запрос → анализ → контекст → промпт → LLM → ревью → результат.

---

## Долгосрочное видение

Programming Engine — первый специализированный модуль универсальной AI-платформы. В перспективе AiAssist может включать модули для любых инженерных доменов: DevOps, аналитика данных, документооборот, тестирование. Каждый модуль строится по единой архитектурной схеме: Task Analyzer → Context → Prompt → LLM → Reviewer → Result.

Платформа не привязана к 1С или программированию — это инфраструктура для построения предметных AI-ассистентов.