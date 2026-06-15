/* ============================================================
   FLOW — game.js
   Tycoon orchestrator: a run of escalating events. Earn Credits by
   clearing people safely; spend them on tools (in-event) and on
   permanent upgrades (between events). Watches the lose/win.
   ============================================================ */
'use strict';

const TOOLBTNS=[
  {id:'barrier', name:'Barrier'},
  {id:'gate',    name:'Meter'},
  {id:'paCalm',  name:'PA: Calm'},
  {id:'paHurry', name:'PA: Hurry'},
];

class Game{
  constructor(){
    this.canvas=document.getElementById('game');
    this.owned=new Set(); this.eventIndex=0; this.credits=CONFIG.startCredits;
    this.level=buildVenue(this.owned, EVENTS[0]);
    this.grid=new Grid(this.level);
    this.sim=new Sim(this.grid, this.level);
    this.render=new Renderer(this.canvas, this.grid, this.sim, this.level);
    this.phase='menu'; this.time=0; this.last=performance.now(); this.tool=null; this.dragStart=null;
    this.buildDock(); this.bindUI(); this.bindInput();
    window.addEventListener('resize',()=>this.render.resize());
    requestAnimationFrame(t=>this.loop(t));
  }

  /* ---- run / upgrade-derived numbers ---- */
  gateCost(){ return CONFIG.tools.gate.cost - (this.owned.has('cheap')?15:0); }
  gateRate(){ return CONFIG.tools.gate.rate + (this.owned.has('crews')?1.2:0); }
  dwellFail(){ return CONFIG.dwellFail + (this.owned.has('margin')?2:0); }
  toolCost(id){ return id==='barrier'?CONFIG.tools.barrier.cost : id==='gate'?this.gateCost() : CONFIG.tools.pa.cost; }

  beginRun(){ SFX.resume(); this.owned=new Set(); this.eventIndex=0; this.credits=CONFIG.startCredits; this.startEvent(); }
  startEvent(){
    const ev=EVENTS[this.eventIndex];
    this.level=buildVenue(this.owned, ev);
    this.grid=new Grid(this.level); this.sim=new Sim(this.grid, this.level);
    this.render.bind(this.grid, this.sim, this.level);
    this.time=0; this.tool=null; this.dragStart=null;
    this.spawns=this.level.spawns.map(s=>({...s,released:0}));
    this.toAdmit=0; this.admitAcc=0; this.queued=0; this.lastCleared=0; this.surgeShown=false;
    this.phase='play';
    ['start','end','shop','pause'].forEach(id=>document.getElementById(id).classList.add('hidden'));
    document.getElementById('hud').classList.remove('hidden');
    document.getElementById('readout').classList.add('show');
    this.syncDock();
    this.banner('EVENT '+(this.eventIndex+1), ev.name); this.toast(ev.intro); SFX.wave();
  }
  eventCleared(){
    this.phase='shop';
    const last=this.eventIndex>=EVENTS.length-1;
    document.getElementById('shopTitle').textContent = last?'The season is safe':'Event cleared';
    document.getElementById('shopSub').textContent = last
      ? 'You held every crowd out of the red. Spend what you earned, or take a bow.'
      : `You cleared ${this.sim.cleared} people without a crush. Reinvest, then the next crowd arrives.`;
    document.getElementById('nextBtn').textContent = last?'Finish':'Next event';
    this.buildShop();
    document.getElementById('shop').classList.remove('hidden');
    SFX.win();
  }
  nextEvent(){ if(this.eventIndex>=EVENTS.length-1){ this.done(); return; } this.eventIndex++; this.startEvent(); }
  done(){ this.phase='done';
    document.getElementById('endTitle').textContent='A safe season';
    document.getElementById('endText').textContent='Every event, every crowd, kept out of the red — by routing, not forcing. That is the whole craft.';
    document.getElementById('eTime').textContent='—'; document.getElementById('eCleared').textContent=this.sim.cleared; document.getElementById('ePeak').textContent=this.grid.worstDens.toFixed(1)+' p/m²';
    document.getElementById('end').classList.remove('hidden'); }
  lose(){ if(this.phase==='over') return; this.phase='over'; SFX.lose(); this.addShakeNone();
    document.getElementById('endTitle').textContent='A crush formed';
    document.getElementById('endText').textContent='Density held past the crush threshold. The fix is never at the red — it is upstream, where there is still space to act. Try this crowd again.';
    document.getElementById('eTime').textContent=this.clockStr(); document.getElementById('eCleared').textContent=this.sim.cleared; document.getElementById('ePeak').textContent=this.grid.worstDens.toFixed(1)+' p/m²';
    document.getElementById('againBtn').textContent='Try again';
    document.getElementById('end').classList.remove('hidden'); }
  addShakeNone(){}

