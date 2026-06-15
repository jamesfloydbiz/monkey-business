/* ============================================================
   FLOW — render.js  (Three.js r128)
   Steep operator's-eye 3D view. The 2D density grid is painted
   onto the ground as a glowing texture; the crowd is one additive
   point cloud of gold light. Black-and-gold, calm.
   ============================================================ */
'use strict';

class Renderer{
  constructor(canvas, grid, sim, level){
    this.grid=grid; this.sim=sim; this.level=level;
    const r=this.renderer=new THREE.WebGLRenderer({canvas, antialias:true});
    r.setPixelRatio(Math.min(2,window.devicePixelRatio||1));
    r.outputEncoding=THREE.sRGBEncoding; r.toneMapping=THREE.ACESFilmicToneMapping; r.toneMappingExposure=1.0;
    const scene=this.scene=new THREE.Scene();
    scene.background=new THREE.Color(0x07060a);
    scene.fog=new THREE.Fog(0x07060a, 120, 230);

    this.camera=new THREE.PerspectiveCamera(46,1,1,1000);
    this.camera.position.set(0,58,30); this.camera.lookAt(0,-1,1);

    scene.add(new THREE.HemisphereLight(0x33304a,0x05040a,0.5));
    const key=new THREE.DirectionalLight(0xfff0c8,0.5); key.position.set(20,60,30); scene.add(key);

    // ground plane carrying the heatmap (DataTexture from grid.img)
    this.tex=new THREE.DataTexture(grid.img, grid.cols, grid.rows, THREE.RGBAFormat);
    this.tex.magFilter=THREE.LinearFilter; this.tex.minFilter=THREE.LinearFilter; this.tex.needsUpdate=true;
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(CONFIG.worldW, CONFIG.worldH),
      new THREE.MeshBasicMaterial({map:this.tex}));
    floor.rotation.x=-Math.PI/2; scene.add(floor); this.floor=floor;
    // faint base so empty floor isn't pure black
    const base=new THREE.Mesh(new THREE.PlaneGeometry(CONFIG.worldW, CONFIG.worldH),
      new THREE.MeshBasicMaterial({color:0x0d0b12})); base.rotation.x=-Math.PI/2; base.position.y=-0.05; scene.add(base);

    // static geometry (walls + goal) lives in a group we can rebuild per event
    this.staticGroup=new THREE.Group(); scene.add(this.staticGroup);
    this.buildStatic(level);

