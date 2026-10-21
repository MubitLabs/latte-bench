import {PLAN_RESPONSE_FORMAT,NOTES_RESPONSE_FORMAT} from '../src/plans.js';
import {prompts} from './study-prompts.js';
export function providerSchema(phase,api){
 const f=structuredClone(phase==='plan'?PLAN_RESPONSE_FORMAT:NOTES_RESPONSE_FORMAT);
 if(api==='anthropic'){
  if(phase==='plan')f.json_schema.schema.properties.parameters={type:'array',description:'Exactly 33 finite numbers. Each must be between 0 and 1 inclusive. Validated client-side.',items:{type:'number'}};
  else f.json_schema.schema.properties.notes={type:'string',description:'At most 1600 characters as requested by the prompt; 4000 character hard validation limit.'};
 }
 return f;
}
export function requestBody(model,phase,input,maxTokens){
 const messages=[{role:'system',content:prompts[phase]},{role:'user',content:JSON.stringify(input)}],format=providerSchema(phase,model.api),effort=model.effort[phase];
 let body;
 if(model.api==='anthropic')body={model:model.id,max_tokens:maxTokens,system:messages[0].content,messages:messages.slice(1),thinking:{type:'adaptive'},output_config:{effort,format:{type:'json_schema',schema:format.json_schema.schema}}};
 else if(model.api==='responses')body={model:model.id,store:false,service_tier:'default',input:messages,max_output_tokens:maxTokens,reasoning:{effort},text:{format:{type:'json_schema',...format.json_schema}}};
 else body={model:model.id,store:false,service_tier:'default',messages,max_completion_tokens:maxTokens,response_format:format,...(effort?{reasoning_effort:effort}:{})};
 return {body,messages,format};
}
export function endpoint(base,api){
 const root=base.replace(/\/+$/,'').replace(/\/chat\/completions$/,'');
 return api==='anthropic'?new URL('/anthropic/v1/messages',base).href:root+(root.endsWith('/v1')?'':'/v1')+(api==='responses'?'/responses':'/chat/completions');
}
export function normalizeResponse(api,r){
 let input,output,text;
 if(api==='anthropic'){
  const u=r.usage;input=u?.input_tokens;output=u?.output_tokens;
  if(Number.isInteger(input))input+=(u.cache_creation_input_tokens??0)+(u.cache_read_input_tokens??0);
  text=r.content?.filter(x=>x.type==='text').map(x=>x.text).join('');
 }else if(api==='responses'){
  input=r.usage?.input_tokens;output=r.usage?.output_tokens;
  text=r.output?.flatMap(x=>x.content??[]).filter(x=>x.type==='output_text').map(x=>x.text).join('');
 }else {input=r.usage?.prompt_tokens;output=r.usage?.completion_tokens;text=r.choices?.[0]?.message?.content;}
 if(![input,output].every(n=>Number.isInteger(n)&&n>=0))throw new Error('Missing or invalid billed token usage');
 return {text:typeof text==='string'?text:'',model:r.model,usage:{prompt_tokens:input,completion_tokens:output}};
}
