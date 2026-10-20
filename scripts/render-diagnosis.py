# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow==13.0.0"]
# ///
"""Render actual numeric fields, nearest-neighbor only; no smoothing or generated art."""
import json, math, pathlib, sys
from PIL import Image, ImageDraw, ImageFont
ROOT=pathlib.Path(__file__).resolve().parent.parent
OUT=ROOT/'docs/diagnosis'
def font_at(size):
    for name in ['/System/Library/Fonts/Helvetica.ttc','DejaVuSans.ttf']:
        try: return ImageFont.truetype(name,size)
        except OSError: pass
    return ImageFont.load_default(size=size)
font=font_at(22);small=font_at(16)
def panel(fields,filename,title,n):
    side=384; gap=24; top=85
    img=Image.new('RGB',(gap+(side+gap)*len(fields),top+side+60),(246,244,236));d=ImageDraw.Draw(img)
    d.text((gap,15),title,fill=(48,58,46),font=font)
    for k,(label,values) in enumerate(fields):
        tile=Image.new('RGB',(n,n)); pixels=[]
        for i,v in enumerate(values):
            outside=math.hypot((i%n+.5)/n*2-1,(i//n+.5)/n*2-1)>=.985
            base=(92,53,31);milk=(255,248,223)
            pixels.append((224,219,203) if outside else tuple(round(a+(b-a)*max(0,min(1,v))) for a,b in zip(base,milk)))
        tile.putdata(pixels);x=gap+k*(side+gap)
        img.paste(tile.resize((side,side),Image.Resampling.NEAREST),(x,top))
        d.text((x,top-29),label,fill=(48,58,46),font=small)
    d.text((gap,top+side+18),f'{n} x {n} samples / nearest-neighbor enlargement / white = foam density 1',fill=(90,95,80),font=small)
    img.save(OUT/filename)
p=json.loads((OUT/'original.json').read_text());r=p['reference'];n=p['resolution']
panel([('Target',p['target']),('Best original pour / IoU 14.36%',r['surface'])],'original-best.png','Original reference: target and actual final foam density',n)
frames=[f for f in r['trace']['foam'] if f['time'] in (17,19,21,22)]
panel([(f"t = {f['time']} s",f['values']) for f in frames],'original-trace.png','Original reference: recorded intermediate foam maps',n)
panel([('Injected exact target / 100%',p['hold']['before']),(f"After {p['hold']['seconds']:.2f} s / {p['hold']['score']:.2f}%",p['hold']['after'])],'original-hold.png','Surface retention test: no pitcher, no added milk',n)
if (OUT/'current.json').exists():
    p=json.loads((OUT/'current.json').read_text());n=p['resolution']
    panel([('Target',p['target']),(f"Canonical pour / {p['canonical']['evaluation']['shapeIoU']*100:.2f}%",p['canonical']['surface'])],'canonical.png','Hand-written phase plan: target and actual foam density',n)
    panel([('Injected exact target / 100%',p['hold']['before']),(f"After {p['hold']['seconds']:.2f} s / {p['hold']['score']:.2f}%",p['hold']['after'])],'current-hold.png','Current surface retention test',n)
    if 'reference' in p:
        r=p['reference']
        panel([('Target',p['target']),(f"Reference / {r['evaluation']['shapeIoU']*100:.2f}%",r['surface']),('Scored binary footprint (>= 0.25)',[int(v>=.25) for v in r['surface']])],'reference.png','Poured reference: density and the exact scored footprint',n)
        fs=r['trace']['foam'];active=[f for f in fs if sum(f['values'])>1]
        selected=[active[min(len(active)-1,round(i*(len(active)-1)/3))] for i in range(4)]
        panel([(f"t = {f['time']} s",f['values']) for f in selected],'reference-trace.png','Poured reference: actual interval snapshots',n)
