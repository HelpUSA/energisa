# Energisa / Fleet Fuel Anomaly Analyzer — Roadmap

Last update: 2026-05-18
Project root: D:/dev/energisa

## 1. Objective

Evolve the current dashboard from a generic consumption analyzer into a vehicle-fueling anomaly detection system.

The system must import fueling spreadsheets, organize records by user and workspace/study, detect suspicious vehicle fueling patterns, and present clear audit explanations.

## 2. Main Product Goals

- Import CSV, XLS, and XLSX fueling files.
- Detect and map common spreadsheet columns before saving.
- Prevent measure labels such as Km/L, Litros, Total, or R$ from becoming vehicle identifiers.
- Store fuel events with vehicle, driver, odometer, liters, value, station, fuel type, and date.
- Calculate km/L, cost per km, and price per liter when possible.
- Detect anomalies using deterministic audit rules first.
- Add risk scoring per fuel event.
- Support multiple users and separate workspaces/studies.
- Keep every dashboard and API response scoped by workspace.

## 3. Core Domain Model

Recommended entities:

text
User
 -> Workspace / Study
 -> Vehicles
 -> Drivers
 -> Fuel imports
 -> Fuel events
 -> Audit rules
 -> Anomalies
 -> Reports


Recommended database tables:

text
users
workspaces
workspace_members
vehicles
drivers
fuel_imports
fuel_events
fuel_anomalies
audit_rules


## 4. Fuel Event Fields

Core fields per fueling event:

| Field | Meaning | Required |
|---|---|---:|
| vehicle_plate | Vehicle plate or identifier | Yes |
| vehicle_name | Vehicle description | No |
| driver_name | Driver name | No |
| fuel_date | Fueling date/time | Yes |
| odometer_km | Odometer at fueling | Strongly recommended |
| liters | Liters fueled | Yes |
| total_brl | Total amount paid | Recommended |
| unit_price_brl | Price per liter | Recommended |
| fuel_type | Gasoline, ethanol, diesel, etc. | Recommended |
| station_name | Fuel station/vendor | No |
| km_per_liter | Efficiency | Derived/recommended |
| cost_per_km | Cost efficiency | Derived |
| source_file | Import source file | Yes |
| source_row | Original row number | Yes |

## 5. Multi-User and Workspace Isolation

The site must support multiple users without mixing studies.

Recommended roles:

| Role | Permissions |
|---|---|
| owner | Manage workspace, import data, delete data, invite users |
| editor | Import and correct data |
| viewer | View dashboards and reports only |

Isolation rule:

text
Every API endpoint must validate membership and filter by workspace_id.
No vehicle, import, anomaly, or dashboard record should be returned without workspace scoping.


## 6. Import and Column Mapping

The parser should detect common aliases:

| Canonical field | Common names |
|---|---|
| vehicle_plate | placa, veiculo, veículo, frota, prefixo |
| driver_name | motorista, condutor, colaborador, empregado |
| fuel_date | data, data_abastecimento, dt, emissao, emissão |
| odometer_km | odometro, hodometro, km, quilometragem |
| liters | litros, volume, qtd, quantidade |
| total_brl | valor, valor_total, total, r$ |
| unit_price_brl | preco_litro, preço, valor_unitario |
| fuel_type | combustivel, combustível, produto |
| station_name | posto, fornecedor, estabelecimento |

Before saving, show a mapping preview and allow user correction.

Every import must generate a quality report:

- rows read;
- valid rows;
- rejected rows;
- missing plate;
- missing date;
- missing liters;
- invalid odometer;
- invalid value;
- duplicate candidates.

## 7. Anomaly Detection Rules

### Rule A — Odometer Regression

Flag when current odometer is lower than previous odometer for the same vehicle.

Severity:

- critical if odometer decreases.
- high if odometer is equal but liters are greater than zero on different dates.

### Rule B — Impossibly High Fuel Volume

Flag when liters exceed known or estimated tank capacity.

Severity:

- critical if liters > 120% of tank capacity.
- high if liters > 100% of tank capacity.

### Rule C — Low Km/L vs Vehicle Baseline

Calculate baseline only after enough valid history exists for that vehicle.

text
km_per_liter = distance_since_previous_fueling / liters


Severity:

- medium for 25% below baseline.
- high for 40% below baseline.
- critical for 60% below baseline.

### Rule D — High Unit Price

Compare unit price to the same fuel type, same period, and same workspace.

Severity:

- medium if > 15% above median.
- high if > 30% above median.
- critical if > 50% above median.

### Rule E — Duplicate Fueling Candidate

Flag likely duplicates when the same vehicle has near-matching date, liters, total value, and station.

