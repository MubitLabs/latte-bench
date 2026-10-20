import {runPlan,PLAN_VERSION,SPACE_HASH,scorerSanity} from '../src/plans.js';
import {taskSpec,BENCH_VERSION,EVALUATOR_VERSION} from '../src/benchmark.js';
import {concavityMask} from '../src/shape-metrics.js';
import {targetMask} from '../src/benchmark.js';
import prior from '../docs/heart-pilot-v2/previous-calibration.json';
import {GRID_SIZE,SURFACE_VERSION} from '../src/grid.js';
const entry=structuredClone(prior.tasks.heart);entry.requirements.minConcavityEmptyFraction=.8;
const task={...taskSpec('heart'),requirements:{...taskSpec('heart').requirements,...entry.requirements}};
const result=runPlan({plan:entry.referencePlan,task});if(!result.evaluation.passed)throw new Error('Reviewed heart no longer passes.');
entry.referenceMetrics={...entry.referenceMetrics,concavityEmptyFraction:result.evaluation.concavityEmptyFraction};
const manifest={...prior,benchmark:BENCH_VERSION,evaluatorVersion:EVALUATOR_VERSION,gridSize:GRID_SIZE,surfaceVersion:SURFACE_VERSION,planVersion:PLAN_VERSION,spaceHash:SPACE_HASH,
 thresholdRule:'Heart keeps existing IoU, boundary and precision requirements. Add target-agnostic hull-minus-target empty fraction >=0.8; no thresholds fitted to rerun outcomes.',
 floors:{...prior.floors,minConcavityEmptyFraction:.8},scorerSanity:scorerSanity(),tasks:{heart:entry,...Object.fromEntries(['tulip','rosetta'].map(id=>[id,{...prior.tasks[id],ready:false,reason:'Paused: heart-only pilot; no calibration under the concavity scorer.'}]))}};
await Bun.write('tasks/calibration.json',JSON.stringify(manifest,null,2)+'\n');
console.log('Heart replay passes; other tasks inactive.');
