# AIOS Human Console — Product Roadmap

**Date:** 2026-07-25
**Status:** Draft
**Owner:** Architecture Team

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                 AIOS Human Console                    │
│                                                       │
│  ┌─────────────┐  ┌──────────────────────────────┐   │
│  │ Navigation  │  │         Workspace             │   │
│  │ Shell       │  │                               │   │
│  │             │  │  ┌─────────────────────────┐  │   │
│  │ • AI Chat   │  │  │                         │  │   │
│  │ • Operations│  │  │  Module Content         │  │   │
│  │ • Agents    │  │  │                         │  │   │
│  │ • Tools/MCP │  │  │  (iframe / SPA page)    │  │   │
│  │ • Security  │  │  │                         │  │   │
│  │ • Observ.   │  │  └─────────────────────────┘  │   │
│  │ • Settings  │  │                               │   │
│  └─────────────┘  └──────────────────────────────┘   │
│                                                       │
│  ┌──────────────────────────────────────────────┐   │
│  │  API Client Layer (Control Plane boundary)    │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│                Control Plane Services                  │
│  WorkflowControl | Approval | AgentControl | Metrics  │
└─────────────────────────────────────────────────────┘
```

---

## Section 1 — User Workspace

### AI Chat (Existing — Keep)

| Feature | Status | Control Plane Integration |
|---------|--------|--------------------------|
| Streaming AI chat | ✅ Existing | Direct `/assistant` endpoint |
| Project management | ✅ Existing | No Control Plane needed |
| File attachments | ✅ Existing | — |
| Voice input | ✅ Existing | — |
| RAG knowledge access | ✅ Existing | `/api/rag/*` endpoints |
| System prompt editing | ✅ Existing | — |
| Theme toggle | ✅ Existing | — |

### Conversations

| Feature | Priority | Notes |
|---------|----------|-------|
| Conversation history search | Medium | Extend existing project listing |
| Conversation export (JSON/PDF) | Low | — |
| Shared conversation links | Low | Future |

### Personal Agents

| Feature | Priority | Notes |
|---------|----------|-------|
| List my available agents | Medium | Via AgentControlService.listAgents() |
| Agent execution history | Low | Via MetricsControlService |

### Knowledge Access

| Feature | Priority | Notes |
|---------|----------|-------|
| RAG search from chat | ✅ Existing | Already works |
| Knowledge base browser | Medium | New page |
| Document upload UI | ✅ Existing | In admin panel |

---

## Section 2 — Operations Console

### Workflow Executions

| Feature | Priority | Control Plane API |
|---------|----------|-------------------|
| List active workflows | High | WorkflowControlService.listWorkflows() |
| Workflow detail view | High | WorkflowControlService.getStatus() |
| Start/pause/resume/cancel | High | WorkflowControlService lifecycle methods |
| Retry/skip node | Medium | WorkflowControlService.retryNode/skipNode |
| Terminate workflow | High | WorkflowControlService.terminate() |

### DAG Visualization

| Feature | Priority | Notes |
|---------|----------|-------|
| Execution graph view | High | ExecutionGraphView.buildView() → render DAG |
| Node status colors | High | Running ✅, Failed ❌, Completed ✅ |
| Zoom/pan | Medium | Canvas or SVG-based |
| Node detail on click | Medium | Show node input/output/logs |

### Execution Timeline

| Feature | Priority | Control Plane API |
|---------|----------|-------------------|
| Unified event timeline | High | WorkflowTimelineService.getTimeline() |
| Business events only | Medium | getBusinessTimeline() |
| Technical events only | Low | getTechnicalTimeline() |
| Timeline filtering | Medium | By event type, severity, time range |

### Runtime Status

| Feature | Priority | Notes |
|---------|----------|-------|
| Worker pool status | Medium | Via MetricsControlService.getWorkerMetrics() |
| Active executions count | Medium | Via MetricsControlService |
| System health indicators | High | MCP, DB, Knowledge status |

---

## Section 3 — Agent Console

### Registered Agents

| Feature | Priority | Control Plane API |
|---------|----------|-------------------|
| List all agents | High | AgentControlService.listAgents() |
| Agent detail view | High | AgentControlService.getAgentInfo() |
| Enable/disable agent | High | AgentControlService.enable/disable() |
| Reload agent | Medium | AgentControlService.reload() |
| Agent type filtering | Medium | By category, status |

### Versions

| Feature | Priority | Notes |
|---------|----------|-------|
| Agent version history | Medium | Extend AgentRegistry |
| Version comparison | Low | — |
| Rollback capability | Low | Requires versioned deployments |

### Lifecycle

| Feature | Priority | Notes |
|---------|----------|-------|
| Agent status badges | High | Active / Disabled / Error / Loading |
| Last seen timestamp | Medium | From execution records |
| Execution count | Medium | Via MetricsControlService |

### Metrics

| Feature | Priority | Control Plane API |
|---------|----------|-------------------|
| Agent success rate | Medium | MetricsControlService.getAgentMetrics() |
| Average execution duration | Medium | MetricsControlService.getAgentMetrics() |
| Error rate per agent | Low | MetricsControlService.getErrorMetrics() |

---

## Section 4 — Tool & MCP Console

### Available Tools

| Feature | Priority | Notes |
|---------|----------|-------|
| Tool registry browser | High | List all registered tools |
| Tool detail (schema, params) | High | Show input/output schemas |
| Tool usage statistics | Medium | Via MetricsControlService.getToolMetrics() |

### MCP Providers

| Feature | Priority | Notes |
|---------|----------|-------|
| MCP provider list | High | Show connected MCP providers |
| Provider status | High | Connected / Disconnected / Error |
| Provider configuration | Medium | Extend existing LLM settings UI |

### Permissions

| Feature | Priority | Notes |
|---------|----------|-------|
| Tool-to-role mapping | High | Move from admin panel |
| Permission override UI | Medium | For emergencies |
| Tool access audit log | Low | Via Audit Layer |

---

## Section 5 — Security Console

### Approval Queue

| Feature | Priority | Control Plane API |
|---------|----------|-------------------|
| List pending approvals | High | ApprovalAPI.listPending() |
| Approval detail view | High | ApprovalAPI.getApproval() |
| Approve/reject with reason | High | ApprovalAPI.approve/reject() |
| Approval history | Medium | Extend with audit events |

### Policies

| Feature | Priority | Notes |
|---------|----------|-------|
| Risk level configuration | Medium | Low/Medium/High/Critical thresholds |
| Approval policy editor | Low | Require approval for specific actions |
| Policy audit log | Low | Who changed what and when |

### Audit Events

| Feature | Priority | Notes |
|---------|----------|-------|
| Audit event stream | High | Real-time audit feed |
| Audit search/filter | High | By actor, action, resource, date |
| Audit event detail | High | Full event payload |
| Audit export | Medium | CSV/JSON download |

---

## Section 6 — Observability

### Metrics Dashboard

| Feature | Priority | Control Plane API |
|---------|----------|-------------------|
| Workflow metrics | High | MetricsControlService.getWorkflowMetrics() |
| Worker metrics | Medium | MetricsControlService.getWorkerMetrics() |
| Agent metrics | Medium | MetricsControlService.getAgentMetrics() |
| Tool/MCP metrics | Medium | MetricsControlService.getToolMetrics() |
| Error metrics | High | MetricsControlService.getErrorMetrics() |
| All metrics overview | High | MetricsControlService.getAll() |

### Traces

| Feature | Priority | Notes |
|---------|----------|-------|
| Execution trace view | Medium | Per-workflow execution trace |
| Trace search | Medium | By workflow ID, node ID, time |
| Trace detail (input/output) | Medium | Full node execution payload |

### Events

| Feature | Priority | Notes |
|---------|----------|-------|
| System event feed | Medium | Real-time event stream |
| Event filtering | Medium | By source, type, severity |
| Event detail | Low | Full event payload |

---

## Section 7 — Settings & Admin

### Legacy Admin Replacement Plan

| Admin Tab | Replace With | Console Section | Priority |
|-----------|-------------|-----------------|----------|
| Users | Security Console → Users | Security | High |
| Models | Future: Model Registry UI | Settings | Medium |
| Passwords | Security Console → Settings | Security | Medium |
| RAG/Knowledge | User Workspace → Knowledge | Workspace | Low |
| LLM Provider | Settings → Providers | Settings | High |
| System Health | Operations Console → Health | Operations | High |
| Knowledge Diagnostics | Observability → Diagnostics | Observability | Low |

### Settings

| Feature | Priority | Notes |
|---------|----------|-------|
| Profile settings | Low | Name, email, password change |
| API keys/tokens | Low | For programmatic access |
| Notification preferences | Low | Email/webhook on approval needed |
| Theme preference | ✅ Existing | Already in chat UI |