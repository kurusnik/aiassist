# ADR-051: Idempotency Store Architecture

**Status:** Accepted

**Date:** 2026-07-25

## Context

Sprint 8.5 added idempotency keys to WorkflowAPI, but they were stored in an in-memory Map. This means:
- All idempotency state is lost on API process restart
- Duplicate workflow starts can occur after crash
- No TTL expiration for stale keys
- Cannot share idempotency state across API instances

## Decision

### 1. IdempotencyStore Interface

```typescript
interface IdempotencyStore {
  check(key: string): Promise<{ workflowId: string, createdAt: number } | null>
  store(key: string, workflowId: string, ttlMs?: number): Promise<void>
  removeExpired(): Promise<number>
  clear(): Promise<void>
}
```

### 2. PostgresIdempotencyStore

Uses `workflow_idempotency_keys` table:

```sql
CREATE TABLE workflow_idempotency_keys (
  key VARCHAR(255) PRIMARY KEY,
  workflow_id UUID REFERENCES workflow_instances(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);
```

- `check()` returns the workflowId if key exists and not expired
- `store()` inserts with ON CONFLICT DO NOTHING
- Default TTL: 24 hours
- `removeExpired()` cleanup for cron/sweep

### 3. API Integration

WorkflowAPI accepts optional `idempotencyStore`. Falls back to in-memory Map if not provided.

```javascript
this.idempotencyStore = options.idempotencyStore || null;
this._inMemoryIdempotency = new Map();
```

## Consequences

- Idempotency survives API restart
- Works across multiple API instances
- Stale keys cleaned up automatically
- Backward compatible (falls back to in-memory)

## References

- ADR-048: Distributed Worker Runtime
- Sprint 9 Architecture Audit — C-4