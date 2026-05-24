# Current Status - Energisa Fleet Fuel Anomaly Analyzer

Last reviewed: 2026-05-24

## 1. Current Project Snapshot

The repository currently contains a static HelpUS fleet fuel audit dashboard (`index.html`, `styles.css`, `app.js`) backed by Vercel serverless routes and PostgreSQL helpers. The UI has moved from the older generic energy-consumption framing toward the fleet-fueling roadmap: it supports CSV/XLS/XLSX selection in the browser, preview rows, workspace/study selection, dashboard metrics, anomaly tables, and export actions.

Recent repository evidence:

- `docs/FUEL_FLEET_ANOMALY_ROADMAP.md` defines the six-phase plan and acceptance criteria.
- `AGENTS.md` exists with local Codex workflow and safety instructions.
- `index.html` exposes fuel dashboard, import, anomaly, vehicle/event, workspace, and export controls.
- `app.js` detects common fuel columns, parses spreadsheet rows with XLSX, previews accepted/rejected rows, stores imports through `/api/fuel/imports`, scopes calls with `workspace_id`, and renders summary/anomaly data.
- `db/client.js` creates fuel-domain tables at runtime through `ensureFuelSchema()`.
- `api/fuel/*.js` implements import, summary, workspace listing/creation, and CSV export routes.

## 2. Validation

Latest validation command:

```bash
npm run check
```

Latest result: passed on 2026-05-24. `npm run check` completed successfully.

## 3. Roadmap Phase Status

| Phase | Status | Evidence / Gap |
|---|---|---|
| Phase 1 - Documentation and Domain Model | Done | Roadmap exists in `docs/`; `db/client.js` defines `app_users`, `workspaces`, `workspace_members`, `vehicles`, `drivers`, `fuel_imports`, `fuel_events`, and `fuel_anomalies`; production runtime files remain focused and small. |
| Phase 2 - Fuel Parser MVP | Partial | `app.js` parses CSV/XLS/XLSX through XLSX, detects vehicle/date/liters/value/odometer and related columns, and shows a preview/quality counters. Gaps: no user-correctable column mapping UI; quality report is minimal; metric-label hardening is not explicit beyond column detection. |
| Phase 3 - Fuel Tables and APIs | Partial | `db/client.js` creates fuel/workspace tables; `/api/fuel/imports`, `/summary`, `/workspaces`, and `/export` exist; raw row JSON and mapping/quality JSON are stored. Gap: no explicit migration file for fuel schema; workspace scoping is parameter-based and not backed by membership validation. |
| Phase 4 - Anomaly Engine | Partial | `/api/fuel/imports` computes km/L and cost/km and stores deterministic anomalies for duplicate candidates, missing odometer, invalid liters, excessive volume, high unit price, odometer regression, zero distance, and low efficiency. Gaps: thresholds are fixed/simple; no tank-capacity lookup rule; no workspace median price rule; no baseline-history rule; no driver/station pattern rule; recommendations are not stored. |
| Phase 5 - Multi-User MVP | Partial / Blocked on auth design | Schema and default user/workspace helpers exist, and UI can create/select studies. There is no login/logout/me API, session handling, role behavior, or per-request membership enforcement, so acceptance criteria for user isolation are not met. |
| Phase 6 - Reports and Export | Partial | `/api/fuel/export` exports anomalies and events as CSV, with UI buttons. Gaps: no report pages by vehicle/driver/station/period/severity beyond dashboard tables; no PDF export. |

## 4. Implemented Capabilities Observed

- Static fuel-audit dashboard with Portuguese UI copy and sections for dashboard, import, anomalies, and vehicles/events.
- Browser-side import for `.csv`, `.xls`, and `.xlsx` using XLSX from CDN.
- Column detection for plate, date, odometer, liters, total value, unit price, driver, station, and fuel type.
- Import preview table showing plate, date, odometer, liters, total, driver, station, and row status.
- Import counters for rows read, valid rows, pending/rejected rows, and mapped columns.
- Server-side normalization and persistence of fuel rows, vehicles, drivers, import metadata, raw JSON, and workspace IDs.
- Derived `km_per_liter` and `cost_per_km` when odometer history permits.
- Deterministic anomaly persistence with severity, risk score, title, explanation, and details JSON.
- Dashboard summary metrics: vehicles, events, liters, total value, average km/L, and alert count.
- Workspace/study listing, creation, selection, and `localStorage` persistence.
- CSV export for fuel events and fuel anomalies.
- Keyboard-accessible dropzone behavior and drag/drop styling.

## 5. Partial or Uncertain Capabilities

- Mapping preview exists as detected columns and row preview, but users cannot correct mappings before save.
- Quality reporting exists only as coarse counts plus `rejected_row_count`; roadmap-level issue categories are not fully reported.
- The parser does not explicitly reject labels such as `Km/L`, `Litros`, `Total`, or `R$` as vehicle identifiers; current behavior depends on detected source columns and row validation.
- Workspace scoping is present in queries but trust-based: routes accept `workspace_id` without authenticating the caller or validating membership.
- User/workspace tables exist, but auth APIs and role-specific permissions are absent.
- Anomaly rules are deterministic but not yet aligned with all roadmap thresholds and baseline requirements.
- Vercel deployment protection may still return `401` on preview URLs, so local checks remain the reliable validation source unless public access is configured.

## 6. Pending Roadmap Tasks in Recommended Order

1. Add a user-correctable import mapping step and persist the corrected mapping.
2. Expand import quality reporting to include missing plate/date/liters, invalid odometer/value, duplicate candidates, and rows rejected by reason.
3. Add explicit metric-label/summary-row rejection so labels cannot become vehicle IDs.
4. Harden anomaly rules against the roadmap: odometer regression/equal odometer, tank capacity when available, baseline-based low km/L, workspace median unit price, duplicates, frequency, missing critical fields, and pattern changes.
5. Add recommendation text to stored anomalies.
6. Introduce authentication/session APIs and enforce workspace membership on every fuel endpoint.
7. Add role behavior for owner/editor/viewer.
8. Add dedicated reports by vehicle, driver, station, period, and severity.
9. Consider PDF export only after CSV reports and role scoping are stable.

## 7. Safe Next Watcher+Codex Task Recommendation

Next safe task: improve the import preview/quality layer without changing database schema or auth. Specifically, add explicit invalid-vehicle-label rejection and rejected-row reason counts in `app.js` and the `/api/fuel/imports` quality metadata, then validate with `npm run check`.

This is the best next increment because it advances Phase 2 acceptance criteria, reduces bad data entering the system, and avoids the larger auth/schema decisions required by Phase 5.

## 8. Operational Notes

- Do not deploy unless explicitly requested.
- Do not commit unless explicitly requested.
- Use `npm run check` as the primary validation command.
- Vercel preview URLs may return `401` due to deployment protection; treat local validation as the source of truth unless preview access is deliberately opened.
