# ADR-056: Runtime Observability Model

## Status
Accepted

## Context
The Workflow Runtime has reached distributed production readiness (9/10), but observability is fragmented:
- Metrics: WorkflowMetrics with counters/histograms/gauges
- Events: EventStore with WorkflowEvents (time-ordered per workflow)
- Audit: AuditService with AuditEvents (append-only log)
- Traces: PipelineTracer + PipelineTrace (in-memory trace store)
- Timeline: No unified view across all data sources

Operational debugging requires correlating these signals.

## Decision
Establish a unified Observability Model with three pillars:

### 1. Metrics — Quantitative Runtime Health
Source: WorkflowMetrics (in-memory counters/histograms/gauges)

Exposed through MetricsControlService:

| Metric Category | Key Metrics | Source |
|----------------|-------------|--------|
| Workflow | running, failedToday, avgDuration, totalExecutions | WorkflowMetrics |
| Worker | active, busy, totalTasks, successRate, leaseAcquired | WorkflowMetrics |
| Agent | executions, successRate, avgDuration | AgentControlService + WorkflowMetrics |
| Tool | totalExecutions, successRate | WorkflowMetrics |
| Error | total, bySource, workflowFailures, nodeErrors | WorkflowMetrics |

### 2. Timeline — Unified Event Sequence
Source: EventStore + AuditService + TraceStore

Aggregated by WorkflowTimelineService:

```
Timeline Entry:
{
  timestamp,
  type,          // e.g., node_started, workflow_pause, approval_approved
  category,      // technical | business | audit
  actor,         // workflow_engine | operator_name | system
  nodeId,
  metadata       // event-specific payload
}
```

Categories:
- **Technical**: NODE_STARTED, NODE_COMPLETED, RETRY, COMPENSATION
- **Business**: APPROVAL_REQUIRED, APPROVED, REJECTED, WORKFLOW_PAUSE
- **Audit**: permission decisions, operator actions

### 3. Traces — Pipeline Debugging
Source: PipelineTracer (in-memory, max 500 traces)

Provides detailed step-by-step execution traces for debugging:
```
PipelineTrace:
{
  id,
  steps: [{ type, startedAt, finishedAt, metadata }],
  duration,
  status
}
```

### Observability Architecture
```
MetricsControlService
    │
    ├── getWorkflowMetrics()  → WorkflowMetrics (counters/histograms/gauges)
    ├── getWorkerMetrics()    → WorkflowMetrics (worker counters)
    ├── getAgentMetrics()     → AgentControlService + WorkflowMetrics
    ├── getToolMetrics()      → WorkflowMetrics (tool/mcp counters)
    └── getErrorMetrics()     → WorkflowMetrics (error counters)

WorkflowTimelineService
    │
    ├── EventStore    → WorkflowEvents (technical timeline)
    ├── AuditService  → AuditEvents (business + audit timeline)
    └── TraceStore    → PipelineTraces (execution debug details)

ExecutionGraphView
    │
    └── EventStore + Storage → node status, duration, DAG visualization
```

### Metrics Aggregation Rules
1. **Counters**: absolute totals (idempotent increment)
2. **Histograms**: windowed observations (last 1000 values, avg/min/max)
3. **Gauges**: current state (active workers, running workflows)
4. **Derived metrics**: successRate = success / total * 100

## Consequences
### Positive
- Single API for all operational data
- Timeline merges technical and business events chronologically
- Error aggregation enables quick incident identification
- Graph view provides real-time workflow visualization data

### Negative
- In-memory metrics are lost on restart (no persistence)
- Trace store is capped at 500 traces (circular buffer)
- Timeline queries require multiple data source calls

## Related ADRs
- ADR-054 (Control Plane Architecture)
- ADR-052 (Async Audit Pipeline)
- ADR-045 (Workflow Engine Architecture)