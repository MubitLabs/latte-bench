# /// script
# dependencies = ["pillow==13.0.0", "matplotlib==3.10.8", "numpy==2.2.6"]
# ///
import json,pathlib,math,html
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from PIL import Image,ImageDraw,ImageFont
ROOT=pathlib.Path(__file__).resolve().parent.parent;DATA=ROOT/'results/heart-frozen-v3';OUT=DATA/'report';OUT.mkdir(parents=True,exist_ok=True)
protocol=json.loads((ROOT/'experiments/heart-frozen-v3.json').read_text());opt=json.loads((DATA/'optimizer.json').read_text());check=json.loads((ROOT/'docs/heart-frozen-v3/scorer-check.json').read_text())
agents=json.loads((DATA/'agents.json').read_text()) if (DATA/'agents.json').exists() else {'completed':False,'experiments':[],'ledger':{'entries':[],'halted':False}}
def score(a):return (a.get('evaluation') or {}).get('score',0)
def passed(a):return (a.get('evaluation') or {}).get('passed',False)
def font(n):
 try:return ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',n)
 except OSError:return ImageFont.load_default(size=n)
def tiles(items,name,title,columns=4):
 size=192;gap=18;top=90;cols=min(columns,len(items));rows=math.ceil(len(items)/cols)
 im=Image.new('RGB',(gap+(size+gap)*cols,top+(size+66)*rows),'#f6f4ec');d=ImageDraw.Draw(im);d.text((18,12),title,font=font(18),fill='#303a2e')
 for k,(label,values) in enumerate(items):
  x=gap+(k%cols)*(size+gap);y=top+(k//cols)*(size+66);d.multiline_text((x,y-40),label,font=font(11),fill='#303a2e')
  small=Image.new('RGB',(32,32));pixels=[]
  for i,v in enumerate(values):
   outside=math.hypot((i%32+.5)/16-1,(i//32+.5)/16-1)>=.985
   pixels.append((224,219,203) if outside else tuple(round(lo+(hi-lo)*max(0,min(1,v))) for lo,hi in zip((92,53,31),(255,248,223))))
  small.putdata(pixels);im.paste(small.resize((size,size),Image.Resampling.NEAREST),(x,y))
 d.text((18,im.height-22),'Actual 32×32 foam · no smoothing',font=font(11),fill='#58614f');im.save(OUT/name)
def table(headers,rows):return '<table><tr>'+''.join(f'<th>{html.escape(str(h))}</th>' for h in headers)+'</tr>'+''.join('<tr>'+''.join(f'<td>{html.escape(str(v))}</td>' for v in row)+'</tr>' for row in rows)+'</table>'
groups=[('CMA-ES',opt['experiments'],'#747d86')]
palette=['#287258','#89a267','#b0633f','#d8a267']
for model in protocol['models']:
 for mode in protocol['modes']:
  group=[e for e in agents['experiments'] if e['model']==model['id'] and e['config']['ablation']==mode]
  groups.append((model['id']+' / '+mode,group,palette.pop(0)))
summary={'schema':protocol['schema'],'completed':agents.get('completed',False),'identity':opt['identity'],'groups':[],'passes':[]}
fig,axes=plt.subplots(1,3,figsize=(15,4.7),layout='constrained');fig.patch.set_facecolor('#f6f4ec')
for ax in axes:ax.set_facecolor('#fffdf7');ax.spines[['top','right']].set_visible(False);ax.grid(alpha=.15);ax.set(xlabel='Attempts / evaluations',xticks=[1,3,5,10],ylim=(-3,103))
passes=[]
for label,es,color in groups:
 curves=[];seedRows=[];totalPass=0;totalAttempts=0;totalCost=0;costKnown=True;formats=0;rejections=0
 for e in es:
  a=e['attempts'];seed=e.get('seed',e.get('config',{}).get('seed'));first=next((x['number'] for x in a if passed(x)),None)
  costs=[x.get('costUSD') for x in a];known=all(c is not None for c in costs);totalCost+=sum(c or 0 for c in costs);costKnown&=known
  totalAttempts+=len(a);totalPass+=sum(map(passed,a));formats+=sum(len(x.get('formatErrors',[])) for x in a);rejections+=sum(x.get('outcome')=='Rejected' for x in a)
  seedRows.append({'seed':seed,'attempts':len(a),'firstPass':first,'passes':sum(map(passed,a)),'bestScore':max(map(score,a),default=0),'costUSD':sum(costs) if known else None,'costToFirstPassUSD':sum(costs[:first]) if first and known else None,'scores':[score(x) for x in a],'costsUSD':costs,'outcomes':[x.get('outcome') for x in a]})
  for x in a:
   if passed(x):passes.append({'controller':label,'seed':seed,'attempt':x['number'],'score':score(x),'surface':x['surface']})
 for k in range(1,11):
  available=[e for e in es if len(e['attempts'])>=k]
  best=[max(map(score,e['attempts'][:k])) for e in available]
  curves.append({'attempt':k,'n':len(available),'bestMean':float(np.mean(best)) if best else None,'bestSD':float(np.std(best,ddof=1)) if len(best)>1 else None,'bestPerSeed':best,'attemptPassRate':sum(passed(e['attempts'][k-1]) for e in available)/len(available) if available else None,'everPassRate':sum(any(passed(x) for x in e['attempts'][:k]) for e in available)/len(available) if available else None})
 complete=[r for r in curves if r['n']==5]
 if complete:
  x=[r['attempt'] for r in complete];mean=np.array([r['bestMean'] for r in complete]);sd=np.array([r['bestSD'] for r in complete])
  axes[0].plot(x,mean,label=label,color=color);axes[0].fill_between(x,np.maximum(0,mean-sd),np.minimum(100,mean+sd),color=color,alpha=.09)
  axes[1].plot(x,[100*r['attemptPassRate'] for r in complete],'-o',ms=3,color=color)
  axes[2].step(x,[100*r['everPassRate'] for r in complete],where='post',color=color)
 summary['groups'].append({'controller':label,'attempts':totalAttempts,'passes':totalPass,'passRate':totalPass/totalAttempts if totalAttempts else None,'seedsPassed':sum(r['firstPass'] is not None for r in seedRows),'costUSD':totalCost if costKnown else None,'meanCostUSD':totalCost/totalAttempts if totalAttempts and costKnown else None,'formatErrors':formats,'rejections':rejections,'seeds':seedRows,'curves':curves})
axes[0].set(title='Best-so-far score · mean ± sample SD',ylabel='Score (%)');axes[0].axhline(78.26,color='#aaa',ls='--',lw=.8)
axes[1].set(title='Pass rate on that attempt',ylabel='Passing episodes (%)');axes[2].set(title='Seeds with a pass by this budget',ylabel='Seeds (%)')
handles,labels=axes[0].get_legend_handles_labels();fig.legend(handles,labels,loc='outside lower center',ncol=3,fontsize=8);fig.savefig(OUT/'curves.png',dpi=170);plt.close(fig)
tiles([('Target',check['target']),('Reference · 85.8% · PASS',check['reference']['surface'])]+[(f'Old oval seed {r["seed"]}\n{r["evaluation"]["score"]}% · FAIL',r['surface']) for r in check['rows']],'scorer-check.png','Graded penalty regression')
reviews=json.loads((OUT/'visual-review.json').read_text()) if (OUT/'visual-review.json').exists() else {}
for p in passes:
 stem='pass-'+p['controller'].replace(' / ','-').replace('.','_')+f'-seed-{p["seed"]}-attempt-{p["attempt"]}'
 p['id']=stem;p['png']=stem+'.png';p['review']=reviews.get(stem,'Awaiting visual inspection')
 tiles([('Target',check['target']),(f'{p["controller"]}\nSeed {p["seed"]} / {p["attempt"]} · {p["score"]}%',p['surface'])],p['png'],'Target and numerical pass',columns=2)
 summary['passes'].append({k:v for k,v in p.items() if k!='surface'})
galleries=[]
for i in range(0,len(passes),12):
 name=f'passes-{i//12+1}.png';galleries.append(name)
 tiles([(f'{p["controller"]}\n{p["seed"]} / {p["attempt"]} · {p["score"]}%',p['surface']) for p in passes[i:i+12]],name,'All numerical passes')
entries=agents['ledger']['entries'];upper=sum(e.get('costUSD',0) for e in entries);reserved=sum(e['reservedUSD'] for e in entries if e.get('costUSD') is None);standard=0
for entry in entries:
 if entry.get('status')!='completed':continue
 rates=next(m['standardRates'] for m in protocol['models'] if m['id']==entry['model']);u=entry['response']['usage'];d=u.get('prompt_tokens_details',{});cached=d.get('cached_tokens',0);writes=d.get('cache_write_tokens',0)
 standard+=(max(0,u['prompt_tokens']-cached-writes)*rates['input']+cached*rates['cached']+writes*rates['cacheWrite']+u['completion_tokens']*rates['output'])/1e6
summary['billing']={'upperUSD':upper,'standardEstimateUSD':standard,'unresolvedReserveUSD':reserved,'calls':len(entries),'capUSD':50,'halted':agents['ledger'].get('halted'),'reason':agents['ledger'].get('reason')}
money=lambda x:f'${x:.5f}' if x is not None else 'unknown'
rows=[[g['controller'],g['attempts'],g['passes'],f'{100*g["passRate"]:.1f}%' if g['passRate'] is not None else '—',f'{g["seedsPassed"]}/5',money(g['costUSD']),money(g['meanCostUSD']),g['formatErrors'],g['rejections']] for g in summary['groups']]
seedRows=[[g['controller'],r['seed'],r['firstPass'] or 'not reached',r['bestScore'],money(r['costToFirstPassUSD']) if r['firstPass'] else 'not reached'] for g in summary['groups'] for r in g['seeds']]
page=f'''<!doctype html><meta charset="utf-8"><title>Latte Bench — frozen two-model heart run</title><style>body{{max-width:1180px;margin:40px auto;padding:0 24px;background:#f6f4ec;color:#303a2e;font:15px/1.6 system-ui}}section{{background:#fffdf7;padding:24px;margin:24px 0;border:1px solid #dce0d4;border-radius:12px}}h1,h2{{font-weight:550}}img{{max-width:100%;height:auto}}table{{border-collapse:collapse;width:100%;font-size:12px}}th,td{{text-align:left;padding:7px;border-bottom:1px solid #dde1d4}}a{{color:#426747}}</style>
<h1>Frozen heart benchmark · two models</h1><p>{'Complete' if summary['completed'] else 'Running / partial'} · {html.escape(opt['identity']['tag'])} · commit <code>{opt['identity']['commit']}</code> · 5 matched seeds × 10 attempts, each model with and without notes; one shared CMA-ES baseline.</p>
<section><h2>Results</h2>{table(['Controller','Attempts','Passes','Episode pass rate','Seeds ever passed','Cost upper estimate','Cost / attempt','Format errors','Rejected'],rows)}<img src="curves.png"><p>Best-so-far lines are means across five seeds; shaded bands are sample SD, not confidence intervals. Pass rate per attempt and cumulative seed success are distinct. No missing seeds are imputed. Dashed score floor 78.26% is necessary but not sufficient: contour, precision and serving constraints also apply. CMA-ES has ten evaluations per seed, so this is a sample-efficiency comparison, not an estimate of its eventual ceiling.</p></section>
<section><h2>Frozen fixes</h2><p>No-notes planning receives exactly a fresh target, current revealed milk volume/temperature and parameter guide. Runtime equality checks reject anything else; poisoned-history regression tests cover notes, plans, feedback and stored history. Reflection sees only the current episode and is discarded by the control. Requests use fresh messages, store:false, no shared conversation/session identifiers and no memory SDK. Client isolation is verified; gateway-side routing or memory injection cannot be independently certified.</p><p>Quality = 100 × max(0, min(IoU, boundary F1) − 0.25 × mean raw foam density in hull(target) minus target). No binary concavity veto. Quality must reach 78.26%, alongside unchanged shape/serving thresholds. Reference 85.8% passes; old oval seeds 42/46 score 60.5%/58.9% and fail. This target still has one concavity cell; density makes its penalty graded, but IoU and contour still use a binary mask. Visual quality remains imperfect.</p><img src="scorer-check.png"></section>
<section><h2>Cost and protocol</h2><p>Completed calls: {sum(e.get('status')=='completed' for e in entries)} / {len(entries)}. Conservative standard-rate usage bound {money(upper)}; pending/unresolved reservation {money(reserved)}; total cap $50. Standard usage-detail estimate {money(standard)}. These are token-derived estimates, not invoices. All pending requests reserve their full maximum charge before concurrent dispatch. No automatic paid retries. Stop reason: {html.escape(str(agents['ledger'].get('reason') or 'none'))}.</p><p><a href="https://developers.openai.com/api/docs/models/gpt-6-astra">Astra pricing</a> · <a href="https://developers.openai.com/api/docs/models/gpt-6.1-sol">Sol pricing</a>. Both use medium reasoning for plans and low for notes; 4096/2048 completion-token limits. Up to two within-attempt format repairs; every call is billed against the shared cap. Same physical 33-parameter space and milk episodes for all arms. No reference warm start, post-freeze tuning, held-out tests or model-weight training.</p>{table(['Controller','Seed','First passing attempt','Best score','Cost to first pass'],seedRows)}</section>
<section><h2>Every numerical pass</h2>{table(['Controller','Seed','Attempt','Score','Visual review'],[[p['controller'],p['seed'],p['attempt'],p['score'],p['review']] for p in passes])}{''.join(f'<img src="{g}">' for g in galleries)}<p>{' · '.join(f'<a href="{p["png"]}">{p["id"]}</a>' for p in passes)}</p></section>
<p><a href="summary.json">Complete metrics</a> · <a href="verification.json">Independent verification</a>. Raw calls, plans, paths, foam fields and ledger are preserved under results/heart-frozen-v3. No learning or transfer claim follows from this small pilot alone.</p>'''
(OUT/'report.html').write_text(page);(OUT/'summary.json').write_text(json.dumps(summary,indent=2));print(json.dumps({'completed':summary['completed'],'billing':summary['billing'],'groups':[{k:v for k,v in g.items() if k not in ['seeds','curves']} for g in summary['groups']],'passes':len(passes)},indent=2))
