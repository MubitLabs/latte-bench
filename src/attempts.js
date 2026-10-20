// Independent trials: history is retained for inspection, not injected as learning.
export async function runTrials({count, reset, observe, decide, act, wait, pause, cancelled, onStart, onDecision, onFinish}) {
  for(let trial=0;trial<count&&!cancelled();trial++){
    reset();
    onStart(trial+1,count);
    let outcome='Action limit',error=null;
    try{
      for(let step=0;step<32&&!observe().served;step++){
        if(cancelled())break;
        pause(true);
        const result=await decide(step+1);
        if(cancelled())break;
        onDecision(result);
        pause(false);
        act(result.action);
        await wait(result.action.duration??.6);
        if(cancelled())break;
        if(result.action.command==='pour')act({command:'stop'});
      }
      outcome=cancelled()?'Stopped':observe().served?'Served':'Action limit';
    }catch(e){
      outcome=cancelled()?'Stopped':'Error';error=cancelled()?null:e.message;
    }finally{
      pause(false);
      // Cancellation's owner already stops the machine; never touch a newer controller.
      if(!cancelled())act({command:'stop'});
      onFinish({outcome,error});
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
