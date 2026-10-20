import {CoffeeSimulation} from './simulation.js';
import {NOMINAL_CONDITIONS,episodeConditions} from './conditions.js';
import {taskSpec,taskForAgent,evaluateCup,BENCH_VERSION,EVALUATOR_VERSION,fingerprint,targetMask} from './benchmark.js';
import {GRID_SIZE,SURFACE_VERSION} from './grid.js';
import calibration from '../tasks/calibration.json';

export const PLAN_VERSION='pour-plan/2';
export const PLAN_SPACE=Object.freeze({
  version:PLAN_VERSION,count:33,encoding:'33 normalized numbers, each in [0,1]; no clipping or repair',
  parameters:[
    {index:0,name:'fillVolumeML',min:100,max:200},
    {index:1,name:'fillHeightMM',min:100,max:220},
    {index:2,name:'fillTiltDegrees',min:45,max:85},
    ...Array.from({length:6},(_,i)=>[
      {index:3+i*5,name:`segment${i+1}.x`,min:-.8,max:.8},
      {index:4+i*5,name:`segment${i+1}.z`,min:-.8,max:.8},
      {index:5+i*5,name:`segment${i+1}.heightMM`,min:10,max:180},
      {index:6+i*5,name:`segment${i+1}.tiltDegrees`,min:0,max:85},
      {index:7+i*5,name:`segment${i+1}.durationSeconds`,min:.1,max:5},
    ]).flat()
  ],
  execution:'Fixed preparation and nominal high fill, followed by six continuous linear segments. Each endpoint sets position, height and tilt; each segment sets its duration. Controls interpolate from the previous endpoint at 60 Hz, starting at the high-fill position with tilt zero. Repeated endpoints hold steady; tilt <=25 stops flow. Final 0.5s settling pause, then serve. No sensor feedback or controller calls during execution.',
});
export const SPACE_HASH=fingerprint(PLAN_SPACE);
// Prompt documentation is separate from the physical-space fingerprint: bounds
// and executor are identical to the optimizer's existing 33 coordinates.
export const PLAN_PARAMETER_GUIDE=PLAN_SPACE.parameters.map(p=>{
 const key=p.name.split('.').at(-1);
 const details={
  fillVolumeML:['ml','Nominal total cup volume after high fill, including 36 ml espresso; determines open-loop fill duration, not the final volume. Drawing adds more milk.'],
  fillHeightMM:['mm','Spout height for the initial centre fill. High pours primarily sink/mix milk rather than paint surface foam.'],
  fillTiltDegrees:['degrees','Pitcher tilt during high fill; higher tilt increases flow.'],
  x:['cup radii','Segment endpoint horizontal position: negative left, zero centre, positive right.'],
  z:['cup radii','Segment endpoint depth position: negative back (top of map), positive front (bottom).'],
  heightMM:['mm','Requested endpoint spout height. Low 10–30 mm pours deposit surface foam; high pours mix. Cup rim limits effective height when cup is low.'],
  tiltDegrees:['degrees','Endpoint pitcher tilt: <=25 stops flow, larger tilt increases flow to a maximum at 85. Interpolates from previous endpoint.'],
  durationSeconds:['seconds','Time moving linearly from the previous endpoint to this one, including height and tilt changes. Repeat position/height to hold; positive tilt can continue depositing.'],
 }[key];
 return {...p,unit:details[0],meaning:details[1],submittedRange:[0,1],decode:`physical = ${p.min} + p[${p.index}] * ${p.max-p.min}`};
});
export const PLAN_RESPONSE_FORMAT={type:'json_schema',json_schema:{name:'pour_plan',strict:true,schema:{type:'object',properties:{parameters:{type:'array',minItems:33,maxItems:33,items:{type:'number',minimum:0,maximum:1}}},required:['parameters'],additionalProperties:false}}};
export const NOTES_RESPONSE_FORMAT={type:'json_schema',json_schema:{name:'pour_notes',strict:true,schema:{type:'object',properties:{notes:{type:'string',maxLength:4000}},required:['notes'],additionalProperties:false}}};

