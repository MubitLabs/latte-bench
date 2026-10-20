import {test,expect} from 'bun:test';
import {createExperiment,attemptExperiment} from '../src/experiments.js';
import {INITIAL_PLAN,PLAN_PARAMETER_GUIDE,PLAN_RESPONSE_FORMAT} from '../src/plans.js';
const response=x=>({text:JSON.stringify(x),cost:.01,model:'mock'});
test('two free format repairs keep the same milk and consume only one simulator attempt; all charges logged',async()=>{
 const e=createExperiment({attempts:1});const inputs=[];
 const r=await attemptExperiment(e,async(phase,input)=>{
  if(phase==='notes')return response({notes:'done'});
  inputs.push(input);return response({parameters:inputs.length===1?[]:inputs.length===2?INITIAL_PLAN.map(()=>2):INITIAL_PLAN});
 });
 expect(r.formatErrors).toHaveLength(2);expect(r.formatRepairCalls).toBe(2);expect(e.attempts).toHaveLength(1);expect(r.evaluation).toBeDefined();expect(r.costUSD).toBe(.04);
 expect(inputs[1].formatFeedback.error).toContain('exactly 33');expect(inputs[2].formatFeedback.error).toContain('parameters[0]');
 expect(inputs.every(x=>JSON.stringify(x.milk)===JSON.stringify(inputs[0].milk))).toBe(true);
});
test('three malformed submissions cause one rejection, separate format errors and no physical trace',async()=>{
 const e=createExperiment({attempts:1});let plans=0;
 const r=await attemptExperiment(e,async phase=>{if(phase==='plan'){plans++;return response({parameters:[]});}return response({notes:''});});
 expect(plans).toBe(3);expect(r.formatErrors).toHaveLength(3);expect(r.outcome).toBe('Rejected');expect(r.trace).toBeUndefined();expect(e.attempts).toHaveLength(1);
});
test('schema enforces all 33 normalized bounds and prompt guide documents every physical coordinate',()=>{
 const schema=PLAN_RESPONSE_FORMAT.json_schema.schema;
 expect(PLAN_RESPONSE_FORMAT.json_schema.strict).toBe(true);expect(schema.additionalProperties).toBe(false);
 expect(schema.properties.parameters).toMatchObject({minItems:33,maxItems:33,items:{minimum:0,maximum:1}});
 expect(PLAN_PARAMETER_GUIDE).toHaveLength(33);expect(PLAN_PARAMETER_GUIDE.every(p=>p.unit&&p.meaning&&p.decode&&Number.isFinite(p.min)&&Number.isFinite(p.max))).toBe(true);
});
