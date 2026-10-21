// Offline merge only. Two separately reserved lanes sum to a hard $500 limit.
import {copyFile,mkdir,rename} from 'node:fs/promises';
const mainDir='results/heart-model-study',proDir='results/heart-model-study-pro';
const main=await Bun.file(mainDir+'/agents.json').json(),pro=await Bun.file(proDir+'/agents.json').json();
if(main.mergedAt)throw new Error('Already merged; refusing duplicate charges.');
for(const r of [main,pro])if(!r.finishedAt||r.ledger.entries.some(c=>c.status==='pending'))throw new Error('A lane is still running.');
if(main.ledger.capUSD!==100||pro.ledger.capUSD!==400)throw new Error('Unexpected lane allocations.');
for(const r of [main,pro])if(r.ledger.entries.reduce((s,c)=>s+(c.costUSD??c.reservedUSD),0)>r.ledger.capUSD+1e-9)throw new Error('Lane exceeded allocation.');
for(const imported of pro.importedProCalls){const original=main.ledger.entries.find(c=>c.number===imported.number);if(JSON.stringify(original)!==JSON.stringify(imported))throw new Error('Imported Pro call changed.');}
await copyFile(mainDir+'/agents.json',mainDir+'/original-lane.json');await copyFile(proDir+'/agents.json',mainDir+'/pro-lane.json');
const offset=main.ledger.entries.length;
for(const c of pro.ledger.entries){
 const number=c.number+offset,audit=`calls/${number}.json`;await copyFile(proDir+'/'+c.audit,mainDir+'/'+audit);
 main.ledger.entries.push({...c,number,audit,lane:'Pro',laneNumber:c.number,laneCommittedBeforeUSD:c.committedBeforeUSD,committedBeforeUSD:c.committedBeforeUSD+100});
}
for(const e of pro.experiments){
 for(const a of e.attempts){
  if(a.importedEvidence){delete a.importedEvidence;continue;}
  for(const c of a.calls??[])if(c.ledgerEntry)c.ledgerEntry+=offset;
  const full=await Bun.file(proDir+'/'+a.evidence).json();for(const c of full.calls??[])if(c.ledgerEntry)c.ledgerEntry+=offset;
  if(await Bun.file(mainDir+'/'+a.evidence).exists())throw new Error('Episode collision: '+a.evidence);
  await Bun.write(mainDir+'/'+a.evidence,JSON.stringify(full));
 }
 const at=main.experiments.findIndex(x=>x.model===e.model&&x.config.seed===e.config.seed&&x.config.ablation===e.config.ablation);main.experiments[at]=e;
}
delete main.unavailable['gpt-5.5-pro'];Object.assign(main.unavailable,pro.unavailable);
main.proIdentity=pro.proIdentity;main.budgetChanges=pro.budgetChanges;main.executionLanes={original:{capUSD:100,snapshot:'original-lane.json'},pro:{capUSD:400,snapshot:'pro-lane.json'},globalCapUSD:500};
main.ledger.capUSD=500;main.ledger.halted=main.ledger.halted||pro.ledger.halted;main.mergedAt=new Date().toISOString();main.finishedAt=main.mergedAt;
main.completed=main.experiments.filter(e=>!main.unavailable[e.model]).every(e=>e.attempts.length===5);
await Bun.write(mainDir+'/agents.merged.tmp',JSON.stringify(main));await rename(mainDir+'/agents.merged.tmp',mainDir+'/agents.json');
console.log(JSON.stringify({merged:true,calls:main.ledger.entries.length,completed:main.completed,costUpperUSD:main.ledger.entries.reduce((s,c)=>s+(c.costUSD??c.reservedUSD),0)}));
