# /// script
# requires-python = ">=3.11"
# dependencies = ["cma==4.4.0", "numpy==2.2.6"]
# ///
"""Default-milk existence search. No model calls and no milk randomization."""
import json, subprocess, pathlib, time, argparse
import cma
ROOT=pathlib.Path(__file__).resolve().parent.parent
p=argparse.ArgumentParser();p.add_argument('--evaluations',type=int,default=1001);args=p.parse_args()
if args.evaluations<1000: p.error('Existence search requires at least 1000 evaluations')
w=subprocess.Popen(['bun','scripts/optimizer-worker.js'],cwd=ROOT,stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True)
def call(q):
    w.stdin.write(json.dumps(q)+'\n');w.stdin.flush();r=json.loads(w.stdout.readline())
    if 'error' in r: raise RuntimeError(r['error'])
    return r
try:
    meta=call({'op':'meta'})
    if not meta['sanity']['passed']:raise RuntimeError('Scorer sanity failed: '+json.dumps(meta['sanity']))
    print('Scorer sanity passed: '+json.dumps(meta['sanity']),flush=True)
    start=time.monotonic();curve=[];best=None
    def evaluate(x):
        global best
        r=call(dict(parameters=[float(v) for v in x],randomized=False))
        curve.append(dict(attempt=len(curve)+1,objective=r['objective'],score=r['evaluation']['score'],checks=r['evaluation']['checks']))
        if best is None or r['objective']>best['objective']:best=r
        if len(curve)%25==0:print(f"{len(curve)}/{args.evaluations}: best shape {best['evaluation']['score']}%, objective {best['objective']:.4f}",flush=True)
        return -r['objective']
    evaluate(meta['initial'])
    es=cma.CMAEvolutionStrategy(meta['initial'],.23,{'bounds':[0,1],'seed':42,'popsize':12,'verbose':-9,'verb_log':0})
    while len(curve)<args.evaluations:
        pop=es.ask();losses=[evaluate(x) for x in pop[:args.evaluations-len(curve)]]
        if len(losses)==len(pop):es.tell(pop,losses)
    if any(not v for k,v in best['evaluation']['checks'].items() if k!='shape'):raise RuntimeError('No feasible serving plan found')
    evidence=call(dict(parameters=best['plan']['parameters'],randomized=False,evidence=True))
    # Predeclared calibration rule: 90% of the feasible reference IoU, rounded down.
    threshold=int(best['evaluation']['shapeIoU']*.9*10000)/10000
    if threshold<=0:raise RuntimeError('No nonzero shape reference found')
    calibration=dict(ready=True,planVersion=meta['planVersion'],spaceHash=meta['spaceHash'],evaluations=len(curve),taskId='heart',targetSeed=42,
        referencePlan=best['plan'],referenceIoU=best['evaluation']['shapeIoU'],referencePrecision=best['evaluation']['precision'],precisionThreshold=int(best['evaluation']['precision']*.9*10000)/10000,threshold=threshold,
        thresholdRule='90% of reference IoU and precision, rounded down to 4 decimals; default milk only; shared thresholds for held-out shapes',
        scorerSanity=meta['sanity'],wallSeconds=time.monotonic()-start)
    (ROOT/'results').mkdir(exist_ok=True)
    (ROOT/'results/calibration-evidence.json').write_text(json.dumps(dict(calibration=calibration,curve=curve,attempts=[evidence])))
    (ROOT/'tasks/calibration.json').write_text(json.dumps(calibration,indent=2)+'\n')
    subprocess.run(['bun','scripts/calibration-evidence.js'],cwd=ROOT,check=True)
    print(json.dumps(calibration,indent=2),flush=True)
finally:w.terminate();w.wait()
