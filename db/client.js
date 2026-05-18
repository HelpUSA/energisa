const { Pool } = require('pg');

let pool;
let schemaReady = false;
let fuelSchemaReady = false;

function getDatabaseUrl() {
 return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || '';
}

function getPool() {
 const connectionString = getDatabaseUrl();
 if (!connectionString) {
 const err = new Error('DATABASE_URL not configured. Configure the Railway PostgreSQL URL in Vercel.');
 err.code = 'NO_DATABASE_URL';
 throw err;
 }
 if (!pool) {
 const local = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
 pool = new Pool({
 connectionString,
 ssl: local || process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
 max: 4,
 idleTimeoutMillis: 15000,
 });
 }
 return pool;
}

async function ensureSchema() {
 if (schemaReady) return;
 const db = getPool();
 await db.query(`
create table if not exists energy_imports (id bigserial primary key,file_name text not null,file_hash text not null unique,imported_at timestamptz not null default now(),row_count integer not null default 0,period_start date,period_end date,detected_columns jsonb not null default '{}'::jsonb,status text not null default 'ok');
create table if not exists energy_readings (id bigserial primary key,import_id bigint references energy_imports(id) on delete cascade,unit_name text,uc text not null,reference_month date not null,consumption_kwh numeric,amount_brl numeric,demand_kw numeric,raw jsonb not null default '{}'::jsonb,created_at timestamptz not null default now(),unique (uc, reference_month));
create table if not exists energy_anomalies (id bigserial primary key,reading_id bigint references energy_readings(id) on delete cascade,import_id bigint references energy_imports(id) on delete cascade,unit_name text,uc text not null,reference_month date not null,type text not null,severity text not null,consumption_kwh numeric,baseline_kwh numeric,variation_pct numeric,explanation text,created_at timestamptz not null default now());
create index if not exists idx_energy_readings_uc_month on energy_readings(uc, reference_month);
create index if not exists idx_energy_anomalies_severity on energy_anomalies(severity, reference_month desc);
create index if not exists idx_energy_imports_imported on energy_imports(imported_at desc);
 `);
 schemaReady = true;
}

async function ensureFuelSchema() {
 if (fuelSchemaReady) return;
 const db = getPool();
 await db.query(`
create extension if not exists pgcrypto;
create table if not exists app_users (id uuid primary key default gen_random_uuid(),email text unique not null,name text,created_at timestamptz not null default now());
create table if not exists workspaces (id uuid primary key default gen_random_uuid(),owner_user_id uuid references app_users(id) on delete set null,name text not null,description text,created_at timestamptz not null default now(),unique(owner_user_id,name));
create table if not exists workspace_members (workspace_id uuid references workspaces(id) on delete cascade,user_id uuid references app_users(id) on delete cascade,role text not null default 'owner',created_at timestamptz not null default now(),primary key(workspace_id,user_id));
create table if not exists vehicles (id uuid primary key default gen_random_uuid(),workspace_id uuid references workspaces(id) on delete cascade,plate text not null,name text,vehicle_type text,tank_capacity_liters numeric,active boolean not null default true,created_at timestamptz not null default now(),unique(workspace_id,plate));
create table if not exists drivers (id uuid primary key default gen_random_uuid(),workspace_id uuid references workspaces(id) on delete cascade,name text not null,active boolean not null default true,created_at timestamptz not null default now(),unique(workspace_id,name));
create table if not exists fuel_imports (id uuid primary key default gen_random_uuid(),workspace_id uuid references workspaces(id) on delete cascade,user_id uuid references app_users(id) on delete set null,file_name text not null,file_hash text,row_count integer not null default 0,valid_row_count integer not null default 0,rejected_row_count integer not null default 0,mapping_json jsonb not null default '{}'::jsonb,quality_report_json jsonb not null default '{}'::jsonb,status text not null default 'imported',imported_at timestamptz not null default now());
create unique index if not exists idx_fuel_imports_workspace_hash on fuel_imports(workspace_id,file_hash) where file_hash is not null;
create table if not exists fuel_events (id uuid primary key default gen_random_uuid(),workspace_id uuid references workspaces(id) on delete cascade,import_id uuid references fuel_imports(id) on delete cascade,vehicle_id uuid references vehicles(id) on delete set null,driver_id uuid references drivers(id) on delete set null,vehicle_plate text not null,driver_name text,fuel_date date not null,odometer_km numeric,liters numeric,total_brl numeric,unit_price_brl numeric,fuel_type text,station_name text,km_per_liter numeric,cost_per_km numeric,source_row integer,raw jsonb not null default '{}'::jsonb,created_at timestamptz not null default now());
create index if not exists idx_fuel_events_workspace_date on fuel_events(workspace_id,fuel_date desc);
create index if not exists idx_fuel_events_vehicle_date on fuel_events(vehicle_plate,fuel_date desc);
create table if not exists fuel_anomalies (id uuid primary key default gen_random_uuid(),workspace_id uuid references workspaces(id) on delete cascade,event_id uuid references fuel_events(id) on delete cascade,import_id uuid references fuel_imports(id) on delete cascade,type text not null,severity text not null,risk_score integer not null default 0,title text not null,explanation text,details jsonb not null default '{}'::jsonb,created_at timestamptz not null default now());
create index if not exists idx_fuel_anomalies_workspace_score on fuel_anomalies(workspace_id,risk_score desc,created_at desc);
 `);
 fuelSchemaReady = true;
}

