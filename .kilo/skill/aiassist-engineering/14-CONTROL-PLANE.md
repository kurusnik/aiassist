# Control Plane Architecture

## Overview
The Control Plane is the management layer above the Workflow Runtime. It provides structured APIs for workflow lifecycle management, human approvals, agent control, and operational visibility.

## Architecture
```
UI / API Gateway
    │
    ▼
Authorization Layer
    │
    ▼
Control Services
    ├── WorkflowControlService    — Lifecycle: create/start/pause/resume/cancel/terminate
    ├── ApprovalAPI                — Human approvals: list/approve/reject
    ├── ExecutionGraphView         — DAG visualization adapter
    ├── WorkflowTimelineService    — Unified event timeline
    ├── AgentControlService        — Agent registry management
    └── MetricsControlService      — Metrics aggregation
    │
    ▼
Audit Layer
    │
    ▼
Runtime Layer
    ├── WorkflowExecutor
    ├── WorkflowStorage
    ├── EventStore
    └── WorkerRuntime
```

## Control Service Patterns

### Operation Pattern
Every control operation follows:
1. Extract actor from request context
2. Authorize: `authChecker(actor, action, resource)`
3. Validate: input parameters and workflow status
4. Execute: call Runtime (executor/storage/eventStore)
5. Audit: record AuditEvent with actor, action, result
6. Return: structured result with status and timestamp

### Structured Result Format
```javascript
{
  success: boolean,
  workflowId: string,
  status: string,
  actor: string,
  timestamp: string,
  error: string | null
}
```

## Human Console
The Human Console provides operator-facing APIs for:
- **Workflow management**: start, pause, resume, cancel, terminate
- **Node management**: retry, skip
- **Approval management**: list pending, approve, reject
- **Agent management**: enable, disable, reload
- **Observability**: status, timeline, metrics

### Security Model
- Every mutating operation requires actor identity
- Authorization checked at Control Service boundary
- Audit event recorded for every operation
- High-risk operations require reason parameter

## Runtime Management
| Operation | Risk Level | Actor Required | Reason Required |
|-----------|-----------|----------------|-----------------|
| workflow:create | Medium | Yes | No |
| workflow:start | Medium | Yes | No |
| workflow:pause | Medium | Yes | No |
| workflow:resume | Medium | Yes | No |
| workflow:cancel | High | Yes | Yes |
| workflow:terminate | Critical | Yes | Yes |
| workflow:retry_node | Medium | Yes | No |
| workflow:skip_node | High | Yes | Yes |
| approval:approve | High | Yes | No |
| approval:reject | High | Yes | No |
| agent:enable | Medium | Yes | No |
| agent:disable | High | Yes | Yes |
| agent:reload | Medium | Yes | No |

## API Boundaries
```
WorkflowControlService
├── create({ actor, definitionId, input })
├── start({ actor, workflowId })
├── pause({ actor, workflowId, reason })
├── resume({ actor, workflowId })
├── cancel({ actor, workflowId, reason })
├── retryNode({ actor, workflowId, nodeId })
├── skipNode({ actor, workflowId, nodeId, reason })
├── terminate({ actor, workflowId, reason })
├── getStatus({ workflowId })
├── getTimeline({ workflowId })
└── listWorkflows({ status })

ApprovalAPI
├── listPending({ actor, workflowId })
├── getApproval({ actor, id })
├── approve({ actor, id, reason })
└── reject({ actor, id, reason })

AgentControlService
├── listAgents({ actor })
├── getAgentInfo({ actor, type })
├── enable({ actor, type, reason })
├── disable({ actor, type, reason })
└── reload({ actor, type, reason })

MetricsControlService
├── getWorkflowMetrics()
├── getWorkerMetrics()
├── getAgentMetrics()
├── getToolMetrics()
├── getErrorMetrics()
└── getAll()
```