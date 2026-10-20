import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import protocol from '../experiments/heart-frozen-v3.json';
export async function frozenIdentity(){
 const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
 const commit=git('rev-parse',protocol.tag+'^{commit}');
 if(git('rev-parse','HEAD')!==commit)throw new Error('HEAD is not the frozen tagged commit.');
 if(git('status','--porcelain','--untracked-files=no'))throw new Error('Tracked files changed after freeze.');
 const paths=git('ls-files','src','tasks','experiments','scripts','package.json','bun.lock').split('\n').filter(Boolean);
 const hashes={};for(const p of paths)hashes[p]=createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex');
 return {tag:protocol.tag,commit,hashes};
}
