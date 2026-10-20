import {CoffeeSimulation} from './simulation.js';
import {NOMINAL_CONDITIONS,episodeConditions} from './conditions.js';
import {taskSpec,taskForAgent,evaluateCup,BENCH_VERSION,fingerprint,targetMask} from './benchmark.js';
import calibration from '../tasks/calibration.json';

export const PLAN_VERSION='pour-plan/1';
export const INITIAL_PLAN=[.5,.6,.2,.35,.4,.6,.65,.4,.6,.4,.55,.4,.6,.55,.4,.5,.65,.3,.5,.5,.4];
export const PLAN_SPACE=Object.freeze({
  version:PLAN_VERSION,count:21,encoding:'21 normalized numbers, each in [0,1]; no clipping or repair',
  parameters:[
    {index:0,name:'fillVolumeML',min:180,max:210},
    {index:1,name:'drawingTiltDegrees',min:45,max:85},
    {index:2,name:'drawingHeightMM',min:10,max:40},
    ...Array.from({length:6},(_,i)=>[
      {index:3+i*3,name:`pour${i+1}.x`,min:-.75,max:.75},
      {index:4+i*3,name:`pour${i+1}.z`,min:-.75,max:.75},
      {index:5+i*3,name:`pour${i+1}.durationSeconds`,min:.15,max:1.5},
    ]).flat()
  ],
  execution:'A fixed preparation and nominal fill schedule is compiled before execution from revealed starting volume/temperature. Then six stationary timed pours, a 0.3s settling pause, and serve. No sensor feedback, early stops, top-ups or controller calls during execution. Position changes are instantaneous, as in the original optimizer.',
});
export const SPACE_HASH=fingerprint(PLAN_SPACE);
export function validatePlan(plan){
  if(!plan||typeof plan!=='object'||Array.isArray(plan)||Object.keys(plan).some(k=>k!=='parameters'))throw new Error('Invalid plan: return only an object with the parameters array.');
  const p=plan?.parameters;
  if(!Array.isArray(p)||p.length!==21)throw new Error('Invalid plan: parameters must contain exactly 21 numbers.');
  p.forEach((v,i)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>1)throw new Error(`Invalid plan: parameters[${i}] (${PLAN_SPACE.parameters[i].name}) must be a finite number in [0,1]; received ${String(v)}.`);});
  return {parameters:[...p]};
}
export function revealedMilk(conditions){return {volumeML:conditions.milkML,startingTemperatureC:conditions.temperatureC};}
export function compilePlan(plan,milk){
  const {parameters:p}=validatePlan(plan);
  if(!Number.isFinite(milk.volumeML)||milk.volumeML<=0||!Number.isFinite(milk.startingTemperatureC))throw new Error('Invalid revealed milk conditions.');
  const actions=[];
  const add=(command,duration,controls={})=>{
    // Keep legacy per-action duration bounds without obtaining observations.
    let first=true;
    while(duration>1e-9){const t=Math.min(5,duration);actions.push({command:first?command:command==='steam'?'move':command,duration:t,...controls});duration-=t;first=false;}
  };
  add('grind',2.1);add('extract',4.1);
  add('steam',Math.max(.05,(62-Math.max(Math.min(18,milk.startingTemperatureC),milk.startingTemperatureC-6.2*.08))/8));
  add('pickup',.1);
  const fillMilk=180+p[0]*30-36,k=Math.sin((75-25)/60*Math.PI/2)*32/Math.sqrt(220);
  // Integral of nominal dm/dt=-k*sqrt(m); never uses hidden batch coefficients.
  const fillSeconds=2*(Math.sqrt(milk.volumeML)-Math.sqrt(Math.max(0,milk.volumeML-fillMilk)))/k;
  add('pour',fillSeconds,{x:0,z:0,height:160,tilt:75});
  for(let i=0;i<6;i++)add('pour',.15+p[5+i*3]*1.35,{x:(p[3+i*3]-.5)*1.5,z:(p[4+i*3]-.5)*1.5,height:10+p[2]*30,tilt:45+p[1]*40});
  add('stop',.3);add('serve',.1);
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
    sim.act(action);
    for(let t=0;t<Math.round(action.duration*60);t++){
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
  const result={benchmark:BENCH_VERSION,planVersion:PLAN_VERSION,spaceHash:SPACE_HASH,task,environment:{...conditions},
    plan:validated,actions,observation,evaluation,outcome:sim.served?'Served':'Unserved',
    objective:evaluation.shapeIoU-evaluation.failedChecks.filter(x=>x!=='shape').length,
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
    const task=taskSpec(id),score=t=>evaluateCup(task,good,targetMask(t)).score;
    const shifted=[0,.04,.08,.12,.2].map(d=>score({...task,transform:{...task.transform,x:task.transform.x+d}}));
    const scaled=[1,.95,.9,.85,.75].map(k=>score({...task,transform:{...task.transform,scale:task.transform.scale*k}}));
    const enlarged=[1,1.05,1.1,1.15,1.25].map(k=>score({...task,transform:{...task.transform,scale:task.transform.scale*k}}));
    const gradual=values=>values[0]===100&&values.every((v,i)=>i===0||(v<=values[i-1]+.5&&values[i-1]-v<30));
    return {id,shifted,scaled,enlarged,passed:[shifted,scaled,enlarged].every(gradual)};
  });
  return {passed:tasks.every(t=>t.passed),tasks};
}
export function calibrationStatus({replay=false}={}){
  if(!calibration.ready||!Number.isFinite(calibration.precisionThreshold)||calibration.planVersion!==PLAN_VERSION||calibration.spaceHash!==SPACE_HASH||calibration.evaluations<1000)
    return {ready:false,reason:'Calibration required: scorer sanity and 1,000+ default-milk evaluations.'};
  if(!scorerSanity().passed)return {ready:false,reason:'Scorer sanity checks failed.'};
  if(replay){
    const result=runPlan({plan:calibration.referencePlan,task:taskSpec(calibration.taskId,calibration.targetSeed),evidence:false});
    if(!result.evaluation.passed||Math.abs(result.evaluation.shapeIoU-calibration.referenceIoU)>1e-8)
      return {ready:false,reason:'Reference plan replay does not match calibration.'};
  }
  return {ready:true,threshold:calibration.threshold,referenceIoU:calibration.referenceIoU,evaluations:calibration.evaluations,taskId:calibration.taskId};
}
export function planContext({task,milk,ablation='notes',notes='',past=[]}){
  if(!['no-notes','raw-history','notes'].includes(ablation))throw new Error('Unknown ablation.');
  return {target:{...taskForAgent(task),limits:{plansPerAttempt:1,simulationSeconds:task.limits.simulationSeconds}},milk:revealedMilk(milk),space:PLAN_SPACE,
    ...(ablation==='notes'?{notes}:{}),...(ablation==='raw-history'?{pastAttempts:past.map(a=>({plan:a.plan,error:a.error,trace:a.trace,feedback:a.feedback}))}:{})};
}
export function environmentFor(seed,index,split='practice',randomized=true){
  return randomized?episodeConditions(seed,index,split):{...NOMINAL_CONDITIONS};
}
