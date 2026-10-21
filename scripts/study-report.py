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
BG='#f3f1e9'; PAPER='#faf9f4'; INK='#263b2d'; MUTED='#737969'; GREEN='#41654c'; TAN='#bb8963'; LINE='#dddccf'
plt.rcParams.update({'font.family':'DejaVu Sans','text.color':INK,'axes.labelcolor':MUTED,'xtick.color':MUTED,'ytick.color':MUTED,'font.size':10,'axes.edgecolor':LINE,'svg.fonttype':'none'})
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
# Main README plate: deliberately composed rather than a default chart export.
height=max(12.5,6.5+.48*len(models));fig=plt.figure(figsize=(12,height),facecolor=BG)
fig.text(.065,.953,'LATTE BENCH   /   MODEL STUDY 01',fontsize=11,fontweight='bold',color=GREEN)
fig.text(.065,.922,'A little memory.\nA better pour?',fontsize=36,fontweight='bold',linespacing=1.12,va='top')
fig.text(.067,.815,'Heart · 3 seeds × 5 attempts · 4,096 output tokens per plan',fontsize=12,color=MUTED)
ax=fig.add_axes([.78,.795,.15,.17]);cup(ax,check['reference']['surface']);fig.text(.795,.796,'CALIBRATED REFERENCE',fontsize=8,color=MUTED)
# Compact metadata strip.
for k,(value,label) in enumerate([(str(len(models)),'MODELS COMPLETED'),(str(V['validAttempts']),'VALID POURS'),(f"${V['costUpperUSD']:.2f}",'CONSERVATIVE COST'),(f"${V['capUSD']}",'SPEND CEILING')]):
 x=.065+k*.225;fig.text(x,.762,value,fontsize=26,fontweight='bold');fig.text(x,.741,label,fontsize=8,color=MUTED)
fig.add_artist(plt.Line2D([.065,.94],[.718,.718],transform=fig.transFigure,color=LINE))
fig.text(.065,.691,'How often did the cup pass?',fontsize=19,fontweight='bold')
fig.text(.065,.666,'15 attempts per arm. Ranked by notes pass rate, then mean best score.',fontsize=10,color=MUTED)
fig.text(.665,.691,'Best score after five attempts',fontsize=14,fontweight='bold')
fig.text(.665,.666,'Mean across 3 seeds; whiskers show ±1 SD.',fontsize=9,color=MUTED)
# Shared row alignment, label column inside axis.
bottom=.19;top=.635;N=len(models);ax=fig.add_axes([.065,bottom,.56,top-bottom]);bx=fig.add_axes([.675,bottom,.245,top-bottom]);ys=np.arange(N)
for q in [ax,bx]:q.set_facecolor(BG);q.spines[:].set_visible(False);q.set_ylim(N-.5,-.5);q.tick_params(left=False,labelleft=False,bottom=False,labelbottom=False)
ax.set_xlim(-64,115);bx.set_xlim(0,103)
for i,m in enumerate(models):
 if i%2==0:
  ax.axhspan(i-.46,i+.46,color=PAPER,zorder=0);bx.axhspan(i-.46,i+.46,color=PAPER,zorder=0)
 rejected_total=group(m,'no-notes')['rejections']+group(m,'notes')['rejections']
 ax.text(-62,i-(.12 if rejected_total else 0),pretty(m),va='center',fontsize=11.5,fontweight='bold')
 if rejected_total:ax.text(-62,i+.22,f'{rejected_total}/30 rejected plans',va='center',fontsize=7.5,color='#a63e34')
 for mode,dy,c in [('no-notes',-.18,TAN),('notes',.18,GREEN)]:
  g=group(m,mode);val=100*g['passRate'];ax.barh(i+dy,val,height=.24,color=c,zorder=2)
  ax.text(max(1,val)+2,i+dy,f"{g['passes']}/15",va='center',fontsize=10.5,color=c)
  q=g['curves'][-1]
  if g['rejections']==g['attempts']:
   bx.plot(0,i+dy,marker='x',color='#a63e34',ms=7,clip_on=False);bx.text(6,i+dy,'No valid plan',va='center',fontsize=8,color='#a63e34')
  else:bx.errorbar(q['mean'],i+dy,xerr=q['sd'],fmt='o',color=c,ms=5,elinewidth=1.3,capsize=2)
for v in [0,25,50,75,100]:
 ax.axvline(v,color=LINE,lw=.7,zorder=0);ax.text(v,N-.05,f'{v}%',ha='center',fontsize=8,color=MUTED)
