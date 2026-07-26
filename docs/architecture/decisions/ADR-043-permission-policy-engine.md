# ADR-043: Permission Policy Engine

**Status:** Accepted

**Date:** 2026-07-25

## Context

Sprint 6.3 replaces the stub `PolicyProvider` with a full permission policy engine. The engine must support rule-based evaluation, policy storage, and integration with the MCP execution pipeline.

## Decision

### 1. PermissionDecision

Standardized decision DTO used across all permission checks.

```js
PermissionDecision {
  allowed: boolean,
  reason: string | null,
  policyId: string | null,
  rulesApplied: RuleResult[],
  requiresApproval: boolean,
  approvedBy: string | null,
  approvalToken: string | null,
  evaluatedAt: timestamp,
  expiresAt: timestamp | null
}
```

Static factories: `PermissionDecision.allow()`, `.deny()`, `.approvalRequired()`.

### 2. PolicyStore

In-memory store for policy definitions.

```js
Policy {
  id: string,
  name: string,
  description: string,
  rules: Rule[],
  enabled: boolean,
  priority: number
}
```

Policies are sorted by priority (highest first) during evaluation.

### 3. PolicyProvider

Evaluates actions against registered policies.

```
PolicyProvider.evaluate(action, context) → PermissionDecision
```

Algorithm:
1. Load enabled policies from PolicyStore, sorted by priority
2. For each policy, evaluate its rules in order
3. **DenyRule** match → immediate `PermissionDecision.deny()`
4. **ConfirmationRequiredRule** match → `PermissionDecision.approvalRequired()`
5. **AllowRule** match → mark as matched, continue evaluation
6. No restrictive rules matched → `PermissionDecision.allow()`
7. No policies at all → default decision (allow)

Deny rules take precedence over all other rules (deny-first).

### 4. Rule Types

| Rule | Effect | Precedence |
|------|--------|------------|
| `DenyRule` | Blocks execution | Highest — immediate deny |
| `ConfirmationRequiredRule` | Requires approval | Medium — sets requiresApproval |
| `AllowRule` | Explicitly allows | Lowest — fallback |

Each rule has:
- `name`, `description`
- `conditions: { targetTools[], actionTypes[], targets[] }`
- `evaluate(action, context) → { matched: boolean, reason: string | null }`

### 5. MCP Integration

MCPOrchestrator._checkPermission() now:
1. Calls `permissionChecker.evaluate(action, context)` → `PermissionDecision`
2. If `decision.allowed === false` → `ToolResult.failure("PERMISSION_DENIED", reason)`
3. Diagnostic step `permission_check` records: `allowed`, `requiresApproval`, `permissionPolicyId`, `permissionRulesApplied`, `permissionDecision`

Backward compatible — supports old `permissionChecker.check()` via adapter.

### 6. Diagnostics

New passthrough fields:
- `permissionPolicyId` — matched policy ID
- `permissionRulesApplied` — array of { rule, policy, reason }
- `permissionRequiresApproval` / `requiresApproval` — approval flag
- `permissionDecision` — "allowed" | "denied"

New computed metric: `policyEvaluationDuration`.

### 7. Non-Goals (Deferred)

- UI approval dialogs
- Workflow Engine integration
- Human-in-the-loop
- Database persistence for policies
- Role-based access control (RBAC)
- Policy combinatorics / conflict resolution beyond deny-first
- Policy audit log persistence (relies on PipelineTrace)

## Consequences

- **Positive:** Fully replaceable stub PolicyProvider with rule-based engine.
- **Positive:** Clear deny-first semantics — safety-critical tools cannot be accidentally allowed.
- **Positive:** Backward compatible — MCPOrchestrator handles both evaluate() and legacy check().
- **Positive:** Rules are isolated, testable units.
- **Negative:** In-memory only — policies reset on restart.
- **Negative:** No wildcard/pattern matching in targetTools (exact match or prefix only).

Supersedes: ADR-036 (Permission & Approval Architecture — partial, adds concrete implementation)