# AGENTS.md - Codex instructions for Energisa

## Project overview

This repository contains the HelpUS Energisa Analytics dashboard.

Stack:
- Static `index.html`, `styles.css`, and vanilla `app.js`.
- Vercel serverless API routes under `api/`.
- PostgreSQL/Railway access through `db/client.js`.
- Front-end dependencies are loaded by CD where applicable.

## Default workflow

Before editing:
1. Check `git status --short --branch`.
2. Inspect only the files needed for the task.
3. Keep changes small and targeted.

After editing:
1. Run `npm run check`.
2. Show the changed files and a concise summary.
3. Do not deploy unless explicitly requested.
4. Do not commit unless explicitly requested.

## Validation

Primary validation command:

```bash
npm run check
```

This checks syntax for:
- `app.js`
- `api/health.js`
- `api/summary.js`
- `api/imports.js`
- `api/fuel/imports.js`
- `api/fuel/summary.js`
- `api/fuel/workspaces.js`
- `api/fuel/export.js`
- `db/client.js`

## Safety rules

Do not modify these unless the task explicitly asks for it:
- `.env*`
- `node_modules/`
- `package-lock.json`
- deployment configuration
- database schema or migrations
- API routes
- secrets or credentials

For visual/UI copy or layout tasks, prefer:
- `index.html`
- `styles.css`
- `app.js` only if behavior changes are required

Do not change element IDs, API paths, storage keys, or database field names unless explicitly requested.

## Recent context

Recent watcher + Codex work completed:
- `368d2ad Fix toast styling hook`
- `f19520e Align layout classes with stylesheet`
- `0712168 Fix Portuguese UI encoding`

Vercel preview URLs may return `401` because of deployment protection, so local validation is the source of truth unless public access is explicitly configured.
