const { getPool, ensureFuelSchema, ensureDefaultWorkspace, json } = require('../../db/client');

async function handler(req, res) {
 if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method_not_allowed' });
 try {
 await ensureFuelSchema();
 const db = getPool();
 const ctx = await ensureDefaultWorkspace();
 const workspaceId = req.query && req.query.workspace_id ? req.query.workspace_id : ctx.workspace_id;
 const imports = await db.query('select id,file_name,row_count,valid_row_count,rejected_row_count,status,imported_at from fuel_imports where workspace_id=$1 order by imported_at desc limit 20', [workspaceId]);
 const metrics = await db.query('select count()::int as event_count,count(distinct vehicle_plate)::int as vehicle_count,count(distinct driver_name)::int as driver_count,coalesce(sum(liters),0)::float as liters_total,coalesce(sum(total_brl),0)::float as total_brl,avg(km_per_liter)::float as avg_km_per_liter,avg(cost_per_km)::float as avg_cost_per_km from fuel_events where workspace_id=$1', [workspaceId]);
 const recentEvents = await db.query('select id,vehicle_plate,driver_name,fuel_date,odometer_km,liters,total_brl,unit_price_brl,fuel_type,station_name,km_per_liter,cost_per_km from fuel_events where workspace_id=$1 order by fuel_date desc, created_at desc limit 50', [workspaceId]);
 const topVehicles = await db.query('select vehicle_plate,count()::int as event_count,coalesce(sum(liters),0)::float as liters_total,coalesce(sum(total_brl),0)::float as total_brl,avg(km_per_liter)::float as avg_km_per_liter from fuel_events where workspace_id=$1 group by vehicle_plate order by total_brl desc nulls last limit 15', [workspaceId]);
 const anomalies = await db.query('select a.id,a.type,a.severity,a.risk_score,a.title,a.explanation,a.details,a.created_at,e.vehicle_plate,e.driver_name,e.fuel_date,e.odometer_km,e.liters,e.total_brl,e.unit_price_brl,e.station_name from fuel_anomalies a left join fuel_events e on e.id=a.event_id where a.workspace_id=$1 order by a.risk_score desc,a.created_at desc limit 50', [workspaceId]);
 const anomalyCounts = await db.query('select severity,count(*)::int as count from fuel_anomalies where workspace_id=$1 group by severity order by severity', [workspaceId]);
 return json(res, 200, { ok: true, workspace_id: workspaceId, metrics: metrics.rows[0] || {}, imports: imports.rows, recent_events: recentEvents.rows, top_vehicles: topVehicles.rows, anomalies: anomalies.rows, anomaly_counts: anomalyCounts.rows });
 } catch (err) {
 return json(res, 500, { ok: false, error: err.message || String(err), code: err.code || 'ERROR' });
 }
}

module.exports = handler;
