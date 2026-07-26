# AIOS Console Architecture

## Overview

The AIOS Console is the operator-facing management UI for the AIOS platform. It provides dashboards and controls for workflows, approvals, agents, and observability.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser (Console Pages)                  │
│  console.html │ workflows.html │ approvals.html             │
│  agents.html  │ observability.html                          │
│                                                             │
│  JS Modules:  api-client.js │ auth.js │ notifications.js   │
│  CSS System:  design-tokens.css │ console.css              │
└───────────────────────┬─────────────────────────────────────┘
                        │ HTTP (fetch, credentials: 'include')
                        ▼
┌─────────────────────────────────────────────────────────────┐
│              Express Static Files + API Routes               │
│                                                             │
│  GET  /api/console/workflows     — list workflows           │
│  GET  /api/console/workflows/stats — workflow statistics    │
│  GET  /api/console/workflows/:id/timeline — timeline        │
│  GET  /api/console/workflows/:id/graph — execution graph    │
│  GET  /api/console/approvals    — list approvals            │
│  GET  /api/console/approvals/:id — approval details         │
│  POST /api/console/approvals/:id/approve — approve          │
│  POST /api/console/approvals/:id/reject — reject            │
│  GET  /api/console/agents       — list agents               │
│  GET  /api/console/agents/:type — agent details             │
│  POST /api/console/agents/:type/enable — enable agent       │
│  POST /api/console/agents/:type/disable — disable agent     │
│  GET  /api/console/metrics      — all metrics               │
│  GET  /api/console/metrics/workflows — workflow metrics     │
│  GET  /api/console/metrics/errors — error metrics           │
│  POST /api/console/can          — permission check          │
│  GET  /api/console/audit        — audit events              │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                   Control Plane Services                     │
│  WorkflowControlService │ ApprovalAPI │ AgentControlService  │
│  MetricsControlService  │ ExecutionGraphView                 │
│  WorkflowTimelineService │ AuditService                      │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                     Runtime Layer                            │
│  (never exposed to UI directly)                              │
└─────────────────────────────────────────────────────────────┘
```

## File Structure

```
public/
├── console.html           # Console overview dashboard
├── workflows.html         # Workflow management console
├── approvals.html         # Approval management console
├── agents.html            # Agent management console
├── observability.html     # Observability dashboard
├── index.html             # AI Chat (unchanged, frozen)
├── login.html             # Auth (branding updated)
├── admin.html             # Legacy admin (branding updated)
├── css/
│   ├── design-tokens.css  # Shared design tokens
│   ├── console.css        # Console-specific components
│   ├── base.css           # Base styles
│   ├── components.css     # Component styles
│   └── responsive.css     # Responsive breakpoints
├── js/
│   ├── api-client.js      # Shared API client
│   ├── auth.js            # Auth check helper
│   └── notifications.js   # Toast notification system
├── scripts/
│   └── theme.js           # Theme toggle
└── icons/
    └── favicon.svg        # AIOS favicon

services/
└── console/
    └── api/
        └── index.js       # Console API router
```

## Design System

All console components use CSS custom properties from `design-tokens.css`:
- Colors: `--accent`, `--success`, `--warning`, `--danger`
- Spacing: `--space-1` through `--space-12`
- Typography: `--text-xs` through `--text-3xl`
- Radius: `--radius-sm` through `--radius-full`
- Shadows: `--shadow-sm` through `--shadow-xl`
- Easings: `--ease-out-strong`, `--ease-spring`

Console-specific components in `console.css`:
- `.console-app` — Layout container
- `.console-nav` — Sidebar navigation
- `.console-main` — Content area
- `.stat-card` — Metric display card
- `.console-card` — Generic content card
- `.console-table` — Data table
- `.badge-aios` — Status badge variants
- `.status-indicator` — Status dot with label
- `.console-modal` — Modal dialog
- `.timeline` — Event timeline
- `.graph-node` — Execution graph node
- `.detail-row` / `.detail-grid` — Detail display

## Security

- All console API routes require authentication via `requireAuth` middleware
- Every mutating operation records an audit event
- Frontend has a `can(action)` permission placeholder (future: RBAC integration)
- UI contains no business logic, permission logic, or execution logic