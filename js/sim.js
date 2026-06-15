/* ============================================================
   FLOW — sim.js
   Pedestrians (social-force-lite) + openings that enforce the
   fundamental diagram (throughput) and faster-is-slower (clog).
   Agents are plain SoA arrays. Coordinates: world meters.
   ============================================================ */
'use strict';

const MAXA = 1700;

class Sim{
  constructor(grid, level){
    this.grid=grid; this.level=level;
    this.px=new Float32Array(MAXA); this.py=new Float32Array(MAXA);
    this.vx=new Float32Array(MAXA); this.vy=new Float32Array(MAXA);
    this.urg=new Float32Array(MAXA);
    this.n=0; this.cleared=0;

    // pinches are the throughput-limited openings (fd-enforced, do NOT remove);
    // agents are removed when they reach the goal plaza past them.
    this.pinches=level.pinches.map(p=>({kind:'pinch', x:p.x, y:p.y, nx:0, ny:1, hw:p.w/2, rate:Infinity, budget:0, passing:0, held:0}));
    this.goal=level.goal; this.goalR=level.goalR||3;
    this.gates=[];      // {kind:'gate', x,y,nx,ny,hw,rate,budget,passing,held}
    this.paZones=[];    // {x,y,r,factor}

    // spatial hash
    this.hc=CONFIG.rNeighbor; this.hcols=Math.ceil(CONFIG.worldW/this.hc)+2; this.hrows=Math.ceil(CONFIG.worldH/this.hc)+2;
    this.bucket=Array.from({length:this.hcols*this.hrows},()=>[]);
  }

  add(x,y){ if(this.n>=MAXA) return; const i=this.n++; this.px[i]=x; this.py[i]=y; this.vx[i]=0; this.vy[i]=0; this.urg[i]=1; }
  remove(i){ const last=--this.n; this.px[i]=this.px[last]; this.py[i]=this.py[last]; this.vx[i]=this.vx[last]; this.vy[i]=this.vy[last]; this.urg[i]=this.urg[last]; }

  hkey(x,y){ const gi=Math.floor((x+CONFIG.worldW/2)/this.hc)+1, gj=Math.floor((y+CONFIG.worldH/2)/this.hc)+1; return gj*this.hcols+gi; }
  rehash(){ for(const b of this.bucket) b.length=0; for(let i=0;i<this.n;i++){ const k=this.hkey(this.px[i],this.py[i]); if(this.bucket[k]) this.bucket[k].push(i); } }

