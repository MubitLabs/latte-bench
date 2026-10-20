import {runPlan} from '../src/plans.js';
const saved=await Bun.file('docs/diagnosis/plan-sweep.json').json();let count=0;
for(const family of Object.values(saved.families))for(const candidate of family){
  const result=runPlan({plan:candidate.plan,evidence:false});
  if(Math.abs(result.evaluation.shapeIoU-candidate.score)>1e-8)throw new Error('Development candidate no longer reproduces.');count++;
}
console.log(`Replayed ${count} local development candidates. No model calls.`);
