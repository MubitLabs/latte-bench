import {test,expect} from 'bun:test';
import {CoffeeSimulation,FluidSurface,validateCommand} from '../src/simulation.js';
import {completionURL} from '../src/engine.js';
const advance=(sim,t)=>{for(let i=0;i<Math.ceil(t*60);i++)sim.step(1/60);};
const prepared=()=>{const s=new CoffeeSimulation();s.act({command:'grind'});advance(s,2.1);s.act({command:'extract'});advance(s,4.1);s.act({command:'steam'});advance(s,5.3);s.act({command:'steam'});s.act({command:'pickup'});return s;};
test('controls reject unknown commands, nonfinite values and unsafe ranges',()=>{
  expect(()=>validateCommand({command:'hack'})).toThrow();expect(()=>validateCommand({command:'move',x:2})).toThrow();expect(()=>validateCommand({command:'pour',duration:Infinity})).toThrow();expect(()=>validateCommand({command:'move',tilt:-1})).toThrow();
  expect(validateCommand({command:'move',x:.4,tilt:50,extra:'ignored'})).toEqual({command:'move',x:.4,tilt:50});
});
test('workstation enforces preparation and serves only a filled cup',()=>{
  const s=new CoffeeSimulation();s.act({command:'extract'});advance(s,1);expect(s.espresso).toBe(0);s.act({command:'serve'});expect(s.served).toBe(false);
  s.act({command:'grind'});advance(s,2.1);expect(s.grounds).toBe(18);s.act({command:'extract'});advance(s,4.1);expect(s.espresso).toBe(36);
});
test('milk mass is conserved across airborne drops, cup and spills',()=>{
  const s=prepared();s.act({command:'pour',x:.2,z:0,height:30,tilt:65});advance(s,2);s.act({command:'move',x:1.3,z:0});advance(s,1);s.act({command:'stop'});advance(s,.4);
  expect(s.inCup).toBeGreaterThan(20);expect(s.spilled).toBeGreaterThan(5);
  expect(s.milk+s.inCup+s.spilled+s.drops.reduce((n,d)=>n+d.volume,0)).toBeCloseTo(220,5);
});
test('high pours mix while low pours leave substantially more surface foam',()=>{
  const low=prepared(),high=prepared();
  for(const[s,height]of[[low,12],[high,190]]){s.act({command:'pour',height,tilt:65});advance(s,2);s.act({command:'stop'});advance(s,.4);}
  const sum=s=>s.surface.foam.reduce((n,x)=>n+x,0);expect(sum(low)).toBeGreaterThan(sum(high)*3);
});
test('spatial action changes the actual deposited pattern',()=>{
  const left=prepared(),right=prepared();for(const[s,x]of[[left,-.5],[right,.5]]){s.act({command:'pour',x,z:0,height:12,tilt:60});advance(s,1.4);s.act({command:'stop'});advance(s,.3);}
  const centroid=s=>{let weighted=0,total=0;for(let i=0;i<s.surface.foam.length;i++){weighted+=s.surface.foam[i]*(i%s.surface.n);total+=s.surface.foam[i];}return weighted/total;};
  expect(centroid(right)-centroid(left)).toBeGreaterThan(20);
});
test('overfilling the 240 ml cup spills the excess and conserves volume',()=>{
  const s=prepared();s.act({command:'pour',height:10,tilt:85});advance(s,15);s.act({command:'stop'});advance(s,.5);
  expect(s.espresso+s.inCup).toBeCloseTo(240,4);expect(s.spilled).toBeGreaterThan(15);
  expect(s.milk+s.inCup+s.spilled).toBeCloseTo(220,4);expect(s.spillMarks.length).toBeGreaterThan(0);
});
test('rim prevents lowering the spout into an empty cup',()=>{
  const s=new CoffeeSimulation();s.controls.height=10;
  expect(s.effectiveHeight()).toBeGreaterThan(100);
  s.espresso=36;s.inCup=196;
  expect(s.effectiveHeight()).toBeLessThan(25);
  s.controls.height=180;expect(s.effectiveHeight()).toBe(180);
});
test('overheated milk stays scorched and reset clears the whole physical task state',()=>{
  const s=new CoffeeSimulation();s.act({command:'steam'});advance(s,8);expect(s.scorched).toBe(true);s.act({command:'stop'});s.temperature=60;expect(s.foamQuality()).toBe(.15);s.reset();expect(s.scorched).toBe(false);expect(s.history).toHaveLength(0);expect(s.milk).toBe(220);expect(s.surface.coverage()).toBe(0);
});
test('surface solver remains bounded and does not transport outside the cup',()=>{
  const f=new FluidSurface(32);f.deposit(.8,0,30,.01,2,0,1);for(let i=0;i<60;i++)f.step(1/30);
  for(let i=0;i<f.foam.length;i++){expect(Number.isFinite(f.foam[i])).toBe(true);expect(f.foam[i]).toBeGreaterThanOrEqual(0);expect(f.foam[i]).toBeLessThanOrEqual(1);if(!f.mask[i])expect(f.foam[i]).toBe(0);}
});
test('preserves gateway API prefixes',()=>{expect(completionURL('https://api.pywid.ai/v1/')).toBe('https://api.pywid.ai/v1/chat/completions');expect(()=>completionURL('file:///tmp/private')).toThrow();});
