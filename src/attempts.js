// Independent trials: history is retained for inspection, not injected as learning.
export async function runTrials({count, reset, observe, decide, act, wait, pause, cancelled, onStart, onDecision, onFinish,maxSteps=32,maxSimulationSeconds=120}) {
  for(let trial=0;trial<count&&!cancelled();trial++){
    reset();
    onStart(trial+1,count);
    let outcome='Action limit',error=null,episodeSeconds=0;
    try{
      for(let step=0;step<maxSteps&&!observe().served&&episodeSeconds<maxSimulationSeconds;step++){
        if(cancelled())break;
        pause(true);
        const result=await decide(step+1);
        if(cancelled())break;
        onDecision(result);
        pause(false);
        act(result.action);
        const duration=Math.min(result.action.duration??.6,maxSimulationSeconds-episodeSeconds);
        await wait(duration);episodeSeconds+=duration;
        if(cancelled())break;
        if(result.action.command==='pour')act({command:'stop'});
      }
      outcome=cancelled()?'Stopped':observe().served?'Served':episodeSeconds>=maxSimulationSeconds?'Time limit':'Action limit';
    }catch(e){
      outcome=cancelled()?'Stopped':'Error';error=cancelled()?null:e.message;
    }finally{
      pause(false);
      // Cancellation's owner already stops the machine; never touch a newer controller.
      if(!cancelled())act({command:'stop'});
      onFinish({outcome,error,episodeSeconds});
    }
    if(outcome==='Error'||cancelled())break;
    if(trial<count-1){try{await wait(1.5);}catch{return;}}
  }
}

export function summarizeAttempt({observation,...attempt}){
  return {...attempt,observation,volumeML:+(observation.espressoML+observation.milkInCupML).toFixed(1),
    spilledML:observation.spilledML,temperatureC:observation.milkTemperatureC,
    scorched:observation.scorched,coverage:observation.surfaceCoverage};
}
