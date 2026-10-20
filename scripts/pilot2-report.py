# /// script
# dependencies = ["pillow==13.0.0", "matplotlib==3.10.8", "numpy==2.2.6"]
# ///
import pathlib,json,math,html
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from PIL import Image,ImageDraw,ImageFont
ROOT=pathlib.Path(__file__).resolve().parent.parent;DATA=ROOT/'results/heart-pilot-v2';OUT=ROOT/'docs/heart-pilot-v2';OUT.mkdir(parents=True,exist_ok=True)
opt=json.loads((DATA/'optimizer.json').read_text());agents=json.loads((DATA/'agents.json').read_text());check=json.loads((OUT/'scorer-check.json').read_text())
colors={'no-notes':'#bd7750','notes':'#48735a','optimizer':'#607c9a'}
def ev(a):return a.get('evaluation',{})
def quality(a):return ev(a).get('score',0)
def first(a):return next((x['number'] for x in a if ev(x).get('passed')),None)
def font(size):
 try:return ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',size)
 except OSError:return ImageFont.load_default(size=size)
def tiles(items,filename,title,columns=4):
 side=224;gap=18;top=96;n=32;cols=min(columns,len(items));rows=math.ceil(len(items)/cols)
 im=Image.new('RGB',(gap+(side+gap)*cols,top+(side+75)*rows),(246,244,236));d=ImageDraw.Draw(im);d.text((gap,12),title,font=font(20),fill='#303a2e')
 for k,(label,values) in enumerate(items):
  x=gap+(k%cols)*(side+gap);y=top+(k//cols)*(side+75);d.multiline_text((x,y-44),label,font=font(13),fill='#303a2e',spacing=3)
  if values is None:
   d.rectangle((x,y,x+side,y+side),fill='#e0dbcb');d.text((x+20,y+side/2),'Rejected: no pour',font=font(16),fill='#805331');continue
  small=Image.new('RGB',(n,n));pixels=[]
  for i,v in enumerate(values):
   outside=math.hypot((i%n+.5)/n*2-1,(i//n+.5)/n*2-1)>=.985
   pixels.append((224,219,203) if outside else tuple(round(lo+(hi-lo)*max(0,min(1,v))) for lo,hi in zip((92,53,31),(255,248,223))))
  small.putdata(pixels);im.paste(small.resize((side,side),Image.Resampling.NEAREST),(x,y))
 d.text((gap,im.height-26),'Actual 32×32 fields · no smoothing or generated art',font=font(12),fill='#56624f');im.save(OUT/filename)
def table(headers,rows):return '<table><tr>'+''.join(f'<th>{html.escape(str(x))}</th>' for x in headers)+'</tr>'+''.join('<tr>'+''.join(f'<td>{html.escape(str(x))}</td>' for x in row)+'</tr>' for row in rows)+'</table>'
def money(v):return f'${v:.5f}' if v is not None else 'unknown'
def style(ax):ax.set_facecolor('#fffdf7');ax.spines[['top','right']].set_visible(False);ax.grid(alpha=.15)
def summarize(e):
 a=e['attempts'];costs=[x.get('costUSD') for x in a];f=first(a)
 return {'seed':e.get('seed',e.get('config',{}).get('seed')),'attempts':len(a),'firstPass':f,'passes':sum(bool(ev(x).get('passed')) for x in a),'bestScore':max(map(quality,a),default=0),'rejected':sum(x.get('outcome')=='Rejected' for x in a),'formatErrors':sum(len(x.get('formatErrors',[])) for x in a),'repairCalls':sum(x.get('formatRepairCalls',0) for x in a),'costPerAttemptUSD':costs,'totalCostUSD':sum(costs) if all(c is not None for c in costs) else None,'costToFirstPassUSD':sum(costs[:f]) if f and all(c is not None for c in costs[:f]) else None}
summary={'schema':'heart-pilot/2','completed':agents.get('completed',False),'model':agents['protocol']['model'],'optimizer':[summarize(e) for e in opt['experiments']],'agents':[{'mode':e['config']['ablation'],**summarize(e)} for e in agents['experiments']]}
entries=agents['ledger']['entries'];upper=sum(e.get('costUSD',0) for e in entries);reserve=sum(e['reservedUSD'] for e in entries if e.get('costUSD') is None)
# Published standard pricing: fresh input 10/M, cache reads 1/M, writes 12.5/M, output including reasoning 50/M.
priceEstimate=0
for e in entries:
 if e.get('status')!='completed':continue
 u=e['response'].get('usage',{});details=u.get('prompt_tokens_details',{});p=u.get('prompt_tokens',0);reads=details.get('cached_tokens',0);writes=details.get('cache_write_tokens',0)
 priceEstimate+=(max(0,p-reads-writes)*10+reads+12.5*writes+u.get('completion_tokens',0)*50)/1e6
summary['billing']={'upperEstimateUSD':upper,'standardUsageEstimateUSD':priceEstimate,'unresolvedReserveUSD':reserve,'calls':len(entries),'capUSD':20,'halted':agents['ledger']['halted'],'reason':agents['ledger'].get('reason')}
scorerRows=[]
for r in check['rows']+[{'label':'Reviewed reference','evaluation':check['reference']['evaluation']}]:
 e=r['evaluation'];scorerRows.append([r['label'],f'{e["shapeIoU"]*100:.2f}%',f'{e["boundaryF1"]*100:.2f}%',f'{e["concavityEmptyFraction"]*100:.0f}%',f'{e["score"]:.1f}%','PASS' if e['passed'] else 'FAIL'])
tiles([('Target heart',check['target']),('Reviewed reference · PASS\n87.0% score',check['reference']['surface'])]+[(f'Old seed {r["seed"]} · now FAIL\nConcavity empty: 0%',r['surface']) for r in check['rows']],'scorer-check.png','Concavity regression: both old passes rejected')
bestOptimizer=[('Target heart',check['target'])]
for e in opt['experiments']:
 a=max(e['attempts'],key=quality)
 bestOptimizer.append((f'Seed {e["seed"]} · eval {a["number"]}\nBest score {quality(a):.1f}% · FAIL',a['surface']))
tiles(bestOptimizer,'optimizer-best.png','Best observed shape score per CMA-ES run',columns=3)
# Every numerical pass gets its own PNG and a gallery entry; no selection by appearance.
passes=[]
for e in opt['experiments']:
 for a in e['attempts']:
  if ev(a).get('passed'):passes.append({'controller':'optimizer','seed':e['seed'],'attempt':a['number'],'result':a})
for e in agents['experiments']:
 for a in e['attempts']:
  if ev(a).get('passed'):passes.append({'controller':e['config']['ablation'],'seed':e['config']['seed'],'attempt':a['number'],'result':a})
reviews=json.loads((OUT/'visual-review.json').read_text()) if (OUT/'visual-review.json').exists() else {}
for p in passes:
 name=f"pass-{p['controller']}-seed-{p['seed']}-attempt-{p['attempt']}";p['id']=name;p['png']=name+'.png';p['visualReview']=reviews.get(name,'Awaiting visual review')
 a=p['result'];tiles([('Target',check['target']),(f'{p["controller"]} · seed {p["seed"]} / {p["attempt"]}\nScore {quality(a):.1f}%',a['surface'])],p['png'],'Numerical pass: target and actual result',columns=2)
# Preserve the original pilot's first-attempt / best-attempt evidence as well.
for seed in [42,43,44]:
 items=[('Target heart',check['target'])]
 for mode in ['no-notes','notes']:
  e=next(e for e in agents['experiments'] if e['config']['seed']==seed and e['config']['ablation']==mode)
  if not e['attempts']:continue
  for label,a in [('First',e['attempts'][0]),('Best',max(e['attempts'],key=quality))]:
   items.append((f'{mode} · {label} #{a["number"]}\n{quality(a):.1f}%',a.get('surface')))
 tiles(items,f'agent-seed-{seed}.png',f'Agent first and best attempts · milk seed {seed}',columns=5)
galleryPages=[]
for start in range(0,len(passes),12):
 group=passes[start:start+12];name=f'passes-{start//12+1}.png';galleryPages.append(name)
 tiles([(f'{p["controller"]} · {p["seed"]} / {p["attempt"]}\n{quality(p["result"]):.1f}%',p['result']['surface']) for p in group],name,'All numerical passes · visual inspection sheet')
summary['passes']=[{k:v for k,v in p.items() if k!='result'} for p in passes]
# Per-attempt curves: red X denotes a terminal rejection; valid zero is a normal circle.
fig,axes=plt.subplots(1,3,figsize=(12,4.3),layout='constrained');fig.patch.set_facecolor('#f6f4ec')
for ax,seed in zip(axes,[42,43,44]):
 style(ax)
 for mode in ['optimizer','no-notes','notes']:
  e=next((e for e in (opt['experiments'] if mode=='optimizer' else agents['experiments']) if e.get('seed',e.get('config',{}).get('seed'))==seed and (mode=='optimizer' or e['config']['ablation']==mode)),None)
  a=e['attempts'][:10];x=[r['number'] for r in a];y=[quality(r) if r.get('outcome')!='Rejected' else np.nan for r in a]
  ax.plot(x,y,'-o',ms=3,color=colors[mode],label=mode,alpha=.9)
  rejected=[r for r in a if r.get('outcome')=='Rejected'];ax.scatter([r['number'] for r in rejected],[0]*len(rejected),marker='x',s=70,c='#b33d37',zorder=5,label='Rejected' if rejected else None)
  passed=[r for r in a if ev(r).get('passed')];ax.scatter([r['number'] for r in passed],[quality(r) for r in passed],marker='*',s=110,c=colors[mode],zorder=6)
 ax.axhline(78.26,color='#858575',ls='--',lw=.8,label='Score ≥78.26 (necessary, not sufficient)')
 ax.set(title=f'Matched milk seed {seed}',xlabel='Attempt / evaluation',ylim=(-3,100),xticks=[1,3,5,10])
handles,labels=axes[0].get_legend_handles_labels();fig.legend(handles,labels,loc='outside lower center',ncol=4,fontsize=8)
axes[0].set_ylabel('Score (%)');fig.suptitle('Actual score: circles = valid (including zero), red X = rejected, stars = pass');fig.savefig(OUT/'matched-scores.png',dpi=170);plt.close(fig)
fig,axes=plt.subplots(1,2,figsize=(11,4),layout='constrained');fig.patch.set_facecolor('#f6f4ec')
for ax in axes:style(ax)
for e in opt['experiments']:
 axes[0].plot(range(1,301),np.maximum.accumulate([quality(a) for a in e['attempts']]),label=str(e['seed']))
axes[0].axhline(78.26,color='#858575',ls='--',lw=.8)
axes[0].set(xlabel='Evaluation',ylabel='Best observed score (%)',ylim=(0,100),title='CMA-ES · generic prior · 5 × 300');axes[0].legend(title='Seed',fontsize=8)
axes[1].step(range(1,301),[100*sum(r['firstPass'] is not None and r['firstPass']<=i for r in summary['optimizer'])/5 for i in range(1,301)],where='post');axes[1].set(xlabel='Evaluation budget',ylabel='Runs with at least one pass (%)',ylim=(-2,102),title='Cumulative first-pass rate');fig.savefig(OUT/'optimizer.png',dpi=170);plt.close(fig)
# Actual score and best-so-far at requested checkpoints, matched seeds only, no missing-run imputation.
summary['checkpoints']=[];checkpointRows=[]
for k in [1,3,5,10]:
 for mode in ['optimizer','no-notes','notes']:
  es=[e for e in (opt['experiments'] if mode=='optimizer' else agents['experiments']) if e.get('seed',e.get('config',{}).get('seed')) in [42,43,44] and (mode=='optimizer' or e['config']['ablation']==mode)]
  values=[quality(e['attempts'][k-1]) if len(e['attempts'])>=k else None for e in es];best=[max(map(quality,e['attempts'][:k])) if len(e['attempts'])>=k else None for e in es];present=[v for v in values if v is not None]
  row={'attempt':k,'controller':mode,'seeds':[42,43,44],'scores':values,'bestSoFar':best,'mean':float(np.mean(present)) if present else None,'sampleSD':float(np.std(present,ddof=1)) if len(present)>1 else None,'n':len(present)};summary['checkpoints'].append(row)
  checkpointRows.append([k,mode,' / '.join(f'{v:.1f}' if v is not None else '—' for v in values),f'{row["mean"]:.1f} ± {row["sampleSD"]:.1f}' if len(present)==3 else f'n={len(present)}',' / '.join(f'{v:.1f}' if v is not None else '—' for v in best)])
summary['agentAttempts']=[{'seed':e['config']['seed'],'mode':e['config']['ablation'],'attempts':[{'number':a['number'],'score':quality(a),'passed':ev(a).get('passed',False),'shapeIoU':ev(a).get('shapeIoU'),'boundaryF1':ev(a).get('boundaryF1'),'precision':ev(a).get('precision'),'concavityEmptyFraction':ev(a).get('concavityEmptyFraction'),'failedChecks':ev(a).get('failedChecks',[]),'outcome':a['outcome'],'formatErrors':a.get('formatErrors',[]),'repairCalls':a.get('formatRepairCalls',0),'costUSD':a.get('costUSD')} for a in e['attempts']]} for e in agents['experiments']]
optTable=table(['Seed','First pass / 300','Pass count','Best score'],[[r['seed'],r['firstPass'] or 'not reached',r['passes'],r['bestScore']] for r in summary['optimizer']])
agentTable=table(['Mode','Seed','Attempts','First pass','Best score','Format errors / repairs / rejections','Cost upper estimate','Mean cost / attempt','Cost to first pass'],[[r['mode'],r['seed'],r['attempts'],r['firstPass'] or 'not reached',r['bestScore'],f'{r["formatErrors"]} / {r["repairCalls"]} / {r["rejected"]}',money(r['totalCostUSD']),money(r['totalCostUSD']/r['attempts']) if r['attempts'] and r['totalCostUSD'] is not None else 'unknown',money(r['costToFirstPassUSD']) if r['firstPass'] else 'not reached'] for r in summary['agents']])
passTable=table(['Controller','Seed','Attempt','Visual review'],[[p['controller'],p['seed'],p['attempt'],p['visualReview']] for p in passes]) if passes else '<p>No new numerical passes from either controller; there are no pass PNGs to inspect.</p>'
passLinks=' · '.join(f'<a href="{p["png"]}">{p["id"]}</a>' for p in passes)
htmlText=f'''<!doctype html><meta charset="utf-8"><title>Latte Bench — concavity pilot</title><style>body{{max-width:1120px;margin:40px auto;padding:0 24px;background:#f6f4ec;color:#303a2e;font:15px/1.6 system-ui}}section{{background:#fffdf7;padding:24px;margin:24px 0;border:1px solid #dce0d4;border-radius:12px}}h1,h2{{font-weight:550}}img{{width:100%;height:auto}}table{{border-collapse:collapse;width:100%;font-size:12px}}td,th{{padding:8px 5px;border-bottom:1px solid #dce0d4;text-align:left}}a{{color:#426747}}</style>
<h1>Heart rerun: concavity + structured plans + frontier model</h1><p>v0.6 · 32×32 · same 33 physical parameters and milk schedules · heart only · {'Complete' if summary['completed'] else 'Incomplete / running or capped'}</p>
<p><strong>Observed passes:</strong> {sum(r['passes'] for r in summary['optimizer'])}/1500 CMA-ES; {sum(r['passes'] for r in summary['agents'] if r['mode']=='no-notes')}/30 agent without notes; {sum(r['passes'] for r in summary['agents'] if r['mode']=='notes')}/30 agent with notes. Conservative API cost estimate {money(upper)} of $20.</p>
<section><h2>Scorer regression</h2><p>Build the convex hull of target foreground cell centres and rasterize it on the same grid. Hull minus target defines the concave cells. At least 80% must be empty (foam density below 0.25), using the same rule for every shape. Empty concavity sets pass vacuously. Existing heart IoU, boundary and precision thresholds are unchanged. Display score and optimizer shape objective now use min(IoU, boundary F1, concavity empty fraction); serving penalties remain unchanged.</p><p>The current heart has only one such cell, so this is a binary, low-resolution notch check, not a guarantee of recognisable heart art. Both old CMA-ES false positives fill it. The reviewed reference does not.</p>{table(['Pour','IoU','Boundary F1','Concavity empty','New score','Verdict'],scorerRows)}<img src="scorer-check.png"></section>
<section><h2>CMA-ES rerun</h2><p>Five independent seeds 42–46, 300 evaluations each. Same generic starting vector, sigma 0.23 and population 8. One evaluation per new candidate on the next randomized milk episode; no reference initialization or repeated candidate averaging.</p>{optTable}<img src="optimizer.png"><img src="optimizer-best.png"><p>Visual inspection of all five best-score candidates: irregular patches, ovals or blobs; none has a convincing heart silhouette.</p><p>The one-cell concavity check makes the score drop to zero whenever that cell is filled. This creates a discontinuous objective and can flatten CMA-ES's search landscape. A model/optimizer gap under this scorer is not by itself evidence that notes teach a transferable skill.</p></section>
<section><h2>Frontier agent</h2><p>Requested and catalogue-listed model: <strong>GPT-6 Astra</strong>, identified as OpenAI's most capable model in <a href="https://developers.openai.com/api/docs/models/gpt-6-astra">official documentation</a>. Planning uses medium reasoning, reflection low reasoning, with completion caps 4096 / 2048 including reasoning tokens. Same 3 seeds, 10 episode slots each in no-notes and notes modes. Both modes reflect; no-notes discards its note. No reference plan is supplied.</p><p>Strict JSON Schema: exactly 33 finite normalized values in [0,1], no extra keys. Each parameter's units, physical bounds, meaning and decoding formula are documented in <a href="agent-input.json">the planning payload</a>. Malformed or out-of-bounds submissions receive the validation error and up to two corrections within the same episode, without physics execution or extra attempt charge. All provider calls still count toward $20; format errors and terminal rejections are separate logs. No simulator, scorer, threshold or prompt tuning during the rerun.</p>{agentTable}<p>Calls: {len(entries)}. Conservative token cost upper estimate: <strong>{money(upper)}</strong>; pending/unresolved reserve {money(reserve)}. Standard usage-detail estimate (fresh input $10/M, cache reads $1/M, writes $12.50/M, output including reasoning $50/M): {money(priceEstimate)}. Gateway dollar costs may be absent; token-derived amounts are not invoices. Cap $20, checked before every call using a reserved upper bound, including format repairs. Stop reason: {html.escape(str(agents['ledger'].get('reason') or 'none'))}.</p></section>
<section><h2>Matched checkpoints: attempts 1, 3, 5 and 10</h2><p>Scores below are the actual attempt at that index, not the maximum. The separate last column is best-so-far. All use identical milk episodes on seeds 42–44. Rejected plans count as zero in summary statistics but have red X markers in plots; valid zero scores use circles. SD is sample standard deviation across three seeds. Missing attempts are not imputed.</p><img src="matched-scores.png">{table(['Attempt','Controller','Actual scores: 42 / 43 / 44','Mean ± SD','Best-so-far: 42 / 43 / 44'],checkpointRows)}</section>
<section><h2>First and best attempts</h2>{''.join(f'<img src="agent-seed-{seed}.png">' for seed in [42,43,44])}</section>
<section><h2>Every pass</h2>{passTable}{''.join(f'<img src="{name}">' for name in galleryPages)}<p>{passLinks}</p><p>All numerical passes are listed, including any that look wrong. Visual review does not retroactively alter the frozen score.</p></section>
<section><h2>Interpretation limits</h2><p>Only three matched agent seeds were tested. A first-attempt pass is evidence of a useful prior, not feedback-driven learning: both modes begin without notes. Notes retain feedback between attempts, but this pilot does not test held-out milk or held-out shapes, train model weights, or verify gateway-side memory isolation. The scorer, interface and model changed together from the previous pilot, so cross-pilot improvements cannot isolate their individual effects. The concavity gate is only one cell for this target; visual reviews remain essential.</p><p>A pass requires all shape and serving checks. The dashed 78.26% score floor is necessary but not sufficient; an 83% shape can still fail because of boundary, precision or spills. No thresholds were adjusted after seeing pilot outputs.</p></section>
<p><a href="summary.json">Summary and per-attempt records</a> · <a href="scorer-check.json">Scorer regression evidence</a> · <a href="verification.json">Independent verification</a>. Full plans, foam fields, traces, responses, schemas and cost ledger: results/heart-pilot-v2/. Tulip was dropped from this rerun.</p>'''
(OUT/'report.html').write_text(htmlText);(OUT/'summary.json').write_text(json.dumps(summary,indent=2));(OUT/'passes.json').write_text(json.dumps(summary['passes'],indent=2));print(json.dumps({'completed':summary['completed'],'passes':len(passes),'billing':summary['billing'],'checkpoints':summary['checkpoints']},indent=2))
