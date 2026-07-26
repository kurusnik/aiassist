# ADR-055: Human Console Security Model

## Status
Accepted

## Context
The platform supports human-in-the-loop approval for sensitive workflow actions. With the addition of a Control Plane and Console backend, a comprehensive security model is needed for operator actions.

Current state:
- ApprovalRequest supports PENDING/APPROVED/REJECTED/EXPIRED/CANCELLED
- ApprovalService manages approval lifecycle
- PostgresApprovalStore provides persistence
- No structured audit for operator actions
- No permission model for the Console

## Decision
Establish a security model for the Human Console with four layers:

### 1. Operator Actions
Every operator action is classified:

| Action | Category | Risk Level | Audit Required |
|--------|----------|------------|---------------|
| approval:list | Read | Low | No |
| approval:read | Read | Low | No |
| approval:approve | Write | High | Yes |
| approval:reject | Write | High | Yes |
| workflow:create | Write | Medium | Yes |
| workflow:start | Write | Medium | Yes |
| workflow:pause | Write | Medium | Yes |
| workflow:resume | Write | Medium | Yes |
| workflow:cancel | Write | High | Yes |
| workflow:terminate | Write | Critical | Yes |
| workflow:retry_node | Write | Medium | Yes |
| workflow:skip_node | Write | High | Yes |
| agent:enable | Write | Medium | Yes |
| agent:disable | Write | High | Yes |
| agent:reload | Write | Medium | Yes |

### 2. Permission Model
```
actor → action → resource → { allowed, requiresApproval }
```
- Authorization is checked at the Control Service boundary
- Every mutating operation requires explicit permission
- Read operations require minimal permission
- High-risk operations may require secondary approval

### 3. Approval Flow
```
Operator initiates action
    │
    ▼
Control Service checks permission
    │
    ├── allowed → execute
    │
    └── approval_required → create ApprovalRequest
        │
        ├── operator approves via Console API → execute
        │
        └── operator rejects → action blocked, audit logged
```

### 4. Audit Trail Requirements
Every operator action MUST contain:
- `actor` — who performed the action
- `timestamp` — when it happened
- `action` — what was done
- `resource` — what was affected
- `decision` — the outcome (allowed/denied/approved/rejected)
- `reason` — why (optional for read, required for deny/reject)

### Console API Security
| Endpoint | Auth Required | Audit |
|----------|--------------|-------|
| GET /approvals/pending | Read | No |
| GET /approvals/:id | Read | No |
| POST /approvals/:id/approve | Write | Yes |
| POST /approvals/:id/reject | Write | Yes |

## Consequences
### Positive
- Clear accountability for all operator actions
- Complete audit trail for compliance
- Risk-based action classification enables future escalation workflows

### Negative
- Additional friction for high-risk operations
- Audit storage grows with each operator action
- Requires operator identity management

## Related ADRs
- ADR-054 (Control Plane Architecture)
- ADR-044 (Human Approval Workflow)
- ADR-036 (Permission & Approval Architecture)