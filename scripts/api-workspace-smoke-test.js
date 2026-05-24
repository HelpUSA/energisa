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

function assertPattern(source, pattern, label) {
  assert.ok(pattern.test(source), label + ' missing ' + pattern);
}

function main() {
  const pkg = JSON.parse(readRequired('package.json'));
  const imports = readRequired('api/fuel/imports.js');
  const summary = readRequired('api/fuel/summary.js');
  const exportRoute = readRequired('api/fuel/export.js');
  const workspaces = readRequired('api/fuel/workspaces.js');
  const app = readRequired('app.js');
  const db = readRequired('db/client.js');

  assert.equal(
    pkg.scripts && pkg.scripts['smoke:api-workspace'],
    'node scripts/api-workspace-smoke-test.js',
    'package.json must expose smoke:api-workspace'
  );

  [
    ['api/fuel/imports.js', imports],
    ['api/fuel/summary.js', summary],
    ['api/fuel/export.js', exportRoute],
  ].forEach(([label, source]) => {
    assertContains(source, 'workspace_id', label);
    assertPattern(source, /where\s+\w*\.?workspace_id\s*=\s*\$1/i, label + ' scoped query');
  });

  assertContains(workspaces, 'ensureDefaultWorkspace', 'api/fuel/workspaces.js');
  assertContains(workspaces, 'workspaces', 'api/fuel/workspaces.js');
  assertContains(workspaces, 'workspace_members', 'api/fuel/workspaces.js');
  assertPattern(workspaces, /req\.method\s*===\s*['"]GET['"]/, 'api/fuel/workspaces.js GET handling');
  assertPattern(workspaces, /req\.method\s*===\s*['"]POST['"]/, 'api/fuel/workspaces.js POST handling');

  [
    '/api/fuel/workspaces',
    '/api/fuel/summary',
    '/api/fuel/imports',
    '/api/fuel/export',
    'workspace_id',
    'currentWorkspaceId',
    'energisa_workspace_id',
    'workspaceSelect',
    'createWorkspaceBtn',
  ].forEach((needle) => assertContains(app, needle, 'app.js workspace API wiring'));

  assertContains(db, 'create table if not exists workspaces', 'db/client.js');
  assertContains(db, 'create table if not exists workspace_members', 'db/client.js');
  assertContains(db, 'ensureDefaultWorkspace', 'db/client.js');

  console.log('API_WORKSPACE_SMOKE_OK routes=4 app_hooks=9 db_helpers=3');
}

try {
  main();
} catch (error) {
  console.error('API_WORKSPACE_SMOKE_FAIL');
  console.error(error && error.message ? error.message : error);
  process.exit(1);
}
