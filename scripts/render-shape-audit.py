# /// script
# dependencies = ["pillow==13.0.0", "matplotlib==3.10.8"]
# ///
import pathlib,json,math,html
from PIL import Image,ImageDraw,ImageFont
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
ROOT=pathlib.Path(__file__).resolve().parent.parent;OUT=ROOT/'docs/shape-audit'
def font(size):
 for name in ['/System/Library/Fonts/Helvetica.ttc','DejaVuSans.ttf']:
  try:return ImageFont.truetype(name,size)
  except OSError:pass
 return ImageFont.load_default(size=size)
def panel(fields,filename,title,n=32):
 side=320;gap=22;top=100
 img=Image.new('RGB',(gap+(side+gap)*len(fields),top+side+50),(246,244,236));d=ImageDraw.Draw(img)
 d.text((gap,14),title,fill='#303a2e',font=font(21))
 for k,(label,values) in enumerate(fields):
  tile=Image.new('RGB',(n,n));pixels=[]
  for i,v in enumerate(values):
   outside=math.hypot((i%n+.5)/n*2-1,(i//n+.5)/n*2-1)>=.985
   pixels.append((224,219,203) if outside else tuple(round(a+(b-a)*max(0,min(1,v))) for a,b in zip((92,53,31),(255,248,223))))
  tile.putdata(pixels);x=gap+k*(side+gap);img.paste(tile.resize((side,side),Image.Resampling.NEAREST),(x,top));d.multiline_text((x,top-48),label,fill='#303a2e',font=font(15),spacing=4)
 d.text((gap,top+side+15),'32 x 32 actual fields / nearest-neighbor enlargement / no retouched art',fill='#56624f',font=font(14));img.save(OUT/filename)
def pct(x):return f'{x*100:.2f}%'
def label(name,e):return f'{name}\nIoU {pct(e["shapeIoU"])} / boundary {pct(e["boundaryF1"])}'
def table(headers,rows):return '<table><thead><tr>'+''.join(f'<th>{html.escape(str(x))}</th>' for x in headers)+'</tr></thead><tbody>'+''.join('<tr>'+''.join(f'<td>{html.escape(str(x))}</td>' for x in row)+'</tr>' for row in rows)+'</tbody></table>'
if __name__=='__main__':
 a=json.loads((OUT/'headroom.json').read_text());refs=a['references'];s=a['summary'];cal=json.loads((ROOT/'tasks/calibration.json').read_text())
 panel([('Target heart',a['targets']['heart']),(label('Canonical teardrop — FAIL',a['teardrop']['evaluations']['heart']),a['teardrop']['surface']),(label('Reviewed heart — PASS',refs['heart']['evaluation']),refs['heart']['surface'])],'heart-comparison.png','Heart: IoU plus a shared contour check')
 panel([('Current target: fused silhouette',a['targets']['tulip']),(label('Hand-written tulip — PASS',refs['tulip']['evaluation']),refs['tulip']['surface'])],'tulip-reference.png','Tulip: silhouette match; distinct layers remain unresolved')
 panel([('Target: four pairs of leaves',a['targets']['rosetta']),(label('Hand-written candidate — FAIL',refs['rosetta']['evaluation']),refs['rosetta']['surface'])],'rosetta-candidate.png','Rosetta: thick zigzag, not a matching reference')
 fig,axes=plt.subplots(1,3,figsize=(12,5),sharey=True,layout='constrained');fig.patch.set_facecolor('#f6f4ec')
 for ax,id in zip(axes,['heart','tulip','rosetta']):
  ax.set_facecolor('#fffdf5');vals=[r['evaluations'][id]['passRatio'] for r in a['randomPlans']]
  ax.boxplot([vals],positions=[0],widths=.4,showfliers=False)
  ax.scatter([((i*37)%101/101-.5)*.30 for i in range(100)],vals,c='#8b9e86',alpha=.55,s=13,label='100 random plans')
  ax.scatter([1,2,3],[r['evaluations'][id]['passRatio'] for r in a['naive']],c='#bb744f',s=48,marker='x',label='3 naive plans')
  ax.scatter([4],[refs[id]['evaluation']['passRatio']],c='#426747' if id!='rosetta' else '#b85c48',s=65,marker='D',label='Reference' if id!='rosetta' else 'Failed candidate')
  ax.axhline(1,color='#394b35',ls='--',lw=1.2)
  ax.set_title(id.title()+(' — uncalibrated' if id=='rosetta' else ' — calibrated'),fontsize=11)
  ax.set_xticks(range(5),['Random','Centre','No pull','Offset','Ref.' if id!='rosetta' else 'Candidate'],rotation=35,ha='right',fontsize=9)
  ax.set_ylim(0,1.25);ax.grid(axis='y',alpha=.15);ax.spines[['top','right']].set_visible(False)
 axes[0].set_ylabel('Minimum fraction of each shape requirement met')
 fig.suptitle('Headroom: pass line = 1, plus all serving checks',fontsize=14)
 fig.supxlabel('Same 100 random + 3 naive plans per target, nominal milk. Rosetta line = diagnostic floors only.',fontsize=10)
 fig.savefig(OUT/'headroom.png',dpi=170);plt.close(fig)
 rows=[]
 for id in s:
  e=refs[id]['evaluation'];rows.append([id,pct(e['shapeIoU']),pct(e['boundaryF1']),pct(e['precision']),pct(e['shapeQuality']),'PASS' if e['passed'] else 'FAIL / uncalibrated'])
 drop=a['teardrop']['evaluations']['heart'];rows.append(['canonical teardrop → heart',pct(drop['shapeIoU']),pct(drop['boundaryF1']),pct(drop['precision']),pct(drop['shapeQuality']),'FAIL: contour'])
 overview=table(['Pour','IoU','Boundary F1','Foam precision','Quality','Verdict'],rows)
 thresholds=table(['Target','Min IoU','Min boundary F1','Min precision','Status'],[[id,pct(c['requirements']['minShapeIoU']),pct(c['requirements']['minBoundaryF1']),pct(c['requirements']['minShapePrecision']),'Calibrated' if c['ready'] else 'Diagnostic floors only'] for id,c in cal['tasks'].items()])
 distributions=table(['Target','Random min / median / P95 / max quality','Max random requirement ratio','Max naive ratio','Reference ratio','Random / naive passes'],[[id,' / '.join(f'{s[id]["random"]["quality"][k]:.2f}%' for k in ['min','median','p95','max']),f'{s[id]["separation"]["maxRandomPassRatio"]:.3f}',f'{s[id]["separation"]["maxNaivePassRatio"]:.3f}',f'{s[id]["separation"]["referencePassRatio"]:.3f}','0/100 · 0/3'] for id in s])
 naives=table(['Target','Control','IoU','Boundary F1','Quality','Requirement ratio'],[[id,n['name'],pct(n['shapeIoU']),pct(n['boundaryF1']),pct(n['shapeQuality']),f'{n["passRatio"]:.3f}'] for id in s for n in s[id]['naive']])
 plans=''
 for id in refs:
  plan=refs[id]['plan']['parameters'];decoded=[100+100*plan[0],100+120*plan[1],45+40*plan[2]]
  segments=[]
  for i in range(6):
   x,z,h,t,d=plan[3+5*i:8+5*i];segments.append([i+1,f'{x*1.6-.8:.3f}',f'{z*1.6-.8:.3f}',f'{10+170*h:.2f}',f'{85*t:.2f}',f'{.1+4.9*d:.3f}'])
  plans+=f'<h3>{id.title()}</h3><p>{html.escape(refs[id]["description"])} High fill: {decoded[0]:.1f} ml cup target, {decoded[1]:.1f} mm, {decoded[2]:.1f}° tilt.</p>'+table(['Segment','x','z','Height mm','Tilt °','Duration s'],segments)
 content=f'''<!doctype html><meta charset="utf-8"><title>Latte Bench — shape audit</title><style>body{{max-width:1120px;margin:40px auto;padding:0 24px;background:#f6f4ec;color:#303a2e;font:16px/1.55 system-ui}}h1,h2,h3{{font-weight:550}}section{{padding:24px;background:#fffdf7;border:1px solid #dce0d4;border-radius:12px;margin:24px 0}}img{{width:100%;height:auto}}table{{border-collapse:collapse;width:100%;font-size:13px}}td,th{{padding:10px 6px;border-bottom:1px solid #dce0d4;text-align:left}}a{{color:#426747}}code{{font-size:13px}}.note{{border-left:4px solid #bb744f;padding-left:16px}}</style>
 <h1>Latte Bench: scorer and reachability audit</h1><p>v0.5 · 32×32 · 33 parameters · nominal milk · target seed 42 · no paid models</p>
 <section><h2>Verdict</h2><p>The canonical teardrop fails the heart contour gate. The reviewed heart passes. A hand-written tulip matches the current fused target silhouette. Rosetta remains uncalibrated: the best tested recipe is a thick zigzag, not four leaf pairs.</p>{overview}</section>
 <section><h2>One shape rule for every target</h2><p>Keep mask IoU (foam density ≥0.25). Extract the four-connected foreground outline of both masks. Boundary precision and recall count outline cells within one Euclidean grid cell of the other outline; boundary F1 is their harmonic mean. We also log mean symmetric Chamfer and Hausdorff distances. The rule has no shape IDs or privileged regions.</p><p>Displayed quality = 100 × min(IoU, boundary F1). Passing requires all three shape thresholds plus volume, temperature, spills, serving, time and scorching checks. Exact target masks score 100% IoU and boundary F1 for all three shapes. IoU translation/scale sanity curves pass. The one-cell contour tolerance is intentionally stricter and is not a smooth loss beyond its tolerance.</p><img src="heart-comparison.png" alt="Target heart, failed teardrop and passing heart reference"></section>
 <section><h2>Tulip and rosetta references</h2><img src="tulip-reference.png" alt="Tulip target and reference"><p class="note">The tulip target merges overlapping primitives into a continuous silhouette. This reference matches that benchmark mask, but does not demonstrate three separated tulip layers. Stronger layered-art claims need a revised target and fresh calibration.</p><img src="rosetta-candidate.png" alt="Rosetta target and failed candidate"><p>We tried 36 explicit tulip recipes and 30 explicit rosetta recipes, choosing the best by the shared shape quality. All use the same 33 bounds. This is local recipe selection, not a model or optimizer ablation. Six linear segments plus radial pool spreading produce connected ribbons and merge leaf gaps. None of the tested recipes formed the four leaf pairs and thin stem. This is a tested limitation, not a mathematical impossibility proof.</p></section>
 <section><h2>Headroom</h2><p>100 valid vectors sampled from 33 independent Uniform[0,1) coordinates with seed 20261020. The identical vectors and three fixed naive controls are scored per target. Every result is included; only 38/100 random pours meet the non-shape serving checks. Percentiles use linear interpolation. The pass-ratio plot includes precision as well as IoU and contour.</p><img src="headroom.png" alt="Random and naive distributions versus calibrated pass requirements">{distributions}{naives}<p class="note">Extra control: removing only the reviewed heart's final pull still passes at {pct(a['referenceWithoutPull']['evaluations']['heart']['shapeQuality'])} quality. The heart has already formed. The fixed naive “no pull” is the generic circle pour, not this stronger lobe-building reference. Passing measures the output, not proof of a specific barista technique.</p><p>Heart and current tulip have a measured gap from these controls. Rosetta has no accepted reference and therefore no established pass gap. These are nominal-milk diagnostics, not held-out robustness or learning results.</p></section>
 <section><h2>Calibration</h2><p>Thresholds = max(predeclared floors, 90% of the visually accepted reference metric), rounded down to four decimals. Floors are IoU 50%, precision 80%, boundary F1 80%. Thresholds were set before running the controls and were not tuned to their outcomes.</p>{thresholds}<p>Heart and tulip reference replays pass. Rosetta's low candidate cannot lower the floors; its model run gates are blocked. Calibration performed three reference replays, with additional verification replays. The prior 1,001-evaluation physical search belongs to the old IoU-only scorer; it is not a new contour-scorer search.</p></section>
 <section><h2>Reproducible plans and evidence</h2><p>Each plan has three high-fill parameters and six endpoints with x, z, height, tilt and duration. Controls interpolate at 60 Hz, then settle and serve. No mid-pour observations or model calls. Milk inputs remain volume and starting temperature only.</p>{plans}<p><a href="summary.json">Summary metrics</a> · <a href="headroom.json">All plans, final foam fields, reference traces and scores</a></p><p>Reproduce from the repository: <code>bun run calibrate</code>, <code>bun scripts/shape-headroom.js</code>, <code>uv run scripts/render-shape-audit.py</code>. Regenerating designs is optional: run probe-shape-references.js once, then refine-shape-references.js once before calibration.</p></section>'''
 (OUT/'report.html').write_text(content)
 print('Saved 4 PNGs and report.html')
