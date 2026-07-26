# Operations Guide

## Production Operations

### Worker Scaling
- Workers are stateless and can be scaled horizontally
- Lease mechanism prevents duplicate execution
- Heartbeat-based failure detection (TTL/3 interval)
- Max concurrent workflows per worker: configurable (default 10)
- Batch size for polling: configurable (default 50)

### Worker Lifecycle
1. Worker starts → registers with worker ID
2. Polls storage for running workflows at interval
3. Acquires lease before execution
4. Sends heartbeats during execution
5. Releases lease on completion/failure
6. Graceful shutdown: stop polling, release all leases

### Incident Recovery

#### Stuck Workflows
- Detected by HeartbeatManager (expired heartbeat)
- Worker marks stuck workflow as FAILED
- Manual retry via ControlService.retryNode()
- Alternatively, resume from paused state after investigation

#### Worker Crash
- Lease TTL expires (default 30s)
- Another worker can acquire lease after expiry
- Workflow resumes from last completed node
- Node state is persisted per-node

#### Data Recovery
- Workflow context stored in PostgreSQL (workflow_instances)
- Events stored in workflow_events (append-only)
- Audit events stored in audit_events (append-only)
- Idempotency keys prevent duplicate execution

### Migrations
- Schema changes should be backward-compatible
- Add columns with DEFAULT, not NOT NULL
- New tables should not block existing queries
- Run migrations during low-traffic periods

### Health Checks
Available endpoints:
- `/health` — database connection, lease manager status

### Monitoring

#### Key Metrics
| Metric | Alert Threshold | Action |
|--------|----------------|--------|
| workflow_failure_total | >5 in 5min | Investigate executor errors |
| worker_task_failure | >3 in 5min | Check worker logs |
| workflow_duration_ms avg | >2x baseline | Profile slow nodes |
| workflow_running_total | >100 | Scale workers |
| approval_pending_total | >50 | Review approval backlog |

#### Logging
- Worker lifecycle: start/stop/error
- Workflow execution: start/complete/fail
- Node execution: start/complete/fail/retry
- Approval: request/approve/reject/expire
- Lease: acquire/release/expire
- Audit: all user actions

### Debugging

#### Common Issues
1. **Workflow stuck in RUNNING** — check heartbeat, lease, worker process
2. **Node repeatedly fails** — check handler, input, external dependencies
3. **Approval never resolves** — check ApprovalStore, expiry time
4. **Worker not picking up workflows** — check poll interval, lease availability
5. **Idempotency conflicts** — check idempotency key TTL, cleanup

#### Debug Commands
```javascript
// Check workflow status
control.getStatus({ workflowId })

// View timeline with events + audit
timelineService.getTimeline(workflowId)

// Check agent registry
agentControl.listAgents({ actor: 'debug' })

// View metrics snapshot
metrics.getAll()

// Retry a failed node
control.retryNode({ actor: 'admin', workflowId, nodeId })

// Force-terminate stuck workflow
control.terminate({ actor: 'admin', workflowId, reason: 'stuck' })
```

### Operational Checklist
- [ ] All InMemory adapters replaced with persistent (PostgreSQL)
- [ ] Graceful shutdown implemented (SIGTERM → release lease)
- [ ] Lease TTL configured under load
- [ ] Idempotency keys have TTL and cleanup
- [ ] Audit log has cleanup policy (retention window)
- [ ] Metrics exposed via Prometheus endpoint
- [ ] Healthcheck endpoint responds correctly
- [ ] Worker scaling tested with concurrent workflows
- [ ] Recovery tested: worker crash, lease expiry, stuck workflow
- [ ] Approval expiry tested with pending requests