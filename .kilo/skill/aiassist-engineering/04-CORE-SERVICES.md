# AiAssist Engineering Skill — Core Services

## LLM Service

**Файлы:** `services/llm/`

- `LLMService` — фасад для чата и стриминга
- `ProviderFactory` — выбор активного провайдера из `llm_settings` таблицы
- `register.js` — реестр провайдеров (registry pattern, без switch/case)
- Каждый провайдер реализует: `chat()`, `stream()`, `listModels()`, `health()`
- **LLM Aggregator** (openrouter) поддерживает OpenRouter, MixRoute, Custom OpenAI-совместимые API; Base URL из настроек

## ModelManager

**Файл:** `services/models/ModelManager.js`

- Единая точка доступа к моделям для всех ролей
- Методы: `syncModels()`, `getAvailableModels()`, `getModel(role)`, `setModel(role, modelId)`, `getRoles()`, `getAssignments()`
- Хранит модели в таблице `models`, назначения в `model_assignments`
- При смене провайдера: очистка каталога → вставка модели по умолчанию → синхронизация

## TaskRouter

**Файл:** `services/router/TaskRouter.js`

- `detect(text)` — классификация запроса: chat vs programming
- При уверенности >= 0.7 направляет в Programming Agent

## Programming Agent

**Файлы:** `services/programming/`

### ProgrammingService (facade)
- `executePipeline(text, projectId)` — полный цикл выполнения

### TaskAnalyzer
- Классификация по ключевым словам (scoring: 1 балл за keyword, 2 за subkeyword)
- Определяет: `type`, `language`, `domain`
- Полностью локальный, без LLM (ADR 003)

### ExecutionPlanner
- Строит `ExecutionPlan` (массив шагов с провайдерами)
- Только планирует, не выполняет (ADR 005)
- Поддерживаемые типы задач: `find_object`, `analyze_metadata`, `get_structure`, `create_processor`, `create_report`, `modify_code`, `explain_code`, `review_code`, `find_bug`, `unknown`

### ExecutionPipeline
- Оркестратор: проходит по шагам плана, вызывает провайдеров через ProviderManager
- ExecutionLog с метками времени
- При ошибке на `required: true` шаге — остановка (ADR 008)

### ContextCollector
- Переносит данные из `projectContext` в `executionContext.collectedData`
- Не выполняет SQL/RAG/файловые вызовы (ADR 013)

### PromptBuilder
- Секционная сборка промпта из ExecutionContext (ADR 010)
- Секции: SYSTEM, TASK, PROJECT CONTEXT, PROJECT FILES, EXAMPLES, RAG CONTEXT, MCP CONTEXT, OUTPUT REQUIREMENTS
- Каждая секция включается только если есть данные
- `MAX_FILE_PREVIEW_CHARS = 2000`

### Reviewer
- Эвристическая проверка кода без LLM (ADR 015)
- Проверки: наличие кода, соответствие языку, семантическая по ключевым словам, пояснение
- Оценка 0–100, результат `ProgrammingReview`

### Providers

| Provider | Capability | Назначение |
|----------|-----------|------------|
| BaseProvider | — | Базовый класс: `name`, `description`, `capabilities`, `execute()` |
| InternalProvider | `build_prompt`, `review_result` | PromptBuilder + Reviewer |
| FilesystemProvider | `collect_project_files`, `collect_examples` | Файлы проекта |
| RagProvider | `collect_rag` | RAG контекст |
| McpProvider | `collect_metadata` | MCP метаданные (1C) |
| OpenRouterProvider | `call_llm` | Вызов LLM |

## RAG (Semantic Search)

**Файлы:** `services/rag/`

- Локальный эмбеддер: `@xenova/transformers` с `Xenova/multilingual-e5-small` (384d)
- Векторный поиск через pgvector (IVFFlat index, cosine distance)
- Три таблицы: `document_embeddings`, `message_embeddings`, `public_embeddings`
- Трёхуровневая логика ответов: >= 0.7 (цитирование), 0.3–0.7 (общие знания), < 0.3 (нет информации)
- Маркеры источников в UI: RAG:SOURCE, RAG:ANALYSIS, MODEL:KNOWLEDGE

