import { CoffeeSimulation, clamp, validateCommand } from './simulation.js';
import { createWorkstation } from './workstation.js';
import { runTrials, summarizeAttempt } from './attempts.js';

const $=selector=>document.querySelector(selector), $$=selector=>[...document.querySelectorAll(selector)];
const sim=new CoffeeSimulation();let world,controller='manual',generation=0,aborter=null,agentSteps=0,agentUsage=0,agentCost=0,costKnown=true,sound=false,audio;
let events=[],keys=new Set(),pendingMove={x:0,z:0},moveClock=0,uiClock=0,config={ready:false};
const storageKey='mubit-coffee-attempts-v1';
let attempts=[],activeAttempt=null,thinkingSince=0,activity='Idle',activityDetail='',storageAvailable=true;
try{const saved=JSON.parse(localStorage.getItem(storageKey)||'[]');if(Array.isArray(saved))attempts=saved.filter(a=>a?.id&&a.observation&&Array.isArray(a.models)&&Array.isArray(a.trace)).slice(-30);}catch{storageAvailable=false;}
const startTime=Date.now();
function record(action){events.push({timestamp:new Date().toISOString(),action,observation:sim.observe()});if(events.length>2000)events.shift();}
function execute(action,{manual=false}={}){
  if(manual&&controller!=='manual')takeControl();
  const command=validateCommand(action);sim.act(command);record(command);syncUI();
  if(sound&&command.command!=='move')beep(command.command==='pour'?380:650);
  return sim.observe();
}
function takeControl(){if(activeAttempt)finishAttempt({outcome:'Stopped',error:null});generation++;aborter?.abort();thinkingSince=0;world?.setPaused(false);controller='manual';sim.act({command:'stop'});keys.clear();pendingMove={x:0,z:0};syncUI();}
function resetCup(){sim.reset();events=[];agentSteps=0;agentUsage=0;agentCost=0;costKnown=true;$('#height').value=80;$('#tilt').value=48;}
function newCup(){takeControl();resetCup();syncUI();}
function syncUI(){
  $('#dose-value').textContent=`${Math.round(sim.grounds)} / 18 g`;$('#shot-value').textContent=`${Math.round(sim.espresso)} / 36 ml`;$('#temp-step').textContent=Math.round(sim.temperature)+'°C';$('#pour-step').textContent=Math.round(sim.inCup)+' ml';
  for(const [name,done,active] of [['grind',sim.grounds>=18,sim.grinding],['extract',sim.espresso>=36,sim.extracting],['steam',sim.temperature>=55&&!sim.scorched,sim.steaming],['pour',sim.inCup>=120,sim.pouring]]){const row=$(`[data-step="${name}"]`);row.classList.toggle('done',done);row.classList.toggle('active',active);row.querySelector('.step-check').textContent=done?'✓':{grind:'1',extract:'2',steam:'3',pour:'4'}[name];}
  $('#temperature-value').innerHTML=`${Math.round(sim.temperature)}<small>°C</small>`;$('#temperature-value').style.color=sim.scorched?'#b16e48':'';
  $('#volume-value').innerHTML=`${Math.round(sim.espresso+sim.inCup)} <small>ml</small>`;
  $('#height-value').textContent=Math.round(sim.effectiveHeight())+' mm'+(sim.effectiveHeight()>sim.controls.height+1?' · rim':'');$('#tilt-value').textContent=Math.round(sim.controls.tilt)+'°';
  $('#height').value=sim.controls.height;$('#tilt').value=sim.controls.tilt;$('#tilt-fill').style.width=sim.controls.tilt/85*100+'%';
  $('#cup-state').textContent=sim.served?'SERVED':sim.pouring?'POURING':sim.espresso>0?'READY':'EMPTY';
  $('#status-text').textContent=sim.scorched&&!sim.served?'Milk overheated. Start a new cup.':sim.status;
  $('#control-status').innerHTML=`<i></i>${controller==='manual'?'MANUAL':controller==='demo'?'LOCAL DEMO':'API AGENT'}`;
  $('#pickup-button strong').textContent=sim.held?'Put down':'Pick up';
  $$('[data-command]').forEach(b=>b.classList.toggle('active',({grind:sim.grinding,extract:sim.extracting,steam:sim.steaming,pickup:sim.held,serve:sim.served})[b.dataset.command]));
  $('#hold-pour').classList.toggle('active',sim.pouring);$('#aim-dot').style.opacity=sim.held?'1':'0';
  $('#aim-dot').style.left=(50+sim.controls.x*39)+'%';$('#aim-dot').style.top=(48+sim.controls.z*39)+'%';
  const secs=Math.floor(sim.time);$('#run-time').textContent=String(Math.floor(secs/60)).padStart(2,'0')+':'+String(secs%60).padStart(2,'0');$('#trace-count').textContent=events.length;
  $('#agent-button').classList.toggle('active',controller!=='manual');
  syncPractice();
}
function syncPractice(){
  const latest=activeAttempt||attempts.at(-1);
  $('#practice-state').textContent=activity.toUpperCase();
  $('#practice-state').classList.toggle('thinking',!!thinkingSince);
  $('#practice-title').textContent=activeAttempt?`Cup ${activeAttempt.number} · ${activeAttempt.index} of ${activeAttempt.total}`:attempts.length?`${attempts.length} saved attempt${attempts.length===1?'':'s'}`:'Ready for a fresh cup.';
  $('#practice-detail').textContent=thinkingSince?`Thinking · ${Math.floor((performance.now()-thinkingSince)/1000)}s · simulation paused`:activityDetail||'Start an agent to record an attempt.';
  $('#decision-progress').value=activeAttempt?agentSteps:latest?.calls||0;
  $('#practice-calls').textContent=`${activeAttempt?activeAttempt.requests:latest?.calls||0} / 32 calls`;
  $('#practice-tokens').textContent=`${(activeAttempt?agentUsage:latest?.tokens||0).toLocaleString()} tokens`;
  $('#practice-model').textContent=`Model · ${latest?.models?.at(-1)||latest?.requestedModel||'—'}`;
  $('#pause-practice').hidden=controller!=='api';$('#attempt-count').textContent=attempts.length;
}
function finishAttempt({outcome,error}){
  if(!activeAttempt)return;
  const attempt=summarizeAttempt({...activeAttempt,outcome,error,finishedAt:new Date().toISOString(),
    observation:sim.observe(),calls:activeAttempt.requests,responses:agentSteps,tokens:agentUsage,costUSD:costKnown&&activeAttempt.requests===agentSteps?agentCost:null,
    image:world?.capture(),trace:structuredClone(events)});
  attempts.push(attempt);attempts=attempts.slice(-30);activeAttempt=null;thinkingSince=0;
  activity=outcome;activityDetail=error||`${Math.round(attempt.volumeML)} ml in cup · ${attempt.spilledML.toFixed(1)} ml spilled${attempt.scorched?' · scorched milk':''}`;
  try{localStorage.setItem(storageKey,JSON.stringify(attempts));}catch{storageAvailable=false;}
  renderCupHistory();
}
function cupCard(attempt,label){
  const card=document.createElement('button');card.className='saved-cup';card.onclick=showHistory;
  const image=document.createElement('img');image.alt=`Cup ${attempt.number}: ${attempt.outcome}`;
  if(attempt.image?.startsWith('data:image/png;base64,'))image.src=attempt.image;
  const caption=document.createElement('span');caption.textContent=label||`#${attempt.number} · ${attempt.outcome}`;
  card.append(image,caption);return card;
}
function renderCupHistory(){$('#cup-history').replaceChildren(...attempts.slice(-3).map(a=>cupCard(a)));syncPractice();if($('#history-dialog').open)showHistory();}
function showHistory(){
  const completed=attempts.filter(a=>a.outcome==='Served');
  $('#history-summary').textContent=attempts.length?`${completed.length} of ${attempts.length} cups served · ${attempts.reduce((n,a)=>n+a.calls,0)} model calls. Compare the actual surfaces below.`:'No recorded attempts yet. Start a fresh API attempt to begin.';
  const pair=attempts.length>1?[attempts[0],attempts.at(-1)]:attempts;
  $('#comparison-cups').replaceChildren(...pair.map((a,i)=>cupCard(a,`${i===0?'First':'Latest'} · #${a.number} · ${Math.round(a.coverage*100)}% foam`)));
  $('#attempt-rows').replaceChildren(...attempts.toReversed().map(a=>{
    const row=document.createElement('tr');
    for(const text of [`#${a.number}`,a.error?`${a.outcome}: ${a.error}`:a.outcome,`${a.spilledML.toFixed(1)} ml`,`${Math.round(a.temperatureC)}°${a.scorched?' · scorched':''}`,a.calls,a.tokens,a.models.join(', ')||a.requestedModel]){const td=document.createElement('td');td.textContent=text;row.append(td);}return row;
  }));
  $('#storage-note').textContent=`${storageAvailable?'Last 30 attempts saved in this browser.':'Browser storage unavailable or full; export to keep these attempts.'} Foam coverage is not an art-quality score. Adapter status and training threshold are not available from the current integration.`;
  if(!$('#history-dialog').open)$('#history-dialog').showModal();
}
$('#history-button').onclick=showHistory;
$('#pause-practice').onclick=takeControl;
$('#export-attempts').onclick=()=>{
  const data={schema:'mubit-coffee-attempts/v1',adapterStatus:'unverified',trainingThreshold:null,attempts};
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='coffee-attempts.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
renderCupHistory();
$$('[data-command]').forEach(button=>button.onclick=()=>execute({command:button.dataset.command},{manual:true}));
$('#reset-button').onclick=newCup;
$('#height').oninput=e=>execute({command:'move',height:Number(e.target.value)},{manual:true});$('#tilt').oninput=e=>execute({command:'move',tilt:Number(e.target.value)},{manual:true});
$('#center-pitcher').onclick=()=>execute({command:'move',x:0,z:0},{manual:true});
const heldPour=$('#hold-pour');
heldPour.addEventListener('pointerdown',e=>{e.preventDefault();heldPour.setPointerCapture(e.pointerId);execute({command:'pour'},{manual:true});});
function releasePour(){if(controller==='manual'&&sim.pouring)execute({command:'stop'});}
heldPour.addEventListener('pointerup',releasePour);heldPour.addEventListener('pointercancel',releasePour);heldPour.addEventListener('lostpointercapture',releasePour);
// Keyboard and pointer input operate the same action API the AI uses.
function isEditing(){return ['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName);}
window.addEventListener('keydown',e=>{
  if($('dialog[open]')||isEditing())return;
  const key=e.key.toLowerCase();if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(key))e.preventDefault();
  if(e.repeat)return;
  if(['w','a','s','d','q','e','arrowup','arrowdown','arrowleft','arrowright'].includes(key)){if(controller!=='manual')takeControl();keys.add(key);}
  const map={'1':'grind','2':'extract','3':'steam','4':'pickup','5':'serve',' ':'pour'};
  if(map[key])execute({command:map[key]},{manual:true});
});
window.addEventListener('keyup',e=>{keys.delete(e.key.toLowerCase());if(e.key===' ')releasePour();});
window.addEventListener('blur',()=>{keys.clear();pendingMove={x:0,z:0};releasePour();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){keys.clear();pendingMove={x:0,z:0};releasePour();}});
for(const b of $$('[data-move]')){
  b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);if(controller!=='manual')takeControl();const[x,z]=b.dataset.move.split(',').map(Number);pendingMove={x,z};b.classList.add('pressed');execute({command:'move',x:clamp(sim.controls.x+x*.07,-1.4,1.4),z:clamp(sim.controls.z+z*.07,-1.4,1.4)});});
  const release=()=>{pendingMove={x:0,z:0};b.classList.remove('pressed');};b.addEventListener('pointerup',release);b.addEventListener('pointercancel',release);b.addEventListener('lostpointercapture',release);
}
const view=$('#surface-view');let aiming=false;
function aim(e){const r=view.getBoundingClientRect();const x=clamp(((e.clientX-r.left)/r.width-.5)/.406,-1.4,1.4),z=clamp(((e.clientY-r.top)/r.height-.484)/.406,-1.4,1.4);execute({command:'move',x,z},{manual:true});}
view.addEventListener('pointerdown',e=>{e.preventDefault();aiming=true;view.setPointerCapture(e.pointerId);aim(e);});view.addEventListener('pointermove',e=>{if(aiming)aim(e);});view.addEventListener('pointerup',()=>aiming=false);view.addEventListener('pointercancel',()=>aiming=false);
function update(dt){
  if(controller==='manual'&&!$('dialog[open]')){
    let x=pendingMove.x+(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0),z=pendingMove.z+(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0),h=(keys.has('e')?1:0)-(keys.has('q')?1:0);
    if(x||z||h){sim.controls.x=clamp(sim.controls.x+x*dt*.75,-1.4,1.4);sim.controls.z=clamp(sim.controls.z+z*dt*.75,-1.4,1.4);sim.controls.height=clamp(sim.controls.height+h*dt*65,10,220);moveClock+=dt;if(moveClock>.1){execute({command:'move',...sim.controls});moveClock=0;}}
  }
  uiClock+=dt;if(uiClock>.09){syncUI();uiClock=0;}
}
function beep(freq){try{audio ||= new(window.AudioContext||window.webkitAudioContext)();audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.type='sine';o.frequency.value=freq;g.gain.setValueAtTime(.03,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.12);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+.12);}catch{}}
$('#sound-button').onclick=()=>{sound=!sound;$('#sound-button').classList.toggle('active',sound);$('#sound-button').setAttribute('aria-label',sound?'Disable sound':'Enable sound');if(sound)beep(600);};
$('#camera-button').onclick=()=>world?.cycleCamera();$('#physics-button').onclick=()=>world?.dropSugar();
$$('.close-dialog').forEach(b=>b.onclick=()=>b.closest('dialog').close());
$$('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
$('#help-button').onclick=()=>{releasePour();$('#help-dialog').showModal();};
async function loadConfig(){try{const response=await fetch('/api/config');config=await response.json();$('#api-status').textContent=config.ready?`${config.models.mubit} / ${config.models.frontier}`:'Add MUBIT_BASE_URL, MUBIT_API_KEY and your model IDs to .env, then restart Bun.';$('#api-agent-button').disabled=!config.ready;$('#route-note').textContent=config.sharedGateway&&config.models.mubit===config.models.frontier?'Both routes currently use the same gateway and model. This is not yet an owned-model comparison.':'Route selection uses the configured model ID; adapter activation is unverified.';}catch{$('#api-status').textContent='Live agents need the local Bun server.';}}
$('#agent-button').onclick=()=>{releasePour();$('#agent-dialog').showModal();loadConfig();};$('#stop-agent').onclick=()=>{takeControl();$('#agent-dialog').close();sim.status='Manual control.';syncUI();};
function sleepUntil(seconds,run){const end=sim.time+seconds;return new Promise((resolve,reject)=>{function check(){if(run!==generation)return reject(new Error('Control returned to user.'));if(sim.time>=end)return resolve();setTimeout(check,30);}check();});}
async function localDemo(){
  newCup();controller='demo';const run=++generation;$('#agent-dialog').close();syncUI();
  try{
    execute({command:'grind'});await sleepUntil(2.2,run);execute({command:'extract'});await sleepUntil(4.3,run);
    execute({command:'steam'});await sleepUntil(5.3,run);execute({command:'steam'});execute({command:'pickup'});
    execute({command:'move',x:0,z:.16,height:145,tilt:70});execute({command:'pour'});await sleepUntil(5.2,run);
    execute({command:'move',height:12,tilt:58});
    const t0=sim.time;
    while(sim.time-t0<4.6){const t=sim.time-t0;execute({command:'move',x:Math.sin(t*16)*(.32-t*.032),z:.5-t*.196,height:12,tilt:58});await sleepUntil(.045,run);}
    for(let i=0;i<14;i++){execute({command:'move',x:0,z:-.4+i*.077,height:40,tilt:58});await sleepUntil(.06,run);}
    execute({command:'stop'});await sleepUntil(.5,run);execute({command:'serve'});
  }catch(error){if(run===generation)sim.status=error.message;}
  finally{if(run===generation){controller='manual';syncUI();}}
}
$('#demo-button').onclick=localDemo;
async function runAgent(){
  takeControl();controller='api';const run=++generation;const lane=$('#agent-route').value;
  const count=Number($('#attempt-limit').value);aborter=new AbortController();const signal=aborter.signal;$('#agent-dialog').close();
  await runTrials({
    count,reset:resetCup,observe:()=>sim.observe(),cancelled:()=>run!==generation,
    pause:value=>{if(run===generation)world?.setPaused(value);},
    act:action=>{if(run===generation)execute(action);},wait:seconds=>sleepUntil(seconds,run),
    onStart:(index,total)=>{
      activeAttempt={id:crypto.randomUUID(),number:(attempts.at(-1)?.number||0)+1,index,total,lane,
        requestedModel:config.models?.[lane]||'unknown',requests:0,models:[],decisions:[],startedAt:new Date().toISOString()};
      activity='Starting';activityDetail='Fresh cup · independent trial';syncUI();
    },
    decide:async step=>{
      activeAttempt.requests++;activity='Thinking';thinkingSince=performance.now();sim.status=`Waiting for model · decision ${step}/32`;syncUI();
      const response=await fetch('/api/step',{method:'POST',headers:{'Content-Type':'application/json'},signal,
        body:JSON.stringify({lane,observation:sim.observe(),history:events.slice(-10).map(e=>({action:e.action,observation:e.observation}))})});
      const result=await response.json();if(!response.ok)throw new Error(result.error||'Agent request failed.');
      return {...result,action:validateCommand(result.action),latencyMS:Math.round(performance.now()-thinkingSince)};
    },
    onDecision:result=>{
      thinkingSince=0;
      agentSteps++;agentUsage+=(result.usage?.input||0)+(result.usage?.output||0);if(result.cost==null)costKnown=false;else agentCost+=result.cost;
      if(result.model&&!activeAttempt.models.includes(result.model))activeAttempt.models.push(result.model);
      activeAttempt.decisions.push(result);activity='Acting';
      const a=result.action;activityDetail=`${a.command} · ${a.duration??.6}s${a.height!=null?' · '+a.height+' mm':''}`;syncUI();
    },
    onFinish:result=>{if(run===generation){finishAttempt(result);syncUI();}}
  });
  if(run===generation){world?.setPaused(false);thinkingSince=0;sim.pouring=false;sim.steaming=false;controller='manual';sim.status=activityDetail;syncUI();}
}
$('#api-agent-button').onclick=runAgent;
function showSession(){
  releasePour();$('#session-title').textContent=sim.served?'Cup served.':'Current cup.';
  const metrics=[`${Math.round(sim.espresso+sim.inCup)} ml in cup`,`${sim.spilled.toFixed(1)} ml spilled`,`${Math.round(sim.temperature)}°C milk`,`${Math.round(sim.surface.coverage()*100)}% foam coverage`,`${events.length} actions`];
  if(agentSteps)metrics.push(`${agentSteps} API calls`,`${agentUsage} reported tokens`,costKnown?`$${agentCost.toFixed(4)} reported`:'Cost not reported');
  $('#session-summary').replaceChildren(...metrics.map(text=>{const span=document.createElement('span');span.textContent=text;return span;}));
  $('#action-log').replaceChildren(...events.slice(-40).toReversed().map(e=>{const row=document.createElement('div');row.className='log-row';for(const text of [e.observation.time.toFixed(1)+'s',e.action.command,Math.round(e.observation.milkInCupML)+' ml milk']){const s=document.createElement('span');s.textContent=text;row.append(s);}return row;}));$('#session-dialog').showModal();
}
$('#session-button').onclick=showSession;
$('#export-button').onclick=()=>{const data={schema:'mubit-coffee-workstation/v2',createdAt:new Date(startTime).toISOString(),physics:'Rapier rigid bodies + ballistic droplets + 2D surface fluid approximation',observation:sim.observe(),actions:events,agent:{steps:agentSteps,tokens:agentUsage,costUSD:costKnown?agentCost:null}};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='coffee-workstation-trace.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
// Public computer-use bridge. This intentionally exposes observations and the same bounded
// control actions as the UI; it exposes no credentials or synthetic success scores.
window.coffeeWorkstation=Object.freeze({
  observe:()=>sim.observe(),
  async act(raw){
    const action=validateCommand(raw);execute(action,{manual:true});const run=generation;
    await sleepUntil(action.duration??.6,run);
    if(action.command==='pour')execute({command:'stop'});
    return sim.observe();
  },
  reset:newCup,capture:()=>world?.capture(),exportTrace:()=>structuredClone(events),
  actions:['grind','extract','steam','pickup','move','pour','stop','serve','reset'],
});
try{world=await createWorkstation($('#scene'),sim,command=>execute({command},{manual:true}));world.setUpdate(update);$('#loading').hidden=true;$('#physics-status').textContent='PHYSICS ACTIVE';$('#physics-led').classList.add('ready');syncUI();}
catch(error){$('#loading').textContent='The 3D workstation could not initialize. Reload in a browser with WebGL and WebAssembly enabled.';$('#physics-status').textContent='PHYSICS UNAVAILABLE';console.error(error);}