  togglePause(f){ if(this.phase!=='play'&&this.phase!=='pause') return; this.phase=(f===undefined?(this.phase==='play'):f)?'pause':'play';
    const el=document.getElementById('pause');
    if(this.phase==='pause'){ document.getElementById('pTime').textContent=this.clockStr(); document.getElementById('pCleared').textContent=this.sim.cleared; document.getElementById('pSafety').textContent=Math.round(this.safety()*100)+'%'; el.classList.remove('hidden'); } else el.classList.add('hidden'); }

  /* ---- shop ---- */
  buildShop(){ document.getElementById('shopCredits').textContent=Math.floor(this.credits);
    const list=document.getElementById('shopList'); list.innerHTML='';
    for(const u of UPGRADES){ const owned=this.owned.has(u.id), poor=!owned&&this.credits<u.cost;
      const el=document.createElement('div'); el.className='shop-item'+(owned?' bought':'')+(poor?' poor':'');
      el.innerHTML=`<div class="si-main"><div class="si-name">${u.name}</div><div class="si-desc">${u.desc}</div></div>`+
        (owned?`<div class="si-cost">OWNED</div>`:`<div class="si-cost"><span class="mote-dot"></span>${u.cost}</div>`);
      if(!owned&&!poor) el.onclick=()=>{ this.credits-=u.cost; this.owned.add(u.id); SFX.build(); this.buildShop(); };
      list.appendChild(el); }
  }

  /* ---- dock ---- */
  buildDock(){ const dock=document.getElementById('dock'); dock.innerHTML=''; this.btnEls={};
    for(const b of TOOLBTNS){ const el=document.createElement('div'); el.className='tool';
      el.innerHTML=`<span class="t-name">${b.name}</span><span class="t-cost"><span class="t-coin"></span><span class="t-num"></span></span>`;
      el.onclick=()=>this.selectTool(b.id); dock.appendChild(el); this.btnEls[b.id]={el, costEl:el.querySelector('.t-cost'), numEl:el.querySelector('.t-num')}; } }
  selectTool(id){ this.tool=(this.tool===id?null:id); this.syncDock(); if(!this.tool) this.render.setGhost(null); }
  syncDock(){ for(const id in this.btnEls){ const b=this.btnEls[id]; const cost=this.toolCost(id==='paCalm'||id==='paHurry'?'pa':id);
    b.numEl.textContent=cost; b.el.classList.toggle('sel', this.tool===id); b.costEl.classList.toggle('poor', this.credits<cost); } }
  bindUI(){ const $=i=>document.getElementById(i);
    $('playBtn').onclick=()=>this.beginRun(); $('againBtn').onclick=()=>{ if(this.phase==='done') this.beginRun(); else this.startEvent(); };
    $('nextBtn').onclick=()=>this.nextEvent();
    $('pauseBtn').onclick=()=>this.togglePause(true); $('resumeBtn').onclick=()=>this.togglePause(false);
    $('restartBtn').onclick=()=>{ this.togglePause(false); this.beginRun(); };
    $('muteBtn').onclick=e=>{ const m=!SFX.isMuted(); SFX.setMuted(m); e.target.textContent='Sound: '+(m?'Off':'On'); }; }

