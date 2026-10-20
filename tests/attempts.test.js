import {test,expect} from 'bun:test';
import {runTrials,summarizeAttempt} from '../src/attempts.js';
import {CoffeeSimulation} from '../src/simulation.js';

function harness(){
  const sim=new CoffeeSimulation(),results=[],actions=[],decisions=[];
  let cancelled=false,paused=false,resets=0;
  const options={count:3,reset(){resets++;sim.reset();},observe:()=>sim.observe(),
    cancelled:()=>cancelled,pause:value=>paused=value,
    act(action){expect(paused).toBe(false);actions.push(action);sim.act(action);},
    async wait(seconds){for(let t=0;t<seconds;t+=1/60)sim.step(1/60);},
    onStart(){expect(sim.served).toBe(false);expect(sim.inCup).toBe(0);},
    onDecision:result=>decisions.push(result),
    onFinish:result=>results.push({...result,observation:sim.observe()}),
    async decide(){
      expect(paused).toBe(true);
      const s=sim.observe();
      let action;
      if(s.groundsG<18)action={command:'grind',duration:2.2};
      else if(s.espressoML<36)action={command:'extract',duration:4.2};
      else if(!s.held)action={command:'pickup'};
      else if(s.milkInCupML<50)action={command:'pour',tilt:70,duration:3};
      else action={command:'serve'};
      return {action};
    }};
  return {sim,options,results,actions,decisions,cancel:()=>cancelled=true,get paused(){return paused;},get resets(){return resets;}};
}
test('three fresh trials run even when the previous cup is already served',async()=>{
  const h=harness();h.sim.served=true;
  await runTrials(h.options);
  expect(h.resets).toBe(3);expect(h.results.map(r=>r.outcome)).toEqual(['Served','Served','Served']);
  expect(h.decisions).toHaveLength(15);expect(h.paused).toBe(false);
  for(let i=0;i<h.actions.length;i++)if(h.actions[i].command==='pour')expect(h.actions[i+1].command).toBe('stop');
  const summary=summarizeAttempt(h.results[0]);expect(summary.volumeML).toBeGreaterThan(86);expect(summary.spilledML).toBe(0);
});
test('a stalled controller is capped at 32 decisions per cup',async()=>{
  const h=harness();h.options.count=1;h.options.decide=async()=>({action:{command:'move'}});
  await runTrials(h.options);
  expect(h.decisions).toHaveLength(32);expect(h.results[0].outcome).toBe('Action limit');
});
test('provider errors stop the batch and release the simulation pause',async()=>{
  const h=harness();h.options.decide=async()=>{throw new Error('Gateway unavailable');};
  await runTrials(h.options);
  expect(h.resets).toBe(1);expect(h.paused).toBe(false);
  expect(h.results[0]).toMatchObject({outcome:'Error',error:'Gateway unavailable'});
});
test('stopping while a model is thinking prevents its action and subsequent trials',async()=>{
  const h=harness();h.options.decide=async()=>{h.cancel();return {action:{command:'pour'}};};
  await runTrials(h.options);
  expect(h.actions).toHaveLength(0);expect(h.decisions).toHaveLength(0);
  expect(h.resets).toBe(1);expect(h.results[0].outcome).toBe('Stopped');expect(h.paused).toBe(false);
});
