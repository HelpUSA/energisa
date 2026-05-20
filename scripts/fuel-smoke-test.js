const assert = require('node:assert/strict');
const baseUrl = (process.env.BASE_URL || 'https://energisa.helpusbr.com').replace(/\/$/ , '');
async function getJson(path) {
 const response = await fetch(baseUrl + path, { headers: { accept: 'application/json' } });
 const text = await response.text();
 assert.equal(response.ok, true, path + ' failed with ' + response.status + ': ' + text.slice(0, 300));
 return JSON.parse(text);
}
async function getText(path) {
 const response = await fetch(baseUrl + path);
 const text = await response.text();
 assert.equal(response.ok, true, path + ' failed with ' + response.status + ': ' + text.slice(0, 300));
 return { response, text };
}
async function main() {
 console.log('FUEL_SMOKE_BASE=' + baseUrl);
 const workspaces = await getJson('/api/fuel/workspaces');
 assert.equal(workspaces.ok, true);
 assert.ok(Array.isArray(workspaces.workspaces), 'workspaces must be an array');
 assert.ok(workspaces.workspaces.length >= 1, 'at least one workspace is expected');
 const workspaceId = workspaces.default_workspace_id || workspaces.workspaces[0].id;
 assert.ok(workspaceId, 'workspace id is required');
 const summary = await getJson('/api/fuel/summary?workspace_id=' + encodeURIComponent(workspaceId));
 assert.equal(summary.ok, true);
 assert.ok(summary.metrics, 'summary metrics are required');
 assert.ok(Number(summary.metrics.event_count) >= 0, 'event_count must be numeric');
 assert.ok(Array.isArray(summary.imports), 'imports must be an array');
 assert.ok(Array.isArray(summary.recent_events), 'recent_events must be an array');
 assert.ok(Array.isArray(summary.top_vehicles), 'top_vehicles must be an array');
 assert.ok(Array.isArray(summary.anomalies), 'anomalies must be an array');
 const anomaliesCsv = await getText('/api/fuel/export?type=anomalies&workspace_id=' + encodeURIComponent(workspaceId));
 assert.ok(anomaliesCsv.text.startsWith('severity;risk_score;type;title;explanation'), 'anomalies CSV header mismatch');
 const eventsCsv = await getText('/api/fuel/export?type=events&workspace_id=' + encodeURIComponent(workspaceId));
 assert.ok(eventsCsv.text.startsWith('fuel_date;vehicle_plate;driver_name'), 'events CSV header mismatch');
 console.log('FUEL_SMOKE_OK workspace=' + workspaceId + ' events=' + summary.metrics.event_count + ' imports=' + summary.imports.length);
}
main().catch((error) => {
 console.error('FUEL_SMOKE_FAIL');
 console.error(error && error.stack ? error.stack : error);
 process.exit(1);
});
