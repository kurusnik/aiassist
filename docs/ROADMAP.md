# AiAssist Roadmap

## v0.1 — Programming Skeleton
**Статус:** ✅ completed

Создана базовая структура Programming Engine: классы Task, Context, Result, Provider, сервис-синглтон, страница `/programming.html`, навигация.

## v0.2 — Task Analyzer
**Статус:** ✅ completed

Реализован Task Analyzer — модуль классификации текстового запроса в структурированную ProgrammingTask. Поддержка 7 типов задач, 5 языков, 4 доменов. Полностью локальный, без LLM.

## v0.3 — Context Collector
**Статус:** 🔄 planned

Сбор контекста для задачи: файлы проекта, RAG-результаты, документация, импорты. Интеграция с ProgrammingContext.

## v0.4 — Provider Framework
**Статус:** ✅ completed

Создан Provider Framework: ProviderManager, базовый класс BaseProvider, 5 встроенных провайдеров (Internal, Filesystem, MCP, RAG, OpenRouter). Все внешние интеграции работают через Provider Framework.

## v0.5 — Execution Context
**Статус:** ✅ completed

Создан ExecutionContext — единый контейнер состояния выполнения через весь pipeline. Содержит task, plan, collectedData, prompt, result, metadata.

## v0.6 — Prompt Builder
**Статус:** 🔄 planned

Построение промпта для LLM на основе ProgrammingTask и ProgrammingContext. Шаблоны для каждого типа задачи.

## v0.6 — OpenRouter Integration
**Статус:** 🔄 planned

Подключение OpenRouter к Programming Engine. Отправка промпта, получение ответа, обработка ошибок и таймаутов.

## v0.7 — MCP RSV Data
**Статус:** 🔄 planned

Подключение MCP-провайдера для доступа к данным РСВ (расчёт страховых взносов). Интеграция с Context Collector.

## v0.8 — RAG Integration
**Статус:** 🔄 planned

Интеграция существующей RAG-системы в Programming Engine. Контекст из базы знаний для задач 1С, SQL, backend.

## v0.9 — Reviewer
**Статус:** 🔄 planned

Модуль проверки результата: синтаксический анализ, соответствие задаче, проверка безопасности. Локальный анализатор без LLM.

## v1.0 — AI 1C Developer
**Статус:** 🔄 planned

Полноценный AI-ассистент для разработчика 1С. Pipeline: запрос → анализ → контекст → промпт → LLM → ревью → результат.

---

## Долгосрочное видение

Programming Engine — первый специализированный модуль универсальной AI-платформы. В перспективе AiAssist может включать модули для любых инженерных доменов: DevOps, аналитика данных, документооборот, тестирование. Каждый модуль строится по единой архитектурной схеме: Task Analyzer → Context → Prompt → LLM → Reviewer → Result.

Платформа не привязана к 1С или программированию — это инфраструктура для построения предметных AI-ассистентов.
