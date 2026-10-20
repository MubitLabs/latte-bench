import {test,expect} from 'bun:test';
import {FluidSurface,CoffeeSimulation,validateCommand} from '../src/simulation.js';
import {NOMINAL_CONDITIONS,episodeConditions} from '../src/conditions.js';
import {GRID_SIZE} from '../src/grid.js';
import {taskSpec,targetMask,taskForAgent,evaluateCup} from '../src/benchmark.js';
import {compilePlan,runPlan,planContext,INITIAL_PLAN,PLAN_SPACE} from '../src/plans.js';
import reviewed from '../tasks/reference-heart.json';
const good={espressoML:36,milkInCupML:180,milkTemperatureC:60,spilledML:0,scorched:false,served:true,time:30};
test('one canonical 32x32 grid reaches agents and scorer; all latent milk coefficients remain private',()=>{
  const sim=new CoffeeSimulation(),input=planContext({task:taskSpec(),milk:episodeConditions(42)});
  expect(sim.surface.n).toBe(GRID_SIZE);expect(input.target.targetFoam).toHaveLength(GRID_SIZE);
  expect(sim.observe().surfaceFoam).toHaveLength(GRID_SIZE);expect(input.target.gridSize).toBe(GRID_SIZE);
  expect(Object.keys(input.milk)).toEqual(['volumeML','startingTemperatureC']);
  for(const k of ['flowMultiplier','foamRetention','foamMixing','spreadMultiplier','textureAmplitude','texturePhase','flowPulse','initialSwirl','velocityDamping'])expect(JSON.stringify(input)).not.toContain(k);
  expect(()=>evaluateCup(taskSpec(),good,new Float32Array(96*96),96)).toThrow('canonical');
});
test('injected target survives a complete reference duration with over 80% overlap',()=>{
  const s=new FluidSurface();s.reset(NOMINAL_CONDITIONS);s.foam.set(targetMask(taskSpec()));
  const seconds=runPlan({plan:reviewed.plan,evidence:false}).observation.episodeSeconds;
  for(let t=0;t<Math.ceil(seconds*30);t++)s.step(1/30);
  expect(evaluateCup(taskSpec(),good,s.foam).shapeIoU).toBeGreaterThan(.8);
});
test('surface saturation spreads foam instead of destroying it; only a full surface rejects excess',()=>{
  const s=new FluidSurface();s.reset(NOMINAL_CONDITIONS);
  for(let i=0;i<100;i++)s.deposit(0,0,.5,.02,0,0,1);
  expect(s.foamBudget.lostAtCapacity).toBeLessThan(1e-6);
  expect(s.foamBudget.retained).toBeCloseTo(s.foamBudget.injected,5);
  expect(s.foam.reduce((sum,x)=>sum+x,0)).toBeCloseTo(s.foamBudget.retained,3);
  const n=s.foam.filter(v=>v>=.25).length;expect(n).toBeGreaterThan(150);
  s.foam.set(s.mask);s.deposit(0,0,10,.02,0,0,1);expect(s.foamBudget.lostAtCapacity).toBeGreaterThan(0);
  expect([...s.foam].every(v=>v>=0&&v<=1)).toBe(true);
});
test('foam source has approximately resolution-independent area units',()=>{
  const area=[];for(const n of [32,64,96]){const s=new FluidSurface(n);s.reset(NOMINAL_CONDITIONS);s.deposit(0,0,.01,.05,0,0,1);area.push(s.foam.reduce((sum,v)=>sum+v,0)*4/(n*n));}
  expect(Math.max(...area)/Math.min(...area)).toBeLessThan(1.03);
});
test('continuous plan supports lowering, holding, lifting and pull-through with bounded timing',()=>{
  const actions=compilePlan({parameters:INITIAL_PLAN},{volumeML:220,startingTemperatureC:18}),segments=actions.filter(a=>a.interpolate);
  expect(PLAN_SPACE.count).toBe(33);expect(segments).toHaveLength(6);
  expect(segments[0].height).toBeLessThan(segments[0].from.height);
  expect(segments[2].x).toBe(segments[2].from.x);expect(segments[2].z).toBe(segments[2].from.z);
  expect(segments[3].height).toBeGreaterThan(segments[3].from.height);expect(segments[4].z).toBeGreaterThan(segments[4].from.z);
  for(let j=0;j<101;j++)for(const a of compilePlan({parameters:INITIAL_PLAN.map((v,i)=>i===0?j/100:v)},{volumeML:220,startingTemperatureC:18}))expect(()=>validateCommand(a)).not.toThrow();
});
test('reviewed heart is produced only through pitcher actions, exceeds 50% and passes serving constraints',()=>{
  const r=runPlan({plan:reviewed.plan});
  expect(r.evaluation.shapeIoU).toBeCloseTo(reviewed.reviewedIoU,8);expect(r.evaluation.shapeIoU).toBeGreaterThan(.5);
  expect(r.evaluation.passed).toBe(true);expect(r.observation.spilledML).toBe(0);
  expect(r.trace.foam[0].values.every(v=>v===0)).toBe(true);
  const final=r.surface,n=GRID_SIZE;
  // Regression evidence for this reviewed witness, not an additional score gate:
  // two distinct back lobes separated by a notch in the density field.
  const first=(x)=>{for(let y=0;y<n;y++)if(final[y*n+x]>=.5)return y;return n;};
  expect(first(15)).toBeGreaterThan(first(12));expect(first(15)).toBeGreaterThan(first(19));
});
