import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import protocol from '../experiments/heart-frozen-v3.json';
import {taskSpec,evaluateCup} from '../src/benchmark.js';
import {runPlan,environmentFor,planContext,PLAN_RESPONSE_FORMAT,NOTES_RESPONSE_FORMAT,SPACE_HASH,validatePlan} from '../src/plans.js';
const dir='results/heart-frozen-v3',opt=await Bun.file(dir+'/optimizer.json').json(),agents=await Bun.file(dir+'/agents.json').json();
const check=(v,m)=>{if(!v)throw new Error(m);},same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
check(agents.completed,'Agent run incomplete');check(same(opt.identity,agents.identity),'Freeze identities differ');
const tagged=execFileSync('git',['rev-parse',protocol.tag+'^{commit}'],{encoding:'utf8'}).trim();check(tagged===agents.identity.commit,'Tag mismatch');
for(const [p,hash] of Object.entries(agents.identity.hashes))check(createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')===hash,`Frozen source changed: ${p}`);
check(opt.experiments.length===5&&opt.experiments.every(e=>e.attempts.length===10),'Wrong CMA budget');
check(agents.experiments.length===20&&agents.experiments.every(e=>e.attempts.length===10),'Wrong agent budget');
const ledger=agents.ledger,entries=ledger.entries;check(entries.every(e=>e.status==='completed'),'Unresolved billing');
let cost=0,scored=0,replayed=0,rejections=0,formatErrors=0,passes=0;
for(const c of entries){
 check(c.committedBeforeUSD+c.reservedUSD<=50+1e-9,'Oversubscribed dispatch');check(c.costUSD<=c.reservedUSD+1e-9,'Reservation exceeded');cost+=c.costUSD;
 check(same(c.responseFormat,c.phase==='plan'?PLAN_RESPONSE_FORMAT:NOTES_RESPONSE_FORMAT),'Missing strict schema');
 check(c.returnedModel===c.model||c.returnedModel.startsWith(c.model+'-'),'Wrong model');
 check(c.response.usage.prompt_tokens<=c.bounds.inputTokenUpperBound&&c.response.usage.completion_tokens<=c.bounds.outputTokenUpperBound,'Token contract exceeded');
}
check(cost<=50&&entries.length<=800,'Total spend or call limit exceeded');
function verifyPour(a){
 validatePlan(a.plan);check(a.spaceHash===SPACE_HASH,'Space mismatch');
 const task=taskSpec('heart',42);check(same(evaluateCup(task,a.observation,a.surface),a.evaluation),'Score mismatch');scored++;
 const replay=runPlan({plan:a.plan,task,conditions:a.environment,evidence:!!a.trace});
 for(const f of ['surface','actions','observation',...(a.trace?['trace']:[])])check(same(a[f],replay[f]),`Physical replay mismatch: ${f}`);replayed++;
 if(a.evaluation.passed)passes++;
}
for(const e of opt.experiments)for(const a of e.attempts){check(same(a.environment,environmentFor(e.seed,a.number-1)),'CMA milk mismatch');verifyPour(a);}
for(const e of agents.experiments){
 const matched=opt.experiments.find(x=>x.seed===e.config.seed);
 for(const a of e.attempts){
  check(same(a.environment,matched.attempts[a.number-1].environment),'Unmatched milk');
  const calls=entries.filter(c=>c.model===e.model&&c.mode===e.config.ablation&&c.seed===e.config.seed&&c.attempt===a.number),plans=calls.filter(c=>c.phase==='plan');
  check(plans.length>=1&&plans.length<=3&&calls.filter(c=>c.phase==='notes').length===1,'Wrong call/repair budget');
  check(Math.abs(a.costUSD-calls.reduce((n,c)=>n+c.costUSD,0))<1e-9,'Attempt cost mismatch');
  const fresh=planContext({task:taskSpec('heart',42),milk:a.environment,ablation:e.config.ablation,notes:a.notesBefore});
  for(const c of plans){
   check(c.messages.length===2&&c.messages[0].role==='system'&&c.messages[1].role==='user','Unexpected conversation history');
   const {formatFeedback,...input}=JSON.parse(c.messages[1].content);check(same(input,fresh),'Planning context differs from fresh allowed payload');
   if(c.correction)check(formatFeedback?.correction===c.correction&&formatFeedback.error,'Missing repair error');
  }
  const reflection=JSON.parse(calls.find(c=>c.phase==='notes').messages[1].content);
  check(reflection.priorNotes===a.notesBefore,'Reflection history mismatch');
  if(e.config.ablation==='no-notes')check(a.notesBefore===''&&reflection.priorNotes==='','No-notes leak');
  else check(a.notesBefore===(a.number===1?'':e.attempts[a.number-2].notesAfter),'Cross-run or stale note');
  formatErrors+=a.formatErrors.length;
  if(a.outcome==='Rejected'){rejections++;check(!a.trace&&!a.evaluation&&a.formatErrors.length===3,'Invalid rejection');continue;}
  verifyPour(a);
 }
}
const summary=await Bun.file(dir+'/report/summary.json').json();check(summary.passes.length===passes,'Pass gallery incomplete');
for(const p of summary.passes){check(await Bun.file(dir+'/report/'+p.png).exists(),'Missing pass image');check(p.review!=='Awaiting visual inspection','Unreviewed pass');}
console.log(JSON.stringify({tag:protocol.tag,commit:tagged,frozenSourceFiles:Object.keys(agents.identity.hashes).length,scored,physicalReplays:replayed,matchedAgentEpisodes:200,calls:entries.length,costUpperUSD:cost,formatErrors,rejections,passes,clientMemoryIsolation:'verified for every request',providerMemoryIsolation:'not independently observable',noProviderRequests:true},null,2));
