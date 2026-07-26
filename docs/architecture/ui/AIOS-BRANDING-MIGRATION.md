# AIOS Branding Migration

## Overview

This document describes the migration of the user-facing brand from "AI Assistant" to "AIOS" (AI Operating System).

## Scope

Only frontend branding was changed. Backend service names, database tables, and API routes remain unchanged.

## Changed Files

### HTML Pages

| File | Change |
|------|--------|
| `public/index.html` | Title → "AIOS — AI Operating System"; Badge → "AIOS" link to console; Added "AIOS Console" nav button; Added application-name meta |
| `public/login.html` | Title → "Вход — AIOS"; Logo → "AIOS"; Tagline → "AI Operating System — Персональный AI-помощник" |
| `public/admin.html` | Title → "Админ-панель — AIOS"; Added "AIOS Console" nav link |
| `public/programming.html` | Title → "Programming Engine — AIOS"; Header → "Programming Engine · AIOS" |
| `public/rag.html` | Title → "RAG База Знаний — AIOS"; Header → "RAG База Знаний · AIOS" |

### Favicon

| File | Change |
|------|--------|
| `public/icons/favicon.svg` | Updated text from "AI" to "AIOS" |

### Meta Tags

Added `<meta name="application-name" content="AIOS">` to all HTML pages.

## Not Changed

- Backend service names
- Database schema
- API routes
- `index.js` server code (except new console API routes)
- Internal class names
- Environment variables

## Verification

- [x] All page titles display "AIOS"
- [x] Favicon shows "AIOS"
- [x] Header badge links to console
- [x] Login page shows "AIOS"
- [x] All pages have application-name meta