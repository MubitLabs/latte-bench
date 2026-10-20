import {mkdir} from 'node:fs/promises';
import {calibrationStatus,PLAN_SPACE,SPACE_HASH,PLAN_RESPONSE_FORMAT,NOTES_RESPONSE_FORMAT} from './src/plans.js';
import {createExperiment,attemptExperiment,experimentSummary} from './src/experiments.js';
import { completionURL } from './src/engine.js';
import { validateCommand } from './src/simulation.js';
import { join } from 'node:path';
import { watch } from 'node:fs';
import { benchmarkContext, PROMPT_VERSION } from './src/protocol.js';
// A fresh bundler process avoids stale module caches during repeated dev rebuilds.
const buildBrowser=async()=>{
  const job=Bun.spawn([process.execPath,'build','src/main.js','--outdir','.build','--minify'],{cwd:import.meta.dir,stdout:'ignore',stderr:'pipe'});
  const logs=await new Response(job.stderr).text();
  return {success:await job.exited===0,logs};
};
const build=await buildBrowser();if(!build.success){console.error(build.logs);process.exit(1);}
let compressedBundle=Bun.gzipSync(await Bun.file('./.build/main.js').arrayBuffer());
const root=import.meta.dir;let timer,buildQueue=Promise.resolve();
watch(join(root,'src'),()=>{
  clearTimeout(timer);
  timer=setTimeout(()=>{buildQueue=buildQueue.then(async()=>{
    const result=await buildBrowser();
    if(!result.success)console.error(result.logs);
    else compressedBundle=Bun.gzipSync(await Bun.file('./.build/main.js').arrayBuffer());
  }).catch(console.error);},100);
});
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const settings=()=>({mubit:{base:process.env.MUBIT_BASE_URL,key:process.env.MUBIT_API_KEY,model:process.env.MUBIT_MODEL},frontier:{base:process.env.FRONTIER_BASE_URL||process.env.MUBIT_BASE_URL,key:process.env.FRONTIER_API_KEY||process.env.MUBIT_API_KEY,model:process.env.FRONTIER_MODEL}});
const active=new Set(),experiments=new Map();
const calibrations=Object.fromEntries(['heart','tulip','rosetta'].map(taskId=>[taskId,calibrationStatus({replay:true,taskId})]));
const calibrated=calibrations.heart;
const stepMode=process.env.ENABLE_STEP_MODE==='1';
async function modelCall(lane,phase,input){
  const s=settings()[lane];
  if(!s?.base||!s.key||!s.model)throw new Error('Configure gateway credentials and model before running.');
  const extra=lane==='mubit'?JSON.parse(process.env.MUBIT_EXTRA_BODY||'{}'):{};
  if(!extra||typeof extra!=='object'||Array.isArray(extra))throw new Error('MUBIT_EXTRA_BODY must be an object.');
  const system=phase==='plan'
    ?'Plan then execute. Return ONLY {"parameters":[33 finite numbers in [0,1]]}. Use the supplied parameter schema exactly. The entire fixed plan executes with no observations or actions during execution. You see only the target, starting milk volume/temperature, and the explicitly supplied memory ablation. No extra trajectory controls or adaptive behavior are possible. Invalid plans get two format corrections before rejection; corrections do not run the simulator or consume extra attempts. Satisfy the supplied IoU, foam precision and one-cell boundary F1 and penalized shape quality thresholds, plus all serving constraints. Display score is 100 times max(0, min(IoU, boundary F1) − 0.25 × concavity mean density).'
    :'Review the completed attempt. Return ONLY {"notes":"..."}, at most 4000 characters. Write concise reusable notes for the next attempt: useful parameter values, observed outcomes, uncertain explanations and a concrete next experiment. Infer hidden milk behavior from results; do not claim access to latent coefficients. Replace your previous notes with this complete updated note.';
  const response=await fetch(completionURL(s.base),{method:'POST',signal:AbortSignal.timeout(45000),headers:{Authorization:`Bearer ${s.key}`,'Content-Type':'application/json'},body:JSON.stringify({...extra,model:s.model,temperature:.3,max_tokens:phase==='plan'?1000:1400,response_format:phase==='plan'?PLAN_RESPONSE_FORMAT:NOTES_RESPONSE_FORMAT,messages:[{role:'system',content:system},{role:'user',content:JSON.stringify(input)}]})});
  if(!response.ok)throw new Error(`Provider returned HTTP ${response.status}; this attempt remains counted.`);
  const r=await response.json(),text=r.choices?.[0]?.message?.content;
  if(typeof text!=='string')throw new Error('Provider did not return a text completion.');
  const number=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0?n:null;
  return {text,model:r.model||s.model,cost:number(r.usage?.cost),usage:{input:number(r.usage?.prompt_tokens),output:number(r.usage?.completion_tokens)}};
}
async function saveExperiment(e){await mkdir(join(root,'results/experiments'),{recursive:true});await Bun.write(join(root,'results/experiments',e.id+'.json'),JSON.stringify({...e,summary:experimentSummary(e)}));}

