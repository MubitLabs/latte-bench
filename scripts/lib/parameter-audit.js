// Offline plan analysis. Compare adjacent attempt slots within a single run only.
export function parameterAudit(experiments,parameters,epsilon=1e-9){
 const valid=a=>a?.evaluation!=null&&a?.plan?.parameters?.length===parameters.length&&a.plan.parameters.every(v=>Number.isFinite(v)&&v>=0&&v<=1);
 return experiments.map(e=>{
  const attempts=[...e.attempts].sort((a,b)=>a.number-b.number).map((a,i,all)=>{
   const previous=all[i-1],values=valid(a)?a.plan.parameters:null;
   const comparable=Boolean(values&&valid(previous)&&previous.number===a.number-1);
   const delta=comparable?values.map((v,j)=>v-previous.plan.parameters[j]):null;
   const physical=values?.map((v,j)=>parameters[j].min+v*(parameters[j].max-parameters[j].min))??null;
   const physicalDelta=delta?.map((v,j)=>v*(parameters[j].max-parameters[j].min))??null;
   return {number:a.number,outcome:a.outcome,score:a.evaluation?.score??null,passed:a.evaluation?.passed??null,
    formatErrors:a.formatErrors,values,physical,delta,physicalDelta,previousAttempt:comparable?previous.number:null,
    changedCount:delta?delta.filter(d=>Math.abs(d)>epsilon).length:null,
    meanAbsoluteChange:delta?delta.reduce((s,v)=>s+Math.abs(v),0)/delta.length:null,
    largestChange:delta?Math.max(...delta.map(Math.abs)):null,
    scoreChange:comparable?a.evaluation.score-previous.evaluation.score:null,
    milk:{volumeML:a.environment?.milkML??null,startingTemperatureC:a.environment?.temperatureC??null},
    environmentChanged:comparable?JSON.stringify(previous.environment)!==JSON.stringify(a.environment):null};
  });
  return {model:e.model,mode:e.mode,seed:e.seed,attempts};
 });
}
