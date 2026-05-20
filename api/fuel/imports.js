const { getPool, ensureFuelSchema, ensureDefaultWorkspace, json, num, text, dateOnly } = require('../../db/client');

function readBody(req) {
 return new Promise((resolve, reject) => {
 let body = '';
 req.on('data', chunk => {
 body += chunk;
 if (body.length > 12000000) reject(new Error('Request body too large'));
 });
 req.on('end', () => {
 if (!body) return resolve({});
 try { resolve(JSON.parse(body)); } catch (err) { reject(err); }
 });
 req.on('error', reject);
 });
}

function normalizePlate(value) {
 return text(value).toUpperCase().split('').filter(ch => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.includes(ch)).join('');
}

function cleanName(value) {
 return text(value).split(' ').filter(Boolean).join(' ').slice(0, 180);
}

function normalizeRow(row, index) {
 const vehiclePlate = normalizePlate(row.vehicle_plate || row.plate || row.placa || row.veiculo || row.vehicle);
 const driverName = cleanName(row.driver_name || row.driver || row.motorista || row.condutor);
 const fuelDate = dateOnly(row.fuel_date || row.date || row.data || row.abastecimento_data);
 const liters = num(row.liters ?? row.litros ?? row.volume ?? row.quantidade);
 const total = num(row.total_brl ?? row.total ?? row.valor_total ?? row.valor ?? row.value);
 const unitPrice = num(row.unit_price_brl ?? row.unit_price ?? row.preco_unitario ?? row.preco_litro);
 const odometer = num(row.odometer_km ?? row.odometer ?? row.hodometro ?? row.quilometragem ?? row.km);
 return {
 vehicle_plate: vehiclePlate,
 driver_name: driverName || null,
 fuel_date: fuelDate,
 odometer_km: odometer,
 liters,
 total_brl: total,
 unit_price_brl: unitPrice || (total && liters ? total / liters : null),
 fuel_type: cleanName(row.fuel_type || row.combustivel || row.tipo_combustivel) || null,
 station_name: cleanName(row.station_name || row.posto || row.estabelecimento || row.fornecedor) || null,
 source_row: Number.isFinite(Number(row.source_row)) ? Number(row.source_row) : index + 1,
 raw: row.raw || row,
 };
}

function buildAnomalies(events) {
 const anomalies = [];
 const byVehicle = new Map();
 const seen = new Set();
 for (const ev of events) {
 const list = byVehicle.get(ev.vehicle_plate) || [];
 const prev = list.length ? list[list.length - 1] : null;
 const key = [ev.vehicle_plate, ev.fuel_date, ev.odometer_km || '', ev.liters || '', ev.total_brl || ''].join('|');
 if (seen.has(key)) anomalies.push({ event_id: ev.id, import_id: ev.import_id, type: 'duplicate_candidate', severity: 'medium', risk_score: 45, title: 'Possivel abastecimento duplicado', explanation: 'Existe outro registro com mesmo veiculo, data, hodometro, litros e valor.', details: { key } });
 seen.add(key);
 if (!ev.odometer_km) anomalies.push({ event_id: ev.id, import_id: ev.import_id, type: 'missing_odometer', severity: 'medium', risk_score: 50, title: 'Hodometro ausente', explanation: 'Sem hodometro nao e possivel calcular Km/L nem validar distancia percorrida.', details: {} });
 if (!ev.liters || Number(ev.liters) <= 0) anomalies.push({ event_id: ev.id, import_id: ev.import_id, type: 'invalid_liters', severity: 'high', risk_score: 70, title: 'Litros invalidos', explanation: 'O volume abastecido esta ausente, zerado ou negativo.', details: { liters: ev.liters } });
 if (ev.liters && Number(ev.liters) > 250) anomalies.push({ event_id: ev.id, import_id: ev.import_id, type: 'excessive_volume', severity: 'high', risk_score: 75, title: 'Volume abastecido muito alto', explanation: 'O volume informado parece alto para um abastecimento unitario de veiculo leve ou medio.', details: { liters: ev.liters } });
 if (ev.unit_price_brl && Number(ev.unit_price_brl) > 12) anomalies.push({ event_id: ev.id, import_id: ev.import_id, type: 'high_unit_price', severity: 'medium', risk_score: 55, title: 'Preco por litro elevado', explanation: 'O preco por litro esta acima do limite inicial de auditoria configurado.', details: { unit_price_brl: ev.unit_price_brl } });
 if (prev && ev.odometer_km && prev.odometer_km) {
 const distance = Number(ev.odometer_km) - Number(prev.odometer_km);
 if (distance < 0) anomalies.push({ event_id: ev.id, import_id: ev.import_id, type: 'odometer_regression', severity: 'critical', risk_score: 95, title: 'Hodometro regrediu', explanation: 'O hodometro atual e menor que o registro anterior do mesmo veiculo.', details: { previous_odometer: prev.odometer_km, current_odometer: ev.odometer_km } });
 else if (distance === 0) anomalies.push({ event_id: ev.id, import_id: ev.import_id, type: 'zero_distance', severity: 'high', risk_score: 80, title: 'Abastecimento sem distancia registrada', explanation: 'O hodometro nao mudou entre dois abastecimentos do mesmo veiculo.', details: { previous_odometer: prev.odometer_km, current_odometer: ev.odometer_km } });
 else if (ev.liters && distance / Number(ev.liters) < 3) anomalies.push({ event_id: ev.id, import_id: ev.import_id, type: 'low_efficiency', severity: 'high', risk_score: 82, title: 'Km/L muito baixo', explanation: 'A relacao entre distancia percorrida e litros abastecidos esta abaixo do limite inicial.', details: { distance_km: distance, liters: ev.liters, km_per_liter: distance / Number(ev.liters) } });
 }
 list.push(ev);
 byVehicle.set(ev.vehicle_plate, list);
 }
 return anomalies;
}

