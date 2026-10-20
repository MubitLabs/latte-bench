import {mkdir,rename} from 'node:fs/promises';
import {createExperiment,attemptExperiment,experimentSummary} from '../src/experiments.js';
import {calibrationStatus,PLAN_RESPONSE_FORMAT,NOTES_RESPONSE_FORMAT} from '../src/plans.js';
import {completionURL} from '../src/engine.js';
import {reserveCost,budgetAvailable,tokenCost} from '../src/pilot-budget.js';
const dir='results/heart-pilot-v2',file=dir+'/agents.json';
const billing=Bun.argv.find(a=>a.startsWith('--billing='))?.split('=')[1];
if(!['standard','free'].includes(billing))throw new Error('Billing must first be confirmed: --billing=standard or --billing=free. No request sent.');
if(!Bun.argv.includes('--live'))throw new Error('Requires --live. No request sent.');
if(await Bun.file(file).exists())throw new Error('Existing pilot ledger: refusing a fresh run or automatic paid retry.');
const model='gpt-6-astra',base=process.env.MUBIT_BASE_URL,key=process.env.MUBIT_API_KEY;
if(!base||!key)throw new Error('Expected configured gateway and credentials.');
const gate=calibrationStatus({taskId:'heart',replay:true});if(!gate.ready)throw new Error(gate.reason);
const rates=billing==='free'?{input:0,output:0}:{input:12.5,output:50};
const report={schema:'heart-pilot/2',protocol:{model,base,billing,ratesPerMillion:rates,rateSource:'https://developers.openai.com/api/docs/models/gpt-6-astra',
 seeds:[42,43,44],attemptsPerSeed:10,modes:['no-notes','notes'],target:'heart',targetSeed:42,randomized:true,reasoningEffort:{plan:'medium',notes:'low'},billingBound:'All input reserved at $12.50/M (including possible cache-write surcharge), output including reasoning at $50/M; standard tier.',
 maxTokens:{plan:4096,notes:2048},callsPerAttempt:'2 base calls plus up to 2 format-correction calls',notesControl:'Both modes write notes; no-notes discards them. Only notes mode carries its own previous note. No shared memory or reference plans are supplied.',
 ordering:'round-robin attempts, seeds, alternating mode order each attempt',providerIsolation:'Fresh messages per request; gateway-side routing/memory behavior not independently verified.'},
 ledger:{capUSD:20,entries:[],halted:false},experiments:[]};
