import {clamp,CoffeeSimulation,validateCommand} from './simulation.js';
import {episodeConditions} from './conditions.js';
import {taskSpec,evaluateCup,BENCH_VERSION} from './benchmark.js';

// Six freely positioned timed pours, plus fill, tilt and height: 21 parameters.
// This policy sees observations only. It never reads latent batch coefficients.
export const INITIAL_POLICY=[.5,.6,.2, .35,.4,.6, .65,.4,.6, .4,.55,.4, .6,.55,.4, .5,.65,.3, .5,.5,.4];
export const POLICY_VERSION='six-pour/1';
export function trajectoryPolicy(parameters=INITIAL_POLICY,closedLoop=true){
  if(parameters.length!==21||parameters.some(x=>!Number.isFinite(x)||x<0||x>1))throw new Error('Expected 21 parameters in [0,1].');
  const p=parameters,fill=180+p[0]*30,tilt=45+p[1]*40,height=10+p[2]*30;
  let stage='grind',point=0,flowScale=1,previousPour=null;
  function pour(o,x,z,h,t,duration){
    duration=clamp(duration,.05,5);
    previousPour={milk:o.milkRemainingML,duration,nominal:nominalFlow(o,t)};
    return {command:'pour',x,z,height:h,tilt:t,duration};
  }
  function nominalFlow(o,t){return Math.max(1,Math.sin((t-25)/60*Math.PI/2)*32*Math.sqrt(o.milkRemainingML/220));}
  return o=>{
    if(closedLoop&&previousPour){
      const measured=(previousPour.milk-o.milkRemainingML)/previousPour.duration;
      if(measured>0)flowScale=clamp(measured/previousPour.nominal,.6,1.4);
      previousPour=null;
    }
    if(stage==='grind'){stage='extract';return {command:'grind',duration:2.1};}
    if(stage==='extract'){stage='steam';return {command:'extract',duration:4.1};}
    if(stage==='steam'){
      stage='heat';
      return {command:'steam',duration:closedLoop?clamp((62-o.milkTemperatureC)/8,.05,5):5};
    }
    if(stage==='heat'){
      if(closedLoop&&o.milkTemperatureC<61.9)return {command:'move',duration:clamp((62-o.milkTemperatureC)/8,.05,5)};
      stage='fill';return {command:'pickup',duration:.1};
    }
    if(stage==='fill'){
      if(closedLoop){
        const remaining=fill-o.espressoML-o.milkInCupML;
        if(remaining>1&&o.milkRemainingML>1)return pour(o,0,0,160,75,remaining/(nominalFlow(o,75)*flowScale));
      }else{
        stage='draw';return pour(o,0,0,160,75,4.5+p[0]*.5);
      }
      stage='draw';
    }
    if(stage==='draw'&&point<6){
      const offset=3+point++*3;
      let duration=.15+p[offset+2]*1.35;
      // React to current fill and measured flow; positions remain a search policy.
      // A matched open-loop ablation ignores these observations during pouring.
      if(closedLoop){
        const available=235-o.espressoML-o.milkInCupML;
        if(available<=1){stage='serve';return {command:'stop',duration:.3};}
        duration=Math.min(duration/flowScale,available/(nominalFlow(o,tilt)*flowScale));
      }
      return pour(o,(p[offset]-.5)*1.5,(p[offset+1]-.5)*1.5,height,tilt,duration);
    }
    if(stage==='draw'){
      if(closedLoop&&o.espressoML+o.milkInCupML<191&&o.milkRemainingML>1)
        return pour(o,0,0,160,65,(193-o.espressoML-o.milkInCupML)/(nominalFlow(o,65)*flowScale));
      stage='serve';return {command:'stop',duration:.3};
    }
    return {command:'serve',duration:.1};
  };
}

export function simulatePolicy({parameters=INITIAL_POLICY,taskId='heart',seed=42,index=0,split='practice',closedLoop=true,evidence=false}={}){
  // Keep target constant across milk holdouts: separate robustness from target transfer.
  const task=taskSpec(taskId,seed),environment=episodeConditions(seed,index,split);
  const sim=new CoffeeSimulation(environment),decide=trajectoryPolicy(parameters,closedLoop),decisions=[],trace=[];
  let episodeSeconds=0;
  for(let step=0;step<task.limits.decisions&&!sim.served&&episodeSeconds<task.limits.simulationSeconds;step++){
    const before=sim.observe(),action=validateCommand(decide(before));
    const duration=Math.min(action.duration??.6,task.limits.simulationSeconds-episodeSeconds);
    sim.act(action);
    for(let elapsed=0;elapsed<duration-1e-9;){const dt=Math.min(1/60,duration-elapsed);sim.step(dt);elapsed+=dt;}
    episodeSeconds+=duration;
    if(action.command==='pour')sim.act({command:'stop'});
    decisions.push({action,model:POLICY_VERSION});
    if(evidence)trace.push({before,action,after:sim.observe()});
  }
  sim.act({command:'stop'});
  const observation={...sim.observe(),episodeSeconds},evaluation=evaluateCup(task,observation,sim.surface.foam);
  // Constraints take precedence over shape. This objective is recorded, not a pass override.
  const constraintFailures=evaluation.failedChecks.filter(k=>k!=='shape').length;
  const result={task,environment,evaluation,observation,decisions,objective:evaluation.shapeIoU-constraintFailures,
    benchmark:BENCH_VERSION,policyVersion:POLICY_VERSION,parameters,closedLoop,calls:0,
    outcome:sim.served?'Served':'Action limit'};
  if(evidence)Object.assign(result,{surface:Array.from(sim.surface.foam),surfaceSize:sim.surface.n,trace});
  return result;
}
