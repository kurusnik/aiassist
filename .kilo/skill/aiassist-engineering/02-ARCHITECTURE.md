# AiAssist Engineering Skill — Architecture

## Общая схема компонентов

```
Chat Interface ─────┐
                    │
                    ▼
           Prompt Assembly
                    │
            ┌───────┼───────┐
            │       │       │
            ▼       ▼       ▼
           RAG   Knowledge  Programming
                  Layer     Agent
            │       │       │
            └───────┼───────┘
                    │
                    ▼
                   LLM
                    │
                    ▼
             Response Stream
```

## Маршрутизация запросов

```
Frontend (Vanilla JS + HTML/CSS)
  │
  ▼
POST /assistant
  │
  ▼
TaskRouter
  │
  ├─────────────────────────────────────────────┐
  │                                              │
  ▼                                              ▼
Chat Flow                                   Programming Flow
  │                                              │
  ▼                                              ├── Query Intelligence → QueryContext
llmService                                      ├── Search Orchestrator → Candidate[]
  │                                              ├── Context Intelligence → Structured Context
  ▼                                              ├── Planning Bridge → PlanningContext + ExecutionPlan
ProviderFactory                                 ├── Safety Checker
  │                                              ├── Agent Runtime
  ▼                                              │      └── ProgrammingAgentAdapter
OpenRouter/                                     │              └── TaskAnalyzer
LM Studio/                                      │              └── ExecutionPlanner
OpenAI                                          │              └── ExecutionPipeline
  │                                              │                     ├── McpProvider (1C metadata)
  ▼                                              │                     ├── FilesystemProvider
ModelManager.getModel('chat')                    │                     ├── RagProvider
  │                                              │                     ├── InternalProvider (PromptBuilder, Reviewer)
  ▼                                              │                     └── OpenRouterProvider (→ llmService)
selectedModel → llmService.stream()              │              └── Result Validation
                                                 │
                                                 ▼
                                            AgentResult
```

## Programming Agent Pipeline

```
User Request
    │
    ▼
TaskRouter.detect() ─── confidence >= 0.7 → Programming
    │
    ▼
Query Intelligence → QueryContext
    │
    ▼
Search Orchestrator → Candidate[] (Knowledge + Hybrid Retrieval)
    │
    ▼
Context Intelligence → Structured Context
    │
    ▼
Planning Bridge → PlanningContext + ExecutionPlan
    │
    ▼
Safety Checker → { allowed, requiresConfirmation }
    │
    ▼
Agent Runtime → Programming Agent Adapter
    │
    ▼
TaskAnalyzer.analyze(text)
    │  ─── классификация (тип, язык, домен)
    ▼
ExecutionPlanner.plan(task)
    │  ─── пошаговый план из шаблона
    ▼
ProjectContextService.load(projectId)
    │  ─── загрузка контекста проекта
    ▼
ContextCollector.collect(executionContext)
    │  ─── нормализация данных в collectedData
    ▼
ExecutionPipeline.execute(context)
    │  ─── последовательное выполнение шагов:
    │      McpProvider → FilesystemProvider → RagProvider →
    │      InternalProvider (PromptBuilder) → OpenRouterProvider →
    │      InternalProvider (Reviewer)
    ▼
Result Validation
    ▼
AgentResult → Response
```

## MCP Architecture

### Два независимых MCP-контура

```
Общий MCP                        1С MCP
config.js                        onecConfig.js
  │                                 │
  ▼                                 ▼
connectionManager               onecConnectionManager
  │                                 │
  ▼                                 ▼
mcpToolClient                   onecToolClient
```

- Каждый контур имеет собственный `McpConnectionManager` и `McpToolClient`
- 1С MCP использует Basic Auth (логин/пароль из env)
- Транспорт: HTTP, протокол JSON-RPC 2.0
- Программинг-провайдер `McpProvider` переключён на `onecConnectionManager`
- При недоступности MCP сервера приложение продолжает работу без MCP-контекста

## Knowledge Layer Data Flow

```
1С
│
▼
MCP (RSV Data)
│
▼
Knowledge Importer ── CLI (npm run knowledge:import)
│
▼
PostgreSQL (knowledge schema)
│
▼
Knowledge Service ── читает knowledge.* (Retrieval)
│
▼
Knowledge Scorer ── оценивает релевантность (Scoring)
│
▼
Relation Resolver ── разрешает связи объектов (Relations)
│
▼
Context Builder ─── структурированный контекст (Enrichment + Context)
│
▼
Knowledge Provider ── Candidate[] с score + metadata
│
▼
Context Intelligence ── Quality Gate → Dedup → Prioritization → Budget
│
▼
Prompt Builder ── структурированный контекст в промпт
│
▼
LLM
```

## Knowledge Intelligence Pipeline

