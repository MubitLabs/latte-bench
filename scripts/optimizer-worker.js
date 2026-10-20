import {createInterface} from 'node:readline';
import {simulatePolicy} from '../src/baseline.js';
// One persistent Bun process; never loads credentials or calls a gateway.
for await(const line of createInterface({input:process.stdin,crlfDelay:Infinity})){
  try { console.log(JSON.stringify(simulatePolicy(JSON.parse(line)))); }
  catch(error){console.log(JSON.stringify({error:error.message}));}
}
