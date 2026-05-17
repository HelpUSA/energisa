const { Pool } = require('pg');
let pool; let schemaReady = false;
function getDatabaseUrl(){return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || '';}
function getPool(){const connectionString=getDatabaseUrl(); if(!connectionString){const err=new Error('DATABASE_URL não configurada. Configure a URL PostgreSQL do Railway no Vercel.'); err.code='NO_DATABASE_URL'; throw err;} if(!pool){const local=/localhost|127\\.0\\.0\\.1/i.test(connectionString); pool=new Pool({connectionString, ssl: local || process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized:false }, max:4, idleTimeoutMillis:15000});} return pool;}
async function ensureSchema(){if(schemaReady)return; const db=getPool(); await db.query(`
create table if not exists energy_imports (id bigserial primary key,file_name text not null,file_hash text not null unique,imported_at timestamptz not null default now(),row_count integer not null default 0,period_start date,period_end date,detected_columns jsonb not null default '{}'::jsonb,status text not null default 'ok');
create table if not exists energy_readings (id bigserial primary key,import_id bigint references energy_imports(id) on delete cascade,unit_name text,uc text not null,reference_month date not null,consumption_kwh numeric,amount_brl numeric,demand_kw numeric,raw jsonb not null default '{}'::jsonb,created_at timestamptz not null default now(),unique (uc, reference_month));
create table if not exists energy_anomalies (id bigserial primary key,reading_id bigint references energy_readings(id) on delete cascade,import_id bigint references energy_imports(id) on delete cascade,unit_name text,uc text not null,reference_month date not null,type text not null,severity text not null,consumption_kwh numeric,baseline_kwh numeric,variation_pct numeric,explanation text,created_at timestamptz not null default now());
create index if not exists idx_energy_readings_uc_month on energy_readings(uc, reference_month);
create index if not exists idx_energy_anomalies_severity on energy_anomalies(severity, reference_month desc);
create index if not exists idx_energy_imports_imported on energy_imports(imported_at desc);
`); schemaReady=true;}
function json(res,status,payload){res.statusCode=status; res.setHeader('Content-Type','application/json; charset=utf-8'); res.setHeader('Cache-Control','no-store'); res.end(JSON.stringify(payload));}
async function readBody(req){const chunks=[]; for await (const chunk of req) chunks.push(Buffer.from(chunk)); if(!chunks.length) return {}; return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');}
function toNumber(value){if(value===null||value===undefined||value==='')return null; const n=Number(value); return Number.isFinite(n)?n:null;}
module.exports={getDatabaseUrl,getPool,ensureSchema,json,readBody,toNumber};