## Hybrid Retrieval (Sprint 2 — Knowledge Platform v2)

**Файлы:** `services/retrieval/`

Новый уровень абстракции поиска. Не заменяет существующий Vector Search, а надстраивается над ним.

```
Query
  │
  ▼
HybridRetrievalService
  ├── Vector Search (pgvector, существующий)
  ├── Full Text Search (PostgreSQL tsvector + GIN)
  │
  ▼
Merge ─── дедупликация, сохранение provenance
  │
  ▼
Normalize ─── единая шкала score (0–1) с настраиваемыми весами
  │
  ▼
Rank ─── финальная сортировка + explanation
  │
  ▼
Context Builder
```

| Компонент | Файл | Назначение |
|-----------|------|------------|
| HybridRetrievalService | `index.js` | Фасад: оркестрация этапов, fallback при ошибках |
| Config | `config.js` | Веса (vectorWeight, ftsWeight), лимиты, threshold |
| FTS Search | `ftsSearch.js` | PostgreSQL `to_tsvector` / `to_tsquery` / `ts_rank` |
| Merge | `merge.js` | Объединение результатов, дедупликация, provenance |
| Normalize | `normalize.js` | Приведение score к единой шкале с конфигурируемыми весами |
| Rank | `rank.js` | Финальное ранжирование + explanation для каждого документа |

**Pipeline Steps в Diagnostics:** `vector_search`, `full_text_search`, `merge`, `normalize`, `rank`, `hybrid_retrieval_fallback`

**Fallback:** При любой ошибке HybridRetrieval автоматически откатывается к существующему Vector Search.

**Config через env:**
- `HYBRID_VECTOR_WEIGHT` (default: 0.6)
- `HYBRID_FTS_WEIGHT` (default: 0.4)
- `HYBRID_MAX_RESULTS` (default: 10)
- `HYBRID_VECTOR_THRESHOLD` (default: 0.15)
- `HYBRID_VECTOR_LIMIT` (default: 10)
- `HYBRID_FTS_LIMIT` (default: 10)

**Миграция:** `011_hybrid_retrieval_fts.sql` — добавляет tsvector колонки + GIN индексы

## Query Intelligence (Sprint 3.5 — Foundation)

**Файлы:** `services/query-intelligence/`

Архитектурный слой между User Input и всеми AI-пайплайнами. Преобразует сырой запрос в единый структурированный объект `QueryContext` для downstream-модулей.

### Полный Lifecycle

```
User Query
  │
  ▼
TaskRouter (технический маршрут: chat | programming | admin | voice)
  │
  ▼
Query Intelligence
  ├── Normalization ──── trim, lowercase, NFD, стоп-слова
  ├── Intent Detection ── type + confidence
  ├── Entity Extraction ─ массив сущностей
  └── Query Plan ──────── последовательность Action[]
  │
  ▼
QueryContext (rawQuery + normalizedQuery + routing metadata)
  │
  ▼
Search Providers
  ├── HybridRetrievalProvider (Retrieval → Candidate[])
  ├── KnowledgeProvider (Knowledge → Candidate[])
  ├── MCPProvider (будущий)
  ├── AcademyProvider (будущий)
  └── MemoryProvider (будущий)
  │
  ▼
Candidate[]
  │
  ▼
Context Intelligence (только Candidate[])
  ├── Quality Gate
  ├── Deduplication
  ├── Source Coordination
  ├── Relevance Prioritization
  ├── Token Budgeting
  └── Structured Context
  │
  ▼
Prompt Builder → LLM
```

### Компоненты

