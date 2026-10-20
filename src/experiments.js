import {runPlan,validatePlan,planContext,compactFeedback,environmentFor,PLAN_VERSION,SPACE_HASH} from './plans.js';
import {taskSpec,BENCH_VERSION} from './benchmark.js';

export function experimentConfig(input={}){
  const c={taskId:input.taskId??'heart',targetSeed:input.targetSeed??42,seed:input.seed??42,attempts:input.attempts??5,
    ablation:input.ablation??'notes',randomized:input.randomized!==false,split:input.split??'practice',lane:input.lane??'mubit',
    evaluationKind:input.evaluationKind??'training',initialNotes:input.initialNotes??'',initialPast:input.initialPast??[],source:input.source??null};
  taskSpec(c.taskId,c.targetSeed);
  if(!Number.isInteger(c.seed)||c.seed<0||c.seed>0xffffffff)throw new Error('Invalid milk seed.');
  if(!Number.isInteger(c.attempts)||c.attempts<1||c.attempts>100)throw new Error('Attempt budget must be 1–100.');
  if(!['no-notes','raw-history','notes'].includes(c.ablation)||!['practice','holdout'].includes(c.split)||!['mubit','frontier'].includes(c.lane))throw new Error('Invalid controller settings.');
  if(!['training','heldout-milk','heldout-shape'].includes(c.evaluationKind))throw new Error('Invalid evaluation kind.');
  if(c.evaluationKind==='heldout-milk'&&c.split!=='holdout')throw new Error('Milk evaluation requires the holdout milk split.');
  if(c.evaluationKind==='heldout-shape'&&c.split!=='practice')throw new Error('Shape evaluation uses practice milk; do not mix the two holdouts.');
  if(typeof c.initialNotes!=='string'||c.initialNotes.length>4000)throw new Error('Initial notes must be at most 4000 characters.');
  if(!Array.isArray(c.initialPast)||c.initialPast.length>100)throw new Error('Invalid frozen source history.');
  return c;
}
export function createExperiment(input={}){
  const config=experimentConfig(input);
  return {id:crypto.randomUUID(),schema:BENCH_VERSION,planVersion:PLAN_VERSION,spaceHash:SPACE_HASH,config,
    notes:config.ablation==='notes'?config.initialNotes:'',attempts:[],createdAt:new Date().toISOString()};
}
const sumCost=records=>records.every(r=>typeof r.cost==='number')?records.reduce((n,r)=>n+r.cost,0):null;
export async function attemptExperiment(experiment,callModel){
  const {config:c}=experiment,index=experiment.attempts.length;
  if(index>=c.attempts)throw new Error('Attempt budget exhausted.');
  const task=taskSpec(c.taskId,c.targetSeed),milk=environmentFor(c.seed,index,c.split,c.randomized);
  const frozen=c.evaluationKind!=='training';
  const input=planContext({task,milk,ablation:c.ablation,notes:frozen?c.initialNotes:experiment.notes,past:frozen?c.initialPast:experiment.attempts});
  const started=performance.now(),calls=[];
  let result,planResponse;
  try{
    planResponse=await callModel('plan',input);
    calls.push({...planResponse,phase:'plan',text:undefined});
    let plan;
    try{plan=validatePlan(JSON.parse(planResponse.text.replace(/^```(?:json)?\s*|\s*```$/g,'').trim()));}
    catch(error){result={outcome:'Rejected',error:error.message,rawPlan:planResponse.text};}
    if(plan)result=runPlan({plan,task,conditions:milk});
  }catch(error){
    calls.push({phase:'plan',cost:null,error:error.message});
    result={outcome:'Error',error:error.message};
  }
  result={...result,number:index+1,task,environment:milk,benchmark:BENCH_VERSION,planVersion:PLAN_VERSION,spaceHash:SPACE_HASH,
    schedule:{seed:c.seed,index,split:c.split,randomized:c.randomized},notesBefore:input.notes??'',ablation:c.ablation,evaluationKind:c.evaluationKind,startedAt:new Date().toISOString()};
  result.feedback=result.evaluation?compactFeedback(result):{rejected:true,error:result.error};
  // Every ablation has the same two-call opportunity. Notes are discarded in the
  // no-notes/raw-history controls. Evaluation never updates the frozen memory.
  try{
    const reflection=await callModel('notes',{target:input.target,milk:input.milk,priorNotes:input.notes??'',plan:result.plan,feedback:result.feedback});
    calls.push({...reflection,phase:'notes',text:undefined});
    const parsed=JSON.parse(reflection.text.replace(/^```(?:json)?\s*|\s*```$/g,'').trim());
    if(typeof parsed.notes!=='string'||parsed.notes.length>4000)throw new Error('Notes must be a string of at most 4000 characters.');
    result.writtenNotes=parsed.notes;
    if(c.ablation==='notes'&&!frozen)experiment.notes=parsed.notes;
  }catch(error){
    result.notesError=error.message;
    if(calls.at(-1)?.phase!=='notes')calls.push({phase:'notes',cost:null,error:error.message});
  }
  result.notesAfter=experiment.notes;result.calls=calls;result.costUSD=sumCost(calls);result.wallSeconds=(performance.now()-started)/1000;
  experiment.attempts.push(result);
  return result;
}
export function experimentSummary(experiment){
  let cumulative=0,known=true;
  const curve=experiment.attempts.map(a=>{
    if(a.costUSD==null)known=false;else cumulative+=a.costUSD;
    return {attempt:a.number,score:a.evaluation?.score??0,passed:a.evaluation?.passed??false,outcome:a.outcome,costUSD:a.costUSD,
      cumulativeCostUSD:known?cumulative:null,milkSeed:a.environment.seed??null};
  });
  const first=curve.find(a=>a.passed);
  return {curve,attemptsUsed:curve.length,firstPassAttempt:first?.attempt??null,costToFirstPassUSD:first?.cumulativeCostUSD??null,
    totalCostUSD:known?cumulative:null,passRate:curve.length?curve.filter(a=>a.passed).length/curve.length:0,
    costNote:known?'Reported API cost; local compute not priced.':'Provider omitted cost for at least one call; totals are unknown.'};
}
