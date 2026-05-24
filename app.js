const $ = (id) => document.getElementById(id);
const state = { meta: null, charts: {} };

function fmtNumber(value, digits = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '-';
}
function fmtMoney(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'R$ 0,00';
}
function fmtDate(value) {
  if (!value) return '-';
  const s = String(value).slice(0, 10);
  const d = new Date(s + 'T00:00:00');
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('pt-BR');
}
function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}
function toast(message) {
  const el = $('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
}
async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json; charset=utf-8', ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.error || 'HTTP ' + response.status);
  return data;
}
function norm(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}
function parseNumber(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  let s = String(value).replace(/[^0-9,.-]/g, '');
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/[.]/g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function parseDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const s = String(value).trim();
  let m = s.match(/(20[0-9]{2}|19[0-9]{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12][0-9]|3[01])/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  m = s.match(/(0?[1-9]|[12][0-9]|3[01])[-/](0?[1-9]|1[0-2])[-/](20[0-9]{2}|19[0-9]{2})/);
  if (m) return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
function pickColumn(headers, patterns) {
  const scored = headers.map((header) => {
    const name = norm(header);
    let score = 0;
    patterns.forEach((pattern, index) => {
      if (pattern.test(name)) score = Math.max(score, 100 - index);
    });
    return { header, score };
  }).sort((a, b) => b.score - a.score);
  return scored[0] && scored[0].score ? scored[0].header : null;
}
function detectColumns(headers) {
  return {
    vehicle_plate: pickColumn(headers, [/^placa$/, /placa.*veic/, /veic.*placa/, /^veiculo$/, /prefixo/, /plate/]),
    fuel_date: pickColumn(headers, [/data.*abast/, /abast.*data/, /^data$/, /date/, /emissao/]),
    odometer_km: pickColumn(headers, [/hodometro/, /odometro/, /quilometragem/, /^km$/, /odometer/]),
    liters: pickColumn(headers, [/litro/, /volume/, /quantidade/, /^qtd$/, /combustivel.*qtd/]),
    total_brl: pickColumn(headers, [/valor.*total/, /total.*r/, /^total$/, /^valor$/, /vlr/, /custo/]),
    unit_price_brl: pickColumn(headers, [/preco.*litro/, /valor.*litro/, /unitario/, /preco.*unit/, /vlr.*unit/]),
    driver_name: pickColumn(headers, [/motorista/, /condutor/, /driver/, /usuario/, /colaborador/]),
    station_name: pickColumn(headers, [/posto/, /estabelecimento/, /fornecedor/, /station/, /local/]),
    fuel_type: pickColumn(headers, [/combustivel/, /produto/, /tipo/]),
  };
}
async function fileHash(file) {
  const text = `${file.name}|${file.size}|${file.lastModified}`;
  if (!crypto.subtle) return String(text.length);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function parseFile(file) {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });
  const headers = Object.keys(rawRows[0] || {});
  const mapping = detectColumns(headers);
  const cell = (row, key) => mapping[key] ? row[mapping[key]] : null;
  const rows = rawRows.map((row, index) => ({
    vehicle_plate: String(cell(row, 'vehicle_plate') || '').trim(),
    fuel_date: parseDateOnly(cell(row, 'fuel_date')),
    odometer_km: parseNumber(cell(row, 'odometer_km')),
    liters: parseNumber(cell(row, 'liters')),
    total_brl: parseNumber(cell(row, 'total_brl')),
    unit_price_brl: parseNumber(cell(row, 'unit_price_brl')),
    driver_name: String(cell(row, 'driver_name') || '').trim(),
    station_name: String(cell(row, 'station_name') || '').trim(),
    fuel_type: String(cell(row, 'fuel_type') || '').trim(),
    source_row: index + 2,
    raw: row,
  }));
  const valid = rows.filter((row) => row.vehicle_plate && row.fuel_date && row.liters !== null);
  return { file_name: file.name, file_hash: await fileHash(file), mapping, rows, valid, rejected: rows.length - valid.length };
}
function rowStatus(row) {
  const missing = [];
  if (!row.vehicle_plate) missing.push('placa');
  if (!row.fuel_date) missing.push('data');
  if (row.liters === null) missing.push('litros');
  return missing.length ? 'Pendente: ' + missing.join(', ') : 'Válida';
}
function renderPreview(parsed) {
  const previewRows = $('previewRows');
  const previewWrap = $('previewWrap');
  const importSummary = $('importSummary');
  if (!previewRows || !previewWrap || !importSummary) return;
  previewRows.innerHTML = parsed.rows.slice(0, 80).map((row) => {
    const status = rowStatus(row);
    return `<tr class="${status === 'Válida' ? '' : 'warn'}"><td>${escapeHtml(row.vehicle_plate || '-')}</td><td>${fmtDate(row.fuel_date)}</td><td>${fmtNumber(row.odometer_km, 0)}</td><td>${fmtNumber(row.liters, 2)}</td><td>${fmtMoney(row.total_brl)}</td><td>${escapeHtml(row.driver_name || '-')}</td><td>${escapeHtml(row.station_name || '-')}</td><td>${escapeHtml(status)}</td></tr>`;
  }).join('');
  previewWrap.hidden = false;
  importSummary.hidden = false;
  importSummary.innerHTML = `<article><strong>${fmtNumber(parsed.rows.length)}</strong><span>linhas lidas</span></article><article><strong>${fmtNumber(parsed.valid.length)}</strong><span>linhas válidas</span></article><article><strong>${fmtNumber(parsed.rejected)}</strong><span>linhas pendentes</span></article><article><strong>${fmtNumber(Object.values(parsed.mapping).filter(Boolean).length)}</strong><span>colunas mapeadas</span></article>`;
  $('saveImportBtn').disabled = !parsed.valid.length;
}
function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}
function drawChart(id, config) {
  if (!window.Chart) return;
  if (state.charts[id]) state.charts[id].destroy();
  const el = $(id);
  if (el) state.charts[id] = new Chart(el, config);
}
function drawCharts(summary) {
  const byMonth = new Map();
  (summary.recent_events || []).forEach((event) => {
    const key = String(event.fuel_date || '').slice(0, 7) || 'sem-data';
    const item = byMonth.get(key) || { liters: 0, total: 0 };
    item.liters += Number(event.liters || 0);
    item.total += Number(event.total_brl || 0);
    byMonth.set(key, item);
  });
  const labels = Array.from(byMonth.keys()).sort();
  drawChart('timelineChart', {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Litros', data: labels.map((key) => byMonth.get(key).liters), tension: 0.3 },
        { label: 'Valor (R$)', data: labels.map((key) => byMonth.get(key).total), tension: 0.3 },
      ],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } },
  });
  const vehicles = (summary.top_vehicles || []).slice(0, 10);
  drawChart('vehicleChart', {
    type: 'bar',
    data: {
      labels: vehicles.map((v) => v.vehicle_plate),
      datasets: [{ label: 'Valor total (R$)', data: vehicles.map((v) => Number(v.total_brl || 0)) }],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
  });
}
function renderSummary(summary) {
  const metrics = summary.metrics || {};
  setText('metricVehicles', fmtNumber(metrics.vehicle_count));
  setText('metricEvents', fmtNumber(metrics.event_count));
  setText('metricLiters', fmtNumber(metrics.liters_total, 1));
  setText('metricTotal', fmtMoney(metrics.total_brl));
  setText('metricKmpl', metrics.avg_km_per_liter ? fmtNumber(metrics.avg_km_per_liter, 2) : '-');
  setText('metricAlerts', fmtNumber((summary.anomalies || []).length));
  const latestImport = (summary.imports || [])[0];
  setText('coverageLabel', metrics.event_count ? `${fmtNumber(metrics.event_count)} abastecimentos` : 'Sem dados');
  setText('lastImportLabel', latestImport ? `Último arquivo: ${latestImport.file_name} (${fmtDate(latestImport.imported_at)})` : 'Nenhum arquivo importado nesta base.');
  setText('workspaceLabel', `Workspace ${String(summary.workspace_id || '').slice(0, 8)}`);
  setText('auditLabel', (summary.anomalies || []).length ? `${summary.anomalies.length} alerta(s)` : 'Sem alertas');
  const anomalyRows = $('anomalyRows');
  if (anomalyRows) {
    anomalyRows.innerHTML = (summary.anomalies || []).length
      ? summary.anomalies.map((a) => `<tr><td><strong>${fmtNumber(a.risk_score)}</strong></td><td>${escapeHtml(a.severity || '-')}</td><td>${escapeHtml(a.vehicle_plate || '-')}</td><td>${fmtDate(a.fuel_date)}</td><td>${escapeHtml(a.title || a.type || '-')}</td><td>${escapeHtml(a.explanation || '-')}</td></tr>`).join('')
      : '<tr><td colspan="6" class="empty">Nenhuma anomalia encontrada nos registros importados. O resultado melhora conforme o histórico por veículo aumenta.</td></tr>';
  }
  const vehicleRows = $('vehicleRows');
  if (vehicleRows) {
    vehicleRows.innerHTML = (summary.top_vehicles || []).length
      ? summary.top_vehicles.map((v) => `<tr><td>${escapeHtml(v.vehicle_plate)}</td><td>${fmtNumber(v.event_count)}</td><td>${fmtNumber(v.liters_total, 1)}</td><td>${fmtMoney(v.total_brl)}</td><td>${v.avg_km_per_liter ? fmtNumber(v.avg_km_per_liter, 2) : '-'}</td></tr>`).join('')
      : '<tr><td colspan="5" class="empty">Nenhum veículo importado.</td></tr>';
  }
  const eventRows = $('eventRows');
  if (eventRows) {
    eventRows.innerHTML = (summary.recent_events || []).length
      ? summary.recent_events.slice(0, 30).map((e) => `<tr><td>${fmtDate(e.fuel_date)}</td><td>${escapeHtml(e.vehicle_plate || '-')}</td><td>${fmtNumber(e.liters, 2)}</td><td>${fmtMoney(e.total_brl)}</td><td>${e.km_per_liter ? fmtNumber(e.km_per_liter, 2) : '-'}</td></tr>`).join('')
      : '<tr><td colspan="5" class="empty">Nenhum abastecimento importado.</td></tr>';
  }
  drawCharts(summary);
}
async function refresh() {
  try { renderSummary(await api('/api/fuel/summary')); }
  catch (err) { toast('Não foi possível carregar o dashboard: ' + err.message); }
}
async function openFile(file) {
  if (!file) return;
  try {
    $('saveImportBtn').disabled = true;
    toast('Lendo planilha...');
    state.meta = await parseFile(file);
    renderPreview(state.meta);
    toast(`${state.meta.valid.length} linha(s) válida(s) detectada(s).`);
  } catch (err) {
    toast('Erro ao ler planilha: ' + err.message);
  }
}
async function saveImport() {
  if (!state.meta || !state.meta.valid.length) return toast('Selecione uma planilha válida primeiro.');
  try {
    $('saveImportBtn').disabled = true;
    toast('Salvando importação...');
    const result = await api('/api/fuel/imports', {
      method: 'POST',
      body: JSON.stringify({
        file_name: state.meta.file_name,
        file_hash: state.meta.file_hash,
        mapping: state.meta.mapping,
        rows: state.meta.rows,
      }),
    });
    toast(`Importação salva: ${result.valid_row_count} linhas e ${result.anomaly_count} alerta(s).`);
    await refresh();
  } catch (err) {
    toast('Erro ao salvar importação: ' + err.message);
  } finally {
    $('saveImportBtn').disabled = false;
  }
}
function bind() {
  const fileInput = $('fileInput');
  const dropzone = $('dropzone');
  if (fileInput) fileInput.addEventListener('change', (event) => openFile(event.target.files && event.target.files[0]));
  if (dropzone) {
    dropzone.addEventListener('click', () => fileInput && fileInput.click());
    dropzone.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        fileInput && fileInput.click();
      }
    });
    dropzone.addEventListener('dragover', (event) => { event.preventDefault(); dropzone.classList.add('drag'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
    dropzone.addEventListener('drop', (event) => {
      event.preventDefault();
      dropzone.classList.remove('drag');
      openFile(event.dataTransfer.files && event.dataTransfer.files[0]);
    });
  }
  const saveImportBtn = $('saveImportBtn');
  if (saveImportBtn) saveImportBtn.addEventListener('click', saveImport);
  const refreshBtn = $('refreshBtn');
  if (refreshBtn) refreshBtn.addEventListener('click', refresh);
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (event) => {
      const target = document.getElementById(anchor.getAttribute('href').slice(1));
      if (target) {
        event.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}
document.addEventListener('DOMContentLoaded', () => { bind(); refresh(); });


// workspace-ui-runtime-patch-v2
state.workspaceId = localStorage.getItem('energisa_workspace_id') || state.workspaceId || '';
function currentWorkspaceId(){ const el=$('workspaceSelect'); return (el && el.value) || state.workspaceId || ''; }
async function loadWorkspaces(){
 try{
 const data=await api('/api/fuel/workspaces');
 const select=$('workspaceSelect');
 if(!select)return;
 const list=data.workspaces||[];
 if(!state.workspaceId && data.default_workspace_id) state.workspaceId=data.default_workspace_id;
 select.innerHTML=list.map(w=>'<option value='+w.id+'>'+escapeHtml(w.name)+' - '+fmtNumber(w.event_count)+' abastec.</option>').join('');
 select.value=state.workspaceId || data.default_workspace_id || (list[0]&&list[0].id) || '';
 state.workspaceId=select.value;
 if(state.workspaceId)localStorage.setItem('energisa_workspace_id',state.workspaceId);
 }catch(err){ toast('Nao foi possivel carregar estudos: '+err.message); }
}
async function createWorkspace(){
 const input=$('newWorkspaceName');
 const name=input&&input.value?input.value.trim().replace(/_/g,' '):'';
 if(!name)return toast('Informe um nome para o estudo.');
 try{
 const data=await api('/api/fuel/workspaces',{method:'POST',body:JSON.stringify({name})});
 state.workspaceId=data.workspace.id;
 localStorage.setItem('energisa_workspace_id',state.workspaceId);
 if(input)input.value='';
 await loadWorkspaces();
 await refresh();
 toast('Estudo criado e selecionado.');
 }catch(err){ toast('Erro ao criar estudo: '+err.message); }
}
refresh = async function(){
 try{
 const wid=currentWorkspaceId();
 renderSummary(await api('/api/fuel/summary'+(wid?'?workspace_id='+encodeURIComponent(wid):'')));
 }catch(err){ toast('Nao foi possivel carregar o dashboard: '+err.message); }
};
saveImport = async function(){
 if(!state.meta || !state.meta.valid.length)return toast('Selecione uma planilha valida primeiro.');
 try{
 $('saveImportBtn').disabled=true;
 toast('Salvando importacao...');
 const result=await api('/api/fuel/imports',{method:'POST',body:JSON.stringify({file_name:state.meta.file_name,file_hash:state.meta.file_hash,mapping:state.meta.mapping,rows:state.meta.rows,workspace_id:currentWorkspaceId()})});
 toast('Importacao salva: '+result.valid_row_count+' linhas e '+result.anomaly_count+' alerta(s).');
 await loadWorkspaces();
 await refresh();
 const target=$('dashboard');
 if(target)target.scrollIntoView({behavior:'smooth',block:'start'});
 }catch(err){ toast('Erro ao salvar importacao: '+err.message); }
 finally{ $('saveImportBtn').disabled=false; }
};
document.addEventListener('DOMContentLoaded',()=>{
 loadWorkspaces().then(refresh);
 const ws=$('workspaceSelect');
 if(ws)ws.addEventListener('change',()=>{ state.workspaceId=ws.value; localStorage.setItem('energisa_workspace_id',state.workspaceId); refresh(); });
 const btn=$('createWorkspaceBtn');
 if(btn)btn.addEventListener('click',createWorkspace);
});

// export-ui-runtime-patch-v2
function openFuelExport(type){const wid=typeof currentWorkspaceId === 'function' ? currentWorkspaceId() : '';const url='/api/fuel/export?type='+encodeURIComponent(type)+(wid?'&workspace_id='+encodeURIComponent(wid):'');window.open(url,'_blank');}
document.addEventListener('DOMContentLoaded',()=>{const a=$(['exportAnomaliesBtn'][0]);if(a)a.addEventListener('click',()=>openFuelExport('anomalies'));const e=$(['exportEventsBtn'][0]);if(e)e.addEventListener('click',()=>openFuelExport('events'));});
