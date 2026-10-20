import {GRID_SIZE} from './grid.js';
import { CoffeeSimulation, clamp, validateCommand } from './simulation.js';
import { createWorkstation } from './workstation.js';
import { runTrials, summarizeAttempt } from './attempts.js';
import { TASKS, BENCH_VERSION, EVALUATOR_VERSION, taskSpec, targetMask, evaluateCup, comparableRuns } from './benchmark.js';
import { mountIcons } from './icons.js';
import {runPlan,planContext,environmentFor,calibrationStatus} from './plans.js';
import calibration from '../tasks/calibration.json';
import { episodeConditions, NOMINAL_CONDITIONS } from './conditions.js';
import { feedbackFrom, benchmarkContext, PROMPT_VERSION } from './protocol.js';

const $=selector=>document.querySelector(selector), $$=selector=>[...document.querySelectorAll(selector)];
mountIcons();
const sim=new CoffeeSimulation(calibrationStatus().ready?episodeConditions():NOMINAL_CONDITIONS);let world,controller='manual',generation=0,aborter=null,agentSteps=0,agentUsage=0,agentCost=0,costKnown=true,sound=false,audio;
let events=[],keys=new Set(),pendingMove={x:0,z:0},moveClock=0,uiClock=0,config={ready:false};
let lastAgentInput=null,lastPlan=null,lastExperimentId=null;
let manualEpisode=1;
let selectedTask=taskSpec(),manualCupRecorded=false,scoreClock=0,episodeFinished=false;
const storageKey='latte-bench-attempts-v7';
let attempts=[],activeAttempt=null,thinkingSince=0,activity='Idle',activityDetail='',storageAvailable=true;
try{const saved=JSON.parse(localStorage.getItem(storageKey)||'[]');if(Array.isArray(saved))attempts=saved.filter(a=>a?.id&&a.observation&&Array.isArray(a.models)&&Array.isArray(a.trace)).slice(-30);}catch{storageAvailable=false;}
const startTime=Date.now();
function record(action){events.push({timestamp:new Date().toISOString(),action,observation:sim.observe()});if(events.length>2000)events.shift();}
function execute(action,{manual=false}={}){
  if(manual&&controller!=='manual')takeControl();
  if(manual){lastPlan=null;episodeFinished=false;world?.setPaused(false);}
  const command=validateCommand(action);sim.act(command);record(command);syncUI();
  if(sound&&command.command!=='move')beep(command.command==='pour'?380:650);
  if(manual&&command.command==='serve'&&sim.served&&!manualCupRecorded)saveNonAgentCup('human');
  return sim.observe();
}
function takeControl(){if(activeAttempt)finishAttempt({outcome:'Stopped',error:null});generation++;aborter?.abort();thinkingSince=0;episodeFinished=false;world?.cancelAdvance();world?.setPaused(false);controller='manual';sim.act({command:'stop'});keys.clear();pendingMove={x:0,z:0};syncUI();}
function resetCup(conditions=episodeConditions(selectedTask.seed,manualEpisode++,selectedTask.protocol==='holdout'?'holdout':'practice')){sim.reset(conditions);lastPlan=null;lastAgentInput=null;manualCupRecorded=false;episodeFinished=false;events=[];agentSteps=0;agentUsage=0;agentCost=0;costKnown=true;$('#height').value=80;$('#tilt').value=48;$('#score-value').textContent='—';}
function newCup(){takeControl();resetCup();syncUI();}
function drawTarget(){
  const canvas=$('#target-view'),ctx=canvas.getContext('2d'),n=GRID_SIZE,mask=targetMask(selectedTask,n);
  ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#ece7d8';ctx.beginPath();ctx.arc(80,80,74,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#725035';ctx.beginPath();ctx.arc(80,80,66,0,Math.PI*2);ctx.fill();
  ctx.save();ctx.translate(14,14);ctx.scale(132/n,132/n);ctx.fillStyle='#fff4d8';
  for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(mask[y*n+x])ctx.fillRect(x,y,1,1);ctx.restore();
}
function refreshTask(){
  const seed=Number($('#seed-input').value);try{
    const next=taskSpec($('#task-select').value,seed,$('#protocol-select').value);
    $('#seed-input').setCustomValidity('');selectedTask=next;manualEpisode=0;newCup();drawTarget();
    $('#task-difficulty').textContent=selectedTask.difficulty;updateCalibrationUI();syncUI();
  }catch(error){$('#seed-input').setCustomValidity(error.message);$('#seed-input').reportValidity();}
}
$('#task-select').onchange=refreshTask;
$('#seed-input').onchange=refreshTask;
$('#protocol-select').onchange=()=>{
  $('#protocol-description').textContent={independent:'Fresh context each episode. Establish the model’s baseline variability.',feedback:'Each episode receives up to three earlier results and action traces from this experiment. Measures adaptation using feedback in context.',holdout:'A separate seeded target transform, with fresh context and no prior feedback. Tests performance on a new target, not a weight update.'}[$('#protocol-select').value];refreshTask();
};
$('#criteria-button').onclick=()=>{
  $('#criteria-title').textContent=selectedTask.name;$('#task-description').textContent=selectedTask.instruction;
  const r=selectedTask.requirements;
  $('#criteria-list').replaceChildren(...[['Shape overlap',`≥ ${(r.minShapeIoU*100).toFixed(2)}% IoU`],['Penalized quality',`≥ ${(r.minShapeQuality*100).toFixed(2)}%`],['Boundary agreement',`≥ ${(r.minBoundaryF1*100).toFixed(2)}% F1 · 1 cell`],['Foam precision',`≥ ${Math.round((r.minShapePrecision??0)*100)}%`],['Cup volume',`${r.volumeML.join('–')} ml`],['Milk temperature',`${r.temperatureC.join('–')}°C`],['Spilled milk',`≤ ${r.maxSpillML} ml`],['Finish','Served · no scorched milk'],['Budget',`${selectedTask.limits.decisions} decisions · ${selectedTask.limits.simulationSeconds}s`]].map(([label,value])=>{const row=document.createElement('div');row.className='criteria-row';const span=document.createElement('span');span.textContent=label;const strong=document.createElement('strong');strong.textContent=value;row.append(span,strong);return row;}));
  $('#task-fingerprint').textContent=`${BENCH_VERSION} · ${selectedTask.id}@${selectedTask.version} · seed ${selectedTask.seed} · ${selectedTask.hash}`;
  $('#criteria-dialog').showModal();
};
function saveNonAgentCup(kind){
  manualCupRecorded=true;
  agentSteps=agentUsage=agentCost=0;costKnown=true;
  activeAttempt={id:crypto.randomUUID(),experimentId:crypto.randomUUID(),number:(attempts.at(-1)?.number||0)+1,index:1,total:1,
    task:structuredClone(selectedTask),protocol:kind,benchmark:BENCH_VERSION,requestedModel:kind,models:[kind],requests:0,decisions:[],startedAt:new Date().toISOString()};
  finishAttempt({outcome:'Served',error:null});episodeFinished=true;world?.setPaused(true);syncUI();
}
function instruction(){
  if(controller==='plan')return ['AI',activity,activityDetail];
  if(thinkingSince)return ['AI','Agent is thinking.',`Decision ${activeAttempt?.requests||1} of 32 · simulation time is paused.`];
  if(episodeFinished){if(activity==='Error')return ['!','Experiment stopped.',activityDetail];const last=attempts.at(-1);if(last?.outcome==='Rejected')return ['!','Plan rejected.',last.error];return [last?.evaluation?.passed?'✓':'!',last?.evaluation?.passed?'Task passed.':'Episode finished.',`${last?.evaluation?.score??0}% shape match · ${last?.evaluation?.failedChecks.join(', ')||'all checks passed'}. See Results.`];}
  if(sim.served)return ['✓','Cup complete.',`Shape match ${evaluateCup(selectedTask,sim.observe(),sim.surface.foam).score}%. Open Results for the full verdict.`];
  if(sim.scorched)return ['!','The milk is scorched.','Start a new cup. Stop steaming before 75°C.'];
  if(sim.grounds<18)return ['01',sim.grinding?'Grinding your dose…':'Grind your coffee.',sim.grinding?'Wait for 18 g, then press Extract.':'Press Grind to prepare an 18 g dose.'];
  if(sim.espresso<36)return ['02',sim.extracting?'Pulling the espresso…':'Extract the espresso.',sim.extracting?'Wait for the 36 ml shot.':'Press Extract to pull a 36 ml shot.'];
  if(sim.steaming)return ['03','Watch the milk temperature.','Press Steam again at 55–65°C to stop.'];
  if(sim.temperature<55&&sim.held)return ['03','Put the pitcher down to steam.','Press Pick up again to put it down, then heat the milk to 55–65°C.'];
  if(sim.temperature<55&&!sim.held)return ['03','Steam the milk.','Press Steam, then stop it at 55–65°C.'];
  if(!sim.held)return ['04','Pick up the pitcher.','Press Pick up. Aim on Your cup, then hold Pour.'];
  if(sim.espresso+sim.inCup<190)return ['04','Fill first. Draw second.','Pour high to fill. Lower the spout as the surface rises.'];
  return ['05',`Draw your ${selectedTask.name.toLowerCase()}.`,'Pour low and move gently. Press Serve & score when finished.'];
}
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
  const secs=Math.floor(sim.time);$('#run-time').textContent=String(Math.floor(secs/60)).padStart(2,'0')+':'+String(secs%60).padStart(2,'0');$('#trace-count').textContent=lastPlan?.trace.path.length??events.length;if(lastPlan)$('#score-value').textContent=lastPlan.evaluation.score+'%';
  $('#agent-button').classList.toggle('active',controller!=='manual');
  const [number,title,copy]=instruction();$('#instruction-number').textContent=number;$('#instruction-title').textContent=title;$('#instruction-copy').textContent=copy;
  syncPractice();
}
function syncPractice(){
  const latest=activeAttempt||attempts.at(-1);
  $('#practice-state').textContent=activity.toUpperCase();
  $('#practice-state').classList.toggle('thinking',!!thinkingSince);
  $('#practice-title').textContent=activeAttempt?`Cup ${activeAttempt.number} · ${activeAttempt.index} of ${activeAttempt.total}`:attempts.length?`${attempts.length} saved attempt${attempts.length===1?'':'s'}`:'Ready for a fresh cup.';
  $('#practice-detail').textContent=thinkingSince?`Thinking · ${Math.floor((performance.now()-thinkingSince)/1000)}s · simulation paused`:activityDetail||'Start an agent to record an attempt.';
  $('#decision-progress').max=latest?.planVersion?2:32;
  $('#decision-progress').value=activeAttempt?agentSteps:latest?.calls||0;
  $('#practice-calls').textContent=latest?.planVersion?`${latest.calls||0} model calls · plan + notes`:`${activeAttempt?activeAttempt.requests:latest?.calls||0} / 32 calls`;
  $('#practice-tokens').textContent=`${(activeAttempt?agentUsage:latest?.tokens||0).toLocaleString()} tokens`;
  $('#environment-info').textContent=`Milk batch ${sim.conditions.seed} · ${Math.round(sim.conditions.milkML)} ml initially · ${sim.conditions.temperatureC.toFixed(1)}°C initially`;
  $('#practice-model').textContent=`Model · ${latest?.models?.at(-1)||latest?.requestedModel||'—'}`;
  $('#pause-practice').hidden=!['api','plan'].includes(controller);$('#attempt-count').textContent=attempts.length;
}
function finishAttempt({outcome,error,episodeSeconds=sim.time}){
  if(!activeAttempt)return;
  const observation={...sim.observe(),episodeSeconds};
  const attempt=summarizeAttempt({...activeAttempt,outcome,error,finishedAt:new Date().toISOString(),
    observation,environment:{...sim.conditions},calls:activeAttempt.requests,responses:agentSteps,tokens:agentUsage,costUSD:costKnown&&activeAttempt.requests===agentSteps?agentCost:null,
    image:world?.capture(),trace:structuredClone(events),surface:Array.from(sim.surface.foam),surfaceSize:sim.surface.n,
    evaluation:evaluateCup(activeAttempt.task||selectedTask,observation,sim.surface.foam)});
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
  const scored=attempts.filter(a=>a.evaluation),passed=scored.filter(a=>a.evaluation.passed);
  $('#history-summary').textContent=attempts.length?`${passed.length} / ${scored.length} scored cups passed all checks · ${attempts.reduce((n,a)=>n+(a.calls||0),0)} API calls. Earlier unscored cups remain in the log.`:'No episodes yet. Try a manual pour or run an agent benchmark.';
  const latest=attempts.at(-1);
  // Plan-session identity also keeps rejected episodes on their original x-axis.
  const group=latest?.protocol?.startsWith('plan-')&&latest.experimentId
    ?attempts.filter(a=>a.experimentId===latest.experimentId&&a.spaceHash===latest.spaceHash&&a.requestedModel===latest.requestedModel)
    :comparableRuns(attempts).at(-1)||[];
  $('#learning-summary').replaceChildren();
  if(group.length>1){
    const label=a=>a.evaluation?`${a.evaluation.score}%`:a.outcome;
    const text=document.createElement('div');text.textContent=`${group.length} comparable ${group[0].protocol} episodes · ${label(group[0])} → ${label(group.at(-1))}. Circles: scored pours, including zero. Red X: rejected plan. Grey square: provider error. Observed change, not proof of learning.`;
    const plot=document.createElement('canvas');plot.width=620;plot.height=110;plot.style.cssText='width:100%;height:80px;display:block;margin-top:10px';plot.setAttribute('aria-label','Shape score by episode, 0 to 100 percent. Rejected plans are red X markers; valid zero scores are circles.');
    const c=plot.getContext('2d');c.strokeStyle='#c9d5bb';c.beginPath();c.moveTo(10,95);c.lineTo(610,95);c.stroke();c.strokeStyle='#6e8b58';c.lineWidth=2;c.beginPath();
    let connected=false;group.forEach((a,i)=>{if(!a.evaluation){connected=false;return;}const x=10+i/(group.length-1)*600,y=95-a.evaluation.score*.8;if(connected)c.lineTo(x,y);else c.moveTo(x,y);connected=true;});c.stroke();
    group.forEach((a,i)=>{const x=10+i/(group.length-1)*600;
      if(a.outcome==='Rejected'){c.strokeStyle='#b33d37';c.beginPath();c.moveTo(x-4,91);c.lineTo(x+4,99);c.moveTo(x-4,99);c.lineTo(x+4,91);c.stroke();}
      else if(!a.evaluation){c.fillStyle='#888';c.fillRect(x-3,92,6,6);}
      else {c.fillStyle='#587444';c.beginPath();c.arc(x,95-a.evaluation.score*.8,3,0,Math.PI*2);c.fill();}
    });
    $('#learning-summary').append(text,plot);
  }else $('#learning-summary').textContent='Plan comparisons keep the same parameter space, attempt budget and milk schedule. Compare no notes, raw past traces and agent-written notes. The CLI report separates held-out milk and held-out shapes and includes variance across seeds.';
  const pool=group.length?group:scored.length?scored:attempts,pair=pool.length>1?[pool[0],pool.at(-1)]:pool;
  $('#comparison-cups').replaceChildren(...pair.map((a,i)=>cupCard(a,`${i===0?'First':'Latest'} · #${a.number} · ${a.evaluation?`${a.evaluation.score}% match`:'unscored'}`)));
  $('#attempt-rows').replaceChildren(...attempts.toReversed().map(a=>{
    const row=document.createElement('tr');
    const verdict=(a.outcome==='Stopped'||a.error?a.outcome:a.evaluation?(a.evaluation.passed?'Pass':`Fail · ${a.evaluation.failedChecks.join(', ')}`):'Unscored')+(a.formatErrors?.length?` · ${a.formatErrors.length} format errors`: '');
    for(const text of [`#${a.number}`,a.task?`${a.task.name} · ${a.protocol}`:'Legacy',a.evaluation?`${a.evaluation.score}%`:'—',verdict,`${a.spilledML.toFixed(1)} ml`,a.calls,a.models.join(', ')||a.requestedModel]){const td=document.createElement('td');td.textContent=text;row.append(td);}return row;
  }));
  $('#storage-note').textContent=`${storageAvailable?'Last 30 episodes saved in this browser.':'Storage unavailable or full; export to keep these episodes.'} Shape IoU and serving constraints are provisional metrics. Three or five episodes are exploratory, not a statistically validated learning claim.`;
  if(!$('#history-dialog').open)$('#history-dialog').showModal();
}
$('#history-button').onclick=showHistory;
$('#pause-practice').onclick=takeControl;
$('#export-attempts').onclick=async()=>{
  if(lastExperimentId){const r=await fetch(`/api/experiments/${lastExperimentId}`);const report=await r.json();const u=URL.createObjectURL(new Blob([JSON.stringify(report)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download='latte-plan-experiment.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);return;}
  const data={schema:BENCH_VERSION,evaluator:EVALUATOR_VERSION,adapterStatus:'unverified',trainingThreshold:null,attempts};
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='latte-bench-results.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
renderCupHistory();
drawTarget();
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
  if(['w','a','s','d','q','e','arrowup','arrowdown','arrowleft','arrowright'].includes(key)){if(controller!=='manual'||episodeFinished)takeControl();keys.add(key);}
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
  scoreClock+=dt;if(scoreClock>.5){$('#score-value').textContent=sim.espresso?`${evaluateCup(selectedTask,sim.observe(),sim.surface.foam).score}%`:'—';scoreClock=0;}
}
function beep(freq){try{audio ||= new(window.AudioContext||window.webkitAudioContext)();audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.type='sine';o.frequency.value=freq;g.gain.setValueAtTime(.03,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.12);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+.12);}catch{}}
$('#sound-button').onclick=()=>{sound=!sound;$('#sound-button').classList.toggle('active',sound);$('#sound-button').setAttribute('aria-label',sound?'Disable sound':'Enable sound');if(sound)beep(600);};
$('#camera-button').onclick=()=>world?.cycleCamera();$('#physics-button').onclick=()=>world?.dropSugar();
$$('.close-dialog').forEach(b=>b.onclick=()=>b.closest('dialog').close());
$$('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
$('#help-button').onclick=()=>{releasePour();$('#help-dialog').showModal();};
function updateCalibrationUI(){
  const gate=calibrationStatus({taskId:selectedTask.id});
  $('#demo-button').disabled=!gate.ready;$('#api-agent-button').disabled=!config.ready||!gate.ready;
  $('#calibration-status').textContent=gate.ready?`Reference: ${(gate.referenceIoU*100).toFixed(1)}% IoU · ${(gate.referenceBoundaryF1*100).toFixed(1)}% boundary agreement`:gate.reason;
}
async function loadConfig(){try{const response=await fetch('/api/config');config=await response.json();$('#api-status').textContent=config.ready?`${config.models.mubit} / ${config.models.frontier}`:'Add MUBIT_BASE_URL, MUBIT_API_KEY and your model IDs to .env, then restart Bun.';$('#api-agent-button').disabled=!config.ready;$('#step-option').hidden=!config.stepMode;updateCalibrationUI();$('#route-note').textContent=config.sharedGateway&&config.models.mubit===config.models.frontier?'Both routes currently use the same gateway and model. This is not yet an owned-model comparison.':'Route selection uses the configured model ID; adapter activation is unverified.';}catch{$('#api-status').textContent='Live agents need the local Bun server.';}}
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
    execute({command:'stop'});await sleepUntil(.5,run);execute({command:'serve'});if(sim.served)saveNonAgentCup('scripted');
  }catch(error){if(run===generation)sim.status=error.message;}
  finally{if(run===generation){controller='manual';syncUI();}}
}
$('#demo-button').onclick=()=>{
  if(!calibrationStatus({taskId:selectedTask.id}).ready)return;
  newCup();world?.setPaused(true);selectedTask=taskSpec(selectedTask.id,42);$('#seed-input').value=42;drawTarget();
  const result=runPlan({plan:calibration.tasks[selectedTask.id].referencePlan,task:selectedTask,conditions:NOMINAL_CONDITIONS,sim});
  lastPlan=result;lastAgentInput=planContext({task:selectedTask,milk:NOMINAL_CONDITIONS,ablation:'no-notes'});
  attempts.push({...result,id:crypto.randomUUID(),number:(attempts.at(-1)?.number||0)+1,protocol:'reference',requests:0,calls:0,models:['calibrated reference'],requestedModel:'reference',tokens:0,costUSD:0,trace:[],planEvidence:result,spilledML:result.observation.spilledML,image:world?.capture()});
  episodeFinished=true;activity='Served';activityDetail=`Reference · ${result.evaluation.score}% shape quality`;$('#agent-dialog').close();renderCupHistory();syncUI();
};
async function runStepAgent(){
  try{selectedTask=taskSpec($('#task-select').value,Number($('#seed-input').value),$('#protocol-select').value);}
  catch(error){$('#seed-input').setCustomValidity(error.message);$('#seed-input').reportValidity();return;}
  drawTarget();
  takeControl();controller='api';const run=++generation;const lane=$('#agent-route').value;
  const experimentId=crypto.randomUUID(),runTask=structuredClone(selectedTask);
  let environmentIndex=0;
  const count=Number($('#attempt-limit').value);aborter=new AbortController();const signal=aborter.signal;$('#agent-dialog').close();
  await runTrials({
    count,maxSteps:runTask.limits.decisions,maxSimulationSeconds:runTask.limits.simulationSeconds,reset:()=>resetCup(episodeConditions(runTask.seed,environmentIndex++,runTask.protocol==='holdout'?'holdout':'practice')),observe:()=>sim.observe(),cancelled:()=>run!==generation,
    pause:value=>{if(run===generation)world?.setPaused(value);},
    act:action=>{if(run===generation)execute(action);},wait:seconds=>world.advance(seconds),
    onStart:(index,total)=>{
      activeAttempt={id:crypto.randomUUID(),experimentId,benchmark:BENCH_VERSION,promptVersion:PROMPT_VERSION,task:runTask,protocol:runTask.protocol,number:(attempts.at(-1)?.number||0)+1,index,total,lane,
        requestedModel:config.models?.[lane]||'unknown',requests:0,models:[],decisions:[],startedAt:new Date().toISOString()};
      activity='Starting';activityDetail=`Fresh cup · ${runTask.protocol}`;syncUI();
    },
    decide:async (step,budget)=>{
      activeAttempt.requests++;activity='Thinking';thinkingSince=performance.now();sim.status=`Waiting for model · decision ${step}/32`;syncUI();
      const body={lane,budget,taskId:runTask.id,seed:runTask.seed,protocol:runTask.protocol,
        feedback:runTask.protocol==='feedback'?feedbackFrom(attempts.filter(a=>a.experimentId===experimentId)):[],
        observation:sim.observe(),history:events.slice(-10).map(e=>({action:e.action,observation:e.observation}))};
      lastAgentInput={observation:body.observation,recentActions:body.history,...benchmarkContext(body)};
      const response=await fetch('/api/step',{method:'POST',headers:{'Content-Type':'application/json'},signal,body:JSON.stringify(body)});
      const result=await response.json();if(!response.ok)throw new Error(result.error||'Agent request failed.');
      if(result.taskHash!==runTask.hash)throw new Error('Task definition changed. Reload before continuing the benchmark.');
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
  if(run===generation){world?.setPaused(true);episodeFinished=true;thinkingSince=0;sim.pouring=false;sim.steaming=false;controller='manual';sim.status=activityDetail;syncUI();}
}
async function runPlanAgent(){
  if($('#step-comparison').checked&&config.stepMode)return runStepAgent();
  takeControl();controller='plan';world?.setPaused(true);const run=++generation;
  const settings={taskId:$('#task-select').value,targetSeed:42,seed:Number($('#seed-input').value),attempts:Number($('#attempt-limit').value),
    ablation:$('#ablation-select').value,lane:$('#agent-route').value,randomized:$('#randomize-milk').checked};
  selectedTask=taskSpec(settings.taskId,42);drawTarget();$('#agent-dialog').close();
  let notes='',past=[];
  const post=async(url,body)=>{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw new Error(data.error);return data;};
  try{
    const session=await post('/api/experiments',settings);lastExperimentId=session.id;
    for(let i=0;i<settings.attempts&&run===generation;i++){
      const milk=environmentFor(settings.seed,i,'practice',settings.randomized);resetCup(milk);world?.setPaused(true);lastPlan=null;
      lastAgentInput=planContext({task:selectedTask,milk,ablation:settings.ablation,notes,past});
      activity=`Attempt ${i+1} of ${settings.attempts}`;activityDetail='Planning → fixed execution → notes. No mid-pour intervention.';syncUI();
      const data=await post(`/api/experiments/${session.id}/attempt`,{}),a=data.attempt;
      past.push(a);notes=data.notes;
      if(run!==generation)break;
      if(a.plan){runPlan({plan:a.plan,task:a.task,conditions:a.environment,sim,evidence:false});lastPlan=a;}
      const saved={...a,id:crypto.randomUUID(),experimentId:session.id,index:i+1,total:settings.attempts,protocol:'plan-'+settings.ablation,
        number:(attempts.at(-1)?.number||0)+1,requestedModel:config.models?.[settings.lane]||'unknown',models:[...new Set(a.calls.map(c=>c.model).filter(Boolean))],
        providerCalls:a.calls,calls:a.calls.length,tokens:a.calls.reduce((n,c)=>n+(c.usage?.input||0)+(c.usage?.output||0),0),
        spilledML:a.observation?.spilledML??0,temperatureC:a.observation?.milkTemperatureC??milk.temperatureC,
        trace:[],planEvidence:a,image:a.plan?world?.capture():null,observation:a.observation??sim.observe()};
      attempts.push(saved);attempts=attempts.slice(-30);
      try{localStorage.setItem(storageKey,JSON.stringify(attempts.map(({planEvidence,...r})=>r)));}catch{storageAvailable=false;}
      activity=a.outcome;activityDetail=a.error||`${a.evaluation.score}% shape · ${a.evaluation.passed?'Pass':'Fail: '+a.evaluation.failedChecks.join(', ')}`;
      renderCupHistory();syncUI();
      await new Promise(resolve=>setTimeout(resolve,0));
    }
  }catch(error){activity='Error';activityDetail=error.message;}
  finally{if(run===generation){controller='manual';episodeFinished=true;world?.setPaused(true);syncUI();}}
}
$('#api-agent-button').onclick=runPlanAgent;
function showSession(){
  releasePour();
  $('#agent-input-label').textContent=lastAgentInput?'Last input sent to the agent':'Input preview · current state, fresh context';
  $('#agent-input-preview').textContent=JSON.stringify(lastAgentInput||{observation:sim.observe(),recentActions:[],...benchmarkContext({taskId:selectedTask.id,seed:selectedTask.seed,protocol:selectedTask.protocol})},null,2);
  $('#session-title').textContent=sim.served?'Cup served.':'Current cup.';
  const evaluation=evaluateCup(selectedTask,sim.observe(),sim.surface.foam);
  const metrics=[`${evaluation.score}% shape quality`,`${(evaluation.shapeIoU*100).toFixed(1)}% IoU · ${(evaluation.boundaryF1*100).toFixed(1)}% boundary`,evaluation.passed?'All checks passed':`Checks: ${evaluation.failedChecks.join(', ')}`,`${Math.round(sim.espresso+sim.inCup)} ml in cup`,`${sim.spilled.toFixed(1)} ml spilled`,`${Math.round(sim.temperature)}°C milk`,`${events.length} actions`];
  if(agentSteps)metrics.push(`${agentSteps} API calls`,`${agentUsage} reported tokens`,costKnown?`$${agentCost.toFixed(4)} reported`:'Cost not reported');
  $('#session-summary').replaceChildren(...metrics.map(text=>{const span=document.createElement('span');span.textContent=text;return span;}));
  $('#action-log').replaceChildren(...(lastPlan?lastPlan.trace.path.filter((_,i)=>i%60===0).map(p=>({action:{command:`x ${p[1].toFixed(2)}, z ${p[2].toFixed(2)}`},observation:{time:p[0],milkInCupML:p[7]}})):events).slice(-40).toReversed().map(e=>{const row=document.createElement('div');row.className='log-row';for(const text of [e.observation.time.toFixed(1)+'s',e.action.command,Math.round(e.observation.milkInCupML)+' ml milk']){const s=document.createElement('span');s.textContent=text;row.append(s);}return row;}));$('#session-dialog').showModal();
}
$('#session-button').onclick=showSession;
$('#export-button').onclick=()=>{
  if(lastPlan){const u=URL.createObjectURL(new Blob([JSON.stringify({schema:BENCH_VERSION,attempts:[lastPlan]})],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download='latte-plan-trace.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);return;}
  const observation=sim.observe();
  const data={schema:BENCH_VERSION,evaluator:EVALUATOR_VERSION,createdAt:new Date(startTime).toISOString(),
    attempts:[{number:'current',task:selectedTask,protocol:activeAttempt?.protocol||'manual',benchmark:BENCH_VERSION,environment:{...sim.conditions},observation,
      surface:Array.from(sim.surface.foam),surfaceSize:sim.surface.n,evaluation:evaluateCup(selectedTask,observation,sim.surface.foam),
      trace:events,agent:{steps:agentSteps,tokens:agentUsage,costUSD:costKnown?agentCost:null}}]};
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='latte-bench-episode.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
// Public computer-use bridge. This intentionally exposes observations and the same bounded
// control actions as the UI; it exposes no credentials or synthetic success scores.
window.coffeeWorkstation=Object.freeze({
  observe:()=>sim.observe(),
  async act(raw){
    const action=validateCommand(raw);
    if(action.command==='reset'){newCup();return sim.observe();}
    if(sim.served)return sim.observe();
    execute(action,{manual:true});const run=generation;
    await sleepUntil(action.duration??.6,run);
    if(action.command==='pour')execute({command:'stop'});
    return sim.observe();
  },
  reset:newCup,capture:()=>world?.capture(),exportTrace:()=>structuredClone(events),
  task:()=>structuredClone(selectedTask),evaluate:()=>evaluateCup(selectedTask,sim.observe(),sim.surface.foam),
  actions:['grind','extract','steam','pickup','move','pour','stop','serve','reset'],
});
try{world=await createWorkstation($('#scene'),sim,command=>execute({command},{manual:true}));world.setUpdate(update);$('#loading').hidden=true;$('#physics-status').textContent='STYLIZED SIMULATION';$('#physics-led').classList.add('ready');syncUI();}
catch(error){$('#loading').textContent='The 3D workstation could not initialize. Reload in a browser with WebGL and WebAssembly enabled.';$('#physics-status').textContent='PHYSICS UNAVAILABLE';console.error(error);}
