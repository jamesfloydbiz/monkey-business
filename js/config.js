/* ============================================================
   FLOW — config.js
   Crowd-safety tycoon. Units: METERS, SECONDS; density = persons/m².
   ONE currency: Credits. Earn by clearing people safely; spend on
   tools during an event and on permanent upgrades between events.
   ============================================================ */
'use strict';

const CONFIG = {
  worldW: 36, worldH: 52, cell: 1,

  // density thresholds (real crowd-safety figures, persons/m²)
  dSafe:2.0, dCrit:4.0, dDanger:5.0, dJam:7.0,
  dwellFail:4.0,         // base seconds a cell may stay >= dDanger before you lose

  v0:1.34, tau:0.5, rNeighbor:0.7, kRep:1.4, kWall:2.2, agentR:0.22,

  Js:1.3,
  fdGate(d){ const C=CONFIG; if(d<=C.dCrit) return d/C.dCrit; return Math.max(0.16, 1-0.55*(d-C.dCrit)/(C.dJam-C.dCrit)); },
  speedFactor(d){ return Math.max(0, 1-d/CONFIG.dJam); },
  clogK:0.85, widthMin:0.6,
  urgencyCalm:0.7, urgencyHurry:1.5, urgencyBase:1.0,

  // economy
  startCredits:70,       // wallet at the start of a run
  earnPerClear:0.6,      // credits per person safely cleared

  tools:{
    barrier:{ id:'barrier', name:'Barrier', cost:10, desc:'A rail. Shapes flow.' },
    gate:{ id:'gate', name:'Meter', cost:40, rate:3.5, width:8, desc:'Hold people at the entry. Drop it up top.' },
    pa:{ id:'pa', name:'PA', cost:15, radius:13, desc:'Calm or hurry a zone.' },
  },

  heat:[
    {d:0.0,h:42,s:65,l:3},{d:1.5,h:44,s:88,l:26},{d:3.0,h:40,s:92,l:42},
    {d:4.0,h:30,s:96,l:50},{d:5.0,h:12,s:99,l:50},{d:7.0,h:0,s:98,l:52},
  ],
};

/* ---- the run: escalating events at one venue (starts SMALL) ---- */
const EVENTS = [
  {name:'Doors · a small show', intro:'A few guests trickle out. Learn the room — gold is calm, deep red is a crush.', trickle:35, surge:35, surgeOver:13, duration:44},
  {name:'Friday night',         intro:'Bigger crowd. Meter the entry before they mass against the exit.',            trickle:90, surge:230, surgeOver:13, duration:62},
  {name:'Sold out',             intro:'A real surge. Hold them outside and trickle them through safely.',            trickle:130, surge:520, surgeOver:14, duration:72},
  {name:'The headliner',        intro:'Everyone leaves at once. This is the whole job.',                             trickle:160, surge:780, surgeOver:15, duration:78},
];

/* ---- permanent upgrades (bought between events with Credits) ---- */
const UPGRADES = [
  {id:'cheap',  name:'Trained Stewards',   cost:40,  desc:'Metering gates cost 15 less.'},
  {id:'wider',  name:'Widen the Exit',     cost:60,  desc:'The exit is 1.6m wider — more flow.'},
  {id:'margin', name:'Early Sensors',      cost:50,  desc:'+2s before a crush fails — more reaction time.'},
  {id:'crews',  name:'Faster Crews',       cost:55,  desc:'Metering gates release +1.2 people/s.'},
  {id:'second', name:'Open a Second Exit', cost:130, desc:'A second doorway — roughly double the outflow.'},
];

/* ---- venue builder: geometry depends on purchased upgrades ---- */
function buildVenue(owned, ev){
  const exitW = 3.2 + (owned.has('wider')?1.6:0);
  const gaps = owned.has('second') ? [-7,7] : [0];
  const walls=[
    {x:0,y:-25,w:33,h:1.6},{x:0,y:25,w:33,h:1.6},
    {x:-15.8,y:0,w:1.6,h:52},{x:15.8,y:0,w:1.6,h:52},
  ];
  // divider across x[-15,15] at y=8, minus the exit gap(s)
  const sorted=gaps.slice().sort((a,b)=>a-b); let cursor=-15; const segs=[];
  for(const g of sorted){ const L=g-exitW/2, R=g+exitW/2; if(L>cursor) segs.push([cursor,L]); cursor=R; }
  if(cursor<15) segs.push([cursor,15]);
  for(const [a,b] of segs) walls.push({x:(a+b)/2, y:8, w:(b-a), h:1.6});
  return {
    id:'concert', name:ev.name, intro:ev.intro, walls,
    pinches: gaps.map(g=>({x:g, y:8, w:exitW})),
    goal:{x:0, y:18}, goalR:3.0,
    entry:{x:0, y:-23, w:26}, entryMeterY:-16,
    spawns:[ {t:0,count:ev.trickle,over:9}, {t:9,count:ev.surge,over:ev.surgeOver||13} ],
    duration: ev.duration||70,
  };
}
