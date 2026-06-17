# Monkey Business — AI Ideas

Claude's running list of ways to deepen the game **without changing the core model** (roam a
keeper, freely place/upgrade paid towers + walls, defend the pile, claim territory, survive 100
waves). One line each. Promote to a task when one earns it. See also [IDEAS.md](IDEAS.md) (James's box).

## Adopted (now core)
- **Single banana economy** — bananas are money AND lives; spend to build, monkeys steal them, lose at zero. *(built)*
- **Logistics / supply lines** — farms only produce when chained to the pile by Supply Lines. *(built)*
- **Neutral monkey camps** — claimable points out in the world that expand territory + income. *(next)*

## Economy / tycoon depth
- **Territory income** — passive bananas scale with claimed-territory area, so expanding turf pays (openfront economy).
- **Wild banana groves** — tappable resource nodes out in the biomes you build toward for banana bursts.
- **Banana bank (meta)** — bank surplus bananas between runs for a permanent starting bonus next run.
- **Upkeep tension** — very large bases cost a small per-wave upkeep, pushing you to defend efficiently, not sprawl.

## Defense variety (same place-and-upgrade model)
- **Wall tiers** — upgrade a wall block to stone (tankier) or electric (stuns climbers crossing it).
- **Tower targeting modes** — tap a built tower to set first / strongest / closest priority.
- **Sell & move** — refund part of a structure's cost to re-shape the base as threats shift.
- **Hero abilities** — a cooldown net-blast (AoE trap) and a "rally" that briefly speeds nearby trainees.

## Monkeys (new pressure that respects walls/gates)
- **Tunnelers** — surface inside the walls occasionally, forcing interior defense.
- **Thieves** — grab two bananas and sprint, worth more bounty if caught.
- **Shielded** — need an extra net; reward focus-fire and cage placement.
- **Boss weak points** — net the silverback's hands to disarm it before it reaches the pile.

## Territory / openfront flavor
- **Neutral monkey camps** — claimable points out in the world that expand your territory (and income) when cleared.
- **Border pulse** — the territory edge flashes toward whichever frontier the next wave will hit (threat read).
- **Frontier banners** — show a countdown + arrow at the spawn that's about to go live.

## Progression / meta
- **Daily seed / score** — a fixed wave seed with a shareable "waves survived" score.
- *(rejected by James: between-wave shop, unlock tree — keep building/upgrading purely in-world.)*

## Aesthetic / art polish (DO LAST — James flagged grass/trees/rocks/characters as too basic)
- **Ground** — replace flat tinted tiles with a soft multi-tone gradient + scattered detail decals (dirt patches, pebbles, fallen leaves), gentle low-frequency height (berms) so it isn't a flat sheet.
- **Grass** — instanced grass blades / billboarded tufts that sway, denser near water, sparse on trails; subtle wind shimmer.
- **Trees** — varied species silhouettes (round, pine, palm, acacia), 2–3 size variants, slight sway, darker ambient-occluded undersides, fruit on jungle trees.
- **Rocks** — varied shapes with mossy tops, flat-shaded facets with a rim highlight; cluster them naturally instead of uniform scatter.
- **Characters** — rounder, smoother keeper + monkeys (more segments), simple idle/walk squash-stretch, blink/ear-twitch, expressive faces; distinct silhouettes per monkey type (alpha mane, gorilla bulk, mandrill colors).
- **Materials** — bump env-map intensity for soft sheen on metal/coins; add a faint toon rim-light shader pass; gentle ambient occlusion contact shadows under every object.
- **Water** — animated flowing stream (scrolling normal), foam at the banks, sparkle; lily pads.
- **Lighting/mood** — slow day→dusk color drift; warmer golden-hour key; bloom on the pile + claws.
- **Cohesion** — a tighter, art-directed palette (pick ~8 hues) so everything feels designed, not default-colored.

## Juice / feel (cheap, high-impact)
- **Banana magnet** — returned bananas fly to the pile with a satisfying chime and number popup.
- **Trap pop** — a squashy bounce + net-snap SFX + screen-shake on boss traps.
- **Build/upgrade poof** — dust ring + scale-bounce when a structure goes down or levels up.
- **Day/night drift** — slow lighting cycle; night waves run a touch faster for mood + modifier.

## QoL
- **Drag-to-build wall runs** — hold and drag to lay a line of wall in one gesture (still per-block paid).
- **Ghost reach line** — a faint line from keeper to ghost so placement direction is obvious.
- **Threat minimap** — a small corner map showing frontiers, your territory, and incoming waves.
