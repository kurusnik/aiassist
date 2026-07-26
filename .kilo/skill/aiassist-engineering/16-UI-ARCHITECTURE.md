# UI Architecture — AIOS Human Console

## Overview

The AIOS Human Console is the operator-facing UI layer. It consumes Control Plane services and must never access Runtime directly. The console is built as a set of independently deployable pages/modules sharing CSS design tokens and an API client layer.

## Frontend/Backend Boundary

```
Browser (HTML/CSS/JS)
    │
    ▼
HTTP(S) ──── Express Static Files + API Routes
    │
    ├── /auth/*          — Session management
    ├── /assistant       — Chat SSE streaming (direct)
    ├── /api/admin/*     — Legacy admin (deprecated)
    │
    ▼
Control Plane Services (JavaScript)
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

### Rules

1. **UI never calls Runtime directly.** Every user action passes through Authorization → Control Service → Audit.
2. **Chat streaming is the only exception** — it uses the existing `/assistant` SSE endpoint directly.

## Control Plane UI Principles

### Operation Pattern

Every user action in the console follows this flow:

```
User Click → API Client → Control Service → Auth Check → Validation → Execution → Audit → Response → UI Update
```

Each response returns a structured result:
```javascript
{
  success: boolean,
  workflowId: string,
  status: string,
  actor: string,
  timestamp: string,
  error: string | null
}
```

### API Client Layer

All Control Plane interactions go through a shared `ApiClient` class:
- Handles session auth (cookie-based)
- Normalizes error responses
- Provides typed methods for every Control Service
- Attaches actor identity and reason parameters

```javascript
// Pattern — never call fetch() directly for Control Plane operations
const client = new ApiClient();
const result = await client.workflow.start(workflowId);
// result → { success, workflowId, status, actor, timestamp }
```

## Console Design Rules

### Module Isolation

- Each console module is an **independent HTML page** (or micro-frontend)
- Modules share: CSS design tokens, API Client, auth
- Modules do NOT share: state, routing, build configuration
- A module can be removed or replaced without affecting others

### State Management Per Module

- Module state is scoped to the page (not global)
- No cross-module shared state
- Each module manages its own state (plain JS objects or Zustand store)

### Navigation

- Navigation shell is additive — wraps existing pages
- Full page reload between modules (no SPA router required)
- Future: optional History API router for sub-views within a module

### CSS Architecture

- Shared design tokens: `css/design-tokens.css`
- Shared base styles: `css/base.css`, `css/components.css`
- Module-specific styles: inline `<style>` or per-module CSS file
- No CSS-in-JS, no Tailwind — extend the existing token system

## Deployment Model

### Module Independence

```
public/
├── index.html           # AI Chat (frozen — bug fixes only)
├── login.html           # Auth (unchanged)
├── shell.html           # Navigation shell
├── css/
│   ├── design-tokens.css
│   ├── base.css
│   ├── components.css
│   ├── console.css       # Console-specific components
│   └── shell.css         # Navigation shell styles
├── js/
│   └── api-client.js     # Shared API client
├── operations.html       # Console module — Operations
├── security.html         # Console module — Security
├── agents.html           # Console module — Agents
├── tools.html            # Console module — Tools/MCP
└── observability.html    # Console module — Observability
```

Each HTML file is self-contained:
- Loads shared CSS + JS from `/css/` and `/js/`
- Contains its own inline `<script>` for module logic
- Can be deployed, tested, and versioned independently

## API-First UI Development

### Workflow for New Features

1. **Define Control Plane API contract** — method signature, params, return type, risk level
2. **Implement Control Plane service** — authorization, validation, audit
3. **Add method to ApiClient** — typed wrapper
4. **Build UI component** — consumes ApiClient method
5. **Write integration test** — ApiClient → Control Service → mock Runtime

### API Contract Requirements

Every Control Plane API used by the UI must specify:
- HTTP method and path (if REST-wrapped)
- Request parameters (including actor and reason)
- Response structure
- Risk level (for authorization)
- Audit event schema

## Legacy Coexistence

During migration, old and new modules operate in parallel:

| Old (legacy) | New (console) | Transition |
|-------------|---------------|------------|
| `admin.html` → Users tab | `security.html` → User management | Both available until migration complete |
| `admin.html` → System Health tab | `operations.html` → Health panel | Both available |
| `index.html` (chat) | `shell.html` + `index.html` | Shell wraps existing chat |

## Testing Strategy

- **Module smoke tests** — each console page loads without errors
- **API Client unit tests** — mock Control Plane responses
- **Integration tests** — ApiClient → Control Service → mock Runtime
- **E2E tests** — real browser, real Control Plane, mock Runtime
- **Accessibility tests** — keyboard navigation, screen reader

## Related Documents

- [ADR-054](../architecture/decisions/ADR-054-control-plane-architecture.md) — Control Plane Architecture
- [ADR-055](../architecture/decisions/ADR-055-human-console-security.md) — Human Console Security
- [ADR-056](../architecture/decisions/ADR-056-runtime-observability-model.md) — Observability Model
- [ADR-057](../architecture/decisions/ADR-057-ui-evolution-strategy.md) — UI Evolution Strategy
- [UI-AUDIT.md](../architecture/ui/UI-AUDIT.md) — UI Architecture Audit
- [UI-MIGRATION-PLAN.md](../architecture/ui/UI-MIGRATION-PLAN.md) — Migration Plan
- [AIOS-CONSOLE-ROADMAP.md](../architecture/ui/AIOS-CONSOLE-ROADMAP.md) — Console Roadmap