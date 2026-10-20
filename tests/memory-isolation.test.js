import {test,expect} from 'bun:test';
import {createExperiment,attemptExperiment} from '../src/experiments.js';
import {INITIAL_PLAN,assertPlanningIsolation,planContext,environmentFor} from '../src/plans.js';
import {taskSpec} from '../src/benchmark.js';
test('no-notes sends identical fresh planning payload despite poisoned stored history and notes',async()=>{
 const e=createExperiment({ablation:'no-notes',attempts:2,initialNotes:'POISON_INITIAL',initialPast:[{trace:'POISON_HISTORY'}]});
 const inputs=[],reflections=[];
 const call=async(phase,input)=>{
  if(phase==='plan'){inputs.push(structuredClone(input));return {text:JSON.stringify({parameters:INITIAL_PLAN}),cost:0,model:'mock'};}
  reflections.push(input);return {text:JSON.stringify({notes:'POISON_REFLECTION'}),cost:0,model:'mock'};
 };
 await attemptExperiment(e,call);
 e.notes='POISON_STATE';e.attempts[0].writtenNotes='POISON_PREVIOUS';e.attempts[0].feedback.extra='POISON_FEEDBACK';
 await attemptExperiment(e,call);
 for(let i=0;i<2;i++){
  expect(inputs[i]).toEqual(planContext({task:taskSpec(),milk:environmentFor(42,i),ablation:'no-notes'}));
  expect(JSON.stringify(inputs[i])).not.toContain('POISON');
  expect(reflections[i].priorNotes).toBe('');
 }
});
test('runtime isolation guard rejects extra history and hidden milk fields',()=>{
 const input=planContext({task:taskSpec(),milk:environmentFor(42,0),ablation:'no-notes'});
 for(const key of ['notes','pastAttempts','history','feedback','messages'])expect(()=>assertPlanningIsolation({...input,[key]:'leak'},'no-notes')).toThrow();
 expect(()=>assertPlanningIsolation({...input,milk:{...input.milk,flow:1}},'no-notes')).toThrow();
});
