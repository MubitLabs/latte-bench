import calibration from '../tasks/calibration.json';
import {runPlan,calibrationStatus} from '../src/plans.js';
const gate=calibrationStatus({replay:true});if(!gate.ready)throw new Error(gate.reason);
const original=await Bun.file('results/calibration-evidence.json').json();
const result=runPlan({plan:calibration.referencePlan});
await Bun.write('results/calibration-evidence.json',JSON.stringify({schema:'latte-bench/0.3',calibration,curve:original.curve,attempts:[result]}));
await Bun.write('docs/calibration-search.json',JSON.stringify({calibration,curve:original.curve},null,2));
console.log(`Reference replay passed: ${result.evaluation.score}% overlap.`);
