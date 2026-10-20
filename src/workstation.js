import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export async function createWorkstation(canvas,sim,onAction){
  await RAPIER.init();
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
  renderer.setClearColor(0xe2dfcf);
  const scene=new THREE.Scene();scene.fog=new THREE.Fog(0xe2dfcf,27,60);
  const camera=new THREE.OrthographicCamera(-7,7,5,-5,.1,100);let cameraMode=0;camera.position.set(10,10,13);const look=new THREE.Vector3(0,1.4,0);camera.lookAt(look);
  const world=new RAPIER.World({x:0,y:-9.81,z:0});world.timestep=1/60;
  scene.add(new THREE.HemisphereLight(0xfff7df,0x8c9f82,2.1));
  const sun=new THREE.DirectionalLight(0xffedca,3.8);sun.position.set(-3,10,6);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-9;sun.shadow.camera.right=9;sun.shadow.camera.top=9;sun.shadow.camera.bottom=-9;sun.shadow.normalBias=.035;sun.shadow.radius=4;scene.add(sun);
  const fill=new THREE.DirectionalLight(0xf2f9ed,1.4);fill.position.set(5,4,-3);scene.add(fill);
  const material=(color,roughness=.8,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness,flatShading:true});
  const m={teal:material(0x4f7970),tealDark:material(0x3d5b51),sage:material(0x9dab86),wood:material(0xb89062),woodDark:material(0x967047),cream:material(0xf3e7c9),white:material(0xf6f1df),steel:material(0xbac3b2,.3,.5),dark:material(0x37433a),black:material(0x292f29),coffee:material(0x593c28),brass:material(0xc4a46b,.35,.4),red:material(0xb87354),green:material(0xa6bd76),tile:material(0xe6dfc8),milk:material(0xf7efda,.35)};
  const mesh=(geo,mat,parent=scene,pos=[0,0,0])=>{const o=new THREE.Mesh(geo,mat);o.position.set(...pos);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;};
  const box=(w,h,d,mat,parent=scene,pos=[0,0,0],bevel=.035)=>mesh(bevel?new RoundedBoxGeometry(w,h,d,1,bevel):new THREE.BoxGeometry(w,h,d),mat,parent,pos);
  const cyl=(rt,rb,h,mat,parent=scene,pos=[0,0,0],segments=12)=>mesh(new THREE.CylinderGeometry(rt,rb,h,segments),mat,parent,pos);
  function staticBox(w,h,d,x,y,z){const rb=world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x,y,z));world.createCollider(RAPIER.ColliderDesc.cuboid(w/2,h/2,d/2).setFriction(.7),rb);return rb;}
  function label(text,w,h,bg='#e7e6cc',fg='#516045',fontSize=60){const c=document.createElement('canvas');c.width=512;c.height=256;const ctx=c.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,512,256);ctx.fillStyle=fg;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`600 ${fontSize}px monospace`;ctx.fillText(text,256,128);const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;return new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map:tex,roughness:1}));}
  // A small, cutaway tile-and-timber coffee station.
  const ground=mesh(new THREE.PlaneGeometry(200,200),material(0xe2dfcf));ground.rotation.x=-Math.PI/2;ground.position.y=-.2;ground.castShadow=false;
  box(8.5,.28,6.1,material(0xc5c7ad),scene,[0,-.035,0],.08);
  const tiles=[material(0xd6d5ba),material(0xe4e0ca)];
  for(let x=0;x<10;x++)for(let z=0;z<7;z++)box(.8,.035,.8,tiles[(x+z)%2],scene,[-3.6+x*.8,.12,-2.4+z*.8],.008);
  staticBox(8.5,.3,6.1,0,-.035,0);
  box(7.7,3.3,.15,material(0xd3d6b8),scene,[0,1.8,-2.25]);
  box(.15,2.2,4.5,material(0xd8d8bc),scene,[-3.78,1.25,0]);
  // Grout and broad blocks keep the materials tactile without pixel textures.
  for(let y=0;y<6;y++)box(7.65,.014,.012,material(0xbec7a7),scene,[0,.28+y*.49,-2.165],0);
  for(let x=0;x<14;x++)box(.012,3.2,.012,material(0xbec7a7),scene,[-3.6+x*.55,1.8,-2.164],0);
  box(6.7,1.1,3.25,m.wood,scene,[0,.76,0]);box(6.95,.22,3.5,material(0xc2a076),scene,[0,1.4,0],.06);staticBox(6.95,.22,3.5,0,1.4,0);
  // Slatted cabinet fronts and green metal feet.
  for(let i=0;i<3;i++){box(2.05,.84,.055,material(i===1?0xa87d54:0xb88c60),scene,[-2.13+i*2.13,.75,1.65]);box(.5,.06,.06,m.brass,scene,[-2.13+i*2.13,1.01,1.71],.01);}
  for(let x of [-3,3])for(let z of [-1.35,1.35])box(.18,.34,.18,m.tealDark,scene,[x,.26,z]);
  // Back shelf, cups, coffee tins, and a tiny wall clock.
  box(4.7,.12,.6,m.wood,scene,[.4,3.02,-1.86]);for(let x of [-1.65,2.3])box(.06,.38,.5,m.tealDark,scene,[x,2.81,-1.91]);
  for(let i=0;i<3;i++){cyl(.17,.14,.25,i===1?m.sage:m.cream,scene,[-1.3+i*.43,3.2,-1.8]);const h=mesh(new THREE.TorusGeometry(.07,.025,5,10),m.cream,scene,[-1.1+i*.43,3.2,-1.8]);}
  for(let i=0;i<2;i++){box(.36,.5,.32,i?m.red:m.teal,scene,[1.45+i*.43,3.31,-1.82]);const l=label(i?'M':'01',.22,.18);l.position.set(1.45+i*.43,3.33,-1.65);scene.add(l);}
  const clock=cyl(.3,.3,.07,m.tealDark,scene,[-2.7,2.7,-2.12],16);clock.rotation.x=Math.PI/2;const face=cyl(.255,.255,.075,m.cream,scene,[-2.7,2.7,-2.08],16);face.rotation.x=Math.PI/2;box(.025,.18,.02,m.dark,scene,[-2.7,2.77,-2.03],0);box(.14,.025,.02,m.dark,scene,[-2.64,2.7,-2.03],0);
  // Espresso machine: chunky enameled body, recessed group, illuminated controls.
  const machine=new THREE.Group();machine.position.set(-.15,1.51,-.7);scene.add(machine);
  box(2.65,1.64,1.23,m.teal,machine,[0,.82,0],.1);box(2.4,.14,1.36,m.steel,machine,[0,1.69,0],.025);
  box(2.4,.77,.09,m.black,machine,[0,.58,.65]);box(2.28,.1,.78,m.steel,machine,[0,.17,.87],.02);
  for(let i=0;i<16;i++)box(.045,.015,.62,m.dark,machine,[-1.02+i*.135,.23,.87],0);
  box(.94,.26,.43,m.steel,machine,[-.28,1.05,.72]);cyl(.21,.21,.13,m.dark,machine,[-.28,.87,.78]);
  const handle=box(.12,.13,.57,m.black,machine,[-.28,.83,1.04],.025);handle.rotation.x=-.1;
  for(const x of [-.37,-.19])cyl(.026,.026,.16,m.brass,machine,[x,.75,.78]);
  const gauge=cyl(.16,.16,.05,m.cream,machine,[-.68,1.42,.64],16);gauge.rotation.x=Math.PI/2;const needle=box(.014,.1,.012,m.dark,machine,[-.68,1.43,.68],0);needle.rotation.z=-.6;
  const interactables=[],pressers=[];
  function button(parent,pos,command,color=m.green,size=.14){const mount=box(size+.07,size+.07,.045,m.tealDark,parent,pos,.015);const b=box(size,size,.065,color,parent,[pos[0],pos[1],pos[2]+.045],.016);b.userData.command=command;interactables.push(b);pressers.push({mesh:b,z:b.position.z,command});return b;}
  const extractButton=button(machine,[.63,1.43,.65],'extract');const steamButton=button(machine,[.94,1.43,.65],'steam',m.red);
  // Steam wand and tactile lever.
  box(.08,.69,.08,m.steel,machine,[1.25,.95,.7],.02);box(.23,.08,.08,m.steel,machine,[1.32,.59,.7],.02);const steamLever=box(.09,.29,.1,m.dark,machine,[1.4,1.21,.42]);steamLever.rotation.z=-.35;
  // Grinder with actual animated beans and a dose tray.
  const grinder=new THREE.Group();scene.add(grinder);grinder.position.set(-2.35,1.51,-.65);
  box(.8,.14,.85,m.tealDark,grinder,[0,.07,0]);box(.58,1.05,.6,m.cream,grinder,[0,.62,0]);box(.62,.3,.65,m.tealDark,grinder,[0,1.2,0]);
  const hopperMat=new THREE.MeshStandardMaterial({color:0x90846a,transparent:true,opacity:.55,roughness:.3,flatShading:true});cyl(.35,.25,.62,hopperMat,grinder,[0,1.65,0],6);cyl(.38,.38,.09,m.dark,grinder,[0,1.98,0],6);
  const beans=[];for(let i=0;i<18;i++){const b=box(.09,.065,.13,m.coffee,grinder,[Math.sin(i*4)*.2,1.43+(i%4)*.09,Math.cos(i*7)*.18],.025);b.rotation.y=i;beans.push(b);}
  box(.31,.14,.18,m.dark,grinder,[0,.85,.39]);const dose=cyl(.22,.17,.13,m.steel,grinder,[0,.2,.42]);button(grinder,[0,.56,.32],'grind',m.red,.16);
  const grinderTag=label('18g',.28,.13,'#e9dfc3','#617050',55);grinderTag.position.set(0,1.02,.31);grinder.add(grinderTag);
  // Main cup on the serving mat.
  box(2.05,.035,1.45,material(0xb1bea0),scene,[.4,1.527,.91],.035);
  for(let i=0;i<14;i++)box(1.97,.005,.018,material(0x9eac8c),scene,[.4,1.549,.28+i*.098],0);
  const cup=new THREE.Group();scene.add(cup);cup.position.set(-.43,1.53,.08);
  const cupPoints=[[0,0],[.36,0],[.43,.04],[.56,.48],[.57,.59],[.51,.62],[.48,.55],[.35,.11],[0,.11]].map(p=>new THREE.Vector2(...p));
  mesh(new THREE.LatheGeometry(cupPoints,16),m.cream,cup);const rim=mesh(new THREE.TorusGeometry(.532,.031,5,16),m.white,cup,[0,.59,0]);rim.rotation.x=Math.PI/2;
  const cupHandle=mesh(new THREE.TorusGeometry(.2,.065,5,10),m.cream,cup,[.59,.33,0]);cupHandle.scale.set(.8,1,1);
  const textureCanvas=document.createElement('canvas');textureCanvas.width=256;textureCanvas.height=256;const texture=new THREE.CanvasTexture(textureCanvas);texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;
  const liquid=mesh(new THREE.CircleGeometry(.49,48),new THREE.MeshStandardMaterial({map:texture,roughness:.38}),cup,[0,.22,0]);liquid.rotation.x=-Math.PI/2;liquid.castShadow=false;
  const cupBody=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(cup.position.x,cup.position.y,cup.position.z));world.createCollider(RAPIER.ColliderDesc.cylinder(.3,.55).setTranslation(0,.3,0),cupBody);
  // Pitcher is kinematic while in hand; its collision shape pushes loose props.
  const pitcher=new THREE.Group();scene.add(pitcher);const pitcherMat=material(0xbec8b6,.28,.6);
  const pitcherPoints=[[0,0],[.25,0],[.3,.05],[.27,.61],[.29,.67],[.25,.69],[.23,.62],[.26,.09],[0,.09]].map(p=>new THREE.Vector2(...p));
  mesh(new THREE.LatheGeometry(pitcherPoints,12),pitcherMat,pitcher);cyl(.23,.23,.02,m.milk,pitcher,[0,.51,0]);
  const ph=mesh(new THREE.TorusGeometry(.18,.04,5,10),pitcherMat,pitcher,[.36,.35,0]);ph.scale.set(.8,1.1,1);
  const spout=new THREE.BufferGeometry();spout.setAttribute('position',new THREE.Float32BufferAttribute([-.2,.65,-.17,-.44,.7,0,-.2,.65,.17,-.2,.65,-.17,-.26,.48,0,-.44,.7,0,-.44,.7,0,-.26,.48,0,-.2,.65,.17],3));spout.computeVertexNormals();const spoutMat=pitcherMat.clone();spoutMat.side=THREE.DoubleSide;mesh(spout,spoutMat,pitcher);
  const pitcherBody=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(1.7,1.53,.55));world.createCollider(RAPIER.ColliderDesc.cylinder(.32,.28).setTranslation(0,.32,0),pitcherBody);
  const milkCarton=new THREE.Group();scene.add(milkCarton);milkCarton.position.set(2.7,1.51,-.45);box(.48,.85,.48,m.white,milkCarton,[0,.43,0]);box(.49,.26,.49,m.sage,milkCarton,[0,.33,0]);const roof=box(.48,.19,.38,m.sage,milkCarton,[0,.94,0]);roof.rotation.x=.3;cyl(.065,.065,.05,m.white,milkCarton,[.13,1.06,.08],8);const cartonLabel=label('MILK',.37,.14,'#abb78f','#f8f4dd',62);cartonLabel.position.set(0,.33,.249);milkCarton.add(cartonLabel);
  // Pot, blocky leaves, folded towel, and loose, physical sugar cubes.
  const plant=new THREE.Group();scene.add(plant);plant.position.set(2.8,1.51,-1.45);cyl(.28,.23,.36,m.red,plant,[0,.18,0],6);cyl(.245,.245,.025,m.coffee,plant,[0,.36,0],8);
  for(let i=0;i<6;i++){const a=i*Math.PI/3;const leaf=box(.13,.45,.1,i%2?m.sage:m.teal,plant,[Math.sin(a)*.18,.57,Math.cos(a)*.18],.035);leaf.rotation.set(Math.cos(a)*.6,a,Math.sin(a)*-.6);}
  box(.85,.055,.62,material(0xc6ac86),scene,[-2.45,1.55,1.03],.018);for(let i=0;i<4;i++)box(.035,.01,.6,m.cream,scene,[-2.7+i*.17,1.585,1.03],0);
  const dynamics=[];
  function dropSugar(){const x=1.6+Math.sin(dynamics.length*2.3)*.5,z=.9+Math.cos(dynamics.length*3)*.4;const o=box(.17,.17,.17,m.white);const rb=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x,3.5,z).setCcdEnabled(true));world.createCollider(RAPIER.ColliderDesc.cuboid(.085,.085,.085).setDensity(.4).setRestitution(.22).setFriction(.6),rb);rb.setAngvel({x:1.4,y:2,z:.5},true);dynamics.push({mesh:o,body:rb});if(dynamics.length>24){const old=dynamics.shift();world.removeRigidBody(old.body);scene.remove(old.mesh);old.mesh.geometry.dispose();}}
  for(let i=0;i<3;i++)dropSugar();
  // Streams are visible particles following the same trajectories as deposition.
  const dropMesh=new THREE.InstancedMesh(new THREE.SphereGeometry(.024,6,5),m.milk,96);dropMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);dropMesh.castShadow=true;scene.add(dropMesh);dropMesh.count=0;
  const espressoStreams=[];for(let x of [-.52,-.34]){const s=cyl(.013,.018,.5,m.coffee,scene,[x,2.02,.08],8);s.visible=false;espressoStreams.push(s);}
  const steamPuffs=[];const puffMat=new THREE.MeshBasicMaterial({color:0xf9f6e9,transparent:true,opacity:.15,depthWrite:false});for(let i=0;i<10;i++){const puff=mesh(new THREE.IcosahedronGeometry(.12,0),puffMat);puff.castShadow=false;puff.visible=false;steamPuffs.push(puff);}
  const spill=new THREE.InstancedMesh(new THREE.CircleGeometry(1,16),new THREE.MeshStandardMaterial({color:0xe7dab6,roughness:.25,transparent:true,opacity:.85}),96);spill.count=0;scene.add(spill);
  const ring=mesh(new THREE.RingGeometry(.52,.535,48),new THREE.MeshBasicMaterial({color:0xd2b075,transparent:true,opacity:.7,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;scene.add(ring);ring.visible=false;
  const pointer=new THREE.Vector2(),raycaster=new THREE.Raycaster();let hover=null;
  const clickable=[...interactables];
  // Both the actual physical buttons and the accessible console dispatch the same commands.
  canvas.addEventListener('pointermove',e=>{const r=canvas.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObjects(clickable,false)[0];hover=hit?.object||null;canvas.style.cursor=hover?'pointer':'default';});
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;const r=canvas.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObjects(clickable,false)[0];if(hit)onAction(hit.object.userData.command);});
  function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);const aspect=w/h,vertical=Math.max(8.5,10/aspect);camera.left=-vertical*aspect/2;camera.right=vertical*aspect/2;camera.top=vertical/2;camera.bottom=-vertical/2;camera.updateProjectionMatrix();}
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(canvas);resize();
  const scratch=new THREE.Object3D(),lip=new THREE.Vector3(),rotation=new THREE.Quaternion();const topdown=$canvasContext();
  function $canvasContext(){return document.querySelector('#surface-view').getContext('2d');}
  const fieldCanvas=document.createElement('canvas');fieldCanvas.width=sim.surface.n;fieldCanvas.height=sim.surface.n;const fc=fieldCanvas.getContext('2d'),pixels=fc.createImageData(sim.surface.n,sim.surface.n);let lastSurface=0;
  function drawSurface(){
    const n=sim.surface.n;const fraction=sim.inCup/Math.max(1,sim.espresso+sim.inCup);const mix=fraction*.42;
    const base=[119+mix*82,66+mix*100,29+mix*110];
    for(let i=0;i<n*n;i++){
      const a=i*4;if(!sim.surface.mask[i]){pixels.data[a+3]=0;continue;}
      const foam=sim.surface.foam[i];const x=i%n,y=Math.floor(i/n);const edge=Math.hypot((x+.5)/n*2-1,(y+.5)/n*2-1);const crema=Math.max(0,(edge-.84)/.16)*.18;
      const f=Math.min(1,foam+crema);pixels.data[a]=base[0]*(1-f)+247*f;pixels.data[a+1]=base[1]*(1-f)+235*f;pixels.data[a+2]=base[2]*(1-f)+205*f;pixels.data[a+3]=255;
    }
    fc.putImageData(pixels,0,0);
    const ctx=textureCanvas.getContext('2d');ctx.clearRect(0,0,256,256);ctx.drawImage(fieldCanvas,0,0,256,256);
    // Transient concentric disturbances originate at actual impact points.
    ctx.save();ctx.beginPath();ctx.arc(128,128,125,0,Math.PI*2);ctx.clip();
    for(const impact of sim.impacts){ctx.strokeStyle=`rgba(251,234,192,${(.8-impact.age)*.06})`;ctx.lineWidth=1;ctx.beginPath();ctx.ellipse((impact.x+1)*128,(impact.z+1)*128,impact.age*100+2,impact.age*100+2,0,0,Math.PI*2);ctx.stroke();}ctx.restore();texture.needsUpdate=true;
    const out=topdown;out.clearRect(0,0,320,320);out.fillStyle='#c6cfb4';out.beginPath();out.arc(160,162,142,0,Math.PI*2);out.fill();out.fillStyle='#faf3db';out.beginPath();out.arc(160,155,140,0,Math.PI*2);out.fill();
    if(sim.espresso>0)out.drawImage(textureCanvas,30,25,260,260);else{out.fillStyle='#ddd6bd';out.beginPath();out.arc(160,155,130,0,Math.PI*2);out.fill();out.fillStyle='#cac5ad';out.beginPath();out.arc(160,155,105,0,Math.PI*2);out.fill();}
    out.strokeStyle='#efe5c8';out.lineWidth=3;out.beginPath();out.arc(160,155,132,0,Math.PI*2);out.stroke();
  }
  let previousTime=performance.now(),accumulator=0,frameId,paused=false,pendingAdvance=null;let update=()=>{};
  function cancelAdvance(){if(pendingAdvance){const pending=pendingAdvance;pendingAdvance=null;pending.reject(new Error('Control returned to user.'));}}
  function advance(seconds){cancelAdvance();paused=false;return new Promise((resolve,reject)=>{pendingAdvance={remaining:seconds,resolve,reject};});}
  function frame(now){
    frameId=requestAnimationFrame(frame);const elapsed=Math.min((now-previousTime)/1000,.08);previousTime=now;accumulator+=elapsed;
    while(accumulator>=1/60){update(1/60);if(!paused){
      const dt=pendingAdvance?Math.min(1/60,pendingAdvance.remaining):1/60;sim.step(dt);
      if(pendingAdvance){pendingAdvance.remaining-=dt;if(pendingAdvance.remaining<1e-9){const pending=pendingAdvance;pendingAdvance=null;paused=true;pending.resolve();}}
    }
      const cupTarget=sim.espresso>=36?new THREE.Vector3(.2,1.53,1.02):new THREE.Vector3(-.43,1.53,.08);cup.position.lerp(cupTarget,.06);
      cupBody.setNextKinematicTranslation(cup.position);
      liquid.position.y=.17+(sim.espresso+sim.inCup)/240*.39;liquid.visible=sim.espresso>0;
      const c=sim.controls;
      if(sim.held){
        rotation.setFromAxisAngle(new THREE.Vector3(0,0,1),c.tilt/180*Math.PI*.75);
        lip.set(-.44,.7,0).applyQuaternion(rotation);
        // The lip position drives both the visible mesh and the ballistic drop source.
        pitcher.quaternion.copy(rotation);
        pitcher.position.set(cup.position.x+c.x*.49-lip.x,cup.position.y+liquid.position.y+sim.effectiveHeight()/1000*4-lip.y,cup.position.z+c.z*.49-lip.z);
      }else{pitcher.position.lerp(new THREE.Vector3(1.65,1.53,.4),.15);pitcher.quaternion.slerp(new THREE.Quaternion(),.15);}
      pitcherBody.setNextKinematicTranslation(pitcher.position);pitcherBody.setNextKinematicRotation(pitcher.quaternion);
      world.step();for(const d of dynamics){d.mesh.position.copy(d.body.translation());d.mesh.quaternion.copy(d.body.rotation());}
      accumulator-=1/60;
    }
    dropMesh.count=Math.min(96,sim.drops.length);for(let i=0;i<dropMesh.count;i++){const d=sim.drops[i];scratch.position.set(cup.position.x+d.x*.49,cup.position.y+liquid.position.y+d.y*4,cup.position.z+d.z*.49);scratch.scale.set(1,1.8,1);scratch.updateMatrix();dropMesh.setMatrixAt(i,scratch.matrix);}dropMesh.instanceMatrix.needsUpdate=true;
    for(const s of espressoStreams)s.visible=sim.extracting;
    for(let i=0;i<steamPuffs.length;i++){const p=steamPuffs[i];p.visible=sim.steaming;if(p.visible){const t=(now*.00045+i*.13)%1;p.position.set(1.6+Math.sin(i*4+now*.001)*t*.12,2.1+t*.85,.4);p.scale.setScalar(.4+t*1.1);}}
    for(let i=0;i<beans.length;i++)if(sim.grinding)beans[i].rotation.y+=.06;
    steamLever.rotation.z=sim.steaming?.25:-.35;
    for(const p of pressers){const active=p.command==='grind'?sim.grinding:p.command==='steam'?sim.steaming:sim.extracting;p.mesh.position.z=p.z-(active?.025:0);p.mesh.material.emissive.setHex(active?0x253114:0);}
    spill.count=sim.spillMarks.length;for(let i=0;i<spill.count;i++){const mark=sim.spillMarks[i];scratch.position.set(cup.position.x+mark.x*.49,1.56,cup.position.z+mark.z*.49);scratch.rotation.set(-Math.PI/2,0,0);const radius=.025+Math.sqrt(mark.volume)*.027;scratch.scale.set(radius,radius*.8,1);scratch.updateMatrix();spill.setMatrixAt(i,scratch.matrix);}spill.instanceMatrix.needsUpdate=true;scratch.rotation.set(0,0,0);
    ring.visible=sim.held;ring.position.set(cup.position.x,cup.position.y+liquid.position.y+.005,cup.position.z);
    if(now-lastSurface>40){drawSurface();lastSurface=now;}
    renderer.render(scene,camera);
  }
  drawSurface();frameId=requestAnimationFrame(frame);
  return {advance,cancelAdvance,setPaused(value){paused=value;},setUpdate(fn){update=fn;},dropSugar,world,cycleCamera(){cameraMode=(cameraMode+1)%3;const positions=[[10,10,13],[2,13,9],[9,7,11]];camera.position.set(...positions[cameraMode]);camera.lookAt(look);},capture(){drawSurface();return textureCanvas.toDataURL('image/png');},dispose(){cancelAdvance();cancelAnimationFrame(frameId);resizeObserver.disconnect();world.free();renderer.dispose();}};
}
