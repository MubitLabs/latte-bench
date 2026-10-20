import {test,expect} from 'bun:test';
import {reserveCost,budgetAvailable,tokenCost} from '../src/pilot-budget.js';
test('spend gate reserves the next call before dispatch and never borrows from unresolved charges',()=>{
 const ledger={capUSD:20,entries:[{costUSD:19.99,status:'completed'}]};
 expect(budgetAvailable(ledger,.02)).toBe(false);expect(budgetAvailable(ledger,.009)).toBe(true);
 expect(budgetAvailable({...ledger,entries:[{reservedUSD:20,status:'unresolved'}]},.01)).toBe(false);
 expect(budgetAvailable({...ledger,entries:[{reservedUSD:.01,status:'pending'}]},.01)).toBe(false);
 expect(budgetAvailable({...ledger,halted:true},0)).toBe(false);
});
test('text reservation bounds tokens by UTF8 bytes with framing allowance; missing usage is fatal',()=>{
 const messages=[{role:'user',content:'milk ☕'}],rates={input:.4,output:1.6},r=reserveCost(messages,1000,rates);
 expect(r.inputTokenUpperBound).toBeGreaterThan(JSON.stringify(messages).length);
 expect(r.usd).toBeGreaterThan(tokenCost({prompt_tokens:20,completion_tokens:1000},rates));
 expect(()=>tokenCost({},rates)).toThrow();expect(()=>reserveCost(messages,1000,{input:NaN,output:1})).toThrow();
});
