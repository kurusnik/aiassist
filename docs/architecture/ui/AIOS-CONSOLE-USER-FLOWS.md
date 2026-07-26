# AIOS Console User Flows

## Overview

This document describes the primary user flows through the AIOS Console interface.

---

## Flow 1: Console Login and Navigation

```
┌──────────┐     ┌──────────┐     ┌─────────────┐
│ Login    │────▶│ Console  │────▶│ Module View │
│ /login   │     │ /console │     │ (workflows, │
│          │     │          │     │  approvals, │
└──────────┘     └──────────┘     │  agents,    │
                                   │  observ.)   │
                                   └─────────────┘
```

1. User navigates to `/console.html`
2. `auth.js` checks `/auth/check`
3. If not authenticated → redirect to `/login.html`
4. If authenticated → render console shell with user info
5. Left nav provides links to all console modules + chat + admin

---

## Flow 2: Workflow Management

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│ Dashboard    │────▶│ Detail View  │────▶│ Action Execution │
│ List + Stats │     │ Timeline     │     │ Pause / Resume   │
│              │     │ Graph        │     │ Cancel           │
└──────────────┘     └──────────────┘     └──────────────────┘
                                                      │
                                                      ▼
                                               ┌──────────────┐
                                               │ Audit Event   │
                                               │ Recorded      │
                                               └──────────────┘
```

### Steps
1. Navigate to `/workflows.html`
2. Dashboard shows stats (running, completed, failed, pending approvals) and workflow list
3. Filter workflows by status
4. Click workflow row → detail panel opens with:
   - Workflow metadata (ID, status, version, timestamps)
   - Timeline of events
   - Execution graph visualization
5. Click Pause / Resume / Cancel
6. Confirmation dialog (for destructive actions)
7. Action sent via `ApiClient` → Console API → Control Plane → Audit
8. UI updates with new status
9. Toast notification confirms action

---

## Flow 3: Approval Management

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│ Approval     │────▶│ Detail View  │────▶│ Approve / Reject │
│ List         │     │ Full info    │     │ Confirmation     │
│ Tab filter   │     │ Policy/rules │     │ Dialog           │
└──────────────┘     └──────────────┘     └──────────────────┘
                                                   │
                                                   ▼
                                            ┌──────────────┐
                                            │ Audit Event   │
                                            │ Recorded      │
                                            └──────────────┘
```

### Steps
1. Navigate to `/approvals.html`
2. Stats bar shows pending/approved/rejected/expired counts
3. Tab buttons filter the list (Pending, Approved, Rejected, Expired, All)
4. Pending approvals show Approve/Reject buttons inline
5. Click approval row → detail panel with full info:
   - Action, tool, workflow, requester, reason
   - Risk level, policy, rules applied
   - Timestamps and decision history
6. Click Approve or Reject
7. Confirmation dialog: "This action will be audited"
8. On confirm → `ApiClient` → Console API → ApprovalAPI → Audit
9. Row updates with new status badge
10. Toast notification

---

## Flow 4: Agent Management

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│ Agent List   │────▶│ Agent Detail │────▶│ Enable / Disable │
│ Type, status │     │ Metrics      │     │                  │
│ Executions   │     │ Traces       │     └──────────────────┘
└──────────────┘     └──────────────┘           │
                                                ▼
                                         ┌──────────────┐
                                         │ Audit Event   │
                                         │ Recorded      │
                                         └──────────────┘
```

### Steps
1. Navigate to `/agents.html`
2. Table shows all registered agents with type, name, version, status, executions, success rate, avg duration
3. Click Inspect → detail panel with:
   - Full agent metadata
   - Execution statistics
   - Recent traces (placeholder)
4. Click Enable/Disable toggle
5. Action sent via `ApiClient` → Console API → AgentControlService → Audit
6. Status badge updates
7. Toast notification

---

## Flow 5: Observability

```
┌─────────────────────────────────────────────────────┐
│                  Observability Page                   │
│                                                       │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐ │
│  │ Total       │  │ Success     │  │ Avg Duration │ │
│  │ Workflows   │  │ Rate        │  │              │ │
│  └─────────────┘  └─────────────┘  └──────────────┘ │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │ Workflow Metrics (detail grid)                  │ │
│  └─────────────────────────────────────────────────┘ │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │ Error Breakdown (by source)                     │ │
│  └─────────────────────────────────────────────────┘ │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │ Timeline (enter workflow ID)                    │ │
│  └─────────────────────────────────────────────────┘ │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │ Trace Graph (placeholder)                       │ │
│  └─────────────────────────────────────────────────┘ │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │ Audit Log (recent events)                       │ │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### Steps
1. Navigate to `/observability.html`
2. Top stats show total workflows, success rate, failures, avg duration
3. Workflow metrics grid shows detailed performance data
4. Error breakdown section shows errors by source
5. Enter workflow ID → load timeline
6. Trace graph section (placeholder for future)
7. Audit log table shows recent events with auto-refresh

---

## Flow 6: Cross-Module Navigation

```
┌──────────────┐
│  Console     │
│  Overview    │
│              │
│  Quick links │────▶ Workflows / Approvals / Agents / Observability
│              │
│  Stats from  │    Each page has standard left nav
│  all modules │
└──────────────┘
```

All modules share:
- Left navigation sidebar
- User display in header
- Theme toggle
- Logout button

Navigation is full-page reload (no SPA router).