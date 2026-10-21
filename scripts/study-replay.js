// Public, offline reproduction of every published plan. Never calls a provider.
import {runPlan,environmentFor,SPACE_HASH} from '../src/plans.js';
import {taskSpec} from '../src/benchmark.js';
const data=await Bun.file('docs/model-study/evidence.json').json();let count=0,passes=0;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
for(const e of data.experiments)for(const a of e.attempts){
 if(!a.plan||!a.evaluation)continue;
 if(!same(a.environment,environmentFor(e.seed,a.number-1)))throw new Error('Milk schedule mismatch');
 const replay=runPlan({plan:a.plan,task:taskSpec('heart',42),conditions:a.environment,evidence:false});
 if(!same(replay.surface,a.surface)||!same(replay.evaluation,a.evaluation))throw new Error(`Replay mismatch: ${e.model}/${e.mode}/${e.seed}/${a.number}`);
 count++;passes+=a.evaluation.passed;
}
console.log(JSON.stringify({replayed:count,passes,spaceHash:SPACE_HASH,noProviderCalls:true}));