  step(dt){
    const C=CONFIG, g=this.grid;
    // 1) per-agent urgency from PA zones
    for(let i=0;i<this.n;i++){ let f=C.urgencyBase;
      for(const z of this.paZones){ if(U.dist2(this.px[i],this.py[i],z.x,z.y) < z.r*z.r){ f*=z.factor; } }
      this.urg[i]=f; }

    this.rehash();

    // 2) density field
    g.clearDensity();
    for(let i=0;i<this.n;i++) g.splat(this.px[i],this.py[i],this.vx[i],this.vy[i]);
    g.blur();

    // 3) movement
    for(let i=0;i<this.n;i++){
      const x=this.px[i], y=this.py[i];
      const d=g.densAt(x,y);
      const [dx,dy]=g.dirAt(x,y);
      const vmax=C.v0*this.urg[i]*C.speedFactor(d);
      let ax=(dx*vmax - this.vx[i])/C.tau, ay=(dy*vmax - this.vy[i])/C.tau;
      // neighbour repulsion (spatial hash, 3x3 buckets)
      const gi=Math.floor((x+C.worldW/2)/this.hc)+1, gj=Math.floor((y+C.worldH/2)/this.hc)+1;
      for(let bj=gj-1;bj<=gj+1;bj++)for(let bi=gi-1;bi<=gi+1;bi++){ const b=this.bucket[bj*this.hcols+bi]; if(!b) continue;
        for(const j of b){ if(j===i) continue; const ddx=x-this.px[j], ddy=y-this.py[j]; const r2=ddx*ddx+ddy*ddy;
          if(r2<C.rNeighbor*C.rNeighbor && r2>1e-6){ const r=Math.sqrt(r2); const f=C.kRep*(1-r/C.rNeighbor)/r; ax+=ddx*f; ay+=ddy*f; } } }
      // wall repulsion: push away from non-walkable neighbour cells
      if(!g.walkableAt(x+0.6,y)) ax-=C.kWall; if(!g.walkableAt(x-0.6,y)) ax+=C.kWall;
      if(!g.walkableAt(x,y+0.6)) ay-=C.kWall; if(!g.walkableAt(x,y-0.6)) ay+=C.kWall;

      let nvx=this.vx[i]+ax*dt, nvy=this.vy[i]+ay*dt;
      // cap to local max speed
      const sp=Math.hypot(nvx,nvy), cap=Math.max(0.05,vmax*1.15);
      if(sp>cap){ nvx=nvx/sp*cap; nvy=nvy/sp*cap; }
      let nx=x+nvx*dt, ny=y+nvy*dt;
      // wall collision: slide
      if(!g.walkableAt(nx,ny)){
        if(g.walkableAt(nx,y)){ ny=y; nvy=0; }
        else if(g.walkableAt(x,ny)){ nx=x; nvx=0; }
        else { nx=x; ny=y; nvx*=0.3; nvy*=0.3; }
      }
      this.px[i]=nx; this.py[i]=ny; this.vx[i]=nvx; this.vy[i]=nvy;
    }

    // 4) openings — throughput + clog, post-integration gating
    const openings=this.pinches.concat(this.gates);
    const removeList=[];
    for(const o of openings){
      const tx=-o.ny, ty=o.nx; // tangent
      let uSum=0,uN=0; const band=[];
      for(let i=0;i<this.n;i++){ const ddx=this.px[i]-o.x, ddy=this.py[i]-o.y;
        const along=ddx*o.nx+ddy*o.ny, lat=ddx*tx+ddy*ty;
        if(Math.abs(lat)<o.hw){ if(along>-3 && along<0.05){ uSum+=this.urg[i]; uN++; }
          if(along>-0.12 && along<0.5) band.push([i,along]); } }
      const mean=uN?uSum/uN:1;
      const dUp=g.densAt(o.x-o.nx*1.2, o.y-o.ny*1.2);
      // faster-is-slower: impatience (urgency>1) clogs the opening, scaled by how dense it is
      const densFrac=U.clamp((dUp-C.dSafe)/(C.dJam-C.dSafe),0,1);
      const clog=C.clogK*Math.max(0,mean-1)*densFrac;
      const effW=Math.max(C.widthMin, 2*o.hw*(1-clog));
      let cap=effW*C.Js*C.fdGate(dUp); if(o.kind==='gate') cap=Math.min(cap,o.rate);
      o.passing=cap; o.held=uN;
      o.budget=(o.budget||0)+cap*dt;
      band.sort((a,b)=>b[1]-a[1]); // closest to plane first
      for(const [i,along] of band){
        if(o.budget>=1){ o.budget-=1; this.px[i]+=o.nx*0.55; this.py[i]+=o.ny*0.55; }
        else if(along>=0){ // not granted but already across → shove back upstream, queue
          this.px[i]-=o.nx*(along+0.06); this.py[i]-=o.ny*(along+0.06);
          const vn=this.vx[i]*o.nx+this.vy[i]*o.ny; if(vn>0){ this.vx[i]-=vn*o.nx; this.vy[i]-=vn*o.ny; } }
      }
    }
    // 5) removal at the goal plaza
    const gr2=this.goalR*this.goalR;
    for(let i=0;i<this.n;i++){ if(U.dist2(this.px[i],this.py[i],this.goal.x,this.goal.y)<gr2) removeList.push(i); }
    if(removeList.length){ removeList.sort((a,b)=>b-a); let prev=-1; for(const i of removeList){ if(i===prev) continue; prev=i; this.remove(i); this.cleared++; } }
  }

  // place a gate at (x,y) oriented to the local flow
  addGate(x,y,width){ const [dx,dy]=this.grid.dirAt(x,y); const m=Math.hypot(dx,dy)||1;
    this.gates.push({kind:'gate', x, y, nx:dx/m, ny:dy/m, hw:width/2, rate:CONFIG.tools.gate.rate, budget:0, passing:0, held:0}); return this.gates[this.gates.length-1]; }
}
