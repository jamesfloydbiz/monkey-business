/* ============================================================
   MONKEY BUSINESS — config.js
   Open-world base-defense. You start with only the banana pile and
   a keeper on open ground; you BUILD the base out yourself — placing
   towers, a farm, and paid wall blocks wherever you like (no grid,
   no plots). Monkeys emerge from fixed, themed spawn points (jungle,
   mountains, zoo) and raid the pile; a wave-end truck carts the
   trapped ones home. 100 waves, progressive unlocks.
   Units: meters / seconds. Core (banana pile) at the origin.
   ============================================================ */
'use strict';

const CONFIG = {
  /* ---- world / streaming ---- */
  chunk: 46, viewChunks: 3, worldClamp: 460,

  core: {x:0, y:0},            // the banana pile — lose when it empties
  bananas: 30,
  startCoins: 55,

  hero: { speed:15, netRange:19, netRate:1.7, netSpeed:38, radius:1.4, buildReach:3.4 },

  /* ---- free placement ---- */
  snap: 5,                     // hidden grid the ghost snaps to (keeps walls tidy)
  coreClear: 9,                // keep-clear radius around the pile
  placeGap: 0.78,             // min spacing between footprints (× sum of radii)

  /* ---- build catalogue (towers + farm + wall). Placed for cost(1), upgraded for cost(lv+1). ---- */
  build: {
    net:     { name:'Net Tower',     accent:'net',  max:5, foot:2.6, cost:(lv)=>[8,14,24,40,62][lv-1],
               stat:(lv)=>({range:13+lv*2.4, rate:0.9+lv*0.4}), blurb:'Auto-nets the nearest raider.' },
    farm:    { name:'Banana Farm',   accent:'gold', max:5, foot:3.0, cost:(lv)=>[14,26,44,70,100][lv-1],
               stat:(lv)=>({eco:0.7+lv*0.7}), blurb:'Passive coin income.' },
    wall:    { name:'Wall',          accent:'wood', max:1, foot:3.2, cost:()=>4, wall:true,
               stat:()=>({}), blurb:'A solid block — wall in the pile. Leave gaps for gates.' },
    trainee: { name:'Trainee Keeper', accent:'lime', max:4, foot:2.6, cost:(lv)=>[16,30,52,82][lv-1],
               stat:(lv)=>({count:lv, range:14+lv*1.5, rate:1.0+lv*0.25, speed:9+lv}), blurb:'Roaming keepers who net on patrol.' },
    cage:    { name:'Cage Trap',     accent:'net',  max:4, foot:2.8, cost:(lv)=>[16,30,48,72][lv-1],
               stat:(lv)=>({r:3.5+lv*0.7, cd:Math.max(1.1,3.6-lv*0.7)}), blurb:'Snaps shut on monkeys crossing it.' },
    decoy:   { name:'Banana Decoy',  accent:'gold', max:3, foot:3.0, cost:(lv)=>[12,22,38][lv-1],
               stat:(lv)=>({pull:18+lv*8}), blurb:'A fake pile — monkeys flee it empty-handed.' },
    mud:     { name:'Mud Patch',     accent:'mud',  max:3, foot:2.8, cost:(lv)=>[12,20,32][lv-1],
               stat:(lv)=>({slow:0.55-lv*0.11, r:5+lv*1.1}), blurb:'Slows monkeys crossing it.' },
  },
  // the order tools appear in the tray
  toolOrder: ['net','wall','farm','trainee','cage','decoy','mud'],

  /* ---- fixed, themed spawn points (act-gated). Monkeys emerge here & head for the pile. ---- */
  regions: {
    jungle:    { ang: 2.356, ground:0x3f8a2e, name:'the jungle',    sx:-58, sy: 58 },
    mountains: { ang:-0.785, ground:0x939aa2, name:'the mountains', sx: 60, sy:-54 },
    zoo:       { ang: 0.0,   ground:0xc0a063, name:'the old zoo',   sx: 96, sy:  0 },
    savanna:   { ang: 3.142, ground:0xcab667, name:'the savanna',   sx:-92, sy:  0 },  // ambience only (no spawns)
  },
  acts: [
    { until:33,  frontiers:['jungle'] },
    { until:66,  frontiers:['jungle','mountains'] },
    { until:100, frontiers:['jungle','mountains','zoo'] },
  ],
  actFor(n){ for(const a of this.acts){ if(n<=a.until) return a; } return this.acts[this.acts.length-1]; },

  // the stream runs down the west; cross only at the bridge
  water: { x:-63, halfW:5, z0:-150, z1:150, bridgeHalf:8 },

  /* ---- progressive unlocks — start minimal, earn new tools by surviving waves ---- */
  startUnlocks: ['net','farm','wall'],
  unlockByWave: { 2:'trainee', 4:'cage', 6:'decoy', 8:'mud' },

  /* ---- monkey archetypes ---- */
  monkeys: {
    normal:  { speed:6.4,  nets:1, bounty:3,  grab:0.6,  r:1.3, hex:0x8a5a2e, name:'Monkey' },
    fast:    { speed:10.2, nets:1, bounty:4,  grab:0.35, r:1.1, hex:0xb5793a, name:'Quick' },
    alpha:   { speed:5.0,  nets:2, bounty:9,  grab:0.8,  r:2.0, hex:0x5a3a1e, name:'Alpha' },
    bold:    { speed:7.6,  nets:1, bounty:6,  grab:0.5,  r:1.3, hex:0x9a4a2a, name:'Bold', decoyProof:true },
    mandrill:{ speed:6.8,  nets:2, bounty:12, grab:0.6,  r:1.7, hex:0x6a4636, name:'Mandrill', zoo:true },
    gorilla: { speed:3.6,  nets:4, bounty:30, grab:1.1,  r:2.7, hex:0x2f2b2b, name:'Gorilla', decoyProof:true, climb:true, zoo:true },
    boss:    { speed:4.4,  nets:5, bounty:40, grab:1.0,  r:3.2, hex:0x3a2410, name:'Silverback', boss:true, zoo:true },
  },

  /* ---- 100 waves, boss every 10th ---- */
  totalWaves: 100,
  waveSpec(n){
    const boss = (n % 10 === 0);
    const count = Math.round(4 + n*2.3 + Math.pow(n,1.35)*0.5);
    const interval = Math.max(0.3, 1.6 - n*0.06);
    const frontiers = this.actFor(n).frontiers;
    const pool=[['normal', 1]];
    if(n>=3) pool.push(['fast',  0.4 + n*0.02]);
    if(n>=6) pool.push(['alpha', 0.2 + n*0.015]);
    if(n>=9) pool.push(['bold',  0.3 + n*0.02]);
    if(frontiers.includes('zoo')){ pool.push(['mandrill', 0.5]); pool.push(['gorilla', 0.25]); }
    return { count, interval, pool, frontiers, boss };
  },
};
