import calibration from '../tasks/calibration.json';
import {runPlan,calibrationStatus} from '../src/plans.js';
import {taskSpec,BENCH_VERSION} from '../src/benchmark.js';
const attempts=[];
for(const taskId of Object.keys(calibration.tasks)){
 const gate=calibrationStatus({replay:true,taskId});
 if(!gate.ready){console.log(`${taskId}: calibration withheld. ${gate.reason}`);continue;}
 attempts.push(runPlan({plan:calibration.tasks[taskId].referencePlan,task:taskSpec(taskId)}));
}
await Bun.write('results/shape-calibration-evidence.json',JSON.stringify({schema:BENCH_VERSION,calibration,attempts}));
console.log(`Saved ${attempts.length} accepted reference replays. No model calls.`);
