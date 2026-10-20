import {test,expect} from 'bun:test';
import {taskSpec,targetMask,evaluateCup,comparableRuns,TASKS} from '../src/benchmark.js';
import {benchmarkContext} from '../src/protocol.js';
const good={espressoML:36,milkInCupML:180,milkTemperatureC:60,spilledML:0,scorched:false,served:true,time:30};
test('every task has a distinct, bounded, nonempty deterministic target',()=>{
  const hashes=new Set();
  for(const id of Object.keys(TASKS)){
    const spec=taskSpec(id,42),mask=targetMask(spec,32);hashes.add(spec.hash);
    expect(taskSpec(id,42)).toEqual(spec);expect(mask.reduce((a,b)=>a+b,0)).toBeGreaterThan(40);expect(mask.reduce((a,b)=>a+b,0)).toBeLessThan(700);
    expect(taskSpec(id,42,'holdout').hash).not.toBe(spec.hash);
    expect(taskSpec(id,42,'feedback').hash).toBe(spec.hash);
  }expect(hashes.size).toBe(3);
});
test('exact target passes, empty and solid white cups cannot game shape score',()=>{
  for(const id of Object.keys(TASKS)){
    const spec=taskSpec(id),mask=targetMask(spec,32);
    expect(evaluateCup(spec,good,mask,32)).toMatchObject({score:100,passed:true});
    expect(evaluateCup(spec,good,new Float32Array(1024),32)).toMatchObject({score:0,passed:false});
    expect(evaluateCup(spec,good,new Float32Array(1024).fill(1),32).passed).toBe(false);
  }
});
test('a perfect shape does not excuse unsafe preparation, spills, missing serve, or timeout',()=>{
  const spec=taskSpec(),mask=targetMask(spec,32);
  for(const patch of [{scorched:true},{served:false},{milkTemperatureC:70},{spilledML:6},{milkInCupML:20},{time:121}])expect(evaluateCup(spec,{...good,...patch},mask,32).passed).toBe(false);
});
test('task seeds and foam evidence reject invalid data',()=>{
  expect(()=>taskSpec('unknown')).toThrow();expect(()=>taskSpec('heart',-1)).toThrow();expect(()=>taskSpec('heart',42,'magic')).toThrow();
  expect(()=>evaluateCup(taskSpec(),good,[NaN],1)).toThrow();expect(()=>evaluateCup(taskSpec(),good,[2],1)).toThrow();
});
test('held-out and independent protocols cannot silently receive practice feedback',()=>{
  const feedback=[{score:20,failedChecks:['shape'],actions:[{command:'grind',duration:2.2}]}];
  expect(()=>benchmarkContext({protocol:'holdout',feedback})).toThrow();expect(()=>benchmarkContext({protocol:'independent',feedback})).toThrow();
  const c=benchmarkContext({taskId:'rosetta',protocol:'feedback',feedback});expect(c.previousEpisodes).toEqual(feedback);expect(c.task.targetFoam).toHaveLength(32);
  expect(()=>benchmarkContext({protocol:'feedback',feedback:[{...feedback[0],actions:[{command:'bogus'}]}]})).toThrow();
});
test('agent context includes a bounded remaining budget and labels cross-task feedback',()=>{
  const budget={decisionsRemaining:7,simulationSecondsRemaining:41.5};
  const feedback=[{taskId:'heart',score:10,failedChecks:['shape'],actions:[{command:'serve',duration:.1}]}];
  const context=benchmarkContext({taskId:'tulip',protocol:'feedback',budget,feedback});
  expect(context.budget).toEqual(budget);expect(context.previousEpisodes[0].taskId).toBe('heart');
  for(const invalid of [{...budget,decisionsRemaining:0},{...budget,decisionsRemaining:33},{...budget,simulationSecondsRemaining:NaN}])
    expect(()=>benchmarkContext({budget:invalid})).toThrow();
  expect(()=>benchmarkContext({protocol:'feedback',feedback:[{...feedback[0],taskId:'unknown'}]})).toThrow();
});
test('learning summaries never mix experiments, targets, protocols, or model identities',()=>{
  const sample={experimentId:'a',task:taskSpec(),protocol:'independent',requestedModel:'mini',models:['mini-v1'],evaluation:{score:1},outcome:'Served'};
  const groups=comparableRuns([sample,{...sample,evaluation:{score:2}},{...sample,experimentId:'b'},{...sample,models:['mini-v2']},{...sample,protocol:'feedback'},{...sample,task:taskSpec('tulip')},{...sample,outcome:'Stopped'},{...sample,protocol:'human'}]);
  expect(groups.map(g=>g.length)).toEqual([2,1,1,1,1]);
  expect(comparableRuns([{...sample,benchmark:'latte-bench/0.1'},{...sample,benchmark:'latte-bench/0.2'}])).toHaveLength(2);
});
