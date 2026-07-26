# Sprint 5.6 — Agent Platform Boundary Freeze

## Final Architecture Audit Report

**Date:** 2026-07-25

---

## 1. Executive Summary

Sprint 5.6 completed a full architectural boundary audit across 6 domains in preparation for Sprint 6. The audit examined component boundaries, contract definitions, data flow, and dependency isolation between Agent Runtime, Workflow Engine, Tool Registry, MCP Orchestrator, Permission System, and Diagnostics.

### Key findings

- **7 boundaries verified**, 0 violations found
- **3 new ADRs created** (ADR-037, ADR-038, ADR-039)
- **2 contracts defined**: `ToolDefinition`, `PermissionDecision` DTO
- **3 dependencies confirmed clean**: no circular imports between agents, mcp, security, diagnostics
- **1 gap identified**: `ExecutionGraph` (ADR-039) is deferred to memory-only; DB schema migration deferred to Sprint 7

---

## 2. Architecture Diagram (Updated)

```
Query Intelligence
        │
        ▼
Planning Layer (QueryPlan.Action[])
        │
        ├─────────────────────────────────────────┐
        │                                          │
        ▼                                          ▼
ExecutionPipeline (1 agent)             Workflow Engine (Sprint 6C)
        │                              │  ├── Agent A
        ▼                              │  ├── Agent B (parallel)
AgentRuntime                           │  └── Tool Call
  ├── AgentLifecycle                    │
  ├── SafetyChecker                    │
  └── AgentResult                      │
        │                              │
        ▼                              ▼
  AgentRegistry                   ToolRegistry (Sprint 6A)
                                      │
                                      ▼
                               MCP Orchestrator (Sprint 6A)
                                      │
                                      ▼
                               MCP ConnectionManager
                                      │
                                      ▼
                              External MCP Servers

Security:
  PolicyProvider ← SafetyChecker ← Approval UI (Sprint 6B)

Diagnostics:
  PipelineTrace → ExecutionGraph (ADR-039)
```

---

## 3. Architecture Readiness Score

| Domain | Readiness | Status |
|--------|-----------|--------|
| **AgentRuntime** | ✅ Ready | Single agent, lifecycle, result — Sprint 5.5 stable |
| **AgentContext** | ✅ Ready | `clone()`, `fork()` — Sprint 5.5 complete |
| **AgentResult** | ✅ Ready | Controlled merge, runtime field protection — Sprint 5.5 complete |
| **AgentLifecycle** | ✅ Ready | Enforced state machine, TransitionError — Sprint 5.5 complete |
| **ExecutionPipeline** | ✅ Ready | Delegates to adapter, structured errors — Sprint 5.5 complete |
| **AgentRegistry** | ✅ Ready | register/get/remove/list — Sprint 5.5 complete |
| **Boundary: Runtime vs Workflow** | ✅ Frozen | ADR-037 separates single-agent from multi-agent |
| **ToolRegistry** | 🔲 Not started | Sprint 6 Phase A; contract defined (ToolDefinition) |
| **Boundary: Agent vs ToolRegistry** | ✅ Frozen | ADR-035 + ADR-038: agents never import MCP directly |
| **MCP Orchestrator** | 🔲 Not started | Sprint 6 Phase A; ADR-038 defines entry point |
| **Boundary: ToolRegistry vs MCP** | ✅ Frozen | ADR-038: ToolRegistry resolves, Orchestrator routes |
| **SafetyChecker** | ✅ Ready | `check()`, `checkContext()` — Sprint 5+5.5 stable |
| **PolicyProvider** | 🔲 Stub | Sprint 6 Phase B; interface defined |
| **PolicyStore** | 🔲 Not started | Sprint 7; interface defined in ADR-036 |
| **Approval Workflow** | 🔲 Not started | Sprint 6 Phase B; ADR-036 defines contract |
| **Boundary: Permission** | ✅ Frozen | ADR-036 + PermissionDecision DTO defined |
| **Diagnostics** | ✅ Ready | PipelineStep, PipelineTrace, TraceStore — Sprint 5.5 stable |
| **ExecutionGraph** | 🟡 Model defined | ADR-039; in-memory only; DB persistence deferred |
| **Boundary: Diagnostics Graph** | ✅ Frozen | ADR-039: hierarchical, backward compatible |
| **No circular deps** | ✅ Verified | agents/ → NOT → mcp/; mcp/ → NOT → agents/ |

**Overall readiness: 17/19 components frozen, 2 deferred components defined**

---

## 4. Boundary Decisions

### 4.1 AgentRuntime vs Workflow Engine

