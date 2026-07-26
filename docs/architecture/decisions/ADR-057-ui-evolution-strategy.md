# ADR-057: UI Evolution Strategy — From AI Assistant to AIOS Human Console

**Status:** Accepted
**Date:** 2026-07-25
**Deciders:** Architecture Team
**References:** ADR-054 (Control Plane), ADR-055 (Human Console Security), ADR-056 (Observability), UI-AUDIT.md

---

## Context

The AI Assistant backend has evolved into a full AIOS platform with Agent Runtime, Workflow Engine, MCP Orchestrator, Tool Registry, Permission System, Approval Workflow, Control Plane, Audit Layer, and Observability Layer.

The existing frontend is a Vanilla JS single-page application served by an Express.js backend. It provides:
- Chat interface with streaming AI responses
- Project management
- RAG knowledge base access
- Admin panel (users, models, LLM config, system health, diagnostics)

The existing UI is NOT a React/Next.js app. It is a **no-build, inline-JS SPA** with solid design foundations (CSS custom properties, responsive layout, dark/light theming, glassmorphism design language).

The Control Plane now exposes structured APIs for workflow lifecycle, approvals, agent management, and observability metrics — none of which have a frontend yet.

**Key constraint:** The existing chat UI is production-quality and must not be disrupted.

---

## Decision

### 1. Extend Existing UI — Do NOT Rewrite

The existing frontend will **evolve into the AIOS Human Console** through incremental extension, not replacement.

### 2. Keep Existing Chat UI as the User Workspace

The chat interface (`index.html`) is the primary user touchpoint. It will remain the main workspace under the "AI Chat" console section.

### 3. Add AIOS Navigation Shell

A navigation shell will be added **around** existing pages. Initially this is an HTML/CSS overlay with no routing changes. Future iterations may introduce a client-side router.

### 4. New Console Modules are Separate Pages

Each AIOS Console module (Operations, Agent, Tool/MCP, Security, Observability) will be a separate HTML page, reusing existing CSS design tokens and auth infrastructure.

This approach:
- Avoids touching the stable chat code
- Allows independent deployment of each module
- Mirrors the existing page-per-feature pattern
- Enables incremental migration without big bang

### 5. API Client Layer as the Integration Boundary

A shared API client module will wrap all Control Plane service calls:
- `WorkflowControlService`
- `ApprovalAPI`
- `AgentControlService`
- `MetricsControlService`
- Session auth APIs

This layer handles:
- Auth token/session management
- Structured result parsing
- Error normalization
- Audit event correlation

### 6. Replace Legacy Admin Incrementally

The monolithic `admin.html` will be replaced tab-by-tab. Each Control Plane module replaces one admin tab. The admin page remains available during transition.

### 7. Frontend Stack for New Modules

New modules start with the **existing Vanilla JS + CSS approach** to maintain consistency. A build system (Vite) and optional TypeScript may be introduced when a module's complexity justifies it, but this is NOT a prerequisite.

---

## Rationale

1. **Risk minimization.** The chat UI is production-critical. Touching it minimally reduces regression risk.
2. **Time to value.** New console modules can ship immediately without waiting for framework migration.
3. **Design preservation.** The existing CSS design token system is well-crafted. Rewriting would lose this investment.
4. **Parallel operation.** Old admin and new console modules coexist — no feature freeze.
5. **No framework lock-in.** Starting with Vanilla JS keeps options open; the API boundary is framework-agnostic.
6. **Control Plane API is the contract.** Frontend is a consumer — it should be replaceable without backend changes.

---

## Consequences

### Positive

- Chat UI remains stable throughout migration
- New console modules ship independently
- Design system is preserved and extended
- Frontend stays lightweight (no framework dependency)
- Gradual team upskilling instead of big bang

### Negative

- Codebase will temporarily have two UI paradigms (old inline JS + new modular JS)
- No TypeScript initially (but can be added per module)
- No build system initially (but Vite can be added per module)

### Neutral

- Navigation will evolve from full-page-reload to SPA-like progressively
- CSS will need token extensions for new console UI patterns (tables, graphs, timelines)

---

## Compliance

- [x] UI consumes Control Plane, never Runtime directly (ADR-054)
- [x] Every mutating operation requires actor identity (ADR-055)
- [x] Audit event recorded for every operation (ADR-052)
- [x] Console modules respect the Security Model (ADR-055)
- [x] No frontend duplicates backend business logic

---

## Migration Stages (Summary)

| Stage | Scope | Duration |
|-------|-------|----------|
| 1 | Keep existing chat UI — no changes | Ongoing |
| 2 | Add AIOS navigation shell + API client layer | ~2 weeks |
| 3 | Add Operations Console, Agent Console, Security Console | ~4 weeks |
| 4 | Add Tool/MCP Console, Observability | ~3 weeks |
| 5 | Replace legacy admin tabs | ~3 weeks |
| 6 | Polish, remove dead code, optional build system | ~2 weeks |

Total estimated migration: **14 weeks parallel to ongoing development**.