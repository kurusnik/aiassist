# ADR-026: Query Intelligence Layer

**Status:** Accepted

**Date:** 2026-07-25

## Context

Before Sprint 4 (Cognitive Layer), the platform needs a defined architectural slot for user query interpretation. Currently:

1. **User queries flow directly** into TaskRouter, then Hybrid Retrieval, Context Intelligence, and Prompt Builder
2. **No structured query object** exists — downstream modules parse raw text independently
3. **Each future module** (Programming Agent, Academy, MCP Orchestrator, Workflow Engine, Memory System) would need to re-parse the same user text, leading to duplicated logic and inconsistent interpretation
4. **No unified contract** exists for representing intent, entities, or execution plans extracted from a query

The layer must be created **without** implementing actual interpretation logic — only the contracts and infrastructure slot.

## Decision

Create `services/query-intelligence/` — an architectural layer between User Input and all downstream pipelines:

```
User Query
  │
  ▼
Query Intelligence Layer
  │
  ▼
Knowledge Platform / Hybrid Retrieval / Context Intelligence
  │
  ▼
Agents (Programming, Academy, MCP, Workflow, Memory)
```

The layer consists of:

### 1. QueryContext
A unified transfer object that carries all interpretation results:

```json
{
  "id": "uuid",
  "rawQuery": "string",
  "intent": { "name": "string", "confidence": 0.0, "parameters": {} },
  "entities": [{ "type": "string", "value": "any", "confidence": 0.0, "source": "string" }],
  "domain": "string|null",
  "language": "ru",
  "confidence": 0.0,
  "queryPlan": { "actions": [] },
  "metadata": {}
}
```

### 2. Intent Model
Represents what the user wants to do. Future types include:

- `search_information` — поиск информации
- `explain_concept` — объяснение концепции
- `execute_action` — выполнение действия
- `modify_code` — изменение кода
- `generate_report` — генерация отчёта
- `learn_topic` — изучение темы
- `analyze_problem` — анализ проблемы

### 3. Entity Model
Represents an extracted entity from the query. Independent of 1C or any domain.

### 4. QueryPlan
A sequence of actions for downstream agents:

```json
{
  "actions": [
    { "type": "search", "target": "knowledge", "parameters": {} },
    { "type": "mcp_call", "target": "onec.query", "parameters": {} }
  ]
}
```

### 5. QueryInterpreter Interface
Contract class with `interpret(queryContext)` method. On current stage returns QueryContext unchanged.

### 6. Configuration
Disabled by default (`QUERY_INTELLIGENCE_ENABLED=false`). When disabled, system behaves identically to pre-Sprint 3.5.

### 7. Diagnostics Integration
`query_interpretation` PipelineStep added to the tracing layer for future observability.

## Rationale

### Why separate from Retrieval?

- **Different concerns:** Retrieval finds relevant documents. Interpretation understands user intent. These are distinct cognitive operations that should evolve independently
- **Different consumers:** QueryContext is consumed by multiple agents, not just retrieval
- **Different lifecycle:** Query interpretation happens once per query; retrieval happens per search source

### Why Intent is not Search?

- A user may ask to "modify the report that shows sales data" — this is not a search query, it's a modification request with a search sub-task. Intent captures the primary action, QueryPlan captures the sub-tasks
- Future agents (Academy, Workflow Engine) need intent, not search results

### Why QueryPlan is needed for agents?

- Agents need more than raw text. They need a structured plan: what to search, what tools to call, what to generate
- QueryPlan allows the interpreter to decompose complex requests into atomic actions
- Without QueryPlan, each agent would have to do its own planning from raw text

## Consequences

**Positive:**

- Future modules consume `QueryContext` instead of parsing raw text
- Clear boundary between interpretation and execution
- No change to existing pipelines when disabled
- Extensible model: new intent types, entity types, and action types can be added without breaking changes

**Negative:**

- Additional abstraction layer adds indirection
- Unused models until actual interpretation is implemented (Sprint 4+)

**Neutral:**

- The layer requires explicit enablement via `QUERY_INTELLIGENCE_ENABLED`

## Future Consumers

| Module | How it uses QueryContext |
|--------|------------------------|
| Programming Agent | Gets pre-parsed plan + entities instead of re-analyzing raw text |
| Academy | Routes to learning modules based on `intent` type |
| MCP Orchestrator | Finds entities (documents, dates) and maps to tool calls |
| Workflow Engine | Decomposes complex queries into workflow steps |
| Memory System | Stores structured query context for future retrieval |

## Related

- ADR-024: Pipeline Topology (future graph support for QueryPlan)
- Sprint 3 Architecture: Query Intelligence Foundation
- `services/query-intelligence/` (all files)