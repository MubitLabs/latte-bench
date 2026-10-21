import {test,expect} from 'bun:test';
import {requestBody,normalizeResponse,endpoint} from '../scripts/study-provider.js';
import {reserveCost} from '../src/pilot-budget.js';
import {reserveDispatch} from '../src/concurrent-budget.js';
import protocol from '../experiments/heart-model-study.json';
import {validatePlan} from '../src/plans.js';
test('all providers receive fresh payloads with structured output and bounded tokens',()=>{
 for(const m of protocol.models)for(const phase of ['plan','notes']){
  const {body,messages,format}=requestBody(m,phase,{target:'heart',milk:{volume:240}},protocol.maxTokens[phase]);
  expect(messages.length).toBe(2);expect(body.model).toBe(m.id);expect(JSON.stringify(body)).not.toContain('previous_response_id');
  expect(format.json_schema.schema.additionalProperties).toBe(false);
  if(m.api==='anthropic'){expect(body.output_config.format.type).toBe('json_schema');expect(JSON.stringify(body.output_config.format.schema)).not.toContain('minItems');}
  else expect(body.store).toBe(false);
 }
 expect(()=>validatePlan({parameters:Array(33).fill(1.01)})).toThrow();
});
test('native usage includes cache creation and cache reads; missing usage fails closed',()=>{
 expect(normalizeResponse('anthropic',{model:'claude',usage:{input_tokens:100,cache_creation_input_tokens:200,cache_read_input_tokens:300,output_tokens:50},content:[{type:'thinking',thinking:'private'},{type:'text',text:'{}'}]})).toEqual({model:'claude',usage:{prompt_tokens:600,completion_tokens:50},text:'{}'});
 expect(normalizeResponse('responses',{usage:{input_tokens:12,output_tokens:15},output:[{type:'reasoning'},{content:[{type:'output_text',text:'{}'}]}]}).usage.completion_tokens).toBe(15);
 expect(()=>normalizeResponse('chat',{})).toThrow();
});
test('pending and failed reservations cannot overspend shared cap',()=>{
 const ledger={capUSD:1,entries:[]};reserveDispatch(ledger,{reservedUSD:.6});ledger.entries[0].status='failed-reserved';
 expect(()=>reserveDispatch(ledger,{reservedUSD:.5})).toThrow();reserveDispatch(ledger,{reservedUSD:.4});
 expect(()=>reserveDispatch(ledger,{reservedUSD:.00001})).toThrow();
});
test('adapter endpoints never send gateway auth to another origin',()=>{
 for(const api of ['chat','responses','anthropic'])expect(new URL(endpoint('https://api.mubit.ai/openai/',api)).origin).toBe('https://api.mubit.ai');
 expect(endpoint('https://api.mubit.ai/openai/v1/','responses')).toBe('https://api.mubit.ai/openai/v1/responses');
});