| Aspect | AgentRuntime | Workflow Engine |
|--------|-------------|-----------------|
| Scope | 1 agent | N agents + tools |
| Lifecycle | Single state machine | DAG of state machines |
| Context | AgentContext | WorkflowContext (branches) |
| Result | 1 AgentResult | AgentResult[] + WorkflowResult |
| Concurrency | None | Parallel branches, joins |
| Retries | None | Configurable per step |
| Compensation | None | On-failure actions |
| Diagnostics | PipelineStep subgraph | ExecutionGraph root |

**Reference:** ADR-037

### 4.2 AgentRegistry vs ToolRegistry

| Aspect | AgentRegistry | ToolRegistry |
|--------|--------------|--------------|
| Unit | Agent handler (execute) | Tool capability (describe) |
| Key | agentType (string) | toolId (string) |
| Returns | AgentResult | ToolResult |
| Lifecycle | Yes (via AgentRuntime) | No (stateless) |
| Safety | Via AgentRuntime | Via ToolDefinition.permissions |
| Connection | None | MCP Orchestrator |

**Reference:** ADR-035

### 4.3 MCP Orchestrator Entry Point

```
QueryPlan.Action { type, target, parameters }
         │
         ▼
ToolRegistry.resolve(action) → ToolDefinition
         │
         ▼
SafetyChecker.check(action) → PermissionDecision
         │
         ▼
MCP Orchestrator.execute(toolDefinition, args) → ToolResult
```

The orchestrator accepts `QueryPlan.Action` from Planning Layer (when used in pipeline) or `ToolDefinition + args` from ToolRegistry (when used by Workflow Engine).

**Reference:** ADR-038

### 4.4 AgentContext vs WorkflowContext

```
AgentContext:
  traceId          — one agent execution
  queryContext     — from Query Intelligence
  planningContext  — from Planning Layer
  candidates       — search results
  metadata         — arbitrary overrides
  clone()          — shallow copy
  fork(overrides)  — new traceId + overrides

WorkflowContext (future):
  workflowId       — DAG execution
  traceId          — inherited from parent
  branches         — Map<stepId, AgentContext>
  sharedState      — immutable result references
  status           — workflow-level status
```

They are separate classes. `WorkflowContext` contains `AgentContext` instances (one per step) but is NOT a subclass.

### 4.5 Diagnostics Evolution

```
Current (Sprint 5):
  PipelineTrace → PipelineStep[] → linear

Future (Sprint 6):
  ExecutionGraph → ExecutionNode[] + links + subgraphs → hierarchical

Compatibility:
  PipelineTrace IS-A ExecutionGraph (backward compatible)
  PipelineTrace.toJSON() serializes graph
  PipelineTrace.getComputedMetrics() recurses into subgraphs
```

**Reference:** ADR-039

---

## 5. Contract Definitions

### 5.1 ToolDefinition

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
  mcpServer: "onec",        // "general" | "onec"
  mcpMethod: "get_structure"
}
```

### 5.2 ToolResult

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

### 5.3 PermissionDecision DTO

```js
PermissionDecision {
  allowed: boolean,
  reason: string | null,          // Human-readable explanation
  policyId: string | null,        // Matched policy ID
  rulesApplied: string[],         // Policy rule names / IDs
  requiresApproval: boolean,      // true = needs human approval
  approvedBy: string | null,      // User ID who approved (null until approved)
  approvalToken: string | null,   // One-time approval token
  evaluatedAt: timestamp,         // When decision was made
  expiresAt: timestamp | null     // Approval expiry
}
```

The approval flow:

```
Action → SafetyChecker.checkContext()
  → PolicyProvider.evaluate()
    → PermissionDecision { requiresApproval: true }
  → [UI] Present to user
  → User approves → PermissionDecision { approvedBy: "user_id", allowed: true }
  → Execution proceeds
