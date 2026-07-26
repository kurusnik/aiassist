# ADR-038: MCP Execution Boundary

**Status:** Accepted

**Date:** 2026-07-25

**Supersedes:** ADR-031 (MCP Orchestrator Foundation)

## Context

Sprint 5 created `McpConnectionManager`, `McpToolClient`, and `McpProvider` for Programming Agent. MCP tools are called ad-hoc through the provider layer.

Before Sprint 6, there is no:
- Centralized MCP Orchestrator
- Tool Registry integration
- Standardized routing from QueryPlan.Action to MCP tool execution
- MCP-specific diagnostics

The architecture needs a clear boundary between:
- Agent (business logic)
- ToolRegistry (capability discovery)
- MCP Orchestrator (routing + execution)
- MCP Provider (connection + transport)

## Decision

### 1. Responsibility Split

```
Agent
  │  requests tool by capability
  ▼
ToolRegistry                  ← Sprint 6 Phase A
  │  resolves toolId → ToolDefinition
  │  ToolDefinition.provider === "mcp"
  ▼
MCP Orchestrator              ← Sprint 6 Phase A (`services/mcp/orchestrator/`)
  │  routes to MCP server
  │  handles: connection, retry, timeout
  ▼
MCP Provider / Connection     ← existing (`services/mcp/`)
  │  transport: HTTP, JSON-RPC
  ▼
External MCP Server (1C, custom)
```

### 2. Entry Point

The MCP Orchestrator accepts:

```
QueryPlan.Action
  ─ or ─
ToolDefinition + parameters

Example QueryPlan.Action:
{
  type: "execute",
  target: "mcp",
  parameters: {
    tool: "get_structure",
    args: { object: "Справочник.Номенклатура" }
  }
}
```

The Orchestrator:

1. Receives `QueryPlan.Action` from Planning Layer or Agent
2. Resolves `Action.parameters.tool` → `ToolDefinition` via ToolRegistry
3. Checks permissions via `SafetyChecker.checkContext()`
4. Routes to correct MCP server (general or 1C) via `McpConnectionManager`
5. Calls `McpToolClient[method](args)`
6. Returns `ToolResult: { success, data, error, duration }`

### 3. ToolDefinition Contract

```js
ToolDefinition {
  id: string,               // "mcp:onec:get_structure"
  name: string,             // "get_structure"
  description: string,      // "Get full structure of a 1C object"
  inputSchema: {            // JSON Schema
    type: "object",
    properties: {
      object: { type: "string", description: "Full object name" }
    },
    required: ["object"]
  },
  outputSchema: {           // JSON Schema
    type: "object",
    properties: {
      fields: { type: "array" },
      tables: { type: "object" }
    }
  },
  permissions: {            // Required safety level
    safetyLevel: "observe", // none | observe | confirm | escalate
    requiresConfirmation: false
  },
  provider: "mcp",          // "mcp" | "internal" | "function"
  mcpServer: "onec",        // "general" | "onec" — which MCP server
  mcpMethod: "get_structure" // method name on McpToolClient
}
```

### 4. ToolResult Contract

```js
ToolResult {
  success: boolean,
  data: any,
  error: {
    code: string,           // "MCP_CONNECTION_ERROR" | "MCP_TIMEOUT" | "MCP_TOOL_ERROR"
    message: string,
    details: object
  } | null,
  duration: number,
  metrics: {
    toolId: string,
    mcpServer: string,
    retryCount: number
  }
}
```

### 5. Agent Uses ToolRegistry (Not MCP Directly)

An agent NEVER imports `McpConnectionManager` or `McpToolClient` directly.

Flow:

```
Agent (via AgentRuntime)
  │  context.planningContext.actions[0] = { type: "mcp", target: "1c", ... }
  ▼
ExecutionPipeline
  │  delegates tool execution to adapter
  ▼
ProgrammingAgentAdapter
  │  calls ToolRegistry.resolve(action) → ToolDefinition
  ▼
ToolRegistry
  │  calls MCP Orchestrator.execute(toolDefinition, args)
  ▼
MCP Orchestrator
  │  calls McpConnectionManager → McpToolClient
  ▼
ToolResult
```

### 6. MCP Orchestrator Location

`services/mcp/orchestrator/` (deferred from ADR-031):

```
services/mcp/orchestrator/
  ├── McpOrchestrator.js     # execute(definition, args) → ToolResult
  ├── McpRouter.js           # route to correct MCP server
  └── McpDiagnostics.js      # MCP-specific diagnostics
```

### 7. No Circular Dependencies

```
agents/        → NOT import mcp/
mcp/           → NOT import agents/
tool-registry/ → imports mcp/orchestrator/, does not import agents/
```

## Consequences

- **Positive:** Agents remain provider-agnostic — they request capabilities, not connections.
- **Positive:** MCP Orchestrator is a standalone module testable without agents.
- **Positive:** ToolRegistry provides a unified discovery interface regardless of whether a tool is MCP, internal, or external.
- **Positive:** Diagnostics can trace each MCP call independently (see ADR-039).
- **Negative:** MCP Orchestrator adds an extra routing layer — direct MCP calls from agents are faster but forbidden.
- **Deferred:** MCP server health monitoring, dynamic tool discovery from MCP servers, MCP subscription/events.