async function ensureDefaultWorkspace() {
 await ensureFuelSchema();
 const db = getPool();
 const email = process.env.DEFAULT_USER_EMAIL || 'default@local';
 const name = process.env.DEFAULT_USER_NAME || 'Default User';
 const workspace = process.env.DEFAULT_WORKSPACE_NAME || 'Default Fleet Study';
 const result = await db.query(`
with u as (
 insert into app_users(email,name) values($1,$2)
 on conflict(email) do update set name = coalesce(app_users.name, excluded.name)
 returning id
), w as (
 insert into workspaces(owner_user_id,name,description)
 select id,$3,'Default workspace for fleet fuel analysis' from u
 on conflict(owner_user_id,name) do update set name = excluded.name
 returning id, owner_user_id
), m as (
 insert into workspace_members(workspace_id,user_id,role)
 select id, owner_user_id, 'owner' from w
 on conflict(workspace_id,user_id) do update set role = excluded.role
 returning workspace_id,user_id
)
select (select id from u) as user_id, (select id from w) as workspace_id;
 `, [email, name, workspace]);
 return result.rows[0];
}

function json(res, status, payload) {
 res.statusCode = status;
 res.setHeader('Content-Type', 'application/json; charset=utf-8');
 res.setHeader('Cache-Control', 'no-store');
 res.end(JSON.stringify(payload));
}

function num(value) {
 if (value === null || value === undefined || value === '') return null;
 if (typeof value === 'number') return Number.isFinite(value) ? value : null;
 let s = String(value).trim();
 if (!s) return null;
 s = s.replace(/[^0-9,.-]/g, '');
 if (!s) return null;
 if (s.includes(',') && s.includes('.')) s = s.replace(/[.]/g, '').replace(',', '.');
 else if (s.includes(',')) s = s.replace(',', '.');
 const n = Number(s);
 return Number.isFinite(n) ? n : null;
}

function text(value) {
 if (value === null || value === undefined) return '';
 return String(value).trim();
}

function dateOnly(value) {
 if (!value) return null;
 if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
 const s = String(value).trim();
 const iso = s.match(new RegExp('^(20[0-9]{2}|19[0-9]{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12][0-9]|3[01])$'));
 if (iso) return `${iso[1]}-${String(iso[2]).padStart(2, '0')}-${String(iso[3]).padStart(2, '0')}`;
 const br = s.match(new RegExp('^(0?[1-9]|[12][0-9]|3[01])[-/](0?[1-9]|1[0-2])[-/]((?:20|19)[0-9]{2})$'));
 if (br) return `${br[3]}-${String(br[2]).padStart(2, '0')}-${String(br[1]).padStart(2, '0')}`;
 const d = new Date(s);
 return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

module.exports = { getPool, ensureSchema, ensureFuelSchema, ensureDefaultWorkspace, json, num, text, dateOnly };
