// Local deterministic diagnostics. Never imports or calls a model gateway.
import {taskSpec,targetMask,evaluateCup,taskForAgent,BENCH_VERSION} from '../src/benchmark.js';
import {runPlan,encodePlan,planContext,PLAN_SPACE} from '../src/plans.js';
import {FluidSurface,CoffeeSimulation} from '../src/simulation.js';
import {NOMINAL_CONDITIONS,episodeConditions} from '../src/conditions.js';
import {GRID_SIZE as n,SURFACE_VERSION} from '../src/grid.js';
import reviewed from '../tasks/reference-heart.json';
const canonicalPlan=encodePlan({volume:160,height:160,tilt:75},[
  {x:0,z:-.1,height:10,tilt:0,duration:.4},
  {x:0,z:-.1,height:10,tilt:85,duration:.3},
  {x:0,z:-.1,height:10,tilt:85,duration:4},
  {x:0,z:-.1,height:60,tilt:40,duration:.2},
  {x:0,z:.65,height:60,tilt:40,duration:1},
  {x:0,z:.65,height:100,tilt:0,duration:.2},
]);
const sim=new CoffeeSimulation(),canonical=runPlan({plan:canonicalPlan,sim}),reference=runPlan({plan:reviewed.plan});
const task=taskSpec(),target=Array.from(targetMask(task));
const good={espressoML:36,milkInCupML:180,milkTemperatureC:60,spilledML:0,scorched:false,served:true,time:30};
const score=f=>evaluateCup(task,good,f).shapeIoU*100;
const shifts=[1,2,4].map(cells=>{const f=new Array(n*n).fill(0);for(let y=0;y<n;y++)for(let x=cells;x<n;x++)f[y*n+x]=target[y*n+x-cells];return {cells,axis:'+x',score:score(f)};});
const scales=[.9,1.1].map(scale=>({scale,score:score(targetMask({...task,transform:{...task.transform,scale:task.transform.scale*scale}}))}));
const surface=new FluidSurface();surface.reset(NOMINAL_CONDITIONS);surface.foam.set(target);
const seconds=reference.observation.episodeSeconds;for(let i=0;i<Math.round(seconds*30);i++)surface.step(1/30);
const input=planContext({task,milk:episodeConditions(42),notes:''});
const forbidden=['flowMultiplier','foamRetention','foamMixing','spreadMultiplier','textureAmplitude','texturePhase','flowPulse','initialSwirl','velocityDamping'];
const audit={revealedMilkKeys:Object.keys(input.milk),hiddenNamesAbsent:forbidden.every(k=>!JSON.stringify(input).includes(k)),forbidden,foamGrid:sim.surface.n,targetGrid:taskForAgent(task).gridSize,scorerGrid:n};
const result={benchmark:BENCH_VERSION,surfaceVersion:SURFACE_VERSION,resolution:n,target,canonical,reference,
  scorer:{self:score(target),shifts,scales},hold:{seconds,score:score(surface.foam),before:target,after:Array.from(surface.foam)},
  depositionBudget:sim.surface.foamBudget,agentAudit:audit,parameterSpace:PLAN_SPACE};
await Bun.write('docs/diagnosis/current.json',JSON.stringify(result));
await Bun.write('docs/agent-input.json',JSON.stringify(input,null,2));
await Bun.write('docs/diagnosis/agent-input.json',JSON.stringify(input,null,2));
await Bun.write('docs/diagnosis/canonical-plan.json',JSON.stringify({plan:canonicalPlan,actions:canonical.actions},null,2));
console.log(JSON.stringify({scorer:result.scorer,hold:{seconds,score:result.hold.score},canonical:canonical.evaluation,reference:reference.evaluation,depositionBudget:result.depositionBudget,agentAudit:audit},null,2));
