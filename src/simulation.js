// A small incompressible 2D surface-flow solver, coupled to ballistic milk drops.
// Length is normalized to cup radius on the surface; vertical distance is metres.
export const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
export class FluidSurface {
  constructor(size = 96) {
    this.n = size; const len = size * size;
    for (const name of ['u','v','u0','v0','foam','foam0','pressure','divergence']) this[name] = new Float32Array(len);
    this.mask = new Uint8Array(len);
    for (let y=0;y<size;y++) for(let x=0;x<size;x++) this.mask[y*size+x] = Math.hypot((x+.5)/size*2-1,(y+.5)/size*2-1)<.985 ? 1:0;
  }
  reset() { for(const key of ['u','v','u0','v0','foam','foam0','pressure','divergence']) this[key].fill(0); }
  sample(field, x, y) {
    const n=this.n; x=clamp(x,0,n-1.001); y=clamp(y,0,n-1.001);
    const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,i=iy*n+ix;
    return (field[i]*(1-fx)+field[i+1]*fx)*(1-fy)+(field[i+n]*(1-fx)+field[i+n+1]*fx)*fy;
  }
  deposit(x,y,volume,height,vx,vz,foamQuality) {
    const n=this.n,cx=(x+1)*.5*n,cy=(y+1)*.5*n;
    const spread=(.013+height*.17)*n;
    const visible=Math.exp(-height*28)*foamQuality;
    const r=Math.ceil(spread*3);
    for(let j=Math.max(1,Math.floor(cy-r));j<Math.min(n-1,cy+r);j++) for(let i=Math.max(1,Math.floor(cx-r));i<Math.min(n-1,cx+r);i++) {
      const k=j*n+i;if(!this.mask[k])continue;
      const dx=i-cx,dy=j-cy,d2=dx*dx+dy*dy;
      const g=Math.exp(-d2/(2*spread*spread));
      // Radial momentum pushes existing surface foam outward, producing layered pours.
      this.u[k]+=g*(dx/spread*.08+vx*.025)*volume;
      this.v[k]+=g*(dy/spread*.08+vz*.025)*volume;
      this.foam[k]=clamp(this.foam[k]+g*volume*.36*visible*(1.8/spread)**2,0,1);
    }
  }
  step(dt) {
    const n=this.n,len=n*n;
    this.u0.set(this.u);this.v0.set(this.v);
    // Semi-Lagrangian transport of surface velocity.
    for(let y=1;y<n-1;y++)for(let x=1;x<n-1;x++){
      const i=y*n+x;if(!this.mask[i])continue;
      const bx=x-this.u0[i]*dt*n,by=y-this.v0[i]*dt*n;
      this.u[i]=this.sample(this.u0,bx,by)*.965;this.v[i]=this.sample(this.v0,bx,by)*.965;
    }
    this.pressure.fill(0);
    for(let y=1;y<n-1;y++)for(let x=1;x<n-1;x++){
      const i=y*n+x;
      this.divergence[i]=this.mask[i]?-.5*(this.u[i+1]-this.u[i-1]+this.v[i+n]-this.v[i-n])/n:0;
    }
    // Pressure projection; impermeable circular boundary enforced below.
    for(let k=0;k<12;k++)for(let y=1;y<n-1;y++)for(let x=1;x<n-1;x++){
      const i=y*n+x;if(this.mask[i])this.pressure[i]=(this.divergence[i]+this.pressure[i-1]+this.pressure[i+1]+this.pressure[i-n]+this.pressure[i+n])*.25;
    }
    for(let y=1;y<n-1;y++)for(let x=1;x<n-1;x++){
      const i=y*n+x;if(!this.mask[i]){this.u[i]=this.v[i]=0;continue;}
      this.u[i]-=.5*n*(this.pressure[i+1]-this.pressure[i-1]);this.v[i]-=.5*n*(this.pressure[i+n]-this.pressure[i-n]);
      if(!this.mask[i-1]||!this.mask[i+1])this.u[i]=0;
      if(!this.mask[i-n]||!this.mask[i+n])this.v[i]=0;
      this.u[i]=clamp(this.u[i],-2,2);this.v[i]=clamp(this.v[i],-2,2);
    }
    this.foam0.set(this.foam);
    for(let y=1;y<n-1;y++)for(let x=1;x<n-1;x++){
      const i=y*n+x;if(!this.mask[i])continue;
      const f=this.sample(this.foam0,x-this.u[i]*dt*n,y-this.v[i]*dt*n);
      const neighbors=(this.foam0[i-1]+this.foam0[i+1]+this.foam0[i-n]+this.foam0[i+n])*.25;
      this.foam[i]=clamp(f*.998+neighbors*.002,0,1);
    }
  }
  coverage() { let count=0,area=0;for(let i=0;i<this.foam.length;i++)if(this.mask[i]){area++;if(this.foam[i]>.25)count++;}return count/area; }
  snapshot(size=10) { return Array.from({length:size},(_,y)=>Array.from({length:size},(_,x)=>Math.round(this.sample(this.foam,(x+.5)/size*(this.n-2),(y+.5)/size*(this.n-2))*9)).join('')); }
}
export const COMMANDS=['grind','extract','steam','pickup','move','pour','stop','serve','reset'];
export function validateCommand(input) {
  if(!input||!COMMANDS.includes(input.command))throw new Error('Unknown workstation action.');
  const result={command:input.command};
  for(const [key,min,max] of [['x',-1.4,1.4],['z',-1.4,1.4],['height',10,220],['tilt',0,85],['duration',.05,5]]){
    if(input[key]!==undefined){if(typeof input[key]!=='number'||!Number.isFinite(input[key])||input[key]<min||input[key]>max)throw new Error(`Invalid ${key}; expected ${min}–${max}.`);result[key]=input[key];}
  }
  return result;
}
export class CoffeeSimulation {
  constructor(){this.surface=new FluidSurface();this.reset();}
  reset(){
    this.surface.reset();this.time=0;this.grounds=0;this.espresso=0;this.milk=220;this.inCup=0;this.spilled=0;this.temperature=18;this.scorched=false;
    this.grinding=false;this.extracting=false;this.steaming=false;this.held=false;this.pouring=false;this.served=false;
    this.controls={x:0,z:0,height:80,tilt:48};this.previous={x:0,z:0};this.drops=[];this.impacts=[];this.spillMarks=[];this.flow=0;this.status='Grind a dose to start.';this.history=[];this.fluidClock=0;
  }
  act(raw){
    const a=validateCommand(raw);
    if(a.command==='reset'){this.reset();return;}
    if(this.served){this.status='Cup served. Start a new cup.';return;}
    for(const key of ['x','z','height','tilt'])if(a[key]!==undefined)this.controls[key]=a[key];
    switch(a.command){
      case 'grind':if(this.espresso>0){this.status='There is already espresso in the cup.';break;}this.grinding=true;this.status='Grinding…';break;
      case 'extract':if(this.grounds<18){this.status='Grind 18 g before extracting.';break;}if(this.espresso>=36){this.status='Shot ready.';break;}this.extracting=true;this.status='Extracting espresso…';break;
      case 'steam':if(this.held){this.status='Put down the pitcher before steaming.';break;}this.steaming=!this.steaming;this.status=this.steaming?'Steaming. Stop at 55–65°C.':'Steam off.';break;
      case 'pickup':this.held=!this.held;this.steaming=false;this.pouring=false;this.status=this.held?'Pitcher in hand. Position over the cup.':'Pitcher on the counter.';break;
      case 'move':break;
      case 'pour':if(!this.held){this.status='Pick up the pitcher first.';break;}if(this.espresso<30){this.status='Extract espresso before pouring.';break;}this.pouring=true;this.status='Pouring';break;
      case 'stop':this.pouring=false;this.steaming=false;this.status='Stopped.';break;
      case 'serve':if(this.espresso<30||this.inCup<50){this.status='Add espresso and at least 50 ml of milk.';break;}this.served=true;this.pouring=false;this.steaming=false;this.held=false;this.status='Cup served.';break;
    }
    this.history.push({time:+this.time.toFixed(3),...a});
  }
  step(dt){
    dt=clamp(dt,0,.04);this.time+=dt;
    if(this.grinding){this.grounds=Math.min(18,this.grounds+9*dt);if(this.grounds>=18-1e-8){this.grounds=18;this.grinding=false;this.status='Dose ready. Extract the shot.';}}
    if(this.extracting){this.espresso=Math.min(36,this.espresso+9*dt);if(this.espresso>=36-1e-8){this.espresso=36;this.extracting=false;this.status='Espresso ready.';}}
    if(this.steaming){this.temperature=Math.min(100,this.temperature+8*dt);if(this.temperature>75)this.scorched=true;}
    else this.temperature=Math.max(18,this.temperature-dt*.08);
    const c=this.controls,vx=clamp((c.x-this.previous.x)/Math.max(dt,.001),-5,5),vz=clamp((c.z-this.previous.z)/Math.max(dt,.001),-5,5);
    this.previous={x:c.x,z:c.z};
    const angle=Math.max(0,(c.tilt-25)/60*Math.PI/2);
    this.flow=this.pouring&&this.held&&this.milk>0&&!this.served?Math.sin(angle)*32*Math.sqrt(this.milk/220):0;
    if(this.flow>0){
      const amount=Math.min(this.milk,this.flow*dt);this.milk-=amount;
      const height=this.effectiveHeight()/1000;
      this.drops.push({x:c.x,z:c.z,y:height,vy:-.18,vx:vx*.12,vz:vz*.12,volume:amount,height});
    }
    for(let i=this.drops.length-1;i>=0;i--){
      const d=this.drops[i];d.vy-=9.81*dt;d.y+=d.vy*dt;d.x+=d.vx*dt;d.z+=d.vz*dt;
      if(d.y<=0){
        const room=Math.max(0,240-this.espresso-this.inCup);
        const outside=Math.hypot(d.x,d.z)>.94;
        // Drops missing the rim keep falling until they strike the countertop.
        if(outside&&d.y>-(.17+(this.espresso+this.inCup)/240*.39)/4)continue;
        const accepted=outside?0:Math.min(room,d.volume);this.inCup+=accepted;
        if(d.volume>accepted)this.spillAt(outside?d.x:Math.sign(d.x||1)*1.12,d.z,d.volume-accepted);
        if(accepted>0){this.surface.deposit(d.x,d.z,accepted,d.height,d.vx,d.vz,this.foamQuality());this.impacts.push({x:d.x,z:d.z,age:0,strength:d.volume});}
        this.drops.splice(i,1);
      }
    }
    for(const impact of this.impacts)impact.age+=dt;this.impacts=this.impacts.filter(i=>i.age<.8).slice(-16);
    this.fluidClock+=dt;if(this.fluidClock>=1/30){this.surface.step(1/30);this.fluidClock-=1/30;}
  }
  spillAt(x,z,volume){
    this.spilled+=volume;
    const key=`${Math.round(x*8)},${Math.round(z*8)}`;
    const mark=this.spillMarks.find(m=>m.key===key);
    if(mark)mark.volume+=volume;
    else{this.spillMarks.push({key,x,z,volume});if(this.spillMarks.length>96)this.spillMarks.shift();}
  }
  effectiveHeight(){
    // A low spout cannot pass through the rim to reach an almost-empty cup.
    const liquidHeight=.17+(this.espresso+this.inCup)/240*.39;
    return Math.max(this.controls.height,(.62-liquidHeight)/4*1000);
  }
  foamQuality(){return this.scorched?.15:clamp(1-Math.abs(this.temperature-60)/45,.1,1);}
  observe(){return {time:+this.time.toFixed(1),groundsG:+this.grounds.toFixed(1),espressoML:+this.espresso.toFixed(1),milkRemainingML:+this.milk.toFixed(1),milkInCupML:+this.inCup.toFixed(1),spilledML:+this.spilled.toFixed(1),milkTemperatureC:+this.temperature.toFixed(1),scorched:this.scorched,held:this.held,grinding:this.grinding,extracting:this.extracting,steaming:this.steaming,pouring:this.pouring,served:this.served,controls:{...this.controls},effectiveHeightMM:+this.effectiveHeight().toFixed(1),surfaceCoverage:+this.surface.coverage().toFixed(3),surfaceFoam:this.surface.snapshot(),status:this.status};}
}
