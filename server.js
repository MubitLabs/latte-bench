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
const active=new Set();
const instructions=`Follow the supplied benchmark task target and constraints. Shape score is fixed-orientation foam-mask IoU, not coverage. If previousEpisodes are supplied, use the measured failures and action traces to adapt your next attempt. The simulator pauses during model calls and executes exactly the requested duration; the rim limits effective height. You operate an interactive coffee workstation through the same controls as a human. Make one latte with visible surface art. Return ONLY a JSON object describing ONE action. Required field: command (a string from the commands below). Optional numeric fields: x, z, height, tilt, duration. Example: {"command":"grind","duration":2.2}. Always include duration when an action needs time to finish. Commands: grind (takes 2 seconds to reach 18g), extract (requires 18g; takes 4 seconds to pull 36ml), steam (toggles steam, heats milk by 8 Celsius per second; stop at 55-65C, burns above 75C), pickup (toggles holding pitcher; turns steam off), move, pour, stop, serve (requires espresso and at least 50ml milk), reset. Optional fields: x,z in [-1.4,1.4] (normalized cup radius; x horizontal, z forward), height in [10,220] millimetres, tilt in [0,85] degrees, duration in [0.05,5] seconds to run before observing. Every action may set these controls. Tilt below 25 produces no flow. The pitcher must be held before pouring. Pour high (100-180mm) to mix; low (10-30mm) leaves foam on the surface. Low pours and lateral motion push existing foam outward. Pour outside radius .94 and milk spills. Volume limit is 240ml. A pour action stops automatically after duration. Do not assume art or success: observe actual volume, temperature, spills and surfaceFoam (10 rows of density digits 0-9, top to bottom) before deciding. You have at most 32 actions. The observation is the real current simulation, not a scripted score. Use short pour actions with changing position to draw. No markdown or explanation.`;
const server=Bun.serve({hostname:'127.0.0.1',port:Number(process.env.PORT||3000),maxRequestBodySize:64000,
  async fetch(req){const url=new URL(req.url);
    if(req.method==='GET'&&url.pathname==='/api/config'){const s=settings();return json({ready:Object.values(s).every(x=>x.base&&x.key&&x.model),models:{mubit:s.mubit.model||null,frontier:s.frontier.model||null},sharedGateway:s.mubit.base===s.frontier.base});}
    if(req.method==='POST'&&url.pathname==='/api/step'){
      if(req.headers.get('origin')!==url.origin)return json({error:'Same-origin requests only.'},403);
      let body;try{const raw=await req.text();if(raw.length>64000)return json({error:'Request too large.'},413);body=JSON.parse(raw);}catch{return json({error:'Invalid JSON request.'},400);}
      const lane=body.lane;if(!['mubit','frontier'].includes(lane)||!body.observation||typeof body.observation!=='object'||!Array.isArray(body.history)||body.history.length>12)return json({error:'Invalid controller observation or history.'},400);
      let benchmark;try{benchmark=benchmarkContext(body);}catch(error){return json({error:error.message},400);}
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
    const files={'/':'index.html','/index.html':'index.html','/src/style.css':'src/style.css','/src/main.js':'.build/main.js'};
    if(req.method==='GET'&&url.pathname==='/src/main.js'&&req.headers.get('accept-encoding')?.includes('gzip'))return new Response(compressedBundle,{headers:{'Content-Type':'application/javascript','Content-Encoding':'gzip','Vary':'Accept-Encoding','Cache-Control':'no-cache'}});
    if(req.method==='GET'&&files[url.pathname])return new Response(Bun.file(join(root,files[url.pathname])),{headers:{'Cache-Control':'no-cache'}});
    return new Response('Not found',{status:404});
  }
});console.log(`Coffee Workstation → ${server.url}`);
