import {createHash} from 'node:crypto';
import {taskSpec,evaluateCup} from '../src/benchmark.js';
import {runPlan,validatePlan,environmentFor,SPACE_HASH,PLAN_RESPONSE_FORMAT,NOTES_RESPONSE_FORMAT,PLAN_PARAMETER_GUIDE} from '../src/plans.js';
import {budgetAvailable,tokenCost} from '../src/pilot-budget.js';
const dir='results/heart-pilot-v2';
const check=(condition,message)=>{if(!condition)throw new Error(message);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const hashes=await Bun.file(dir+'/source-hashes.json').json();
for(const [path,hash] of Object.entries(hashes))check(createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')===hash,`Frozen source changed: ${path}`);
const opt=await Bun.file(dir+'/optimizer.json').json();
check(opt.experiments.length===5&&opt.experiments.every(e=>e.attempts.length===300),'Incomplete optimizer budget');
check(opt.spaceHash===SPACE_HASH,'Optimizer space differs');
let scored=0,replays=0;
const task=taskSpec('heart',42);
for(const e of opt.experiments){
 for(const a of e.attempts){
  validatePlan(a.plan);
  check(same(a.environment,environmentFor(e.seed,a.number-1)),'Optimizer milk mismatch');
  check(same(evaluateCup(task,a.observation,a.surface),a.evaluation),'Optimizer score mismatch');scored++;
 }
 const selected=new Set([e.attempts[0],e.attempts.reduce((a,b)=>a.evaluation.score>b.evaluation.score?a:b),...e.attempts.filter(a=>a.evaluation.passed)]);
 for(const a of selected){
  const r=runPlan({plan:a.plan,task,conditions:a.environment,evidence:false});
  check(same(r.surface,a.surface)&&same(r.observation,a.observation),'Optimizer physical replay mismatch');replays++;
 }
}
if(Bun.argv.includes('--optimizer-only')){
 console.log(JSON.stringify({frozenSources:Object.keys(hashes).length,scored,physicalReplays:replays,noProviderRequests:true},null,2));
 process.exit(0);
}
const report=await Bun.file(dir+'/agents.json').json();
check(report.completed,'Agent run is incomplete; verify after completion');
check(report.experiments.length===6&&report.experiments.every(e=>e.attempts.length===10),'Incorrect agent budget');
const ledger=report.ledger;
check(ledger.entries.every(e=>e.status==='completed'),'Unresolved billing');
const spent=ledger.entries.reduce((s,e)=>s+e.costUSD,0);
check(spent<=20&&ledger.entries.length<=240,'Spend/call cap exceeded');
for(let i=0;i<ledger.entries.length;i++){
 const entry=ledger.entries[i];
 check(budgetAvailable({capUSD:20,entries:ledger.entries.slice(0,i)},entry.reservedUSD),'Unfunded dispatch');
 check(same(entry.responseFormat,entry.phase==='plan'?PLAN_RESPONSE_FORMAT:NOTES_RESPONSE_FORMAT),'Strict response schema missing');
 check(entry.costUSD<=entry.reservedUSD,'Actual usage exceeded reservation');
 check(entry.response.usage.prompt_tokens<=entry.bounds.inputTokenUpperBound&&entry.response.usage.completion_tokens<=entry.bounds.outputTokenUpperBound,'Token bounds exceeded');
 if(entry.costBasis.startsWith('standard'))check(Math.abs(entry.costUSD-tokenCost(entry.response.usage,report.protocol.ratesPerMillion))<1e-10,'Token accounting mismatch');
 check(entry.model===report.protocol.model||entry.model.startsWith(report.protocol.model+'-'),'Returned model mismatch');
}
let formatErrors=0,repairs=0,rejections=0,passes=0;
for(const e of report.experiments){
 check(e.spaceHash===SPACE_HASH,'Agent parameter space differs');
 const optimizer=opt.experiments.find(x=>x.seed===e.config.seed);
 for(const a of e.attempts){
  check(same(a.environment,optimizer.attempts[a.number-1].environment),'Unmatched milk');
  const calls=ledger.entries.filter(x=>x.seed===e.config.seed&&x.mode===e.config.ablation&&x.attempt===a.number);
  const planning=calls.filter(x=>x.phase==='plan');
  check(planning.length>=1&&planning.length<=3,'Invalid format correction budget');
  check(calls.filter(x=>x.phase==='notes').length===1,'Missing reflection or unequal opportunity');
  check(Math.abs(a.costUSD-calls.reduce((s,x)=>s+x.costUSD,0))<1e-10,'Attempt cost mismatch');
  for(const call of planning){
   const input=JSON.parse(call.messages[1].content);
   check(Object.keys(input.milk).sort().join(',')==='startingTemperatureC,volumeML'&&!input.pastAttempts,'Latent milk/history leak');
   check(input.space.parameters.length===33&&input.space.parameters.every((p,i)=>same(p,PLAN_PARAMETER_GUIDE[i])),'Parameter guide incomplete');
   if(e.config.ablation==='no-notes')check(!Object.hasOwn(input,'notes'),'Notes leaked into control');
   else check(input.notes===a.notesBefore,'Wrong notes supplied');
   if(call.correction)check(input.formatFeedback.correction===call.correction&&input.formatFeedback.error,'Missing validation feedback');
  }
  formatErrors+=a.formatErrors.length;repairs+=a.formatRepairCalls;
  check(a.formatRepairCalls===planning.length-1,'Repair count mismatch');
  if(a.outcome==='Rejected'){rejections++;check(!a.trace&&!a.evaluation&&a.formatErrors.length===3,'Rejected plan executed or insufficient repairs');continue;}
  validatePlan(a.plan);
  check(same(evaluateCup(task,a.observation,a.surface),a.evaluation),'Agent score mismatch');scored++;
  const r=runPlan({plan:a.plan,task,conditions:a.environment,evidence:true});
  for(const field of ['surface','observation','actions','trace'])check(same(r[field],a[field]),`Agent physical ${field} replay mismatch`);replays++;
  if(a.evaluation.passed)passes++;
 }
}
const gallery=await Bun.file('docs/heart-pilot-v2/passes.json').json();
check(gallery.length===passes+opt.experiments.reduce((s,e)=>s+e.attempts.filter(a=>a.evaluation.passed).length,0),'Pass gallery incomplete');
for(const p of gallery){check(p.visualReview!=='Awaiting visual review','Unreviewed numerical pass');check(await Bun.file('docs/heart-pilot-v2/'+p.png).exists(),'Missing pass PNG');}
console.log(JSON.stringify({frozenSources:Object.keys(hashes).length,scored,physicalReplays:replays,calls:ledger.entries.length,costUpperUSD:spent,matchedEpisodes:60,formatErrors,repairs,rejections,visuallyReviewedPasses:gallery.length,noProviderRequests:true},null,2));
