# ADR-054: Workflow Control Plane Architecture

## Status
Accepted

## Context
The Workflow Engine has reached production readiness with a distributed Runtime layer (WorkerRuntime, LeaseManager, HeartbeatManager, IdempotencyStore, AuditBuffer). However, there is no structured layer between the external API/UI and the internal execution engine.

Direct access to WorkflowExecutor and WorkflowStorage from API endpoints leads to:
- No consistent authorization enforcement
- No audit trail for user actions
- No input validation layer for control operations
- Tight coupling between API shape and internal implementation

A Control Plane is needed as an intermediary layer.

## Decision
Introduce a **Workflow Control Plane** — a dedicated layer between the API surface and the Runtime:

```
UI / API Gateway
    │
    ▼
Workflow Control Service
    │
    ├── Authorization
    ├── Audit
    ├── Validation
    └── Metrics
    │
    ▼
Workflow Runtime
    ├── WorkflowExecutor
    ├── WorkflowStorage
    ├── EventStore
    └── WorkerRuntime
```

### Key Principles
1. **No direct Runtime access from API** — all operations go through Control Service
2. **Every operation has an actor** — enforced at the Control layer
3. **Every operation is audited** — AuditEvent created before/after Runtime call
4. **Structured results** — all methods return `{ success, workflowId, status, actor, timestamp }`
5. **Authorization first** — permission check before any state mutation

### Control Plane Components
| Component | Responsibility |
|-----------|---------------|
| WorkflowControlService | Lifecycle management (create/start/pause/resume/cancel/terminate) |
| ApprovalAPI | Human approval operations (list/approve/reject) |
| ExecutionGraphView | Graph adaptation for UI consumption |
| WorkflowTimelineService | Merged timeline from events + audit + traces |
| AgentControlService | Agent registry management (list/enable/disable/reload) |
| MetricsControlService | Metrics aggregation (workflow/worker/agent/tool/error) |

### Operation Pattern
Every control operation follows:
1. Extract actor from request context
2. Authorize: `authChecker(actor, action, resource)`
3. Validate: input parameters and workflow status
4. Execute: call Runtime (executor/storage/eventStore)
5. Audit: record AuditEvent with actor, action, result
6. Return: structured result with status and timestamp

## Consequences
### Positive
- Clear security boundary between API and Runtime
- Consistent audit trail for all user actions
- Runtime can remain focused on execution logic
- Future Console UI has a single integration point

### Negative
- Additional layer increases latency for each operation
- Requires maintaining parallel abstractions

## Related ADRs
- ADR-045 (Workflow Engine Architecture)
- ADR-044 (Human Approval Workflow)
- ADR-037 (Workflow Execution Boundary)