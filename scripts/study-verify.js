import {createHash} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {runPlan,environmentFor,planContext,validatePlan} from '../src/plans.js';
import {taskSpec,evaluateCup} from '../src/benchmark.js';
import {normalizeResponse,requestBody} from './study-provider.js';
import {tokenCost} from '../src/pilot-budget.js';
const dir='results/heart-model-study',out='docs/model-study',r=await Bun.file(dir+'/agents.json').json();
const check=(x,m)=>{if(!x)throw new Error(m);},same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),sha=async p=>createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex');
check(r.finishedAt,'Run is still active');if(r.queueIdentity)for(const [p,h]of Object.entries(r.queueIdentity.hashes))check(await sha(p)===h,'Queue source hash differs '+p);if(r.proIdentity)for(const [p,h]of Object.entries(r.proIdentity.hashes))check(await sha(p)===h,'Pro source hash differs '+p);if(r.continuationIdentity)for(const [p,h]of Object.entries(r.continuationIdentity.hashes))check(await sha(p)===h,'Continuation source hash differs '+p);for(const [p,h]of Object.entries(r.identity.hashes))check(await sha(p)===h,'Source hash differs '+p);
const old=await Bun.file('results/heart-frozen-v3/optimizer.json').json();
for(const [p,h]of Object.entries(old.identity.hashes))if(p.startsWith('src/')||p.startsWith('tasks/'))check(await sha(p)===h,'CMA source mismatch '+p);
const publicCalls=[];
let cost=0,replayed=0,valid=0,formats=0,rejected=0,passes=0,unavailable=0;
for(const c of r.ledger.entries){
 check(c.committedBeforeUSD+c.reservedUSD<=r.ledger.capUSD+1e-9,'Oversubscribed cap');check(c.status!=='pending','Pending call');cost+=c.costUSD??c.reservedUSD;
 const record={number:c.number,lane:c.lane??'original',reservedUSD:c.reservedUSD,committedBeforeUSD:c.committedBeforeUSD,model:c.model,mode:c.mode,seed:c.seed,attempt:c.attempt,phase:c.phase,correction:c.correction,status:c.status,costUpperUSD:c.costUSD??c.reservedUSD,returnedModel:c.returnedModel??null,inputTokens:c.usage?.prompt_tokens??null,outputTokens:c.usage?.completion_tokens??null,stopReason:null,reasoningTokens:null};publicCalls.push(record);
 if(c.status==='completed'){
  const audit=await Bun.file(dir+'/'+c.audit).json(),m=r.protocol.models.find(x=>x.id===c.model),n=normalizeResponse(m.api,audit.response);
  record.stopReason=m.api==='responses'?(audit.response.incomplete_details?.reason??audit.response.status):m.api==='anthropic'?audit.response.stop_reason:audit.response.choices?.[0]?.finish_reason;record.truncated=['length','max_tokens','max_output_tokens'].includes(record.stopReason);record.reasoningTokens=audit.response.usage?.completion_tokens_details?.reasoning_tokens??audit.response.usage?.output_tokens_details?.reasoning_tokens??null;
  check(typeof n.model==='string'&&n.model.length>0&&c.returnedModel===n.model,'Returned model identity missing or mismatched');
  check(c.costUSD+1e-9>=tokenCost(n.usage,m.ratesPerMillion),'Under-accounted tokens');check(c.costUSD<=c.reservedUSD+1e-9,'Reservation exceeded');
  const input=JSON.parse(audit.messages[1].content);check(same(audit.body,requestBody(m,c.phase,input,r.protocol.maxTokens[c.phase]).body),'Wire payload changed');
 }
}
check(cost<=r.ledger.capUSD,'Cap exceeded');
const compact=[];
for(const e of r.experiments){
 const records=[];
 for(const a of e.attempts){
  check(same(a.environment,environmentFor(e.config.seed,a.number-1)),'Milk not matched');
  const calls=r.ledger.entries.filter(c=>c.model===e.model&&c.seed===e.config.seed&&c.mode===e.config.ablation&&c.attempt===a.number);
  const planCalls=calls.filter(c=>c.phase==='plan');check(planCalls.length>=1&&planCalls.length<=3,'Plan submission budget violated');let validProviderPlan=null,invalidOutputs=0;
  for(const c of calls){
   const audit=await Bun.file(dir+'/'+c.audit).json(),input=JSON.parse(audit.messages[1].content);
   if(c.phase==='plan'){
    if(c.status==='completed'){const m=r.protocol.models.find(m=>m.id===e.model);try{const text=normalizeResponse(m.api,audit.response).text;validProviderPlan=validatePlan(JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g,'').trim()));}catch{invalidOutputs++;}}
    const {formatFeedback,...base}=input;
    check(same(base,planContext({task:taskSpec('heart',42),milk:a.environment,ablation:e.config.ablation,notes:a.notesBefore})),'Memory mismatch');
   }else check(input.priorNotes===a.notesBefore,'Reflection memory mismatch');
  }
  if(a.outcome!=='Error'){check(invalidOutputs===a.formatErrors.length,'Format-error log mismatch');check(calls.filter(c=>c.phase==='notes').length===1,'Missing reflection call');if(a.outcome==='Rejected')check(invalidOutputs===3&&!validProviderPlan&&!a.evaluation,'Invalid rejection accounting');else check(same(validProviderPlan,a.plan),'Executed plan differs from provider output');}
  if(calls.every(c=>c.status==='completed'))check(Math.abs(a.costUSD-calls.reduce((s,c)=>s+c.costUSD,0))<1e-9,'Attempt cost differs from ledger');
  if(e.config.ablation==='no-notes')check(a.notesBefore===''&&a.notesAfter==='','Control memory leak');
  else check(a.notesBefore===(a.number===1?'':e.attempts[a.number-2].notesAfter),'Note sequence broken');
  formats+=a.formatErrors.length;rejected+=a.outcome==='Rejected';unavailable+=a.outcome==='Error';
  if(a.evaluation){
   const full=await Bun.file(dir+'/'+a.evidence).json();validatePlan(a.plan);
   check(same(evaluateCup(taskSpec('heart',42),a.observation,a.surface),a.evaluation),'Score mismatch');
   const replay=runPlan({plan:a.plan,task:taskSpec('heart',42),conditions:a.environment,evidence:true});
   for(const field of ['surface','observation','actions','trace'])check(same(full[field],replay[field]),'Replay mismatch '+field);
   valid++;replayed++;passes+=a.evaluation.passed;
  }
  records.push({number:a.number,outcome:a.outcome,evaluation:a.evaluation??null,plan:a.plan??null,surface:a.surface??null,environment:a.environment,costUpperUSD:calls.reduce((s,c)=>s+(c.costUSD??c.reservedUSD),0),formatErrors:a.formatErrors.length,notesError:a.notesError??null,returnedModels:[...new Set(calls.map(c=>c.returnedModel).filter(Boolean))]});
 }
 compact.push({model:e.model,seed:e.config.seed,mode:e.config.ablation,attempts:records});
}
const baseline=old.experiments.filter(e=>r.protocol.seeds.includes(e.seed)).map(e=>({model:'CMA-ES',seed:e.seed,mode:'optimizer',attempts:e.attempts.slice(0,5).map(a=>({number:a.number,outcome:a.outcome,evaluation:a.evaluation,plan:a.plan,surface:a.surface,environment:a.environment,costUpperUSD:0,formatErrors:0}))}));
for(const e of baseline)for(const a of e.attempts){check(same(a.environment,environmentFor(e.seed,a.number-1)),'CMA milk mismatch');const replay=runPlan({plan:a.plan,task:taskSpec('heart',42),conditions:a.environment,evidence:false});check(same(a.surface,replay.surface)&&same(a.evaluation,replay.evaluation),'CMA replay mismatch');replayed++;}
const verification={runtime:{bun:Bun.version,platform:process.platform,arch:process.arch},sourceFiles:Object.keys(r.identity.hashes).length,validAttempts:valid,physicalReplays:replayed,formatErrors:formats,rejectedPlans:rejected,providerErrorEpisodes:unavailable,passes,calls:r.ledger.entries.length,costUpperUSD:cost,completedChargeUSD:r.ledger.entries.reduce((s,c)=>s+(c.costUSD??0),0),heldUnknownChargeUSD:r.ledger.entries.filter(c=>c.costUSD==null).reduce((s,c)=>s+c.reservedUSD,0),capUSD:r.ledger.capUSD,memoryIsolation:'Every stored request checked against fresh allowed context; gateway internals not observable',noProviderCalls:true};
const publicAvailability=structuredClone(r.unavailable);for(const v of Object.values(publicAvailability)){try{const error=JSON.parse(v.reason.slice(v.reason.indexOf('{'))).error;if(error?.message)v.reason=`Provider access error (${error.code??error.type}): ${error.message}`;}catch{}}
await mkdir(out,{recursive:true});const csvFields=['number','lane','model','mode','seed','attempt','phase','correction','status','returnedModel','inputTokens','outputTokens','reasoningTokens','stopReason','reservedUSD','committedBeforeUSD','costUpperUSD'];const csvCell=v=>'"'+String(v??'').replaceAll('"','""')+'"';await Bun.write(out+'/calls.csv',csvFields.join(',')+'\n'+publicCalls.map(c=>csvFields.map(k=>csvCell(c[k])).join(',')).join('\n')+'\n');
await Bun.write(out+'/verification.json',JSON.stringify(verification,null,2));
await Bun.write(out+'/evidence.json',JSON.stringify({identity:r.identity,continuationIdentity:r.continuationIdentity,proIdentity:r.proIdentity,queueIdentity:r.queueIdentity,schedulingAmendment:r.schedulingAmendment,budgetChanges:r.budgetChanges,executionLanes:r.executionLanes,protocol:r.protocol,createdAt:r.createdAt,finishedAt:r.finishedAt,completed:r.completed,unavailable:publicAvailability,verification,calls:publicCalls,experiments:[...compact,...baseline]}));
console.log(JSON.stringify(verification,null,2));
