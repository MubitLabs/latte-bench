import heart from '../tasks/heart.json';
import tulip from '../tasks/tulip.json';
import rosetta from '../tasks/rosetta.json';
import calibration from '../tasks/calibration.json';
export const TASKS=Object.freeze({heart,tulip,rosetta});
export const BENCH_VERSION='latte-bench/0.3';
export const EVALUATOR_VERSION='mask-iou/2';
export const PROTOCOLS=['independent','feedback','holdout'];
export function fingerprint(value){let h=2166136261;for(const c of JSON.stringify(value)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return (h>>>0).toString(16).padStart(8,'0');}
function random(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
export function taskSpec(id='heart',seed=42,protocol='independent'){
  if(!Object.hasOwn(TASKS,id))throw new Error('Unknown benchmark task.');
  if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw new Error('Seed must be a 32-bit unsigned integer.');
  if(!PROTOCOLS.includes(protocol))throw new Error('Unknown benchmark protocol.');
  const base=TASKS[id];
  const task=calibration.ready?{...base,requirements:{...base.requirements,minShapeIoU:calibration.threshold,minShapePrecision:calibration.precisionThreshold??0}}:base;
  // Practice and independent trials share the same visible target. Held-out trials
  // use a separate deterministic transform stream; no earlier feedback is supplied.
  const rng=random(seed^(protocol==='holdout'?0x9e3779b9:0));
  const v=task.variants,transform={x:(rng()*2-1)*v.translation,z:(rng()*2-1)*v.translation,
    rotation:(rng()*2-1)*v.rotationDegrees,scale:v.scaleRange[0]+rng()*(v.scaleRange[1]-v.scaleRange[0])};
  const spec={...task,seed,protocol,transform};return {...spec,hash:fingerprint({task,seed,transform})};
}
function insidePrimitive(x,z,p){
  const r=(p.rotation||0)*Math.PI/180,dx=x-p.x,dz=z-p.z;
  const px=dx*Math.cos(r)+dz*Math.sin(r),pz=-dx*Math.sin(r)+dz*Math.cos(r);
  if(p.shape==='ellipse')return (px/p.rx)**2+(pz/p.rz)**2<=1;
  if(p.shape==='heart'){const a=px/p.scale,b=-pz/p.scale;return (a*a+b*b-1)**3-a*a*b*b*b<=0;}
  throw new Error('Unknown target primitive.');
}
export function targetMask(spec,size=96){
  const out=new Uint8Array(size*size),t=spec.transform,r=t.rotation*Math.PI/180;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const cx=(x+.5)/size*2-1,cz=(y+.5)/size*2-1;if(Math.hypot(cx,cz)>=.985)continue;
    const dx=(cx-t.x)/t.scale,dz=(cz-t.z)/t.scale;
    const px=dx*Math.cos(r)+dz*Math.sin(r),pz=-dx*Math.sin(r)+dz*Math.cos(r);
    out[y*size+x]=spec.target.primitives.some(p=>insidePrimitive(px,pz,p))?1:0;
  }return out;
}
export function evaluateCup(spec,observation,foam,size=96){
  if(foam.length!==size*size||Array.from(foam).some(n=>!Number.isFinite(n)||n<0||n>1))throw new Error('Invalid foam field.');
  const target=targetMask(spec,size);let intersection=0,union=0,predicted=0,expected=0;
  for(let i=0;i<target.length;i++){
    if(Math.hypot((i%size+.5)/size*2-1,(Math.floor(i/size)+.5)/size*2-1)>=.985)continue;
    const actual=foam[i]>=.25,want=!!target[i];if(actual)predicted++;if(want)expected++;if(actual&&want)intersection++;if(actual||want)union++;
  }
  const iou=union?intersection/union:0,r=spec.requirements,volume=observation.espressoML+observation.milkInCupML;
  const checks={shape:iou>=r.minShapeIoU&&(predicted?intersection/predicted:0)>=(r.minShapePrecision??0),served:observation.served===true,
    volume:volume>=r.volumeML[0]&&volume<=r.volumeML[1]+.001,
    temperature:observation.milkTemperatureC>=r.temperatureC[0]&&observation.milkTemperatureC<=r.temperatureC[1],
    spill:observation.spilledML<=r.maxSpillML,unscorched:observation.scorched===false,
    time:(observation.episodeSeconds??observation.time)<=spec.limits.simulationSeconds};
  return {version:EVALUATOR_VERSION,taskHash:spec.hash,score:+(iou*100).toFixed(1),shapeIoU:iou,
    precision:predicted?intersection/predicted:0,recall:expected?intersection/expected:0,
    passed:Object.values(checks).every(Boolean),checks,failedChecks:Object.keys(checks).filter(key=>!checks[key])};
}
export function taskForAgent(spec){const mask=targetMask(spec,16);return {id:spec.id,version:spec.version,hash:spec.hash,instruction:spec.instruction,
  requirements:spec.requirements,limits:spec.limits,coordinates:'x right, z front; normalized cup radius. Grid rows run from back to front.',
  targetFoam:Array.from({length:16},(_,y)=>Array.from(mask.slice(y*16,y*16+16)).join(''))};}
export function comparableRuns(attempts){
  // Never pool different tasks, target variants, protocols, budgets, or model IDs.
  const groups=new Map();
  for(const a of attempts){if(!a.evaluation||(!PROTOCOLS.includes(a.protocol)&&!a.protocol?.startsWith('plan-'))||a.outcome==='Stopped'||a.outcome==='Error')continue;
    const key=JSON.stringify([a.experimentId,a.benchmark,a.environment?.version,a.environment?.split,a.task.hash,a.protocol,a.requestedModel,a.models]);
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push(a);
  }return [...groups.values()];
}
