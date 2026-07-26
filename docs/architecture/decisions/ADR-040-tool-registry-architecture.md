# ADR-040: Tool Registry Architecture

**Status:** Proposed

**Date:** 2026-07-25

## Context

Sprint 6 introduces centralized tool management. Without a Tool Registry, MCP Orchestrator and agents would resolve tools ad-hoc, creating tight coupling between tool resolution and execution.

## Decision

### 1. ToolRegistry

Central registry for all tool definitions. Uses `Map<id, ToolDefinition>`.

API:
- `register(tool)` — register a ToolDefinition (fails on duplicate)
- `get(id)` — resolve tool by ID
- `has(id)` — check existence
- `remove(id)` — unregister
- `list()` — return all registered tools
- `clear()` — reset registry

### 2. ToolDefinition

Immutable definition object:

```js
{
  id: string,
  name: string,
  description: string,
  inputSchema: object | null,
  outputSchema: object | null,
  permissions: object | null,
  provider: string,
  metadata: object,
  version: string,
  createdAt: timestamp
}
```

### 3. ToolValidator

Validates ToolDefinition completeness and schema correctness before registration.

### 4. ToolResult

Standardized execution result:

```js
{
  success: boolean,
  data: any,
  error: { code: string, message: string } | null,
  duration: number,
  metrics: object | null
}
```

## Consequences

- **Positive:** Single discovery interface regardless of provider type (MCP, internal, function).
- **Positive:** Enforces validation before registration.
- **Positive:** Layered architecture — ToolRegistry does not depend on MCP.
- **Deferred:** Dynamic tool discovery from MCP servers, tool versioning, tool health monitoring.

Supersedes: ADR-035 (partial — tool registry vs agent registry split)