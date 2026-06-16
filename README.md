# Monkey Business

A bright, chunky **open-world zoo-breach defense + base builder** for the browser. A follow-cam
trails your roaming zookeeper across a streaming world. Your core is a **stealable banana pile**,
your weapon is a **net** (you trap, never harm), and at the end of each wave a **zoo truck** carts
the trapped monkeys home. **Claim the wild, build a walled base, survive 100 waves.**

> 3D, no build step. Three.js is vendored locally — just `<script>` tags and a `<canvas>`.

## Play

```bash
bun run serve        # → http://localhost:4173   (Monkey Business is the root game)
```

- **Roam** the zookeeper with `WASD` / arrows, or drag for a floating joystick — the camera follows.
- **Claim land** — stand on a glowing claim flag and pour coins in to annex that plot; the base grows
  with **walls** and new build pads in whatever direction you expand.
- **Build** — stand on a pad and your coins pour in until it builds/upgrades.
- **Auto-net** — you (and your towers and keepers) fire nets at the nearest monkey automatically.
- **Earn** — a **Banana Farm** drips passive coins, and every monkey the truck carts home pays a bounty.

## The loop

Monkeys pour out of the wilderness on every side, race to the **banana pile** at the world's heart,
grab a banana and flee back out. A banana that escapes is gone for good; a **carrier you trap** gets
its banana returned when the truck loads it. Lose all your bananas → game over.

**Build pads (the towers):**
- **Net Tower** — auto-fires nets at the nearest raider.
- **Trainee Keeper** — hires roaming keepers who patrol and net monkeys (more per level).
- **Banana Farm** — grows bananas into a steady passive coin income.
- **Banana Decoy** — a fake pile; monkeys grab it and flee empty-handed (bend the flow).
- **Cage Trap** — snaps shut on monkeys that wander across it.
- **Mud Patch** — slows monkeys crossing it, so more nets land.

Waves escalate across **100 levels**: faster monkeys, a 2-net **Alpha**, decoy-proof **Bold**
monkeys, a **Silverback boss every 10th wave**, and more open sides the deeper you go. You can't
personally cover everything — you win by claiming ground and building a base that covers itself.

## Structure

```
index.html · css/style.css        shell + bright zoo HUD/overlays
js/vendor/three.min.js            Three.js r128 (vendored)
js/util.js                        math/easing/RNG + tiny WebAudio SFX
js/config.js                      ALL tuning: world/chunks, plots, monkeys, 100-wave spec, pads
js/render.js                      the 3D scene: follow-cam, chunk streaming, plot tiles + walls,
                                  pile, monkeys, towers, keepers, truck, cartoon lighting
js/game.js                        sim + loop: roam, plot claiming, farm eco, trainees, monkeys,
                                  nets, towers, truck, economy, 100-wave flow
serve.mjs                         tiny static server (Bun)

crowd-control/                    archived earlier prototype (FLOW — crowd-safety tycoon)
```
