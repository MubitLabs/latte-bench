import distribution from '../tasks/environment.json';

export const ENVIRONMENT_VERSION=distribution.version;
export const ENVIRONMENT_DISTRIBUTION=Object.freeze(distribution);
export function random(seed){
  let a=seed>>>0;
  return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
}
// Resetting within an episode reuses its conditions. Independent and feedback
// experiments use the same schedule; holdout has a disjoint seed namespace.
export function episodeConditions(seed=42,index=0,split='practice'){
  if(!Number.isInteger(seed)||seed<0||seed>0xffffffff||!Number.isInteger(index)||index<0||index>=1000000)throw new Error('Invalid environment seed or episode index.');
  if(!['practice','holdout'].includes(split))throw new Error('Invalid environment split.');
  const environmentSeed=((seed&0x7fffffff)+Math.imul(index,104729))&0x7fffffff;
  const fullSeed=(environmentSeed|(split==='holdout'?0x80000000:0))>>>0;
  const rng=random(fullSeed),sample=key=>{const [lo,hi]=distribution[key];return lo+(hi-lo)*rng();};
  return {version:ENVIRONMENT_VERSION,seed:fullSeed,index,split,milkML:sample('milkML'),temperatureC:sample('temperatureC'),
    pitcherX:sample('pitcherOffset'),pitcherZ:sample('pitcherOffset'),
    ...Object.fromEntries(['flowMultiplier','spreadMultiplier','foamRetention','velocityDamping','foamMixing','textureAmplitude','flowPulse','initialSwirl'].map(k=>[k,sample(k)])),
    texturePhase:rng()*Math.PI*2};
}
export const NOMINAL_CONDITIONS=Object.freeze({version:'nominal/1',milkML:220,temperatureC:18,pitcherX:0,pitcherZ:0,
  flowMultiplier:1,spreadMultiplier:1,foamRetention:1,velocityDamping:.965,foamMixing:.002,textureAmplitude:0,flowPulse:0,initialSwirl:0,texturePhase:0});
