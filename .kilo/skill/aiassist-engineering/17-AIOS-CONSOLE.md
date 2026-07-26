# AIOS Console — Architecture Rules

## Console UI Rules

1. **Console UI uses Control Plane only.** Never call Runtime directly.
2. **Frontend contains presentation logic only.** No business logic, permission logic, or execution logic.
3. **Every operator action requires audit.** All mutations pass through audit service.
4. **UI modules are independently deployable.** Each console page can be removed/replaced independently.

## API Client

All Control Plane interactions go through `window.AIOS.apiClient` (shared `ApiClient` class):
- Session auth via cookies
- Typed methods for every Control Service
- Structured response: `{ success, data, error }`
- Never call `fetch()` directly for Control Plane operations

## Console Modules

| Module | Page | Backend Service |
|--------|------|----------------|
| Overview | `console.html` | All CP services |
| Workflows | `workflows.html` | WorkflowControlService |
| Approvals | `approvals.html` | ApprovalAPI |
| Agents | `agents.html` | AgentControlService |
| Observability | `observability.html` | MetricsControlService |

## CSS Architecture

- Shared design tokens: `css/design-tokens.css`
- Console components: `css/console.css`
- No CSS-in-JS, no Tailwind

## Backend API Routes

All console API routes are under `/api/console/`:
- `GET /api/console/workflows` — List workflows
- `GET /api/console/approvals` — List approvals
- `POST /api/console/approvals/:id/approve` — Approve
- `POST /api/console/approvals/:id/reject` — Reject
- `GET /api/console/agents` — List agents
- `GET /api/console/metrics` — All metrics
- `POST /api/console/can` — Permission check
- `GET /api/console/audit` — Audit events

## Permission Model

Frontend has a `can(action)` placeholder:
```javascript
const result = await apiClient.can('workflow.pause');
// { success: true, allowed: true }
```

Backend has a `_can(actor, action)` function that always returns `true` for now.
Future: integrate with RBAC system.

## Deployment

- Console pages are static HTML in `public/`
- No build step required
- API client + auth + notifications in `public/js/`
- Console CSS in `public/css/