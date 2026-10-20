import {taskSpec,evaluateCup} from '../src/benchmark.js';
import {episodeConditions} from '../src/conditions.js';
const path=Bun.argv[2];if(!path)throw new Error('Usage: bun run verify results/run.json');
const report=await Bun.file(path).json();let verified=0;
for(const a of report.attempts||[]){
  if(!a.evaluation)continue;
  const canonical=taskSpec(a.task.id,a.task.seed,a.task.protocol);
  if(canonical.hash!==a.task.hash)throw new Error(`Episode ${a.number}: task definition mismatch; use the matching benchmark version.`);
  if(a.benchmark==='latte-bench/0.2'){
    const e=a.environment;
    if(!e)throw new Error(`Episode ${a.number}: missing environment evidence.`);
    const conditions=episodeConditions(a.task.seed,e.index,e.split);
    if(JSON.stringify(conditions)!==JSON.stringify(e))throw new Error(`Episode ${a.number}: environment configuration mismatch.`);
  }
  const result=evaluateCup(canonical,a.observation,a.surface,a.surfaceSize);
  if(result.score!==a.evaluation.score||result.passed!==a.evaluation.passed||JSON.stringify(result.checks)!==JSON.stringify(a.evaluation.checks))throw new Error(`Episode ${a.number}: evaluation does not match saved evidence.`);
  verified++;
}
if(!verified)throw new Error('No scored episodes to verify.');console.log(`Verified ${verified} evaluation(s) from saved foam fields and observations. No API calls made.`);
