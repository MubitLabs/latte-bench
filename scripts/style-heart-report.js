// Presentation-only renderer. The tagged runner, scorer and saved measurements stay untouched.
import {mkdir} from 'node:fs/promises';
const root=new URL('../',import.meta.url),read=p=>Bun.file(new URL(p,root));
const summary=await read('results/heart-frozen-v3/report/summary.json').json();
const verification=await read('results/heart-frozen-v3/report/verification.json').json();
const check=await read('docs/heart-frozen-v3/scorer-check.json').json();
const agents=await read('results/heart-frozen-v3/agents.json').json();
if(!summary.completed||verification.physicalReplays!==250)throw new Error('This report requires the completed, verified frozen run.');
const png=async name=>'data:image/png;base64,'+Buffer.from(await read('results/heart-frozen-v3/report/'+name).arrayBuffer()).toString('base64');
const passes=await Promise.all(summary.passes.map(async p=>{
 const e=agents.experiments.find(e=>`${e.model} / ${e.config.ablation}`===p.controller&&e.config.seed===p.seed);
 return {...p,surface:e.attempts[p.attempt-1].surface,image:await png(p.png)};
}));
const data={summary,verification,passes,target:check.target,scorerImage:await png('scorer-check.png'),curveImage:await png('curves.png')};
const css=await read('reports/heart-study/style.css').text(),js=await read('reports/heart-study/report.js').text();
const template=await read('reports/heart-study/template.html').text();
const output=template.replace('/* REPORT_STYLE */',()=>css).replace('/* REPORT_DATA */',()=>`const DATA = ${JSON.stringify(data).replaceAll('<','\\u003c')};`).replace('/* REPORT_SCRIPT */',()=>js);
await mkdir(new URL('results/heart-frozen-v3/report/',root),{recursive:true});
await Bun.write(new URL('results/heart-frozen-v3/report/report.html',root),output);
await Bun.write(new URL('results/report.html',root),output);
console.log(`Styled report: ${passes.length} evidence cups, ${verification.physicalReplays} verified pours, ${(Buffer.byteLength(output)/1024).toFixed(0)} KB. No model calls.`);
