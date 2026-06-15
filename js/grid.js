/* ============================================================
   FLOW — grid.js
   The density field + walls + goal routing field + heatmap.
   Coordinates: world meters, centre origin. Cell (i,j) centre =
   (i+0.5 - W/2, j+0.5 - H/2). 1m cells → dens ≈ persons/m².
   ============================================================ */
'use strict';

class Grid{
  constructor(level){
    const C=CONFIG;
    this.cols=Math.round(C.worldW/C.cell);
    this.rows=Math.round(C.worldH/C.cell);
    const n=this.cols*this.rows;
    this.walk=new Uint8Array(n).fill(1);
    this.dens=new Float32Array(n);
    this.densB=new Float32Array(n);   // blur scratch
    this.vx=new Float32Array(n);
    this.vy=new Float32Array(n);
    this.dwell=new Float32Array(n);
    this.cost=new Float32Array(n).fill(1e6);
    this.img=new Uint8ClampedArray(n*4);
    this.barriers=[];          // player-drawn rails (for rendering)
    this.worstDwell=0; this.worstDens=0;
    this.dirty=true;
    this.buildWalls(level);
    this.goal=level.goal;
    this.reflood();
  }
  idx(i,j){ return j*this.cols+i; }
  inB(i,j){ return i>=0&&j>=0&&i<this.cols&&j<this.rows; }
  // world -> cell indices
  ci(x){ return Math.floor(x + CONFIG.worldW/2); }
  cj(y){ return Math.floor(y + CONFIG.worldH/2); }
  cx(i){ return i+0.5 - CONFIG.worldW/2; }
  cy(j){ return j+0.5 - CONFIG.worldH/2; }

