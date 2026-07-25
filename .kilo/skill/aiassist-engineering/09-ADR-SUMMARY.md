# AiAssist Engineering Skill — Architecture Decision Records Summary

| ADR | Название | Статус | Суть |
|-----|----------|--------|------|
| 001 | Programming — модуль AiAssist | ✅ | Programming Engine — модуль внутри приложения, не отдельный сервис |
| 002 | Правило двух кликов | ✅ | Любая функция доступна максимум за 2 клика от главного экрана |
| 003 | Task Analyzer без LLM | ✅ | Классификация по ключевым словам + scoring, без внешних вызовов |
| 004 | Разделение Task и Execution | ✅ | Task — value object (что), Execution — жизненный цикл (как) |
| 005 | План всегда строится до выполнения | ✅ | Execution Planner только строит план, не выполняет |
| 006 | Provider Framework | ✅ | Единый слой абстракции для всех внешних интеграций |
| 007 | ExecutionContext | ✅ | Единый контейнер состояния Pipeline, сериализуемый |
| 008 | Execution Pipeline | ✅ | Оркестратор: проходит по шагам плана через ProviderManager |
| 009 | Foundation Frozen | ✅ | Ядро Execution Engine стабильно; новые функции — расширение, не изменение |
| 010 | Prompt Builder 2.0 | ✅ | Секционная сборка промпта из ExecutionContext |
| 011 | Project Context | ✅ | Единый фасад контекста проекта для всех модулей |
| 012 | Project Context Integration | ✅ | Подключение реальных источников данных (SQL-запросы) |
| 013 | Context Collector | ✅ | Слой подготовки данных перед Pipeline |
| 014 | Provider Migration | ✅ | Provider'ы переведены на ExecutionContext (первый приоритет — collectedData) |
| 015 | Reviewer Engine v1 | ✅ | Эвристическая проверка кода без LLM |
| 016 | Model Management Platform | ✅ | ModelManager — единая точка доступа; управление через админ-панель |
| 017 | MCP Provider Foundation | ✅ | McpProvider как адаптер с `collect_metadata` |
| 018 | MCP Connection Manager | ✅ | Инфраструктурный слой: config, фабрика транспортов, connection manager |
| 019 | Real MCP Connection | ✅ | HttpMcpClient, admin endpoints для мониторинга |
| 021 | MCP Tool Client | ✅ | Единый клиент вызова инструментов MCP |
| 022 | 1C MCP Server Integration | ✅ | Два независимых MCP-контура (общий и 1С) |
| 023 | Score Normalization Strategy | ✅ (temporary) | Min-Max признан временным решением; требуется оценка более устойчивых методов |
| 024 | Pipeline Topology | ✅ (deferred) | PipelineStep пока без parentStepId; будущий граф зафиксирован без реализации |
| 025 | Search Provider Abstraction | ✅ (deferred) | Замена прямой зависимости Retrieval → RAG через интерфейс SearchProvider |
| 026 | Query Intelligence Layer | ✅ | Архитектурный слой интерпретации запросов: QueryContext, Intent, Entity, QueryPlan; выключен по умолчанию |
| 027 | TaskRouter vs Query Intelligence | ✅ | Чёткое разделение: TaskRouter = технический маршрут, QI = смысл запроса |
| — | Sprint 3.5.3 Hardening | ✅ | Candidate validator, audit private fields, diagnostics coverage, dependency audit |

**Примечание:** ADR 020 отсутствует в последовательности.