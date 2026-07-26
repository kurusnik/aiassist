# ADR-032: Agent Runtime Architecture

**Status:** Accepted

**Date:** 2026-07-25

## Context

Sprint 5 introduces a Programming Agent Foundation on top of existing architectural contracts (Query Intelligence, Planning Layer, ExecutionPlan, Diagnostics). Before Sprint 5, each agent (Programming Agent) had its own runtime lifecycle, context model, and result format with no shared contract.

Current state:
- `services/programming/` uses `ProgrammingContext`, `ProgrammingResult`, `ProgrammingTrace` — none are shared
- No common `AgentContext` that bridges `QueryContext` (QI) → `PlanningContext` (Planning) → execution
- No generic `AgentRuntime` that enforces lifecycle: planning validation → safety check → execution → result validation
- No unified `AgentResult` that carries `{ success, output, artifacts, errors, metrics }`
- No safety boundary between planning and execution
- Diagnostics has no agent-specific step types (`agent`, `safety_check`, `result_validation`)

## Decision

### 1. Create Agent Runtime Contract

New module `services/agents/`:

```
services/agents/
 ├── AgentRuntime.js           # Generic runtime: planning validation → safety → execution → validation
 ├── AgentContext.js            # Unified context: traceId, queryContext, planningContext, knowledgeContext, metadata
 ├── AgentResult.js             # Unified result: success, output, artifacts, errors, metrics
 ├── ExecutionPipeline.js       # Orchestrator: ExecutionPlan → AgentRuntime pipeline
 ├── lifecycle/
 │   ├── AgentLifecycle.js      # State machine: CREATED → PLANNING_VALIDATED → SAFETY_CHECKED → EXECUTING → RESULT_VALIDATED → COMPLETED
 │   └── AgentDiagnostics.js    # Diagnostics integration for agent pipeline steps
 └── index.js
```

### 2. ProgrammingAgentAdapter

New file `services/programming/ProgrammingAgentAdapter.js` wraps the existing `ProgrammingService`:

```
AgentContext
  │
  ▼
ProgrammingAgentAdapter.execute(agentContext)
  │
  ├── AgentRuntime (planning validation → safety → execution → validation)
  │
  └── ProgrammingService.executePipeline (unchanged)
      │
      ▼
AgentResult { success, output, artifacts, errors, metrics }
```

Internal business logic of `ProgrammingService` is untouched (ADR 009 — Foundation Frozen).

### 3. ExecutionPipeline

Separate orchestrator that:
- Validates planning context before any execution
- Delegates safety checks to `SafetyChecker`
- Wraps agent execution in `AgentRuntime`
- Validates results before returning

### 4. Knowledge Integration

Programming Agent receives knowledge through:
- `SearchOrchestrator` (`services/search/`) → `HybridRetrievalProvider` + `KnowledgeProvider`
- `AgentContext.queryContext` carries the QueryContext from QI which SearchOrchestrator consumes

No direct `knowledge/service.js` imports from the agent layer.

### 5. Planning Integration

```
QueryContext
  │
  ▼
QueryPlan (from QI)
  │
  ▼
QueryPlanTranslator.translate(queryPlan, taskContext)
  │
  ├── PlanningContext — bridge DTO
  └── ExecutionPlan — step list for programming provider
      │
      ▼
PlanningBridge.buildAgentContext(queryContext)
  │
  ▼
AgentContext → AgentRuntime
```

### 6. Safety Boundary

New module `services/security/`:

```
services/security/
 ├── SafetyChecker.js       # check(action) → { allowed, requiresConfirmation, reason }
 └── index.js
```

- `SafetyChecker.check(action)` — evaluates individual actions
- `SafetyChecker.checkContext(agentContext)` — evaluates planning context safety flags
- Methods return structured result: `{ allowed, requiresConfirmation, reason }`
- Default: all actions allowed (stub implementation)
- Integrated into `AgentRuntime._checkSafety()` and `ExecutionPipeline`

### 7. Diagnostics Update

Extended `PipelineTrace.getComputedMetrics()` with:
- `agentDuration` — time spent in agent execution
- `safetyDuration` — time spent in safety checks

New diagnostics step types: `agent`, `safety_check`, `planning_validation`, `result_validation`

### Full Trace Pipeline (TASK 7)

```
User Query
  │
  ▼ [trace: task_router]
TaskRouter.detect()
  │
  ▼ [trace: query_interpretation, query_intent, query_entities, query_plan]
Query Intelligence → QueryContext
  │
  ▼ [trace: search_providers]
SearchOrchestrator → Candidate[]
  │
  ▼ [trace: quality_gate, dedup, source_coordination, token_budgeting, relevance_prioritization, structured_context]
Context Intelligence
  │
  ▼ [trace: planning_validation]
Planning Bridge → PlanningContext + ExecutionPlan
  │
  ▼ [trace: safety_check]
SafetyChecker
  │
  ▼ [trace: agent]
ProgrammingAgentAdapter (AgentRuntime)
  │
  ▼ [trace: execution]
ProgrammingService.executePipeline()
  │
  ▼ [trace: result_validation]
Result Validation
  │
  ▼
AgentResult → Response
```

## Rationale

### Why a separate Agent Runtime contract?

- **Reusability:** Future agents (Academy, DeFi, Workflow) implement the same contract — `AgentContext` in, `AgentResult` out
- **Lifecycle enforcement:** Every agent passes through planning validation → safety → execution → validation; no agent can skip safety
- **Diagnostics uniformity:** All agents create the same diagnostics step types (`agent`, `execution`, `result_validation`)

### Why wrap, not replace ProgrammingService?

- Foundation Frozen (ADR 009): existing Programming Agent pipeline is stable and tested
- Wrapping adds zero risk to production flow
- Internal `ProgrammingService.executePipeline()` continues to work unchanged

### Why a separate Safety module?

- Single responsibility: `SafetyChecker` is the only place that evaluates safety
- Future implementation: when real permission system exists, only `SafetyChecker.check()` changes
- No change to any agent code

## Consequences

**Positive:**
- All future agents use the same runtime contract
- Safety boundary exists before any execution
- Diagnostics covers full trace: QI → Search → CI → Planning → Agent → Execution → Result
- Programming Agent internal logic is untouched

**Negative:**
- Additional abstraction layer (Adapter pattern) between Agent Runtime and ProgrammingService
- SafetyChecker is stub — no real permission enforcement

**Neutral:**
- PlanningBridge creates AgentContext synchronously
- Existing direct calls to ProgrammingService continue to work

## Migration Path for Future Agents

1. Create adapter in `services/<agent-name>/<AgentName>Adapter.js`
2. Implement `execute(agentContext)` that returns `AgentResult`
3. Register with `ExecutionPipeline`

## Related

- ADR-001: Programming — модуль AiAssist
- ADR-005: Planning before execution
- ADR-007: ExecutionContext
- ADR-008: Execution Pipeline
- ADR-009: Foundation Frozen
- ADR-026: Query Intelligence Layer
- ADR-027: TaskRouter vs Query Intelligence
- ADR-028: Knowledge Intelligence Layer
- ADR-029: Execution Contract — QueryPlan → ExecutionPlan
- ADR-031: MCP Orchestrator Foundation
- `services/agents/`
- `services/security/`
- `services/planning/PlanningBridge.js`
- `services/programming/ProgrammingAgentAdapter.js`