  buildWalls(level){
    const C=CONFIG;
    const stamp=(rx,ry,rw,rh,val)=>{
      const i0=this.ci(rx-rw/2), i1=this.ci(rx+rw/2), j0=this.cj(ry-rh/2), j1=this.cj(ry+rh/2);
      for(let j=j0;j<=j1;j++) for(let i=i0;i<=i1;i++) if(this.inB(i,j)) this.walk[this.idx(i,j)]=val;
    };
    for(const w of level.walls) stamp(w.x,w.y,w.w,w.h,0);
    // punch each pinch gap back open (walkable)
    for(const p of (level.pinches||[])) stamp(p.x, p.y, p.w, 2.4, 1);
    this.level=level;
  }
  // dynamic barriers from tools: set a run of cells non-walkable
  setWall(x,y,w,h){ const i0=this.ci(x-w/2),i1=this.ci(x+w/2),j0=this.cj(y-h/2),j1=this.cj(y+h/2);
    for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++) if(this.inB(i,j)) this.walk[this.idx(i,j)]=0;
    this.dirty=true; }
  // stamp a barrier line (player rail), block cells along it; record for render
  stampSeg(x0,y0,x1,y1){ const len=Math.hypot(x1-x0,y1-y0), steps=Math.max(2,Math.ceil(len*3));
    for(let s=0;s<=steps;s++){ const t=s/steps, x=U.lerp(x0,x1,t), y=U.lerp(y0,y1,t); const i=this.ci(x),j=this.cj(y);
      for(let dj=-1;dj<=1;dj++)for(let di=-1;di<=1;di++){ const ni=i+di,nj=j+dj; if(this.inB(ni,nj)) this.walk[this.idx(ni,nj)]=0; } }   // 3-cell brush — no corner gaps
    this.barriers.push({x0,y0,x1,y1}); this.dirty=true; }
  // snapshot/restore walkability (for validating a barrier doesn't seal the exit)
  snapWalk(){ return this.walk.slice(); }
  restoreWalk(snap){ this.walk.set(snap); this.barriers.pop(); this.dirty=true; }
  goalReachableFromEntry(entry){ const c=this.cost[this.idx(this.ci(entry.x),this.cj(entry.y))]; return c<this.maxCost-1; }

  reflood(){
    // BFS ring-distance from goal cell across walkable cells (8-neighbour)
    this.cost.fill(1e6);
    const gi=this.ci(this.goal.x), gj=this.cj(this.goal.y);
    const q=[]; let head=0;
    const start=(i,j)=>{ if(this.inB(i,j)&&this.walk[this.idx(i,j)]){ this.cost[this.idx(i,j)]=0; q.push(i,j); } };
    // seed a small disc around the goal (goal may sit just outside walls)
    for(let dj=-1;dj<=1;dj++)for(let di=-1;di<=1;di++) start(gi+di,gj+dj);
    const nb=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    let maxd=0;
    while(head<q.length){
      const i=q[head++], j=q[head++]; const c=this.cost[this.idx(i,j)];
      for(const [di,dj] of nb){ const ni=i+di,nj=j+dj; if(!this.inB(ni,nj)) continue; const k=this.idx(ni,nj);
        if(!this.walk[k]) continue; const step=(di&&dj)?1.414:1; const nc=c+step;
        if(nc<this.cost[k]){ this.cost[k]=nc; q.push(ni,nj); if(nc>maxd)maxd=nc; } }
    }
    // unreachable / walls → high finite so gradients stay sane & point inward
    const hi=maxd+40; for(let k=0;k<this.cost.length;k++) if(this.cost[k]>=1e6) this.cost[k]=hi;
    this.dirty=false; this.maxCost=hi;
  }

  // ---- per-frame density ----
  clearDensity(){ this.dens.fill(0); this.vx.fill(0); this.vy.fill(0); }
  splat(x,y,vx,vy){
    const C=CONFIG; const fx=x+C.worldW/2-0.5, fy=y+C.worldH/2-0.5;
    const i=Math.floor(fx), j=Math.floor(fy), tx=fx-i, ty=fy-j;
    const add=(ii,jj,w)=>{ if(!this.inB(ii,jj))return; const k=this.idx(ii,jj); this.dens[k]+=w; this.vx[k]+=vx*w; this.vy[k]+=vy*w; };
    add(i,j,(1-tx)*(1-ty)); add(i+1,j,tx*(1-ty)); add(i,j+1,(1-tx)*ty); add(i+1,j+1,tx*ty);
  }
  blur(){ // 3x3 box on dens for a calm heatmap; flow normalised by dens
    const {cols,rows,dens,densB}=this;
    for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){ let s=0,n=0;
      for(let dj=-1;dj<=1;dj++)for(let di=-1;di<=1;di++){ const ni=i+di,nj=j+dj; if(this.inB(ni,nj)){ s+=dens[this.idx(ni,nj)]; n++; } }
      densB[this.idx(i,j)]=s/n; }
    dens.set(densB);
  }
  densAt(x,y){ const C=CONFIG; const fx=x+C.worldW/2-0.5, fy=y+C.worldH/2-0.5;
    const i=Math.floor(fx),j=Math.floor(fy),tx=fx-i,ty=fy-j; const g=(ii,jj)=>this.inB(ii,jj)?this.dens[this.idx(ii,jj)]:0;
    return g(i,j)*(1-tx)*(1-ty)+g(i+1,j)*tx*(1-ty)+g(i,j+1)*(1-tx)*ty+g(i+1,j+1)*tx*ty; }

  // unit direction toward goal at (x,y)
  dirAt(x,y){ const i=this.ci(x), j=this.cj(y);
    const c=(ii,jj)=>{ if(!this.inB(ii,jj)) return this.maxCost; return this.cost[this.idx(ii,jj)]; };
    let gx=c(i+1,j)-c(i-1,j), gy=c(i,j+1)-c(i,j-1);
    let dx=-gx, dy=-gy; const m=Math.hypot(dx,dy); if(m<1e-6) return [0,0]; return [dx/m,dy/m]; }

  walkableAt(x,y){ const i=this.ci(x),j=this.cj(y); return this.inB(i,j)&&this.walk[this.idx(i,j)]; }

  // ---- dwell / lose ----
  updateDwell(dt){ const C=CONFIG; let worst=0, md=0;
    for(let k=0;k<this.dens.length;k++){ const d=this.dens[k]; if(d>md) md=d;
      if(d>=C.dDanger) this.dwell[k]+=dt; else this.dwell[k]=Math.max(0,this.dwell[k]-2*dt);
      if(this.dwell[k]>worst) worst=this.dwell[k]; }
    this.worstDwell=worst; if(md>this.worstDens) this.worstDens=md; this.curDens=md; return worst; }

  // ---- heatmap colourize into this.img (rgba) ----
  colorize(){ const C=CONFIG, stops=C.heat, img=this.img;
    for(let k=0;k<this.dens.length;k++){ const d=this.dens[k];
      let a=stops[0], b=stops[stops.length-1];
      for(let s=0;s<stops.length-1;s++){ if(d>=stops[s].d&&d<=stops[s+1].d){ a=stops[s]; b=stops[s+1]; break; } if(d>stops[stops.length-1].d){ a=b=stops[stops.length-1]; } }
      const t=b.d>a.d?U.clamp((d-a.d)/(b.d-a.d),0,1):0;
      const h=U.lerp(a.h,b.h,t), s=U.lerp(a.s,b.s,t), l=U.lerp(a.l,b.l,t);
      const [r,g,bl]=hslToRgb(h/360,s/100,l/100);
      const o=k*4; img[o]=r; img[o+1]=g; img[o+2]=bl; img[o+3]=255;
    }
    return img;
  }
}

// small hsl→rgb (0..1 h, 0..1 s,l) → 0..255
function hslToRgb(h,s,l){
  let r,g,b; if(s===0){ r=g=b=l; }
  else{ const q=l<0.5?l*(1+s):l+s-l*s, p=2*l-q;
    const hue=(t)=>{ if(t<0)t+=1; if(t>1)t-=1; if(t<1/6)return p+(q-p)*6*t; if(t<1/2)return q; if(t<2/3)return p+(q-p)*(2/3-t)*6; return p; };
    r=hue(h+1/3); g=hue(h); b=hue(h-1/3); }
  return [Math.round(r*255),Math.round(g*255),Math.round(b*255)];
}
