import {parseArgs} from 'node:util';
import {mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {CoffeeSimulation} from '../src/simulation.js';
import {taskSpec,evaluateCup,BENCH_VERSION,EVALUATOR_VERSION} from '../src/benchmark.js';
import {feedbackFrom,PROMPT_VERSION} from '../src/protocol.js';
import {runTrials,summarizeAttempt} from '../src/attempts.js';
const {values}=parseArgs({args:Bun.argv.slice(2),options:{task:{type:'string',default:'heart'},episodes:{type:'string',default:'1'},mode:{type:'string',default:'independent'},seed:{type:'string',default:'42'},route:{type:'string',default:'mubit'},server:{type:'string',default:'http://127.0.0.1:3000'},output:{type:'string',default:'results/latest.json'},live:{type:'boolean',default:false},help:{type:'boolean',default:false}}});
if(values.help){console.log('bun run bench --task heart|tulip|rosetta --episodes 1..20 --mode independent|feedback|holdout --seed 42 --output results/run.json [--live --route mubit|frontier --server http://127.0.0.1:3000]\nDefault: a scripted physical baseline, no API calls. --live uses the configured local Bun server (up to 32 billed requests per episode).');process.exit(0);}
const task=taskSpec(values.task,Number(values.seed),values.mode),count=Number(values.episodes);
if(!Number.isInteger(count)||count<1||count>20)throw new Error('Episodes must be 1–20.');
if(!['mubit','frontier'].includes(values.route))throw new Error('Unknown route.');
const base=new URL(values.server);if(!['http:','https:'].includes(base.protocol))throw new Error('Expected HTTP server URL.');
const sim=new CoffeeSimulation(),attempts=[],experimentId=crypto.randomUUID();let active,cancelled=false;
const aborter=new AbortController();process.on('SIGINT',()=>{cancelled=true;aborter.abort();});
const sequence=[{command:'grind',duration:2.2},{command:'extract',duration:4.2},{command:'steam',duration:5},{command:'stop',duration:.1},{command:'pickup',duration:.1},{command:'pour',height:145,tilt:75,duration:5},{command:'pour',height:12,tilt:65,duration:5},{command:'serve',duration:.6}];
await runTrials({count,reset:()=>sim.reset(),observe:()=>sim.observe(),cancelled:()=>cancelled,pause:()=>{},
  onStart(index,total){active={id:crypto.randomUUID(),experimentId,number:index,index,total,task,protocol:values.live?values.mode:'scripted',benchmark:BENCH_VERSION,promptVersion:values.live?PROMPT_VERSION:null,lane:values.route,requestedModel:values.live?values.route:'scripted',models:[],requests:0,calls:0,tokens:0,costUSD:0,decisions:[],trace:[],startedAt:new Date().toISOString()};},
  async decide(step){
    if(!values.live)return {action:sequence[step-1]||{command:'serve',duration:.6},model:'scripted',usage:{input:0,output:0},cost:0};
    active.requests++;const started=performance.now();
    const response=await fetch(new URL('/api/step',base),{method:'POST',signal:aborter.signal,headers:{'Content-Type':'application/json',Origin:base.origin},body:JSON.stringify({lane:values.route,taskId:task.id,seed:task.seed,protocol:values.mode,feedback:values.mode==='feedback'?feedbackFrom(attempts):[],observation:sim.observe(),history:active.trace.slice(-10).map(({action,observation})=>({action,observation}))})});
    const result=await response.json();if(!response.ok)throw new Error(result.error||'Agent request failed.');
    if(result.taskHash!==task.hash)throw new Error('Server and CLI task definitions differ.');
    return {...result,latencyMS:Math.round(performance.now()-started)};
  },
  onDecision(result){active.decisions.push(result);if(!active.models.includes(result.model))active.models.push(result.model);active.tokens+=(result.usage?.input||0)+(result.usage?.output||0);active.costUSD=result.cost==null||active.costUSD==null?null:active.costUSD+result.cost;},
  act(action){sim.act(action);active.trace.push({action,observation:sim.observe()});},
  async wait(seconds){for(let t=0;t<seconds-1e-9;){const dt=Math.min(1/60,seconds-t);sim.step(dt);t+=dt;}},
  onFinish({outcome,error,episodeSeconds}){
    const observation={...sim.observe(),episodeSeconds},evaluation=evaluateCup(task,observation,sim.surface.foam);
    const attempt=summarizeAttempt({...active,observation,surface:Array.from(sim.surface.foam),surfaceSize:sim.surface.n,evaluation,outcome,error,calls:active.requests,responses:values.live?active.decisions.length:0,finishedAt:new Date().toISOString()});
    if(active.requests>active.decisions.length)attempt.costUSD=null;
    attempts.push(attempt);console.log(`Episode ${attempt.number}: ${outcome}; shape ${evaluation.score}%; ${evaluation.passed?'PASS':'FAIL: '+evaluation.failedChecks.join(', ')}; ${attempt.calls} API calls`);
  }
});
await mkdir(dirname(values.output),{recursive:true});await Bun.write(values.output,JSON.stringify({schema:BENCH_VERSION,evaluator:EVALUATOR_VERSION,adapterStatus:'unverified',attempts},null,2));
console.log(`Saved ${attempts.length} episode(s) to ${values.output}`);
if(attempts.some(a=>a.outcome==='Error'))process.exitCode=1;
