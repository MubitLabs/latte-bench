import {mkdir,rename} from 'node:fs/promises';
import {createExperiment,attemptExperiment,experimentSummary} from '../src/experiments.js';
import {calibrationStatus,PLAN_RESPONSE_FORMAT,NOTES_RESPONSE_FORMAT,planContext,environmentFor,assertPlanningIsolation} from '../src/plans.js';
import {taskSpec} from '../src/benchmark.js';
import {completionURL} from '../src/engine.js';
import {reserveCost,tokenCost} from '../src/pilot-budget.js';
import {reserveDispatch} from '../src/concurrent-budget.js';
import {frozenIdentity} from './frozen3-guard.js';
import protocol from '../experiments/heart-frozen-v3.json';
const dir='results/heart-frozen-v3',file=dir+'/agents.json';
if(!Bun.argv.includes('--live')||!Bun.argv.includes('--billing=standard'))throw new Error('Requires --live --billing=standard. No request sent.');
if(await Bun.file(file).exists())throw new Error('Existing ledger: refusing automatic paid rerun or retry.');
const identity=await frozenIdentity(),gate=calibrationStatus({taskId:'heart',replay:true});if(!gate.ready)throw new Error(gate.reason);
const base=process.env.MUBIT_BASE_URL,key=process.env.MUBIT_API_KEY;if(!base||!key)throw new Error('Missing gateway configuration.');
const report={schema:protocol.schema,protocol,identity,createdAt:new Date().toISOString(),ledger:{capUSD:protocol.capUSD,halted:false,entries:[]},experiments:[]};
for(const model of protocol.models)for(const seed of protocol.seeds)for(const ablation of protocol.modes){
 const e=createExperiment({taskId:'heart',targetSeed:42,seed,attempts:10,ablation,randomized:true,formatRepairs:2});e.model=model.id;report.experiments.push(e);
}
await mkdir(dir,{recursive:true});let saving=Promise.resolve();
function save(){
 const snapshot=JSON.stringify(report);
 const next=saving.then(async()=>{await Bun.write(file+'.tmp',snapshot);await rename(file+'.tmp',file);});saving=next;return next;
}
const prompts={
 plan:'Plan then execute. Return ONLY {"parameters":[33 finite numbers in [0,1]]}. Use the supplied parameter schema exactly. The entire plan executes with no observations or actions during execution. You see the target, starting milk volume/temperature, and any supplied notes. Malformed or out-of-bounds plans receive up to two corrections before rejection; they give no simulation feedback and do not consume extra attempts. Physical values must be normalized as (value-min)/(max-min); use the per-index guide. Satisfy IoU, foam precision, one-cell boundary F1, penalized quality and all serving thresholds. Quality is max(0,min(IoU,boundaryF1)-0.25*mean raw foam density in the concavityFoam mask). There is no binary concavity veto. High pours mix into coffee; low pours leave surface foam. Tilt <=25 stops flow; higher tilt increases flow. Preparation, nominal high fill, settling and serving are automatic. Choose all six continuous segments before the pour. Cup capacity is 240 ml; preparation yields 36 ml espresso. Normalized x=0.5 and z=0.5 mean centre; normalized height=0 means 10 mm for drawing segments; normalized tilt=1 means 85 degrees, maximal flow. No extra controls, tools, or explanatory text.',
 notes:'Review the completed attempt. Return ONLY {"notes":"..."}, at most 1600 characters, focusing on actionable numbers. Write concise reusable notes: useful parameter values, observed outcomes, uncertainty and a concrete next experiment. Infer hidden milk behavior only from feedback. Replace your prior notes with this complete note. Do not claim access to latent coefficients.'
};
function modelCaller(experiment,index){
 const model=protocol.models.find(m=>m.id===experiment.model),context={model:experiment.model,seed:experiment.config.seed,mode:experiment.config.ablation,attempt:index+1};
 return async(phase,input)=>{
  if(phase==='plan'){
   assertPlanningIsolation(input,context.mode);
   if(context.mode==='no-notes'){
    const {formatFeedback,...submitted}=input;
    const fresh=planContext({task:taskSpec('heart',42),milk:environmentFor(context.seed,index),ablation:'no-notes'});
    if(JSON.stringify(submitted)!==JSON.stringify(fresh))throw new Error('No-notes request differs from a fresh episode.');
   }
  }else if(context.mode==='no-notes'&&input.priorNotes!=='')throw new Error('No-notes reflection received prior notes.');
  const messages=[{role:'system',content:prompts[phase]},{role:'user',content:JSON.stringify(input)}];
  const responseFormat=phase==='plan'?PLAN_RESPONSE_FORMAT:NOTES_RESPONSE_FORMAT,maxTokens=protocol.maxTokens[phase];
  const bounds=reserveCost([...messages,{role:'system',content:JSON.stringify(responseFormat)}],maxTokens,model.ratesPerMillion);
  let entry;
  try{entry=reserveDispatch(report.ledger,{...context,phase,correction:input.formatFeedback?.correction??0,messages,responseFormat,bounds,reservedUSD:bounds.usd,dispatchedAt:new Date().toISOString()});}
  catch(error){report.ledger.halted=true;report.ledger.reason=error.message;await save();throw error;}
  await save();
  try{
   const response=await fetch(completionURL(base),{method:'POST',signal:AbortSignal.timeout(180000),headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:model.id,service_tier:'default',store:false,reasoning_effort:protocol.reasoningEffort[phase],max_completion_tokens:maxTokens,response_format:responseFormat,messages})});
   entry.httpStatus=response.status;if(!response.ok)throw new Error(`Provider HTTP ${response.status}; no automatic paid retry.`);
   const r=await response.json();entry.response=r;
   const estimated=tokenCost(r.usage,model.ratesPerMillion),reported=r.usage?.cost;
   const cost=typeof reported==='number'&&Number.isFinite(reported)&&reported>=0?Math.max(reported,estimated):estimated;
   entry.costUSD=cost;entry.costBasis='Conservative standard usage bound: all input at cache-write rate, output including reasoning; max with provider dollars if present.';entry.status='completed';entry.returnedModel=r.model;entry.completedAt=new Date().toISOString();
   if(r.usage.prompt_tokens>bounds.inputTokenUpperBound||r.usage.completion_tokens>maxTokens||cost>bounds.usd+1e-10||!(r.model===model.id||r.model?.startsWith(model.id+'-')))throw new Error('Provider exceeded reserved model/usage contract.');
   const text=r.choices?.[0]?.message?.content;if(typeof text!=='string')throw new Error('Provider returned no text.');
   await save();return {text,model:r.model,cost,usage:{input:r.usage.prompt_tokens,output:r.usage.completion_tokens},ledgerEntry:entry.number};
  }catch(error){if(entry.status==='pending')entry.status='unresolved';entry.error=error.message;report.ledger.halted=true;report.ledger.reason=error.message;await save();throw error;}
 };
}
await save();
outer:for(let index=0;index<10;index++){
 const models=index%2?[...protocol.models].reverse():protocol.models,modes=index%2?[...protocol.modes].reverse():protocol.modes;
 const jobs=protocol.seeds.flatMap(seed=>models.flatMap(m=>modes.map(mode=>report.experiments.find(e=>e.model===m.id&&e.config.seed===seed&&e.config.ablation===mode))));
 for(let start=0;start<jobs.length;start+=protocol.concurrency){
  if(report.ledger.halted)break outer;
  await Promise.all(jobs.slice(start,start+protocol.concurrency).map(async e=>{
   const a=await attemptExperiment(e,modelCaller(e,index));e.summary=experimentSummary(e);await save();
   console.log(`${e.model} ${e.config.ablation} seed ${e.config.seed} #${index+1}: ${a.evaluation?.score??0}% ${a.evaluation?.passed?'PASS':a.outcome} $${a.costUSD?.toFixed(5)??'unknown'}`);
  }));
 }
}
report.completed=report.experiments.every(e=>e.attempts.length===10);report.finishedAt=new Date().toISOString();await save();
console.log(JSON.stringify({completed:report.completed,calls:report.ledger.entries.length,halted:report.ledger.halted,costUpperUSD:report.ledger.entries.reduce((s,e)=>s+(e.costUSD??e.reservedUSD),0)}));