  bindInput(){ const cv=this.canvas; const w=e=>this.render.screenToWorld(e.clientX,e.clientY);
    cv.addEventListener('pointermove',e=>{ if(this.phase!=='play'||!this.tool){ this.render.setGhost(null); return; } const p=this.previewPoint(w(e)); this.render.setGhost(this.ghostKind(), p.x, p.y, this.canPlace(p.x,p.y).ok); });
    cv.addEventListener('pointerdown',e=>{ if(this.phase!=='play'||!this.tool) return; if(this.tool==='barrier') this.dragStart=w(e); });
    cv.addEventListener('pointerup',e=>{ if(this.phase!=='play'||!this.tool) return; const p=w(e);
      if(this.tool==='barrier'&&this.dragStart){ this.placeBarrier(this.dragStart,p); this.dragStart=null; } else { const sp=this.previewPoint(p); this.placeAt(sp.x,sp.y); } });
    addEventListener('keydown',e=>{ if(e.code==='Escape') this.togglePause(); const m={Digit1:'barrier',Digit2:'gate',Digit3:'paCalm',Digit4:'paHurry'}; if(m[e.code]) this.selectTool(m[e.code]); });
  }
  ghostKind(){ return this.tool==='barrier'?'barrier':(this.tool==='gate'?'gate':'pa'); }
  // gates snap toward the entry (where they belong) and clamp into the concourse
  previewPoint(p){ if(this.tool!=='gate') return p; let x=U.clamp(p.x,-13,13), y=p.y;
    if(y<=this.level.entryMeterY+5) y=this.level.entry.y+1.5;           // snap up to the entry
    y=U.clamp(y, this.level.entry.y+1.5, this.level.pinches[0].y-2.5);  // never on/below the pinch
    return {x,y}; }

  canPlace(x,y){ const C=CONFIG;
    if(x<-C.worldW/2+1||x>C.worldW/2-1||y<-C.worldH/2+1||y>C.worldH/2-1) return {ok:false,msg:'Out of bounds'};
    if(this.grid.densAt(x,y)>=C.dDanger) return {ok:false,msg:'Never touch the crush — act upstream'};
    const cost=this.toolCost(this.tool==='paCalm'||this.tool==='paHurry'?'pa':this.tool);
    if(this.credits<cost) return {ok:false,msg:'Not enough credits'};
    if(this.tool==='gate'&&!this.grid.walkableAt(x,y)) return {ok:false,msg:'Place on open ground'};
    return {ok:true,cost};
  }
  placeAt(x,y){ const c=this.canPlace(x,y); if(!c.ok){ this.toast(c.msg); return; }
    if(this.tool==='gate'){
      const ng=this.sim.gates.find(g=>U.dist(g.x,g.y,x,y)<4); if(ng){ this.sim.gates.splice(this.sim.gates.indexOf(ng),1); this.credits+=Math.floor(c.cost/2); this.render.refreshTools(); this.syncDock(); return; }
      const g=this.sim.addGate(x,y,CONFIG.tools.gate.width); g.rate=this.gateRate(); this.credits-=c.cost; SFX.build();
    } else {
      const ex=this.sim.paZones.find(z=>U.dist(z.x,z.y,x,y)<z.r*0.6); if(ex){ this.sim.paZones.splice(this.sim.paZones.indexOf(ex),1); this.credits+=Math.floor(c.cost/2); this.render.refreshTools(); this.syncDock(); return; }
      this.sim.paZones.push({x,y,r:CONFIG.tools.pa.radius, factor:this.tool==='paCalm'?CONFIG.urgencyCalm:CONFIG.urgencyHurry}); this.credits-=c.cost; SFX.build();
    }
    this.render.refreshTools(); this.syncDock();
  }
  placeBarrier(a,b){ const cost=CONFIG.tools.barrier.cost; if(this.credits<cost){ this.toast('Not enough credits'); return; }
    if(this.grid.densAt(a.x,a.y)>=CONFIG.dDanger){ this.toast('Never touch the crush — act upstream'); return; }
    let bx=b.x,by=b.y; if(U.dist(a.x,a.y,bx,by)<1.5){ const [dx,dy]=this.grid.dirAt(a.x,a.y); const tx=-dy,ty=dx; a={x:a.x-tx*3,y:a.y-ty*3}; bx=a.x+tx*6; by=a.y+ty*6; }
    const snap=this.grid.snapWalk(); this.grid.stampSeg(a.x,a.y,bx,by); this.grid.reflood();
    if(!this.grid.goalReachableFromEntry(this.level.entry)){ this.grid.restoreWalk(snap); this.grid.reflood(); this.toast('That would seal the exit'); return; }
    this.credits-=cost; SFX.build(); this.render.refreshTools(); this.syncDock();
  }

