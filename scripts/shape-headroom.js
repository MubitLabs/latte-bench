import {runPlan,encodePlan,PLAN_SPACE,PLAN_VERSION,SPACE_HASH} from '../src/plans.js';
import {taskSpec,evaluateCup,targetMask,EVALUATOR_VERSION} from '../src/benchmark.js';
import {random,NOMINAL_CONDITIONS} from '../src/conditions.js';
import {SHAPE_FLOORS} from '../src/shape-metrics.js';
import calibration from '../tasks/calibration.json';
const ids=['heart','tulip','rosetta'],tasks=Object.fromEntries(ids.map(id=>[id,taskSpec(id)]));
const canonical=(await Bun.file('docs/diagnosis/canonical-plan.json').json()).plan;
const center=encodePlan({volume:160,height:160,tilt:75},[
 {x:0,z:0,height:10,tilt:0,duration:.4},{x:0,z:0,height:10,tilt:85,duration:.3},{x:0,z:0,height:10,tilt:85,duration:4},
 {x:0,z:0,height:10,tilt:85,duration:.2},{x:0,z:0,height:10,tilt:0,duration:.2},{x:0,z:0,height:10,tilt:0,duration:1},
]);
const noPull={parameters:[...canonical.parameters]};
// Same canonical pour through the circle phase; remaining segments hold that
// position, turn flow off, and settle instead of lifting and pulling through.
for(let segment=3;segment<6;segment++){
 const j=3+segment*5;noPull.parameters[j]=.5;noPull.parameters[j+1]=(-.1+.8)/1.6;noPull.parameters[j+2]=0;noPull.parameters[j+3]=0;
}
const offCenter={parameters:[...canonical.parameters]};
for(let segment=0;segment<6;segment++)offCenter.parameters[3+segment*5]=(.35+.8)/1.6;
const naivePlans=[{name:'centre pour',plan:center},{name:'no pull-through',plan:noPull},{name:'off-centre (+0.35 x)',plan:offCenter}];
const metrics=(r,id)=>{
 const e=evaluateCup(tasks[id],r.observation,r.surface),q=tasks[id].requirements;
 return {...e,passRatio:Math.min(e.shapeIoU/q.minShapeIoU,e.precision/q.minShapePrecision,e.boundaryF1/q.minBoundaryF1),
  nonShapePass:Object.entries(e.checks).every(([k,v])=>k==='shape'||v),calibrated:!!calibration.tasks[id].ready};
};
const record=(plan)=>{const r=runPlan({plan,evidence:false});return {plan,observation:r.observation,surface:r.surface,actions:r.actions,evaluations:Object.fromEntries(ids.map(id=>[id,metrics(r,id)]))};};
const rng=random(20261020),randomPlans=[];
for(let i=0;i<100;i++){
 randomPlans.push({number:i+1,...record({parameters:Array.from({length:PLAN_SPACE.count},()=>rng())})});
 if((i+1)%25===0)console.log(`Scored ${i+1}/100 identical random valid plans on all three targets.`);
}
const naive=naivePlans.map(x=>({...record(x.plan),name:x.name}));
const references={};for(const id of ids){const r=runPlan({plan:calibration.tasks[id].referencePlan,task:tasks[id]});references[id]={...r,evaluation:metrics(r,id),accepted:calibration.tasks[id].ready,description:calibration.tasks[id].description};}
const teardrop={...record(canonical),name:'canonical teardrop (extra negative control)'};
// A harder ablation: remove only the heart reference's final pull-through.
const removedPull={parameters:[...calibration.tasks.heart.referencePlan.parameters]};
removedPull.parameters.splice(28,5,...removedPull.parameters.slice(23,27),removedPull.parameters[32]);removedPull.parameters[31]=0;
const referenceWithoutPull={...record(removedPull),name:'heart reference with final pull removed (extra control)'};
const quantile=(a,p)=>{const sorted=[...a].sort((a,b)=>a-b),i=(sorted.length-1)*p,lo=Math.floor(i),hi=Math.ceil(i);return sorted[lo]+(sorted[hi]-sorted[lo])*(i-lo);};
const distribution=values=>({min:Math.min(...values),p05:quantile(values,.05),median:quantile(values,.5),p95:quantile(values,.95),max:Math.max(...values),mean:values.reduce((a,b)=>a+b,0)/values.length});
const summary=Object.fromEntries(ids.map(id=>{
 const es=randomPlans.map(r=>r.evaluations[id]),ns=naive.map(r=>({name:r.name,...r.evaluations[id]}));
 return [id,{calibrated:calibration.tasks[id].ready,requirements:tasks[id].requirements,reference:references[id].evaluation,
  random:{count:es.length,quality:distribution(es.map(e=>e.shapeQuality*100)),iou:distribution(es.map(e=>e.shapeIoU*100)),boundary:distribution(es.map(e=>e.boundaryF1*100)),passRatio:distribution(es.map(e=>e.passRatio)),shapePasses:es.filter(e=>e.checks.shape).length,fullPasses:es.filter(e=>e.passed).length,servingPasses:es.filter(e=>e.nonShapePass).length},naive:ns,
  separation:{maxRandomPassRatio:Math.max(...es.map(e=>e.passRatio)),maxNaivePassRatio:Math.max(...ns.map(e=>e.passRatio)),referencePassRatio:references[id].evaluation.passRatio}}];
}));
const report={schema:'shape-audit/1',evaluatorVersion:EVALUATOR_VERSION,planVersion:PLAN_VERSION,spaceHash:SPACE_HASH,
 protocol:{milk:'default nominal milk only',conditions:NOMINAL_CONDITIONS,targetSeed:42,randomSeed:20261020,randomDistribution:'33 independent Uniform[0,1) coordinates; same 100 plans scored against each target',countPerTarget:100,shapeFloors:SHAPE_FLOORS,thresholdRule:calibration.thresholdRule,score:'100 * min(IoU, boundary F1); precision and serving constraints are separate gates',passLine:'min(IoU/requiredIoU, boundaryF1/requiredF1, precision/requiredPrecision) >= 1; plus all serving checks',note:'Rosetta pass ratios are against predeclared diagnostic floors only; no calibrated pass threshold exists. No baseline-dependent threshold tuning.'},
 targets:Object.fromEntries(ids.map(id=>[id,Array.from(targetMask(tasks[id]))])),references,randomPlans,naive,teardrop,referenceWithoutPull,summary};
await Bun.write('docs/shape-audit/headroom.json',JSON.stringify(report));
await Bun.write('docs/shape-audit/summary.json',JSON.stringify({protocol:report.protocol,summary,teardrop:teardrop.evaluations.heart,referenceWithoutPull:referenceWithoutPull.evaluations.heart},null,2));
console.log(JSON.stringify({summary,teardrop:teardrop.evaluations.heart,referenceWithoutPull:referenceWithoutPull.evaluations.heart},null,2));
