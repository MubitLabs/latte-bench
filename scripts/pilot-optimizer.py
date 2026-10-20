# /// script
# requires-python = ">=3.11"
# dependencies = ["cma==4.4.0", "numpy==2.2.6"]
# ///
"""Frozen heart pilot: 5 seeds x 300 evals; no reference initialization, no model calls."""
import json,pathlib,subprocess,time
import cma
ROOT=pathlib.Path(__file__).resolve().parent.parent
OUT=ROOT/'results/heart-pilot';OUT.mkdir(parents=True,exist_ok=True)
if (OUT/'optimizer.json').exists():raise SystemExit('Existing optimizer evidence: refusing to overwrite or rerun.')
w=subprocess.Popen(['bun','scripts/optimizer-worker.js'],cwd=ROOT,stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True)
def call(q):
 w.stdin.write(json.dumps(q)+'\n');w.stdin.flush();r=json.loads(w.stdout.readline())
 if 'error' in r:raise RuntimeError(r['error'])
 return r
report={'schema':'heart-pilot/1','protocol':{'target':'heart','targetSeed':42,'seeds':[42,43,44,45,46],'evalsPerSeed':300,'randomized':True,'milkSchedule':'episodeConditions(seed,index,practice); matched first 10 with agents','initialization':'generic INITIAL_PLAN, not calibrated witness','sigma':.23,'popsize':8,'objective':'min(IoU,boundaryF1) minus number of failed non-shape checks','apiCostUSD':0},'experiments':[]}
def save():
 tmp=OUT/'optimizer.tmp';tmp.write_text(json.dumps(report));tmp.replace(OUT/'optimizer.json')
try:
 meta=call({'op':'meta','taskId':'heart'})
 if not meta['calibration']['ready']:raise RuntimeError(meta['calibration']['reason'])
 report['spaceHash']=meta['spaceHash'];report['planVersion']=meta['planVersion']
 for seed in report['protocol']['seeds']:
  e={'seed':seed,'attempts':[]};report['experiments'].append(e)
  es=cma.CMAEvolutionStrategy(meta['initial'],.23,{'bounds':[0,1],'seed':seed,'popsize':8,'verbose':-9,'verb_log':0})
  population=[];losses=[]
  for index in range(300):
   if index==0:x=meta['initial']
   else:
    if not population:population=es.ask();losses=[]
    x=population[len(losses)]
   started=time.monotonic();r=call({'parameters':[float(v) for v in x],'taskId':'heart','targetSeed':42,'seed':seed,'index':index,'randomized':True,'evidence':False,'keepSurface':True})
   r.update(number=index+1,costUSD=0,wallSeconds=time.monotonic()-started);e['attempts'].append(r)
   if index>0:
    losses.append(-r['objective'])
    if len(losses)==len(population):es.tell(population,losses);population=[]
   if (index+1)%25==0:
    first=next((a['number'] for a in e['attempts'] if a['evaluation']['passed']),None)
    print(f"seed {seed}: {index+1}/300, first pass {first}, best quality {max(a['evaluation']['score'] for a in e['attempts'])}",flush=True);save()
 save()
finally:w.terminate();w.wait()