| Компонент | Файл | Назначение |
|-----------|------|------------|
| QueryIntelligenceService | `index.js` | Фасад: createContext, process, диагностика |
| Config | `config.js` | enabled (env), interpreter timeout, domain, language |
| Normalizer | `normalizer.js` | Базовая нормализация: trim, lowercase, NFD, стоп-слова |
| QueryContext | `models/QueryContext.js` | Единый объект передачи запроса между слоями |
| Intent | `models/Intent.js` | Модель намерения: type, confidence, parameters |
| Entity | `models/Entity.js` | Модель сущности: type, value, confidence, source |
| QueryPlan + Action | `models/QueryPlan.js` | План выполнения: массив Action { type, target, parameters } |
| QueryInterpreter | `interfaces/QueryInterpreter.js` | Контракт интерпретации (пока pass-through) |

### QueryContext

```json
{
  "rawQuery": "покажи мне расходы за прошлый месяц",
  "normalizedQuery": "расходы период прошлый месяц",
  "intent": { "type": "search_information", "confidence": 0.85 },
  "entities": [{ "type": "document", "value": "РасходнаяНакладная", "confidence": 0.9 }],
  "domain": "1c",
  "queryPlan": { "actions": [{ "type": "retrieve", "target": "knowledge" }] }
}
```

Поле `normalizedQuery` хранит нормализованное представление запроса для Retrieval, MCP, Programming Agent и Academy. NLP не реализован — только контракт.

### Action

```json
{
  "type": "retrieve | execute | generate | analyze",
  "target": "knowledge | mcp | programming | academy | llm",
  "parameters": {},
  "priority": 0
}
```

Поддерживаемые типы: `retrieve`, `execute`, `generate`, `analyze`
Поддерживаемые цели: `knowledge`, `mcp`, `programming`, `academy`, `llm`
`priority` — порядок выполнения (выше = раньше)

### Pipeline Steps в Diagnostics

`query_normalization`, `query_interpretation`, `query_intent`, `query_entities`, `query_plan`

### Config через env

- `QUERY_INTELLIGENCE_ENABLED` (default: false) — включить слой интерпретации

### Потребители (будущие)

Programming Agent, Academy, MCP Orchestrator, Workflow Engine, Memory System

### ADR

ADR-026, ADR-027

## Context Intelligence (Sprint 3 — Knowledge Platform v2)

**Файлы:** `services/context-intelligence/`

Слой интеллектуального отбора и организации знаний между Search Providers и Prompt Builder. Работает **только с `Candidate[]`**. Не знает о существовании RAG, Knowledge, MCP, Academy или Memory.

```
Search Providers
  │
  ▼
Candidate[]
  │
  ▼
Context Intelligence
  ├── Quality Gate ─── score threshold, отбрасывание шума
  ├── Deduplication ─── по ID и схожести содержимого
  ├── Source Coordination ─── группировка по meta.source, разрешение конфликтов
  ├── Token Budgeting ─── ограничение по размеру контекста
  ├── Relevance Prioritization ─── многофакторный приоритет
  └── Structured Context ─── [Primary] [Supporting] [Knowledge] формат
  │
  ▼
Prompt Builder
```

| Компонент | Файл | Назначение |
|-----------|------|------------|
| ContextIntelligenceService | `index.js` | Фасад: оркестрация этапов, fallback при ошибках |
| Config | `config.js` | Пороги, веса, лимиты контекста |
| Quality Gate | `qualityGate.js` | Фильтр документов ниже `minCombinedScore` |
| Deduplication | `dedup.js` | Дедупликация по ID + Jaccard similarity содержимого |
| Source Coordination | `sourceCoordination.js` | Объединение RAG и Knowledge, разрешение конфликтов |
| Token Budgeting | `tokenBudgeting.js` | Распределение token budget, reserve for knowledge |
| Relevance Prioritization | `relevancePrioritization.js` | combinedScore + sourceType + freshness + docType + size |
| Structured Context | `structuredContext.js` | Форматирование: Primary, Supporting, Knowledge секции |
| Candidate | `models/Candidate.js` | Единая модель источника: id, content, score, meta.source/type/methods |
| CandidateValidator | `validators/CandidateValidator.js` | Валидация: id, content, score [0-1], meta.source; rejected не ломают pipeline |

### Candidate Model

Все будущие источники должны приводиться к `Candidate`:

