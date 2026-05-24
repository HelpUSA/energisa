const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function readRequired(fileName) {
  const filePath = path.join(root, fileName);
  assert.ok(fs.existsSync(filePath), fileName + ' must exist');
  return fs.readFileSync(filePath, 'utf8');
}

function assertContains(source, needle, label) {
  assert.ok(source.includes(needle), label + ' missing ' + needle);
}

function assertId(html, id) {
  const pattern = new RegExp(String.raw`\bid\s*=\s*["']${id}["']`);
  assert.ok(pattern.test(html), 'index.html missing #' + id);
}

function main() {
  const html = readRequired('index.html');
  const app = readRequired('app.js');
  const styles = readRequired('styles.css');

  const requiredIds = [
    'dropzone',
    'fileInput',
    'saveImportBtn',
    'toast',
    'workspaceLabel',
    'metricVehicles',
    'metricEvents',
    'metricLiters',
    'metricTotal',
    'metricKmpl',
    'metricAlerts',
  ];

  requiredIds.forEach((id) => assertId(html, id));

  [
    'id="anomalias"',
    'id="veiculos"',
    'id="anomalyRows"',
    'id="vehicleRows"',
    'id="eventRows"',
  ].forEach((needle) => assertContains(html, needle, 'index.html table section'));

  requiredIds.forEach((id) => assertContains(app, id, 'app.js selector'));
  assertContains(styles, '.dropzone', 'styles.css dropzone rules');

  console.log('UI_SMOKE_OK selectors=' + requiredIds.length + ' tables=3');
}

try {
  main();
} catch (error) {
  console.error('UI_SMOKE_FAIL');
  console.error(error && error.message ? error.message : error);
  process.exit(1);
}
