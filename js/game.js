/* ============================================================
   MONKEY BUSINESS — game.js
   You start with only the banana pile + keeper. Build the base out
   yourself: select a tool, walk to a spot, tap Build to place it and
   pay coins. Wall blocks are paid; leave gaps for gates. Monkeys
   emerge from fixed themed spawn points and raid the pile; the
   wave-end truck carts the trapped ones home.
   ============================================================ */
'use strict';

class Game{
  constructor(){
    this.canvas=document.getElementById('game');
    this.render=new Renderer(this.canvas,this);
    this.hero={x:0,y:13,aim:-Math.PI/2,face:-Math.PI/2,moving:false,cd:0};
    this.input={up:false,down:false,left:false,right:false}; this.joy={active:false,ox:0,oy:0,dx:0,dy:0,id:null};
    this.phase='menu'; this.time=0; this.last=performance.now(); this.tool=null;
    this.structures=[]; this.wallBlocks=[];
    this.bindUI(); this.bindInput();
    window.addEventListener('resize',()=>this.render.resize());
    requestAnimationFrame(t=>this.loop(t));
  }

  /* ---- run lifecycle ---- */
  beginRun(){ SFX.resume(); const C=CONFIG;
    this.bananas=C.bananas; this.wave=0; this.ecoRate=0; this._frontiers=[];   // bananas = the one resource (treasury + lives)
    this.unlocked=new Set(C.startUnlocks); this.tool=null;
    this.structures=[]; this.wallBlocks=[];
    this.monkeys=[]; this.nets=[]; this.trainees=[];
    this.netTowers=[]; this.decoys=[]; this.cages=[]; this.muds=[]; this.farms=[];
    this.render.resetBase(); this.render.updateCore(this.bananas); this.render.closeZooGate(); this.render.drawTerritory(this); this.render.drawSupply(this);
    this.hero={x:0,y:13,aim:-Math.PI/2,face:-Math.PI/2,moving:false,cd:0};
    ['start','end'].forEach(id=>document.getElementById(id).classList.add('hidden'));
    document.getElementById('hud').classList.remove('hidden'); document.getElementById('build').classList.remove('hidden');
    this.buildTray(); this.nextWave();
  }

