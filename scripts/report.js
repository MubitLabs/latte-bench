import {mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {experimentSummary} from '../src/experiments.js';
const paths=Bun.argv.slice(2);if(!paths.length)throw new Error('Usage: bun run report results/plans.json [results/optimizer-plans.json ...]');
const groups=new Map();
for(const path of paths){
  const report=await Bun.file(path).json();
  for(const e of report.experiments??[report]){
    if(e.schema!=='latte-bench/0.3'||!e.config||!Array.isArray(e.attempts))throw new Error('Expected plan benchmark v0.3 reports.');
    const c=e.config,models=[...new Set(e.attempts.flatMap(a=>Array.isArray(a.calls)?a.calls.map(x=>x.model).filter(Boolean):[]))].sort();
    const key=JSON.stringify([e.spaceHash,c.ablation,c.taskId,c.targetSeed,c.evaluationKind,c.randomized,c.attempts,models]);
    if(!groups.has(key))groups.set(key,[]);
    if(groups.get(key).some(x=>x.config.seed===c.seed))throw new Error('Duplicate seed within a report group; do not double count runs.');
    groups.get(key).push(e);
  }
}
const mean=xs=>xs.reduce((a,b)=>a+b,0)/xs.length;
const summarize=es=>{
  const summaries=es.map(experimentSummary),points=[];
  const max=Math.max(...summaries.map(s=>s.curve.length));
  for(let i=0;i<max;i++){
    const rows=summaries.map(s=>s.curve[i]).filter(Boolean),scores=rows.map(a=>a.score),m=mean(scores);
    const variance=scores.length>1?scores.reduce((n,s)=>n+(s-m)**2,0)/(scores.length-1):null;
    points.push({attempt:i+1,n:rows.length,mean:m,sampleVariance:variance,sd:variance==null?null:Math.sqrt(variance),
      meanCostUSD:rows.every(a=>a.costUSD!=null)?mean(rows.map(a=>a.costUSD)):null,
      meanCumulativeCostUSD:rows.every(a=>a.cumulativeCostUSD!=null)?mean(rows.map(a=>a.cumulativeCostUSD)):null,
      rejected:rows.filter(a=>a.outcome==='Rejected').length,errors:rows.filter(a=>a.outcome==='Error').length});
  }
  return {config:{...es[0].config,seed:undefined,initialPast:undefined,initialNotes:undefined},models:[...new Set(es.flatMap(e=>e.attempts.flatMap(a=>Array.isArray(a.calls)?a.calls.map(c=>c.model).filter(Boolean):[])))].sort(),seeds:es.map(e=>e.config.seed),points,
    perSeed:es.map((e,i)=>({seed:e.config.seed,...summaries[i],source:e.config.source??null})),
    notes:'Error/rejected attempts score zero and consume budget. Variance is across independent seeds at the same attempt index. Null variance means only one seed; null cost means unreported. Held-out memory/plans are frozen; source training costs are shown separately.'};
};
const summaries=[...groups.values()].map(summarize);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=x=>x==null?'unreported':'$'+x.toFixed(5);
function chart(points){
  const x=i=>45+(i-1)/Math.max(1,points.length-1)*630,y=v=>220-v*2;
  const line=points.map(p=>`${x(p.attempt)},${y(p.mean)}`).join(' ');
  return `<svg viewBox="0 0 720 255" role="img" aria-label="Mean shape score by attempt; whiskers show one sample standard deviation"><path d="M45 20V220H690" fill="none" stroke="#b3b9ab"/>${[0,25,50,75,100].map(v=>`<text x="5" y="${y(v)+4}" font-size="11">${v}%</text>`).join('')}<polyline points="${line}" fill="none" stroke="#426747" stroke-width="2"/>${points.map(p=>`<g><title>Attempt ${p.attempt}: ${p.mean.toFixed(2)}%, SD ${p.sd?.toFixed(2)??'unavailable'}, n=${p.n}</title><path d="M${x(p.attempt)} ${y(Math.min(100,p.mean+(p.sd??0)))}V${y(Math.max(0,p.mean-(p.sd??0)))}" stroke="#92ab8b"/><circle cx="${x(p.attempt)}" cy="${y(p.mean)}" r="3" fill="#426747"/></g>`).join('')}<text x="330" y="250" font-size="12">Attempt number (1–${points.length})</text></svg>`;
}
const html=`<!doctype html><html><meta charset="utf-8"><title>Latte Bench report</title><style>body{max-width:1000px;margin:50px auto;padding:0 24px;background:#f6f4ec;color:#354234;font:15px/1.6 system-ui}section{background:#fffef8;padding:24px;margin:24px 0;border:1px solid #dce0d4;border-radius:12px}svg{width:100%;max-height:350px}table{border-collapse:collapse;width:100%;font-size:12px}td,th{padding:8px;text-align:left;border-bottom:1px solid #dde1d4}p{color:#6a7763}h1,h2{font-weight:500}</style><h1>Latte Bench · plan then execute</h1><p>Mean scores with sample standard deviation across seeds. Training, held-out milk and held-out shapes are separate panels. No claim of model learning follows from these curves alone.</p>${summaries.map(g=>`<section><h2>${esc(g.config.ablation)} · ${esc(g.config.taskId)} · ${esc(g.config.evaluationKind)}</h2><p>Controller: ${esc(g.models.join(', ')||g.config.ablation)} · Seeds ${g.seeds.join(', ')} · ${g.config.randomized?'randomized milk':'default milk'} · ${g.config.attempts} attempts per seed</p>${chart(g.points)}<table><tr><th>Attempt</th><th>Mean ± SD</th><th>Variance</th><th>n</th><th>Mean cost / attempt</th><th>Cumulative</th><th>Rejected / errors</th></tr>${g.points.map(p=>`<tr><td>${p.attempt}</td><td>${p.mean.toFixed(2)} ± ${p.sd?.toFixed(2)??'—'}%</td><td>${p.sampleVariance?.toFixed(3)??'—'}</td><td>${p.n}</td><td>${money(p.meanCostUSD)}</td><td>${money(p.meanCumulativeCostUSD)}</td><td>${p.rejected} / ${p.errors}</td></tr>`).join('')}</table><h3>Cost to first pass</h3><table><tr><th>Seed</th><th>First passing attempt</th><th>Cost to first pass</th><th>Total run cost</th></tr>${g.perSeed.map(s=>`<tr><td>${s.seed}</td><td>${s.firstPassAttempt??'not reached'}</td><td>${s.firstPassAttempt?money(s.costToFirstPassUSD):'not reached'}</td><td>${money(s.totalCostUSD)}</td></tr>`).join('')}</table><p>${esc(g.notes)}</p><details><summary>Source training budgets / costs</summary><pre>${esc(JSON.stringify(g.perSeed.map(s=>({seed:s.seed,source:s.source})),null,2))}</pre></details></section>`).join('')}<p>Optimizer cost is zero API dollars, not zero compute cost. Comparisons require identical parameter-space hashes, target/milk seeds, attempt budgets and model settings.</p></html>`;
const output='results/report.html';await mkdir(dirname(output),{recursive:true});await Bun.write(output,html);await Bun.write('results/report.json',JSON.stringify({schema:'latte-bench/0.3',groups:summaries},null,2));
console.log(`Wrote ${output} and results/report.json (${summaries.length} separate groups).`);
