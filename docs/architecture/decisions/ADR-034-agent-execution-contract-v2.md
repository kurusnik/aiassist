# ADR-034: Agent Execution Contract v2

**Status:** Accepted

**Date:** 2026-07-25

**Supersedes:** ADR-032 (Agent Runtime Architecture § AgentContext/AgentResult sections)

## Context

Sprint 5.5 stabilization audit identified four contract-level defects in the Agent Execution layer:

1. **AgentResult integrity** — `Object.assign(result, executionResult)` destroyed runtime-owned metadata (`executionId`, `duration`, `lifecycle`, `agentType`, runtime metrics).
2. **AgentContext immutability** — No `clone()` or `fork()` meant concurrent agents in a workflow would share mutable context references.
3. **Lifecycle enforcement** — `AgentLifecycle.transition()` only checked state existence, not transition validity. `COMPLETED → EXECUTING` was legal.
4. **Structured errors** — Pipeline threw bare `Error()` objects that never reached `AgentResult.errors` with typed codes.

Before Sprint 5.5, these contracts existed but were incomplete — they worked for a single-agent, single-execution scenario but failed under concurrent, multi-agent, or pipeline-orchestrated scenarios planned for Sprint 6.

## Decision

### 1. AgentResult: Controlled Merge with Runtime-Owned Protection

`AgentResult.merge(source)` replaces `Object.assign(result, source)`:

```js
const RUNTIME_OWNED_FIELDS = [
  'executionId', 'lifecycle', 'duration',
  'agentType', 'agentName', 'agentVersion',
  'pipelineDuration', 'pipelineName'
];

merge(source) {
  this.success = source.success ?? this.success;
  if (source.output !== undefined) this.output = source.output;
  if (Array.isArray(source.artifacts)) this.artifacts.concat(source.artifacts);
  if (Array.isArray(source.errors)) this.errors.concat(source.errors);
  if (source.metrics) {
    this.metrics = { ...this.metrics, ...source.metrics,
      ...pick(this.metrics, RUNTIME_OWNED_FIELDS) };
  }
}
```

Runtime writes its metadata *after* merge via `_finish()`, ensuring agent-contributed fields never overwrite runtime metadata.

### 2. AgentContext: Immutable Base with Fork/Clone

- `clone()` returns a shallow copy sharing `queryContext`/`planningContext` references but with independent `candidates` and `metadata`.
- `fork(overrides)` returns a new context with a new `traceId`, preserving `queryContext` from the parent while allowing `planningContext`, `candidates`, `metadata`, and `_internal` overrides.
- All arrays (`candidates`) are copied, not shared.

### 3. AgentLifecycle: Enforced State Machine

`transition()` now calls `canTransition()` first and throws `TransitionError` on invalid transitions.

Valid transitions:

```
CREATED → PLANNING_VALIDATED → SAFETY_CHECKED → EXECUTING → RESULT_VALIDATED → COMPLETED
    ↓           ↓                  ↓              ↓               ↓
  ERROR       ERROR              ERROR          ERROR           ERROR
```

Terminal states (`COMPLETED`, `ERROR`) accept no forward transitions.

### 4. Structured Error Model

Pipeline errors carry typed codes:

| Code | Meaning |
|------|---------|
| `PLANNING_INVALID` | Planning context missing or rejected by adapter |
| `SAFETY_BLOCKED` | Safety check rejected execution |
| `EXECUTION_FAILED` | Agent handler threw or returned error |
| `RESULT_INVALID` | Result validation failed |

All errors are appended to `AgentResult.errors` as `{ code, message, details? }` objects.

## Consequences

- **Positive:** Runtime metadata is never lost during agent execution.
- **Positive:** Workflow can safely `fork()` contexts for concurrent agents.
- **Positive:** Invalid lifecycle transitions are caught at development time.
- **Positive:** Downstream consumers can switch on error codes instead of parsing messages.
- **Negative:** Existing code that relied on `Object.assign` to overwrite runtime metadata will break — this is intentional.
- **Migration:** `merge()` is backward-compatible for agent output; agents never needed to write runtime fields before this ADR.