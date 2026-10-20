import {SURFACE_VERSION,GRID_SIZE} from '../src/grid.js';
import {createInterface} from 'node:readline';
import {runPlan,INITIAL_PLAN,PLAN_SPACE,SPACE_HASH,PLAN_VERSION,scorerSanity,environmentFor,calibrationStatus} from '../src/plans.js';
import {taskSpec} from '../src/benchmark.js';
for await(const line of createInterface({input:process.stdin,crlfDelay:Infinity})){
  try {
    const q=JSON.parse(line);
    if(q.op==='meta'){console.log(JSON.stringify({surfaceVersion:SURFACE_VERSION,gridSize:GRID_SIZE,initial:INITIAL_PLAN,space:PLAN_SPACE,spaceHash:SPACE_HASH,planVersion:PLAN_VERSION,sanity:scorerSanity(),calibration:calibrationStatus({replay:true,taskId:q.taskId||'heart'})}));continue;}
    const r=runPlan({plan:{parameters:q.parameters},task:taskSpec(q.taskId??'heart',q.targetSeed??42),conditions:environmentFor(q.seed??42,q.index??0,q.split??'practice',q.randomized??false),evidence:q.evidence??false});
    r.schedule={seed:q.seed??42,index:q.index??0,split:q.split??'practice',randomized:q.randomized??false};
    if(!q.evidence&&!q.keepSurface){delete r.surface;delete r.actions;}
    console.log(JSON.stringify(r));
  }catch(error){console.log(JSON.stringify({error:error.message}));}
}
