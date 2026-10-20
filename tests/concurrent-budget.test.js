import {test,expect} from 'bun:test';
import {reserveDispatch} from '../src/concurrent-budget.js';
test('parallel reservations count all pending bounds and cannot exceed the cap',()=>{
 const ledger={capUSD:1,halted:false,entries:[]};
 reserveDispatch(ledger,{reservedUSD:.4});reserveDispatch(ledger,{reservedUSD:.4});
 expect(()=>reserveDispatch(ledger,{reservedUSD:.3})).toThrow();expect(ledger.entries).toHaveLength(2);
 ledger.entries[0].status='completed';ledger.entries[0].costUSD=.1;
 const e=reserveDispatch(ledger,{reservedUSD:.3});expect(e.committedBeforeUSD).toBe(.5);
 ledger.entries[1].status='unresolved';expect(()=>reserveDispatch(ledger,{reservedUSD:0})).toThrow();
});
