# AIOS Human Console — UI Migration Plan

**Date:** 2026-07-25
**Status:** Approved
**Owner:** Architecture Team
**Duration:** ~14 weeks (parallel to ongoing development)

---

## Guiding Principles

1. **Chat UI is frozen during migration.** No modifications to `index.html` chat functionality.
2. **New modules co-exist with legacy pages.** No big bang replacement.
3. **Control Plane is the API boundary.** No frontend calls Runtime directly.
4. **Each module is independently deployable.** Ship as soon as ready.
5. **CSS design tokens are shared.** New modules consume the same token system.

---

## Stage 1 — Keep Existing Chat UI

**Duration:** Ongoing
**Risk:** None

### Actions

| Action | Owner | Status |
|--------|-------|--------|
| Freeze `index.html` changes to bug fixes only | All | Not started |
| Remove dead code (`app.js`, `state.js`, `stateActions.js`, `styles.css`) | Frontend | Not started |
| Document all existing API endpoints used by chat | Frontend | Not started |
| Verify session auth works with all existing pages | QA | Not started |

### Deliverables
- ✅ Stable chat UI baseline
- ✅ Removed legacy modularization code
- ✅ Documented API surface

---

## Stage 2 — Add AIOS Navigation Shell

**Duration:** ~2 weeks
**Dependencies:** None

### Actions

| Action | Details |
|--------|---------|
| Design AIOS nav shell component | Sidebar with sections: AI Chat, Operations, Agents, Tools, Security, Observability |
| Create `shell.html` + `shell.css` | Nav shell that wraps/links to existing pages |
| Create API Client Layer (`js/api-client.js`) | Wrapper around fetch with session management, error handling |
| Add nav-aware CSS tokens | Shell-specific variables (sidebar width, nav colors) |
| Test navigation flow | All existing pages accessible via shell |

### API Client Layer Specification

```javascript
// Proposed API Client structure
class ApiClient {
  constructor(baseUrl = '') { ... }

  // Session
  async checkAuth() → { authenticated, user }
  async login(username, password) → session
  async logout() → void

  // Control Plane — Workflow
  async listWorkflows(status?)
  async getWorkflowStatus(id)
  async createWorkflow(definitionId, input)
  async startWorkflow(id)
  async pauseWorkflow(id, reason)
  async resumeWorkflow(id)
  async cancelWorkflow(id, reason)
  async terminateWorkflow(id, reason)
  async retryNode(workflowId, nodeId)
  async skipNode(workflowId, nodeId, reason)

  // Control Plane — Approvals
  async listPendingApprovals(workflowId?, riskLevel?)
  async getApproval(id)
  async approveApproval(id, reason)
  async rejectApproval(id, reason)

  // Control Plane — Agents
  async listAgents()
  async getAgentInfo(type)
  async enableAgent(type, reason)
  async disableAgent(type, reason)
  async reloadAgent(type, reason)

  // Control Plane — Metrics
  async getWorkflowMetrics()
  async getWorkerMetrics()
  async getAgentMetrics()
  async getToolMetrics()
  async getErrorMetrics()
  async getAllMetrics()
}
```

### Deliverables
- ✅ Navigation shell visible across all pages
- ✅ `ApiClient` class with all Control Plane bindings
- ✅ Session auth integrated into ApiClient
- ✅ Design tokens extended with shell variables

---

## Stage 3 — Add Human Console Modules

**Duration:** ~4 weeks
**Dependencies:** Stage 2 (API Client Layer, Navigation Shell)

### Module Implementation Order

```
Week 1-2:    Operations Console (highest priority — replaces admin health tab)
Week 2-3:    Security Console (approval queue + audit events)
Week 3-4:    Agent Console (agent registry + status)
```

### Operations Console — `operations.html`

| Component | Control Plane API | UI Pattern |
|-----------|-----------------|------------|
| Workflow list | listWorkflows() | Table with status badges |
| Workflow detail | getStatus() | Panel with execution state |
| Lifecycle controls | start/pause/resume/cancel/terminate | Action buttons per workflow |
| DAG visualization | ExecutionGraphView.buildView() | Canvas/SVG graph renderer |
| Timeline | WorkflowTimelineService.getTimeline() | Vertical event timeline |
| Health panel | System health endpoint | Status cards (MCP, DB, Knowledge) |
| Metrics | MetricsControlService.getAll() | Dashboard widgets |

### Security Console — `security.html`

| Component | Control Plane API | UI Pattern |
|-----------|-----------------|------------|
| Approval queue | ApprovalAPI.listPending() | Table with approve/reject actions |
| Approval detail | ApprovalAPI.getApproval() | Modal with workflow context |
| Audit log | (new) AuditEvent API | Filterable event stream |

### Agent Console — `agents.html`

| Component | Control Plane API | UI Pattern |
|-----------|-----------------|------------|
| Agent list | AgentControlService.listAgents() | Card grid with status |
| Agent detail | AgentControlService.getAgentInfo() | Panel with config + metrics |
| Enable/disable | AgentControlService.enable/disable() | Toggle with confirmation |
| Agent metrics | MetricsControlService.getAgentMetrics() | Mini charts |

### CSS Extensions for Console UI