for v in [0,50,100]:bx.axvline(v,color=LINE,lw=.7,zorder=0);bx.text(v,N-.05,str(v),ha='center',fontsize=8,color=MUTED)
bx.axvline(78.26,color=GREEN,ls=(0,(2,3)),lw=.8,alpha=.5)
fig.text(.065,.15,'●  No notes',fontsize=11,color=TAN);fig.text(.20,.15,'●  Agent notes',fontsize=11,color=GREEN)
base=group('CMA-ES','optimizer');fig.text(.39,.15,f"CMA-ES baseline: {base['passes']}/15 passes · {base['curves'][-1]['mean']:.1f} mean best score",fontsize=10,color=MUTED)
fig.text(.065,.108,'ONE PLAN. ONE POUR. FEEDBACK AFTERWARDS.',fontsize=9,fontweight='bold')
fig.text(.065,.084,'Agent notes change the next prompt; no-notes receives no history. Changes to model weights are not measured.',fontsize=9,color=MUTED)
fig.text(.065,.063,'Fixed output budget, including reasoning. Three seeds, one shape. Numerical passes can have weak notches.',fontsize=9,color=MUTED)
fig.text(.065,.031,f"{len(missing)} restricted/incomplete routes excluded from rankings · frozen v0.7 scorer · actual 32×32 foam · 21 October 2026",fontsize=8,color=MUTED)
fig.savefig(O/'benchmark-report.png',dpi=180,facecolor=BG);fig.savefig(O/'benchmark-report.svg',facecolor=BG);plt.close(fig)
# Per-model curves, constant axes and SD shading.
cols=3;rows=math.ceil(len(models)/cols);fig,axes=plt.subplots(rows,cols,figsize=(12,2.75*rows+1.5),squeeze=False);fig.patch.set_facecolor(BG)
for i,m in enumerate(models):
 ax=axes.flat[i];ax.set_facecolor(PAPER);ax.spines[['top','right']].set_visible(False);ax.grid(axis='y',color=LINE,lw=.5);ax.set(ylim=(0,100),xlim=(.9,5.1),xticks=[1,2,3,4,5],yticks=[0,25,50,75,100]);ax.set_title(pretty(m),loc='left',fontweight='bold',fontsize=12,pad=12)
 if group(m,'no-notes')['rejections']+group(m,'notes')['rejections']==30:ax.text(.04,.93,'All 30 plans rejected',transform=ax.transAxes,color='#a63e34',fontsize=9,va='top')
 for mode,c in [('no-notes',TAN),('notes',GREEN)]:
  g=group(m,mode);y=np.array([q['mean'] for q in g['curves']]);sd=np.array([q['sd'] for q in g['curves']]);x=np.arange(1,6)
  ax.plot(x,y,'o-',color=c,lw=2,ms=4)
  rejects=[k for k in range(1,6) if any(a['number']==k and a['outcome']=='Rejected' for e in D['experiments'] if e['model']==m and e['mode']==mode for a in e['attempts'])]
  if rejects:ax.scatter(rejects,[y[k-1] for k in rejects],marker='x',s=65,color='#a63e34',zorder=5,clip_on=False)
  ax.fill_between(x,np.maximum(0,y-sd),np.minimum(100,y+sd),color=c,alpha=.12)
 ax.plot(range(1,6),[q['mean'] for q in base['curves']],':',color=MUTED,lw=1.2);ax.axhline(78.26,color=GREEN,ls=(0,(2,4)),alpha=.3,lw=.7)
 if i//cols==rows-1:ax.set_xlabel('Attempt budget',fontsize=9)
 if i%cols==0:ax.set_ylabel('Best-so-far score',fontsize=9)
for ax in axes.flat[len(models):]:ax.axis('off')
fig.subplots_adjust(left=.06,right=.97,top=.88,bottom=.09,hspace=.55,wspace=.25)
fig.text(.06,.963,'Learning curves, one model at a time.',fontsize=25,fontweight='bold');fig.text(.06,.928,'Mean best-so-far ± sample SD across the same 3 milk seeds. Shared 0–100 axes.',fontsize=11,color=MUTED)
fig.text(.06,.027,'● No notes',color=TAN,fontsize=10);fig.text(.18,.027,'● Agent notes',color=GREEN,fontsize=10);fig.text(.32,.027,'··· Cached CMA-ES',color=MUTED,fontsize=10);fig.text(.52,.027,'× Rejected slot · dotted green: quality floor (other gates also apply)',fontsize=9,color=MUTED)
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
lines+=['','## Visual review of every numerical pass','','All seven passing maps were inspected against the target. Two are marginal visual matches despite passing the frozen numerical scorer. No threshold was changed after seeing these results.','','![Every numerical pass, alongside the target](pass-contact-1.png)','','| Pour | Score | Visual review |','|---|---:|---|']
for p in passes:
 lines.append(f"| [{pretty(p['model'])} · {p['mode']} · seed {p['seed']} · attempt {p['attempt']}]({p['png']}) | {p['score']:.1f}% | {p['review']} |")
(O/'README.md').write_text('\n'.join(lines)+'\n')
print(json.dumps(dict(completeModels=len(models),unavailable=missing,passes=len(passes),cost=V['costUpperUSD'])))

# Keep generated vector markup free of trailing whitespace.
for path in O.glob("*.svg"):
 path.write_text("\n".join(line.rstrip() for line in path.read_text().splitlines())+"\n")
