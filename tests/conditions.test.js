import {test,expect} from 'bun:test';
import {episodeConditions,NOMINAL_CONDITIONS} from '../src/conditions.js';
import {CoffeeSimulation,FluidSurface} from '../src/simulation.js';
import {simulatePolicy,INITIAL_POLICY} from '../src/baseline.js';
const advance=(s,seconds)=>{for(let t=0;t<seconds-1e-9;){const dt=Math.min(1/60,seconds-t);s.step(dt);t+=dt;}};

test('episode schedule is reproducible, varying, and disjoint from milk holdouts',()=>{
  const train=new Set(),heldout=new Set();
  for(let i=0;i<100;i++){
    const a=episodeConditions(42,i);
    expect(a).toEqual(episodeConditions(42,i));
    expect(a.milkML).toBeGreaterThanOrEqual(205);expect(a.milkML).toBeLessThanOrEqual(245);
    train.add(a.seed);heldout.add(episodeConditions(42,i,'holdout').seed);
  }
  expect(train.size).toBe(100);expect([...train].some(s=>heldout.has(s))).toBe(false);
  expect(()=>episodeConditions(42,-1)).toThrow();
});
test('reset replays the batch instead of rerolling conditions; latent parameters stay out of observations',()=>{
  const c=episodeConditions(123),s=new CoffeeSimulation(c),before=s.observe();
  s.act({command:'steam'});advance(s,1);s.act({command:'reset'});
  expect(s.observe()).toEqual(before);expect(s.conditions).toEqual(c);
  for(const key of ['flowMultiplier','foamRetention','texturePhase','seed','conditions'])expect(s.observe()[key]).toBeUndefined();
});
test('texture and viscosity variation affect the evaluated foam field, not just rendering',()=>{
  const a=new FluidSurface(32),b=new FluidSurface(32);
  a.reset(NOMINAL_CONDITIONS);
  b.reset({...NOMINAL_CONDITIONS,spreadMultiplier:1.2,textureAmplitude:.18,foamMixing:.006});
  for(const s of [a,b]){s.deposit(.2,0,10,.02,0,0,1);s.step(1/30);}
  expect(Array.from(a.foam)).not.toEqual(Array.from(b.foam));
  expect(Array.from(b.foam).every(x=>Number.isFinite(x)&&x>=0&&x<=1)).toBe(true);
});
test('randomized batches conserve milk across flow changes, spills, and airborne droplets',()=>{
  for(const seed of [1,42,123]){
    const c=episodeConditions(seed),s=new CoffeeSimulation(c);
    s.act({command:'grind'});advance(s,2);s.act({command:'extract'});advance(s,4);
    s.act({command:'pickup'});s.act({command:'pour',height:20,tilt:70,x:0,z:0});advance(s,2);
    s.act({command:'move',x:1.3});advance(s,1);
    expect(s.milk+s.inCup+s.spilled+s.drops.reduce((n,d)=>n+d.volume,0)).toBeCloseTo(c.milkML,5);
  }
});
test('optimizer uses reproducible physical episodes, respects budgets, and passes serving gates without a model',()=>{
  const a=simulatePolicy({evidence:true}),b=simulatePolicy({evidence:true});
  expect(a.surface).toEqual(b.surface);expect(a.evaluation).toEqual(b.evaluation);
  expect(a.decisions.length).toBeLessThanOrEqual(32);
  expect(a.observation.episodeSeconds).toBeLessThanOrEqual(120);
  expect(a.evaluation.failedChecks).toEqual(['shape']);expect(a.calls).toBe(0);
  expect(simulatePolicy({index:1}).observation).not.toEqual(a.observation);
  expect(()=>simulatePolicy({parameters:INITIAL_POLICY.map(()=>NaN)})).toThrow();
});