  /* ---- build tray UI ---- */
  buildTray(){ const wrap=document.getElementById('tray'); wrap.innerHTML='';
    this.chips={};
    for(const type of CONFIG.toolOrder){ const def=CONFIG.build[type];
      const el=document.createElement('button'); el.className='toolchip'; el.dataset.type=type;
      el.innerHTML=`<span class="tc-name">${def.name}</span><span class="tc-cost"><span class="banana-dot sm"></span>${def.cost(1)}</span>`;
      el.onclick=()=>this.selectTool(type); wrap.appendChild(el); this.chips[type]=el; }
  }
  selectTool(type){ if(!this.unlocked.has(type)) return; this.tool = (this.tool===type)?null:type; }
  ghostPos(){ const s=CONFIG.snap; if(this.tool && this.aimPt) return {x:Math.round(this.aimPt.x/s)*s, y:Math.round(this.aimPt.y/s)*s};
    const a=this.hero.face!=null?this.hero.face:-Math.PI/2, d=CONFIG.placeAhead;
    return {x:Math.round((this.hero.x+Math.cos(a)*d)/s)*s, y:Math.round((this.hero.y+Math.sin(a)*d)/s)*s}; }
  occupied(x,y,minD){ for(const s of this.structures){ if(U.dist(x,y,s.x,s.y)<minD) return true; } for(const w of this.wallBlocks){ if(U.dist(x,y,w.x,w.y)<minD) return true; } return false; }
  inWater(x,y){ const w=CONFIG.water; return w && x>w.x-w.halfW && x<w.x+w.halfW && y>w.z0 && y<w.z1; }
  // returns null if placeable, else a short reason string (shown on the Build button + toast)
  placeError(type,x,y){ const C=CONFIG, def=C.build[type]; if(!def) return 'Locked';
    if(!this.unlocked.has(type)) return 'Locked — survive more waves';
    if(this.bananas < def.cost(1)) return 'Need '+def.cost(1)+' bananas';
    if(U.dist(x,y,C.core.x,C.core.y) < C.coreClear) return 'Too close to the pile';
    if(this.inWater(x,y)) return "Can't build on the river";
    if(this.occupied(x,y, C.snap*0.9)) return 'Blocked — too close to another build';
    return null; }
  canPlace(type,x,y){ return !this.placeError(type,x,y); }
  buildLog(r,gp){ const a=(window.__buildLog=window.__buildLog||[]); a.push({tool:this.tool,gp:gp&&{x:gp.x,y:gp.y},result:r,bananas:Math.floor(this.bananas)}); if(a.length>40) a.shift(); }
  placeAt(gp){ if(!this.tool){ this.toast('Pick a tool to build'); this.buildLog('no-tool',gp); return; }
    const err=this.placeError(this.tool,gp.x,gp.y);
    if(err){ this.toast(err); SFX.hurt(); this.buildLog('blocked: '+err,gp); return; }
    const def=CONFIG.build[this.tool]; this.bananas-=def.cost(1); this.render.updateCore(Math.floor(this.bananas));
    if(def.wall) this.wallBlocks.push({x:gp.x,y:gp.y});
    else { this.structures.push({type:this.tool,x:gp.x,y:gp.y,level:1}); this.rebuildDerived(); }
    this.render.drawTerritory(this); this.render.burst(gp.x,gp.y,ACCENT.gold); this.toast('Built '+def.name+' · -'+def.cost(1)); this.buildLog('built '+def.name,gp); SFX.build(); }
  placeTool(){ this.placeAt(this.ghostPos()); }
  upgradeTarget(){ if(this.tool) return null; let best=null,bd=CONFIG.hero.buildReach; const h=this.hero;
    for(const s of this.structures){ const def=CONFIG.build[s.type]; if(s.level>=def.max) continue; const d=U.dist(h.x,h.y,s.x,s.y); if(d<bd){bd=d;best=s;} } return best; }
  doUpgrade(){ const s=this.upgradeTarget(); if(!s) return; const cost=CONFIG.build[s.type].cost(s.level+1); if(this.bananas<cost) return;
    this.bananas-=cost; this.render.updateCore(Math.floor(this.bananas)); s.level++; s._dirty=true; this.rebuildDerived(); SFX.build(); }
  /* ---- sell / refund (stand on a building or wall, get ~60% back) ---- */
  sellTarget(){ if(this.tool) return null; const h=this.hero; let best=null,bd=CONFIG.hero.buildReach,kind=null;
    for(const s of this.structures){ const d=U.dist(h.x,h.y,s.x,s.y); if(d<bd){bd=d;best=s;kind='struct';} }
    for(const w of this.wallBlocks){ const d=U.dist(h.x,h.y,w.x,w.y); if(d<bd){bd=d;best=w;kind='wall';} }
    return best?{obj:best,kind}:null; }
  sellValue(t){ if(t.kind==='wall') return Math.max(1,Math.round(CONFIG.build.wall.cost()*0.6)); const def=CONFIG.build[t.obj.type]; let tot=0; for(let l=1;l<=t.obj.level;l++) tot+=def.cost(l); return Math.max(1,Math.round(tot*0.6)); }
  doSell(){ const t=this.sellTarget(); if(!t) return; const refund=this.sellValue(t); this.bananas+=refund;
    if(t.kind==='wall'){ const w=t.obj; if(w.mesh){ this.render.wallGroup.remove(w.mesh); this.render.disposeGroup(w.mesh); } this.wallBlocks.splice(this.wallBlocks.indexOf(w),1); }
    else { const s=t.obj; if(s._claw){ this.render.clawGroup.remove(s._claw.grp); this.render.disposeGroup(s._claw.grp); s._claw=null; } if(s.mesh){ this.render.structGroup.remove(s.mesh); this.render.disposeGroup(s.mesh); } this.structures.splice(this.structures.indexOf(s),1); this.rebuildDerived(); }
    this.render.drawTerritory(this); this.render.drawSupply(this); this.render.updateCore(Math.floor(this.bananas)); this.toast('Sold · +'+refund); SFX.pickup(); }

