import {parseArgs} from 'node:util';
import {mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {BENCH_VERSION} from '../src/benchmark.js';
if(Bun.argv.includes('--step')){
  const child=Bun.spawn([process.execPath,'scripts/step-bench.js',...Bun.argv.slice(2).filter(a=>a!=='--step')],{stdio:['inherit','inherit','inherit']});
  process.exit(await child.exited);
}
const {values:v}=parseArgs({args:Bun.argv.slice(2),options:{task:{type:'string',default:'heart'},attempts:{type:'string',default:'5'},seeds:{type:'string',default:'42,43,44'},ablation:{type:'string',default:'notes'},route:{type:'string',default:'mubit'},server:{type:'string',default:'http://127.0.0.1:3000'},output:{type:'string',default:'results/plans.json'},'test-attempts':{type:'string',default:'5'},'heldout-shape':{type:'string',default:'tulip'},'default-milk':{type:'boolean'},live:{type:'boolean'},help:{type:'boolean'}}});
if(v.help||!v.live){console.log('bun run bench --live --task heart --attempts 5 --seeds 42,43,44 --ablation no-notes|raw-history|notes --test-attempts 5 --heldout-shape tulip --output results/plans.json\nTwo model calls per attempt (plan + reflection), including rejected plans. Calibration must pass first. --default-milk disables randomization. No live calls without --live. Legacy: --step (server needs ENABLE_STEP_MODE=1). Optimizer: bun run baseline.');process.exit(0);}
const seeds=v.seeds.split(',').map(Number),count=Number(v.attempts),testCount=Number(v['test-attempts']);
if(!seeds.length||new Set(seeds).size!==seeds.length||seeds.some(s=>!Number.isInteger(s)||s<0||s>0xffffffff)||![count,testCount].every(n=>Number.isInteger(n)&&n>=1&&n<=100))throw new Error('Invalid seeds or attempt budget.');
if(v['heldout-shape']===v.task)throw new Error('Held-out shape must differ from the training task.');
const base=new URL(v.server),experiments=[];
async function request(path,body){const r=await fetch(new URL(path,base),body?{method:'POST',headers:{'Content-Type':'application/json',Origin:base.origin},body:JSON.stringify(body)}:{});const data=await r.json();if(!r.ok)throw new Error(data.error);return data;}
async function persist(){await mkdir(dirname(v.output),{recursive:true});await Bun.write(v.output,JSON.stringify({schema:BENCH_VERSION,experiments},null,2));}
const preflight=await request('/api/config');
for(const id of [v.task,v['heldout-shape']])if(!preflight.calibrations?.[id]?.ready)throw new Error(preflight.calibrations?.[id]?.reason||`Uncalibrated task: ${id}`);
for(const seed of seeds){
  let sourceId;
  for(const kind of ['training','heldout-milk','heldout-shape']){
    const config={taskId:kind==='heldout-shape'?v['heldout-shape']:v.task,targetSeed:42,seed,attempts:kind==='training'?count:testCount,
      ablation:v.ablation,lane:v.route,randomized:!v['default-milk'],split:kind==='heldout-milk'?'holdout':'practice',evaluationKind:kind,...(sourceId?{sourceId}:{})};
    const session=await request('/api/experiments',config);
    for(let i=0;i<config.attempts;i++){
      const {attempt:a}=await request(`/api/experiments/${session.id}/attempt`,{});
      console.log(`${v.ablation} seed ${seed} ${kind} ${i+1}/${config.attempts}: ${a.outcome}, ${a.evaluation?.score??0}% shape, cost ${a.costUSD==null?'unknown':'$'+a.costUSD.toFixed(5)}`);
    }
    const report=await request(`/api/experiments/${session.id}`);experiments.push(report);await persist();
    if(kind==='training')sourceId=session.id;
  }
}
console.log(`Saved ${experiments.length} experiments to ${v.output}. Run bun run report ${v.output}.`);
