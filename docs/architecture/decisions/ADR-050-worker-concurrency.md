# ADR-050: Bounded Worker Concurrency

**Status:** Accepted

**Date:** 2026-07-25

## Context

Sprint 9's `WorkerRuntime._poll()` processes all running workflows in a single poll cycle without any concurrency limit. At scale (1000+ running workflows), this causes:
- Event loop starvation during sequential processing
- Lease expiry before workflow completion
- No backpressure on database errors
- Unbounded memory growth

## Decision

### 1. maxConcurrent

Configurable limit on how many workflows a single worker executes simultaneously. Implemented with a semaphore counter.

```javascript
// WorkerRuntime constructor
this.maxConcurrent = options.maxConcurrent || 10;
this._semaphore = 0;
```

When `_semaphore >= maxConcurrent`, the poll loop stops acquiring new leases.

### 2. pollBatchSize

Limit on workflows processed per poll cycle. Prevents a single poll from scanning thousands of workflows.

```javascript
this.pollBatchSize = options.pollBatchSize || 50;
const batch = workflows.slice(0, this.pollBatchSize);
```

### 3. Exponential Backoff

On database errors, the worker backs off before retrying:

```javascript
this._consecutiveErrors = 0;
this._currentBackoff = 0;

// On error:
this._consecutiveErrors++;
this._currentBackoff = Math.min(
  backoffMs * Math.pow(backoffMultiplier, consecutiveErrors - 1),
  maxBackoffMs
);
```

Default: 1s base, 2x multiplier, 60s max.

## Consequences

- Prevents event loop starvation
- Graceful degradation under load
- Prevents tight retry loops on DB failure
- Workers scale linearly with workflow volume

## References

- ADR-048: Distributed Worker Runtime
- Sprint 9 Architecture Audit — Bottleneck #2