  rebuildDerived(){ this.netTowers=[]; this.decoys=[]; this.cages=[]; this.muds=[]; this.farms=[]; this.trainees=[]; this.ecoRate=0;
    const roads=[], farmList=[];
    for(const p of this.structures){ if(p.type==='supply'){ roads.push(p); continue; } const s=CONFIG.build[p.type].stat(p.level);
      if(p.type==='net') this.netTowers.push({x:p.x,y:p.y,range:s.range,rate:s.rate,cd:0});
      else if(p.type==='decoy') this.decoys.push({x:p.x,y:p.y,pull:s.pull});
      else if(p.type==='cage') this.cages.push({x:p.x,y:p.y,r:s.r,cd:s.cd,timer:0});
      else if(p.type==='mud') this.muds.push({x:p.x,y:p.y,r:s.r,slow:s.slow});
      else if(p.type==='farm'){ this.farms.push(p); farmList.push(p); }
      else if(p.type==='trainee'){ const cnt=s.count; p._agents=p._agents||[];   // PRESERVE existing keepers across rebuilds; only add on upgrade
        while(p._agents.length<cnt){ const i=p._agents.length, a=i/Math.max(1,cnt)*TAU; p._agents.push({hx:p.x,hy:p.y,x:p.x+Math.cos(a)*3,y:p.y+Math.sin(a)*3,cd:U.rand(0,1),tx:p.x,ty:p.y,roamT:0,aim:0,moving:false,wob:U.rand(TAU),mesh:null}); }
        while(p._agents.length>cnt) p._agents.pop();
        for(const ag of p._agents){ ag.hx=p.x; ag.hy=p.y; ag.range=s.range; ag.rate=s.rate; ag.speed=s.speed; this.trainees.push(ag); } } }
    this.computeSupply(roads, farmList);
    for(const f of farmList){ if(f.connected) this.ecoRate += CONFIG.build.farm.stat(f.level).eco; }
    this.render.drawSupply(this);
  }
  // Supply network. Wires snap between ANY two nearby nodes (core + poles + farms) the moment they're placed.
  // Production/claw still require an actual chain back to the core (BFS), so connectivity is honest.
  computeSupply(roads, farms){ const L2=CONFIG.linkDist*CONFIG.linkDist, nodes=[{x:CONFIG.core.x,y:CONFIG.core.y}].concat(roads), N=nodes.length;
    // 1) visual wires: every nearby pair among core+poles+farms (instant snap as you build)
    const pts=nodes.concat(farms.map(f=>({x:f.x,y:f.y}))); this.supplyWires=[];
    for(let i=0;i<pts.length;i++) for(let j=i+1;j<pts.length;j++){ if(U.dist2(pts[i].x,pts[i].y,pts[j].x,pts[j].y)<=L2) this.supplyWires.push([pts[i].x,pts[i].y,pts[j].x,pts[j].y]); }
    // 2) production: BFS from core for which farms are truly powered + their path home
    const reached=new Array(N).fill(false), parent=new Array(N).fill(-1); reached[0]=true; const q=[0];
    while(q.length){ const i=q.shift(); for(let j=0;j<N;j++){ if(!reached[j] && U.dist2(nodes[i].x,nodes[i].y,nodes[j].x,nodes[j].y)<=L2){ reached[j]=true; parent[j]=i; q.push(j); } } }
    for(const f of farms){ f.connected=false; f.path=null; let best=-1,bd=L2;
      for(let j=0;j<N;j++){ if(reached[j]){ const d=U.dist2(f.x,f.y,nodes[j].x,nodes[j].y); if(d<=bd){bd=d;best=j;} } }
      if(best>=0){ f.connected=true; const path=[{x:f.x,y:f.y}]; let k=best; while(k!==-1){ path.push({x:nodes[k].x,y:nodes[k].y}); k=parent[k]; } f.path=path; } } }

