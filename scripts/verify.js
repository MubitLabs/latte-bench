import {taskSpec,evaluateCup} from '../src/benchmark.js';
import {runPlan,environmentFor,validatePlan,SPACE_HASH} from '../src/plans.js';
import {NOMINAL_CONDITIONS} from '../src/conditions.js';
const args=Bun.argv.slice(2),path=args.find(a=>!a.startsWith('--')),replay=args.includes('--replay');
if(!path)throw new Error('Usage: bun run verify [--replay] results/run.json');
const report=await Bun.file(path).json();let verified=0,rejections=0;
for(const experiment of report.experiments??[report])for(const a of experiment.attempts??[]){
  if(a.outcome==='Rejected'){rejections++;continue;}
  if(!a.evaluation)continue;
  const task=taskSpec(a.task.id,a.task.seed,a.task.protocol);
  if(task.hash!==a.task.hash)throw new Error(`Attempt ${a.number}: task/calibration definition mismatch.`);
  const evaluation=evaluateCup(task,a.observation,a.surface,a.surfaceSize);
  if(JSON.stringify(evaluation)!==JSON.stringify(a.evaluation))throw new Error(`Attempt ${a.number}: score mismatch.`);
  if(a.plan){
    validatePlan(a.plan);if(a.spaceHash!==SPACE_HASH)throw new Error('Parameter space mismatch.');
    const s=a.schedule;
    const conditions=s?environmentFor(s.seed,s.index,s.split,s.randomized):NOMINAL_CONDITIONS;
    if(JSON.stringify(conditions)!==JSON.stringify(a.environment))throw new Error('Environment schedule mismatch.');
    if(replay){
      const actual=runPlan({plan:a.plan,task,conditions,evidence:!!a.trace});
      for(const field of ['surface','observation','actions','trace'])if(a[field]&&JSON.stringify(actual[field])!==JSON.stringify(a[field]))throw new Error(`Attempt ${a.number}: ${field} replay mismatch.`);
    }
  }
  verified++;
}
if(!verified&&!rejections)throw new Error('No scored or rejected attempts found.');
console.log(`Verified ${verified} scores${replay?' and physical replays':''}; ${rejections} recorded rejections. No model calls.`);
