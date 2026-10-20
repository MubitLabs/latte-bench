# /// script
# requires-python = ">=3.11"
# dependencies = ["cma==4.4.0", "numpy==2.2.6"]
# ///
"""Plan-space CMA-ES ablation: one simulator evaluation per attempt, shared milk schedule."""
import argparse, json, pathlib, subprocess, time, uuid
import cma
ROOT=pathlib.Path(__file__).resolve().parent.parent
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--task',default='heart',choices=['heart','tulip','rosetta']);p.add_argument('--attempts',type=int,default=25)
p.add_argument('--seeds',default='42,43,44');p.add_argument('--test-attempts',type=int,default=5)
p.add_argument('--heldout-shape',default='tulip',choices=['heart','tulip','rosetta']);p.add_argument('--default-milk',action='store_true')
p.add_argument('--output',default='results/optimizer-plans.json');args=p.parse_args()
seeds=[int(s) for s in args.seeds.split(',')]
if not all(1<=n<=100 for n in [args.attempts,args.test_attempts]) or len(set(seeds))!=len(seeds) or any(s<0 or s>0xffffffff for s in seeds):p.error('Invalid seed or budget')
if args.heldout_shape==args.task:p.error('Held-out shape must differ from training')
w=subprocess.Popen(['bun','scripts/optimizer-worker.js'],cwd=ROOT,stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True)
def call(q):
    w.stdin.write(json.dumps(q)+'\n');w.stdin.flush();r=json.loads(w.stdout.readline())
    if 'error' in r:raise RuntimeError(r['error'])
    return r
experiments=[]
def save():
    out=pathlib.Path(args.output);out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(dict(schema='latte-bench/0.5',experiments=experiments)))
try:
    for task_id in [args.task,args.heldout_shape]:
        meta=call({'op':'meta','taskId':task_id})
        if not meta['calibration']['ready']:raise RuntimeError(meta['calibration']['reason'])
    for seed in seeds:
        best=None;source=None
        for kind in ['training','heldout-milk','heldout-shape']:
            task=args.heldout_shape if kind=='heldout-shape' else args.task
            count=args.attempts if kind=='training' else args.test_attempts
            config=dict(taskId=task,targetSeed=42,seed=seed,attempts=count,ablation='optimizer',randomized=not args.default_milk,
                        split='holdout' if kind=='heldout-milk' else 'practice',evaluationKind=kind,source=source)
            e=dict(id=str(uuid.uuid4()),schema='latte-bench/0.5',planVersion=meta['planVersion'],spaceHash=meta['spaceHash'],config=config,attempts=[])
            experiments.append(e)
            es=cma.CMAEvolutionStrategy(meta['initial'],.23,{'bounds':[0,1],'seed':seed or 1,'popsize':8,'verbose':-9,'verb_log':0}) if kind=='training' else None
            population=[];losses=[]
            for index in range(count):
                if kind!='training':x=best['plan']['parameters']
                elif index==0:x=meta['initial']
                else:
                    if not population:population=es.ask();losses=[]
                    x=population[len(losses)]
                started=time.monotonic()
                r=call(dict(parameters=[float(v) for v in x],taskId=task,targetSeed=42,seed=seed,index=index,split=config['split'],randomized=config['randomized'],evidence=True))
                r.update(number=index+1,costUSD=0,calls=[],wallSeconds=time.monotonic()-started,ablation='optimizer',evaluationKind=kind)
                e['attempts'].append(r)
                if kind=='training':
                    if best is None or r['objective']>best['objective']:best=r
                    if index>0:
                        losses.append(-r['objective'])
                        if len(losses)==len(population):es.tell(population,losses);population=[]
                print(f"optimizer seed {seed} {kind} {index+1}/{count}: {r['evaluation']['score']}%, {'PASS' if r['evaluation']['passed'] else 'FAIL'}",flush=True)
            if kind=='training':source=dict(id=e['id'],taskId=task,trainingAttempts=count,bestPlan=best['plan'])
            save()
    print('Saved '+args.output,flush=True)
finally:w.terminate();w.wait()
