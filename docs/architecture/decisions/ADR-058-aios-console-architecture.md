# ADR-058: AIOS Console Architecture

**Status:** Accepted
**Date:** 2026-07-25
**Deciders:** Architecture Team
**References:** ADR-054 (Control Plane), ADR-055 (Human Console Security), ADR-056 (Observability), ADR-057 (UI Evolution Strategy)

---

## Context

Sprint 10 established the Control Plane Architecture with:
- WorkflowControlService
- ApprovalAPI
- AgentControlService
- MetricsControlService
- ExecutionGraphView
- WorkflowTimelineService

Sprint 11 creates the first production-ready AIOS Console — the operator-facing UI layer that consumes these Control Plane services.

---

## Decision

### 1. Console Architecture

```
Browser (HTML/CSS/JS Console Pages)
    │
    ▼
HTTP ──── Express Static Files + API Routes
    │
    ├── /api/console/*   — Console Control Plane API
    ├── /api/workflow/*  — Standard Workflow API
    │
    ▼
Control Plane Services
    ├── WorkflowControlService
    ├── ApprovalAPI
    ├── AgentControlService
    ├── MetricsControlService
    ├── ExecutionGraphView
    └── WorkflowTimelineService
    │
    ▼
Runtime Layer (never exposed to UI)
```

### 2. Console Modules

| Module | Page | Backend Service | Purpose |
|--------|------|----------------|---------|
| Overview | `console.html` | All CP services | System dashboard |
| Workflows | `workflows.html` | WorkflowControlService, WorkflowAPI | Manage workflow lifecycle |
| Approvals | `approvals.html` | ApprovalAPI | Manage human-in-the-loop approvals |
| Agents | `agents.html` | AgentControlService | View and control agent runtimes |
| Observability | `observability.html` | MetricsControlService, TimelineService | Metrics, timeline, traces, audit |

### 3. API Client Layer

Shared `ApiClient` class in `public/js/api-client.js`:
- All Control Plane interactions through typed methods
- Session auth via cookies (`credentials: 'include'`)
- Structured response parsing: `{ success, data, error }`
- Never calls `fetch()` directly

### 4. UI → Control Plane → Runtime

- UI sends HTTP request to console API
- Console API validates auth, delegates to Control Plane service
- Control Plane service executes (with audit)
- Response flows back through the same path

---

## Rationale

1. **Security boundary:** UI never touches Runtime directly
2. **Module isolation:** Each page is independently deployable
3. **No framework lock-in:** Vanilla JS keeps flexibility
4. **Existing design reuse:** CSS custom properties, components reused
5. **Parallel operation:** Legacy admin and new console coexist

---

## Consequences

### Positive
- Clear security boundary enforced by architecture
- Console modules ship independently
- No frontend framework dependency
- Existing chat UI unchanged

### Negative
- Page reloads between modules (no SPA)
- No TypeScript (can be added per module)

---

## Compliance

- [x] UI → Control Plane → Runtime
- [x] Every operator action requires audit
- [x] Frontend contains presentation logic only
- [x] UI modules are independently deployable

---

## Migration Status (Sprint 11)

- [x] AIOS branding migration — complete
- [x] Console API backend — complete
- [x] API Client layer — complete
- [x] Overview dashboard — complete
- [x] Workflow Console — complete
- [x] Approval Console — complete
- [x] Agent Console — complete
- [x] Observability Console — complete
- [ ] Legacy admin replacement — in progress (future sprints)