    // crowd: little gold figures (billboarded), plus a soft additive under-glow for the "light" feel
    this.personTex=this.makePerson(); this.glowTex=this.makeGlow();
    this.pos=new Float32Array(MAXA*3);
    const geo=new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(this.pos,3)); geo.setDrawRange(0,0);
    const glowGeo=new THREE.BufferGeometry(); glowGeo.setAttribute('position', new THREE.BufferAttribute(this.pos,3)); glowGeo.setDrawRange(0,0);
    this.glowLayer=new THREE.Points(glowGeo, new THREE.PointsMaterial({size:3.6, map:this.glowTex, color:0xffcf72, transparent:true, opacity:0.3, blending:THREE.AdditiveBlending, depthWrite:false, sizeAttenuation:true}));
    this.points=new THREE.Points(geo, new THREE.PointsMaterial({size:3.0, map:this.personTex, color:0xffe6b0, transparent:true, alphaTest:0.4, depthWrite:false, sizeAttenuation:true}));
    scene.add(this.glowLayer, this.points);

    this.toolGroup=new THREE.Group(); scene.add(this.toolGroup);
    this.ghost=null;
    this.resize();
  }
  makeGlow(){ const c=document.createElement('canvas'); c.width=c.height=64; const x=c.getContext('2d');
    const g=x.createRadialGradient(32,32,0,32,32,32); g.addColorStop(0,'rgba(255,255,255,1)'); g.addColorStop(0.4,'rgba(255,225,150,0.6)'); g.addColorStop(1,'rgba(255,200,90,0)');
    x.fillStyle=g; x.fillRect(0,0,64,64); return new THREE.CanvasTexture(c); }
  makePerson(){ const c=document.createElement('canvas'); c.width=c.height=64; const x=c.getContext('2d');
    x.fillStyle='#fff';
    x.beginPath(); x.arc(32,18,10,0,Math.PI*2); x.fill();                                  // head
    x.beginPath(); x.moveTo(19,42); x.quadraticCurveTo(32,30,45,42); x.lineTo(45,57); x.quadraticCurveTo(32,62,19,57); x.closePath(); x.fill(); // body
    return new THREE.CanvasTexture(c); }

  buildStatic(level){ const grp=this.staticGroup; while(grp.children.length) grp.remove(grp.children[0]);
    const wallMat=new THREE.MeshStandardMaterial({color:0x17141f, roughness:0.9});
    for(const w of level.walls){ const m=new THREE.Mesh(new THREE.BoxGeometry(w.w,2.2,w.h), wallMat); m.position.set(w.x,1.0,w.y); grp.add(m); }
    const goalGlow=new THREE.Mesh(new THREE.RingGeometry(2.2,3.0,32), new THREE.MeshBasicMaterial({color:0x8fe0c0,transparent:true,opacity:0.4,side:THREE.DoubleSide}));
    goalGlow.rotation.x=-Math.PI/2; goalGlow.position.set(level.goal.x,0.12,level.goal.y); grp.add(goalGlow); }
  // rebind to a freshly-built grid/sim/level (new event geometry)
  bind(grid,sim,level){ this.grid=grid; this.sim=sim; this.level=level;
    this.tex=new THREE.DataTexture(grid.img, grid.cols, grid.rows, THREE.RGBAFormat); this.tex.magFilter=THREE.LinearFilter; this.tex.minFilter=THREE.LinearFilter; this.tex.needsUpdate=true;
    this.floor.material.map=this.tex; this.floor.material.needsUpdate=true;
    this.buildStatic(level); this.refreshTools(); }

  syncCrowd(){ const s=this.sim, p=this.pos; for(let i=0;i<s.n;i++){ p[i*3]=s.px[i]; p[i*3+1]=1.1; p[i*3+2]=s.py[i]; }
    this.points.geometry.setDrawRange(0,s.n); this.points.geometry.attributes.position.needsUpdate=true;
    this.glowLayer.geometry.setDrawRange(0,s.n); this.glowLayer.geometry.attributes.position.needsUpdate=true; }
  syncHeat(){ this.grid.colorize(); this.tex.needsUpdate=true; }

  refreshTools(){ const grp=this.toolGroup; while(grp.children.length) grp.remove(grp.children[0]);
    // barriers (rendered from their endpoints)
    for(const b of this.grid.barriers||[]){ const mx=(b.x0+b.x1)/2, my=(b.y0+b.y1)/2, len=Math.hypot(b.x1-b.x0,b.y1-b.y0)+1.8, ang=Math.atan2(b.y1-b.y0,b.x1-b.x0);
      const m=new THREE.Mesh(new THREE.BoxGeometry(len,1.8,1.6), new THREE.MeshStandardMaterial({color:0xd8a23a,emissive:0x6a4612,emissiveIntensity:0.5,roughness:0.5}));
      m.position.set(mx,0.9,my); m.rotation.y=-ang; m.castShadow=true; grp.add(m); }
    // gates (bar across the flow + glow)
    for(const o of this.sim.gates){ const tx=-o.ny, ty=o.nx; const len=o.hw*2;
      const bar=new THREE.Mesh(new THREE.BoxGeometry(len,2.0,0.6), new THREE.MeshStandardMaterial({color:0xffd072,emissive:0x6a4a10,roughness:0.4}));
      bar.position.set(o.x,1.0,o.y); bar.rotation.y=Math.atan2(tx,ty); grp.add(bar);
      const gl=new THREE.Mesh(new THREE.CircleGeometry(len*0.6,20), new THREE.MeshBasicMaterial({color:0xffd072,transparent:true,opacity:0.18})); gl.rotation.x=-Math.PI/2; gl.position.set(o.x,0.07,o.y); grp.add(gl); }
    // PA zones (cool=calm, warm=hurry)
    for(const z of this.sim.paZones){ const col=z.factor<1?0x6fd0ff:0xff6a5a;
      const ring=new THREE.Mesh(new THREE.RingGeometry(z.r-1.2,z.r,40), new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0.5,side:THREE.DoubleSide})); ring.rotation.x=-Math.PI/2; ring.position.set(z.x,0.08,z.y); grp.add(ring);
      const fill=new THREE.Mesh(new THREE.CircleGeometry(z.r,40), new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0.06})); fill.rotation.x=-Math.PI/2; fill.position.set(z.x,0.07,z.y); grp.add(fill); }
  }
  setGhost(kind,x,y,ok){ if(this.ghost){ this.scene.remove(this.ghost); this.ghost=null; } if(!kind) return;
    const col=ok?0xffe6a8:0xff5a5a; let m;
    if(kind==='pa'){ m=new THREE.Mesh(new THREE.CircleGeometry(CONFIG.tools.pa.radius,32), new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0.2,side:THREE.DoubleSide})); m.rotation.x=-Math.PI/2; }
    else if(kind==='gate'){ m=new THREE.Mesh(new THREE.BoxGeometry(CONFIG.tools.gate.width,2,0.6), new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0.5})); const [dx,dy]=this.grid.dirAt(x,y); m.rotation.y=Math.atan2(-dy,dx); }
    else { m=new THREE.Mesh(new THREE.BoxGeometry(2,1.6,2), new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0.5})); }
    m.position.set(x,1.0,y); this.scene.add(m); this.ghost=m; }

  // screen px -> world ground (raycast onto y=0 plane)
  screenToWorld(sx,sy){ const ndc=new THREE.Vector2((sx/this.W)*2-1, -(sy/this.H)*2+1);
    const ray=new THREE.Raycaster(); ray.setFromCamera(ndc,this.camera);
    const t=-ray.ray.origin.y/ray.ray.direction.y; return {x:ray.ray.origin.x+ray.ray.direction.x*t, y:ray.ray.origin.z+ray.ray.direction.z*t}; }
  worldToScreen(x,y){ const v=new THREE.Vector3(x,1,y).project(this.camera); return {x:(v.x*0.5+0.5)*this.W, y:(-v.y*0.5+0.5)*this.H, vis:v.z<1}; }

  resize(){ const w=window.innerWidth,h=window.innerHeight; this.W=w; this.H=h; this.renderer.setSize(w,h,false); this.camera.aspect=w/h; this.camera.updateProjectionMatrix(); }
  draw(){ this.renderer.render(this.scene,this.camera); }
}
