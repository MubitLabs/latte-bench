# /// script
# dependencies = ["pillow==13.0.0", "matplotlib==3.10.8", "numpy==2.2.6"]
# ///
import pathlib,json,math,html
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from PIL import Image,ImageDraw,ImageFont
ROOT=pathlib.Path(__file__).resolve().parent.parent;DATA=ROOT/'results/heart-pilot';OUT=ROOT/'docs/heart-pilot';OUT.mkdir(parents=True,exist_ok=True)
opt=json.loads((DATA/'optimizer.json').read_text());agents=json.loads((DATA/'agents.json').read_text()) if (DATA/'agents.json').exists() else None
colors={'no-notes':'#bd7750','notes':'#48735a','optimizer':'#607c9a'}
def ev(a):return a.get('evaluation',{})
def first(a):return next((x['number'] for x in a if ev(x).get('passed')),None)
def quality(a):return ev(a).get('score',0)
def rowsum(e):
 a=e['attempts'];f=first(a);costs=[x.get('costUSD') for x in a];known=all(x is not None for x in costs)
 return {'seed':e.get('seed',e.get('config',{}).get('seed')),'attempts':len(a),'firstPass':f,'passCount':sum(bool(ev(x).get('passed')) for x in a),'rejected':sum(x.get('outcome')=='Rejected' for x in a),'errors':sum(x.get('outcome')=='Error' for x in a),'validPours':sum(bool(ev(x)) for x in a),'bestScore':max(map(quality,a),default=0),'attempt1Score':quality(a[0]) if a else None,'costPerAttemptUSD':costs,'totalCostUSD':sum(costs) if known else None,'costToFirstPassUSD':sum(costs[:f]) if f and all(x is not None for x in costs[:f]) else None}
def style(ax):
 ax.set_facecolor('#fffdf7');ax.spines[['top','right']].set_visible(False);ax.grid(alpha=.15)
def font(size):
 try:return ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',size)
 except OSError:return ImageFont.load_default(size=size)