  /* ---- waves ---- */
  checkUnlocks(){ const t=CONFIG.unlockByWave[this.wave]; if(t && !this.unlocked.has(t)){ this.unlocked.add(t); this.toast('Unlocked: '+CONFIG.build[t].name); SFX.unlock(); } }
  baseRadius(){ let r=22; for(const s of this.structures) r=Math.max(r,U.dist(s.x,s.y,0,0)); for(const w of this.wallBlocks) r=Math.max(r,U.dist(w.x,w.y,0,0)); return r; }
  nextWave(){ this.wave++; if(this.wave>CONFIG.totalWaves){ this.win(); return; }
    this.checkUnlocks();
    const w=CONFIG.waveSpec(this.wave); this.waveDef=w; this.waveSpeedMul=1+(this.wave-1)*0.006;   // raiders get faster each wave (less time to net them)
    this.netBonus=Math.floor((this.wave-1)/16);   // +1 net to trap every 16 waves — small bases get overwhelmed, big bases keep up
    const prev=this._frontiers||[]; const added=w.frontiers.filter(f=>!prev.includes(f) && prev.length); this._frontiers=w.frontiers.slice(); this.frontiers=w.frontiers;
    this.render.buildSpawnMarkers(w.frontiers);
    this.spawnQueue=[]; const tw=w.pool.reduce((s,p)=>s+p[1],0);
    for(let i=0;i<w.count;i++){ let r=Math.random()*tw,pick=w.pool[0][0]; for(const [k,v] of w.pool){ if((r-=v)<=0){pick=k;break;} } this.spawnQueue.push(pick); }
    if(w.boss) this.spawnQueue.push('boss');
    this.spawnInterval=w.interval; this.spawnTimer=0.9; this.phase='play';
    if(added.includes('zoo')){ this.render.openZooGate(); this.banner('THE ZOO BREAKS OPEN', 'The captives join the raid from the east'); SFX.boss(); }
    else if(added.includes('mountains')){ this.banner('THE MOUNTAINS STIR', 'A second frontier opens to the north-east'); SFX.boss(); }
    else if(w.boss){ this.banner('BOSS · WAVE '+this.wave, 'A silverback is coming for the pile'); SFX.boss(); }
    else this.banner('WAVE '+this.wave+' / '+CONFIG.totalWaves, this.wave===1?'Build walls & nets — guard the pile':'');
    if(!w.boss && !added.length) SFX.wave();
  }
  win(){ this.phase='over'; SFX.win(); document.getElementById('build').classList.add('hidden');
    document.getElementById('endTitle').textContent='The zoo is whole again';
    document.getElementById('endText').textContent='One hundred waves held. Every monkey home, the pile intact. A legendary keeper.';
    this.fillEnd(CONFIG.totalWaves); document.getElementById('againBtn').textContent='New run'; document.getElementById('end').classList.remove('hidden'); }
  lose(){ if(this.phase==='over') return; this.phase='over'; SFX.lose(); document.getElementById('build').classList.add('hidden');
    document.getElementById('endTitle').textContent='The pile is gone';
    document.getElementById('endText').textContent='The last banana was carried off. Wall in the pile sooner and ring it with nets.';
    this.fillEnd(this.wave, true); document.getElementById('againBtn').textContent='Try again'; document.getElementById('end').classList.remove('hidden'); }
  fillEnd(wave, dead){ document.getElementById('eWave').textContent=wave; document.getElementById('eBananas').textContent=dead?0:Math.floor(this.bananas);
    document.getElementById('ePlots').textContent=this.structures.length+this.wallBlocks.length; }
  togglePause(f){ if(this.phase!=='play'&&this.phase!=='pause'&&this.phase!=='truck') return;
    if(f===undefined) f=this.phase!=='pause';
    if(f){ this._prePause=this.phase; this.phase='pause';
      document.getElementById('pWave').textContent=this.wave+' / '+CONFIG.totalWaves; document.getElementById('pBananas').textContent=Math.floor(this.bananas);
      document.getElementById('pause').classList.remove('hidden'); }
    else { this.phase=this._prePause||'play'; document.getElementById('pause').classList.add('hidden'); } }