```

---

## 6. New ADR Proposals

| ADR | Title | Status | Key Decision |
|-----|-------|--------|-------------|
| ADR-037 | Workflow Execution Boundary | ✅ Accepted | AgentRuntime = 1 agent; Workflow = N agents + DAG |
| ADR-038 | MCP Execution Boundary | ✅ Accepted | MCP Orchestrator accepts QueryPlan.Action; agents never import MCP directly |
| ADR-039 | Execution Trace Graph | ✅ Accepted | ExecutionGraph replaces linear PipelineStep[]; backward compatible |

---

## 7. Sprint 6 Implementation Order

### Phase A — ToolRegistry + MCP Orchestrator Foundation

**Dependencies:** ADR-035, ADR-038, `ToolDefinition`, `ToolResult`

| Step | Module | Task |
|------|--------|------|
| A1 | `services/tool-registry/` | Create directory, `ToolRegistry` class: `register(toolId, definition)`, `resolve(action)`, `list()`, `findByCapability()` |
| A2 | `services/tool-registry/` | `ToolDefinitionValidator`: validate schema, permissions, provider |
| A3 | `services/mcp/orchestrator/` | `McpOrchestrator.execute(toolDefinition, args)`: connection → call → result |
| A4 | `services/mcp/orchestrator/` | `McpRouter`: route by `mcpServer` field (general vs onec) |
| A5 | `services/mcp/orchestrator/` | `McpDiagnostics`: write `mcp_*` steps to ExecutionGraph |
| A6 | Integration | Wire ToolRegistry into ExecutionPipeline adapter flow |

**Risk:** MCP server tool discovery (dynamic tool listing) is deferred — Phase A uses static registration only.

### Phase B — Real PolicyProvider

**Dependencies:** ADR-036, `PermissionDecision` DTO

| Step | Module | Task |
|------|--------|------|
| B1 | `services/security/` | Replace `PolicyProvider` stub with rule evaluation engine |
| B2 | `services/security/` | Implement `PolicyStore` (in-memory): CRUD policies, priority ordering |
| B3 | `services/security/` | `PermissionDecision` builder: evaluate policies → produce decision |
| B4 | `frontend` | Approval UI dialog: show action details, collect approve/reject |
| B5 | Integration | Wire approval flow: SafetyChecker → PermissionDecision → UI → re-execution |

**Risk:** Approval token expiry and long-running approval dialogs are out of scope — Phase B uses synchronous approval only.

### Phase C — Workflow Engine Foundation

**Dependencies:** ADR-037, ADR-039, Phase A (ToolRegistry), Phase B (Permission)

| Step | Module | Task |
|------|--------|------|
| C1 | `services/workflow/` | `WorkflowDefinition` model: steps, dependencies, retries, compensation |
| C2 | `services/workflow/` | `WorkflowEngine.execute(definition, context)`: topological sort, parallel dispatch |
| C3 | `services/workflow/` | `WorkflowContext`: branches, sharedState, step result references |
| C4 | `services/workflow/` | Step executor: dispatch to `AgentRuntime` (agent steps) or `ToolRegistry` (tool steps) |
| C5 | `services/workflow/` | Retry handler: configurable retries, backoff, timeout |
| C6 | `services/workflow/` | Compensation: on-failure rollback steps |
| C7 | Diagnostics | `ExecutionGraph` integration: hierarchical traces, link recording |

**Risk:** Workflow persistence (pause/resume, long-running) is deferred — Phase C is in-memory only.

### Order Rationale

```
Phase A ──→ Phase B ──→ Phase C
   │            │            │
   ▼            ▼            ▼
ToolRegistry   Policy        Workflow
MCP Orch.      Approval      Engine
```

- **Phase A first:** ToolRegistry and MCP Orchestrator are foundational — Workflow Engine depends on ToolRegistry.
- **Phase B before C:** Workflow Engine needs permission decisions for each step.
- **Phase C last:** Workflow Engine depends on everything above.

---

## 8. Risks

| ID | Risk | Impact | Mitigation |
|----|------|--------|------------|
| R1 | MCP dynamic tool discovery not implemented | Tools must be registered statically | Acceptable for Sprint 6; dynamic discovery deferred |
| R2 | Approval UI not ready when SafetyChecker returns `requiresConfirmation` | Agent blocked until UI exists | Phase B implements UI; Phase A safety defaults to `observe` |
| R3 | Workflow Engine without persistence | No pause/resume across restarts | In-memory only for Sprint 6; persistence Sprint 7 |
| R4 | ExecutionGraph in-memory only | Graph lost on restart | Acceptable; DiagnosticsService is already in-memory (500 traces) |
| R5 | AgentRegistry and ToolRegistry both grow | Scope creep | ADR-035 freezes boundary; code review enforces separation |

---

## 9. Summary of Artifacts

| Artifact | Location |
|----------|----------|
| ADR-037: Workflow Execution Boundary | `docs/architecture/decisions/ADR-037-workflow-execution-boundary.md` |
| ADR-038: MCP Execution Boundary | `docs/architecture/decisions/ADR-038-mcp-execution-boundary.md` |
| ADR-039: Execution Trace Graph | `docs/architecture/decisions/ADR-039-execution-trace-graph.md` |
| ToolDefinition contract | Defined in ADR-038 §3 |
| ToolResult contract | Defined in ADR-038 §4 |
| PermissionDecision DTO | Defined in this report §5.3 |
| AgentContext vs WorkflowContext | Defined in ADR-037 §5 |
| ExecutionGraph model | Defined in ADR-039 §1 |
| Sprint 6 roadmap | This report §7 |