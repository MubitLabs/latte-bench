import {test,expect,beforeAll,afterAll} from 'bun:test';
let mock,child,base,requests=[];
beforeAll(async()=>{
  mock=Bun.serve({hostname:'127.0.0.1',port:0,async fetch(req){const body=await req.json();requests.push(body);const plan=body.messages[0].content.startsWith('Plan then execute'),notes=body.messages[0].content.startsWith('Review the completed');return Response.json({model:body.model,choices:[{message:{content:JSON.stringify(plan?{parameters:Array(33).fill(.5)}:notes?{notes:'A note from the mock model.'}:{command:'pour',x:.2,z:0,height:20,tilt:65,duration:1})}}],usage:{prompt_tokens:120,completion_tokens:32,cost:.02}});}});
  child=Bun.spawn([process.execPath,'server.js'],{cwd:import.meta.dir+'/..',env:{...process.env,PORT:'0',ENABLE_STEP_MODE:'1',MUBIT_BASE_URL:String(mock.url)+'v1',MUBIT_API_KEY:'mock-key-never-send',MUBIT_MODEL:'mock-owned',FRONTIER_MODEL:'mock-frontier',FRONTIER_BASE_URL:'',FRONTIER_API_KEY:'',MUBIT_EXTRA_BODY:'{"route":"mock-route"}'},stdout:'pipe',stderr:'pipe'});
  const data=await child.stdout.getReader().read();base=new TextDecoder().decode(data.value).match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];if(!base)throw new Error('Test server failed to start');
},10000);
afterAll(()=>{child?.kill();mock?.stop(true);});
const post=(body,origin=base)=>fetch(base+'/api/step',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)});
test('configuration exposes model IDs but no credentials',async()=>{const text=await(await fetch(base+'/api/config')).text();expect(text).not.toContain('mock-key-never-send');expect(JSON.parse(text)).toMatchObject({ready:true});});
test('environment files and retired preset-pour endpoint are not served',async()=>{expect((await fetch(base+'/.env')).status).toBe(404);expect((await fetch(base+'/api/pour')).status).toBe(404);});
test('cross-origin requests cannot trigger model calls',async()=>{const before=requests.length;expect((await post({lane:'mubit',observation:{},history:[]},'https://untrusted.example')).status).toBe(403);expect(requests.length).toBe(before);});
test('agent receives actual observations and returns a validated timed action',async()=>{
  const response=await post({lane:'mubit',observation:{espressoML:36,milkTemperatureC:60,held:true},history:[]});expect(response.status).toBe(200);expect(await response.json()).toMatchObject({action:{command:'pour',x:.2,z:0,height:20,tilt:65,duration:1},cost:.02,usage:{input:120,output:32}});
  expect(requests.at(-1).route).toBe('mock-route');expect(JSON.parse(requests.at(-1).messages[1].content).observation.espressoML).toBe(36);
});
test('frontier route has its own model and omits Mubit routing fields',async()=>{expect((await post({lane:'frontier',observation:{},history:[]})).status).toBe(200);expect(requests.at(-1).model).toBe('mock-frontier');expect(requests.at(-1).route).toBeUndefined();});
test('benchmark task and feedback reach the model while held-out requests reject feedback',async()=>{
  const feedback=[{score:12,failedChecks:['shape'],actions:[{command:'grind',duration:2}]}];
  const response=await post({lane:'mubit',observation:{},history:[],taskId:'heart',seed:7,protocol:'feedback',feedback});
  expect(response.status).toBe(200);expect((await response.json()).promptVersion).toBe('latte-controller/3');
  const prompt=JSON.parse(requests.at(-1).messages[1].content);
  expect(prompt.task.id).toBe('heart');expect(prompt.task.targetFoam).toHaveLength(32);expect(prompt.previousEpisodes).toEqual(feedback);
  const before=requests.length;
  expect((await post({lane:'mubit',observation:{},history:[],protocol:'holdout',feedback})).status).toBe(400);
  expect(requests.length).toBe(before);
});

test('plan endpoint runs a full attempt then reflects, with no mid-pour model calls',async()=>{
  const created=await fetch(base+'/api/experiments',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({attempts:1,randomized:false,ablation:'notes'})});
  expect(created.status).toBe(200);const {id}=await created.json(),before=requests.length;
  const response=await fetch(base+`/api/experiments/${id}/attempt`,{method:'POST',headers:{Origin:base}});
  expect(response.status).toBe(200);const result=await response.json();
  expect(requests.length-before).toBe(2);expect(result.attempt.plan.parameters).toHaveLength(33);
  expect(result.attempt.trace.path.length).toBeGreaterThan(100);expect(result.notes).toBe('A note from the mock model.');
  const input=JSON.parse(requests[before].messages[1].content);
  expect(Object.keys(input.milk)).toEqual(['volumeML','startingTemperatureC']);expect(input.observation).toBeUndefined();
  expect(requests[before].response_format).toMatchObject({type:'json_schema',json_schema:{strict:true}});
  expect((await fetch(base+`/api/experiments/${id}/attempt`,{method:'POST',headers:{Origin:base}})).status).toBe(409);
});

test('uncalibrated rosetta blocks both plan and legacy endpoints before any provider request',async()=>{
 const before=requests.length;
 const r=await fetch(base+'/api/experiments',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({taskId:'rosetta'})});
 expect(r.status).toBe(409);expect((await r.json()).error).toContain('heart-only pilot');
 expect((await post({taskId:'rosetta',lane:'mubit',observation:{},history:[]})).status).toBe(409);
 expect(requests.length).toBe(before);
 const config=await(await fetch(base+'/api/config')).json();
 expect(config.calibrations.heart.ready).toBe(true);expect(config.calibrations.tulip.ready).toBe(false);expect(config.calibrations.rosetta.ready).toBe(false);
});
