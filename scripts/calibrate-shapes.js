// Reference-only calibration: no optimizer, model calls, or baseline-dependent tuning.
import {runPlan,PLAN_VERSION,SPACE_HASH,scorerSanity} from '../src/plans.js';
import {taskSpec,EVALUATOR_VERSION,BENCH_VERSION} from '../src/benchmark.js';
import {SHAPE_FLOORS} from '../src/shape-metrics.js';
import {GRID_SIZE,SURFACE_VERSION} from '../src/grid.js';
import heart from '../tasks/reference-heart.json';
const design=await Bun.file('docs/shape-audit/design-sweep.json').json();
const references={
 heart:{...heart,visualMatch:true},
 tulip:{description:'Three explicitly positioned pools match the current fused tulip silhouette. Its binary target already merges the layers; this is not a convincing layered real tulip.',plan:design.families.tulip[0].plan,phases:design.families.tulip[0].phases,visualMatch:true},
 rosetta:{description:'Best hand-designed zigzag candidate from 30 explicit recipes: missing four leaf pairs and the thin stem. Not accepted as a visible target match.',plan:design.families.rosetta[0].plan,phases:design.families.rosetta[0].phases,visualMatch:false},
};
const tasks={};
const down=n=>Math.floor(n*10000)/10000;
for(const [id,ref] of Object.entries(references)){
 const task=taskSpec(id);
 // Evaluate eligibility against fixed floors, independent of a previous calibration.
 const r=runPlan({plan:ref.plan,task:{...task,requirements:{...task.requirements,...SHAPE_FLOORS}},evidence:false});
 const metrics=r.evaluation;
 const requirements={minShapeIoU:Math.max(SHAPE_FLOORS.minShapeIoU,down(.9*metrics.shapeIoU)),minShapePrecision:Math.max(SHAPE_FLOORS.minShapePrecision,down(.9*metrics.precision)),minBoundaryF1:Math.max(SHAPE_FLOORS.minBoundaryF1,down(.9*metrics.boundaryF1))};
 const eligible=ref.visualMatch&&r.evaluation.passed;
 tasks[id]={ready:eligible,requirements:eligible?requirements:{...SHAPE_FLOORS},candidateRequirements:requirements,referencePlan:ref.plan,
  referenceMetrics:{shapeIoU:metrics.shapeIoU,precision:metrics.precision,boundaryF1:metrics.boundaryF1,shapeQuality:metrics.shapeQuality},
  visualMatch:ref.visualMatch,description:ref.description,
  reason:eligible?null:'No visibly matching reference within the tested 33-parameter recipes; calibration withheld. Floors remain diagnostic-only.'};
 await Bun.write(`tasks/reference-${id}.json`,JSON.stringify({...ref,reviewedIoU:metrics.shapeIoU,visualReview:ref.visualMatch},null,2)+'\n');
}
const manifest={schema:'shape-calibration/2',benchmark:BENCH_VERSION,evaluatorVersion:EVALUATOR_VERSION,surfaceVersion:SURFACE_VERSION,gridSize:GRID_SIZE,
 planVersion:PLAN_VERSION,spaceHash:SPACE_HASH,ready:Object.values(tasks).every(x=>x.ready),
 thresholdRule:'Per target: max(predeclared floors, 90% of visually accepted reference IoU, precision and boundary F1), rounded down to four decimals. No baseline scores used. Unmatched targets stay uncalibrated.',
 floors:SHAPE_FLOORS,scorerSanity:scorerSanity(),referenceReplays:3,
 priorExistenceSearch:{evaluations:1001,taskId:'heart',source:'docs/shape-audit/previous-calibration.json',note:'Same physical simulator and 33-parameter space; previous IoU-only scores do not establish the new contour gate.'},tasks};
await Bun.write('tasks/calibration.json',JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(tasks,null,2));
