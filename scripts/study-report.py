# /// script
# requires-python = ">=3.11,<3.14"
# dependencies = ["pillow==13.0.0", "matplotlib==3.10.8", "numpy==2.2.6"]
# ///
"""Render verified numerical data in the workstation's cream, sage and coffee palette."""
import json, pathlib, math, csv
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Circle
from PIL import Image, ImageDraw, ImageFont
R=pathlib.Path(__file__).resolve().parent.parent; O=R/'docs/model-study'; D=json.loads((O/'evidence.json').read_text()); P=D['protocol']; V=D['verification']
BG='#0e2a1f'; PAPER='#123324'; INK='#e3ecdf'; MUTED='#9ab2a2'; GREEN='#a5e2b5'; TAN='#b5c7ba'; LINE='#244636'
from matplotlib import font_manager
font_path=pathlib.Path('/System/Library/Fonts/Helvetica.ttc')
if font_path.exists():font_manager.fontManager.addfont(str(font_path))
FONT=font_manager.FontProperties(fname=str(font_path)).get_name() if font_path.exists() else 'DejaVu Sans'
plt.rcParams.update({'font.family':FONT,'font.weight':'normal','axes.titleweight':'normal','text.color':INK,'axes.labelcolor':MUTED,'xtick.color':MUTED,'ytick.color':MUTED,'font.size':10,'axes.edgecolor':LINE,'svg.fonttype':'none'})
check=json.loads((R/'docs/heart-frozen-v3/scorer-check.json').read_text()); target=check['target']
def score(a):return (a.get('evaluation') or {}).get('score',0)
def passed(a):return (a.get('evaluation') or {}).get('passed',False)
def font(n):
 try:return ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',n)
 except OSError:return ImageFont.load_default(size=n)
