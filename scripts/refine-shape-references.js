import {runPlan,encodePlan} from '../src/plans.js';
import {taskSpec,evaluateCup} from '../src/benchmark.js';
const data=await Bun.file('docs/shape-audit/design-sweep.json').json();
// Explicit successive small, medium and large pools, aligned to the visible target.
for(const fill of [160,180])for(const tilt of [70,85])for(const t of [1.8,2.4,3]){
 const phases=[
 {x:.07,z:-.4,height:10,tilt,duration:t},
 {x:.04,z:-.04,height:10,tilt:0,duration:.1},
 {x:.04,z:-.04,height:10,tilt,duration:t*.95},
 {x:-.02,z:.3,height:10,tilt:0,duration:.1},
 {x:-.02,z:.3,height:10,tilt,duration:t*1.2},
 {x:-.08,z:.66,height:80,tilt:0,duration:.7}];
 const plan=encodePlan({volume:fill,height:160,tilt:75},phases);
 data.families.tulip.push({description:{recipe:'aligned pools',fill,tilt,t},phases,plan,result:runPlan({plan,task:taskSpec('tulip'),evidence:false})});
}
// Three pairs of explicit left/right placements. Six segments leave no extra stem stroke.
for(const fill of [160,180])for(const tilt of [55,70])for(const t of [.8,1.3,1.8]){
 const phases=[
 {x:-.05,z:-.39,height:10,tilt,duration:2},
 {x:.17,z:-.39,height:10,tilt,duration:t},
 {x:-.12,z:-.02,height:10,tilt,duration:t},
 {x:.21,z:-.02,height:10,tilt,duration:t},
 {x:-.23,z:.32,height:10,tilt,duration:t*1.3},
 {x:.23,z:.35,height:10,tilt,duration:t*1.3}];
 const plan=encodePlan({volume:fill,height:160,tilt:75},phases);
 data.families.tulip.push({description:{recipe:'paired lobes',fill,tilt,t},phases,plan,result:runPlan({plan,task:taskSpec('tulip'),evidence:false})});
}
// Four transverse tier strokes require repositioning; use the available six
// endpoints for 3 tiers and a center stem. This intentionally exposes the budget limit.
for(const fill of [170,190])for(const tilt of [40,50,60])for(const t of [.6,1]){
 const phases=[
 {x:-.2,z:-.37,height:10,tilt,duration:1},
 {x:.25,z:-.28,height:10,tilt,duration:t},
 {x:-.35,z:.0,height:10,tilt,duration:t},
 {x:.45,z:.2,height:10,tilt,duration:t},
 {x:-.5,z:.36,height:10,tilt,duration:t},
 {x:0,z:-.55,height:80,tilt:30,duration:1.5}];
 const plan=encodePlan({volume:fill,height:160,tilt:75},phases);
 data.families.rosetta.push({description:{recipe:'tiers and stem',fill,tilt,t},phases,plan,result:runPlan({plan,task:taskSpec('rosetta'),evidence:false})});
}
for(const [id,items] of Object.entries(data.families)){
 for(const x of items)x.result.evaluation=evaluateCup(taskSpec(id),x.result.observation,x.result.surface);
 items.sort((a,b)=>b.result.evaluation.shapeQuality-a.result.evaluation.shapeQuality);
 console.log(id,items.slice(0,5).map(x=>({recipe:x.description,iou:x.result.evaluation.shapeIoU,boundary:x.result.evaluation.boundaryF1,passed:x.result.evaluation.passed})));
}
await Bun.write('docs/shape-audit/design-sweep.json',JSON.stringify(data));
