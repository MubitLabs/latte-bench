// Run at ebe84b3 before changing the physics. Read-only, no model calls.
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
// Reproduce the historical evidence without changing the working checkout.
const scratch=await mkdtemp(join(tmpdir(),'latte-original-'));
for(const path of ['src/benchmark.js','src/plans.js','src/simulation.js','src/conditions.js',...['heart','tulip','rosetta','environment','calibration'].map(t=>'tasks/'+t+'.json')]){
  await mkdir(dirname(join(scratch,path)),{recursive:true});
  await writeFile(join(scratch,path),execFileSync('git',['show','ebe84b3:'+path]));
}
const {taskSpec,targetMask,evaluateCup}=await import(pathToFileURL(join(scratch,'src/benchmark.js')));
const {runPlan}=await import(pathToFileURL(join(scratch,'src/plans.js')));
const {FluidSurface}=await import(pathToFileURL(join(scratch,'src/simulation.js')));
const {NOMINAL_CONDITIONS}=await import(pathToFileURL(join(scratch,'src/conditions.js')));
const calibration=await Bun.file(join(scratch,'tasks/calibration.json')).json();
const task=taskSpec(),n=96,target=Array.from(targetMask(task,n));
const reference=runPlan({plan:calibration.referencePlan});
const good={espressoML:36,milkInCupML:180,milkTemperatureC:60,spilledML:0,scorched:false,served:true,time:30};
const score=field=>evaluateCup(task,good,field,n).shapeIoU*100;
const shifts=[1,2,4].map(cells=>{const f=new Array(n*n).fill(0);for(let y=0;y<n;y++)for(let x=cells;x<n;x++)f[y*n+x]=target[y*n+x-cells];return {cells,score:score(f)};});
const scales=[.9,1.1].map(scale=>({scale,score:score(targetMask({...task,transform:{...task.transform,scale:task.transform.scale*scale}},n))}));
const surface=new FluidSurface(n);surface.reset(NOMINAL_CONDITIONS);surface.foam.set(target);
for(let i=0;i<Math.round(reference.observation.episodeSeconds*30);i++)surface.step(1/30);
const data={sourceCommit:'ebe84b3',resolution:n,scorer:{self:score(target),shifts,scales},hold:{seconds:reference.observation.episodeSeconds,score:score(surface.foam),before:target,after:Array.from(surface.foam)},target,reference};
await Bun.write('docs/diagnosis/original.json',JSON.stringify(data));
console.log(JSON.stringify({scorer:data.scorer,hold:{seconds:data.hold.seconds,score:data.hold.score},reference:reference.evaluation,actions:reference.actions,observation:reference.observation},null,2));

await rm(scratch,{recursive:true,force:true});
