# ADR-031: MCP Orchestrator Foundation

**Status:** Accepted (Deferred)

**Date:** 2026-07-25

## Context

Current MCP architecture has two independent MCP connections:

1. **General MCP** — `connectionManager` + `mcpToolClient` (disabled by default)
2. **1C MCP** — `onecConnectionManager` + `onecToolClient` (shared with Knowledge Importer and Programming Agent)

Problems:
- **No routing layer** — consumers (KnowledgeProvider, ProgrammingAgent.McpProvider, OneCMcpProvider) call the correct connectionManager directly. Adding a new MCP service requires modifying consumer code.
- **No diagnostics** — MCP calls use raw `console.log`/`console.error`. No `startPipelineStep`/`finishPipelineStep`.
- **No QueryPlan integration** — QueryPlan.Action with `target: 'mcp'` cannot be resolved to a specific MCP connection.
- **No unified error handling** — each consumer handles MCP errors differently.

## Decision

Define an MCP Orchestrator layer for Sprint 5, but **do not implement it now**. The ADR establishes:

### Architecture

```
services/mcp/orchestrator/
├── index.js              — McpOrchestrator (facade)
├── router.js             — Route actions to specific MCP connections
└── middleware.js          — Diagnostics, error handling, safety checks
```

### Routing

| QueryPlan.Action.target | Action.type | Routed To |
|------------------------|-------------|-----------|
| `mcp` | `retrieve` | `connectionManager` (general) |
| `mcp` | `execute` | `onecConnectionManager` (1C) |
| `knowledge` | `retrieve` | `onecConnectionManager` (1C) |

### Integration Points

- **Input:** `QueryPlan.Action` with `target: 'mcp'` (from Query Intelligence → Planning layer)
- **Output:** `Candidate[]` (wrapped in provider-specific metadata)
- **Diagnostics:** Every MCP call through `diagnosticsService.startPipelineStep(trace, 'mcp_call')`
- **Safety:** MCP actions with `safety.requiresConfirmation` are intercepted before execution

### What changes for existing consumers

None. Existing code continues to use direct `onecConnectionManager` / `onecToolClient` calls. The Orchestrator is an **additional entry point**, not a replacement.

## Rationale

### Why defer implementation?

- No consumer currently needs multi-MCP routing — only 1C MCP is active
- Programming Agent's `McpProvider` is tightly coupled to `onecConnectionManager` — refactoring it now would add risk before Sprint 5 execution layers
- KnowledgeProvider accesses MCP indirectly through `importer.js` — no direct MCP dependency

### Why define the architecture now?

- Sprint 5 Execution layers (Academy, Workflow Engine) will need multi-MCP routing
- QueryPlan.Action with `target: 'mcp'` is created by QueryPlanTranslator — the Orchestrator is the natural consumer
- Diagnostics instrumentation can be planned without blocking other work

### Why an Orchestrator and not a Provider?

- **Different concern:** Providers return data (Candidate[]). The Orchestrator routes calls to the correct provider.
- **Lifecycle:** Orchestrator manages connection state, retries, timeouts. Providers are stateless.
- **Safety:** Safety checks apply at the orchestrator level, not per-provider.

## Consequences

**Positive:**
- Architecture defined before implementation — no blind spots
- Existing consumers unchanged
- QueryPlan.Action with `target: 'mcp'` now has a destination

**Negative:**
- Implementation is deferred — multi-MCP routing not available until Sprint 5
- Orchestrator will need to resolve connection targets — may require configuration

**Neutral:**
- `services/mcp/orchestrator/` directory does not exist yet — will be created in Sprint 5
- All MCP diagnostics will be added with the Orchestrator implementation

## Related

- ADR-017: MCP Provider Foundation
- ADR-018: MCP Connection Manager
- ADR-019: Real MCP Connection
- ADR-021: MCP Tool Client
- ADR-022: 1C MCP Server Integration
- ADR-028: Knowledge Intelligence Layer
- ADR-029: Execution Contract — QueryPlan → ExecutionPlan
- `services/mcp/`