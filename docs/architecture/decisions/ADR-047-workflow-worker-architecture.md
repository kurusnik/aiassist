# ADR-047: Workflow Worker Architecture

**Status:** Accepted

**Date:** 2026-07-25

## Context

Sprint 8.5 audit revealed that the Workflow Engine runs in a single process with no separation between API handling and workflow execution. This prevents horizontal scaling, creates a single point of failure, and blocks recovery from crashes during long-running workflows.

Production requires:
- API process and Worker process separation
- Distributed lease-based execution to prevent double-execution
- Queue-based work dispatch
- Heartbeat mechanism for liveness detection
- Stuck workflow recovery

## Decision

### 1. Architecture

```
┌─────────────────┐     ┌──────────────────────┐
│   API Process   │     │  Message Queue (PG)   │
│                 │     │  workflow_leases      │
│  WorkflowAPI    │────▶│  workflow_heartbeats  │
│  Express Router │     └──────────┬───────────┘
└─────────────────┘                │
                                   ▼
                      ┌──────────────────────┐
                      │   Worker Pool         │
                      │                       │
                      │  WorkflowWorker[1..N] │
                      │  Each: poll → lease   │
                      │       → execute       │
                      │       → heartbeat     │
                      └──────────────────────┘
```

### 2. Worker Lifecycle

Worker acquires lease via `workflow_leases` table:
- INSERT with ON CONFLICT on workflow_id
- Check `expires_at` — if expired, any worker can steal
- Lease acquired for TTL (default 60s)
- Worker must heartbeat before TTL/2

```
Poll running workflows
    │
    ▼
Try acquire lease (INSERT ... ON CONFLICT ...)
    │
    ├─ Success → execute → complete → release lease
    │
    └─ Failure (another worker holds lease) → skip
```

### 3. Lease Contract

```sql
-- workflow_leases
workflow_id   UUID PRIMARY KEY
worker_id     VARCHAR(255)
acquired_at   TIMESTAMPTZ
expires_at    TIMESTAMPTZ
lease_version INTEGER

Acquire:
  INSERT INTO workflow_leases (workflow_id, worker_id, acquired_at, expires_at, lease_version)
  VALUES ($1, $2, NOW(), NOW() + INTERVAL '60 seconds', 1)
  ON CONFLICT (workflow_id) DO UPDATE
  SET worker_id = $2, acquired_at = NOW(), expires_at = NOW() + INTERVAL '60 seconds',
      lease_version = workflow_leases.lease_version + 1
  WHERE workflow_leases.expires_at < NOW()
```

### 4. Heartbeat Contract

Worker sends heartbeat every 30s while executing:
```sql
INSERT INTO workflow_heartbeats (workflow_id, worker_id, status, last_heartbeat, expires_at)
VALUES ($1, $2, 'running', NOW(), NOW() + INTERVAL '60 seconds')
ON CONFLICT (workflow_id) DO UPDATE
SET last_heartbeat = NOW(), expires_at = NOW() + INTERVAL '60 seconds', worker_id = $2
```

### 5. Stuck Detection

A background sweep process (or cron) runs every 60s:
```sql
SELECT wi.* FROM workflow_instances wi
LEFT JOIN workflow_heartbeats wh ON wh.workflow_id = wi.id
WHERE wi.status IN ('running', 'waiting')
  AND (wh.last_heartbeat IS NULL OR wh.last_heartbeat < NOW() - INTERVAL '120 seconds')
```

Stuck workflows are:
1. Marked as FAILED
2. Audit event recorded
3. Can be manually resumed

### 6. Worker Process

```js
class WorkflowWorker {
  constructor(options) {
    this.executor = options.executor;
    this.pollInterval = options.pollInterval || 5000;
    this.leaseTtlMs = options.leaseTtlMs || 60000;
    this.workerId = `worker-${crypto.randomUUID().slice(0, 8)}`;
    this.running = false;
  }

  async start() {
    this.running = true;
    while (this.running) {
      await this._poll();
      await sleep(this.pollInterval);
    }
  }

  async stop() {
    this.running = false;
  }

  async _poll() {
    const running = await this.executor.storage.listRunning();
    for (const ctx of running) {
      const acquired = await this.executor.storage.acquireLease(
        ctx.id, this.workerId, this.leaseTtlMs
      );
      if (!acquired) continue;

      // Start heartbeat loop
      this._startHeartbeat(ctx.id);
      try {
        await this.executor.resume(ctx.id);
      } finally {
        this._stopHeartbeat(ctx.id);
        await this.executor.storage.releaseLease(ctx.id, this.workerId);
      }
    }
  }

  _startHeartbeat(workflowId) {
    const interval = setInterval(async () => {
      await this.executor.storage.heartbeat(workflowId, this.workerId, this.leaseTtlMs);
    }, this.leaseTtlMs / 2);
    this._heartbeatTimers.set(workflowId, interval);
  }

  _stopHeartbeat(workflowId) {
    const timer = this._heartbeatTimers.get(workflowId);
    if (timer) {
      clearInterval(timer);
      this._heartbeatTimers.delete(workflowId);
    }
  }
}
```

## Consequences

**Positive:**
- Horizontal scaling: N workers can process workflows
- Fault isolation: worker crash does not take down API
- Recovery: stuck workflows detected and recoverable
- Lease enforcement: prevents double execution

**Negative:**
- Added operational complexity (worker process management)
- Lease TTL tuning required for production
- Workers may need to coordinate for ordered execution

**Mitigations:**
- Lease TTL is configurable per deployment
- Audit events for all lease acquire/release/steal actions
- Prometheus metrics for lease conflicts

## References

- ADR-045: Workflow Engine Architecture
- ADR-046: Workflow Runtime Hardening
- ADR-037: Workflow Execution Boundary
- Sprint 8.5 Audit Report, Section 7: Worker Architecture