```
User Query
  │
  ▼
Query Intelligence (QueryContext)
  │
  ▼
KnowledgeProvider.getCandidates(queryContext)
  ├── contextBuilder.build(query, queryContext)
  │   ├── knowledgeService.findObjects(query)
  │   ├── KnowledgeScorer.score(object, queryContext)
  │   │   ├── name match
  │   │   ├── synonym match
  │   │   ├── comment/description match
  │   │   ├── field match
  │   │   ├── object type match
  │   │   └── query intent relevance
  │   ├── RelationResolver.resolve(objectId)
  │   │   ├── references_object (field reference_type)
  │   │   ├── references_enum (enum fields)
  │   │   ├── related_to_register (register links)
  │   │   └── stored_relation (knowledge.relations table)
  │   └── _buildStructuredText(object, fields, relations)
  │
  ▼
Candidate[] with scored content + metadata
  │
  ▼
Context Intelligence (existing pipeline)
```

### Knowledge Scoring Factors

| Factor | Max Weight | Source |
|--------|-----------|--------|
| Name match | 0.9 | name, synonym, full_name |
| Comment match | 0.3 | comment/description field |
| Field match | 0.4 | field names, synonyms, reference types |
| Object type match | 0.15 | entity types from QueryContext |
| Intent boost | 0.15 | QueryContext.intent name influence |

### Knowledge Intelligence Components

| Component | Location | Function |
|-----------|----------|----------|
| KnowledgeScorer | `services/knowledge/scoring/KnowledgeScorer.js` | Relevance scoring 0..1 |
| RelationResolver | `services/knowledge/relations/RelationResolver.js` | Resolve object relations (batch: resolveMany) |
| Structured Context | `services/knowledge/contextBuilder.js` | Structured text + metadata (batch fields + relations) |

### Relation Types

| Type | Source | Confidence |
|------|--------|------------|
| `references_object` | Field `reference_type` → Catalog/Document | 0.9 |
| `references_enum` | Field `reference_type` → Enum | 0.8 |
| `related_to_register` | Field → Register (direct or name ILIKE) | 0.6–0.85 |
| `stored_relation` | `knowledge.relations` table (outgoing) | 0.9 |
| `stored_relation_inverse` | `knowledge.relations` table (incoming) | 0.8 |

### Importer Relations Flow (Sprint 4.1)

```
Import all objects + fields
  │
  ▼
Scan all fields WITH reference_type
  │
  ▼
For each reference_type:
  ├── Determine relation type (references_object/references_enum/related_to_register)
  ├── Find target object by full_name=reference_type
  └── INSERT INTO knowledge.relations
  │
  ▼
Stats: "Relations built: N"
```

### Batch Optimization (Sprint 4.1)

Before (N objects = 4N queries):
```
getFields(1) → 1 query
resolve(1)   → 3 queries
...
getFields(N) → 1 query
resolve(N)   → 3 queries
```

After (N objects = 4 queries):
```
getFieldsBatch(ids)         → 1 query
resolveByFullNames(names)   → 3 queries
```

### Knowledge Intelligence Components

| Component | Location | Function |
|-----------|----------|----------|
| KnowledgeScorer | `services/knowledge/scoring/KnowledgeScorer.js` | Relevance scoring 0..1 |
| RelationResolver | `services/knowledge/relations/RelationResolver.js` | Resolve object relations (batch: resolveMany) |
| Structured Context | `services/knowledge/contextBuilder.js` | Structured text + metadata (batch fields + relations) |
| Knowledge Provider | `services/search/providers/KnowledgeProvider.js` | Adapter to Search Pipeline |

## LLM Providers

| Provider | Backend | Config |
|----------|---------|--------|
| `openrouter` | OpenRouter API / MixRoute / Custom | Aggregator Type + Base URL + API Key из `llm_settings` |
| `lmstudio` | Local LM Studio server | `baseURL` в `llm_settings` |
| `openai` | OpenAI API | `OPENAI_API_KEY` env |

Активный провайдер выбирается через `ProviderFactory.getActiveProvider()`.

## ModelManager

`ModelManager` (`services/models/ModelManager.js`) — единая точка доступа к моделям для всех ролей:

| Роль | Назначение | Используется в |
|------|------------|----------------|
| `chat` | Основной чат | `POST /assistant` |
| `programming` | Programming Agent | `OpenRouterProvider` |
| `reviewer` | Ревью кода | `Reviewer` |
| `summarizer` | Суммаризация | — |
| `vision` | Vision-задачи | — |
| `academy` | Академия | — |

Модели назначаются администратором через админ-панель (Models → Assignments). Пользователь не выбирает модель в чате.

## Связанность компонентов

| Компонент | Используют | Использует |
|-----------|-----------|------------|
| Knowledge Service | Context Builder | `db.js` |
| Context Builder | Injection (index.js) | Knowledge Service |
| Importer | CLI (knowledge-import.js) | `db.js`, `services/mcp` |
| Injection | — (встроен в index.js) | Context Builder |
| MCP | Importer, McpProvider | HTTP (1С) |
| RAG | Prompt Assembly | `db.js`, `@xenova/transformers` |
| Programming Agent | Task Router | `services/programming/*` |

