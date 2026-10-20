import {test,expect} from 'bun:test';
import {contourMetrics} from '../src/shape-metrics.js';
import {taskSpec,targetMask,evaluateCup} from '../src/benchmark.js';
import {calibrationStatus,validatePlan,runPlan} from '../src/plans.js';
import audit from '../docs/shape-audit/headroom.json';

test('same contour metric is exact for all targets, symmetric, and zero for empty maps',()=>{
 for(const id of ['heart','tulip','rosetta']){
  const target=targetMask(taskSpec(id)),actual=audit.references[id].surface.map(x=>x>=.25?1:0);
  expect(contourMetrics(target,target).boundaryF1).toBe(1);
  expect(contourMetrics(new Uint8Array(1024),target).boundaryF1).toBe(0);
  expect(contourMetrics(actual,target).boundaryF1).toBe(contourMetrics(target,actual).boundaryF1);
 }
});
test('canonical teardrop fails heart contour despite passing the IoU and precision gates',()=>{
 const r=audit.teardrop,e=evaluateCup(taskSpec(),r.observation,r.surface);
 expect(e.shapeChecks).toMatchObject({overlap:true,precision:true,contour:false,quality:false});expect(e.passed).toBe(false);
});
test('reviewed heart and tulip replay and pass; rosetta cannot be calibrated',()=>{
 for(const id of ['heart','tulip','rosetta']){
  const r=runPlan({plan:audit.references[id].plan,task:taskSpec(id),evidence:false});
  expect(r.surface).toEqual(audit.references[id].surface);
  expect(r.evaluation.passed).toBe(id!=='rosetta');
  expect(calibrationStatus({taskId:id,replay:true}).ready).toBe(id==='heart');
 }
});
test('all 100 shared random and three naive plans are valid; historical IoU and contour measurements are unchanged',()=>{
 expect(audit.randomPlans).toHaveLength(100);expect(audit.naive).toHaveLength(3);
 for(const r of [...audit.randomPlans,...audit.naive]){
  expect(validatePlan(r.plan)).toEqual(r.plan);
  for(const id of ['heart','tulip','rosetta']){
   const e=evaluateCup(taskSpec(id),r.observation,r.surface),stored=r.evaluations[id];
   for(const key of ['shapeIoU','boundaryF1','precision','recall'])expect(e[key]).toEqual(stored[key]);
   expect(e.passed).toBe(false);
  }
 }
});
test('removing a final gesture does not fail a heart that already meets shape and serving requirements',()=>{
 const r=audit.referenceWithoutPull;expect(evaluateCup(taskSpec(),r.observation,r.surface).passed).toBe(true);
});
