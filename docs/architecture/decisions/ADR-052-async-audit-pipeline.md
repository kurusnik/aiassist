# ADR-052: Async Audit Pipeline

**Status:** Accepted

**Date:** 2026-07-25

## Context

All audit events in the Workflow Engine are written synchronously via `await auditService.store.append()`. This places audit writes directly in the hot path of workflow execution. A slow or unavailable audit store blocks the entire workflow pipeline. At scale (100k workflows/day, ~2M audit events/day), this becomes a critical bottleneck.

## Decision

### 1. AuditBuffer

Introduce a buffered audit layer between the execution path and the audit store:

```
WorkflowExecutor / WorkerRuntime
          |
          v
     AuditBuffer
          |
          v (batch flush)
     PostgresAuditStore
```

### 2. Buffer Behavior

```javascript
class AuditBuffer {
  constructor(options) {
    this.store = options.store;        // PostgresAuditStore
    this.flushIntervalMs = 5000;       // flush every 5s
    this.batchSize = 50;               // or when 50 events accumulated
    this._buffer = [];
  }

  async append(event) {
    this._buffer.push(event);
    if (this._buffer.length >= this.batchSize) {
      await this.flush();              // auto-flush at batch size
    }
  }

  async flush() {
    const batch = this._buffer.splice(0, this.batchSize);
    await Promise.all(batch.map(e => this.store.append(e)));
  }
}
```

### 3. Error Handling

- On flush failure, events are re-queued to the front of the buffer
- Buffer does not throw to callers
- Buffer has `start()`/`stop()` lifecycle for periodic flush timer

### 4. Integration

WorkflowExecutor and WorkerRuntime use AuditBuffer instead of direct store.append(). The buffer wraps the store:

```javascript
this.auditBuffer = new AuditBuffer({ store: auditService.store });
this.auditBuffer.start();
```

## Consequences

- Execution path is not blocked by audit latency
- Batched writes reduce database connection pressure
- Event ordering is preserved within batch
- Buffer holds events in memory — risk of loss on crash (acceptable for audit)

## References

- Sprint 9 Architecture Audit — Boundary Review
- ADR-048: Distributed Worker Runtime