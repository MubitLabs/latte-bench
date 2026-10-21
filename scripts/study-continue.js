import {mkdir,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createExperiment,attemptExperiment,experimentSummary} from '../src/experiments.js';
import {calibrationStatus,planContext,environmentFor,assertPlanningIsolation} from '../src/plans.js';
import {taskSpec} from '../src/benchmark.js';
import {reserveCost,tokenCost} from '../src/pilot-budget.js';
import {reserveDispatch} from '../src/concurrent-budget.js';
import {requestBody,endpoint,normalizeResponse} from './study-provider.js';
import protocol from '../experiments/heart-model-study.json';
const dir='results/heart-model-study',file=dir+'/agents.json';
if(!Bun.argv.includes('--live')||!Bun.argv.includes('--billing=standard'))throw new Error('Requires --live --billing=standard.');
if(!(await Bun.file(file).exists()))throw new Error('Existing ledger required; no fresh run.');
const git=(...a)=>execFileSync('git',a,{encoding:'utf8'}).trim(),commit=git('rev-parse','latte-bench-v0.7-multimodel-access-amendment^{commit}');
if(git('rev-parse','HEAD')!==commit||git('status','--porcelain','--untracked-files=no'))throw new Error('Frozen tag and clean tracked checkout required.');
const hashes={};for(const p of git('ls-files','src','tasks','scripts/study-*','experiments/heart-model-study.json','package.json','bun.lock').split('\n').filter(Boolean))hashes[p]=createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex');
const gate=calibrationStatus({taskId:'heart',replay:true});if(!gate.ready)throw new Error(gate.reason);
const base=process.env.MUBIT_BASE_URL,key=process.env.MUBIT_API_KEY;if(!base||!key)throw new Error('Missing gateway configuration');
const report=await Bun.file(file).json();
if(report.continuedAt)throw new Error('This continuation has already been dispatched.');
if(report.ledger.entries.some(c=>c.status==='pending'))throw new Error('Outstanding requests; cannot resume safely.');
for(const c of report.ledger.entries){const e=report.experiments.find(e=>e.model===c.model&&e.config.seed===c.seed&&e.config.ablation===c.mode);if(!e?.attempts.some(a=>a.number===c.attempt))throw new Error('Uncommitted episode; manual recovery required.');}
for(const [p,h] of Object.entries(report.identity.hashes))if(createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')!==h)throw new Error('Original frozen source changed: '+p);
report.continuedAt=new Date().toISOString();report.continuationIdentity={tag:'latte-bench-v0.7-multimodel-access-amendment',commit,hashes};
report.unavailable['gpt-5.5-pro']={reason:'Stopped after the first paired seed-42 episode: all six plan submissions exhausted 4096 output tokens without a plan. Retained as a token-limited diagnostic, excluded from complete-model rankings to preserve the shared $100 cap.',kind:'budget-exclusion'};
for(const m of protocol.models)if(m.provider==='Anthropic'&&!['claude-opus-5-5','claude-sonnet-5-5'].includes(m.id)&&!report.unavailable[m.id])report.unavailable[m.id]={reason:'Not dispatched: gateway starter-credit policy returned by the Opus 4.8 request explicitly permits only Opus 5.5, Sonnet 5.5, and older Haiku 4.5. No Anthropic provider key is configured for other models.',kind:'access-policy-exclusion'};
await mkdir(dir+'/calls',{recursive:true});await mkdir(dir+'/episodes',{recursive:true});let saving=Promise.resolve();
function save(){const snapshot=JSON.stringify(report);const next=saving.then(async()=>{await Bun.write(file+'.tmp',snapshot);await rename(file+'.tmp',file);});saving=next;return next;}
function caller(e,index){
 const model=protocol.models.find(m=>m.id===e.model),context={model:e.model,seed:e.config.seed,mode:e.config.ablation,attempt:index+1};
 return async(phase,input)=>{
  if(report.unavailable[model.id])throw new Error('Model route disabled after provider error.');
  if(phase==='plan'){
   assertPlanningIsolation(input,context.mode);
   const {formatFeedback,...submitted}=input;
   const fresh=planContext({task:taskSpec('heart',42),milk:environmentFor(context.seed,index),ablation:context.mode,notes:e.notes});
   if(JSON.stringify(submitted)!==JSON.stringify(fresh))throw new Error('Planning memory isolation failed.');
  }else if(context.mode==='no-notes'&&input.priorNotes!=='')throw new Error('Control reflection memory leak.');
  const maxTokens=protocol.maxTokens[phase],{body,messages,format}=requestBody(model,phase,input,maxTokens);
  const bounds=reserveCost([{role:'system',content:JSON.stringify(body)}],maxTokens,model.ratesPerMillion);let entry;
  try{entry=reserveDispatch(report.ledger,{...context,phase,correction:input.formatFeedback?.correction??0,bounds,reservedUSD:bounds.usd,dispatchedAt:new Date().toISOString()});}
  catch(error){report.ledger.halted=true;report.ledger.reason=error.message;await save();throw error;}
  const audit={messages,body,format};entry.audit=`calls/${entry.number}.json`;await Bun.write(dir+'/'+entry.audit,JSON.stringify(audit));await save();
  try{
   const response=await fetch(endpoint(base,model.api),{method:'POST',signal:AbortSignal.timeout(600000),headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json',...(model.api==='anthropic'?{'anthropic-version':'2023-06-01'}:{})},body:JSON.stringify(body)});
   entry.httpStatus=response.status;const raw=await response.text();try{audit.response=JSON.parse(raw);}catch{audit.response={raw:raw.slice(0,10000)};}
   await Bun.write(dir+'/'+entry.audit,JSON.stringify(audit));
   if(!response.ok)throw new Error(`Provider HTTP ${response.status}: ${JSON.stringify(audit.response).slice(0,600)}`);
   const normalized=normalizeResponse(model.api,audit.response),estimated=tokenCost(normalized.usage,model.ratesPerMillion),reported=audit.response.usage?.cost;
   entry.costUSD=typeof reported==='number'&&Number.isFinite(reported)&&reported>=0?Math.max(reported,estimated):estimated;
   entry.usage=normalized.usage;entry.returnedModel=normalized.model;entry.status='completed';entry.completedAt=new Date().toISOString();
   if(entry.costUSD>bounds.usd+1e-9||normalized.usage.prompt_tokens>bounds.inputTokenUpperBound||normalized.usage.completion_tokens>maxTokens){report.ledger.halted=true;throw new Error('Provider usage exceeded reservation contract.');}
   // Rolling aliases may return resolved snapshot IDs; preserve both rather than silently relabeling.
   if(!(normalized.model===model.id||normalized.model?.startsWith(model.id+'-')||model.id==='chat-latest')){report.ledger.halted=true;throw new Error('Unexpected returned model identity.');}
   await save();return {...normalized,cost:entry.costUSD,ledgerEntry:entry.number};
  }catch(error){
   if(entry.status==='pending')entry.status='failed-reserved';
   entry.error=error.message;report.unavailable[model.id]={reason:error.message,call:entry.number,conservativeHeldUSD:entry.costUSD??entry.reservedUSD};
   // Retain full unknown charges under the cap, disable this model, never automatically retry.
   await save();throw error;
  }
 };
}
await save();
outer:for(let index=0;index<5;index++){
 const models=index%2?[...protocol.models].reverse():protocol.models,modes=index%2?[...protocol.modes].reverse():protocol.modes;
 const jobs=protocol.seeds.flatMap(seed=>models.flatMap(m=>modes.map(mode=>report.experiments.find(e=>e.model===m.id&&e.config.seed===seed&&e.config.ablation===mode))));
 for(let start=0;start<jobs.length;start+=protocol.concurrency){
  if(report.ledger.halted)break outer;
  await Promise.all(jobs.slice(start,start+protocol.concurrency).filter(e=>!report.unavailable[e.model]&&e.attempts.length===index).map(async e=>{
   const a=await attemptExperiment(e,caller(e,index));e.summary=experimentSummary(e);
   const path=`episodes/${e.model}-${e.config.seed}-${e.config.ablation}-${a.number}.json`;await Bun.write(dir+'/'+path,JSON.stringify(a));
   // Keep large immutable physics traces in per-episode files; compact ledger remains atomic.
   const {trace,actions,...compact}=a;e.attempts[e.attempts.length-1]={...compact,evidence:path};await save();
   console.log(`${e.model} ${e.config.ablation} ${e.config.seed} #${index+1}: ${a.evaluation?.score??'N/A'} ${a.evaluation?.passed?'PASS':a.outcome}`);
  }));
 }
}
report.completed=report.experiments.every(e=>e.attempts.length===5);report.finishedAt=new Date().toISOString();await save();
console.log(JSON.stringify({completed:report.completed,calls:report.ledger.entries.length,unavailable:report.unavailable,halted:report.ledger.halted,costUpperUSD:report.ledger.entries.reduce((s,e)=>s+(e.costUSD??e.reservedUSD),0)}));
