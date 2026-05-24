const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const importsPath = path.join(root, 'api', 'fuel', 'imports.js');

function loadParserHelpers() {
  const source = fs.readFileSync(importsPath, 'utf8');
  const module = { exports: {} };
  const context = {
    require: Module.createRequire(importsPath),
    module,
    exports: module.exports,
    console,
  };

  vm.runInNewContext(
    source + '\nmodule.exports.__parserSmoke = { normalizeRow, rowRejectionReasons, buildQualityReport, isMetricLabelVehicle };',
    context,
    { filename: importsPath }
  );

  return module.exports.__parserSmoke;
}

function assertNoReasons(row, helpers, label) {
  const reasons = helpers.rowRejectionReasons(row);
  assert.equal(reasons.length, 0, label + ' should be accepted, got reasons: ' + reasons.join(','));
}

function assertHasReason(row, helpers, reason, label) {
  const reasons = helpers.rowRejectionReasons(row);
  assert.ok(reasons.includes(reason), label + ' should include ' + reason + ', got: ' + reasons.join(','));
}

function main() {
  const helpers = loadParserHelpers();

  const validRows = [
    {
      placa: 'ABC-1D23',
      data: '24/05/2026',
      litros: '42,5',
      valor: '255,00',
      motorista: 'Ana Souza',
      posto: 'Posto Centro',
    },
    {
      veiculo: 'FROTA 7421',
      date: '2026-05-23',
      volume: '38.20',
      preco_unitario: '5,89',
      combustivel: 'Diesel S10',
    },
  ].map((row, index) => helpers.normalizeRow(row, index));

  assert.equal(validRows[0].vehicle_plate, 'ABC1D23', 'valid plate should normalize punctuation');
  assert.equal(validRows[0].fuel_date, '2026-05-24', 'valid BR date should normalize to ISO date');
  assert.equal(validRows[0].liters, 42.5, 'valid liters should parse decimal comma');
  assert.ok(Math.abs(validRows[0].unit_price_brl - 6) < 0.000001, 'unit price should be derived from total/liters');
  assert.equal(validRows[1].vehicle_plate, 'FROTA7421', 'vehicle identifier should normalize spaces');
  assert.equal(validRows[1].unit_price_brl, 5.89, 'explicit unit price should parse decimal comma');
  validRows.forEach((row, index) => assertNoReasons(row, helpers, 'valid row #' + (index + 1)));

  const metricVehicleLabels = ['Km/L', 'Litros', 'Total', 'R$', 'Valor', 'Preço', 'Preco', 'Pre?o', 'Média', 'Media', 'M?dia'];
  const metricRows = metricVehicleLabels.map((label, index) => helpers.normalizeRow({
    placa: label,
    data: '2026-05-24',
    litros: '10',
    valor: '60',
  }, index + validRows.length));

  metricRows.forEach((row, index) => {
    const label = metricVehicleLabels[index];
    assert.equal(row.vehicle_plate, '', 'metric label vehicle should be blanked: ' + label);
    assertHasReason(row, helpers, 'metric_label_vehicle', 'metric label vehicle ' + label);
    assertHasReason(row, helpers, 'missing_vehicle', 'metric label vehicle ' + label);
  });

  const missingRows = [
    helpers.normalizeRow({ data: '2026-05-24', litros: '12', valor: '72' }, 100),
    helpers.normalizeRow({ placa: 'XYZ9A88', litros: '12', valor: '72' }, 101),
    helpers.normalizeRow({ placa: 'XYZ9A89', data: '2026-05-24', valor: '72' }, 102),
  ];

  assertHasReason(missingRows[0], helpers, 'missing_vehicle', 'row missing vehicle');
  assertHasReason(missingRows[1], helpers, 'missing_date', 'row missing date');
  assertHasReason(missingRows[2], helpers, 'missing_liters', 'row missing liters');

  const normalized = validRows.concat(metricRows, missingRows);
  const rejected = normalized.filter((row) => helpers.rowRejectionReasons(row).length > 0).length;
  const qualityReport = helpers.buildQualityReport(normalized, rejected);

  assert.equal(rejected, metricRows.length + missingRows.length, 'rejected row count mismatch');
  assert.equal(qualityReport.rejected_row_count, rejected, 'quality report rejected row count mismatch');
  assert.ok(qualityReport.rejected_reason_counts, 'quality report must include rejected_reason_counts');
  assert.equal(qualityReport.rejected_reason_counts.metric_label_vehicle, metricRows.length, 'metric_label_vehicle count mismatch');
  assert.equal(qualityReport.rejected_reason_counts.missing_vehicle, metricRows.length + 1, 'missing_vehicle count mismatch');
  assert.equal(qualityReport.rejected_reason_counts.missing_date, 1, 'missing_date count mismatch');
  assert.equal(qualityReport.rejected_reason_counts.missing_liters, 1, 'missing_liters count mismatch');

  console.log(
    'PARSER_QUALITY_SMOKE_OK valid=' + validRows.length +
    ' metric_labels=' + metricRows.length +
    ' rejected=' + rejected +
    ' reasons=' + Object.keys(qualityReport.rejected_reason_counts).sort().join(',')
  );
}

try {
  main();
} catch (error) {
  console.error('PARSER_QUALITY_SMOKE_FAIL');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
}