- RAG
- Knowledge (1C)
- MCP
- Academy
- Memory

```js
{
  id: "uuid",
  content: "text",
  score: 0.85,
  meta: {
    source: "retrieval",     // retrieval | knowledge | mcp | academy | memory
    type: "document",        // document | object | concept | rule
    methods: ["vector"],     // vector | fts | mcp | llm
    metadata: { ... }
  }
}
```

**Pipeline Steps в Diagnostics:**
`candidate_validation`, `quality_gate`, `deduplication`, `source_coordination`, `token_budgeting`, `relevance_prioritization`, `structured_context`

**Config через env:**
- `CI_QUALITY_THRESHOLD` (default: 0.15) — минимальный score
- `CI_MAX_CONTEXT_CHARS` (default: 8000) — максимум символов контекста
- `CI_SCORE_WEIGHT`, `CI_SOURCE_WEIGHT` — веса в многофакторном приоритете

**Structured Explanation (Task A):**
`explanation` теперь объект, не строка:
```json
{
  "vector": { "raw": 0.74, "normalized": 0.81, "weight": 0.6 },
  "fts": { "raw": 0.51, "normalized": 0.72, "weight": 0.4 },
  "combined": 0.77
}
```

**ADR:** ADR-023 (Min-Max признан временным), ADR-024 (будущий граф pipeline)

## Knowledge Layer (1C)

**Файлы:** `services/knowledge/`

- Хранение метаданных конфигурации 1С в схеме `knowledge` (4 таблицы: `configurations`, `objects`, `fields`, `relations`)
- **Importer:** ETL из 1С через MCP (RSV Data), Full Refresh, запуск `npm run knowledge:import`
- **Service:** Read-only query API: `health()`, `getObject()`, `findObjects()` (ILIKE), `getFields()`
- **Context Builder:** `build()` — поиск, `render()` — форматирование (до 10 полей на объект)
- **Injection:** встроен в `index.js` — до 3 объектов, до 4000 символов, обрезка по границе строки

## Search Provider Architecture (Sprint 3.5.2 — Active Pipeline)

**Файлы:** `services/search/`

Слой абстракции источников данных. Преобразует `QueryContext` в `Candidate[]` для Context Intelligence.

```
QueryContext
  │
  ▼
SearchOrchestrator
  ├── HybridRetrievalProvider (обёртка над retrieval/)
  ├── KnowledgeProvider (обёртка над knowledge/)
  ├── MCPProvider (будущий)
  ├── AcademyProvider (будущий)
  └── MemoryProvider (будущий)
  │
  ▼
Candidate[]
```

| Компонент | Файл | Назначение |
|-----------|------|------------|
| SearchOrchestrator | `index.js` | Сбор кандидатов от всех провайдеров (Promise.allSettled), диагностика |
| BaseSearchProvider | `providers/BaseSearchProvider.js` | Базовый класс: name, method, search(), getCandidates(), health() |
| HybridRetrievalProvider | `providers/HybridRetrievalProvider.js` | Адаптер retrieval → Candidate[] |
| KnowledgeProvider | `providers/KnowledgeProvider.js` | Адаптер knowledge → Candidate[] |

**Pipeline Steps в Diagnostics:** `search_providers`

**Ключевое преимущество:** добавление нового источника не требует изменения CI. Достаточно создать новый Provider с методом `getCandidates()`.

## Knowledge Diagnostics (Sprint 1 — Knowledge Platform v2 → Sprint 3: migrated to `services/diagnostics/`)

**Файлы:** `services/diagnostics/`

Модуль наблюдаемости и трассировки Knowledge Layer.

| Компонент | Файл | Назначение |
|-----------|------|------------|
| DiagnosticsService | `index.js` | Фасад: включение/выключение, создание трейсов, статистика |
| TraceStore | `traceStore.js` | In-memory circular buffer (max 500 трейсов) |
| PipelineTracer | `tracer.js` | Сбор информации об этапах пайплайна, опциональная запись в БД |
| TraceContext | `models/TraceContext.js` | Легковесный контейнер Trace ID (создаётся в начале каждого запроса) |
| PipelineStep | `models/PipelineStep.js` | Унифицированная модель этапа: `id`, `traceId`, `type`, `startedAt`, `finishedAt`, `duration`, `status`, `metadata` |
| PipelineTrace | `models/PipelineTrace.js` | Контейнер трейса с массивом шагов, вычисляемыми метриками и обратной совместимостью |

