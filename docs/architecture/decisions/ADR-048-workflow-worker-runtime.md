# ADR-048: Workflow Worker Runtime

**Status:** Accepted

**Date:** 2026-07-25

## Context

ADR-047 defined the high-level worker architecture for distributed workflow execution. Sprint 9 implements the concrete runtime components. The implementation must provide:

- Worker lifecycle management (STARTING → RUNNING → STOPPING → STOPPED)
- Queue-based work dispatch with enqueue/dequeue/ack/reject
- Lease-based exclusive execution (one workflow = one active worker)
- Periodic heartbeat for liveness detection
- Automatic stuck workflow detection and recovery

## Decision

### 1. Worker Runtime Lifecycle

```
STARTING → RUNNING → STOPPING → STOPPED
```

- **STARTING**: Worker registers itself, initializes dependencies
- **RUNNING**: Poll loop active, heartbeats sent, stuck detection running
- **STOPPING**: Poll and stuck timers cleared, all heartbeats stopped
- **STOPPED**: All resources released, worker inactive

### 2. Queue Contract

```typescript
interface WorkflowQueue {
  enqueue(workflowId: string): Promise<void>
  dequeue(workerId: string): Promise<string | null>
  ack(workflowId: string): Promise<void>
  reject(workflowId: string): Promise<void>
  peek(): Promise<string[]>
}
```

- `enqueue` — idempotent; does not duplicate existing entries
- `dequeue` — returns a workflowId or null if empty; marks as in-flight
- `ack` — removes from in-flight tracking
- `reject` — returns workflowId to the queue for retry

### 3. Lease Model

LeaseManager wraps `WorkflowStorage.acquireLease()`:

- Acquire: tries to claim lease for a workflow; returns `{ status: 'acquired'|'rejected', workflowId, workerId, ttlMs, acquiredAt }`
- Release: releases the lease if owned by this worker
- Renew: extends lease TTL (used by HeartbeatManager)
- Stuck detection: lists workflows with expired heartbeats

One workflow = one active worker enforced by lease acquisition.

### 4. Heartbeat Contract

HeartbeatManager sends periodic heartbeats while a worker holds a lease:

- Interval: leaseTtl / 2 (default 30s for 60s lease)
- Storage heartbeat TTL: leaseTtl (default 60s)
- Starts when lease is acquired, stops when lease is released

### 5. Failure Recovery

**Worker killed during node execution:**
- Lease expires after TTL
- Another worker's stuck detection picks up the workflow
- Worker acquires lease, resumes execution via `WorkflowExecutor.resume()`
- Completed nodes are skipped (idempotent resume)

**Worker killed during approval wait:**
- Same lease expiration + resume mechanism
- Approval state persisted via PostgresApprovalStore
- Worker resumes poll loop and re-checks approval status

**Worker killed during compensation:**
- Compensation state is idempotent
- Resume re-runs compensations for failed nodes only

### 6. Worker Runtime Poll Loop

```
while (running) {
  runningWorkflows = storage.listRunning()
  for each workflow:
    leaseResult = leaseManager.acquire(workflow.id)
    if leaseResult.status != 'acquired': continue
    try:
      heartbeatManager.start(workflow.id)
      result = executor.resume(workflow.id)
      audit('workflow_processed')
    catch:
      audit('workflow_execution_error')
    finally:
      heartbeatManager.stop(workflow.id)
      leaseManager.release(workflow.id)
  sleep(pollIntervalMs)
}
```

### 7. Stuck Detection Sweep

```
every stuckCheckIntervalMs:
  stuckWorkflows = heartbeatManager.detectStuck(ttl * 2)
  for each stuck workflow:
    leaseResult = leaseManager.acquire(stuck.id)
    if not acquired: continue
    try:
      fail the workflow
      audit('stuck_workflow_failed')
    finally:
      leaseManager.release(stuck.id)
```

### 8. Worker Components

```
services/workflow/worker/
├── index.js              — exports
├── WorkerRuntime.js      — main lifecycle manager
├── WorkflowQueue.js      — queue interface + InMemoryWorkflowQueue
├── LeaseManager.js       — lease acquire/release/renew/stuck
└── HeartbeatManager.js   — periodic heartbeat + stuck detection
```

## Consequences

**Positive:**
- Full distributed worker runtime ready for horizontal scaling
- Queue decouples API from execution
- Lease enforcement prevents double execution
- Heartbeat detects worker failures within TTL
- Stuck detection sweeps and fails orphaned workflows
- All components testable with InMemory implementations
- Postgres implementations prepared via existing WorkflowStorage interface

**Negative:**
- Lease TTL must be tuned per deployment (default 60s)
- Poll loop is pull-based; not suitable for sub-second latency
- InMemoryWorkflowQueue is not durable across process restarts

**Mitigations:**
- PostgresWorkflowQueue prepared but not yet implemented
- Lease TTL is configurable via constructor options
- Audit events cover all worker lifecycle transitions

## References

- ADR-047: Workflow Worker Architecture
- ADR-045: Workflow Engine Architecture
- ADR-046: Workflow Runtime Hardening
- Sprint 9 — Distributed Workflow Runtime