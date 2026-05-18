const $=id=>document.getElementById(id),N=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1});
let S={readings:[],imports:[],anomalies:[],preview:null,charts:{}};
function toast(m){const t=$('toast');t.textContent=m;t.classList.add('show');clearTimeout(window.tt);window.tt=setTimeout(()=>t.classList.remove('show'),3500)}
function norm(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')}
function pick(h,ps){let a=h.map(x=>({o:x,n:norm(x)}));for(const p of ps){let f=a.find(x=>p.test(x.n));if(f)return f.o}return null}
function num(v){if(v==null||v==='')return null;if(typeof v==='number')return v;let s=String(v).replace(/[^0-9,.-]/g,'');if(!s)return null;if(s.includes(',')&&s.includes('.'))s=s.lastIndexOf(',')>s.lastIndexOf('.')?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');else if(s.includes(','))s=s.replace(',','.');let n=Number(s);return Number.isFinite(n)?n:null}
function mon(v){if(!v)return null;let s=String(v).trim().toLowerCase(),m=s.match(/^(\d{4})[-/](\d{1,2})/)||s.match(/(\d{1,2})[-/](\d{4})$/);if(m)return m[1].length===4?`${m[1]}-${String(+m[2]).padStart(2,'0')}-01`:`${m[2]}-${String(+m[1]).padStart(2,'0')}-01`;let d=s.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);if(d)return`${d[3]}-${String(+d[2]).padStart(2,'0')}-01`;let M={jan:'01',janeiro:'01',fev:'02',fevereiro:'02',mar:'03',marco:'03',abr:'04',abril:'04',mai:'05',maio:'05',jun:'06',junho:'06',jul:'07',julho:'07',ago:'08',agosto:'08',set:'09',setembro:'09',out:'10',outubro:'10',nov:'11',novembro:'11',dez:'12',dezembro:'12'};let p=s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').split(/[ /\-]+/),y=p.find(x=>/^\d{4}$/.test(x)),mo=p.find(x=>M[x]);return y&&mo?`${y}-${M[mo]}-01`:null}
function ml(x){if(!x)return'-';let[a,b]=String(x).slice(0,7).split('-');return`${b}/${a}`}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function hash(f){let b=await f.arrayBuffer(),d=await crypto.subtle.digest('SHA-256',b);return[...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function api(p,o={}){let r=await fetch(p,{headers:{'Content-Type':'application/json'},...o}),t=await r.text(),j={};try{j=t?JSON.parse(t):{}}catch{j={raw:t}}if(!r.ok)throw Error(j.error||r.status);return j}
async function parseFile(f){let b=await f.arrayBuffer(),wb=XLSX.read(b,{type:'array',cellDates:true}),sh=wb.Sheets[wb.SheetNames[0]],raw=XLSX.utils.sheet_to_json(sh,{defval:null,raw:false}),h=Object.keys(raw[0]||{}),c={unit:pick(h,[/unidade|cliente|local|nome/]),uc:pick(h,[/^uc$|unidade_consumidora|conta|instalacao|codigo/]),month:pick(h,[/referencia|competencia|mes|periodo|data/]),cons:pick(h,[/consumo.*kwh|kwh|energia|consumo/]),amount:pick(h,[/valor.*total|total|valor|reais|brl/]),demand:pick(h,[/demanda|kw/])};let rows=raw.map((r,i)=>{let u=c.unit?r[c.unit]:'',uc=c.uc?r[c.uc]:u||`linha-${i+1}`;return{unit_name:String(u||uc||`Linha ${i+1}`).trim(),uc:String(uc||u||`linha-${i+1}`).trim(),reference_month:mon(c.month?r[c.month]:null),consumption_kwh:num(c.cons?r[c.cons]:null),amount_brl:num(c.amount?r[c.amount]:null),demand_kw:num(c.demand?r[c.demand]:null),raw:r}}).filter(r=>r.reference_month&&r.consumption_kwh!=null);return{raw,rows,columns:c,sheet:wb.SheetNames[0],file_hash:await hash(f),file_name:f.name}}
async function health(){try{let j=await api('/api/health');$('dbStatusText').textContent=j.ok?'Conectado':'Indisponível';$('dbStatusDetail').textContent=j.database||j.message||'PostgreSQL'}catch(e){$('dbStatusText').textContent='Sem conexão';$('dbStatusDetail').textContent=e.message}}
async function load(){try{let j=await api('/api/summary');S.readings=j.readings||[];S.imports=j.imports||[];S.anomalies=j.anomalies||[]}catch{S.readings=[];S.imports=[];S.anomalies=[]}render()}
function fr(){let u=$('unitFilter').value;return S.readings.filter(r=>!u||r.uc===u||r.unit_name===u)}
function fa(){let u=$('unitFilter').value,s=$('severityFilter').value;return S.anomalies.filter(a=>(!u||a.uc===u||a.unit_name===u)&&(!s||a.severity===s))}
function render(){let cur=$('unitFilter').value,us=[...new Set(S.readings.map(r=>r.uc||r.unit_name).filter(Boolean))].sort();$('unitFilter').innerHTML='<option value="">Todas as unidades</option>'+us.map(u=>`<option value="${esc(u)}">${esc(u)}</option>`).join('');$('unitFilter').value=us.includes(cur)?cur:'';let r=fr(),a=fa(),months=[...new Set(r.map(x=>String(x.reference_month).slice(0,7)))].sort();$('metricUnits').textContent=N.format(new Set(r.map(x=>x.uc||x.unit_name)).size);$('metricMonths').textContent=N.format(months.length);$('metricKwh').textContent=N.format(r.reduce((s,x)=>s+Number(x.consumption_kwh||0),0));$('metricAnomalies').textContent=N.format(a.length);$('coverageLabel').textContent=months.length?`${ml(months[0])} a ${ml(months.at(-1))}`:'Sem dados';if(S.imports[0])$('lastImportLabel').textContent=`Último arquivo: ${S.imports[0].file_name}`;
$('importsTable').innerHTML=S.imports.slice(0,50).map(i=>`<tr><td>${new Date(i.imported_at).toLocaleString('pt-BR')}</td><td>${esc(i.file_name)}</td><td>${N.format(+i.row_count||0)}</td><td>${ml(i.period_start)} - ${ml(i.period_end)}</td><td>${esc(i.status||'ok')}</td></tr>`).join('')||'<tr><td colspan="5">Nenhuma importação gravada.</td></tr>';
$('anomaliesTable').innerHTML=a.slice(0,100).map(x=>`<tr><td><span class="badge ${x.severity}">${x.severity==='critical'?'Crítica':x.severity==='high'?'Alta':'Média'}</span></td><td>${esc(x.uc)}</td><td>${esc(x.unit_name)}</td><td>${ml(x.reference_month)}</td><td>${N.format(+x.consumption_kwh||0)}</td><td>${N.format(+x.baseline_kwh||0)}</td><td>${N.format(+x.variation_pct||0)}%</td><td>${esc(x.type)}</td></tr>`).join('')||'<tr><td colspan="8">Nenhuma anomalia encontrada.</td></tr>';charts(r,a)}
function chart(id,type,labels,data,label){if(!window.Chart)return;if(S.charts[id])S.charts[id].destroy();S.charts[id]=new Chart($(id),{type,data:{labels,datasets:[{label,data,tension:.35,borderWidth:2}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#dff6ff'}}},scales:type==='doughnut'?{}:{x:{ticks:{color:'#aab7c7'},grid:{color:'rgba(255,255,255,.08)'}},y:{ticks:{color:'#aab7c7'},grid:{color:'rgba(255,255,255,.08)'}}}}})}
function charts(r,a){let m={};r.forEach(x=>{let k=String(x.reference_month).slice(0,7);m[k]=(m[k]||0)+Number(x.consumption_kwh||0)});let ks=Object.keys(m).sort();chart('timelineChart','line',ks.map(ml),ks.map(k=>m[k]),'kWh');let top=a.slice().sort((x,y)=>Math.abs(y.variation_pct||0)-Math.abs(x.variation_pct||0)).slice(0,8);chart('rankingChart','bar',top.map(x=>String(x.uc||'').slice(0,12)),top.map(x=>Math.abs(+x.variation_pct||0)),'%');let sev={critical:0,high:0,medium:0};a.forEach(x=>sev[x.severity]=(sev[x.severity]||0)+1);chart('severityChart','doughnut',['Crítica','Alta','Média'],[sev.critical,sev.high,sev.medium],'alertas')}
async function file(f){if(!f)return;$('importStatus').textContent=`Lendo ${f.name}...`;try{S.preview=await parseFile(f);let p=S.preview;$('mappingBox').innerHTML=`<b>Aba:</b> ${esc(p.sheet)}<br><b>Linhas úteis:</b> ${p.rows.length} de ${p.raw.length}<br><b>Colunas:</b> Unidade=${esc(p.columns.unit||'-')}; UC=${esc(p.columns.uc||'-')}; Mês=${esc(p.columns.month||'-')}; Consumo=${esc(p.columns.cons||'-')}; Valor=${esc(p.columns.amount||'-')}`;$('previewHead').innerHTML='<tr><th>UC</th><th>Unidade</th><th>Mês</th><th>Consumo</th><th>Valor</th></tr>';$('previewBody').innerHTML=p.rows.slice(0,8).map(r=>`<tr><td>${esc(r.uc)}</td><td>${esc(r.unit_name)}</td><td>${ml(r.reference_month)}</td><td>${N.format(r.consumption_kwh)}</td><td>${r.amount_brl==null?'-':N.format(r.amount_brl)}</td></tr>`).join('');$('saveImportBtn').disabled=!p.rows.length;$('clearPreviewBtn').disabled=false;$('importStatus').textContent=`${p.rows.length} linhas válidas prontas para salvar.`}catch(e){$('importStatus').textContent=e.message;toast('Falha ao ler arquivo')}}
async function save(){if(!S.preview)return;$('saveImportBtn').disabled=true;try{let p=S.preview,j=await api('/api/imports',{method:'POST',body:JSON.stringify({file_name:p.file_name,file_hash:p.file_hash,columns:p.columns,rows:p.rows})});toast(`Importação salva: ${j.rows_saved} linhas`);clear();await load()}catch(e){$('importStatus').textContent=e.message;$('saveImportBtn').disabled=false}}
function clear(){S.preview=null;$('mappingBox').textContent='Aguardando arquivo.';$('previewHead').innerHTML='';$('previewBody').innerHTML='';$('saveImportBtn').disabled=true;$('clearPreviewBtn').disabled=true}
function exportCSV(){let h=['severity','uc','unit_name','reference_month','consumption_kwh','baseline_kwh','variation_pct','type'],csv=[h.join(',')].concat(fa().map(r=>h.map(k=>`"${String(r[k]??'').replace(/"/g,'""')}"`).join(','))).join('\n'),u=URL.createObjectURL(new Blob([csv]));let a=document.createElement('a');a.href=u;a.download='energisa-anomalias.csv';a.click();URL.revokeObjectURL(u)}
$('fileInput').onchange=e=>file(e.target.files[0]);$('dropZone').ondragover=e=>{e.preventDefault()};$('dropZone').ondrop=e=>{e.preventDefault();file(e.dataTransfer.files[0])};$('saveImportBtn').onclick=save;$('clearPreviewBtn').onclick=clear;$('refreshBtn').onclick=()=>{health();load()};$('healthBtn').onclick=async()=>{$('healthOutput').textContent=JSON.stringify(await api('/api/health').catch(e=>({error:e.message})),null,2)};$('unitFilter').onchange=render;$('severityFilter').onchange=render;$('exportAnomaliesBtn').onclick=exportCSV;health();load();

// HelpUS navigation action patch
(function () {
  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function () {
    var fileInput = document.getElementById('fileInput');
    function openFilePicker() {
      if (fileInput) fileInput.click();
    }

    document.querySelectorAll('.nav a[href^="#"], .brand[href^="#"]').forEach(function (link) {
      link.addEventListener('click', function (event) {
        var href = link.getAttribute('href');
        var target = href ? document.querySelector(href) : null;
        if (!target) return;
        event.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        document.querySelectorAll('.nav a').forEach(function (item) {
          item.classList.remove('active');
        });
        if (link.closest('.nav')) link.classList.add('active');
        history.replaceState(null, '', href);
        if (href === '#importar') {
          window.setTimeout(openFilePicker, 450);
        }
      });
    });

    var dropzone = document.getElementById('dropzone');
    if (dropzone) {
      dropzone.setAttribute('role', 'button');
      dropzone.setAttribute('tabindex', '0');
      dropzone.setAttribute('aria-label', 'Selecionar arquivo de consumo Energisa');
      dropzone.addEventListener('click', openFilePicker);
      dropzone.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openFilePicker();
        }
      });
    }
  });
})();


// Energisa chart resize stability patch
(function () {
  if (!window.Chart) return;
  Chart.defaults.responsive = true;
  Chart.defaults.maintainAspectRatio = false;
  Chart.defaults.resizeDelay = 150;
})();


// user-facing-cleanup-v3
(function () {
  function fmt(n) { return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(Number(n || 0)); }
  function labelMonth(value) { if (!value) return '-'; var p = String(value).slice(0, 7).split('-'); return p.length === 2 ? p[1] + '/' + p[0] : '-'; }
  function escapeHtml(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]; }); }
  function isMeasure(value) {
    var s = norm(value || '');
    return !s || /^(km_l|kwh|kw|r|rs|litro|litros|total|media|consumo|valor|mes|data|periodo|referencia)$/.test(s);
  }
  function chooseColumns(headers, raw) {
    var cols = {
      unit: pick(headers, [/unidade_consumidora/, /^unidade$/, /cliente|local|posto|veiculo|placa|equipamento|descricao|nome/]),
      uc: pick(headers, [/^uc$|instalacao|codigo|cod_|^cod$|conta|placa|id/]),
      month: pick(headers, [/referencia|competencia|periodo|mes|data/]),
      cons: pick(headers, [/consumo.*kwh|kwh|energia|consumo|quantidade|volume|litro|litros|abastecido|total/]),
      amount: pick(headers, [/valor.*total|total.*valor|valor|reais|brl|custo|preco|r_/]),
      demand: pick(headers, [/demanda|kw/])
    };
    if (!cols.unit) {
      cols.unit = headers.find(function (h) {
        var k = norm(h);
        if (/valor|preco|custo|data|mes|periodo|referencia|total|media|consumo|kwh|kw|km|litro/.test(k)) return false;
        var sample = raw.slice(0, 25).map(function (r) { return r[h]; }).filter(function (v) { return v != null && v !== ''; });
        if (!sample.length) return false;
        var text = sample.filter(function (v) { return Number.isNaN(Number(String(v).replace(',', '.'))); }).length;
        return text >= Math.ceil(sample.length * 0.5);
      }) || null;
    }
    if (!cols.cons) {
      cols.cons = headers.find(function (h) {
        var k = norm(h);
        if (/valor|preco|custo|data|mes|periodo|referencia|codigo|cod_|id/.test(k)) return false;
        var sample = raw.slice(0, 30).map(function (r) { return num(r[h]); }).filter(function (v) { return v != null; });
        return sample.length >= 2;
      }) || null;
    }
    return cols;
  }
  function monthFromFile(name) {
    var s = String(name || '');
    var m = s.match(/(\d{1,2})[_-](\d{1,2})[_-](20\d{2})/);
    if (m) return m[3] + '-' + String(+m[2]).padStart(2, '0') + '-01';
    m = s.match(/(20\d{2})[_-](\d{1,2})/);
    if (m) return m[1] + '-' + String(+m[2]).padStart(2, '0') + '-01';
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01';
  }

  parseFile = async function (file) {
    var buffer = await file.arrayBuffer();
    var wb = XLSX.read(buffer, { type: 'array', cellDates: true });
    var sheet = wb.Sheets[wb.SheetNames[0]];
    var raw = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });
    var headers = Object.keys(raw[0] || {});
    var c = chooseColumns(headers, raw);
    var fallbackMonth = monthFromFile(file.name);
    var seen = new Map();

    var rows = raw.map(function (r, i) {
      var consumption = num(c.cons ? r[c.cons] : null);
      if (consumption == null) return null;
      var month = mon(c.month ? r[c.month] : null) || fallbackMonth;
      var unit = c.unit ? r[c.unit] : '';
      var uc = c.uc ? r[c.uc] : '';
      if (isMeasure(unit)) unit = '';
      if (isMeasure(uc)) uc = '';
      var label = String(unit || uc || ('Linha ' + (i + 1))).trim();
      var code = String(uc || label || ('linha-' + (i + 1))).trim();
      var key = code + '|' + month;
      var count = (seen.get(key) || 0) + 1;
      seen.set(key, count);
      if (count > 1 && (!c.uc || code === label)) code = code + ' #' + count;
      return { unit_name: label, uc: code, reference_month: month, consumption_kwh: consumption, amount_brl: num(c.amount ? r[c.amount] : null), demand_kw: num(c.demand ? r[c.demand] : null), raw: r };
    }).filter(Boolean);

    return { raw: raw, rows: rows, columns: c, sheet: wb.SheetNames[0], file_hash: await hash(file), file_name: file.name };
  };

  charts = function (r, a) {
    var totals = {};
    (r || []).forEach(function (x) { var k = String(x.reference_month).slice(0, 7); totals[k] = (totals[k] || 0) + Number(x.consumption_kwh || 0); });
    var keys = Object.keys(totals).sort();
    chart('timelineChart', keys.length <= 1 ? 'bar' : 'line', keys.map(labelMonth), keys.map(function (k) { return totals[k]; }), 'Consumo');
    var note = document.getElementById('chartInsight');
    if (note) note.textContent = keys.length < 2 ? 'Com apenas um período, o gráfico é uma fotografia do mês. Importe novos meses para enxergar tendência e sazonalidade.' : 'O gráfico consolida o consumo por período para evidenciar tendência e sazonalidade.';
    var top = document.getElementById('topReadingsList');
    if (top) {
      var sorted = (r || []).slice().sort(function (x, y) { return Number(y.consumption_kwh || 0) - Number(x.consumption_kwh || 0); }).slice(0, 5);
      top.innerHTML = sorted.length ? sorted.map(function (row) {
        return '<div class="mini-row"><div><strong>' + escapeHtml(row.unit_name || row.uc || 'Registro') + '</strong><span>' + escapeHtml(row.uc || '') + ' · ' + labelMonth(row.reference_month) + '</span></div><strong>' + fmt(row.consumption_kwh) + '</strong></div>';
      }).join('') : '<div class="chart-note">Importe um arquivo para gerar a leitura do período.</div>';
    }
    var audit = document.getElementById('auditInsight');
    if (audit) {
      if ((a || []).length) audit.textContent = 'Foram encontradas ' + (a || []).length + ' variações relevantes no histórico.';
      else if (keys.length < 3) audit.textContent = 'Auditoria sem alertas neste momento: ainda não há histórico suficiente para comparar variações. Os indicadores ficam mais fortes após três ou mais períodos importados.';
      else audit.textContent = 'Nenhuma anomalia relevante foi detectada com base no histórico atual.';
    }
    var filters = document.getElementById('unitFilter') ? document.getElementById('unitFilter').closest('.filters') : null;
    if (filters) filters.classList.toggle('single-option', new Set((S.readings || []).map(function (x) { return x.uc || x.unit_name; }).filter(Boolean)).size <= 1);
    var preview = document.getElementById('previewPanel');
    if (preview) preview.classList.toggle('is-hidden', !S.preview);
  };

  document.addEventListener('DOMContentLoaded', function () {
    var preview = document.getElementById('previewPanel');
    var input = document.getElementById('fileInput');
    if (input && preview) input.addEventListener('change', function () { setTimeout(function () { preview.classList.toggle('is-hidden', !S.preview); }, 600); });
  });
})();