Циклические зависимости отсутствуют.

## Distributed Workflow Runtime Architecture

### Общая схема

```
API Gateway
    │
    ▼
WorkflowOrchestrator
    │
    ├── WorkerPool ──── Worker 1 (lease + heartbeat)
    │                   Worker 2 (lease + heartbeat)
    │                   Worker N (lease + heartbeat)
    │
    ├── LeaseManager ── worker_leases (PostgreSQL)
    ├── HeartbeatService
    ├── IdempotencyService ── idempotency_keys (PostgreSQL)
    └── AuditService ─────── worker_audit_log (PostgreSQL)
    │
    ▼
Persistent Store (PostgreSQL)
```

### Компоненты

| Компонент | Назначение | Хранилище |
|-----------|-----------|-----------|
| WorkflowOrchestrator | Жизненный цикл workflow (start/step/execute/cancel) | workflow_instances, workflow_steps |
| WorkerPool | Регистрация и распределение задач по воркерам | — (in-memory registry) |
| LeaseManager | Lease-блокировки (acquire/renew/release/cleanup) | worker_leases |
| HeartbeatService | Периодическое подтверждение жизни воркера | worker_leases.heartbeat_at |
| IdempotencyService | Гарантия уникальности action (dedup) | idempotency_keys |
| AuditService | Сквозная трассировка всех action | worker_audit_log |

### Worker Runtime Lifecycle

```
IDLE ──→ ACQUIRED ──→ RUNNING ──→ COMPLETED
                        │
                        ├──→ FAILED (non-recoverable)
                        └──→ HEARTBEAT_EXPIRED (lease lost → retry)
```

### Lease / Heartbeat параметры

| Параметр | Значение |
|----------|----------|
| TTL | 30s |
| Heartbeat interval | 10s (TTL/3) |
| Max missed heartbeats | 2 |
| Grace period | 5s |

## Control Plane Architecture

### Общая схема

```
UI / API Gateway
    │
    ▼
Authorization Layer (authChecker)
    │
    ▼
Control Plane Services
    ├── WorkflowControlService
    │   ├── create / start / pause / resume
    │   ├── cancel / terminate / retryNode / skipNode
    │   └── getStatus / getTimeline / listWorkflows
    │
    ├── ApprovalAPI
    │   ├── listPending / getApproval
    │   └── approve / reject
    │
    ├── ExecutionGraphView
    │   └── buildView(workflowId, graph) → view DTO
    │
    ├── WorkflowTimelineService
    │   ├── getTimeline (events + audit + traces)
    │   ├── getTechnicalTimeline
    │   └── getBusinessTimeline
    │
    ├── AgentControlService
    │   ├── listAgents / getAgentInfo
    │   └── enable / disable / reload
    │
    └── MetricsControlService
        ├── getWorkflowMetrics / getWorkerMetrics
        ├── getAgentMetrics / getToolMetrics
        └── getErrorMetrics / getAll
    │
    ▼
Audit Layer (AuditService)
    │
    ▼
Runtime Layer
    ├── WorkflowExecutor
    ├── WorkflowStorage
    ├── EventStore
    └── WorkerRuntime
```

### Control Plane Компоненты

| Компонент | Директория | Назначение |
|-----------|-----------|-----------|
| WorkflowControlService | `services/workflow/control/` | Lifecycle management, authorization, audit |
| ApprovalAPI | `services/security/approval/api/` | Human approval REST API contract |
| ExecutionGraphView | `services/workflow/view/` | Graph → UI DTO adapter |
| WorkflowTimelineService | `services/workflow/timeline/` | Merged timeline from multiple sources |
| AgentControlService | `services/agents/control/` | Agent registry management |
| MetricsControlService | `services/metrics/control/` | Metrics aggregation and exposure |

### Operation Pattern

Каждая операция Control Plane проходит:
1. **Actor** — извлечение оператора из контекста запроса
2. **Authorization** — проверка прав через authChecker
3. **Validation** — проверка входных параметров и статуса workflow
4. **Execution** — вызов Runtime (executor/storage/eventStore)
5. **Audit** — запись AuditEvent с actor, action, результатом
6. **Result** — возврат структурированного результата { success, workflowId, status, actor, timestamp }

### Idempotency

- Каждый action воркера имеет `dedup_id`
- Идемпотентность на уровне API: `Idempotency-Key` header
- Идемпотентность на уровне БД: UPSERT / ON CONFLICT DO NOTHING
- TTL для idempotency keys (cleanup старых записей)

### Audit

- Каждый action пишется в `worker_audit_log` (append-only)
- Поля: traceId, workerId, actionId, actionType, leaseId, status, idempotencyKey, timestamps
- Индексы: trace_id, worker_id, started_at