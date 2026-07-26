# ADR-029: Execution Contract — QueryPlan → ExecutionPlan

**Status:** Accepted

**Date:** 2026-07-25

## Context

Sprint 4.x introduced QueryPlan (`services/query-intelligence/models/QueryPlan.js`) as a semantic plan of user intent. Programming Agent uses ExecutionPlan (`services/programming/ExecutionPlan.js`) as a technical step list. These two models are completely unrelated — no shared interface, no translator, no bridge.

Current state:
- QueryPlan has `Action { type, target, parameters, priority }` with targets like `knowledge`, `mcp`, `llm`
- ExecutionPlan has `{ id, taskId, steps[], estimatedComplexity }` with step actions like `collect_metadata`, `build_prompt`, `call_llm`
- QueryPlan is never consumed by the execution pipeline
- ExecutionPlan is never influenced by Query Intelligence

## Decision

### 1. Extend QueryPlan.Action

Add `confidence` and `safety` fields to `Action`:

```
Action {
  type,             // 'retrieve' | 'execute' | 'generate' | 'analyze'
  target,           // 'knowledge' | 'mcp' | 'programming' | 'academy' | 'llm'
  parameters,       // object
  priority,         // number
  confidence,       // number 0..1 or null
  safety: {         // object
    requiresConfirmation,  // boolean
    requiresPermission,    // boolean
    auditLevel             // 'none' | 'observe' | 'confirm' | 'escalate'
  }
}
```

All new fields have safe defaults (`null`, `false`, `'none'`). Existing code is unchanged.

### 2. Create Planning Boundary

New module `services/planning/` serves as the bridge:

```
QueryPlan
  │
  ▼
QueryPlanTranslator.translate(queryPlan, taskContext)
  │
  ├── PlanningContext { queryPlan, executionIntent, actions, confidence, safety }
  └── ExecutionPlan (programming domain)
```

### 3. Update ExecutionPlan

- Add `toJSON()` for diagnostics serialization
- Replace global counter with `crypto.randomUUID()`

## Rationale

### Why a separate Planning layer?

- **Single responsibility:** Query Intelligence understands intent (semantic), Programming Agent executes steps (technical). Planning translates between them.
- **Extensibility:** New agents (Academy, Workflow Engine, MCP Orchestrator) can add their own translators without modifying Query Intelligence or Programming Agent.
- **Safety boundary:** The Planning layer is the natural place to check `safety` metadata before execution proceeds.

### Why not merge QueryPlan and ExecutionPlan?

- Different consumers: QueryPlan is consumed by all downstream modules (query → plan → execute); ExecutionPlan is Programming Agent specific.
- Different lifecycle: QueryPlan is immutable after interpretation; ExecutionPlan is mutable during pipeline execution.
- Different granularity: QueryPlan actions are semantic ("retrieve knowledge"); ExecutionPlan steps are technical ("build_prompt", "call_llm").

## Consequences

**Positive:**
- Clean bridge between Query Intelligence and Execution layers
- Safety metadata flows from query interpretation to execution
- No changes to existing Programming Agent pipeline
- New agents can add translators without modifying core models

**Negative:**
- Additional abstraction layer
- Translator mapping is currently hardcoded (extensible via configuration in future)

**Neutral:**
- Planning layer is optional — existing flow (ProgrammingService.executePipeline) continues unchanged
- Translator is minimal — only maps known QueryPlan action types

## Related

- ADR-026: Query Intelligence Layer
- ADR-027: TaskRouter vs Query Intelligence
- ADR-028: Knowledge Intelligence Layer
- `services/planning/`
- `services/query-intelligence/models/QueryPlan.js`
- `services/programming/ExecutionPlan.js`