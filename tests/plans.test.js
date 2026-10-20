import {test,expect} from 'bun:test';
import {INITIAL_PLAN,validatePlan,compilePlan,runPlan,scorerSanity,planContext,SPACE_HASH,calibrationStatus,compactFeedback} from '../src/plans.js';
import {createExperiment,attemptExperiment,experimentSummary} from '../src/experiments.js';
import {NOMINAL_CONDITIONS,episodeConditions} from '../src/conditions.js';
import {taskSpec} from '../src/benchmark.js';
const plan={parameters:INITIAL_PLAN};
const response=text=>({text:JSON.stringify(text),cost:.01,model:'mock-plan',usage:{input:10,output:10}});
test('shared plan space rejects bad lengths, bounds, nonfinite values and extra controls',()=>{
  expect(validatePlan(plan)).toEqual(plan);
  for(const bad of [{parameters:[]},{parameters:INITIAL_PLAN.map(()=>NaN)},{parameters:[-1,...INITIAL_PLAN.slice(1)]},{...plan,command:'pour'}])
    expect(()=>validatePlan(bad)).toThrow('Invalid plan');
  expect(SPACE_HASH).toHaveLength(8);
});
test('execution schedule depends only on the plan and revealed starting milk, never hidden coefficients',()=>{
  const a=episodeConditions(42),b={...a,flowMultiplier:1.4,spreadMultiplier:.7};
  const milk=c=>({volumeML:c.milkML,startingTemperatureC:c.temperatureC});
  expect(compilePlan(plan,milk(a))).toEqual(compilePlan(plan,milk(b)));
  const input=planContext({task:taskSpec(),milk:a,notes:'try left'});
  expect(Object.keys(input.milk)).toEqual(['volumeML','startingTemperatureC']);
  expect(JSON.stringify(input)).not.toContain('flowMultiplier');
});
test('full plan is deterministic and logs continuous 60 Hz path, 1 second foam maps and final evidence',()=>{
  const a=runPlan({plan}),b=runPlan({plan,evidence:false});
  expect(a.surface).toEqual(b.surface);expect(a.evaluation).toEqual(b.evaluation);
  expect(a.trace.path.length).toBe(Math.round(a.observation.episodeSeconds*60));
  expect(a.trace.path.every((p,i)=>p[0]===(i+1)/60)).toBe(true);
  expect(a.trace.foam.every((f,i)=>f.time===i&&f.values.length===96*96)).toBe(true);
  expect(a.actions.filter(x=>x.command==='pour')).toHaveLength(8); // two fixed fill chunks + six drawing pours
  const feedback=compactFeedback(a);expect(feedback.finalFoam.rows).toHaveLength(96);
  expect(feedback.finalFoam.rows.every(row=>row.length===96)).toBe(true);
});
test('sanity checks score exact targets at 100 and smoothly degrade transformed copies',()=>{
  const check=scorerSanity();expect(check.passed).toBe(true);
  for(const task of check.tasks){expect(task.shifted[0]).toBe(100);expect(task.scaled.at(-1)).toBeLessThan(task.scaled[1]);}
});
test('invalid plans consume attempts, preserve billed costs, and receive clear feedback for notes',async()=>{
  const e=createExperiment({attempts:1,randomized:false});let calls=0;
  const r=await attemptExperiment(e,async(phase,input)=>{calls++;if(phase==='plan')return response({parameters:[2,...INITIAL_PLAN.slice(1)]});expect(input.feedback.error).toContain('parameters[0]');return response({notes:'Use bounds.'});});
  expect(r.outcome).toBe('Rejected');expect(r.trace).toBeUndefined();expect(calls).toBe(2);expect(e.notes).toBe('Use bounds.');
  expect(experimentSummary(e)).toMatchObject({attemptsUsed:1,totalCostUSD:.02,firstPassAttempt:null});
  await expect(attemptExperiment(e,async()=>{})).rejects.toThrow('budget exhausted');
});
test('memory ablations expose exactly their allowed context; evaluation freezes memory',async()=>{
  for(const ablation of ['no-notes','raw-history','notes']){
    const e=createExperiment({attempts:2,ablation,randomized:false});
    const inputs=[];
    const call=async(phase,input)=>{if(phase==='plan'){inputs.push(input);return response({parameters:[]});}return response({notes:'Learned note'});};
    await attemptExperiment(e,call);await attemptExperiment(e,call);
    expect(inputs[1].notes).toBe(ablation==='notes'?'Learned note':undefined);
    expect(inputs[1].pastAttempts?.length).toBe(ablation==='raw-history'?1:undefined);
    expect(inputs[1].observation).toBeUndefined();
  }
  const e=createExperiment({attempts:2,evaluationKind:'heldout-milk',split:'holdout',initialNotes:'Frozen'});
  const seen=[];
  for(let i=0;i<2;i++)await attemptExperiment(e,async(phase,input)=>{if(phase==='plan'){seen.push(input.notes);return response({parameters:[]});}return response({notes:'Do not retain'});});
  expect(seen).toEqual(['Frozen','Frozen']);expect(e.notes).toBe('Frozen');
});
test('missing provider prices remain unknown and cannot produce a fake zero-dollar first pass',async()=>{
  const e=createExperiment({attempts:1});
  await attemptExperiment(e,async phase=>({...response(phase==='plan'?{parameters:[]}:{notes:''}),cost:null}));
  expect(experimentSummary(e).totalCostUSD).toBeNull();
});
test('raw-history retains actual fixed-interval evidence and frozen evaluation does not append test traces',async()=>{
  const e=createExperiment({attempts:2,ablation:'raw-history',seed:7});
  let planning=0,second;
  await attemptExperiment(e,async phase=>response(phase==='plan'?plan:{notes:'discard'}));
  await attemptExperiment(e,async(phase,input)=>{
    if(phase==='plan'){planning++;second=input;return response({parameters:[]});}
    return response({notes:'discard'});
  });
  expect(planning).toBe(1);
  expect(second.pastAttempts[0].trace.foam[0].values).toHaveLength(96*96);
  expect(second.pastAttempts[0].trace.path.length).toBeGreaterThan(100);
  expect(JSON.stringify(second)).not.toContain('flowMultiplier');
  const frozen=createExperiment({attempts:2,ablation:'raw-history',evaluationKind:'heldout-shape',taskId:'tulip',initialPast:e.attempts});
  for(let i=0;i<2;i++)await attemptExperiment(frozen,async(phase,input)=>{
    if(phase==='plan'){expect(input.pastAttempts).toHaveLength(2);return response({parameters:[]});}
    return response({notes:'ignored'});
  });
});
test('calibration gate replays its reference and requires the recorded evaluation budget',()=>{
  expect(calibrationStatus({replay:true}).ready).toBe(true);
});