def tiles(items,filename,title):
 side=224;gap=18;top=90;n=32;cols=4;rows=math.ceil(len(items)/cols)
 im=Image.new('RGB',(gap+(side+gap)*cols,top+(side+75)*rows),(246,244,236));d=ImageDraw.Draw(im);d.text((gap,15),title,font=font(22),fill='#303a2e')
 for k,(label,a) in enumerate(items):
  x=gap+(k%cols)*(side+gap);y=top+(k//cols)*(side+75);d.multiline_text((x,y-43),label,font=font(14),fill='#303a2e',spacing=3)
  values=a.get('surface')
  if values is None:
   d.rectangle((x,y,x+side,y+side),fill='#e0dbcb');d.text((x+20,y+side/2),'No valid pour',font=font(18),fill='#805331');continue
  small=Image.new('RGB',(n,n));pixels=[]
  for i,v in enumerate(values):
   outside=math.hypot((i%n+.5)/n*2-1,(i//n+.5)/n*2-1)>=.985
   pixels.append((224,219,203) if outside else tuple(round(lo+(hi-lo)*max(0,min(1,v))) for lo,hi in zip((92,53,31),(255,248,223))))
  small.putdata(pixels);im.paste(small.resize((side,side),Image.Resampling.NEAREST),(x,y))
 d.text((gap,im.height-26),'Actual 32×32 foam fields, nearest-neighbor enlargement. Best = maximum displayed score.',font=font(13),fill='#56624f');im.save(OUT/filename)
def table(headers,rows):return '<table><tr>'+''.join(f'<th>{html.escape(str(x))}</th>' for x in headers)+'</tr>'+''.join('<tr>'+''.join(f'<td>{html.escape(str(x))}</td>' for x in row)+'</tr>' for row in rows)+'</table>'
def money(v):return f'${v:.5f}' if v is not None else 'unknown'
summary={'protocol':opt['protocol'],'optimizer':[rowsum(e) for e in opt['experiments']],'agents':[],'billing':None}
optrows=summary['optimizer'];counts=[1,10,30,50,100,150,200,219,250,270,300]
summary['optimizerPassRateByBudget']=[{'budget':n,'everPassedRuns':sum(r['firstPass'] is not None and r['firstPass']<=n for r in optrows),'runs':5} for n in counts]
summary['optimizerVisualReview']='Both numerical passes look like a rounded teardrop / blob without a clear notch. The frozen contour gate still admits visually weak hearts; no scorer or threshold changed during the pilot.'
summary['under30Flag']=any(r['firstPass'] is not None and r['firstPass']<30 for r in optrows)
fig,axes=plt.subplots(1,2,figsize=(11,4.2),layout='constrained');fig.patch.set_facecolor('#f6f4ec')
for ax in axes:style(ax)
for e in opt['experiments']:
 scores=np.maximum.accumulate([quality(a) for a in e['attempts']]);axes[0].plot(range(1,len(scores)+1),scores,label=f"Seed {e['seed']}",lw=1.5)
axes[0].set(xlabel='Simulator evaluations',ylabel='Best observed score (%)',ylim=(0,100),title='CMA-ES: sample efficiency');axes[0].legend(fontsize=8)
x=np.arange(1,301);rate=[100*sum(r['firstPass'] is not None and r['firstPass']<=n for r in optrows)/5 for n in x]
axes[1].step(x,rate,where='post',color=colors['optimizer']);axes[1].axvline(30,ls=':',c='#bb744f');axes[1].set(xlabel='Evaluation budget',ylabel='Runs with ≥1 pass (%)',ylim=(-2,102),title='Cumulative first-pass rate across five seeds')
fig.savefig(OUT/'optimizer.png',dpi=170);plt.close(fig)
passedPours=[(f'Seed {e["seed"]} · eval {a["number"]}\n{quality(a):.1f}% · PASS',a) for e in opt['experiments'] for a in e['attempts'] if ev(a).get('passed')]
if passedPours:
 prior=json.loads((ROOT/'docs/shape-audit/headroom.json').read_text())
 tiles([('Target heart',{'surface':prior['targets']['heart']}),('Reviewed reference\nNot used to initialize CMA-ES',prior['references']['heart'])]+passedPours,'optimizer-passes.png','CMA-ES · numerical passes lack a clear heart notch')
optimizerTable=table(['Seed','First pass / 300','Passing evaluations','Best score'],[[r['seed'],r['firstPass'] or 'not reached',r['passCount'],f"{r['bestScore']:.1f}%"] for r in optrows])
body=f'''<section><h2>Optimizer: five seeds × 300 evaluations</h2><p>Heart only, target seed 42. CMA-ES starts from the generic INITIAL_PLAN, not a calibrated witness; sigma 0.23, population 8. Each candidate uses the next randomized milk episode. Seeds 42–46. One candidate = one counted simulator evaluation; no repeated evaluation or averaging. First-pass rate is the fraction of independent optimizer runs that have ever passed, not the fraction of pours passing.</p><img src="optimizer.png">{optimizerTable}<p>Pass rate at budgets 10 / 30 / 100 / 200 / 250 / 300: 0% / 0% / 0% / 0% / 20% / 40%.</p><img src="optimizer-passes.png" alt="Two passing optimizer pours"><p><strong>Visual caveat:</strong> Both numerical passes look like a rounded teardrop or blob, without a clear heart notch. The frozen contour gate still admits visually weak shapes. They count as numerical passes in all tables, not validated heart art. The scorer and thresholds were not changed during this pilot.</p><p>No pass occurred below 30 evaluations. The “too easy” warning is not triggered. There were only 2 passing pours out of 1,500; first pass does not establish robustness. Failed runs are right-censored at 300, not counted as passes at evaluation 301. Mean evaluations-to-pass across all seeds is not estimable from these censored results.</p></section>'''
if agents:
 for e in agents['experiments']:summary['agents'].append({'mode':e['config']['ablation'],**rowsum(e)})
 ledger=agents['ledger'];entries=ledger['entries'];summary['billing']={'capUSD':ledger['capUSD'],'halted':ledger['halted'],'reason':ledger.get('reason'),'completed':agents.get('completed',False),'calls':len(entries),'confirmedCostUSD':sum(e.get('costUSD',0) for e in entries),'unresolvedReserveUSD':sum(e['reservedUSD'] for e in entries if e.get('costUSD') is None),'costBases':sorted(set(e.get('costBasis','unresolved') for e in entries)),'cachedTokens':sum(e.get('response',{}).get('usage',{}).get('prompt_tokens_details',{}).get('cached_tokens',0) for e in entries),'cacheAdjustedEstimateUSD':sum(e.get('costUSD',0)-(e.get('response',{}).get('usage',{}).get('prompt_tokens_details',{}).get('cached_tokens',0)*.3/1e6 if e.get('costBasis','').startswith('confirmed rates') else 0) for e in entries)}
 n=10;fig,axes=plt.subplots(1,3,figsize=(12,4),layout='constrained');fig.patch.set_facecolor('#f6f4ec')
 for ax,seed in zip(axes,[42,43,44]):
  style(ax)
  for e in agents['experiments']:
   if e['config']['seed']!=seed:continue
   mode=e['config']['ablation'];ax.plot([a['number'] for a in e['attempts']],[quality(a) for a in e['attempts']],'-o',ms=3,color=colors[mode],label=mode)
   for a in e['attempts']:
    if ev(a).get('passed'):ax.scatter(a['number'],quality(a),marker='*',s=100,color=colors[mode])
  ax.set(title=f'Milk seed {seed}',xlabel='Attempt',ylim=(0,100),xticks=[1,3,5,7,10]);ax.legend(fontsize=8)
 axes[0].set_ylabel('Score = 100 × min(IoU, boundary F1)');fig.suptitle('Agent pilot: actual per-attempt scores; stars indicate full passes');fig.savefig(OUT/'agent-scores.png',dpi=170);plt.close(fig)
 # Actual score variance across seeds (not best-so-far, no hidden filtering).
 summary['agentAttempts']=[{'mode':e['config']['ablation'],'seed':e['config']['seed'],'attempts':[{'number':a['number'],'score':quality(a),'passed':ev(a).get('passed',False),'outcome':a['outcome'],'error':a.get('error'),'costUSD':a.get('costUSD'),'notesError':a.get('notesError')} for a in e['attempts']]} for e in agents['experiments']]
 summary['agentCurves']={}
 for mode in ['no-notes','notes']:
  series=[e['attempts'] for e in agents['experiments'] if e['config']['ablation']==mode];curve=[]
  for i in range(10):
   scores=[quality(a[i]) for a in series if len(a)>i];costs=[a[i].get('costUSD') for a in series if len(a)>i]
   curve.append({'attempt':i+1,'n':len(scores),'meanScore':float(np.mean(scores)) if scores else None,'sampleVariance':float(np.var(scores,ddof=1)) if len(scores)>1 else None,'meanCostUSD':sum(costs)/len(costs) if costs and all(c is not None for c in costs) else None})
  summary['agentCurves'][mode]=curve
 gallery=[]
 for seed in [42,43,44]:
  items=[]
  for mode in ['no-notes','notes']:
   e=next(e for e in agents['experiments'] if e['config']['seed']==seed and e['config']['ablation']==mode)
   if not e['attempts']:continue
   firstA=e['attempts'][0];best=max(e['attempts'],key=lambda a:(quality(a),bool(a.get('surface'))))
   items.extend([(f'{mode} · attempt 1\n{quality(firstA):.1f}%'+(' · PASS' if ev(firstA).get('passed') else ''),firstA),(f'{mode} · best, attempt {best["number"]}\n{quality(best):.1f}%'+(' · PASS' if ev(best).get('passed') else ''),best)])
  if items:
   name=f'agent-seed-{seed}.png';tiles(items,name,f'Heart pilot · milk seed {seed}');gallery.append(f'<img src="{name}" alt="Attempt one and best for milk seed {seed}">')
 agentTable=table(['Mode','Seed','Attempts','Rejected','First pass','Best score','Total cost','Cost to first pass'],[[r['mode'],r['seed'],r['attempts'],r['rejected'],r['firstPass'] or 'not reached',f"{r['bestScore']:.1f}%",money(r['totalCostUSD']),money(r['costToFirstPassUSD']) if r['firstPass'] else 'not reached'] for r in summary['agents']])
 costTable=table(['Mode','Seed']+[str(i) for i in range(1,11)],[[r['mode'],r['seed']]+[money(c) for c in r['costPerAttemptUSD']] for r in summary['agents']])
 comparison=[]
 for mode in ['optimizer','no-notes','notes']:
  rs=[rowsum(e) for e in opt['experiments'] if e['seed'] in [42,43,44]] if mode=='optimizer' else [r for r in summary['agents'] if r['mode']==mode]
  comparison.append({'mode':mode,'budget':10,'seeds':[42,43,44],'everPassed':sum(r['firstPass'] is not None and r['firstPass']<=10 for r in rs),'firstPassAtMatchedBudget':[r['firstPass'] if r['firstPass'] is not None and r['firstPass']<=10 else None for r in rs],'bestScoresAtMatchedBudget':[max([quality(a) for a in e['attempts'][:10]],default=0) for e in (opt['experiments'] if mode=='optimizer' else agents['experiments']) if (e.get('seed',e.get('config',{}).get('seed')) in [42,43,44]) and (mode=='optimizer' or e['config']['ablation']==mode)]})
 summary['matchedComparison']=comparison
 compareTable=table(['Controller','Budget / seed','Seeds with a pass','First pass: 42 / 43 / 44','Best score: 42 / 43 / 44'],[[r['mode'],10,f"{r['everPassed']}/3",' / '.join(str(x) if x else '>10' for x in r['firstPassAtMatchedBudget']),' / '.join(f'{x:.1f}%' for x in r['bestScoresAtMatchedBudget'])] for r in comparison])
 body+=f'''<section><h2>Agent pilot: one model, two context modes</h2><p>Model: {html.escape(agents['protocol']['model'])}. Seeds 42–44, ten attempts per mode and seed. The exact same milk schedules and 33-parameter bounds as CMA-ES. Each attempt gets a fresh planning call and a reflection call; no-notes discards its reflection, notes retains only its own previous note. No reference plan was supplied. Modes are interleaved, with order alternated each attempt.</p><p>Rejected plans score zero and count against the budget. Wrong-length arrays and physical values supplied in normalized coordinates are interface failures, so poor scores here cannot by themselves establish an inability to learn pouring. No prompt repairs or plan repairs were made during the pilot.</p><p>Gateway-side memory/routing is not independently verified. This is a context-notes comparison, not proof of weight learning. Missing/invalid model outputs consume attempts. Best observed scores may fail precision or serving checks; only full passes count.</p><img src="agent-scores.png">{agentTable}<h3>Cost per attempt, USD upper estimate (plan + reflection)</h3>{costTable}<p>Spend ledger: {len(entries)} requests; recorded/estimated cost {money(summary['billing']['confirmedCostUSD'])}; unresolved reservation {money(summary['billing']['unresolvedReserveUSD'])}; cap $20. Cost basis: {html.escape(', '.join(summary['billing']['costBases']))}. Applying the published cached-input rate gives {money(summary['billing']['cacheAdjustedEstimateUSD'])}; the cap ledger conservatively uses the higher uncached estimate. Before dispatch, each request reserves an upper bound using UTF8 bytes plus framing allowance for input and the output-token limit. Unknown usage or provider errors stop dispatch; no automatic paid retries.</p><p>Billing contract: {html.escape(agents['protocol']['billing'])}. <a href="https://developers.openai.com/api/docs/models/gpt-4.1-mini">Official model pricing</a>. If cost is computed from tokens, it is an uncached upper estimate, not an invoice.</p>{''.join(gallery)}</section><section><h2>Matched ten-evaluation comparison</h2>{compareTable}<p>Compare all controllers at ten attempts on seeds 42–44. The optimizer's full 300-evaluation runs answer the separate sample-efficiency question; they are not presented as an equal-budget win over ten-attempt agents. A small pilot cannot establish population-level superiority.</p></section>'''
else:body+='<section><h2>Agent pilot pending</h2><p>No paid requests have been sent. Awaiting confirmation of gateway billing so the $20 hard cap can be enforced. The matched comparison and agent images will be populated from actual attempts only.</p></section>'
body+='''<section><h2>Separated-layer tulip: not established</h2><p>The current tulip witness matches a fused silhouette, so it provides no evidence of separated layers. Earlier local recipe trials showed neighbouring pools merging under radial spreading. Small disconnected deposits are possible in this simulator, so separated layers are not proven impossible; a recognisable layered tulip at the required scale and volume has not been demonstrated with the current 33-parameter plan. No target or simulation changes were made for this pilot.</p></section>'''
(OUT/'summary.json').write_text(json.dumps(summary,indent=2))
(OUT/'report.html').write_text('<!doctype html><meta charset="utf-8"><title>Latte Bench — capped heart pilot</title><style>body{max-width:1100px;margin:40px auto;padding:0 24px;background:#f6f4ec;color:#303a2e;font:15px/1.6 system-ui}section{background:#fffdf7;padding:24px;margin:24px 0;border:1px solid #dce0d4;border-radius:12px}h1,h2,h3{font-weight:550}img{width:100%;height:auto}table{border-collapse:collapse;width:100%;font-size:12px}td,th{padding:8px 5px;text-align:left;border-bottom:1px solid #dce0d4}a{color:#426747}</style><h1>Capped heart pilot</h1><p>Frozen v0.5 scorer and foam-surface/3 · Heart only · 33 shared parameters · no threshold tuning</p>'+body+'<p><a href="summary.json">Machine-readable summary</a>. Full plans, foam maps, scores and local cost ledger: results/heart-pilot/ in the repository.</p>')
print(json.dumps(summary,indent=2))
