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
| 028 | Knowledge Intelligence Layer | ✅ | Knowledge Layer теперь Intelligence слой: Scoring, Relations, Enrichment, Context, интеграция с Query Intelligence |
| 029 | Execution Contract — QueryPlan → ExecutionPlan | ✅ | Action.confidence/safety, Planning слой-мост, ExecutionPlan toJSON+UUID |
| 030 | KnowledgeContext DTO | ✅ | KnowledgeContext класс + Validator, Candidate.meta.schema discriminator |
| 031 | MCP Orchestrator Foundation | ✅ (deferred) | Архитектура MCP-роутинга, диагностики и safety; реализация в Sprint 5 |
| 032 | Agent Runtime Architecture | ✅ | AgentContext, AgentResult, AgentRuntime, ExecutionPipeline, SafetyChecker, ProgrammingAgentAdapter; полный trace через QI → Search → CI → Planning → Agent → Execution → Result |
| 033 | Agent Registry Architecture | ✅ | AgentRegistry (register/get/remove/list), AgentRuntime.resolve через registry или inline handler, AgentContext.candidates, AgentResult.schemaVersion, PolicyProvider safety extension point |
| 049 | Lease & Heartbeat | ✅ | Lease-блокировки для распределённых воркеров: TTL=30s, heartbeat каждые 10s, max missed=2, graceful shutdown |
| 050 | Worker Concurrency | ✅ | WorkerPool управляет конкурентным доступом: acquire/release, распределение idle-воркеров, защита от двойного назначения |
| 051 | Idempotency | ✅ | Каждый action воркера идемпотентен через dedup_id + UPSERT; Idempotency-Key на API; TTL cleanup старых ключей |
| 052 | Async Audit | ✅ | Сквозная трассировка всех worker action: write-once в worker_audit_log (append-only), индексы trace_id/worker_id/started_at |
| 053 | Event Sequencing | ✅ | Гарантия порядка событий в распределённом runtime: workflow_steps с порядковым номером, strict ordering в рамках одного instance |
| 054 | Control Plane Architecture | ✅ | WorkflowControlService — прослойка между API и Runtime: авторизация, аудит, structured result |
| 055 | Human Console Security | ✅ | Security model для операторских действий: actor, permission, audit, approval flow |
| 056 | Runtime Observability Model | ✅ | Unified observability: metrics (количественные), timeline (события), traces (отладка) |

**Примечание:** ADR 020 отсутствует в последовательности. ADR 034–048 зарезервированы для будущих решений. Всего записей: 38 ADR + 1 hardening.