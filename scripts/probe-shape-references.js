// Small, explicit hand-designed recipe sweep; no model or optimizer calls.
import {runPlan,encodePlan} from '../src/plans.js';
import {taskSpec,targetMask} from '../src/benchmark.js';
const families={tulip:[],rosetta:[]};
for(const fill of [150,170])for(const tilt of [65,80])for(const scale of [.7,1,1.3]){
 const phases=[
  {x:0,z:-.41,height:10,tilt,duration:2*scale},
  {x:0,z:-.05,height:10,tilt:0,duration:.15},
  {x:0,z:-.05,height:10,tilt,duration:2.1*scale},
  {x:0,z:.36,height:10,tilt:0,duration:.15},
  {x:0,z:.36,height:10,tilt,duration:2.8*scale},
  {x:0,z:.65,height:80,tilt:0,duration:.8},
 ];
 const plan=encodePlan({volume:fill,height:160,tilt:75},phases);
 families.tulip.push({description:{fill,tilt,scale},phases,plan,result:runPlan({plan,task:taskSpec('tulip'),evidence:false})});
}
for(const fill of [150,175])for(const tilt of [45,60,75])for(const duration of [.5,1,1.5]){
 const phases=[
 {x:-.13,z:-.42,height:10,tilt,duration:1},
 {x:.25,z:-.32,height:10,tilt,duration},
 {x:-.32,z:-.12,height:10,tilt,duration},
 {x:.4,z:.08,height:10,tilt,duration},
 {x:-.5,z:.31,height:10,tilt,duration},
 {x:.48,z:.48,height:10,tilt,duration},
 ];
 const plan=encodePlan({volume:fill,height:160,tilt:75},phases);
 families.rosetta.push({description:{fill,tilt,duration},phases,plan,result:runPlan({plan,task:taskSpec('rosetta'),evidence:false})});
}
for(const [id,items] of Object.entries(families)){
 items.sort((a,b)=>b.result.evaluation.shapeIoU-a.result.evaluation.shapeIoU);
 console.log(id,items.slice(0,3).map(x=>({design:x.description,iou:x.result.evaluation.shapeIoU,checks:x.result.evaluation.checks})));
}
await Bun.write('docs/shape-audit/design-sweep.json',JSON.stringify({resolution:32,targets:Object.fromEntries(['heart','tulip','rosetta'].map(id=>[id,Array.from(targetMask(taskSpec(id)))])),families}));
