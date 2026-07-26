# ADR-044: Human Approval Workflow

**Status:** Accepted

**Date:** 2026-07-25

## Context

Sprint 6.3 implemented policy-based permission evaluation. Policies can require approval (`ConfirmationRequiredRule` → `PermissionDecision.requiresApproval`). However, no mechanism exists to create, track, and resolve approval requests.

Sprint 6.4 adds the human approval workflow foundation without a web UI.

## Decision

### 1. ApprovalRequest

```js
ApprovalRequest {
  id: string,                    // UUID
  action: QueryPlan.Action,      // the action requiring approval
  toolDefinition: ToolDefinition | null,
  agentContext: object | null,   // minimal (traceId only)
  permissionDecision: PermissionDecision,
  status: "pending" | "approved" | "rejected" | "expired" | "cancelled",
  requestedAt: timestamp,
  expiresAt: timestamp | null,
  approvedAt: timestamp | null,
  rejectedAt: timestamp | null,
  approvedBy: string | null,
  rejectionReason: string | null
}
```

Methods: `approve(user)`, `reject(user, reason)`, `expire()`, `cancel()`, `isExpired()`.

### 2. ApprovalStore

In-memory store for ApprovalRequest instances.

```
create(request) → ApprovalRequest
get(id) → ApprovalRequest | null
list(filters) → ApprovalRequest[]
approve(id, user) → ApprovalRequest
reject(id, user, reason) → ApprovalRequest
expire(id) → ApprovalRequest | null
remove(id) → boolean
clear()
expirePending() → number  (auto-expires timed-out requests)
```

Filters: `status`, `tool`, `createdAfter`.

### 3. ApprovalService

High-level service wrapping ApprovalStore.

```
requestApproval(action, context, permissionDecision)
  → { status: "pending", approvalId, request }

approve(requestId, user)
  → { status: "approved", approvalId, approvedBy, approvedAt }

reject(requestId, user, reason)
  → { status: "rejected", approvalId, rejectedBy, rejectionReason }

checkStatus(requestId)
  → { status, approvalId, approvedBy, ... }
```

Default expiration: 5 minutes.

### 4. MCPOrchestrator Pipeline

Updated execution pipeline:

```
tool_resolution
    ↓
permission_check
    ↓
approval_check          ← NEW
    ↓
mcp_execution
    ↓
tool_result
```

When `requiresApproval=true`:
1. `approval_check` diagnostics step starts
2. `ApprovalService.requestApproval()` creates a pending request
3. Diagnostics records: `approvalId`, `approvalStatus`, `approvedBy`
4. Returns `ToolResult.failure("APPROVAL_REQUIRED", ..., { approvalId })`
5. Execution is blocked — mcp_execution does NOT run

### 5. Diagnostics

New PipelineStep type: `approval_check`

Passthrough fields: `approvalId`, `approvalStatus`, `approvalRequired`, `approvedBy`

New computed metrics:
- `approvalCheckDuration` — time spent in approval_check step
- `approvalCreationDuration` — alias for approvalCheckDuration

### 6. PermissionStorage Abstraction

```js
class PermissionStorage {
  async savePolicy(policy)      // Not implemented
  async loadPolicies()          // Not implemented
  async saveApproval(request)   // Not implemented
  async loadApprovals(filters)  // Not implemented
}
```

`InMemoryPermissionStorage` provides concrete in-memory implementation.
PostgreSQL storage deferred to Sprint 7.

### 7. ToolResult Extension

`ToolResult.failure()` extended with optional `details` parameter:

```js
ToolResult.failure(code, message, duration, details)
// → { success: false, error: { code, message, details } }
```

`APPROVAL_REQUIRED` failures include `{ approvalId }` in details.

### 8. Non-Goals (Deferred)

- Web UI for approval/rejection
- User management / authentication
- RBAC integration
- PostgreSQL persistence
- Workflow Engine integration
- Slack/email notification
- Approval escalation chains
- Batch approval

## Consequences

- **Positive:** Complete approval lifecycle without UI — can be driven via API.
- **Positive:** MCPOrchestrator cleanly blocks execution when approval is required.
- **Positive:** Approval decisions are traceable via diagnostics.
- **Positive:** Backward compatible — tools without approval requirements work unchanged.
- **Negative:** No automatic expiry callback — callers must call `checkStatus()` or `expirePending()`.
- **Negative:** In-memory only — restart loses pending approvals.
- **Deferred:** Human-in-the-loop UI.

Supersedes: ADR-036 (partial — extends with concrete approval implementation)