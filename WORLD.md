# Monkey Breach — World & Story Plan

The fantasy: you're the lone keeper of a banana stockpile in a clearing, and the wild keeps
sending monkeys for it. As the seasons turn, the threat comes from new directions — until the
old zoo itself bursts open. You answer by **claiming ground and walling in a real base**.

This doc is the canonical plan for the map + story. It is a *plan*, not yet all built.

## The three acts (escalating threat directions)

The 100 waves split into three acts. Each act opens a new **spawn frontier** (a direction
monkeys pour from) so the map threat literally grows outward, matching how the base grows.

### Act I — The Jungle  (waves 1–33)
- Monkeys emerge from the **jungle** to the SOUTH-WEST. Dense canopy, vines, the first raids.
- Only one frontier active. You learn the loop: claim, wall, farm, net, truck.
- Cast: Monkey, Quick, the first Alpha.

### Act II — The Mountains  (waves 34–66)
- The **mountains** to the NORTH-EAST wake up — a second frontier opens. Rockier, faster
  descents down switchback trails.
- Now two directions at once; you can't stand in both. Trainee Keepers + towers carry the off-side.
- Cast adds: Bold (decoy-proof), mountain-fast variants, bigger Alphas.

### Act III — The Zoo Breakout  (waves 67–100)
- The wild monkeys smash open the **old zoo** to the EAST. The captive heavyweights flood out —
  **gorillas, mandrills, the Silverback** — joining the jungle and mountain raiders. All frontiers hot.
- Cast adds: zoo species (see Idea Box), Silverback bosses every 10th wave, climbers that go over walls.
- This is the "defend from everything" finale the whole base was built for.

## Regions on the map

A ring of distinct biomes around the central clearing. You expand toward whichever you choose;
claiming toward a biome reveals more of it.

| Region | Direction | Look | Role |
|---|---|---|---|
| **Keeper's Base** | center | kept lawn, paved courtyard, walls, farm, the pile | your claimable home |
| **Jungle** | SW | dense flat-shaded trees, vines, ferns, mist | Act I frontier |
| **Mountains** | NE | grey scree, boulders, pines, elevation | Act II frontier |
| **The Old Zoo** | E | brick walls, rusted cages, a big gate | Act III frontier (gate bursts) |
| **Savanna/Plains** | S / W | open grass, acacia, the calmest ground | room to expand early |

## Terrain & trails (the texture pass)

- **Gentle height variation** — low hills/berms so the ground isn't a flat sheet (vertex-displaced
  ground or scattered low mounds). The base clearing stays flat for building.
- **Game trails** — dirt paths worn from each active spawn frontier toward the base. They read as
  "this is where they come from," and guide the eye (and the monkeys) inward.
- **A stream/creek** cutting across one side, with a plank bridge near the base — natural landmark.
- **Region-tinted ground & props** so you always know which biome you're walking into.

## Open issues this plan addresses
- ✅ Walls used to cross through plot centers (axis bug) — fixed; now a proper gated ring.
- ✅ Truck clipped the wall — walls now have a centered **gate**; the truck drives through it.
- ▢ Spawns are currently all-directions from wave 1 — re-gate them to the Act frontiers above.
- ▢ Ground is a flat plane — add terrain + trails.
- ▢ Biome props are uniform — split into jungle / mountain / zoo / savanna sets.

## Build order (proposed)
1. Re-gate spawns to Act frontiers (config: act → active directions).  *(small)*
2. Biome regions: tint ground + swap prop sets by region/direction.  *(medium)*
3. Trails from active frontiers to the base; a stream + bridge landmark.  *(medium)*
4. Terrain height (subtle) keeping the base flat.  *(medium)*
5. Zoo gate set piece + zoo species for Act III.  *(larger)*
6. Wall-climber + gorilla behaviors (from the Idea Box).  *(larger)*
