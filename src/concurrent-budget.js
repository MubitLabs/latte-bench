// Synchronous reservation before any await: pending requests retain their full
// upper bound, so parallel dispatch cannot oversubscribe the shared cap.
export function reserveDispatch(ledger,entry){
 const committed=ledger.entries.reduce((s,e)=>s+(e.costUSD??e.reservedUSD),0);
 if(ledger.halted||ledger.entries.some(e=>e.status==='unresolved')||!Number.isFinite(entry.reservedUSD)||entry.reservedUSD<0||committed+entry.reservedUSD>ledger.capUSD)throw new Error('Shared spend cap or unresolved charge prevents dispatch.');
 entry.number=ledger.entries.length+1;entry.committedBeforeUSD=committed;entry.status='pending';ledger.entries.push(entry);
 return entry;
}
