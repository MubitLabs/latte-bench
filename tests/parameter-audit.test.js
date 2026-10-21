import {test,expect} from 'bun:test';
import {parameterAudit} from '../scripts/lib/parameter-audit.js';
const p=[{name:'x',min:-.8,max:.8},{name:'height',min:10,max:180}];
const attempt=(number,values,score=50)=>({number,outcome:values?'Served':'Rejected',plan:values?{parameters:values}:null,evaluation:values?{score,passed:false}:null,environment:{milkML:220,temperatureC:18,index:number}});
test('physical units, signed changes and score changes use adjacent attempts',()=>{
 const [e]=parameterAudit([{model:'a',mode:'notes',seed:42,attempts:[attempt(1,[.5,0]),attempt(2,[.75,.1],60)]}],p);
 expect(e.attempts[0].delta).toBeNull();expect(e.attempts[1].physical[0]).toBeCloseTo(.4);expect(e.attempts[1].physical[1]).toBe(27);
 expect(e.attempts[1].physicalDelta).toEqual([.4,17]);expect(e.attempts[1].changedCount).toBe(2);expect(e.attempts[1].scoreChange).toBe(10);expect(e.attempts[1].environmentChanged).toBe(true);
});
test('rejections and gaps are missing data, never zero plans or bridged comparisons',()=>{
 const [e]=parameterAudit([{model:'a',mode:'notes',seed:42,attempts:[attempt(1,[.5,0]),attempt(2,null),attempt(3,[.8,1]),attempt(5,[0,0])]}],p);
 expect(e.attempts[1].values).toBeNull();expect(e.attempts[1].score).toBeNull();expect(e.attempts.every(a=>a.delta===null)).toBe(true);
});
test('runs never share history; identical values mean zero changes and zero is a real score',()=>{
 const input=[42,43].map(seed=>({model:'a',mode:'no-notes',seed,attempts:[attempt(1,[0,0],0),attempt(2,[0,0],0)]}));
 const out=parameterAudit(input,p);expect(out.every(e=>e.attempts[0].delta===null)).toBe(true);expect(out[0].attempts[0].score).toBe(0);expect(out[0].attempts[1].changedCount).toBe(0);expect(out[0].attempts[1].meanAbsoluteChange).toBe(0);
});
