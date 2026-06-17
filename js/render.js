/* ============================================================
   MONKEY BUSINESS — render.js  (Three.js r128)
   Open-world cartoon zoo. Follow-cam, chunk-streamed biomes, a core
   banana pile you build a base around (placed towers + paid wall
   blocks, with a ghost preview), and fixed themed spawn markers.
   ============================================================ */
'use strict';

const ACCENT = { net:0x49b7e8, gold:0xffce5e, mud:0x9a6a38, wood:0xc08a3a, lime:0x8ed24a };

class Renderer{
  constructor(canvas, game){
    this.game=game; const C=CONFIG; this.WIRE_H=4.2;
    const r=this.renderer=new THREE.WebGLRenderer({canvas, antialias:true});
    r.setPixelRatio(Math.min(2,window.devicePixelRatio||1));
    r.shadowMap.enabled=true; r.shadowMap.type=THREE.PCFSoftShadowMap;
    r.outputEncoding=THREE.sRGBEncoding; r.toneMapping=THREE.NoToneMapping;

    const scene=this.scene=new THREE.Scene();
    scene.background=new THREE.Color(0x9bd8ef);
    scene.fog=new THREE.Fog(0xd6efe2, 330, 680);
    // gradient sky dome + soft image-based ambient (cartoon-realism depth)
    this.skyTex=this.makeSkyTex(); this.sky=new THREE.Mesh(new THREE.SphereGeometry(780,28,18), new THREE.MeshBasicMaterial({map:this.skyTex,side:THREE.BackSide,fog:false})); scene.add(this.sky);
    const envTex=this.makeSkyTex(); envTex.mapping=THREE.EquirectangularReflectionMapping; scene.environment=envTex;

    this.camera=new THREE.PerspectiveCamera(46,1,1,1400);
    this.camOff=new THREE.Vector3(0,64,49); this.camPos=new THREE.Vector3(0,64,60); this.camLook=new THREE.Vector3(0,0,0);
    this.camera.position.copy(this.camPos); this.camera.lookAt(0,0,0);

    scene.add(new THREE.HemisphereLight(0xcfeaff, 0x4e7a32, 0.5));
    const sun=this.sun=new THREE.DirectionalLight(0xfff0cf, 1.25); sun.position.set(40,86,30); sun.castShadow=true;
    sun.shadow.mapSize.set(2048,2048); const sc=sun.shadow.camera; sc.near=20; sc.far=260; sc.left=-90; sc.right=90; sc.top=90; sc.bottom=-90; sun.shadow.bias=-0.0004;
    scene.add(sun); scene.add(sun.target);
    const fill=new THREE.DirectionalLight(0xbfe0ff,0.22); fill.position.set(-40,40,-30); scene.add(fill);
    const rim=new THREE.DirectionalLight(0xaad2ff,0.55); rim.position.set(-55,30,-65); scene.add(rim);   // cool back rim separates silhouettes

    this.grassTex=this.makeGrassTex(); this.glowTex=this.makeGlow(); this.woodTex=this.makeWoodTex(); this.dirtTex=this.makeDirtTex();

    const ground=new THREE.Mesh(new THREE.PlaneGeometry(1500,1500), new THREE.MeshStandardMaterial({map:this.grassTex,roughness:1}));
    ground.rotation.x=-Math.PI/2; ground.receiveShadow=true; scene.add(ground);

    // territory overlay — an openfront-style claimed zone (glowing border) that grows as you build
    this.TERR_SPAN=520; this.terrCanvas=document.createElement('canvas'); this.terrCanvas.width=this.terrCanvas.height=512; this.terrTex=new THREE.CanvasTexture(this.terrCanvas);
    this.terrMesh=new THREE.Mesh(new THREE.PlaneGeometry(this.TERR_SPAN,this.TERR_SPAN),new THREE.MeshBasicMaterial({map:this.terrTex,transparent:true,depthWrite:false,opacity:0.85}));
    this.terrMesh.rotation.x=-Math.PI/2; this.terrMesh.position.y=0.05; scene.add(this.terrMesh);

    this.chunks=new Map(); this.cleared=new Set();   // world props the player has chopped down (persist across chunk reloads, reset each run)
    this.chunkGroup=new THREE.Group(); this.structGroup=new THREE.Group(); this.wallGroup=new THREE.Group();
    this.ghostGroup=new THREE.Group(); this.spawnGroup=new THREE.Group();
    this.monkeyGroup=new THREE.Group(); this.trainGroup=new THREE.Group(); this.netGroup=new THREE.Group(); this.fxGroup=new THREE.Group();
    this.worldGroup=new THREE.Group(); this.wireGroup=new THREE.Group(); this.clawGroup=new THREE.Group(); this.claws=[];
    scene.add(this.chunkGroup,this.structGroup,this.wallGroup,this.ghostGroup,this.spawnGroup,this.monkeyGroup,this.trainGroup,this.netGroup,this.fxGroup,this.worldGroup,this.wireGroup,this.clawGroup);
    this.fx=[];
    // drifting dust motes for atmosphere
    this.motes=new THREE.Group(); scene.add(this.motes); this._moteData=[];
    for(let i=0;i<22;i++){ const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glowTex,color:0xfff3cf,blending:THREE.AdditiveBlending,transparent:true,opacity:0,depthWrite:false})); const s=0.5+Math.random()*0.7; sp.scale.set(s,s,1); this.motes.add(sp); this._moteData.push({sp,ox:U.rand(-60,60),oy:U.rand(5,32),oz:U.rand(-60,60),ph:U.rand(TAU),v:U.rand(0.2,0.5)}); }

    this.coreGroup=new THREE.Group(); this.coreGroup.position.set(C.core.x,0,C.core.y); scene.add(this.coreGroup); this.buildCore(C.bananas);
    this.flagPole=this.makeFlagPole(); this.flagPole.position.set(C.core.x,0,C.core.y); scene.add(this.flagPole);   // central hub the supply wires snap to
    this.hero=this.makeHero(); scene.add(this.hero);
    this.truck=this.makeTruck(); this.truck.visible=false; scene.add(this.truck);
    this.buildWorld();
    this.resize();
  }

  /* ---------- materials / textures ---------- */
  mat(hex,o={}){ return new THREE.MeshStandardMaterial({color:hex,map:o.map||null,roughness:o.r??0.75,metalness:o.m||0,emissive:o.e?hex:0,emissiveIntensity:o.e||0,flatShading:!!o.flat}); }
  makeGrassTex(){ const c=document.createElement('canvas'); c.width=c.height=256; const x=c.getContext('2d');
    x.fillStyle='#54992f'; x.fillRect(0,0,256,256);
    for(let i=0;i<2600;i++){ const g=Math.random(); x.fillStyle=g<0.5?'#5fa838':(g<0.8?'#4a8a2b':'#6cb842'); const s=1+Math.random()*2; x.fillRect(Math.random()*256,Math.random()*256,s,s); }
    const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(60,60); return t; }
  makeGlow(){ const c=document.createElement('canvas'); c.width=c.height=64; const x=c.getContext('2d'); const g=x.createRadialGradient(32,32,0,32,32,32); g.addColorStop(0,'rgba(255,255,255,1)'); g.addColorStop(0.4,'rgba(255,230,150,0.6)'); g.addColorStop(1,'rgba(255,210,90,0)'); x.fillStyle=g; x.fillRect(0,0,64,64); return new THREE.CanvasTexture(c); }
  makeSkyTex(){ const c=document.createElement('canvas'); c.width=4; c.height=256; const x=c.getContext('2d'); const g=x.createLinearGradient(0,0,0,256);
    g.addColorStop(0,'#6fb8e6'); g.addColorStop(0.44,'#a9dbf0'); g.addColorStop(0.62,'#dff1e6'); g.addColorStop(1,'#eaf3da'); x.fillStyle=g; x.fillRect(0,0,4,256); return new THREE.CanvasTexture(c); }
  makeWoodTex(){ const c=document.createElement('canvas'); c.width=c.height=64; const x=c.getContext('2d'); x.fillStyle='#9a6a3b'; x.fillRect(0,0,64,64);
    for(let y=0;y<64;y+=13){ x.fillStyle='#6f4c28'; x.fillRect(0,y,64,2.5); x.fillStyle='rgba(196,146,84,0.3)'; x.fillRect(0,y+3,64,4); }   // stacked-log bands
    for(let i=0;i<420;i++){ x.fillStyle=Math.random()<0.5?'rgba(104,68,32,0.3)':'rgba(190,140,80,0.22)'; x.fillRect(Math.random()*64,Math.random()*64,3,1); }
    const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; return t; }
  makeDirtTex(){ const c=document.createElement('canvas'); c.width=c.height=64; const x=c.getContext('2d'); x.fillStyle='#7a5226'; x.fillRect(0,0,64,64);
    for(let i=0;i<760;i++){ const g=Math.random(); x.fillStyle=g<0.4?'#6a4520':(g<0.75?'#8a6030':'#9a6f3a'); const s=1+Math.random()*2; x.fillRect(Math.random()*64,Math.random()*64,s,s); }
    const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(2,2); return t; }
  makeFlower(rng){ const g=new THREE.Group(); const stem=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,0.8,4),this.mat(0x4f9e36)); stem.position.y=0.4; g.add(stem);
    const cols=[0xff7aa8,0xffd24a,0xff8a4a,0xb98aff,0xff5a6a]; const cc=cols[(rng()*cols.length)|0];
    for(let i=0;i<5;i++){ const a=i/5*TAU; const pet=new THREE.Mesh(new THREE.SphereGeometry(0.17,6,5),this.mat(cc)); pet.position.set(Math.cos(a)*0.19,0.85,Math.sin(a)*0.19); g.add(pet); }
    const mid=new THREE.Mesh(new THREE.SphereGeometry(0.13,6,5),this.mat(0xffe24a)); mid.position.y=0.86; g.add(mid); return g; }
  updateMotes(h,t){ if(!this._moteData) return; for(const m of this._moteData){ m.sp.position.set(h.x+m.ox+Math.sin(t*m.v+m.ph)*3, m.oy+Math.sin(t*0.5+m.ph)*1.6, h.y+m.oz+Math.cos(t*m.v*0.8+m.ph)*3); m.sp.material.opacity=0.09+0.06*Math.sin(t*1.2+m.ph); } }

  /* ---------- chunk streaming + biomes ---------- */
  seedRng(cx,cy){ let s=((cx*73856093)^(cy*19349663))>>>0; return ()=>{ s=(s*1664525+1013904223)>>>0; return s/4294967296; }; }
  isCoreClear(wx,wy){ return U.dist(wx,wy,0,0) < 18; }
  regionForAngle(a){ let best='savanna',bd=1e9; for(const k in CONFIG.regions){ let diff=a-CONFIG.regions[k].ang; diff=Math.atan2(Math.sin(diff),Math.cos(diff)); const d=Math.abs(diff); if(d<bd){bd=d;best=k;} } return best; }
  streamWorld(hero){ const cs=CONFIG.chunk, vr=CONFIG.viewChunks; const hcx=Math.floor(hero.x/cs), hcy=Math.floor(hero.y/cs);
    for(let dx=-vr;dx<=vr;dx++) for(let dy=-vr;dy<=vr;dy++){ const cx=hcx+dx, cy=hcy+dy, k=cx+','+cy; if(!this.chunks.has(k)) this.buildChunk(cx,cy,k); }
    for(const [k,g] of this.chunks){ const [cx,cy]=k.split(',').map(Number); if(Math.max(Math.abs(cx-hcx),Math.abs(cy-hcy))>vr+1){ this.chunkGroup.remove(g); this.disposeGroup(g); this.chunks.delete(k); this._collDirty=true; } }
    if(this._collDirty){ this.colliders=[]; for(const [k,g] of this.chunks){ if(g.userData.col) for(const c of g.userData.col) this.colliders.push(c); } this._collDirty=false; }
  }
  buildChunk(cx,cy,k){ const cs=CONFIG.chunk, rng=this.seedRng(cx,cy), g=new THREE.Group();
    const ccx=cx*cs+cs/2, ccy=cy*cs+cs/2, cdist=Math.hypot(ccx,ccy);
    const regKey=this.regionForAngle(Math.atan2(ccy,ccx)), reg=CONFIG.regions[regKey];
    if(cdist>20){ const tile=new THREE.Mesh(new THREE.PlaneGeometry(cs,cs),this.mat(reg.ground,{r:1})); tile.rotation.x=-Math.PI/2; tile.position.set(ccx,0.02,ccy); tile.receiveShadow=true; g.add(tile); }
    const n = regKey==='jungle' ? 6+Math.floor(rng()*5) : regKey==='savanna' ? 2+Math.floor(rng()*3) : 4+Math.floor(rng()*4);
    const cols=[];
    for(let i=0;i<n;i++){ const wx=cx*cs+rng()*cs, wy=cy*cs+rng()*cs; if(this.isCoreClear(wx,wy)) continue;
      const prop=this.makeBiomeProp(regKey,rng), rot=rng()*TAU;   // consume rng identically whether kept or cleared, so reloads stay deterministic
      if(this.cleared.has(wx.toFixed(2)+','+wy.toFixed(2))){ this.disposeGroup(prop); continue; }
      prop.position.set(wx,0,wy); prop.rotation.y=rot; g.add(prop);
      if(prop.userData.col) cols.push({x:wx,y:wy,r:prop.userData.col,mesh:prop}); }
    g.userData.col=cols; this.chunkGroup.add(g); this.chunks.set(k,g); this._collDirty=true;
  }
  makeBiomeProp(reg,rng){ const t=rng();
    if(reg==='jungle'){ if(t<0.5) return this.makeTree(rng); if(t<0.7) return this.makeBush(rng); if(t<0.86) return this.makeFlower(rng); return this.makeRock(rng); }
    if(reg==='mountains'){ if(t<0.45) return this.makeRock(rng); if(t<0.78) return this.makePine(rng); return this.makeMound(rng); }
    if(reg==='zoo'){ if(t<0.4) return this.makeRock(rng); if(t<0.66) return this.makePine(rng); return this.makeCrate(rng); }
    if(t<0.42) return this.makeAcacia(rng); if(t<0.64) return this.makeGrassTuft(rng); if(t<0.85) return this.makeFlower(rng); return this.makeRock(rng); }
  makeTree(rng){ const g=new THREE.Group(); const h=5+rng()*4;
    const trunk=new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.8,h,7),this.mat(0x7a5230,{flat:true})); trunk.position.y=h/2; trunk.castShadow=true; g.add(trunk);
    const greens=[0x4f9e36,0x5cb343,0x47913a]; const tiers=2+Math.floor(rng()*2);
    for(let i=0;i<tiers;i++){ const rr=3.4-i*0.7; const cone=new THREE.Mesh(new THREE.ConeGeometry(rr,3.4,8),this.mat(greens[i%greens.length],{flat:true,r:0.9})); cone.position.y=h-0.5+i*2.1; cone.castShadow=true; g.add(cone); }
    g.userData.col=1.3; return g; }
  makeBush(rng){ const g=new THREE.Group(); const m=this.mat(0x53a93c,{flat:true,r:0.9}); const lobes=3+Math.floor(rng()*3);
    for(let i=0;i<lobes;i++){ const s=0.9+rng()*1.1; const b=new THREE.Mesh(new THREE.SphereGeometry(s,8,6),m); b.position.set((rng()-0.5)*2.4,s*0.8,(rng()-0.5)*2.4); b.castShadow=true; g.add(b); } g.userData.col=1.3; return g; }
  makeRock(rng){ const g=new THREE.Group(); const m=this.mat(0x8d8f93,{flat:true,r:0.95}); const n=1+Math.floor(rng()*2);
    for(let i=0;i<n;i++){ const s=0.8+rng()*1.6; const rk=new THREE.Mesh(new THREE.DodecahedronGeometry(s,0),m); rk.position.set((rng()-0.5)*2,s*0.5,(rng()-0.5)*2); rk.rotation.set(rng(),rng(),rng()); rk.castShadow=true; g.add(rk); } g.userData.col=1.4; return g; }
  makeGrassTuft(rng){ const g=new THREE.Group(); const m=this.mat(0x6fbf45,{flat:true}); for(let i=0;i<4;i++){ const bl=new THREE.Mesh(new THREE.ConeGeometry(0.18,1.2+rng(),4),m); bl.position.set((rng()-0.5)*1.4,0.6,(rng()-0.5)*1.4); bl.rotation.z=(rng()-0.5)*0.5; g.add(bl); } return g; }
  makePine(rng){ const g=new THREE.Group(); const h=6+rng()*4;
    const trunk=new THREE.Mesh(new THREE.CylinderGeometry(0.4,0.6,h*0.5,6),this.mat(0x6a4a2c,{flat:true})); trunk.position.y=h*0.25; trunk.castShadow=true; g.add(trunk);
    for(let i=0;i<3;i++){ const rr=2.6-i*0.7; const cone=new THREE.Mesh(new THREE.ConeGeometry(rr,2.6,7),this.mat(0x2f6e3a,{flat:true,r:0.9})); cone.position.y=h*0.4+i*1.8; cone.castShadow=true; g.add(cone); } g.userData.col=1.2; return g; }
  makeAcacia(rng){ const g=new THREE.Group(); const h=4+rng()*2;
    const trunk=new THREE.Mesh(new THREE.CylinderGeometry(0.3,0.5,h,6),this.mat(0x8a6a3c,{flat:true})); trunk.position.y=h/2; trunk.castShadow=true; g.add(trunk);
    const canopy=new THREE.Mesh(new THREE.CylinderGeometry(3.4,3.7,1.0,9),this.mat(0x6f9e3a,{flat:true,r:0.9})); canopy.position.y=h+0.4; canopy.castShadow=true; g.add(canopy); g.userData.col=1.0; return g; }
  makeCrate(rng){ const g=new THREE.Group(); const s=1.4+rng()*1.0;
    const box=new THREE.Mesh(new THREE.BoxGeometry(s,s,s),this.mat(0x9a6a3b,{flat:true})); box.position.y=s/2; box.castShadow=true; g.add(box);
    const bars=new THREE.Mesh(new THREE.BoxGeometry(s*1.04,s*1.04,s*1.04),new THREE.MeshBasicMaterial({color:0x6a6f76,wireframe:true})); bars.position.y=s/2; g.add(bars); g.userData.col=1.4; return g; }
  makeMound(rng){ const s=4+rng()*4; const m=new THREE.Mesh(new THREE.SphereGeometry(s,10,7,0,TAU,0,Math.PI*0.5),this.mat(0x8a9098,{flat:true,r:1})); m.scale.y=0.32; m.position.y=-0.2; m.receiveShadow=true; m.castShadow=true; return m; }
  // free BOTH geometry and materials — disposing only geometry leaked a material (and its GPU program) per mesh on every chunk unload, which is what bloated the tab
  disposeGroup(g){ g.traverse(o=>{ if(o.geometry) o.geometry.dispose(); const m=o.material; if(m){ if(Array.isArray(m)) m.forEach(x=>x&&x.dispose()); else m.dispose(); } }); }
  clearChunks(){ for(const [k,g] of this.chunks){ this.chunkGroup.remove(g); this.disposeGroup(g); } this.chunks.clear(); this.cleared.clear(); this._collDirty=true; }
  // chop down the world prop nearest (x,y): drop its mesh + collider and remember it so it doesn't respawn when the chunk reloads
  clearPropAt(x,y){ if(!this.colliders) return null; let best=null,bd=1e9; for(const c of this.colliders){ const d=U.dist(x,y,c.x,c.y); if(d<bd){bd=d;best=c;} } if(!best) return null;
    this.cleared.add(best.x.toFixed(2)+','+best.y.toFixed(2));
    if(best.mesh){ const par=best.mesh.parent; if(par){ par.remove(best.mesh); if(par.userData.col){ const i=par.userData.col.indexOf(best); if(i>=0) par.userData.col.splice(i,1); } } this.disposeGroup(best.mesh); }
    this._collDirty=true; return {x:best.x,y:best.y}; }

  /* ---------- static world landmarks ---------- */
  buildWorld(){ const W=this.worldGroup;
    for(const k in CONFIG.regions){ const reg=CONFIG.regions[k]; const tr=new THREE.Group();
      const strip=new THREE.Mesh(new THREE.PlaneGeometry(6,120),this.mat(0x8a6a3c,{r:1})); strip.rotation.x=-Math.PI/2; strip.position.z=80; strip.receiveShadow=true; tr.add(strip);
      for(let i=0;i<5;i++){ const st=new THREE.Mesh(new THREE.CylinderGeometry(0.9,1.0,0.3,7),this.mat(0xb0926a)); st.position.set((i%2?1:-1)*1.4,0.16,30+i*22); tr.add(st); }
      tr.rotation.y=Math.PI/2-reg.ang; tr.position.y=0.03; W.add(tr); }
    const wa=CONFIG.water, slen=wa.z1-wa.z0;
    const stream=new THREE.Mesh(new THREE.PlaneGeometry(wa.halfW*2,slen),this.mat(0x49a6d6,{e:0.06,r:0.4})); stream.rotation.x=-Math.PI/2; stream.position.set(wa.x,0.04,(wa.z0+wa.z1)/2); W.add(stream);
    for(let i=0;i<5;i++){ const plank=new THREE.Mesh(new THREE.BoxGeometry(wa.halfW*2+4,0.32,2.6),this.mat(0xa9824e,{flat:true})); plank.position.set(wa.x,0.42,-wa.bridgeHalf+i*(wa.bridgeHalf*2/4)); plank.castShadow=true; W.add(plank); }
    this.buildZooGate();
  }
  buildZooGate(){ const g=new THREE.Group(); g.position.set(96,0,0); g.rotation.y=Math.PI/2; const brick=this.mat(0xb24a36,{flat:true,r:0.85});
    for(const sz of [-7,7]){ const pil=new THREE.Mesh(new THREE.BoxGeometry(3,9,3),brick); pil.position.set(0,4.5,sz); pil.castShadow=true; g.add(pil); }
    const lintel=new THREE.Mesh(new THREE.BoxGeometry(3,2.4,17),brick); lintel.position.set(0,9.6,0); lintel.castShadow=true; g.add(lintel);
    const sign=new THREE.Mesh(new THREE.BoxGeometry(0.4,2.2,8),this.mat(0xddc27a)); sign.position.set(-1.7,9.7,0); g.add(sign);
    const bars=new THREE.Group(); for(let z=-6;z<=6;z+=1.5){ const bar=new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.22,8,6),this.mat(0x7a7f86,{m:0.3})); bar.position.set(0,4,z); bars.add(bar); } g.add(bars);
    this.zooBars=bars; this.worldGroup.add(g); }
  openZooGate(){ if(!this.zooBars||this._zooOpen) return; this._zooOpen=true; this.zooBars.visible=false; this.burst(96,0,0xff6a4a); this.burst(96,7,0xffce5e); }
  closeZooGate(){ if(this.zooBars) this.zooBars.visible=true; this._zooOpen=false; }

  /* ---------- core pile ---------- */
  buildCore(n){ const g=this.coreGroup; while(g.children.length) g.remove(g.children[0]);
    const dirt=new THREE.Mesh(new THREE.CircleGeometry(6,28),this.mat(0xffffff,{r:1,map:this.dirtTex})); dirt.rotation.x=-Math.PI/2; dirt.position.y=0.06; g.add(dirt);
    const show=Math.min(n,30), bMat=this.mat(0xffcf33,{r:0.38,m:0.12});
    for(let i=0;i<show;i++){ const a=i*2.39, rr=0.6+(i%5)*0.95, bx=Math.cos(a)*rr*0.85, bz=Math.sin(a)*rr*0.85, by=0.6+Math.floor(i/8)*1.0;
      const ban=new THREE.Mesh(THREE.CapsuleGeometry?new THREE.CapsuleGeometry(0.34,1.25,4,6):new THREE.CylinderGeometry(0.3,0.34,1.6,7), bMat);
      ban.position.set(bx,by,bz); ban.rotation.set(0,a,1.1+(i%3)*0.2); ban.castShadow=true; g.add(ban); }
    const sign=new THREE.Mesh(new THREE.BoxGeometry(0.4,3,0.4),this.mat(0x7a5230)); sign.position.set(0,1.5,-6.4); g.add(sign);
  }
  updateCore(n){ if(n!==this._coreN){ this._coreN=n; this.buildCore(Math.max(0,n)); } }

  /* ---------- base: reset, structures, walls, ghost, spawn markers ---------- */
  resetBase(){ for(const g of [this.structGroup,this.wallGroup,this.spawnGroup,this.monkeyGroup,this.trainGroup,this.wireGroup,this.clawGroup]){ while(g.children.length){ const c=g.children[0]; g.remove(c); this.disposeGroup(c); } }
    this.claws=[]; this.clearGhost(); this._trainCount=0; this.setTruck(false); this.clearChunks(); }
  makeFlagPole(){ const g=new THREE.Group();
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.24,0.3,9.5,8),this.mat(0xc9cdd2,{m:0.3})); pole.position.y=4.75; pole.castShadow=true; g.add(pole);
    const ball=new THREE.Mesh(new THREE.SphereGeometry(0.4,10,8),this.mat(0xffce5e,{e:0.2})); ball.position.y=9.6; g.add(ball);
    const flag=new THREE.Mesh(new THREE.BoxGeometry(0.12,1.7,2.8),this.mat(0xff8a3a,{e:0.12})); flag.position.set(0,8.3,1.4); flag.castShadow=true; g.add(flag);
    const ban=new THREE.Mesh(new THREE.CylinderGeometry(0.13,0.13,0.9,6),this.mat(0xffe24a)); ban.position.set(0,8.3,1.4); ban.rotation.x=0.5; g.add(ban);
    return g; }
  /* ---- supply network: poles already placed as structures; here we string wires + run claws ---- */
  drawSupply(game){ const wg=this.wireGroup; while(wg.children.length){ const c=wg.children[0]; wg.remove(c); this.disposeGroup(c); }
    const H=this.WIRE_H; for(const e of (game.supplyWires||[])) this.addWire(wg,e[0],e[1],e[2],e[3],H);
    // claws are per-farm and PRESERVED across rebuilds (placing/upgrading anything must not restart them)
    this.claws=[];
    for(const s of game.structures){ if(s.type==='farm' && s.connected && s.path && s.path.length>=2){
        if(!s._claw) s._claw=this.makeClaw(s.path,H); else this.retargetClaw(s._claw,s.path,H);   // keep its travel progress
        this.claws.push(s._claw);
      } else if(s._claw){ this.clawGroup.remove(s._claw.grp); this.disposeGroup(s._claw.grp); s._claw=null; } } }
  retargetClaw(c,path,h){ const pts=path.map(p=>new THREE.Vector3(p.x,h,p.y)); const segLen=[]; let total=0; for(let i=0;i<pts.length-1;i++){ const l=pts[i].distanceTo(pts[i+1]); segLen.push(l); total+=l; } c.pts=pts; c.segLen=segLen; c.total=Math.max(0.001,total); if(c.t>c.total) c.t=c.total; }
  addWire(g,ax,ay,bx,by,h){ const a=new THREE.Vector3(ax,h,ay), b=new THREE.Vector3(bx,h,by), len=a.distanceTo(b); if(len<0.1) return;
    const m=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.07,len,5),this.mat(0x33291e)); m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), b.clone().sub(a).normalize()); g.add(m); }
  makeClaw(path,h){ const grp=new THREE.Group();
    const trolley=new THREE.Mesh(new THREE.BoxGeometry(0.8,0.4,0.6),this.mat(0x5a6068,{m:0.4})); grp.add(trolley);
    for(const sx of [-1,1]) for(const sz of [-1,1]){ const pr=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.02,0.8,4),this.mat(0x9aa0a8,{m:0.4})); pr.position.set(sx*0.2,-0.55,sz*0.16); pr.rotation.set(sz*0.25,0,-sx*0.25); grp.add(pr); }
    const ban=new THREE.Mesh(THREE.CapsuleGeometry?new THREE.CapsuleGeometry(0.22,0.7,3,6):new THREE.CylinderGeometry(0.2,0.2,0.9,6),this.mat(0xffcf33)); ban.position.y=-0.95; ban.rotation.z=0.5; grp.add(ban);
    this.clawGroup.add(grp);
    const pts=path.map(p=>new THREE.Vector3(p.x,h,p.y)); const segLen=[]; let total=0; for(let i=0;i<pts.length-1;i++){ const l=pts[i].distanceTo(pts[i+1]); segLen.push(l); total+=l; }
    return {grp,ban,pts,segLen,total:Math.max(0.001,total),t:0,dir:1,carry:true,speed:8}; }
  posAlong(pts,segLen,d){ let i=0; while(i<segLen.length && d>segLen[i]){ d-=segLen[i]; i++; } if(i>=segLen.length) return pts[pts.length-1]; const a=pts[i],b=pts[i+1],t=segLen[i]>0?d/segLen[i]:0; return a.clone().lerp(b,t); }
  updateClaws(dt){ if(!this.claws) return; for(const c of this.claws){ c.t+=c.speed*dt*c.dir;
    if(c.t>=c.total){ c.t=c.total; c.dir=-1; c.carry=false; } else if(c.t<=0){ c.t=0; c.dir=1; c.carry=true; }
    c.grp.position.copy(this.posAlong(c.pts,c.segLen,c.t)); c.ban.visible=c.carry; } }
  // redraw the claimed-territory overlay: union of glowing discs around the pile + everything built
  drawTerritory(game){ if(!this.terrCanvas) return; const c=this.terrCanvas, x=c.getContext('2d'), S=c.width, span=this.TERR_SPAN, sc=S/span; x.clearRect(0,0,S,S);
    const pts=[{x:CONFIG.core.x,y:CONFIG.core.y,r:15}];
    for(const s of game.structures) pts.push({x:s.x,y:s.y,r:CONFIG.build[s.type].foot+6});
    for(const w of game.wallBlocks) pts.push({x:w.x,y:w.y,r:CONFIG.build.wall.foot+5});
    const cv=(wx,wy)=>[(wx+span/2)*sc,(wy+span/2)*sc];
    x.save(); x.shadowColor='rgba(255,205,95,0.6)'; x.shadowBlur=3; x.fillStyle='#eebf4c';
    for(const p of pts){ const [cx,cy]=cv(p.x,p.y); x.beginPath(); x.arc(cx,cy,(p.r+1.7)*sc,0,Math.PI*2); x.fill(); } x.restore();
    x.globalCompositeOperation='destination-out'; for(const p of pts){ const [cx,cy]=cv(p.x,p.y); x.beginPath(); x.arc(cx,cy,p.r*sc,0,Math.PI*2); x.fill(); }
    x.globalCompositeOperation='source-over'; x.fillStyle='rgba(150,195,78,0.09)'; for(const p of pts){ const [cx,cy]=cv(p.x,p.y); x.beginPath(); x.arc(cx,cy,p.r*sc,0,Math.PI*2); x.fill(); }
    this.terrTex.needsUpdate=true; }
  buildSpawnMarkers(frontiers){ const g=this.spawnGroup; while(g.children.length){ const c=g.children[0]; g.remove(c); this.disposeGroup(c); }
    for(const k of frontiers){ if(k==='zoo') continue; const reg=CONFIG.regions[k]; const m=new THREE.Group(); m.position.set(reg.sx,0,reg.sy);
      for(const s of [-1,1]){ const post=new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.6,6,7),this.mat(0x7a5128,{flat:true})); post.position.set(s*3.2,3,0); post.castShadow=true; m.add(post); }
      const banner=new THREE.Mesh(new THREE.BoxGeometry(7.2,2.4,0.4),this.mat(ACCENT.gold,{e:0.15})); banner.position.set(0,5,0); m.add(banner);
      const arrow=new THREE.Mesh(new THREE.ConeGeometry(1.3,2.6,4),new THREE.MeshBasicMaterial({color:0xff6a4a})); arrow.rotation.x=Math.PI/2; arrow.position.set(0,1.6,5); m.add(arrow);
      m.lookAt(0,0,0); g.add(m); } }
  makeWallBlock(){ const g=new THREE.Group();
    const base=new THREE.Mesh(new THREE.BoxGeometry(5.4,2.6,5.4),this.mat(0xffffff,{flat:true,r:0.85,map:this.woodTex})); base.position.y=1.3; base.castShadow=true; base.receiveShadow=true; g.add(base);
    const cap=new THREE.Mesh(new THREE.BoxGeometry(5.9,0.6,5.9),this.mat(0x7a5128,{flat:true})); cap.position.y=2.7; cap.castShadow=true; g.add(cap); return g; }
  syncStructures(list){ for(const s of list){ if(!s.mesh || s._dirty){ if(s.mesh){ this.structGroup.remove(s.mesh); this.disposeGroup(s.mesh); } s.mesh=this.makeTower(s.type,s.level); s.mesh.position.set(s.x,0,s.y); this.structGroup.add(s.mesh); s._dirty=false; }
    if(s.type==='farm' && s.mesh.userData.warn) s.mesh.userData.warn.visible = !s.connected; } }
  syncWalls(list){ for(const w of list){ if(!w.mesh){ w.mesh=this.makeWallBlock(); w.mesh.position.set(w.x,0,w.y); this.wallGroup.add(w.mesh); } } }
  setGhost(type,x,y,valid){ const foot=CONFIG.build[type].foot;
    if(!this.ghost || this.ghost.userData.type!==type){ if(this.ghost){ this.ghostGroup.remove(this.ghost); this.disposeGroup(this.ghost); }
      const g=new THREE.Group(); g.userData.type=type;
      const disc=new THREE.Mesh(new THREE.CircleGeometry(foot+0.7,24),new THREE.MeshBasicMaterial({transparent:true,opacity:0.45,depthWrite:false})); disc.rotation.x=-Math.PI/2; disc.position.y=0.14; g.add(disc); g.userData.disc=disc;
      const box=new THREE.Mesh(new THREE.BoxGeometry(foot*1.5,3.2,foot*1.5),new THREE.MeshBasicMaterial({transparent:true,opacity:0.28,depthWrite:false})); box.position.y=1.7; g.add(box); g.userData.box=box;
      this.ghost=g; this.ghostGroup.add(g); }
    this.ghost.visible=true; this.ghost.position.set(x,0,y); const col=valid?0x66e066:0xe06666; this.ghost.userData.disc.material.color.setHex(col); this.ghost.userData.box.material.color.setHex(col); }
  clearGhost(){ if(this.ghost) this.ghost.visible=false; }
  // red marker over the structure the cursor is about to sell (Sell mode)
  setSellGhost(p){ if(!p){ if(this.sellGhost) this.sellGhost.visible=false; return; }
    if(!this.sellGhost){ const g=new THREE.Group();
      const ring=new THREE.Mesh(new THREE.TorusGeometry(2.6,0.32,8,24),new THREE.MeshBasicMaterial({color:0xff5a4a,transparent:true,opacity:0.9,depthWrite:false})); ring.rotation.x=-Math.PI/2; ring.position.y=0.3; g.add(ring);
      const box=new THREE.Mesh(new THREE.BoxGeometry(4.4,4.4,4.4),new THREE.MeshBasicMaterial({color:0xff5a4a,wireframe:true,transparent:true,opacity:0.45,depthWrite:false})); box.position.y=2.2; g.add(box);
      this.sellGhost=g; this.ghostGroup.add(g); }
    this.sellGhost.visible=true; this.sellGhost.position.set(p.x,0,p.y); }

  /* ---------- hero / keepers ---------- */
  makeHero(){ const g=new THREE.Group();
    const legL=new THREE.Mesh(new THREE.CylinderGeometry(0.34,0.3,1.5,7),this.mat(0x4a5a32)); legL.position.set(-0.45,0.75,0); g.add(legL);
    const legR=legL.clone(); legR.position.x=0.45; g.add(legR); g.userData.legL=legL; g.userData.legR=legR;
    const torso=new THREE.Mesh(new THREE.CylinderGeometry(1.05,0.9,2.1,12),this.mat(0xcbb079)); torso.position.y=2.3; torso.castShadow=true; g.add(torso);
    const vest=new THREE.Mesh(new THREE.CylinderGeometry(1.14,1.0,1.2,12),this.mat(0xe8743a,{e:0.14})); vest.position.y=2.7; g.add(vest);
    const head=new THREE.Mesh(new THREE.SphereGeometry(0.86,16,14),this.mat(0xe8c79a)); head.position.y=3.9; head.castShadow=true; g.add(head);
    const cap=new THREE.Mesh(new THREE.SphereGeometry(0.9,16,8,0,TAU,0,Math.PI*0.55),this.mat(0x3c6a2e)); cap.position.y=4.2; g.add(cap);
    const brim=new THREE.Mesh(new THREE.CylinderGeometry(1.35,1.35,0.13,16),this.mat(0x3c6a2e)); brim.position.set(0,4.12,0.3); g.add(brim);
    const gun=new THREE.Mesh(new THREE.BoxGeometry(0.42,0.42,2.3),this.mat(0x39424a)); gun.position.set(0.9,2.55,0.95); g.add(gun);
    const hopper=new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.4,0.9,8),this.mat(0x2b8fc4,{e:0.1})); hopper.position.set(0.9,3.1,0.6); g.add(hopper);
    const halo=new THREE.Mesh(new THREE.RingGeometry(1.8,2.2,28),new THREE.MeshBasicMaterial({color:0xffe08a,transparent:true,opacity:0.5,side:THREE.DoubleSide})); halo.rotation.x=-Math.PI/2; halo.position.y=0.12; g.add(halo);
    return g; }
  makeKeeper(){ const g=new THREE.Group(); const sc=0.72;
    const legs=new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.5,1.2,7),this.mat(0x4a5a32)); legs.position.y=0.6*sc; g.add(legs);
    const torso=new THREE.Mesh(new THREE.CylinderGeometry(0.8,0.7,1.7,10),this.mat(0xdcc488)); torso.position.y=1.7*sc; torso.castShadow=true; g.add(torso);
    const vest=new THREE.Mesh(new THREE.CylinderGeometry(0.86,0.76,0.9,10),this.mat(0x8ed24a,{e:0.16})); vest.position.y=2.0*sc; g.add(vest);
    const head=new THREE.Mesh(new THREE.SphereGeometry(0.6,12,10),this.mat(0xe8c79a)); head.position.y=2.9*sc; head.castShadow=true; g.add(head);
    const cap=new THREE.Mesh(new THREE.SphereGeometry(0.63,12,7,0,TAU,0,Math.PI*0.55),this.mat(0x6ea83a)); cap.position.y=3.1*sc; g.add(cap);
    const gun=new THREE.Mesh(new THREE.BoxGeometry(0.3,0.3,1.6),this.mat(0x39424a)); gun.position.set(0.65,1.9*sc,0.7); g.add(gun);
    g.scale.setScalar(sc); return g; }

  /* ---------- monkeys ---------- */
  makeMonkey(type){ const def=CONFIG.monkeys[type], g=new THREE.Group(), r=def.r, m=this.mat(def.hex,{r:0.6}), dk=this.mat(0x3a2412);
    const body=new THREE.Mesh(new THREE.SphereGeometry(r,18,15),m); body.scale.set(1,1.05,0.9); body.position.y=r; body.castShadow=true; g.add(body); g.userData.body=body;
    const head=new THREE.Mesh(new THREE.SphereGeometry(r*0.72,18,14),m); head.position.set(0,r*2.05,r*0.2); head.castShadow=true; g.add(head);
    const face=new THREE.Mesh(new THREE.SphereGeometry(r*0.42,12,10),this.mat(0xe6c79a)); face.position.set(0,r*1.92,r*0.55); g.add(face);
    for(const sx of [-1,1]){ const ear=new THREE.Mesh(new THREE.SphereGeometry(r*0.3,8,6),m); ear.position.set(sx*r*0.72,r*2.25,r*0.1); g.add(ear);
      const eye=new THREE.Mesh(new THREE.SphereGeometry(r*0.1,6,6),this.mat(0x201008)); eye.position.set(sx*r*0.2,r*2.0,r*0.92); g.add(eye); }
    const armL=new THREE.Mesh(new THREE.CylinderGeometry(r*0.22,r*0.2,r*1.2,6),m); armL.position.set(-r*0.95,r*1.1,0.1); armL.rotation.z=0.5; g.add(armL);
    const armR=armL.clone(); armR.position.x=r*0.95; armR.rotation.z=-0.5; g.add(armR);
    const tail=new THREE.Mesh(new THREE.TorusGeometry(r*0.7,r*0.12,6,12,Math.PI*1.4),dk); tail.position.set(0,r*0.9,-r); tail.rotation.x=1.4; g.add(tail);
    if(def.boss){ const crown=new THREE.Mesh(new THREE.CylinderGeometry(r*0.55,r*0.7,r*0.5,6),this.mat(0xb0b6bd,{m:0.3})); crown.position.set(0,r*2.7,r*0.2); g.add(crown);
      const cape=new THREE.Mesh(new THREE.BoxGeometry(r*1.8,r*1.6,0.2),this.mat(0x7a2e2e)); cape.position.set(0,r*1.3,-r*0.9); g.add(cape); }
    const net=new THREE.Mesh(new THREE.SphereGeometry(r*1.5,10,8),new THREE.MeshBasicMaterial({color:0xffffff,wireframe:true,transparent:true,opacity:0.85})); net.position.y=r*1.1; net.visible=false; g.add(net); g.userData.net=net;
    const ban=new THREE.Mesh(new THREE.CylinderGeometry(0.25,0.25,1.1,6),this.mat(0xffcf33)); ban.position.set(0,r*2.2,r*0.6); ban.rotation.x=0.6; ban.visible=false; g.add(ban); g.userData.ban=ban;
    g.userData.r=r; return g; }

  /* ---------- towers / farm ---------- */
  makeTower(type,lv){ const g=new THREE.Group(), col=ACCENT[CONFIG.build[type].accent]; let topY=6.2;
    if(type==='net'){ const ph=4+lv*0.6; const post=new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.65+lv*0.05,ph,8),this.mat(0xb8bdc4,{m:0.2})); post.position.y=ph/2; post.castShadow=true; g.add(post);
      // bracing struts appear from lv3 (sturdier rig)
      if(lv>=3) for(const sgn of [-1,1]){ const strut=new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.12,ph*0.9,5),this.mat(0x9aa0a8,{flat:true})); strut.position.set(sgn*0.9,ph*0.42,0); strut.rotation.z=sgn*0.22; g.add(strut); }
      const hw=2.4+lv*0.45; const head=new THREE.Mesh(new THREE.BoxGeometry(hw,1.6+lv*0.12,hw),this.mat(col,{e:0.2+lv*0.06})); head.position.y=ph+0.4; head.castShadow=true; g.add(head);
      // one launcher barrel per level, fanned around the front
      for(let i=0;i<lv;i++){ const a=(i-(lv-1)/2)*0.42; const barrel=new THREE.Mesh(new THREE.CylinderGeometry(0.28,0.3,2.2+lv*0.15,8),this.mat(0x2b8fc4,{e:0.25})); barrel.rotation.x=Math.PI/2; barrel.rotation.y=a; barrel.position.set(Math.sin(a)*1.0,ph+0.4,1.3+Math.cos(a)*0.4); g.add(barrel); }
      topY=ph+1.6; }
    else if(type==='decoy'){ const rad=2.8+lv*0.6; const dirt=new THREE.Mesh(new THREE.CircleGeometry(rad,22),this.mat(0xffffff,{map:this.dirtTex})); dirt.rotation.x=-Math.PI/2; dirt.position.y=0.06; g.add(dirt);
      const n=7+lv*5; for(let i=0;i<n;i++){ const a=i*2.39, ring=0.7+(i/n)*(rad*0.5); const b=new THREE.Mesh(new THREE.CylinderGeometry(0.28,0.28,1.1,6),this.mat(0xf2c233)); b.position.set(Math.cos(a)*ring,0.7+(i%(2+lv))*0.5,Math.sin(a)*ring); b.rotation.z=1.0; b.rotation.y=a; b.castShadow=true; g.add(b); }
      // a gleaming crown banana grows with level
      const crown=new THREE.Mesh(new THREE.SphereGeometry(0.3+lv*0.18,10,8),this.mat(0xffe06a,{e:0.45})); crown.position.y=1.1+lv*0.5; g.add(crown); topY=crown.position.y+1.2; }
    else if(type==='cage'){ const sz=3.0+lv*0.55; const base=new THREE.Mesh(new THREE.BoxGeometry(sz+1,0.5,sz+1),this.mat(0x8a8f96)); base.position.y=0.25; g.add(base);
      // corner posts thicken + a roof pyramid lands from lv3 (heavier trap)
      for(const [cx,cz] of [[-1,-1],[1,-1],[-1,1],[1,1]]){ const post=new THREE.Mesh(new THREE.CylinderGeometry(0.12+lv*0.03,0.12+lv*0.03,sz,6),this.mat(0x6f757c,{flat:true})); post.position.set(cx*sz/2,sz/2+0.3,cz*sz/2); g.add(post); }
      const cage=new THREE.Mesh(new THREE.BoxGeometry(sz,sz,sz),new THREE.MeshBasicMaterial({color:col,wireframe:true,transparent:true,opacity:0.55+lv*0.06})); cage.position.y=sz/2+0.3; g.add(cage);
      if(lv>=3){ const roof=new THREE.Mesh(new THREE.ConeGeometry(sz*0.8,1.2+lv*0.2,4),this.mat(col,{e:0.3,flat:true})); roof.rotation.y=Math.PI/4; roof.position.y=sz+0.5; g.add(roof); }
      topY=sz+1.2; }
    else if(type==='mud'){ const r=CONFIG.build.mud.stat(lv).r; const patch=new THREE.Mesh(new THREE.CircleGeometry(r,24),this.mat(0x6e4a24,{r:1})); patch.rotation.x=-Math.PI/2; patch.position.y=0.07; g.add(patch);
      const inner=new THREE.Mesh(new THREE.CircleGeometry(r*0.62,20),this.mat(0x4f3417,{r:1})); inner.rotation.x=-Math.PI/2; inner.position.y=0.09; g.add(inner);
      // bubbling pits multiply with level
      for(let i=0;i<lv*4;i++){ const a=i*2.39, rr=(i/(lv*4))*r*0.8; const bub=new THREE.Mesh(new THREE.SphereGeometry(0.22+ (i%3)*0.06,7,5),this.mat(0x3c2710,{flat:true})); bub.position.set(Math.cos(a)*rr,0.18,Math.sin(a)*rr); bub.scale.y=0.6; g.add(bub); }
      topY=1.4; }
    else if(type==='farm'){ const plotM=new THREE.Mesh(new THREE.BoxGeometry(5,0.4,5),this.mat(0xffffff,{map:this.dirtTex})); plotM.position.y=0.2; g.add(plotM);
      // crop grid gets denser each level (more rows of taller stalks)
      const n=Math.min(5,2+lv), step=3.4/(n-1||1); for(let r0=0;r0<n;r0++) for(let c0=0;c0<n;c0++){ const h=1.4+lv*0.18; const stalk=new THREE.Mesh(new THREE.CylinderGeometry(0.11,0.11,h,5),this.mat(0x4f9e36)); stalk.position.set(-1.7+c0*step,h/2+0.4,-1.7+r0*step); g.add(stalk);
        const nub=new THREE.Mesh(new THREE.SphereGeometry(0.34,8,6),this.mat(0xffcf33)); nub.position.set(-1.7+c0*step,h+0.4,-1.7+r0*step); g.add(nub); }
      // silos: one more per two levels, growing taller
      const silos=Math.ceil(lv/2), sh=2.6+lv*0.4; for(let s=0;s<silos;s++){ const silo=new THREE.Mesh(new THREE.CylinderGeometry(1.0,1.0,sh,12),this.mat(0xddae5a)); silo.position.set(2.6, sh/2+0.4, 2.6 - s*2.3); silo.castShadow=true; g.add(silo);
        const roof=new THREE.Mesh(new THREE.ConeGeometry(1.15,1.0,12),this.mat(0xb98842,{flat:true})); roof.position.set(2.6, sh+0.9, 2.6 - s*2.3); g.add(roof); }
      const warn=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glowTex,color:0xff5a4a,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false})); warn.scale.set(3.2,3.2,1); warn.position.y=6.4; warn.visible=false; g.add(warn); g.userData.warn=warn; topY=sh+1.4; }
    else if(type==='supply'){ const ph=this.WIRE_H+0.6; const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.13,0.17,ph,7),this.mat(0xffffff,{flat:true,r:0.85,map:this.woodTex})); pole.position.y=ph/2; pole.castShadow=true; g.add(pole);
      const arm=new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.09,0.95,5),this.mat(0x6f4a28,{flat:true})); arm.rotation.z=Math.PI/2; arm.position.y=this.WIRE_H+0.2; g.add(arm);
      const cap=new THREE.Mesh(new THREE.SphereGeometry(0.22,8,6),this.mat(0xc8a25a)); cap.position.y=ph; g.add(cap); topY=ph+0.4; }
    else if(type==='trainee'){ const cnt=Math.max(1,lv); // a tent per recruited keeper, clustered
      for(let i=0;i<cnt;i++){ const a=i*2.39, rr=cnt>1?1.2:0; const tent=new THREE.Mesh(new THREE.ConeGeometry(1.5,2.4,4),this.mat(0x6ea83a,{flat:true})); tent.rotation.y=Math.PI/4; tent.position.set(Math.cos(a)*rr,1.2,Math.sin(a)*rr); tent.castShadow=true; g.add(tent); }
      const mast=new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.08,3.2+lv*0.3,5),this.mat(0x7a5230,{flat:true})); mast.position.y=(3.2+lv*0.3)/2; g.add(mast);
      const flag=new THREE.Mesh(new THREE.BoxGeometry(0.1,0.7,1.0+lv*0.18),this.mat(0x8ed24a,{e:0.2})); flag.position.set(0,3.0+lv*0.3,0.5+lv*0.09); g.add(flag); topY=3.4+lv*0.3; }
    // universal rank: a stack of gold pips = level, so every upgrade reads at a glance (skip un-upgradeable builds like supply poles)
    if(CONFIG.build[type].max>1) for(let i=0;i<lv;i++){ const pip=new THREE.Mesh(new THREE.SphereGeometry(0.26,8,6),this.mat(ACCENT.gold,{e:0.4})); pip.position.set(0, topY+0.2+i*0.5, 0); g.add(pip); }
    return g; }

  makeTruck(){ const g=new THREE.Group();
    const bed=new THREE.Mesh(new THREE.BoxGeometry(6,3.4,10),this.mat(0x3a9a55,{e:0.05})); bed.position.set(0,3.0,-1); bed.castShadow=true; g.add(bed);
    const cab=new THREE.Mesh(new THREE.BoxGeometry(5.6,3.2,4),this.mat(0x2f7a42)); cab.position.set(0,2.9,5); cab.castShadow=true; g.add(cab);
    const wind=new THREE.Mesh(new THREE.BoxGeometry(5.0,1.6,0.3),this.mat(0xbfe6ff,{e:0.1})); wind.position.set(0,3.4,6.9); g.add(wind);
    const bars=new THREE.Mesh(new THREE.BoxGeometry(6.2,3.6,10.2),new THREE.MeshBasicMaterial({color:0xddeecc,wireframe:true})); bars.position.copy(bed.position); g.add(bars);
    for(const [sx,sz] of [[-1,-1],[1,-1],[-1,1],[1,1]]){ const w=new THREE.Mesh(new THREE.CylinderGeometry(1.4,1.4,1.0,12),this.mat(0x222222)); w.rotation.z=Math.PI/2; w.position.set(sx*3.2,1.4,sz*4); g.add(w); }
    return g; }

  /* ---------- per-frame sync ---------- */
  syncHero(h,t){ const bob=h.moving?Math.abs(Math.sin(t*11))*0.45:0; this.hero.position.set(h.x,bob,h.y); if(h.aim!=null) this.hero.rotation.y=-h.aim+Math.PI/2;
    const sw=h.moving?Math.sin(t*11)*0.5:0; if(this.hero.userData.legL){ this.hero.userData.legL.rotation.x=sw; this.hero.userData.legR.rotation.x=-sw; } }
  syncMonkeys(list){ for(const m of list){ if(!m.mesh){ m.mesh=this.makeMonkey(m.type); this.monkeyGroup.add(m.mesh); }
    const bob=m.state==='trapped'?0:Math.abs(Math.sin(m.wob||0))*0.5; m.mesh.position.set(m.x,bob,m.y); m.mesh.rotation.y=-(m.face||0)+Math.PI/2;
    m.mesh.userData.net.visible=m.state==='trapped'; m.mesh.userData.ban.visible=!!m.carrying; if(m.state==='trapped') m.mesh.rotation.z=Math.sin(m.struggle||0)*0.15; } }
  removeMonkeyMesh(m){ if(m.mesh){ this.monkeyGroup.remove(m.mesh); this.disposeGroup(m.mesh); m.mesh=null; } }
  syncTrainees(list,t){ const have=new Set();
    for(const k of list){ if(!k.mesh){ k.mesh=this.makeKeeper(); this.trainGroup.add(k.mesh); } have.add(k.mesh);
      const bob=k.moving?Math.abs(Math.sin(k.wob))*0.3:0; k.mesh.position.set(k.x,bob,k.y); k.mesh.rotation.y=-(k.aim||0)+Math.PI/2; }
    for(let i=this.trainGroup.children.length-1;i>=0;i--){ const m=this.trainGroup.children[i]; if(!have.has(m)){ this.trainGroup.remove(m); this.disposeGroup(m); } } }
  syncNets(list){ while(this.netGroup.children.length<list.length){ const n=new THREE.Mesh(new THREE.TorusGeometry(0.8,0.18,6,10),new THREE.MeshBasicMaterial({color:0xffffff})); this.netGroup.add(n); }
    for(let i=0;i<this.netGroup.children.length;i++){ const c=this.netGroup.children[i]; if(i<list.length){ c.visible=true; c.position.set(list[i].x,2.2,list[i].y); c.rotation.x=Math.PI/2; c.rotation.z=(list[i].spin=(list[i].spin||0)+0.3); } else c.visible=false; } }
  setTruck(v,x,y,ang){ this.truck.visible=v; if(v){ this.truck.position.set(x,0,y); this.truck.rotation.y=ang||0; } }

  /* ---------- camera ---------- */
  followCam(h,dt){ const k=Math.min(1,dt*4.2);
    this._terrPulse=(this._terrPulse||0)+dt; if(this.terrMesh) this.terrMesh.material.opacity=0.58+Math.sin(this._terrPulse*1.2)*0.06;
    this.updateMotes(h,this._terrPulse); this.updateClaws(dt);
    this.camLook.x=U.lerp(this.camLook.x,h.x,k); this.camLook.z=U.lerp(this.camLook.z,h.y,k);
    const tx=h.x+this.camOff.x, ty=this.camOff.y, tz=h.y+this.camOff.z;
    this.camera.position.x=U.lerp(this.camera.position.x,tx,k); this.camera.position.y=U.lerp(this.camera.position.y,ty,k); this.camera.position.z=U.lerp(this.camera.position.z,tz,k);
    this.camera.lookAt(this.camLook.x,0,this.camLook.z);
    this.sun.position.set(h.x+40,86,h.y+30); this.sun.target.position.set(h.x,0,h.y); this.sun.target.updateMatrixWorld();
  }

  /* ---------- fx ---------- */
  burst(x,y,col){ for(let i=0;i<8;i++){ const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glowTex,color:col||0xffce5e,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false})); sp.position.set(x,2,y); sp.scale.set(2,2,1); this.fxGroup.add(sp); this.fx.push({s:sp,vx:U.rand(-7,7),vy:U.rand(7,13),vz:U.rand(-7,7),life:0.5,max:0.5}); } }
  coinPop(x,y){ const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glowTex,color:0xffce5e,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false})); sp.position.set(x,2,y); sp.scale.set(2.6,2.6,1); this.fxGroup.add(sp); this.fx.push({s:sp,vx:0,vy:15,vz:0,life:0.5,max:0.5}); }
  updateFx(dt){ for(let i=this.fx.length-1;i>=0;i--){ const f=this.fx[i]; f.life-=dt; const a=U.clamp(f.life/f.max,0,1); f.s.position.x+=f.vx*dt; f.s.position.y+=f.vy*dt; f.s.position.z+=f.vz*dt; f.s.material.opacity=a; if(f.life<=0){ this.fxGroup.remove(f.s); if(f.s.material) f.s.material.dispose(); this.fx.splice(i,1); } } }

  screenToWorld(sx,sy){ const ndc=(this._ndc||(this._ndc=new THREE.Vector2())).set((sx/this.W)*2-1,-(sy/this.H)*2+1); const ray=this._ray||(this._ray=new THREE.Raycaster()); ray.setFromCamera(ndc,this.camera);   // reuse instances — this runs on every mousemove, no need to allocate
    const t=-ray.ray.origin.y/ray.ray.direction.y; return {x:ray.ray.origin.x+ray.ray.direction.x*t, y:ray.ray.origin.z+ray.ray.direction.z*t}; }
  resize(){ const w=window.innerWidth,h=window.innerHeight; this.W=w; this.H=h; this.renderer.setSize(w,h,false); this.camera.aspect=w/h; this.camera.updateProjectionMatrix(); }
  draw(){ this.renderer.render(this.scene,this.camera); }
}
