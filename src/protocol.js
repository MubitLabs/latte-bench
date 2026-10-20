import {taskSpec,taskForAgent} from './benchmark.js';
import {validateCommand} from './simulation.js';
export const PROMPT_VERSION='latte-controller/2';
export function benchmarkContext(body){
  const spec=taskSpec(body.taskId??'heart',body.seed??42,body.protocol??'independent');
  const feedback=body.feedback??[];
  if(!Array.isArray(feedback)||feedback.length>3)throw new Error('Feedback must contain at most three episodes.');
  if(feedback.length&&spec.protocol!=='feedback')throw new Error('Feedback is only allowed in feedback practice.');
  const previous=feedback.map(item=>{
    if(!item||typeof item.score!=='number'||!Number.isFinite(item.score)||item.score<0||item.score>100||!Array.isArray(item.failedChecks)||item.failedChecks.length>8||!Array.isArray(item.actions)||item.actions.length>32)throw new Error('Invalid episode feedback.');
    const names=['shape','served','volume','temperature','spill','unscorched','time'];
    if(item.failedChecks.some(x=>!names.includes(x)))throw new Error('Invalid feedback check.');
    return {score:item.score,failedChecks:item.failedChecks,actions:item.actions.map(validateCommand)};
  });
  return {task:taskForAgent(spec),protocol:spec.protocol,previousEpisodes:previous};
}
export function feedbackFrom(attempts){return attempts.slice(-3).map(a=>({score:a.evaluation.score,failedChecks:a.evaluation.failedChecks,actions:a.decisions.slice(0,32).map(d=>d.action)}));}
