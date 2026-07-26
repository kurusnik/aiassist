# ADR-041: MCP Execution Architecture

**Status:** Accepted

**Date:** 2026-07-25

## Context

Sprint 6.2 implements MCP Orchestrator — the central routing and execution layer for MCP tool calls. This ADR defines the internal architecture, provider contract, and integration points.

## Decision

### 1. Architecture Flow

```
QueryPlan.Action
{
  target: "mcp",
  parameters: { toolId: "onec.query" }
}
       │
       ▼
MCPOrchestrator.execute(action, context)
       │
       ├── ToolRegistry.get(toolId) → ToolDefinition
       │
       ├── Permission check (SafetyChecker or inline)
       │
       ├── MCPRouter.resolve(toolDefinition) → Provider
       │
       ├── Provider.execute(executionContext) → raw result
       │
       └── ToolResult.success/failure
```

### 2. MCPOrchestrator

Central execution entry point. Responsibilities:

- Receive `QueryPlan.Action` (or raw `{ parameters: { toolId } }`)
- Resolve `ToolDefinition` from `ToolRegistry`
- Create `MCPExecutionContext`
- Check permissions via `permissionChecker`
- Route to correct provider via `MCPRouter`
- Execute with timeout
- Return `ToolResult`
- Write diagnostics: `tool_resolution`, `permission_check`, `mcp_execution`, `tool_result`

Error handling:
- `TOOL_NOT_FOUND` — toolId not in registry
- `PERMISSION_DENIED` — permission check blocked
- `PROVIDER_NOT_FOUND` — provider not registered in router
- `PROVIDER_TIMEOUT` — execution exceeded timeout
- `PROVIDER_ERROR` — provider execution failure
- `MCP_ORCHESTRATION_ERROR` — unexpected errors

### 3. MCPRouter

Routes `ToolDefinition.provider` to registered provider instance.

API:
- `registerProvider(name, provider)` — register by provider name
- `resolve(toolDefinition)` → `provider` or `null`
- `listProviders()` — list registered provider names
- `hasProvider(name)` — check existence
- `removeProvider(name)` — unregister

No dependency on MCP servers, connections, or transport. Pure routing.

### 4. MCPExecutionContext

Carries execution context for a single MCP call.

Fields:
- `traceId` — diagnostics trace ID
- `action` — original QueryPlan.Action
- `toolDefinition` — resolved ToolDefinition
- `parameters` — action parameters
- `agentContext` — optional agent context (traceId only, no circular dependency)
- `metadata` — additional metadata
- `timeout` — execution timeout
- `retryCount`, `maxRetries` — retry state

Methods: `clone()`, `toJSON()`, `shouldRetry()`, `incrementRetry()`

No imports from agents, knowledge, or query-intelligence.

### 5. MCPProvider Contract

Base provider interface:

```js
class MCPProvider {
  async execute(context) {
    throw new Error('Not implemented');
  }
}
```

- `context` is `MCPExecutionContext`
- Returns raw result `{ success, data, error }`
- Concrete providers: OneCMcpProvider, FilesystemProvider, etc.

### 6. ToolRegistry Dependency

MCPOrchestrator depends on `ToolRegistry` (from `services/tools/`).
ToolRegistry does NOT depend on MCP.

```
tools/    → no dependency on mcp/
mcp/      → imports tools/ToolResult
           → uses tools/ToolRegistry via constructor injection
```

### 7. Diagnostics Integration

Pipeline steps in MCP execution flow:

| Step | Description | Metadata |
|------|------------|----------|
| `tool_resolution` | ToolDefinition lookup | toolId, found |
| `permission_check` | Permission verification | allowed, requiresConfirmation |
| `mcp_execution` | Provider execution | provider, toolId, success, duration |
| `tool_result` | Result packaging | success, toolId, provider |

Additional metadata fields: `toolId`, `tool_id`, `provider`, `execution_id`, `executionId`, `found`, `permissions`.

### 8. No Circular Dependencies

```
agents/      → NOT import mcp/
mcp/         → NOT import agents/
mcp/         → NOT import knowledge/
mcp/         → NOT import query-intelligence/
mcp/         → NOT import programming/
tools/       → NOT import mcp/
```

### 9. Error Code Summary

| Code | When |
|------|------|
| `TOOL_NOT_FOUND` | ToolRegistry.get() returns null |
| `PERMISSION_DENIED` | Permission check returns denied |
| `PROVIDER_NOT_FOUND` | MCPRouter.resolve() returns null |
| `PROVIDER_TIMEOUT` | Execution exceeds timeout |
| `PROVIDER_ERROR` | Provider.execute() throws |
| `MCP_ORCHESTRATION_ERROR` | Unexpected error in orchestrator |

## Consequences

- **Positive:** Clean separation of concerns — orchestrator, router, context, and provider are independent.
- **Positive:** ToolRegistry is the single source of truth for tool definitions.
- **Positive:** Permissions are checked before provider execution.
- **Positive:** Full diagnostics coverage for each MCP call.
- **Positive:** Testable without actual MCP servers (mock provider).
- **Positive:** New providers require only implementing `execute(context)`.
- **Negative:** Extra routing layer vs direct MCP calls — necessary for safety and discovery.
- **Deferred:** Dynamic server discovery, load balancing, circuit breakers, provider health monitoring.

Supersedes: ADR-031 (MCP Orchestrator Foundation)