async function handler(req, res) {
 if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });
 try {
 await ensureFuelSchema();
 const db = getPool();
 const body = await readBody(req);
 const rows = Array.isArray(body.rows) ? body.rows : [];
 const normalized = rows.map(normalizeRow);
 const valid = normalized.filter(r => r.vehicle_plate && r.fuel_date && r.liters !== null);
 const rejected = normalized.length - valid.length;
 const ctx = await ensureDefaultWorkspace();
 const requestedWorkspaceId = body.workspace_id || (req.query && req.query.workspace_id);
 const workspaceId = requestedWorkspaceId || ctx.workspace_id;

 const userId = body.user_id || ctx.user_id;
 if (!valid.length) return json(res, 400, { ok: false, error: 'no_valid_fuel_rows', row_count: rows.length, rejected_row_count: rejected });
 const client = await db.connect();
 try {
 await client.query('begin');
 const imp = await client.query('insert into fuel_imports(workspace_id,user_id,file_name,file_hash,row_count,valid_row_count,rejected_row_count,mapping_json,quality_report_json,status) values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10) on conflict do nothing returning id', [workspaceId, userId, body.file_name || 'fuel-import', body.file_hash || null, rows.length, valid.length, rejected, JSON.stringify(body.mapping || {}), JSON.stringify({ rejected_row_count: rejected }), 'imported']);
 let importId = imp.rows[0] && imp.rows[0].id;
 if (!importId) {
 const old = await client.query('select id from fuel_imports where workspace_id=$1 and file_hash=$2 order by imported_at desc limit 1', [workspaceId, body.file_hash || null]);
 importId = old.rows[0] && old.rows[0].id;
 await client.query('delete from fuel_events where import_id=$1', [importId]);
 await client.query('update fuel_imports set file_name=$2,row_count=$3,valid_row_count=$4,rejected_row_count=$5,mapping_json=$6::jsonb,quality_report_json=$7::jsonb,imported_at=now() where id=$1', [importId, body.file_name || 'fuel-import', rows.length, valid.length, rejected, JSON.stringify(body.mapping || {}), JSON.stringify({ rejected_row_count: rejected })]);
 }
 for (const r of valid) {
 const vehicle = await client.query('insert into vehicles(workspace_id,plate,name) values($1,$2,$2) on conflict(workspace_id,plate) do update set plate=excluded.plate returning id', [workspaceId, r.vehicle_plate]);
 let driverId = null;
 if (r.driver_name) {
 const driver = await client.query('insert into drivers(workspace_id,name) values($1,$2) on conflict(workspace_id,name) do update set name=excluded.name returning id', [workspaceId, r.driver_name]);
 driverId = driver.rows[0].id;
 }
 await client.query('insert into fuel_events(workspace_id,import_id,vehicle_id,driver_id,vehicle_plate,driver_name,fuel_date,odometer_km,liters,total_brl,unit_price_brl,fuel_type,station_name,source_row,raw) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)', [workspaceId, importId, vehicle.rows[0].id, driverId, r.vehicle_plate, r.driver_name, r.fuel_date, r.odometer_km, r.liters, r.total_brl, r.unit_price_brl, r.fuel_type, r.station_name, r.source_row, JSON.stringify(r.raw || {})]);
 }
 await client.query('with ordered as (select id, liters, total_brl, odometer_km, lag(odometer_km) over(partition by workspace_id, vehicle_plate order by fuel_date, source_row, created_at) prev_odometer from fuel_events where workspace_id=$1), calc as (select id, case when liters > 0 and odometer_km is not null and prev_odometer is not null and odometer_km > prev_odometer then (odometer_km - prev_odometer) / liters else null end kmpl, case when total_brl is not null and odometer_km is not null and prev_odometer is not null and odometer_km > prev_odometer then total_brl / (odometer_km - prev_odometer) else null end costkm from ordered) update fuel_events e set km_per_liter=calc.kmpl,cost_per_km=calc.costkm from calc where e.id=calc.id', [workspaceId]);
 await client.query('delete from fuel_anomalies where workspace_id=$1', [workspaceId]);
 const allEvents = await client.query('select * from fuel_events where workspace_id=$1 order by vehicle_plate, fuel_date, source_row, created_at', [workspaceId]);
 const anomalies = buildAnomalies(allEvents.rows);
 for (const a of anomalies) await client.query('insert into fuel_anomalies(workspace_id,event_id,import_id,type,severity,risk_score,title,explanation,details) values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)', [workspaceId, a.event_id, a.import_id, a.type, a.severity, a.risk_score, a.title, a.explanation, JSON.stringify(a.details || {})]);
 await client.query('commit');
 return json(res, 200, { ok: true, import_id: importId, workspace_id: workspaceId, row_count: rows.length, valid_row_count: valid.length, rejected_row_count: rejected, anomaly_count: anomalies.length });
 } catch (err) {
 await client.query('rollback');
 throw err;
 } finally {
 client.release();
 }
 } catch (err) {
 return json(res, 500, { ok: false, error: err.message || String(err), code: err.code || 'ERROR' });
 }
}

module.exports = handler;