  /* ---- input ---- */
  bindUI(){ const $=i=>document.getElementById(i);
    $('playBtn').onclick=()=>this.beginRun(); $('againBtn').onclick=()=>this.beginRun();
    $('pauseBtn').onclick=()=>this.togglePause(true); $('resumeBtn').onclick=()=>this.togglePause(false);
    $('restartBtn').onclick=()=>{ this.togglePause(false); this.beginRun(); };
    $('muteBtn').onclick=e=>{ const m=!SFX.isMuted(); SFX.setMuted(m); e.target.textContent='Sound: '+(m?'Off':'On'); };
    $('buildBtn').onclick=()=>this.placeTool(); $('upgradeBtn').onclick=()=>this.doUpgrade(); $('sellBtn').onclick=()=>this.doSell(); $('cancelBtn').onclick=()=>{ this.tool=null; }; }
  bindInput(){ const keymap={ArrowUp:'up',KeyW:'up',ArrowDown:'down',KeyS:'down',ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right'};
    addEventListener('keydown',e=>{ if(e.code==='Escape'){this.togglePause();return;} if(e.code==='Space'){ if(this.tool) this.placeTool(); else this.doUpgrade(); e.preventDefault(); return; } if(keymap[e.code]){this.input[keymap[e.code]]=true;e.preventDefault();} });
    addEventListener('keyup',e=>{ if(keymap[e.code]) this.input[keymap[e.code]]=false; });
    const cv=this.canvas, stick=document.getElementById('stick'), nub=document.getElementById('stickNub');
    const fromUI=t=>{ let el=t.target; while(el){ if(el.id==='build'||el.id==='hud'||el.classList&&el.classList.contains('overlay')) return true; el=el.parentElement; } return false; };
    const setAim=(px,py)=>{ if(this.tool) this.aimPt=this.render.screenToWorld(px,py); };  // ghost follows cursor/finger
    const down=(px,py,id)=>{ this.joy.active=true; this.joy.id=id; this.joy.ox=px; this.joy.oy=py; this.joy.dx=0; this.joy.dy=0; stick.style.left=px+'px'; stick.style.top=py+'px'; stick.classList.remove('hidden'); nub.style.transform='translate(-50%,-50%)';
      this._tap={x:px,y:py,moved:false}; setAim(px,py); };
    const move=(px,py)=>{ if(this._tap && Math.hypot(px-this._tap.x,py-this._tap.y)>11) this._tap.moved=true; if(!this.joy.active) return; let dx=px-this.joy.ox,dy=py-this.joy.oy; const max=54,d=Math.hypot(dx,dy); if(d>max){dx=dx/d*max;dy=dy/d*max;} this.joy.dx=dx/max; this.joy.dy=dy/max; nub.style.transform=`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px))`; };
    const up=()=>{ if(this._tap && !this._tap.moved && (this.phase==='play'||this.phase==='truck')){ if(this.tool) this.placeTool(); else this.toast('Pick a tool to build'); } this._tap=null;
      this.joy.active=false; this.joy.dx=0; this.joy.dy=0; stick.classList.add('hidden'); };
    cv.addEventListener('touchstart',e=>{ const t=e.changedTouches[0]; down(t.clientX,t.clientY,t.identifier); e.preventDefault(); },{passive:false});
    cv.addEventListener('touchmove',e=>{ for(const t of e.changedTouches){ if(t.identifier===this.joy.id) move(t.clientX,t.clientY); } e.preventDefault(); },{passive:false});
    cv.addEventListener('touchend',e=>{ for(const t of e.changedTouches){ if(t.identifier===this.joy.id) up(); } }); cv.addEventListener('touchcancel',up);
    cv.addEventListener('mousedown',e=>down(e.clientX,e.clientY,'m'));
    cv.addEventListener('mousemove',e=>setAim(e.clientX,e.clientY));   // aim only updates over the play area, NOT when the cursor is on the Build button/tray
    addEventListener('mousemove',e=>move(e.clientX,e.clientY)); addEventListener('mouseup',up);
  }
  moveHero(dt){ const h=this.hero,C=CONFIG; let mx=(this.input.right?1:0)-(this.input.left?1:0), my=(this.input.down?1:0)-(this.input.up?1:0);
    if(this.joy.active&&(this.joy.dx||this.joy.dy)){ mx=this.joy.dx; my=this.joy.dy; } const ml=Math.hypot(mx,my); if(ml>1){ mx/=ml; my/=ml; }
    h.moving=ml>0.1; if(h.moving){ h.aim=U.ang(0,0,mx,my); h.face=h.aim; }   // face = travel heading, drives the build ghost
    const wading=this.inWater(h.x,h.y) && Math.abs(h.y)>C.water.bridgeHalf;   // off-bridge crossing is slow, not blocked
    const spd=C.hero.speed*(wading?C.waterSlow:1), lim=C.worldClamp;
    h.x=U.clamp(h.x+mx*spd*dt,-lim,lim); h.y=U.clamp(h.y+my*spd*dt,-lim,lim);
    this.collideProps(h);   // trees & rocks are solid; the keeper passes through his OWN walls (walls block monkeys, not you)
  }

  // push the keeper out of streamed scenery (trees, rocks) so the world feels physical
  collideProps(e){ const cols=this.render.colliders; if(!cols||!cols.length) return; const R=CONFIG.hero.radius;
    for(const c of cols){ const ox=e.x-c.x, oy=e.y-c.y, rr=c.r+R, d=Math.hypot(ox,oy); if(d<rr){ if(d>1e-4){ const p=rr-d; e.x+=ox/d*p; e.y+=oy/d*p; } else e.x+=rr; } } }

  /* ---- collision: walls block MONKEYS only; the river just slows the keeper ---- */
  collideWalls(e,r){ if(!this.wallBlocks||!this.wallBlocks.length) return; const WR=CONFIG.build.wall.foot, rr=WR+r;
    for(const w of this.wallBlocks){ const ox=e.x-w.x, oy=e.y-w.y, d=Math.hypot(ox,oy); if(d<rr){ if(d>1e-4){ const p=rr-d; e.x+=ox/d*p; e.y+=oy/d*p; } else { e.x+=rr; } } } }

  /* ---- monkeys ---- */
  spawn(type){ const def=CONFIG.monkeys[type]; const fr=this.frontiers||['jungle'];
    const key=(def.zoo && fr.includes('zoo')) ? 'zoo' : U.choice(fr); const reg=CONFIG.regions[key];
    const x=reg.sx+U.rand(-5,5), y=reg.sy+U.rand(-5,5);
    this.monkeys.push({type,def,x,y,state:'incoming',carrying:false,netHits:0,nets:def.nets+(this.netBonus||0),grabT:0,wob:U.rand(TAU),struggle:0,face:0,target:null,sx:reg.sx,sy:reg.sy,mesh:null}); }
  assignTarget(m){ if(this.decoys.length && !m.def.decoyProof){ let best=null,bd=1e9; for(const d of this.decoys){ const dd=U.dist2(m.x,m.y,d.x,d.y); if(dd<bd){bd=dd;best=d;} } m.target={x:best.x,y:best.y,kind:'decoy'}; }
    else m.target={x:CONFIG.core.x,y:CONFIG.core.y,kind:'pile'}; }
  mudFactor(x,y){ let f=1; for(const z of this.muds){ if(U.dist2(x,y,z.x,z.y)<z.r*z.r) f=Math.min(f,z.slow); } return f; }

  updateMonkeys(dt){ const list=this.monkeys;
    for(let i=list.length-1;i>=0;i--){ const m=list[i]; m.wob+=dt*9;
      if(m.state==='trapped'){ m.struggle+=dt*7; continue; }
      if(!m.target) this.assignTarget(m);
      const spd=m.def.speed*(this.waveSpeedMul||1)*this.mudFactor(m.x,m.y);
      if(m.state==='incoming'){
        const tx=m.target.x,ty=m.target.y, d=U.dist(m.x,m.y,tx,ty); m.face=U.ang(m.x,m.y,tx,ty);
        if(d<2.6){ m.state='grab'; m.grabT=m.def.grab; }
        else { m.x+=Math.cos(m.face)*spd*dt; m.y+=Math.sin(m.face)*spd*dt; }
      } else if(m.state==='grab'){
        m.grabT-=dt; if(m.grabT<=0){ if(m.target.kind==='pile' && this.bananas>=1){ const amt=Math.min(Math.floor(this.bananas), m.def.steal||1); this.bananas-=amt; m.carrying=true; m.carriedAmt=amt; this.render.updateCore(Math.floor(this.bananas)); if(this.bananas<1) this.lose(); }
          m.state='fleeing'; }
      } else if(m.state==='fleeing'){
        m.face=U.ang(m.x,m.y,m.sx,m.sy); m.x+=Math.cos(m.face)*spd*dt; m.y+=Math.sin(m.face)*spd*dt;
        if(U.dist(m.x,m.y,m.sx,m.sy)<4){ this.render.removeMonkeyMesh(m); list.splice(i,1); continue; }
      }
      if(!m.def.climb) this.collideWalls(m, m.def.r*0.55);
      for(const c of this.cages){ if(c.timer<=0 && m.state!=='trapped' && !m.def.boss && U.dist2(m.x,m.y,c.x,c.y)<c.r*c.r){ this.trap(m); c.timer=c.cd; this.render.burst(c.x,c.y,ACCENT.net); } }
    }
    for(const c of this.cages) c.timer=Math.max(0,c.timer-dt);
  }
  trap(m){ m.state='trapped'; m.netHits=m.nets||m.def.nets; SFX.hit(); }
  hitNet(m){ m.netHits++; if(m.netHits>=(m.nets||m.def.nets)) this.trap(m); }
  activeMonkeys(){ let n=0; for(const m of this.monkeys) if(m.state!=='trapped') n++; return n; }
  nearestActive(x,y,range){ let best=null,bd=range*range; for(const m of this.monkeys){ if(m.state==='trapped') continue; const d=U.dist2(x,y,m.x,m.y); if(d<bd){bd=d;best=m;} } return best; }

  /* ---- nets / towers / trainees ---- */
  fireNet(x,y,target){ const a=U.ang(x,y,target.x,target.y); this.nets.push({x,y,vx:Math.cos(a)*CONFIG.hero.netSpeed,vy:Math.sin(a)*CONFIG.hero.netSpeed,target,life:1.3}); SFX.shoot(); }
  updateNets(dt){ for(let i=this.nets.length-1;i>=0;i--){ const n=this.nets[i]; n.x+=n.vx*dt; n.y+=n.vy*dt; n.life-=dt; const t=n.target;
    if(!t || t.state==='trapped' || U.dist(n.x,n.y,t.x,t.y)<1.8){ if(t && t.state!=='trapped' && U.dist(n.x,n.y,t.x,t.y)<2.8) this.hitNet(t); this.nets.splice(i,1); continue; }
    if(n.life<=0) this.nets.splice(i,1); } }
  updateTowers(dt){ for(const tw of this.netTowers){ tw.cd-=dt; if(tw.cd<=0){ const m=this.nearestActive(tw.x,tw.y,tw.range); if(m){ tw.cd=1/tw.rate; this.fireNet(tw.x,tw.y,m); } } } }
  updateTrainees(dt){ for(const k of this.trainees){ k.wob+=dt*8; k.cd-=dt;
    const m=this.nearestActive(k.x,k.y,k.range);
    if(m){ k.aim=U.ang(k.x,k.y,m.x,m.y); k.tx=U.lerp(k.x,m.x,0.5); k.ty=U.lerp(k.y,m.y,0.5); if(k.cd<=0){ k.cd=1/k.rate; this.fireNet(k.x,k.y,m); } }
    else { k.roamT-=dt; if(k.roamT<=0){ k.roamT=U.rand(1.2,2.6); const a=U.rand(TAU),r=U.rand(0,6); k.tx=k.hx+Math.cos(a)*r; k.ty=k.hy+Math.sin(a)*r; } }
    const d=U.dist(k.x,k.y,k.tx,k.ty); k.moving=d>0.4; if(k.moving){ const a=U.ang(k.x,k.y,k.tx,k.ty); k.x+=Math.cos(a)*k.speed*dt; k.y+=Math.sin(a)*k.speed*dt; if(!m) k.aim=a; } } }

  /* ---- truck (wave end) ---- */
  startTruck(){ this.phase='truck'; const ext=this.baseRadius(); this.truck={stage:'in',x:0,y:-(ext+16),t:0,loadT:0}; SFX.turret(); }
  updateTruck(dt){ const tr=this.truck;
    if(tr.stage==='in'){ tr.y=U.approach(tr.y,-9,22,dt); this.render.setTruck(true,tr.x,tr.y,0); if(tr.y>=-9.5) tr.stage='load';
    } else if(tr.stage==='load'){ this.render.setTruck(true,tr.x,tr.y,0); tr.loadT-=dt;
      if(tr.loadT<=0){ let loaded=0, m;   // load a few per tick so wave-end isn't a slog
        while(loaded<3 && (m=this.monkeys.find(mm=>mm.state==='trapped'))){ this.bananas+=m.def.bounty; if(m.carrying) this.bananas+=(m.carriedAmt||1); this.render.coinPop(m.x,m.y+3); this.render.removeMonkeyMesh(m); this.monkeys.splice(this.monkeys.indexOf(m),1); loaded++; }
        if(loaded){ this.render.updateCore(Math.floor(this.bananas)); tr.loadT=0.13; SFX.pickup(); } else tr.stage='out'; }
    } else { const ext=this.baseRadius(); tr.y=U.approach(tr.y,-(ext+20),26,dt); this.render.setTruck(true,tr.x,tr.y,0); if(tr.y<=-(ext+19)){ this.render.setTruck(false); this.endTruck(); } }
  }
  endTruck(){ this.monkeys=this.monkeys.filter(m=>{ if(m.state!=='trapped') return true; this.render.removeMonkeyMesh(m); return false; }); this.nextWave(); }

  /* ---- loop ---- */
  update(dt){ this.time+=dt; this.moveHero(dt);
    if(this.ecoRate) this.bananas+=this.ecoRate*dt;   // connected farms grow the pile
    if(this.phase==='truck'){ this.updateTrainees(dt); this.updateTowers(dt); this.updateNets(dt); this.updateMonkeys(dt); this.updateTruck(dt); this.syncHUD(); return; }
    if(this.spawnQueue.length){ this.spawnTimer-=dt; if(this.spawnTimer<=0){ this.spawn(this.spawnQueue.shift()); this.spawnTimer=this.spawnInterval; } }
    this.updateMonkeys(dt); this.updateTowers(dt); this.updateTrainees(dt); this.updateNets(dt);
    this.hero.cd-=dt; const tgt=this.nearestActive(this.hero.x,this.hero.y,CONFIG.hero.netRange);
    if(tgt){ this.hero.aim=U.ang(this.hero.x,this.hero.y,tgt.x,tgt.y); if(this.hero.cd<=0){ this.hero.cd=1/CONFIG.hero.netRate; this.fireNet(this.hero.x,this.hero.y,tgt); } }
    if(this.bananas<1){ this.lose(); return; }
    if(this.spawnQueue.length===0 && this.activeMonkeys()===0){ if(this.monkeys.length) this.startTruck(); else this.nextWave(); }
    this.syncHUD();
  }
  syncHUD(){ const $=i=>document.getElementById(i);
    $('waveNum').textContent=this.wave+'/'+CONFIG.totalWaves; $('bananaNum').textContent=Math.floor(this.bananas);
    $('ecoNum').textContent=(this.ecoRate>0?'+':'')+this.ecoRate.toFixed(1); $('plotNum').textContent=this.structures.length+this.wallBlocks.length;
    this.render.updateCore(Math.floor(this.bananas)); this.syncTray(); }
  syncTray(){ if(!this.chips) return; const C=CONFIG;
    for(const type in this.chips){ const el=this.chips[type], def=C.build[type], locked=!this.unlocked.has(type), poor=this.bananas<def.cost(1);
      el.classList.toggle('locked',locked); el.classList.toggle('poor',!locked&&poor); el.classList.toggle('sel',this.tool===type); }
    const bb=document.getElementById('buildBtn'), ub=document.getElementById('upgradeBtn'), cb=document.getElementById('cancelBtn'), sb=document.getElementById('sellBtn');
    if(this.tool){ const gp=this.ghostPos(), err=this.placeError(this.tool,gp.x,gp.y); bb.classList.remove('hidden'); cb.classList.remove('hidden'); ub.classList.add('hidden'); sb.classList.add('hidden');
      bb.classList.toggle('off',!!err); bb.innerHTML = err ? `<span class="why">${err}</span>` : `Build <b>${C.build[this.tool].name}</b>`; }
    else { bb.classList.add('hidden'); cb.classList.add('hidden'); const t=this.upgradeTarget();
      if(t){ const cost=C.build[t.type].cost(t.level+1); ub.classList.remove('hidden'); ub.classList.toggle('off',this.bananas<cost); ub.innerHTML=`Upgrade <b>${C.build[t.type].name}</b> · ${cost}`; } else ub.classList.add('hidden');
      const st=this.sellTarget(); if(st){ sb.classList.remove('hidden'); sb.innerHTML=`Sell · +${this.sellValue(st)}`; } else sb.classList.add('hidden'); } }
  banner(k,n){ const b=document.getElementById('banner'); b.innerHTML=`<span class="wb-k">${k}</span>`+(n?`<span class="wb-s">${n}</span>`:''); b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); }
  toast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(this._tt); this._tt=setTimeout(()=>t.classList.remove('show'),1900); }

  loop(now){ let dt=(now-this.last)/1000; this.last=now; if(dt>0.033) dt=0.033;
    if(this.phase==='play'||this.phase==='truck') this.update(dt);
    const t=this.time, playing=this.phase!=='over'&&this.phase!=='menu';
    if(this.monkeys) this.render.syncMonkeys(this.monkeys);
    if(this.trainees) this.render.syncTrainees(this.trainees,t);
    this.render.syncNets(this.nets||[]); this.render.syncHero(this.hero,t);
    if(playing){ this.render.syncStructures(this.structures); this.render.syncWalls(this.wallBlocks);
      if(this.tool){ const gp=this.ghostPos(); this.render.setGhost(this.tool,gp.x,gp.y,this.canPlace(this.tool,gp.x,gp.y)); } else this.render.clearGhost(); }
    this.render.streamWorld(this.hero); this.render.updateFx(dt); this.render.followCam(this.hero,dt); this.render.draw();
    requestAnimationFrame(t2=>this.loop(t2));
  }
}
window.addEventListener('load',()=>{ window.game=new Game(); });
