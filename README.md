# FLOW — Calm is a System

A serene, **black-and-gold** crowd-safety simulator for the browser. You are the calm
operator at the controls of an event. The crowd is rendered as **flowing light**; the
threat is a **density heatmap**. Your enemy isn't the people — it's **physics**.

The whole game is built on the real science: crowd disasters are caused by **density,
not panic**. People are crushed standing up, in dense near-static crowds — not by
stampedes. So you never harm anyone. You **guide, meter, and relieve**. Gold cells are
safe; deep-red cells are approaching the crush threshold. You lose if any cell holds in
the red too long.

> 3D, no build step. Three.js is vendored locally — just `<script>` tags and a `<canvas>`.

---

## Play

Serve over `http://` and open it:

```bash
bun run serve        # → http://localhost:4173
# or, from inside this folder:
python3 -m http.server 4173
```

- **Place tools** by selecting one from the dock and clicking the floor. Tools cost **Credits**.
- **Pause:** `Esc`. Tools also bind to keys `1`–`4`.

It's a **tycoon**: you earn Credits by clearing people safely, spend them on tools during an
event, and between events spend them in a **shop** on permanent upgrades (wider/second exit,
cheaper meters, faster crews, more reaction time). The run is a sequence of escalating events
that **starts small** (a few dozen people — learn the heatmap) and builds to a full headliner surge.

**Tools:** Barrier (shape flow), Meter (snaps to the entry — hold people outside),
PA: Calm / PA: Hurry (shift the crowd's urgency).

---

## The lesson (taught through mechanics, not text)

The first playable level — **"Concert Letting Out"** — teaches three real principles, and
each one *emerges from the simulation*:

1. **The fundamental diagram** — flow = density × speed. A pinch's throughput rises with
   density up to a critical point, then **collapses**. Cramming a jammed exit makes it
   worse; metering makes it better. (The pinch shows its live throughput; watch it fall as
   density climbs past ~4 p/m².)
2. **Faster-is-slower** — a **PA: Hurry** at a crowded pinch *lowers* throughput (impatient
   bodies clog the opening); **PA: Calm** clears it faster. The numbers move opposite to
   intuition.
3. **Upstream control** — you don't fix the pinch *at* the pinch. You place a **Metering
   Gate** at the **entry**, holding people safely outside before they ever mass. A gate
   placed at the jam itself does nothing — which is the whole point.

**Tools:** Barrier (shape flow), Metering Gate (a release line — meter the entry),
PA: Calm / PA: Hurry (shift the crowd's urgency).

---

## Status & roadmap

**Phase A — playable vertical slice (done):** the Concert level, the density heatmap, the
crowd sim, the CROWD SAFETY lose condition, the three tools, and all three principles —
verified end-to-end (no-action crushes; entry-metering survives; a mid-concourse gate
correctly does *not* save it).

Planned next:
- **Phase B** — pressure-wave propagation + the mastery beat (defuse a near-disaster purely
  by upstream metering, never touching the danger zone).
- **Phase C** — the tycoon/meta layer: reputation + capacity, between-event upgrades
  (widen concourse, add exits, sightlines, sensors), and the venue unlock tree.
- **Phase D** — the **City District** track (continuous counterflows, transit surges).

---

## How it works

The simulation is 2D on the ground plane (the view is a steep 3D operator's-eye camera).
- `js/grid.js` — the density grid (1m cells → persons/m²), the goal **routing field**
  (flood-fill), the **heatmap** colour ramp, and the dwell/lose tracking.
- `js/sim.js` — pedestrians (social-force-lite) + the **openings** that enforce the
  fundamental diagram (throughput) and faster-is-slower (the clog term); spatial-hashed.
- `js/config.js` — **all tuning**: densities, thresholds, the fundamental-diagram curve,
  tool costs, and the level script. Start here to rebalance.
- `js/render.js` — the 3D scene: near-black floor carrying the heatmap as a live texture,
  the crowd as one additive gold point cloud.
- `js/game.js` — orchestrator: arrivals → outside queue → metered admission, tool
  placement, HUD, and the win/lose watch.
- `js/util.js` — math/easing/RNG + a tiny WebAudio SFX kit (reused).

Built as a self-contained study — kept separate from everything else.
