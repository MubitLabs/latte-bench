// Monetary checks use a conservative upper bound before dispatch, not only
// a check after a request has already been billed. Text-only, one completion.
export function reserveCost(messages,maxTokens,rates){
 if(!Number.isInteger(maxTokens)||maxTokens<=0)throw new Error('Invalid output token limit.');
 if(![rates.input,rates.output].every(n=>Number.isFinite(n)&&n>=0))throw new Error('Confirmed nonnegative rates required.');
 const inputTokenUpperBound=new TextEncoder().encode(JSON.stringify(messages)).length+1024;
 return {inputTokenUpperBound,outputTokenUpperBound:maxTokens,usd:(inputTokenUpperBound*rates.input+maxTokens*rates.output)/1e6};
}
export function budgetAvailable(ledger,reservation){
 if(ledger.halted||ledger.entries.some(e=>e.status==='pending'))return false;
 const committed=ledger.entries.reduce((n,e)=>n+(e.costUSD??e.reservedUSD),0);
 return Number.isFinite(reservation)&&reservation>=0&&committed+reservation<=ledger.capUSD;
}
export function tokenCost(usage,rates){
 const input=usage?.prompt_tokens,output=usage?.completion_tokens;
 if(![input,output].every(n=>Number.isInteger(n)&&n>=0))throw new Error('Missing token usage; stop billing-dependent execution.');
 return (input*rates.input+output*rates.output)/1e6;
}
