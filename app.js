
let rows=[], heads=[], anom=[];
const $ = id => document.getElementById(id);
function norm(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')}
function toNum(v){
  let s=String(v??'').trim().replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,'');
  return parseFloat(s);
}
function ym(v){
  if(v instanceof Date && !isNaN(v)) return v.getFullYear()+'-'+String(v.getMonth()+1).padStart(2,'0');
  let s=String(v??'').trim();
  let m=s.match(/^(\d{1,2})[\/.-](\d{4})$/); if(m) return m[2]+'-'+String(m[1]).padStart(2,'0');
  m=s.match(/^(\d{4})[\/.-](\d{1,2})/); if(m) return m[1]+'-'+String(m[2]).padStart(2,'0');
  m=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if(m){let y=+m[3]; if(y<100)y+=2000; return y+'-'+String(m[2]).padStart(2,'0')}
  return s;
}
function parseCSV(t){
  let out=[], row=[], cell='', q=false;
  for(let i=0;i<t.length;i++){
    let c=t[i], n=t[i+1];
    if(c=='"' && q && n=='"'){cell+='"'; i++}
    else if(c=='"'){q=!q}
    else if((c==','||c==';'||c=='\t') && !q){row.push(cell); cell=''}
    else if((c=='\n'||c=='\r') && !q){
      if(c=='\r' && n=='\n') i++;
      row.push(cell);
      if(row.some(x=>String(x).trim())) out.push(row);
      row=[]; cell='';
    } else cell+=c;
  }
  row.push(cell);
  if(row.some(x=>String(x).trim())) out.push(row);
  return out;
}
function fill(sel){sel.innerHTML=''; heads.forEach(h=>{let o=document.createElement('option'); o.value=h; o.textContent=h; sel.appendChild(o)})}
function guess(keys){
  let ns=heads.map(norm);
  for(let k of keys){let i=ns.findIndex(x=>x.includes(k)); if(i>=0) return heads[i]}
  return heads[0]||'';
}
async function loadFile(f){
  let ext=f.name.split('.').pop().toLowerCase();
  if(ext==='csv'){
    let arr=parseCSV(await f.text());
    heads=(arr.shift()||[]).map(x=>String(x).trim());
    rows=arr.map(r=>Object.fromEntries(heads.map((h,i)=>[h,r[i]??''])));
  } else {
    if(!window.XLSX){alert('Biblioteca XLSX não carregou. Exporte como CSV ou conecte à internet.'); return}
    let ab=await f.arrayBuffer();
    let wb=XLSX.read(ab,{type:'array',cellDates:true});
    let ws=wb.Sheets[wb.SheetNames[0]];
    rows=XLSX.utils.sheet_to_json(ws,{defval:''});
    heads=Object.keys(rows[0]||{});
  }
  fill($('uc')); fill($('ref')); fill($('kwh'));
  $('uc').value=guess(['unidade','uc','cliente','instalacao','instalacao','medidor']);
  $('ref').value=guess(['referencia','mes','data','periodo']);
  $('kwh').value=guess(['consumo','kwh','energia']);
  $('status').textContent='Arquivo carregado: '+rows.length+' linhas, '+heads.length+' colunas.';
  renderRaw(); analisar();
}
function median(a){
  a=a.filter(Number.isFinite).sort((x,y)=>x-y);
  if(!a.length) return NaN;
  let m=Math.floor(a.length/2);
  return a.length%2?a[m]:(a[m-1]+a[m])/2;
}
function add(sev,t,u,r,v,b,rel,m){anom.push({sev,t,u,r,v,b,rel,m})}
function analisar(){
  let cu=$('uc').value, cr=$('ref').value, ck=$('kwh').value, pct=+$('pct').value||45;
  let g={}; anom=[];
  rows.forEach(row=>{
    let u=String(row[cu]||'SEM_UNIDADE').trim();
    let r=ym(row[cr]);
    let v=toNum(row[ck]);
    (g[u]??=[]).push({u,r,v});
  });
  for(let u in g){
    let arr=g[u].sort((a,b)=>a.r.localeCompare(b.r));
    let vals=arr.map(x=>x.v).filter(x=>Number.isFinite(x)&&x>=0);
    let base=median(vals);
    let mad=median(vals.map(v=>Math.abs(v-base)));
    let spread=mad*1.4826 || Math.max(1, base*0.10);
    arr.forEach(x=>{
      let rel=base?((x.v-base)/base*100):0;
      if(!Number.isFinite(x.v)) add('Alta','consumo inválido',u,x.r,x.v,base,'','Valor não numérico');
      else if(x.v<0) add('Alta','consumo negativo',u,x.r,x.v,base,'','Valor negativo');
      else if(x.v===0 && base>20) add('Alta','consumo zerado',u,x.r,x.v,base,-100,'Zero com histórico relevante');
      else if(x.v>base+3*spread || rel>pct) add(Math.abs(rel)>100?'Alta':'Média','consumo acima do normal',u,x.r,x.v,base,rel,'Acima da base histórica');
      else if(x.v<base-3*spread || rel<-pct) add(Math.abs(rel)>70?'Alta':'Média','consumo abaixo do normal',u,x.r,x.v,base,rel,'Abaixo da base histórica');
    });
    for(let i=1;i<arr.length;i++){
      let a=arr[i-1].r.split('-').map(Number), b=arr[i].r.split('-').map(Number);
      if(a.length>=2 && b.length>=2 && a.every(Number.isFinite) && b.every(Number.isFinite)){
        let d=(b[0]-a[0])*12+(b[1]-a[1]);
        if(d>1) add('Baixa','mês ausente',u,arr[i-1].r+' até '+arr[i].r,'',base,'',(d-1)+' mês(es) sem registro');
      }
    }
  }
  render(g);
}
function fmt(v){return Number.isFinite(+v)?Number(v).toLocaleString('pt-BR',{maximumFractionDigits:2}):String(v??'')}
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function render(g){
  $('mRows').textContent=rows.length;
  $('mUnits').textContent=Object.keys(g||{}).length;
  $('mAnom').textContent=anom.length;
  $('mHigh').textContent=anom.filter(a=>a.sev==='Alta').length;
  $('out').innerHTML=anom.map(a=>{
    let cls=a.sev==='Alta'?'alta':(a.sev==='Média'?'media':'baixa');
    let rel=Number.isFinite(a.rel)?a.rel.toFixed(1)+'%':'';
    return '<tr><td class="'+cls+'">'+esc(a.sev)+'</td><td>'+esc(a.t)+'</td><td>'+esc(a.u)+'</td><td>'+esc(a.r)+'</td><td>'+esc(fmt(a.v))+'</td><td>'+esc(fmt(a.b))+'</td><td>'+esc(rel)+'</td><td>'+esc(a.m)+'</td></tr>';
  }).join('');
}
function renderRaw(){
  let h=heads.map(x=>'<th>'+esc(x)+'</th>').join('');
  let b=rows.slice(0,100).map(r=>'<tr>'+heads.map(k=>'<td>'+esc(r[k])+'</td>').join('')+'</tr>').join('');
  $('raw').innerHTML='<thead><tr>'+h+'</tr></thead><tbody>'+b+'</tbody>';
}
function exportar(){
  let h=['Severidade','Tipo','Unidade','Referencia','Consumo','Base','Variacao_pct','Motivo'];
  let lines=[h.join(';')].concat(anom.map(a=>[a.sev,a.t,a.u,a.r,a.v,a.b,a.rel,a.m].map(x=>'"'+String(x??'').replace(/"/g,'""')+'"').join(';')));
  let blob=new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8'});
  let url=URL.createObjectURL(blob), a=document.createElement('a');
  a.href=url; a.download='anomalias_energisa.csv'; a.click(); URL.revokeObjectURL(url);
}
$('file').onchange=e=>e.target.files[0]&&loadFile(e.target.files[0]);
$('go').onclick=analisar;
$('exp').onclick=exportar;