New CSS components needed:
- `.console-layout` — Grid layout for console pages
- `.data-table` — Sortable, filterable data tables
- `.status-badge` — Status indicators (running, failed, pending)
- `.metric-card` — KPI dashboard cards
- `.timeline` — Vertical event timeline
- `.workflow-graph` — DAG visualization container
- `.approval-modal` — Approval action modal

### Deliverables
- ✅ `operations.html` — Workflow list, detail, DAG, timeline, health
- ✅ `security.html` — Approval queue + audit events
- ✅ `agents.html` — Agent registry + status
- ✅ Extended CSS components for console UI
- ✅ Integration tests for each module

---

## Stage 4 — Add Tools, Observability, Settings

**Duration:** ~3 weeks
**Dependencies:** Stage 3

### Module Implementation Order

```
Week 1:      Tool & MCP Console — `tools.html`
Week 2:      Observability Dashboard — `observability.html`
Week 3:      Settings page — `settings.html`
```

### Tool & MCP Console — `tools.html`

| Component | API | Notes |
|-----------|-----|-------|
| Tool registry | (new) ToolRegistry.listTools() | Schema viewer for each tool |
| MCP provider status | (new) MCPProviderService.getStatus() | Per-provider status cards |
| Tool usage stats | MetricsControlService.getToolMetrics() | Usage bar charts |
| Permission editor | (new) ToolPermissionService | Role-to-tool assignment UI |

### Observability Dashboard — `observability.html`

| Component | API | Notes |
|-----------|-----|-------|
| Metrics overview | MetricsControlService.getAll() | 6 KPI cards |
| Workflow metrics | MetricsControlService.getWorkflowMetrics() | Running count, failure rate |
| Error breakdown | MetricsControlService.getErrorMetrics() | Error source pie chart |
| Worker status | MetricsControlService.getWorkerMetrics() | Active/busy workers |

### Settings — `settings.html`

| Component | Notes |
|-----------|-------|
| LLM provider config | Migrate from admin.html |
| Profile settings | Name, email, password |
| Appearance | Theme, language (future) |

### Deliverables
- ✅ `tools.html` — Tool registry, MCP status, permissions
- ✅ `observability.html` — Metrics, errors, worker status
- ✅ `settings.html` — LLM config, profile, appearance
- ✅ All admin health/system features migrated

---

## Stage 5 — Replace Legacy Admin Components

**Duration:** ~3 weeks
**Dependencies:** Stages 3-4

### Migration per Tab

| Admin Tab | Replaced By | Migration Action |
|-----------|-------------|-----------------|
| Users | Security Console | Add user management to `security.html` |
| Models | Settings | Add model catalog to `settings.html` |
| Passwords | Settings | Add password change to `settings.html` |
| RAG/Knowledge | User Workspace | Add knowledge browser to nav shell |
| LLM Provider | Settings → Providers | Already in `settings.html` |
| System Health | Operations Console | Already in `operations.html` |
| Knowledge Diagnostics | Observability | Add diagnostics to `observability.html` |

### Legacy Admin Retirement

When all features are migrated:
1. Remove admin.html from navigation
2. Add redirect: `/admin.html` → `/operations.html`
3. (Optional) Remove `requireAdmin` middleware for admin.html route

### Deliverables
- ✅ All admin features available in Console modules
- ✅ Redirect from legacy admin to new console
- ✅ Removal of admin.html from active use

---

## Stage 6 — Polish & Optimization

**Duration:** ~2 weeks
**Dependencies:** Stages 1-5
**Optional:** Can be deferred

### Actions

| Action | Priority | Notes |
|--------|----------|-------|
| Introduce Vite build | Medium | For JS bundling and HMR |
| Add TypeScript to new modules | Low | Only for complex modules |
| Client-side router | Low | Page.js or History API |
| Performance audit | Medium | Bundle size, render time |
| Accessibility audit | Medium | Screen reader, keyboard nav |
| Remove all dead code | High | Legacy files from Stage 1 |
| Write UI integration tests | Medium | End-to-end for console modules |

### Deliverables
- ✅ Build system (optional)
- ✅ Client-side routing (optional)
- ✅ Performance optimized
- ✅ Accessible
- ✅ Clean codebase — no legacy artifacts

---

## Timeline Summary

```
Week  →  1  2  3  4  5  6  7  8  9  10  11  12  13  14
         ────────────────────────────────────────────────
Stage 1  ██░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
Stage 2  ░░████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
Stage 3  ░░░░░░████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
Stage 4  ░░░░░░░░░░░░░░████████░░░░░░░░░░░░░░░░░░░░░░
Stage 5  ░░░░░░░░░░░░░░░░░░░░░░░░██████░░░░░░░░░░░░░░
Stage 6  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░████████░░░░
```

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Chat streaming regression | Low | Critical | Automated smoke test for `/assistant` endpoint |
| Auth session breakage in new modules | Low | High | Reuse existing middleware, test all roles |
| Scope creep — "while we're here" refactors | High | Medium | Strict stage boundaries, no premature optimization |
| DAG visualization complexity | Medium | Medium | Start with simple SVG renderer, iterate |
| Admin tab migration uncovers missing APIs | Medium | Medium | Add backend endpoints before UI work |
| Team context switching | Medium | Medium | Dedicated frontend weeks, no multitasking |