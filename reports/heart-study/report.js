'use strict';
const reportSource='<!doctype html>\n'+document.documentElement.outerHTML;
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>v==null?'Not reached':`$${v.toFixed(2)}`;
const styles={
 'gpt-6-astra / notes':{name:'Astra',mode:'With notes',color:'#455f47'},
 'gpt-6-astra / no-notes':{name:'Astra',mode:'No notes',color:'#9dab80',dash:true},
 'gpt-6.1-sol / notes':{name:'Sol',mode:'With notes',color:'#a17c50'},
 'gpt-6.1-sol / no-notes':{name:'Sol',mode:'No notes',color:'#c4ad8f',dash:true},
 'CMA-ES':{name:'CMA-ES',mode:'Optimizer',color:'#8e9995'}
};
const groups=Object.keys(styles).map(name=>DATA.summary.groups.find(g=>g.controller===name));
const included=new Set(groups.map(g=>g.controller));
let metric='bestMean',attempt=10,expanded=false;
function surface(canvas,values){
 const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
 for(let i=0;i<1024;i++){
  const v=Math.max(0,Math.min(1,values[i])),outside=Math.hypot((i%32+.5)/16-1,(Math.floor(i/32)+.5)/16-1)>=.985;
  const color=outside?[224,219,203]:[92,53,31].map((lo,j)=>Math.round(lo+([255,248,223][j]-lo)*v));
  ctx.fillStyle=`rgb(${color.join(',')})`;ctx.fillRect(i%32,Math.floor(i/32),1,1);
 }
}
$$('[data-surface="target"]').forEach(c=>surface(c,DATA.target));
const best=DATA.passes.reduce((a,b)=>a.score>=b.score?a:b);
surface($('#hero-cup'),best.surface);$('#hero-score').textContent=`${best.score.toFixed(1)}%`;
$('#hero-caption').textContent=`${styles[best.controller].name} · notes · seed ${best.seed} · attempt ${best.attempt}`;
$('#metric-cost').textContent=money(DATA.summary.billing.upperUSD);
$('#download-curves').href=DATA.curveImage;
$('#freeze-tag').textContent=DATA.verification.tag;$('#freeze-commit').textContent=DATA.verification.commit.slice(0,7);
$('#billing-detail').textContent=`Conservative usage estimate: $${DATA.summary.billing.upperUSD.toFixed(5)}. Standard usage-detail estimate: $${DATA.summary.billing.standardEstimateUSD.toFixed(5)}. Token-derived costs, not invoices; every pending request reserved its maximum charge before dispatch.`;
const swatch=s=>`<span aria-hidden="true" class="swatch${s.dash?' dashed':''}" style="--series:${s.color}"></span>`;
$('#comparison-rows').innerHTML=groups.map(g=>{
 const s=styles[g.controller],last=g.curves.at(-1);
 return `<tr><td><div class="controller-label">${swatch(s)}<div><strong>${s.name}</strong><small>${s.mode}</small></div></div></td><td class="pass-cell"><div><span>${Math.round(g.passRate*100)}%</span><small>${g.passes} / ${g.attempts}</small></div><div class="mini-bar" style="--value:${g.passRate*100}%;--series:${s.color}"><span></span></div></td><td class="table-score">${g.seedsPassed}<small> / 5</small></td><td class="table-score">${last.bestMean.toFixed(1)}<small> ± ${last.bestSD.toFixed(1)}</small></td><td class="table-score">${money(g.costUSD)}${g.controller==='CMA-ES'?'<small> API</small>':''}</td></tr>`;
}).join('');
$('#seed-rows').innerHTML=groups.flatMap(g=>g.seeds.map(s=>`<tr><td>${styles[g.controller].name} · ${styles[g.controller].mode}</td><td>${s.seed}</td><td>${s.firstPass??'Not reached'}</td><td>${s.bestScore.toFixed(1)}%</td><td>${s.costToFirstPassUSD==null?'Not reached':`$${s.costToFirstPassUSD.toFixed(4)}`}</td></tr>`)).join('');
$('#legend').innerHTML=groups.map(g=>`<button type="button" data-series="${esc(g.controller)}" aria-pressed="true">${swatch(styles[g.controller])}${styles[g.controller].name} · ${styles[g.controller].mode}</button>`).join('');
$$('[data-series]').forEach(b=>b.addEventListener('click',()=>{const name=b.dataset.series;if(included.has(name))included.delete(name);else included.add(name);b.setAttribute('aria-pressed',String(included.has(name)));drawChart();}));
const chartDescriptions={
 bestMean:{axis:'SHAPE SCORE (%)',title:'Mean best-so-far score across five seeds',note:'Shading shows sample SD across five seeds, not a confidence interval. The dashed 78.26% quality floor is necessary but not sufficient to pass.',readout:'Mean ± sample SD across seeds.'},
 attemptPassRate:{axis:'PASSING POURS (%)',title:'Pass rate on each attempt across five seeds',note:'Each point is the fraction of five matched episodes passing on that attempt. Every attempt must satisfy shape, serving, temperature and spill checks.',readout:'Fraction of five episodes passing on this attempt.'},
 everPassRate:{axis:'SEEDS WITH A PASS (%)',title:'Fraction of seeds with at least one pass by each attempt',note:'Cumulative fraction of seeds with at least one passing pour. Finding a pass does not mean subsequent attempts will also pass.',readout:'Fraction of seeds with a pass by this budget.'}
};
function drawChart(){
 const svg=$('#chart'),d=chartDescriptions[metric],x=k=>48+(k-1)*89.1,y=v=>250-v*2.15,visible=groups.filter(g=>included.has(g.controller));
 const points=g=>g.curves.map(r=>[x(r.attempt),y(metric==='bestMean'?r.bestMean:100*r[metric])]);
 let parts=[`<title>${d.title}</title><desc>${d.note}</desc>`];
 for(let value=0;value<=100;value+=20)parts.push(`<line x1="48" y1="${y(value)}" x2="850" y2="${y(value)}" stroke="#e5e8dc" stroke-width="1"/><text x="34" y="${y(value)+3}" text-anchor="end">${value}</text>`);
 for(let k=1;k<=10;k++)parts.push(`<text x="${x(k)}" y="274" text-anchor="middle">${k}</text>`);
 if(metric==='bestMean'){
  parts.push(`<line x1="48" y1="${y(78.26)}" x2="850" y2="${y(78.26)}" stroke="#b8c1a9" stroke-dasharray="4 5"/><text x="849" y="${y(78.26)-7}" text-anchor="end" style="font-size:8px">QUALITY FLOOR · 78.26</text>`);
  if($('#variance').checked)for(const g of visible){const upper=g.curves.map(r=>`${x(r.attempt)},${y(Math.min(100,r.bestMean+r.bestSD))}`),lower=[...g.curves].reverse().map(r=>`${x(r.attempt)},${y(Math.max(0,r.bestMean-r.bestSD))}`);parts.push(`<polygon points="${[...upper,...lower].join(' ')}" fill="${styles[g.controller].color}" opacity=".09"/>`);}
 }
 parts.push(`<line x1="${x(attempt)}" x2="${x(attempt)}" y1="30" y2="253" stroke="#9cae88" opacity=".5" stroke-dasharray="2 4"/>`);
 for(const g of [...visible].reverse()){
  const s=styles[g.controller],p=points(g);let path=`M${p[0].join(',')}`;
  for(let i=1;i<p.length;i++)path+=metric==='everPassRate'?` H${p[i][0]} V${p[i][1]}`:` L${p[i].join(',')}`;
  parts.push(`<path d="${path}" fill="none" stroke="${s.color}" stroke-width="2.7" ${s.dash?'stroke-dasharray="6 5"':''} stroke-linecap="round" stroke-linejoin="round"/>`);
  if(metric!=='bestMean')for(const [px,py]of p)parts.push(`<circle cx="${px}" cy="${py}" r="2.5" fill="${s.color}"/>`);
  parts.push(`<circle cx="${p[attempt-1][0]}" cy="${p[attempt-1][1]}" r="4" fill="${s.color}" stroke="#faf9f4" stroke-width="2"/>`);
 }
 svg.innerHTML=parts.join('');svg.setAttribute('aria-label',d.title);$('#axis-label').textContent=d.axis;$('#chart-note').textContent=d.note;$('#readout-note').textContent=d.readout;$('#readout-title').textContent=`AT ATTEMPT ${String(attempt).padStart(2,'0')}`;$('#attempt-value').textContent=attempt;
 $('#readout').innerHTML=visible.map(g=>{const s=styles[g.controller],r=g.curves[attempt-1],value=metric==='bestMean'?r.bestMean:100*r[metric];return `<div class="readout-row"><span class="series-name"><strong>${s.name}</strong>${s.mode}</span><span class="value">${value.toFixed(metric==='bestMean'?1:0)}%${metric==='bestMean'?`<small>± ${r.bestSD.toFixed(1)}</small>`:''}</span></div>`;}).join('')||'<p>Select a controller below.</p>';
}
$$('[data-metric]').forEach(b=>b.addEventListener('click',()=>{metric=b.dataset.metric;$$('[data-metric]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));$('#variance').disabled=metric!=='bestMean';drawChart();}));
$('#variance').addEventListener('change',drawChart);$('#attempt').addEventListener('input',e=>{attempt=Number(e.target.value);drawChart();});
$('#chart').addEventListener('pointermove',e=>{if(e.pointerType!=='mouse')return;const rect=e.currentTarget.getBoundingClientRect(),px=(e.clientX-rect.left)/rect.width*900,next=Math.max(1,Math.min(10,Math.round((px-48)/89.1)+1));if(attempt!==next){attempt=next;$('#attempt').value=next;drawChart();}});
drawChart();
for(const g of groups){const o=document.createElement('option');o.value=g.controller;o.textContent=`${styles[g.controller].name} · ${styles[g.controller].mode}`;$('#controller-filter').append(o);}
function gallery(){
 const controller=$('#controller-filter').value,seed=$('#seed-filter').value;
 const matches=DATA.passes.filter(p=>(controller==='all'||p.controller===controller)&&(seed==='all'||p.seed===Number(seed)));
 const shown=expanded?matches:matches.slice(0,8);
 $('#cup-count').textContent=`${shown.length} OF ${matches.length} PASSING CUPS`;
 $('#cup-gallery').innerHTML=shown.map(p=>`<button type="button" class="cup-card" data-cup="${esc(p.id)}" aria-label="Inspect ${styles[p.controller].name}, ${styles[p.controller].mode}, seed ${p.seed}, attempt ${p.attempt}, score ${p.score}%"><div class="card-counter"><span class="card-pass"><span class="status-dot"></span>PASS</span><div class="saucer"><div class="cup"><canvas width="32" height="32" aria-hidden="true"></canvas></div></div></div><div class="card-info"><div><strong>${styles[p.controller].name} · ${styles[p.controller].mode.toLowerCase()}</strong><small>Seed ${p.seed} <span aria-hidden="true">/</span> Attempt ${p.attempt}</small></div><span class="card-score">${p.score.toFixed(1)}<small>SCORE %</small></span></div></button>`).join('')||'<p class="empty-state">No passing cups for this selection.</p>';
 $$('.cup-card').forEach((b,i)=>{surface(b.querySelector('canvas'),shown[i].surface);b.addEventListener('click',()=>openCup(shown[i]));});
 $('#show-cups').hidden=matches.length<=8;$('#show-cups').innerHTML=expanded?'Show fewer cups <span aria-hidden="true">↑</span>':`Show all ${matches.length} cups <span aria-hidden="true">↓</span>`;
}
$('#show-cups').addEventListener('click',()=>{expanded=!expanded;gallery();});
for(const el of [$('#controller-filter'),$('#seed-filter')])el.addEventListener('change',()=>{expanded=false;gallery();});
const dialog=$('#cup-dialog');
function openCup(p){$('#dialog-eyebrow').textContent=`SEED ${p.seed} / ATTEMPT ${p.attempt} / PASS`;$('#dialog-title').textContent=`${styles[p.controller].name} · ${styles[p.controller].mode.toLowerCase()} · ${p.score}%`;$('#dialog-image').src=p.image;$('#dialog-image').alt=`Target heart beside ${p.controller}, seed ${p.seed}, attempt ${p.attempt}`;$('#dialog-review').textContent=p.review;$('#download-cup').href=p.image;$('#download-cup').download=p.png;dialog.showModal();}
$('#show-scorer').addEventListener('click',()=>{$('#dialog-eyebrow').textContent='SCORER REGRESSION';$('#dialog-title').textContent='A heart passes. Ovals fail.';$('#dialog-image').src=DATA.scorerImage;$('#dialog-image').alt='Target, passing reference heart at 85.8%, and failing ovals at 60.5% and 58.9%';$('#dialog-review').textContent='The reviewed reference scores 85.8% and passes. The old seed-42 and seed-46 ovals score 60.5% and 58.9% and fail. These outcomes were frozen before the pilot.';$('#download-cup').href=DATA.scorerImage;$('#download-cup').download='scorer-check.png';dialog.showModal();});
$('.dialog-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
function download(content,type,name){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('#export-data').addEventListener('click',()=>download(JSON.stringify(DATA.summary,null,2),'application/json','latte-bench-results.json'));
$('#export-verification').addEventListener('click',()=>download(JSON.stringify(DATA.verification,null,2),'application/json','latte-bench-verification.json'));
$('#export-report').addEventListener('click',()=>download(reportSource,'text/html','latte-bench-heart-study.html'));
gallery();