  /* ---- arrivals -> outside queue -> metered admission ---- */
  releaseSpawns(){ for(const s of this.spawns){ if(this.time<s.t) continue;
    const elapsed=Math.min(this.time, s.t+s.over)-s.t; const want=Math.floor(elapsed/s.over*s.count);
    if(want>s.released){ this.toAdmit+=(want-s.released); s.released=want; }
    if(s.count>200 && this.time>=s.t && !this.surgeShown){ this.surgeShown=true; this.banner('THE SURGE','Hold them outside — meter the entry'); SFX.boss(); } } }
  admit(dt){ const e=this.level.entry, g=this.grid; const eg=this.sim.gates.find(z=>z.y<=this.level.entryMeterY); const rate= eg?eg.rate:1e9;
    this.admitAcc+=Math.min(this.toAdmit, rate*dt);
    while(this.admitAcc>=1 && this.toAdmit>=1){ let x,y,t=0; do{ x=e.x+U.rand(-e.w/2,e.w/2); y=e.y+U.rand(0,2); t++; }while(!g.walkableAt(x,y)&&t<8); this.sim.add(x,y); this.admitAcc-=1; this.toAdmit-=1; }
    this.queued=Math.floor(this.toAdmit); }
  allCleared(){ return this.spawns.every(s=>s.released>=s.count) && this.toAdmit<1 && this.sim.n===0; }

  update(dt){
    this.time+=dt; this.releaseSpawns(); this.admit(dt); this.sim.step(dt); this.grid.updateDwell(dt);
    // earn credits for everyone safely cleared
    if(this.sim.cleared>this.lastCleared){ this.credits+=(this.sim.cleared-this.lastCleared)*CONFIG.earnPerClear; this.lastCleared=this.sim.cleared; }
    if(this.grid.worstDwell>=this.dwellFail()){ this.lose(); return; }
    if(this.time>=this.level.duration || this.allCleared()){ this.eventCleared(); return; }
    this.syncHUD();
  }
  safety(){ return U.clamp(1 - this.grid.worstDwell/this.dwellFail(), 0, 1); }
  clockStr(){ const t=Math.floor(this.time); return Math.floor(t/60)+':'+String(t%60).padStart(2,'0'); }
  syncHUD(){ const C=CONFIG;
    document.getElementById('clock').textContent=this.clockStr();
    document.getElementById('cleared').textContent=this.sim.cleared;
    document.getElementById('credits').textContent=Math.floor(this.credits);
    const s=this.safety(); const f=document.getElementById('safetyFill'); f.style.width=(s*100)+'%';
    f.style.background = s<0.34?'linear-gradient(90deg,#ff4d3a,#ff9a86)':'linear-gradient(90deg,var(--gold),var(--gold-soft))';
    document.getElementById('safetyTxt').textContent=Math.round(s*100)+'%';
    let flow=0; for(const p of this.sim.pinches) flow+=p.passing;
    const peak=this.grid.curDens||0, warn=peak>=C.dDanger;
    const q=this.queued>0?` · <span style="color:var(--ink-dim)">queued outside ${this.queued}</span>`:'';
    document.getElementById('readout').innerHTML=`exit flow <b>${flow.toFixed(1)}/s</b> · peak density <span class="${warn?'warn':''}" style="${warn?'':(peak>=C.dCrit?'color:#ffb86a':'')}">${peak.toFixed(1)} p/m²</span>${q}`;
    this.syncDock();
  }
  banner(k,n){ const b=document.getElementById('banner'); b.innerHTML=`<span class="wb-k">${k}</span><span class="wb-n">${n}</span>`; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); }
  toast(msg){ const t=document.getElementById('toast'); t.innerHTML=msg; t.classList.add('show'); clearTimeout(this._tt); this._tt=setTimeout(()=>t.classList.remove('show'),2600); }

  loop(now){ let dt=(now-this.last)/1000; this.last=now; if(dt>0.033) dt=0.033;
    if(this.phase==='play') this.update(dt);
    this.render.syncHeat(); this.render.syncCrowd(); this.render.draw();
    requestAnimationFrame(t=>this.loop(t));
  }
}

window.addEventListener('load',()=>{ window.game=new Game(); });