const instructions=`Follow the supplied benchmark task target and constraints. Shape score is 100 times min(fixed-orientation mask IoU, one-cell boundary F1); both and foam precision must meet the supplied thresholds. If previousEpisodes are supplied, use the measured failures and action traces to adapt your next attempt. The simulator pauses during model calls and executes exactly the requested duration; the rim limits effective height. You operate an interactive coffee workstation through the same controls as a human. Make one latte with visible surface art. Return ONLY a JSON object describing ONE action. Required field: command (a string from the commands below). Optional numeric fields: x, z, height, tilt, duration. Example: {"command":"grind","duration":2.2}. Always include duration when an action needs time to finish. Commands: grind (takes 2 seconds to reach 18g), extract (requires 18g; takes 4 seconds to pull 36ml), steam (toggles steam, heats milk by 8 Celsius per second; stop at 55-65C, burns above 75C), pickup (toggles holding pitcher; turns steam off), move, pour, stop, serve (requires espresso and at least 50ml milk), reset. Optional fields: x,z in [-1.4,1.4] (normalized cup radius; x horizontal, z forward), height in [10,220] millimetres, tilt in [0,85] degrees, duration in [0.05,5] seconds to run before observing. Every action may set these controls. Tilt below 25 produces no flow. The pitcher must be held before pouring. Pour high (100-180mm) to mix; low (10-30mm) leaves foam on the surface. Low pours and lateral motion push existing foam outward. Pour outside radius .94 and milk spills. Volume limit is 240ml. A pour action stops automatically after duration. Do not assume art or success: observe actual volume, temperature, spills and surfaceFoam (32 rows of density digits 0-9, top to bottom) before deciding. You have at most 32 actions. The observation is the current stylized simulation. Milk volume, temperature, flow, foam retention, spread and mixing vary each episode. Hidden physical coefficients are not provided: react to measured volume and foam after short pours. Nominal flow is sin((tilt-25)/60*pi/2)*32*sqrt(milkRemainingML/220) ml/s, with unknown batch variation. surfaceFoam uses 0 for no visible foam and 9 for dense foam; targetFoam uses 0/1 at 32x32, identical to the foam and scorer grid. Recent actions are paired with observations immediately after command dispatch, before its timed evolution; the top-level observation is after the latest action duration. Reset reuses the same batch and consumes the remaining budget. Use short pour actions with changing position to draw. No markdown or explanation.`;
const server=Bun.serve({hostname:'127.0.0.1',port:Number(process.env.PORT||3000),maxRequestBodySize:64000,idleTimeout:120,
  async fetch(req){const url=new URL(req.url);
    if(req.method==='GET'&&url.pathname==='/api/config'){const s=settings();return json({ready:calibrated.ready&&Object.values(s).every(x=>x.base&&x.key&&x.model),calibration:calibrated,calibrations,mode:'plan',stepMode,space:PLAN_SPACE,spaceHash:SPACE_HASH,models:{mubit:s.mubit.model||null,frontier:s.frontier.model||null},sharedGateway:s.mubit.base===s.frontier.base});}
    if(req.method==='POST'&&url.pathname==='/api/experiments'){
      if(req.headers.get('origin')!==url.origin)return json({error:'Same-origin requests only.'},403);
      try{const input=await req.json();
        const gate=calibrations[input.taskId||'heart'];if(!gate?.ready)return json({error:gate?.reason||'Unknown task.'},409);
        if(input.sourceId){const source=experiments.get(input.sourceId);if(!source)throw new Error('Unknown source experiment.');
          if(input.evaluationKind==='training')throw new Error('Source memory is only accepted in frozen evaluation.');
          if(input.evaluationKind==='heldout-shape'&&input.taskId===source.config.taskId)throw new Error('Held-out shape must differ from training.');
          if(input.evaluationKind==='heldout-milk'&&input.taskId!==source.config.taskId)throw new Error('Milk holdout must keep the training shape.');
          input.initialNotes=source.notes;input.initialPast=source.attempts;input.source={id:source.id,taskId:source.config.taskId,summary:experimentSummary(source)};
        }
        const e=createExperiment(input);experiments.set(e.id,e);await saveExperiment(e);return json({id:e.id,config:{...e.config,initialPast:undefined}});}
      catch(error){return json({error:error.message},400);}
    }
    const match=url.pathname.match(/^\/api\/experiments\/([0-9a-f-]+)(\/attempt)?$/);
    if(match){
      const e=experiments.get(match[1]);if(!e)return json({error:'Unknown experiment; restart begins a new session.'},404);
      if(req.method==='GET'&&!match[2])return json({...e,summary:experimentSummary(e)});
      if(req.method==='POST'&&match[2]){
        if(req.headers.get('origin')!==url.origin)return json({error:'Same-origin requests only.'},403);
        const gate=calibrations[e.config.taskId];if(!gate?.ready)return json({error:gate?.reason||'Uncalibrated task.'},409);
        if(active.has(e.id))return json({error:'An attempt is already running.'},409);
        if(e.attempts.length>=e.config.attempts)return json({error:'Attempt budget exhausted.'},409);
        active.add(e.id);
        try{const result=await attemptExperiment(e,(phase,input)=>modelCall(e.config.lane,phase,input));await saveExperiment(e);return json({attempt:result,summary:experimentSummary(e),notes:e.notes});}
        catch(error){return json({error:error.message},500);}finally{active.delete(e.id);}
      }
    }
    if(req.method==='POST'&&url.pathname==='/api/step'){
      if(!stepMode)return json({error:'Step-by-step comparison is disabled. Set ENABLE_STEP_MODE=1 to enable it.'},404);
      if(req.headers.get('origin')!==url.origin)return json({error:'Same-origin requests only.'},403);
      let body;try{const raw=await req.text();if(raw.length>64000)return json({error:'Request too large.'},413);body=JSON.parse(raw);}catch{return json({error:'Invalid JSON request.'},400);}
      const lane=body.lane;if(!['mubit','frontier'].includes(lane)||!body.observation||typeof body.observation!=='object'||!Array.isArray(body.history)||body.history.length>12)return json({error:'Invalid controller observation or history.'},400);
      let benchmark;try{benchmark=benchmarkContext(body);}catch(error){return json({error:error.message},400);}
      const gate=calibrations[body.taskId||'heart'];if(!gate?.ready)return json({error:gate?.reason||'Uncalibrated task.'},409);
      if(active.has(lane))return json({error:'An agent decision is already in progress.'},429);
      const s=settings()[lane];if(!s.base||!s.key||!s.model)return json({error:'Add your gateway credentials and model IDs to .env, then restart Bun.'},503);
      let extra={};try{if(lane==='mubit')extra=JSON.parse(process.env.MUBIT_EXTRA_BODY||'{}');if(!extra||Array.isArray(extra)||typeof extra!=='object')throw new Error();}catch{return json({error:'MUBIT_EXTRA_BODY must be a JSON object.'},500);}
      active.add(lane);
      try{
        const response=await fetch(completionURL(s.base),{method:'POST',signal:AbortSignal.timeout(45000),headers:{Authorization:`Bearer ${s.key}`,'Content-Type':'application/json'},body:JSON.stringify({...extra,model:s.model,temperature:.3,max_tokens:220,messages:[{role:'system',content:instructions},{role:'user',content:JSON.stringify({observation:body.observation,recentActions:body.history,...benchmark})}]})});
        if(!response.ok)return json({error:`Provider returned HTTP ${response.status}. Check the gateway URL, model and credentials.`},502);
        const result=await response.json(),content=result.choices?.[0]?.message?.content;
        if(typeof content!=='string')return json({error:'Expected an OpenAI-compatible text completion.'},502);
        const action=validateCommand(JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g,'').trim()));
        const number=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0?n:null;const usage=result.usage||{};
        return json({action,promptVersion:PROMPT_VERSION,taskHash:benchmark.task.hash,model:result.model||s.model,usage:{input:number(usage.prompt_tokens),output:number(usage.completion_tokens)},cost:number(usage.cost)});
      }catch(error){return json({error:error.name==='TimeoutError'?'Agent request timed out after 45 seconds.':'Provider returned an invalid workstation action.'},502);}finally{active.delete(lane);}
    }
    if(req.method==='GET'&&url.pathname==='/report'){const file=Bun.file(join(root,'results/report.html'));return new Response(await file.exists()?file:Bun.file(join(root,'docs/plan-baseline-report.html')),{headers:{'Content-Type':'text/html','Cache-Control':'no-store'}});}
    if(req.method==='GET'&&url.pathname==='/diagnosis')return Response.redirect(url.origin+'/diagnosis/',302);
    const diagnosticFiles=['report.html','summary.json','original.json','current.json','plan-sweep.json','agent-input.json','canonical-plan.json','original-best.png','original-trace.png','original-hold.png','current-hold.png','canonical.png','reference.png','reference-trace.png'];
    if(req.method==='GET'&&url.pathname.startsWith('/diagnosis/')){
      const name=url.pathname.slice('/diagnosis/'.length)||'report.html';
      if(diagnosticFiles.includes(name))return new Response(Bun.file(join(root,'docs/diagnosis',name)),{headers:{'Cache-Control':'no-store'}});
    }
    if(req.method==='GET'&&url.pathname.startsWith('/shape-audit/')){
      const name=url.pathname.slice('/shape-audit/'.length)||'report.html';
      if(['report.html','summary.json','headroom.json','heart-comparison.png','tulip-reference.png','rosetta-candidate.png','headroom.png'].includes(name))return new Response(Bun.file(join(root,'docs/shape-audit',name)),{headers:{'Cache-Control':'no-store'}});
    }
    if(req.method==='GET'&&url.pathname.startsWith('/heart-frozen-v3/')){
      const name=url.pathname.slice('/heart-frozen-v3/'.length)||'report.html';
      if(['report.html','summary.json','verification.json','visual-review.json','curves.png','scorer-check.png'].includes(name)||/^passes-\d+\.png$/.test(name)||/^pass-[a-zA-Z0-9_-]+-seed-\d+-attempt-\d+\.png$/.test(name))return new Response(Bun.file(join(root,'results/heart-frozen-v3/report',name)),{headers:{'Cache-Control':'no-store'}});
    }
    if(req.method==='GET'&&url.pathname.startsWith('/heart-pilot-v2/')){
      const name=url.pathname.slice('/heart-pilot-v2/'.length)||'report.html';
      const fixed=['report.html','summary.json','scorer-check.json','scorer-check.png','agent-input.json','optimizer.png','matched-scores.png','optimizer-best.png','passes.json','visual-review.json','verification.json','agent-seed-42.png','agent-seed-43.png','agent-seed-44.png'];
      if(fixed.includes(name)||/^pass-(?:optimizer|no-notes|notes)-seed-\d+-attempt-\d+\.png$/.test(name)||/^passes-\d+\.png$/.test(name))return new Response(Bun.file(join(root,'docs/heart-pilot-v2',name)),{headers:{'Cache-Control':'no-store'}});
    }
    if(req.method==='GET'&&url.pathname.startsWith('/heart-pilot/')){
      const name=url.pathname.slice('/heart-pilot/'.length)||'report.html';
      if(['report.html','summary.json','optimizer.png','optimizer-passes.png','agent-scores.png','agent-seed-42.png','agent-seed-43.png','agent-seed-44.png'].includes(name))return new Response(Bun.file(join(root,'docs/heart-pilot',name)),{headers:{'Cache-Control':'no-store'}});
    }
    const files={'/':'index.html','/index.html':'index.html','/src/style.css':'src/style.css','/src/main.js':'.build/main.js'};
    if(req.method==='GET'&&url.pathname==='/src/main.js'&&req.headers.get('accept-encoding')?.includes('gzip'))return new Response(compressedBundle,{headers:{'Content-Type':'application/javascript','Content-Encoding':'gzip','Vary':'Accept-Encoding','Cache-Control':'no-cache'}});
    if(req.method==='GET'&&files[url.pathname])return new Response(Bun.file(join(root,files[url.pathname])),{headers:{'Cache-Control':'no-cache'}});
    return new Response('Not found',{status:404});
  }
});console.log(`Coffee Workstation → ${server.url}`);
