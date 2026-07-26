# AIOS UI Architecture Audit — Sprint 11 Update

**Date:** 2026-07-25
**Status:** Updated for Sprint 11

---

## New Console Modules

| Module | File | Status | Lines | Dependencies |
|--------|------|--------|-------|-------------|
| Console Shell | `public/console.html` | ✅ Production | ~200 | api-client.js, auth.js, notifications.js, console.css |
| Workflow Console | `public/workflows.html` | ✅ MVP | ~250 | Same |
| Approval Console | `public/approvals.html` | ✅ MVP | ~260 | Same |
| Agent Console | `public/agents.html` | ✅ MVP | ~180 | Same |
| Observability | `public/observability.html` | ✅ MVP | ~220 | Same |

## New Shared Modules

| Module | File | Purpose |
|--------|------|---------|
| API Client | `public/js/api-client.js` | Typed Control Plane API wrapper |
| Auth | `public/js/auth.js` | Session check + logout |
| Notifications | `public/js/notifications.js` | Toast notification system |
| Console CSS | `public/css/console.css` | Console design system components |

## New Backend API

| Module | File | Routes |
|--------|------|--------|
| Console API | `services/console/api/index.js` | 18 endpoints (workflows, approvals, agents, metrics, audit, permissions) |
| Workflow API | `services/workflow/api/index.js` | 10 endpoints (definitions, workflows CRUD) |

## Architecture Compliance

- ✅ UI → Console API → Control Plane → Runtime
- ✅ No direct Runtime calls from UI
- ✅ Every mutation records audit event
- ✅ Presentation logic only in frontend
- ✅ Auth check on every console page load
- ✅ Permission placeholder (`can(action)`) on backend

## Legacy Status

| Component | Status | Notes |
|-----------|--------|-------|
| `index.html` (chat) | Frozen | Bug fixes only |
| `login.html` | Updated | AIOS branding |
| `admin.html` | Legacy | Available in parallel |
| `admin.html` Users tab | Legacy | Will be replaced |
| `admin.html` Models tab | Legacy | Will be replaced |
| `admin.html` LLM tab | Legacy | Will be replaced |
| `admin.html` Health tab | Partially replaced | Console shows overview |

## Technical Debt (New)

| Debt | Severity | Notes |
|------|----------|-------|
| Workflow API uses in-memory storage | High | `listRunning()` only shows in-memory data |
| No client-side router | Low | Full page reloads between modules |
| Console page nav duplicated | Low | Same nav HTML in 5 pages |
| No TypeScript | Low | Acceptable for vanilla JS approach |