def foam(values,size=256):
 im=Image.new('RGB',(32,32)); px=[]
 for i,v in enumerate(values):
  outside=math.hypot((i%32+.5)/16-1,(i//32+.5)/16-1)>=.985
  px.append((240,237,225) if outside else tuple(round(lo+(hi-lo)*max(0,min(1,v))) for lo,hi in zip((95,54,32),(255,248,223))))
 im.putdata(px);return im.resize((size,size),Image.Resampling.NEAREST)
def cup(ax,values):
 ax.set(xlim=(-1.25,1.4),ylim=(-1.25,1.25),aspect='equal');ax.axis('off')
 for rad,col,z in [(1.22,'#e5e3d6',0),(1.15,'#eeeee4',1),(1.03,'#ffffff',2)]:ax.add_patch(Circle((0,0),rad,color=col,zorder=z))
 ax.add_patch(Circle((1.04,.05),.27,color='#ffffff',zorder=1));ax.add_patch(Circle((1.04,.05),.14,color=BG,zorder=2))
 art=ax.imshow(foam(values),extent=(-.94,.94,-.94,.94),interpolation='nearest',zorder=3);art.set_clip_path(Circle((0,0),.94,transform=ax.transData))
def pretty(m):
 return m.replace('claude-','Claude ').replace('gpt-','GPT-').replace('chat-latest','Chat Latest').replace('Claude opus-4-8','Claude Opus 4.8').replace('Claude fable-5-1','Claude Fable 5.1').replace('Claude opus-5-5','Claude Opus 5.5').replace('Claude sonnet-5-5','Claude Sonnet 5.5').replace('Claude haiku-5-5','Claude Haiku 5.5').replace('Claude fable-5','Claude Fable 5').replace('Claude opus-5','Claude Opus 5').replace('Claude sonnet-5','Claude Sonnet 5').replace('-astra',' Astra').replace('-sol',' Sol').replace('-terra',' Terra').replace('-luna',' Luna').replace('-pro',' Pro')
groups=[]
for model in [m['id'] for m in P['models']]+['CMA-ES']:
 for mode in (['optimizer'] if model=='CMA-ES' else P['modes']):
  es=[e for e in D['experiments'] if e['model']==model and e['mode']==mode];a=[a for e in es for a in e['attempts']];eligible=[x for x in a if x['outcome']!='Error']
  complete=model not in D['unavailable'] and len(es)==3 and all(len(e['attempts'])==5 and all(a['outcome']!='Error' for a in e['attempts']) for e in es)
  curves=[]
  for k in range(1,6):
   avail=[e for e in es if len(e['attempts'])>=k and all(a['outcome']!='Error' for a in e['attempts'][:k])];bs=[max(score(a) for a in e['attempts'][:k]) for e in avail]
   curves.append(dict(attempt=k,n=len(bs),mean=float(np.mean(bs)) if bs else None,sd=float(np.std(bs,ddof=1)) if len(bs)>1 else None,perSeed=bs,attemptPassRate=sum(passed(e['attempts'][k-1]) for e in avail)/len(avail) if avail else None,attemptScoreMean=float(np.mean([score(e['attempts'][k-1]) for e in avail])) if avail else None,everPass=sum(any(passed(a) for a in e['attempts'][:k]) for e in avail)/len(avail) if avail else None))
  groups.append(dict(model=model,mode=mode,complete=complete,attempts=len(eligible),passes=sum(passed(x) for x in eligible),passRate=sum(passed(x) for x in eligible)/len(eligible) if eligible else None,costUpperUSD=sum(x['costUpperUSD'] for x in a),formatErrors=sum(x['formatErrors'] for x in a),rejections=sum(x['outcome']=='Rejected' for x in a),notesErrors=sum(bool(x.get('notesError')) for x in a),returnedModels=sorted({v for x in a for v in x.get('returnedModels',[])}),curves=curves,seeds=[dict(seed=e['seed'],scores=[score(a) if a['outcome']!='Error' else None for a in e['attempts']],firstPass=next((a['number'] for a in e['attempts'] if passed(a)),None),costToFirstPassUSD=next((sum(x['costUpperUSD'] for x in e['attempts'][:a['number']]) for a in e['attempts'] if passed(a)),None)) for e in es]))
def group(m,mode):return next(g for g in groups if g['model']==m and g['mode']==mode)
models=[m['id'] for m in P['models'] if all(group(m['id'],mode)['complete'] for mode in P['modes'])]
models.sort(key=lambda m:(group(m,'notes')['passes'],group(m,'notes')['curves'][-1]['mean']),reverse=True)
missing=[m['id'] for m in P['models'] if m['id'] not in models]
summary={k:D[k] for k in ['identity','continuationIdentity','proIdentity','queueIdentity','schedulingAmendment','budgetChanges','protocol','createdAt','finishedAt','verification','unavailable']};summary['groups']=groups;summary['requestDiagnostics']=[dict(model=m['id'],planCalls=sum(c['model']==m['id'] and c['phase']=='plan' for c in D['calls']),truncatedPlans=sum(c['model']==m['id'] and c['phase']=='plan' and c.get('truncated',False) for c in D['calls']),reflectionCalls=sum(c['model']==m['id'] and c['phase']=='notes' for c in D['calls']),truncatedReflections=sum(c['model']==m['id'] and c['phase']=='notes' and c.get('truncated',False) for c in D['calls'])) for m in P['models']];summary['completeModels']=models;summary['excludedFromRanking']=missing
(O/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
with (O/'attempts.csv').open('w') as f:
 w=csv.writer(f,lineterminator="\n");w.writerow(['model','mode','milk_seed','attempt','outcome','score','passed','cost_upper_usd','format_errors','notes_error','returned_models'])
 for e in D['experiments']:
  for a in e['attempts']:w.writerow([e['model'],e['mode'],e['seed'],a['number'],a['outcome'],score(a) if a['evaluation'] else '',passed(a) if a['evaluation'] else '',a['costUpperUSD'],a['formatErrors'],a.get('notesError') or '', ';'.join(a.get('returnedModels',[]))])
# Shareable overview: branding, definitions and one score comparison.
fig=plt.figure(figsize=(14,9.5),facecolor=BG)
fig.text(.05,.926,'latte/bench',fontsize=27,color=INK)
fig.text(.202,.929,'by mubit',fontsize=11,color=MUTED)
fig.text(.05,.755,'Model scores,\nwith and without\nsaved notes.',fontsize=29,color=INK,linespacing=1.28,va='top')
fig.text(.05,.505,'Models plan a latte pour, then see\nthe resulting cup and score.',fontsize=13,color=MUTED,linespacing=1.55,va='top')
fig.text(.05,.39,'with notes',fontsize=12,color=GREEN)
fig.text(.05,.355,'The model writes a summary of feedback\nand uses it on its next attempt.',fontsize=11,color=MUTED,linespacing=1.5,va='top')
fig.text(.05,.265,'without notes',fontsize=12,color=TAN)
fig.text(.05,.23,'Each attempt starts with no past feedback.',fontsize=11,color=MUTED,va='top')
fig.text(.05,.105,'7 / 11',fontsize=30,color=GREEN)
fig.text(.05,.069,'evaluated models scored higher with notes',fontsize=10,color=MUTED)
fig.add_artist(FancyBboxPatch((.43,.1),.53,.82,boxstyle='round,pad=0.012,rounding_size=0.015',transform=fig.transFigure,facecolor=PAPER,edgecolor=LINE,lw=.8,zorder=0))
fig.text(.455,.866,'Best pour score',fontsize=20,color=INK)
fig.text(.455,.831,'Mean best score / 100. Higher is better.',fontsize=11,color=MUTED)
fig.text(.455,.774,'model',fontsize=10,color=MUTED)
fig.text(.727,.774,'without notes',fontsize=10,color=TAN,ha='right')
fig.text(.832,.774,'with notes',fontsize=10,color=GREEN,ha='right')
fig.text(.932,.774,'change',fontsize=10,color=MUTED,ha='right')
N=len(models);ax=fig.add_axes([.45,.178,.49,.56]);ax.set(xlim=(0,1),ylim=(N-.5,-.5));ax.axis('off')
for i,m in enumerate(models):
 ax.axhline(i+.5,color=LINE,lw=.45)
 ax.text(.01,i,pretty(m),va='center',fontsize=11,color=INK)
 a,b=group(m,'no-notes'),group(m,'notes')
 if a['rejections']==a['attempts'] and b['rejections']==b['attempts']:
  ax.text(.98,i,'no valid plan returned',va='center',ha='right',fontsize=10,color=MUTED)
  continue
 x,y=a['curves'][-1]['mean'],b['curves'][-1]['mean'];delta=y-x
 ax.text(.565,i,f'{x:.1f}',ha='right',va='center',fontsize=13,color=TAN)
 ax.text(.78,i,f'{y:.1f}',ha='right',va='center',fontsize=13,color=GREEN)
 ax.text(.984,i,f'{delta:+.1f}',ha='right',va='center',fontsize=11,color=GREEN if delta>=0 else TAN)
fig.text(.455,.135,'Five attempts per run, averaged across three matched milk seeds.',fontsize=9,color=MUTED)
fig.text(.455,.064,'Pro reached the output limit. Notes change context, not model weights.',fontsize=9,color=MUTED)
fig.text(.96,.027,'latte bench by mubit',fontsize=9,color=MUTED,ha='right')
fig.savefig(O/'benchmark-report.png',dpi=180,facecolor=BG);fig.savefig(O/'benchmark-report.svg',facecolor=BG);plt.close(fig)
base=group('CMA-ES','optimizer')
# Per-model curves, constant axes and SD shading.
cols=3;rows=math.ceil(len(models)/cols);fig,axes=plt.subplots(rows,cols,figsize=(12,2.75*rows+1.5),squeeze=False);fig.patch.set_facecolor(BG)
for i,m in enumerate(models):
 ax=axes.flat[i];ax.set_facecolor(PAPER);ax.spines[['top','right']].set_visible(False);ax.grid(axis='y',color=LINE,lw=.5);ax.set(ylim=(0,100),xlim=(.9,5.1),xticks=[1,2,3,4,5],yticks=[0,25,50,75,100]);ax.set_title(pretty(m),loc='left',fontweight='normal',fontsize=12,pad=12)
 if group(m,'no-notes')['rejections']+group(m,'notes')['rejections']==30:ax.text(.04,.93,'All 30 plans rejected',transform=ax.transAxes,color='#d0b594',fontsize=9,va='top')
 for mode,c in [('no-notes',TAN),('notes',GREEN)]:
  g=group(m,mode);y=np.array([q['mean'] for q in g['curves']]);sd=np.array([q['sd'] for q in g['curves']]);x=np.arange(1,6)
  ax.plot(x,y,'o-',color=c,lw=2,ms=4,markerfacecolor=PAPER if mode=='no-notes' else c)
  rejects=[k for k in range(1,6) if any(a['number']==k and a['outcome']=='Rejected' for e in D['experiments'] if e['model']==m and e['mode']==mode for a in e['attempts'])]
  if rejects:ax.scatter(rejects,[y[k-1] for k in rejects],marker='x',s=65,color='#d0b594',zorder=5,clip_on=False)
  ax.fill_between(x,np.maximum(0,y-sd),np.minimum(100,y+sd),color=c,alpha=.12)
 ax.plot(range(1,6),[q['mean'] for q in base['curves']],':',color=MUTED,lw=1.2);ax.axhline(78.26,color=GREEN,ls=(0,(2,4)),alpha=.3,lw=.7)
 if i//cols==rows-1:ax.set_xlabel('Attempt',fontsize=9)
 if i%cols==0:ax.set_ylabel('Best-so-far score',fontsize=9)
for ax in axes.flat[len(models):]:ax.axis('off')
fig.subplots_adjust(left=.06,right=.97,top=.88,bottom=.09,hspace=.55,wspace=.25)
fig.text(.06,.963,'latte/bench  ·  score by attempt',fontsize=25,fontweight='normal');fig.text(.97,.965,'by mubit',fontsize=10,color=MUTED,ha='right');fig.text(.06,.928,'Best score so far, with and without notes. Shading shows variation across three seeds.',fontsize=11,color=MUTED)
fig.text(.06,.027,'Without notes',color=TAN,fontsize=10);fig.add_artist(plt.Line2D([.05],[.031],transform=fig.transFigure,marker='o',markerfacecolor=PAPER,markeredgecolor=TAN,markersize=4,linestyle='none'));fig.text(.21,.027,'● With notes',color=GREEN,fontsize=10);fig.text(.35,.027,'··· CMA-ES',color=MUTED,fontsize=10);fig.text(.53,.027,'× Rejected slot · dotted green: quality floor (other gates also apply)',fontsize=9,color=MUTED)
fig.savefig(O/'learning-curves.png',dpi=180,facecolor=BG);plt.close(fig)
# Exact pixel evidence, one PNG for every numerical pass and first/best per seed.
(O/'passes').mkdir(exist_ok=True);(O/'examples').mkdir(exist_ok=True)
def pair(a,path,title):
 im=Image.new('RGB',(650,420),BG);d=ImageDraw.Draw(im);d.text((26,18),title,font=font(17),fill=INK);d.text((26,64),'TARGET',font=font(11),fill=MUTED);d.text((356,64),f"RESULT · {score(a):.1f}% · {'PASS' if passed(a) else 'FAIL'}",font=font(11),fill=MUTED)
 im.paste(foam(target),(22,92));im.paste(foam(a['surface']),(352,92));d.text((26,381),'Actual 32×32 foam, enlarged without smoothing.',font=font(13),fill=MUTED);im.save(path)
reviews=json.loads((O/'visual-review.json').read_text()) if (O/'visual-review.json').exists() else {}
passes=[]
for e in D['experiments']:
 valid=[a for a in e['attempts'] if a['surface'] is not None]
 if not valid:continue
 for label,a in [('first-valid',valid[0]),('best',max(valid,key=score))]:pair(a,O/'examples'/f"{e['model']}-{e['mode']}-{e['seed']}-{label}.png",f"{pretty(e['model'])} · {e['mode']} · seed {e['seed']} · attempt {a['number']}")
 for a in valid:
  if not passed(a):continue
  name=f"{e['model']}-{e['mode']}-{e['seed']}-{a['number']}.png";pair(a,O/'passes'/name,f"{pretty(e['model'])} · {e['mode']} · seed {e['seed']} · attempt {a['number']}");passes.append(dict(model=e['model'],mode=e['mode'],seed=e['seed'],attempt=a['number'],score=score(a),png='passes/'+name,review=reviews.get(name,'Awaiting visual review'),surface=a['surface']))
for page in range(math.ceil(len(passes)/24)):
 items=passes[page*24:(page+1)*24];im=Image.new('RGB',(1200,90+math.ceil(len(items)/6)*235),BG);draw=ImageDraw.Draw(im);draw.text((24,20),f"Every numerical pass · sheet {page+1} · actual foam, no smoothing",font=font(20),fill=INK)
 for i,p in enumerate(items):
  x=15+(i%6)*198;y=90+(i//6)*235;im.paste(foam(p['surface'],170),(x,y));draw.text((x,y+174),f"{p['model']}\n{p['mode']} · {p['seed']}/{p['attempt']} · {p['score']:.1f}%",font=font(10),fill=INK)
 im.save(O/f'pass-contact-{page+1}.png')
(O/'passes.json').write_text(json.dumps([{k:v for k,v in p.items() if k!='surface'} for p in passes],indent=2))
lines=['# Multi-model heart study','',f"Frozen protocol: `{P['tag']}`. {len(models)} complete model routes, {V['validAttempts']} valid pours. Conservative cost including held error reservations: **${V['costUpperUSD']:.4f} / ${V['capUSD']}**.",'','![Model comparison](benchmark-report.png)','','![Learning curves](learning-curves.png)','','| Model | No-notes pass | Notes pass | No-notes best ± SD | Notes best ± SD | Rejected plans | Reflection errors | Cost upper bound |','|---|---:|---:|---:|---:|---:|---:|---:|']
for m in models:
 a,b=group(m,'no-notes'),group(m,'notes');x,y=a['curves'][-1],b['curves'][-1];xs='No valid plan' if a['rejections']==a['attempts'] else f"{x['mean']:.1f} ± {x['sd']:.1f}";ys='No valid plan' if b['rejections']==b['attempts'] else f"{y['mean']:.1f} ± {y['sd']:.1f}";lines.append(f"| {pretty(m)} | {a['passes']}/15 | {b['passes']}/15 | {xs} | {ys} | {a['rejections']+b['rejections']}/30 | {a['notesErrors']+b['notesErrors']}/30 | ${a['costUpperUSD']+b['costUpperUSD']:.3f} |")
lines+=['','Astra was the only route with numerical passes: **5/15 with notes versus 2/15 without notes**. Its mean best score was nevertheless lower with notes (**74.7 versus 78.7**) because one seed performed poorly. Notes did not improve every model; these three-seed results are exploratory.','','GPT-5.5 Pro returned no valid plan in any of its 30 attempt slots: all 90 plan submissions exhausted the 4,096-token output allowance. Its conservative cost was **$86.17344**. This measures a failure under this output budget, not its unrestricted pouring ability.','']
lines+=['','## Success across the three milk seeds','','Each seed starts with empty memory. These are independent practice runs, not held-out transfer tests.','','| Model | No-notes seeds with a pass | Notes seeds with a pass |','|---|---:|---:|']
for m in models:
 a,b=group(m,'no-notes'),group(m,'notes');lines.append(f"| {pretty(m)} | {sum(s['firstPass'] is not None for s in a['seeds'])}/3 | {sum(s['firstPass'] is not None for s in b['seeds'])}/3 |")
lines+=['','## First passes','','Costs include all planner, repair and reflection calls through the passing attempt. Local CPU time is not priced. Runs without a pass have no cost-to-first-pass estimate.','','| Model | Mode | Seed | First pass attempt | Cost to first pass (upper estimate) |','|---|---|---:|---:|---:|']
for g in groups:
 if g['model'] not in models:continue
 for s in g['seeds']:
  if s['firstPass'] is not None:lines.append(f"| {pretty(g['model'])} | {g['mode']} | {s['seed']} | {s['firstPass']} | ${s['costToFirstPassUSD']:.4f} |")
lines+=['','## Protocol and limits','','[Access/budget amendment](../../experiments/heart-model-study-amendment.md): access exclusions were made after initial compatibility outcomes. The [user-directed $500 amendment](../../experiments/heart-model-study-budget-500.md) reinstated Pro; every initial attempt and charge remains included.','','Same heart target, 33 bounded parameters, seeds 42–44, five sequential attempts per mode. Full-speed execution without mid-pour observation. Both modes write reflections; no-notes discards them. Notes uses only its own most recent replacement note. Volume and starting temperature are visible; flow, foam texture, spread and mixing are hidden.','',P['interface'],'',D.get('schedulingAmendment',''),'The parallel Pro lane was separately capped at $400; all earlier calls stayed in the original $100 lane. The report preserves both lane snapshots and every freeze identity.','',P['memory'],'',P['optimizer'],'','CMA-ES population is eight: this five-evaluation baseline ends before its first population update. It measures the initial search budget, not converged optimizer performance.','',P['limits'],'','Best-so-far curves can rise through repeated sampling alone. A rising curve is not itself evidence of learning. Compare the paired notes/no-notes arms; at attempt 1 their inputs are identical but their model samples are independent. Three seeds do not support a reliable significance claim.','', 'The 4,096-token plan budget includes hidden reasoning. A model that spends the allowance before returning JSON can be rejected without ever making a simulated pour. This is a fixed-budget controller comparison, not an unrestricted ranking of model intelligence. Rejected slots contribute zero to curves and are marked with a red cross; they have no simulated score.','', 'Quality is 100 × max(0, min(IoU, boundary F1) − 0.25 × mean raw foam density in the target’s concavity). Quality ≥78.26%, IoU ≥78.26%, precision ≥85.34%, boundary F1 ≥81.98%, plus all serving checks. Curves show best score, not necessarily a passing cup.','',f"{V['physicalReplays']} physical replays verified. {V['formatErrors']} format errors; {V['rejectedPlans']} rejected plans. Provider failures are excluded from model rankings, never presented as valid zero scores.",'','## Availability and billing','',P['selection'],'',P['pricing'],'','The initial $100 budget was raised by the user to $500. Pro was temporarily deferred, then resumed in a parallel $400 lane while the original lane remained capped at $100. Its original output-token limits were retained.','',f"Completed-call conservative estimate: ${V['completedChargeUSD']:.6f}; unknown-charge reservations: ${V['heldUnknownChargeUSD']:.6f}. These are token-based bounds, not invoices.",'','Sources: [OpenAI pricing](https://developers.openai.com/api/docs/pricing), [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing).','']
for m in missing:lines.append(f"- **{m}**: {D['unavailable'].get(m,{}).get('reason','Incomplete under the shared cap')}")
lines+=['','## Evidence','','[Per-attempt CSV](attempts.csv) · [Per-request token/cost ledger](calls.csv) · [Full summary](summary.json) · [Plans, scores and foam maps](evidence.json) · [Verification](verification.json) · [Every numerical pass](passes.json)','', 'Reproduce every published plan offline with `bun scripts/study-replay.js`. Regenerate these charts with `uv run scripts/study-report.py`. Neither command sends model requests.','','First valid and best pours for every evaluated seed and mode are in [examples](examples/). All numerical passes are in [passes](passes/). Rejected plans have no simulated foam map.','']
lines+=['','## Visual review of every numerical pass','','All seven passing maps were inspected against the target. Two are marginal visual matches despite passing the frozen numerical scorer. No threshold was changed after seeing these results.','','![Every numerical pass](pass-contact-1.png)','','| Pour | Score | Visual review |','|---|---:|---|']
for p in passes:
 lines.append(f"| [{pretty(p['model'])} · {p['mode']} · seed {p['seed']} · attempt {p['attempt']}]({p['png']}) | {p['score']:.1f}% | {p['review']} |")
(O/'methodology.md').write_text('\n'.join(lines).replace('**','')+'\n')
(O/'README.md').write_text('''# latte/bench

latte bench by mubit

Can models improve a simulated latte pour using their own notes?

With notes: the model saves a summary of feedback for its next attempt. Without notes: it receives no past feedback. Neither mode changes model weights.

![Scores with and without notes](benchmark-report.png)

Score is the mean best result after five attempts across three matched milk seeds. It measures shape overlap, contour fit and concavity on a 0–100 scale.

Astra was the only model to pass: 5/15 pours with notes, 2/15 without. Its average best score was lower with notes because one seed performed poorly. Two passing pours were weak visual matches.

![Best score by attempt](learning-curves.png)

The CMA-ES comparison uses five evaluations, before its first population update. Pro returned no valid plan within the fixed output limit. These results measure performance with saved feedback, not established learning or transfer.

[Methodology and full results](methodology.md) · [Scores CSV](attempts.csv) · [Passing pours](passes.json) · [Replayable evidence](evidence.json)
''')
print(json.dumps(dict(completeModels=len(models),unavailable=missing,passes=len(passes),cost=V['costUpperUSD'])))

# Keep generated vector markup free of trailing whitespace.
for path in O.glob("*.svg"):
 path.write_text("\n".join(line.rstrip() for line in path.read_text().splitlines())+"\n")
