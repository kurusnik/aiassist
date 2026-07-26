# ADR-035: Tool Registry vs Agent Registry

**Status:** Accepted

**Date:** 2026-07-25

## Context

Sprint 5.5 stabilization surfaced an architectural ambiguity: `AgentRegistry` in `services/agents/` was being considered as a potential home for tool registration and discovery in Sprint 6.

Before Sprint 5.5, the codebase had:
- `AgentRegistry` — register/get/remove/list agents by type string
- No tool registry at all
- MCP tools resolved ad-hoc through `MCPConnectionManager` or direct connection calls

The Sprint 6 roadmap includes:
- **MCP Orchestrator** — routes tasks to MCP tools
- **Tool Registry** — discoverable catalog of available tools and their capabilities
- **Workflow Engine** — orchestrates multi-agent, multi-tool workflows

Without a clear boundary, `AgentRegistry` could grow into a monolithic discovery service for both agents and tools, conflating two fundamentally different concerns.

## Decision

### AgentRegistry

Responsible for **agent lifecycle and execution dispatch**:

| Concern | Detail |
|---------|--------|
| Registration | `register(type, handler)` — handler has `execute(context)` |
| Lookup | `get(type)` — resolve by agent type for runtime execution |
| Lifecycle | Handler wraps `AgentRuntime` which manages CREATED→COMPLETED lifecycle |
| State | Handlers carry runtime state (version, type, active executions) |
| Scope | One AgentRegistry per process |

### ToolRegistry (to be created in Sprint 6)

Responsible for **tool discovery and capability introspection**:

| Concern | Detail |
|---------|--------|
| Registration | `register(toolId, descriptor)` — descriptor has `schema`, `capabilities`, `connection` |
| Discovery | `findByCapability()`, `listTools()`, `getTool()` |
| Capabilities | Declarative metadata: `{ input_schema, output_schema, requires_confirmation, rate_limit }` |
| Connection | References `MCPConnection` or direct function — ToolRegistry does not execute |
| Scope | Global registry, potentially federated across MCP servers |

### Key Differences

| Aspect | AgentRegistry | ToolRegistry |
|--------|--------------|--------------|
| Primary operation | `execute(context)` | `describe()` / `getCapabilities()` |
| Returns | `AgentResult` | Tool metadata / schema |
| Lifecycle | State machine (CREATED→COMPLETED) | Stateless |
| Granularity | Coarse: one type = one agent | Fine: one type = one tool action |
| Orchestration | Workflow Engine calls agents | MCP Orchestrator resolves tools |
| Execution | AgentRuntime handles lifecycle | Tool is called directly by orchestrator |

### Integration Point

The `AgentRegistry` may reference `ToolRegistry` for resolution, but they remain separate modules:

```
Workflow Engine
    ├── AgentRegistry  →  AgentRuntime  →  handler.execute()
    └── MCP Orchestrator  →  ToolRegistry  →  tool.describe()
```

## Consequences

- **Positive:** Clear separation of concerns — agents own lifecycle, tools own capabilities.
- **Positive:** ToolRegistry can be built independently in Sprint 6 without touching AgentRegistry.
- **Positive:** MCP Orchestrator can query ToolRegistry by capabilities without agent lifecycle overhead.
- **Negative:** An agent that wraps a tool (e.g., "MCP Tool Agent") needs both registries — this is handled by the adapter layer, not by merging registries.
- **Non-goal:** ToolRegistry does not replace MCPConnectionManager. Connection lifecycle remains in `services/mcp/`.