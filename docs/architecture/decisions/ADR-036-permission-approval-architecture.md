# ADR-036: Permission & Approval Architecture

**Status:** Accepted

**Date:** 2026-07-25

## Context

Sprint 5 introduced a `SafetyChecker` with two execution paths:

1. `check(action)` — evaluates a single action object
2. `checkContext(agentContext)` — evaluates `QueryPlan.Action` instances inside `PlanningContext`

Both paths support three safety levels:
- `none` — always allowed
- `observe` — allowed, but logged
- `confirm` — allowed only after user confirmation
- `escalate` — requires admin/supervisor approval

However, Sprint 5.5 audit revealed:
- No persistent policy storage — confirmation requirements are hardcoded arrays
- No approval workflow — `requiresConfirmation=true` is returned but no mechanism exists to collect and apply user approval
- No audit trail — safety decisions are not persisted
- `PolicyProvider` is a stub returning `{ allowed: true }` with no rule evaluation

## Decision

### 1. Policy Storage (Foundation)

Policy storage is defined as an interface, not yet implemented:

```js
class PolicyStore {
  async getPolicies(actionType, context) → Policy[]
  async setPolicy(policy) → void
  async removePolicy(policyId) → void
}
```

Policies are stored as:

```json
{
  "id": "uuid",
  "actionType": "database.execute",
  "condition": { "role": "admin", "resource": "production" },
  "effect": "allow" | "deny" | "confirm" | "escalate",
  "priority": 100,
  "createdAt": "ISO8601"
}
```

Initial implementation uses an in-memory store; PostgreSQL-backed store is deferred to Sprint 7.

### 2. Policy Evaluation

`SafetyChecker` evaluates policy in this order:

1. If `PolicyProvider` is configured, delegate to `provider.evaluate(action, context)`
2. Fall back to built-in `PlanningContext.safety` flag inspection
3. Fall back to static `confirmationRequired` list
4. Default to `{ allowed: true }`

Evaluation returns:

```js
{
  allowed: boolean,
  requiresConfirmation: boolean,
  reason: string | null,
  rulesApplied: string[]  // policy IDs or rule names
}
```

### 3. Approval Workflow (Interface)

`SafetyChecker.checkContext()` returns `requiresConfirmation: true`. The caller (ExecutionPipeline or Orchestrator) is responsible for:

1. Detecting `requiresConfirmation` in the result
2. Presenting action details to the user
3. Collecting approval/rejection
4. Re-executing with `approved: true` in metadata

The approval workflow is not implemented in Sprint 5.5 — this ADR defines the contract:

```
Pipeline.execute()
  → safety_check: requiresConfirmation=true
  → return structured result with SAFETY_BLOCKED error
  → [OUTSIDE] User approves
  → Pipeline.execute() with metadata.approved=true
  → safety_check: allowed=true (conditional on approval flag)
```

### 4. Audit Trail

Every safety decision produces an audit entry:

```js
{
  traceId: string,
  actionType: string,
  actionTarget: string,
  decision: 'allowed' | 'blocked' | 'confirmed',
  reason: string | null,
  rulesApplied: string[],
  timestamp: ISO8601
}
```

Audit entries are stored in the existing `PipelineTrace` as a `safety_check` step with `metadata` containing the full decision record.

### 5. Connection to Existing Contracts

```
QueryPlan.Action.safety
    ↓
PlanningContext.safety  (extracted during planning)
    ↓
SafetyChecker.checkContext(agentContext)
    ↓
  ├─ allowed=false → AgentResult.errors: [{ code: 'SAFETY_BLOCKED' }]
  ├─ requiresConfirmation=true → AgentResult.errors: [{ code: 'SAFETY_BLOCKED', requiresConfirmation: true }]
  └─ allowed=true → proceed to execution
```

## Consequences

- **Positive:** Clear separation between detection (SafetyChecker), storage (PolicyStore), and resolution (Approval Workflow).
- **Positive:** Audit trail is implicit via existing Diagnostics pipeline — no new persistence infrastructure needed.
- **Positive:** `PolicyProvider` stub can be swapped for a full implementation without changing `SafetyChecker`.
- **Negative:** Approval workflow is not implemented — Sprint 6 MCP Orchestrator must implement the user-facing approval dialog.
- **Negative:** Policy evaluation is linear (provider → flags → static → default). Rule conflict resolution (most specific wins, priority ordering) is deferred.
- **Deferred to Sprint 7:** PostgreSQL PolicyStore, RBAC role resolution, policy priority/combinatorics, escalation workflows with timeout escalation.