### Pipeline Step Model

Унифицированная модель для любого этапа любого pipeline:

```js
{
  id: "traceId:rag",
  traceId: "uuid",
  type: "rag",
  startedAt: "ISO 8601",
  finishedAt: "ISO 8601",
  duration: 123,
  status: "success",  // pending | running | success | error | skipped
  metadata: { ... }   // специфичные для этапа данные
}
```

Эта модель не привязана к текущему RAG/KN pipeline. Она подходит для:
- Intent Analysis, Hybrid Search, Reranker, Knowledge Graph
- Programming Agent, MCP, Academy
- Любых будущих pipeline

Добавление нового этапа не требует изменения Diagnostics. Достаточно:
```js
diagnosticsService.startPipelineStep(trace, 'my_step');
// ... business logic ...
diagnosticsService.finishPipelineStep(trace, 'my_step', { customData: true });
```

### Trace ID

Каждый пользовательский запрос получает уникальный Trace ID в самом начале обработки.

Trace ID создаётся через `TraceContext` — легковесный контейнер, доступный даже когда диагностика выключена. Когда диагностика включена, из `TraceContext` создаётся `PipelineTrace`.

Trace ID может использоваться для сквозной трассировки через:
- Programming Agent
- MCP
- Academy
- Workflow Engine
- AIOS Core

**API (admin-only):**

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/admin/knowledge/diagnostics/status` | Статус и статистика |
| POST | `/api/admin/knowledge/diagnostics/toggle` | Включить/выключить |
| GET | `/api/admin/knowledge/diagnostics/traces` | Список трейсов |
| GET | `/api/admin/knowledge/diagnostics/traces/:id` | Детали трейса |
| DELETE | `/api/admin/knowledge/diagnostics/traces` | Очистить трейсы |

**Режимы:**
- **Production (default):** диагностика выключена, ноль накладных расходов
- **Debug:** `KNOWLEDGE_DEBUG_MODE=true` или runtime toggle в админ-панели
- **Per-request:** `?debug=true` в запросе к `/assistant`

**Метрики на трейс:** retrievalDuration, contextBuildDuration, documentsFound, documentsUsed, contextSize, llmDuration

Миграция: `migrations/010_diagnostics_traces.sql`

## MCP

**Файлы:** `services/mcp/`

- Два независимых контура: общий и 1С
- `McpConnectionManager` — жизненный цикл подключения
- `McpClientFactory` — фабрика транспортов (реестр)
- `HttpMcpClient` — HTTP-транспорт (единственный реализованный)
- `McpToolClient` — единый клиент вызова инструментов: `ping()`, `help()`, `config()`, `describe()`, `getStructure()`, `query()`, `executeQuery()`
- При недоступности MCP — `available: false`, pipeline не прерывается

## ProjectContext

**Файл:** `services/projectContext/ProjectContextService.js`

- Единый фасад для получения контекста проекта
- `load(projectId)` — параллельные запросы к `projects`, `messages`, `attachments`, `document_embeddings`
- Все данные из существующих таблиц, никакие новые не создаются (ADR 012)

## PasswordManager

**Файл:** `services/passwordManager.js`

- Валидация пароля (8–100 символов, A-Z, a-z, 0-9)
- bcrypt хеширование (12 раундов)
- Лимит попыток: 5 за 15 минут
- Логирование всех операций в `password_change_logs`
- Запрет повторения последних 5 паролей

## OCR

**Файл:** `services/ocr.js`

- Tesseract.js для распознавания (русский + английский)
- Поддержка JPEG, PNG, WebP до 10MB
- Кэширование результатов (24 часа TTL)
- Автоматическая отправка распознанного текста в модель