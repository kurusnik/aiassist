# ADR-033: Agent Registry Architecture

**Status:** Accepted

**Date:** 2026-07-25

## Context

Sprint 5 (Programming Agent Foundation) created a single agent adapter (`ProgrammingAgentAdapter`) that wraps `ProgrammingService` into the `AgentRuntime` contract. The adapter was manually instantiated and passed as an inline closure to `AgentRuntime.execute()`.

Before this ADR:
- No central registry of available agents
- Each adapter must be instantiated and wired manually
- `ExecutionPipeline` received the adapter directly — no way to resolve by type
- `AgentRuntime` received the handler as a closure — no way to look up by type
- Adding a new agent required modifying pipeline orchestration code

Future agents (Academy Agent, MCP Orchestrator Agent, Workflow Engine) need a predictable way to register, discover, and resolve agents by type.

## Decision

### 1. Create AgentRegistry

New file `services/agents/AgentRegistry.js`:

```js
class AgentRegistry {
  register(type, handler)     // Register agent by type string
  get(type)                  // Resolve handler by type
  remove(type)               // Unregister agent
  has(type)                  // Check if type exists
  list()                     // List all registered agents with metadata
  count()                    // Number of registered agents
  clear()                    // Clear all registrations
}
```

- `type` — string identifier like `'programming'`, `'academy'`, `'workflow'`
- `handler` — object with `execute(agentContext)` method (the adapter)

### 2. AgentRuntime resolves handlers via Registry

`AgentRuntime.execute(context, handlerOrType)` now accepts both:
- **Handler function** (backward compatible) — `async (ctx) => AgentResult`
- **String type** — resolved via `this.registry.get(type)`

When a string type is passed, the runtime looks up the handler from the registry:
```js
handler = this.registry.get(handlerOrType);
```

### 3. AgentContext contract fixed

`AgentContext` carries:
- `traceId` — unique request trace
- `queryContext` — from Query Intelligence
- `planningContext` — from Planning layer (QueryPlanTranslator)
- `candidates` — array of context candidates (from Search + CI)
- `metadata` — extensible metadata object

**AgentRuntime does NOT call** Search, Knowledge, or Retrieval services directly. These are external to the runtime lifecycle.

### 4. AgentResult schema version

`AgentResult.schemaVersion = 'agent-result-v1'`. Serialized in `toJSON()`.

### 5. AgentRuntime type tracking

`AgentRuntime` now tracks `this.type` — set at construction. The type is propagated to metrics and diagnostics.

## Rationale

### Why a Registry and not a Map?

- Registry provides validation (`register` rejects duplicates, validates handler shape)
- Registry provides metadata (`list()` returns name/version/type for each agent)
- Single source of truth for agent inventory

### Why dual handler resolution (function OR string)?

- Inline closures work for simple cases (current ProgrammingAgentAdapter)
- Registry resolution enables decoupled agent instantiation (Academy Agent can be loaded independently)
- Backward compatible — existing code works without a registry

### Why AgentContext.candidates instead of knowledgeContext?

- `knowledgeContext` was ambiguous — implied a single knowledge source
- `candidates` aligns with SearchProvider → Context Intelligence output (Candidate[])
- AgentRuntime never calls Search/Knowledge/Retrieval — it only reads pre-collected candidates

## Consequences

**Positive:**
- Central registry for all agents — discoverable and countable
- Runtime can resolve agents by type without direct instantiation
- AgentContext contract is now explicit about what the runtime consumes vs. what it doesn't
- AgentResult is versioned — future schema changes are traceable
- AgentRuntime supports both inline and registry-based handler resolution

**Negative:**
- Adapters must explicitly set `runtime.type` for registry metadata
- Registry adds a validation layer (duplicate type detection)

**Neutral:**
- Existing ProgrammingAgentAdapter works unchanged (inline handler)
- Registry is optional — `AgentRuntime` without registry works as before

## Related

- ADR-032: Agent Runtime Architecture
- `services/agents/AgentRegistry.js`
- `services/agents/AgentRuntime.js` (execute resolution changes)
- `services/agents/AgentContext.js` (candidates field)
- `services/agents/AgentResult.js` (schemaVersion)
- `services/security/PolicyProvider.js` (safety extension point)