export function validatePlan(plan){
  if(!plan||typeof plan!=='object'||Array.isArray(plan)||Object.keys(plan).some(k=>k!=='parameters'))throw new Error('Invalid plan: return only an object with the parameters array.');
  const p=plan.parameters;
  if(!Array.isArray(p)||p.length!==PLAN_SPACE.count)throw new Error(`Invalid plan: parameters must contain exactly ${PLAN_SPACE.count} numbers.`);
  p.forEach((v,i)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>1)throw new Error(`Invalid plan: parameters[${i}] (${PLAN_SPACE.parameters[i].name}) must be a finite number in [0,1]; received ${String(v)}.`);});
  return {parameters:[...p]};
}
// Convenience for hand-written plans; the same strict normalized validator follows.
export function encodePlan(fill,segments){
  const values=[fill.volume,fill.height,fill.tilt,...segments.flatMap(s=>[s.x,s.z,s.height,s.tilt,s.duration])];
  return validatePlan({parameters:values.map((v,i)=>{const b=PLAN_SPACE.parameters[i];return (v-b.min)/(b.max-b.min);})});
}
export const INITIAL_PLAN=encodePlan({volume:170,height:160,tilt:75},[
  {x:0,z:0,height:20,tilt:0,duration:.4},
  {x:0,z:0,height:20,tilt:70,duration:.4},
  {x:0,z:0,height:20,tilt:70,duration:2},
  {x:0,z:0,height:80,tilt:40,duration:.4},
  {x:0,z:.6,height:80,tilt:40,duration:1},
  {x:0,z:.6,height:100,tilt:0,duration:.2},
]).parameters;
export function revealedMilk(conditions){return {volumeML:conditions.milkML,startingTemperatureC:conditions.temperatureC};}
export function compilePlan(plan,milk){
  const {parameters:p}=validatePlan(plan);
  if(!Number.isFinite(milk.volumeML)||milk.volumeML<=0||!Number.isFinite(milk.startingTemperatureC))throw new Error('Invalid revealed milk conditions.');
  const v=p.map((q,i)=>{const b=PLAN_SPACE.parameters[i];return b.min+q*(b.max-b.min);});
  const actions=[];
  const add=(command,duration,controls={})=>{
    // Equal chunks avoid a sub-0.05s remainder at the legacy action boundary.
    const chunks=Math.ceil(duration/5);
    for(let i=0;i<chunks;i++)actions.push({command:i===0?command:command==='steam'?'move':command,duration:duration/chunks,...controls});
  };
  add('grind',2.1);add('extract',4.1);
  add('steam',Math.max(.05,(62-Math.max(Math.min(18,milk.startingTemperatureC),milk.startingTemperatureC-6.2*.08))/8));
  add('pickup',.1);
  const fillMilk=v[0]-36,k=Math.sin((v[2]-25)/60*Math.PI/2)*32/Math.sqrt(220);
  const fillSeconds=2*(Math.sqrt(milk.volumeML)-Math.sqrt(Math.max(0,milk.volumeML-fillMilk)))/k;
  add('pour',fillSeconds,{x:0,z:0,height:v[1],tilt:v[2]});
  let from={x:0,z:0,height:v[1],tilt:0};
  for(let i=0;i<6;i++){
    const j=3+i*5,to={x:v[j],z:v[j+1],height:v[j+2],tilt:v[j+3]};
    actions.push({command:'pour',duration:v[j+4],...to,from:{...from},interpolate:true});from=to;
  }
  add('stop',.5);add('serve',.1);
  return actions;
}
export function runPlan({plan,task=taskSpec(),conditions=NOMINAL_CONDITIONS,evidence=true,sim=new CoffeeSimulation(conditions)}){
  const validated=validatePlan(plan),actions=compilePlan(validated,revealedMilk(conditions));
  sim.reset(conditions);
  let tick=0;
  const trace={intervalSeconds:1,pathHz:60,pathColumns:['time','x','z','heightMM','tiltDegrees','flowMLPerSecond','pouring','milkInCupML'],path:[],foam:[]};
  const snapshot=()=>({time:tick/60,size:sim.surface.n,values:Array.from(sim.surface.foam)});
  if(evidence)trace.foam.push(snapshot());
  // Quantize the fixed schedule to 60 Hz so path and foam samples have exact cadence.
  for(const action of actions){
    sim.act(action.interpolate?{...action,...action.from}:action);
    const ticks=Math.round(action.duration*60);
    for(let t=0;t<ticks;t++){
      if(action.interpolate)for(const key of ['x','z','height','tilt'])sim.controls[key]=action.from[key]+(action[key]-action.from[key])*(t+1)/ticks;
      sim.step(1/60);tick++;
      if(evidence){
        const c=sim.controls;
        trace.path.push([tick/60,c.x,c.z,sim.effectiveHeight(),c.tilt,sim.flow,sim.pouring?1:0,sim.inCup]);
        if(tick%60===0)trace.foam.push(snapshot());
      }
    }
    if(action.command==='pour')sim.act({command:'stop'});
  }
  const observation={...sim.observe(),episodeSeconds:tick/60},evaluation=evaluateCup(task,observation,sim.surface.foam);
  const result={surfaceVersion:SURFACE_VERSION,benchmark:BENCH_VERSION,planVersion:PLAN_VERSION,spaceHash:SPACE_HASH,task,environment:{...conditions},
    plan:validated,actions,observation,evaluation,outcome:sim.served?'Served':'Unserved',
    objective:evaluation.shapeQuality-evaluation.failedChecks.filter(x=>x!=='shape').length,
    surfaceSize:sim.surface.n,surface:Array.from(sim.surface.foam)};
  if(evidence)result.trace=trace;
  return result;
}
export function compactFeedback(result){
  if(result.outcome==='Rejected')return {rejected:true,error:result.error};
  const o=result.observation;
  // Full final evaluator field is supplied after the attempt, not before planning.
  return {score:result.evaluation,breakdown:{volumeML:o.espressoML+o.milkInCupML,temperatureC:o.milkTemperatureC,spilledML:o.spilledML},
    traceSummary:{durationSeconds:o.episodeSeconds,pours:result.actions.filter(a=>a.command==='pour'),pathSamples:result.trace?.path.length??0,
      foamCoverageBySecond:result.trace?.foam.map(s=>({time:s.time,coverage:s.values.filter(x=>x>=.25).length/s.values.length}))??[]},
    finalFoam:{size:result.surfaceSize,encoding:'rows of density digits 0–9, rounded from the logged full-precision field',
      rows:Array.from({length:result.surfaceSize},(_,y)=>result.surface.slice(y*result.surfaceSize,(y+1)*result.surfaceSize).map(v=>Math.round(v*9)).join(''))}};
}
export function scorerSanity(){
  const good={espressoML:36,milkInCupML:180,milkTemperatureC:60,spilledML:0,scorched:false,served:true,time:30};
  const tasks=Object.keys({heart:1,tulip:1,rosetta:1}).map(id=>{
    const task=taskSpec(id),score=t=>Math.round(evaluateCup(task,good,targetMask(t)).shapeIoU*1000)/10;
    const shifted=[0,.04,.08,.12,.2].map(d=>score({...task,transform:{...task.transform,x:task.transform.x+d}}));
    const scaled=[1,.95,.9,.85,.75].map(k=>score({...task,transform:{...task.transform,scale:task.transform.scale*k}}));
    const enlarged=[1,1.05,1.1,1.15,1.25].map(k=>score({...task,transform:{...task.transform,scale:task.transform.scale*k}}));
    const gradual=values=>values[0]===100&&values.every((v,i)=>i===0||(v<=values[i-1]+.5&&values[i-1]-v<30));
    const boundarySelf=evaluateCup(task,good,targetMask(task)).boundaryF1;
    return {id,shifted,scaled,enlarged,boundarySelf,passed:boundarySelf===1&&[shifted,scaled,enlarged].every(gradual)};
  });
  return {passed:tasks.every(t=>t.passed),tasks};
}
export function calibrationStatus({replay=false,taskId='heart'}={}){
  const entry=calibration.tasks?.[taskId];
  if(calibration.schema!=='shape-calibration/2'||calibration.evaluatorVersion!==EVALUATOR_VERSION||calibration.gridSize!==GRID_SIZE||calibration.surfaceVersion!==SURFACE_VERSION||calibration.planVersion!==PLAN_VERSION||calibration.spaceHash!==SPACE_HASH)
    return {ready:false,taskId,reason:'Calibration versions do not match the current scorer and simulator.'};
  if(!entry?.ready)return {ready:false,taskId,reason:entry?.reason||'No calibrated reference for this task.'};
  if(!scorerSanity().passed)return {ready:false,taskId,reason:'Scorer sanity checks failed.'};
  if(replay){
    const result=runPlan({plan:entry.referencePlan,task:taskSpec(taskId,42),evidence:false});
    if(!result.evaluation.passed||['shapeIoU','precision','boundaryF1'].some(k=>Math.abs(result.evaluation[k]-entry.referenceMetrics[k])>1e-8))
      return {ready:false,taskId,reason:'Reference replay does not match calibration.'};
  }
  return {ready:true,taskId,requirements:entry.requirements,referenceIoU:entry.referenceMetrics.shapeIoU,referenceBoundaryF1:entry.referenceMetrics.boundaryF1};
}
export function planContext({task,milk,ablation='notes',notes='',past=[]}){
  if(!['no-notes','raw-history','notes'].includes(ablation))throw new Error('Unknown ablation.');
  return {target:{...taskForAgent(task),limits:{plansPerAttempt:1,simulationSeconds:task.limits.simulationSeconds}},milk:revealedMilk(milk),space:{...PLAN_SPACE,encoding:'Submit exactly 33 normalized numbers in [0,1]. Each physical value = min + p * (max-min); equivalently p=(physical-min)/(max-min). Never submit physical units directly. No clipping. Two model format corrections are allowed before rejecting this episode.',parameters:PLAN_PARAMETER_GUIDE},
    ...(ablation==='notes'?{notes}:{}),...(ablation==='raw-history'?{pastAttempts:past.map(a=>({plan:a.plan,error:a.error,trace:a.trace,feedback:a.feedback}))}:{})};
}
export function assertPlanningIsolation(input,ablation){
  const allowed=new Set(['target','milk','space','formatFeedback',...(ablation==='notes'?['notes']:[]),...(ablation==='raw-history'?['pastAttempts']:[])]);
  if(Object.keys(input).some(k=>!allowed.has(k)))throw new Error('Unexpected planning context: memory isolation violated.');
  if(Object.keys(input.milk).sort().join(',')!=='startingTemperatureC,volumeML')throw new Error('Unexpected milk disclosure.');
  if(ablation==='no-notes'&&(Object.hasOwn(input,'notes')||Object.hasOwn(input,'pastAttempts')))throw new Error('No-notes cannot receive past attempts.');
}
export function environmentFor(seed,index,split='practice',randomized=true){
  return randomized?episodeConditions(seed,index,split):{...NOMINAL_CONDITIONS};
}
