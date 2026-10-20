# /// script
# requires-python = ">=3.11"
# dependencies = ["cma==4.4.0", "numpy==2.2.6"]
# ///
"""Default-milk existence search. No model calls and no milk randomization."""
raise SystemExit('Historical v0.4 search disabled: use bun run calibrate for per-shape contour calibration.')
import json, subprocess, pathlib, time, argparse
import cma
ROOT=pathlib.Path(__file__).resolve().parent.parent
p=argparse.ArgumentParser();p.add_argument('--evaluations',type=int,default=1001);p.add_argument('--reference',default='tasks/reference-heart.json');args=p.parse_args()
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
    reviewed=json.loads((ROOT/args.reference).read_text())
    if not reviewed.get('visualReview'):raise RuntimeError('A visually reviewed poured reference is required before calibration')
    witness=call(dict(parameters=reviewed['plan']['parameters'],randomized=False))
    if witness['evaluation']['shapeIoU']<.5 or any(not v for k,v in witness['evaluation']['checks'].items() if k!='shape'):
        raise RuntimeError('Reviewed reference must exceed 50% IoU and pass all serving gates')
    if abs(witness['evaluation']['shapeIoU']-reviewed['reviewedIoU'])>1e-8:raise RuntimeError('Reviewed reference changed; re-render and inspect before calibration')
    start=time.monotonic();curve=[];best=None
    def evaluate(x):
        global best
        r=call(dict(parameters=[float(v) for v in x],randomized=False))
        curve.append(dict(attempt=len(curve)+1,objective=r['objective'],score=r['evaluation']['score'],checks=r['evaluation']['checks']))
        if best is None or r['objective']>best['objective']:best=r
        if len(curve)%25==0:print(f"{len(curve)}/{args.evaluations}: best shape {best['evaluation']['score']}%, objective {best['objective']:.4f}",flush=True)
        return -r['objective']
    evaluate(reviewed['plan']['parameters'])
    es=cma.CMAEvolutionStrategy(reviewed['plan']['parameters'],.12,{'bounds':[0,1],'seed':42,'popsize':12,'verbose':-9,'verb_log':0})
    while len(curve)<args.evaluations:
        pop=es.ask();losses=[evaluate(x) for x in pop[:args.evaluations-len(curve)]]
        if len(losses)==len(pop):es.tell(pop,losses)
    if any(not v for k,v in best['evaluation']['checks'].items() if k!='shape'):raise RuntimeError('No feasible serving plan found')
    # Keep the visually reviewed witness; a higher-IoU blob cannot silently replace it.
    search_best=best
    best=witness
    evidence=call(dict(parameters=best['plan']['parameters'],randomized=False,evidence=True))
    # Predeclared calibration rule: 90% of the feasible reference IoU, rounded down.
    threshold=int(best['evaluation']['shapeIoU']*.9*10000)/10000
    if best['evaluation']['shapeIoU']<.5:raise RuntimeError('Reference below 50% overlap')
    calibration=dict(ready=True,surfaceVersion=meta['surfaceVersion'],gridSize=meta['gridSize'],visualReview=reviewed['description'],searchBestIoU=search_best['evaluation']['shapeIoU'],searchBestPlan=search_best['plan'],planVersion=meta['planVersion'],spaceHash=meta['spaceHash'],evaluations=len(curve),taskId='heart',targetSeed=42,
        referencePlan=best['plan'],referenceIoU=best['evaluation']['shapeIoU'],referencePrecision=best['evaluation']['precision'],precisionThreshold=int(best['evaluation']['precision']*.9*10000)/10000,threshold=threshold,
        thresholdRule='90% of visually reviewed reference IoU and precision, rounded down to 4 decimals; default milk only; shared thresholds for held-out shapes',
        scorerSanity=meta['sanity'],wallSeconds=time.monotonic()-start)
    (ROOT/'results').mkdir(exist_ok=True)
    (ROOT/'results/calibration-evidence.json').write_text(json.dumps(dict(calibration=calibration,curve=curve,attempts=[evidence])))
    (ROOT/'tasks/calibration.json').write_text(json.dumps(calibration,indent=2)+'\n')
    subprocess.run(['bun','scripts/calibration-evidence.js'],cwd=ROOT,check=True)
    print(json.dumps(calibration,indent=2),flush=True)
finally:w.terminate();w.wait()
