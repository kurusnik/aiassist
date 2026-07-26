# ADR-049: Postgres Lease & Heartbeat Implementation

**Status:** Accepted

**Date:** 2026-07-25

## Context

Sprint 9 introduced `WorkflowStorage` interface methods for lease and heartbeat operations. `InMemoryWorkflowStorage` implemented them, but `PostgresWorkflowStorage` did not. The database schema (`workflow_leases`, `workflow_heartbeats`) was created in migration 014, but the storage adapter was missing. This ADR documents the SQL contracts for the production PG implementations.

## Decision

### 1. acquireLease

```sql
INSERT INTO workflow_leases (workflow_id, worker_id, acquired_at, expires_at, lease_version)
VALUES ($1, $2, NOW(), NOW() + $3::INTERVAL, 1)
ON CONFLICT (workflow_id) DO UPDATE
SET worker_id = $2, acquired_at = NOW(),
    expires_at = NOW() + $3::INTERVAL,
    lease_version = workflow_leases.lease_version + 1
WHERE workflow_leases.worker_id = $2 OR workflow_leases.expires_at < NOW()
RETURNING CASE
  WHEN xmax = 0 THEN true
  WHEN (workflow_leases.worker_id = $2 OR workflow_leases.expires_at < NOW()) THEN true
  ELSE false
END as acquired
```

- Returns `{ acquired: true/false, workerId, expiresAt }`
- Worker can re-acquire its own lease before expiry
- Expired leases can be stolen

### 2. releaseLease

```sql
DELETE FROM workflow_leases WHERE workflow_id = $1 AND worker_id = $2
```

- Only releases if owned by calling worker

### 3. renewLease

```sql
UPDATE workflow_leases SET expires_at = NOW() + $3::INTERVAL
WHERE workflow_id = $1 AND worker_id = $2
```

- Returns boolean (true if row updated)

### 4. heartbeat

```sql
INSERT INTO workflow_heartbeats (workflow_id, worker_id, status, last_heartbeat, expires_at)
VALUES ($1, $2, 'running', NOW(), NOW() + $3::INTERVAL)
ON CONFLICT (workflow_id)
DO UPDATE SET last_heartbeat = NOW(), expires_at = NOW() + $3::INTERVAL,
              worker_id = $2, status = 'running'
```

### 5. listStuckWorkflows

```sql
SELECT wi.* FROM workflow_instances wi
LEFT JOIN workflow_heartbeats wh ON wh.workflow_id = wi.id
WHERE wi.status IN ('running', 'waiting')
  AND (wh.last_heartbeat IS NULL OR wh.last_heartbeat < NOW() - $1::INTERVAL)
```

## References

- ADR-047: Workflow Worker Architecture
- ADR-048: Distributed Worker Runtime
- Migration 014: workflow_leases, workflow_heartbeats