### Rule F — Unusually Frequent Fueling

Flag when the same vehicle has multiple fueling events too close together, especially when odometer movement is low.

### Rule G — Missing Critical Fields

Rows with missing plate, date, or liters should not be silently accepted.

### Rule H — Driver / Vehicle / Station Pattern Change

When enough data exists, flag unusual driver-vehicle-station combinations as low or medium severity.

## 8. Risk Score

Each fuel event should receive a score from 0 to 100.

Suggested composition:

| Signal | Max points |
|---|---:|
| Odometer inconsistency | 30 |
| Low km/L vs baseline | 25 |
| Excess liters vs tank | 25 |
| High unit price | 10 |
| Duplicate candidate | 20 |
| Missing critical fields | 15 |
| Unusual driver/station pattern | 10 |

Final severity:

text
0-30: normal
31-60: attention
61-80: suspicious
81-100: critical


## 9. Dashboard Design

Main cards:

- total fuel events;
- vehicles analyzed;
- total liters;
- total cost;
- average km/L;
- alerts found.

Priority views:

- Top 10 highest-risk fuel events;
- vehicles with worst km/L;
- vehicles with largest km/L variation;
- drivers with most alerts;
- stations with highest average unit price;
- data quality issues.

Reports:

- by vehicle;
- by driver;
- by station;
- by fuel type;
- by month;
- by severity.

## 10. API Plan

Authentication:

text
POST /api/auth/login
POST /api/auth/logout
GET /api/auth/me


Workspaces:

text
GET /api/workspaces
POST /api/workspaces
GET /api/workspaces/:id
PATCH /api/workspaces/:id


Fuel imports:

text
POST /api/fuel/import-preview
POST /api/fuel/import-commit
GET /api/fuel/imports?workspace_id=...


Dashboard:

text
GET /api/fuel/summary?workspace_id=...
GET /api/fuel/events?workspace_id=...
GET /api/fuel/anomalies?workspace_id=...
GET /api/fuel/quality?workspace_id=...


Reports:

text
GET /api/fuel/reports/vehicles?workspace_id=...
GET /api/fuel/reports/drivers?workspace_id=...
GET /api/fuel/reports/stations?workspace_id=...


## 11. Implementation Phases

### Phase 1 — Documentation and Domain Model

- Create this roadmap under docs/.
- Define the fuel-specific schema.
- Keep current production stable.

### Phase 2 — Fuel Parser MVP

- Add parser for vehicle fueling spreadsheets.
- Detect vehicle/date/liters/value/odometer columns.
- Show mapping preview and quality report.
- Prevent metric labels from becoming vehicle IDs.

### Phase 3 — Fuel Tables and APIs

- Create fuel_* and workspace_* tables.
- Add workspace scoping.
- Store raw row JSON and import quality metadata.

### Phase 4 — Anomaly Engine

- Implement deterministic audit rules first.
- Add risk score.
- Store explanation and recommendation for each anomaly.

### Phase 5 — Multi-User MVP

- Add login/session.
- Add users, workspaces, members, and roles.
- Ensure all API queries are workspace-scoped.

### Phase 6 — Reports and Export

- Add CSV export.
- Add report pages by vehicle, driver, station, period, and severity.
- Add PDF export later if needed.

## 12. Acceptance Criteria

Parser:

- Imports realistic fueling spreadsheets.
- Does not interpret Km/L as a vehicle.
- Shows mapping before saving.
- Reports rejected rows clearly.

Anomaly engine:

- Detects odometer regression.
- Detects over-capacity fueling when tank capacity is available.
- Detects low km/L after enough history exists.
- Explains every alert in plain language.

Multi-user:

- User A cannot see User B workspaces.
- Workspace A data never appears in Workspace B.
- Owner, editor, and viewer roles behave differently.

UI:

- No technical database sections in user-facing dashboard.
- Import flow is simple.
- Audit messages explain whether there is enough history.

## 13. Email Notification Constraint

The assistant cannot directly send external email from chat unless an email-sending service, SMTP account, or API is already configured and explicitly authorized in the local environment.

Recommended manual email message:

text
Subject: Energisa analyzer paused

The Energisa vehicle-fueling anomaly analyzer work is paused. I am waiting for your instruction to continue.


Requested recipient: helpus.commerce@gmail.com

## 14. Operational Notes

Implementation should follow the AI Bridge watcher discipline already used in this project:

- one watcher command per message;
- short JSON envelopes;
- forward slashes in paths;
- temporary scripts for larger logic;
- syntax validation before commit;
- commit only after validation;
- deploy after meaningful milestones.
