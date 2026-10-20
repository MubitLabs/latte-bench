import {test,expect} from 'bun:test';
import {concavityMask,concavityMetrics} from '../src/shape-metrics.js';
import {taskSpec,targetMask,evaluateCup} from '../src/benchmark.js';
import check from '../docs/heart-frozen-v3/scorer-check.json';
test('convex hull subtraction marks a concavity but neither target foreground nor exterior',()=>{
 const target=new Uint8Array(25);for(const [x,y] of [[1,1],[1,2],[1,3],[2,3],[3,1],[3,2],[3,3]])target[y*5+x]=1;
 const mask=concavityMask(target,5);expect(mask[7]).toBe(1);expect(mask[12]).toBe(1);expect(mask[0]).toBe(0);expect(mask[16]).toBe(0);
 expect(concavityMetrics(target,target,5).concavityEmptyFraction).toBe(1);
 expect(concavityMetrics(target.map((v,i)=>v||mask[i]),target,5).concavityEmptyFraction).toBe(0);
});
test('hull emptiness uses one shared rule for all shapes and perfect masks stay perfect',()=>{
 for(const id of ['heart','tulip','rosetta']){
  const mask=targetMask(taskSpec(id));expect(concavityMetrics(mask,mask).concavityEmptyFraction).toBe(1);
  expect(Array.from(concavityMask(mask)).every((v,i)=>!v||!mask[i])).toBe(true);
 }
 expect(concavityMetrics([1,1,1,1],[1,1,1,1],2).concavityEmptyFraction).toBe(1);
});
test('both frozen optimizer false positives fail concavity while reviewed heart still passes',()=>{
 expect(check.rows).toHaveLength(2);
 for(const row of check.rows){expect(row.evaluation.passed).toBe(false);expect(row.evaluation.shapeChecks.quality).toBe(false);expect(row.evaluation.score).toBeGreaterThan(0);expect(row.evaluation.concavityEmptyFraction).toBe(0);}
 const r=check.reference,e=evaluateCup(taskSpec(),r.observation,r.surface);expect(e.passed).toBe(true);expect(e.concavityEmptyFraction).toBe(1);
});

test('concavity density penalty is continuous through the old 0.25 threshold',()=>{
 const task=taskSpec(),target=targetMask(task),cell=Array.from(concavityMask(target)).findIndex(Boolean);
 const foam=Array.from(target),obs=check.reference.observation;
 const scores=[0,.1,.2499,.2501,.5,1].map(v=>{foam[cell]=v;return evaluateCup(task,obs,foam);});
 expect(scores.map(e=>e.concavityPenalty)).toEqual([0,.025,.062475,.062525,.125,.25]);
 // Mask IoU/contour may still have their existing binary edge, but the new
 // concavity term itself changes by exactly 0.00005 rather than a full veto.
 expect(scores[3].score).toBeGreaterThan(90);expect(scores[5].score).toBeGreaterThan(70);
 expect(scores.every(e=>!Object.hasOwn(e.shapeChecks,'concavity'))).toBe(true);
});
