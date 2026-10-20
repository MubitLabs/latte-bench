import {taskSpec,evaluateCup} from '../src/benchmark.js';
import {runPlan,validatePlan,environmentFor} from '../src/plans.js';
import {budgetAvailable} from '../src/pilot-budget.js';
const opt=await Bun.file('results/heart-pilot/optimizer.json').json();
if(opt.experiments.length!==5||opt.experiments.some(e=>e.attempts.length!==300))throw new Error('Incomplete optimizer budget.');
let scored=0,replays=0;
for(const e of opt.experiments){
 for(const a of e.attempts){
  validatePlan(a.plan);
  if(JSON.stringify(evaluateCup(taskSpec('heart',42),a.observation,a.surface))!==JSON.stringify(a.evaluation))throw new Error('Optimizer score mismatch.');
  scored++;
 }
 // Replay only selected evidence; these are deterministic verification, not
 // additional search evaluations or feedback to either controller.
 const selected=new Set([e.attempts[0],e.attempts.reduce((a,b)=>a.evaluation.score>b.evaluation.score?a:b),...e.attempts.filter(a=>a.evaluation.passed)]);
 for(const a of selected){
  const r=runPlan({plan:a.plan,conditions:environmentFor(e.seed,a.number-1),evidence:false});
  if(JSON.stringify(r.surface)!==JSON.stringify(a.surface))throw new Error('Optimizer replay mismatch.');replays++;
 }
}
const file=Bun.file('results/heart-pilot/agents.json');
if(await file.exists()){
 const report=await file.json();if(!report.completed)throw new Error('Agent run is not complete; verify after the runner stops.');
 if(report.experiments.length!==6||report.experiments.some(e=>e.attempts.length!==10))throw new Error('Incorrect agent budget.');
 const ledger=report.ledger;
 if(ledger.entries.some(e=>e.status!=='completed'))throw new Error('Unresolved billing.');
 const spent=ledger.entries.reduce((s,e)=>s+e.costUSD,0);if(spent>20||ledger.entries.length>120)throw new Error('Spend/call cap breached.');
 for(let i=0;i<ledger.entries.length;i++)if(!budgetAvailable({capUSD:20,entries:ledger.entries.slice(0,i)},ledger.entries[i].reservedUSD))throw new Error('Unfunded dispatch.');
 for(const e of report.experiments){
  const optimizer=opt.experiments.find(x=>x.seed===e.config.seed);
  for(const a of e.attempts){
   if(JSON.stringify(a.environment)!==JSON.stringify(optimizer.attempts[a.number-1].environment))throw new Error('Unmatched milk.');
   const planning=ledger.entries.find(x=>x.seed===e.config.seed&&x.mode===e.config.ablation&&x.attempt===a.number&&x.phase==='plan');
   const input=JSON.parse(planning.messages[1].content);
   if(Object.keys(input.milk).sort().join(',')!=='startingTemperatureC,volumeML'||input.pastAttempts)throw new Error('Latent condition or history leak.');
   if(e.config.ablation==='no-notes'&&Object.hasOwn(input,'notes'))throw new Error('Notes leaked into control.');
   if(e.config.ablation==='notes'&&input.notes!==a.notesBefore)throw new Error('Wrong notes.');
   if(a.evaluation){
    if(JSON.stringify(evaluateCup(taskSpec('heart',42),a.observation,a.surface))!==JSON.stringify(a.evaluation))throw new Error('Agent score mismatch.');scored++;
   }
  }
 }
 console.log(`Verified ${ledger.entries.length} capped calls, $${spent.toFixed(6)} at confirmed rates, all 60 matched milk episodes, and memory separation.`);
}
console.log(`Verified ${scored} scored pours and ${replays} selected physical replays. No provider requests.`);