for(const seed of report.protocol.seeds)for(const ablation of report.protocol.modes)report.experiments.push(createExperiment({taskId:'heart',targetSeed:42,seed,attempts:10,ablation,randomized:true}));
await mkdir(dir,{recursive:true});
async function save(){for(const e of report.experiments)e.summary=experimentSummary(e);await Bun.write(file+'.tmp',JSON.stringify(report));await rename(file+'.tmp',file);}
const prompts={
 plan:'Plan then execute. Return ONLY {"parameters":[33 finite numbers in [0,1]]}. Use the supplied parameter schema exactly. The entire plan executes with no observations or actions during execution. You see the target, starting milk volume/temperature, and any supplied notes. Malformed or out-of-bounds plans receive up to two corrections before rejection; they give no simulation feedback and do not consume extra attempts. Physical values must be normalized as (value-min)/(max-min); use the per-index guide. Satisfy IoU, foam precision, one-cell boundary F1, hull-minus-target empty fraction and all serving thresholds. Displayed quality is 100 times min(IoU,boundary F1,concavity empty fraction). High pours mix into coffee; low pours leave surface foam. Tilt <=25 stops flow; higher tilt increases flow. Preparation, nominal high fill, settling and serving are automatic. Choose all six continuous segments before the pour. The target includes the concavityFoam mask: cells marked 1 must remain mostly empty. The cup capacity is 240 ml and preparation yields 36 ml espresso. Normalized x=0.5 and z=0.5 mean centre; normalized height=0 means 10 mm for drawing segments; normalized tilt=1 means 85 degrees, maximal flow. No extra controls, tools, or explanatory text.',
 notes:'Review the completed attempt. Return ONLY {"notes":"..."}, at most 1600 characters, focusing on actionable numbers. Write concise reusable notes: useful parameter values, observed outcomes, uncertainty and a concrete next experiment. Infer hidden milk behavior only from feedback. Replace your prior notes with this complete note. Do not claim access to latent coefficients.'
};
let context;
async function callModel(phase,input){
 const messages=[{role:'system',content:prompts[phase]},{role:'user',content:JSON.stringify(input)}],maxTokens=report.protocol.maxTokens[phase];
 const responseFormat=phase==='plan'?PLAN_RESPONSE_FORMAT:NOTES_RESPONSE_FORMAT;
 const bound=reserveCost([...messages,{role:'system',content:JSON.stringify(responseFormat)}],maxTokens,rates);
 if(!budgetAvailable(report.ledger,bound.usd)){report.ledger.halted=true;report.ledger.reason='Spend cap reached or unresolved prior charge; no further dispatch.';await save();throw new Error(report.ledger.reason);}
 const entry={number:report.ledger.entries.length+1,...context,phase,correction:input.formatFeedback?.correction??0,responseFormat,reservedUSD:bound.usd,bounds:bound,status:'pending',dispatchedAt:new Date().toISOString(),messages};
 report.ledger.entries.push(entry);await save();
 try{
  const response=await fetch(completionURL(base),{method:'POST',signal:AbortSignal.timeout(180000),headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model,service_tier:'default',reasoning_effort:report.protocol.reasoningEffort[phase],max_completion_tokens:maxTokens,response_format:responseFormat,messages})});
  entry.httpStatus=response.status;
  if(!response.ok)throw new Error(`Provider HTTP ${response.status}; no automatic retry.`);
  const r=await response.json();entry.response=r;
  const estimated=tokenCost(r.usage,rates),reported=r.usage?.cost;
  const cost=typeof reported==='number'&&Number.isFinite(reported)&&reported>=0?reported:estimated;
  entry.costUSD=cost;entry.costBasis=typeof reported==='number'?'provider-reported':'standard price upper bound × token usage (all input at cache-write rate)';entry.status='completed';entry.model=r.model;
  const usedInput=r.usage.prompt_tokens,usedOutput=r.usage.completion_tokens;
  if(usedInput>bound.inputTokenUpperBound||usedOutput>maxTokens||cost>bound.usd+1e-10||!(r.model===model||r.model?.startsWith(model+'-'))){report.ledger.halted=true;report.ledger.reason='Provider model, usage or cost exceeded the reserved contract; stopped.';}
  await save();
  const text=r.choices?.[0]?.message?.content;if(typeof text!=='string')throw new Error('Provider returned no text.');
  return {text,model:r.model||model,cost,usage:{input:usedInput,output:usedOutput},ledgerEntry:entry.number};
 }catch(error){
  if(entry.status==='pending')entry.status='unresolved';
  entry.error=error.message;report.ledger.halted=true;report.ledger.reason=error.message;await save();throw error;
 }
}
await save();
outer:for(let index=0;index<10;index++)for(const seed of report.protocol.seeds){
 const modes=index%2?[...report.protocol.modes].reverse():report.protocol.modes;
 for(const mode of modes){
  if(report.ledger.halted)break outer;
  const experiment=report.experiments.find(e=>e.config.seed===seed&&e.config.ablation===mode);
  context={seed,attempt:index+1,mode};
  const a=await attemptExperiment(experiment,callModel);await save();
  const spent=report.ledger.entries.reduce((n,e)=>n+(e.costUSD??e.reservedUSD),0);
  console.log(`${mode} seed ${seed} attempt ${index+1}/10: ${a.evaluation?.score??0}% ${a.evaluation?.passed?'PASS':a.outcome}, attempt $${a.costUSD?.toFixed(5)??'unknown'}, total committed $${spent.toFixed(5)}`);
 }
}
report.completed=report.experiments.every(e=>e.attempts.length===10);report.finishedAt=new Date().toISOString();await save();
console.log(JSON.stringify({completed:report.completed,halted:report.ledger.halted,reason:report.ledger.reason,calls:report.ledger.entries.length}));
