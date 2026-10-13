# AGENTS.md

Instructions for coding agents (and people) working on Depthworks. Read [HANDOFF.md](HANDOFF.md) first for status.

## Run and test

- No build step, no package manager. Plain ES modules plus an import map in `index.html`.
  Three.js (`three@0.160.0`) and PeerJS (`peerjs@1.5.4`) load from jsDelivr at pinned versions; keep them pinned.
- Serve over HTTP (modules don't load from `file://`):
  ```bash
  python -m http.server 5173
  ```
- There is no automated test suite. Test in a browser through the console hooks on `window.depthworks`:
  `begin(fresh)`, `run(seconds, input)`, `give(item, n)`, `place(...)`, `doAction(op)`, `save()`, `load()`,
  `host(...)`, `join(...)`, plus the live `S`, `world` and `inv`.
- **Hidden or background tabs get no `requestAnimationFrame`.** Step the game with `depthworks.run(seconds)`,
  or render explicitly, instead of waiting for frames. A worker heartbeat in `main.js` keeps co-op ticking when
  frames stall.
- **Co-op test:** open two tabs. In tab A set a nickname, then Host co-op → New world, and read `depthworks.S.net.code`.
  In tab B use Join co-op with that code, then drive actions with `depthworks.doAction(...)` and compare `world` on both tabs.
- Clear test data afterwards: the keys are `depthworks.save.v3`, `depthworks.nick` and `depthworks.volume` in localStorage.

## Architecture

| File | Role |
|---|---|
| `src/data.js` | Pure data: items (stack sizes), entities, recipes, techs, tiers, the alien script |
| `src/state.js` | Shared mutable state `S`, `world` maps, `Inventory` class, players, `actor`, the event `bus`, world generation |
| `src/sim.js` | All game rules: belts, machines, power networks, research, precision, crafting, the engineer, building, slots |
| `src/net.js` | Co-op: `doAction`, hosting/joining, op broadcast, snapshots, chat |
| `src/save.js` | Save/load and the entity JSON format (shared with net sync) |
| `src/scene.js` | Rendering: camera, post pass, terrain, clutter, particles, entity meshes, picking, arrows, preview |
| `src/models.js` | Procedural models, toon materials, ghost/preview variants, engineer, inserter IK |
| `src/ui.js` | HUD and panels (HTML), drag and drop, chat, name tags, goals |
| `src/main.js` | Boot, title/lobby, input, game loop |
| `src/audio.js`, `src/signal.js`, `src/icons.js` | Sound, the alien conversation, pixel icons |

Modules talk through direct imports plus `bus` events (`placed`, `removed`, `remesh`, `ore`, `feat`, `research`,
`tier`, `pulse`, `signal`, `inv`, `players`, `chat`, …).

## Rules that keep things working

1. **World changes from input or UI go through `doAction(op)`** (`net.js`). Never mutate the world directly
   from `ui.js` or `main.js`. In solo and on the host, it applies at once. On a guest, it's sent to the host. Add new
   actions to `applyAction`.
2. **Game rules read the acting player through `actor`** (`state.js`), never `S.player`. `invGet`, `invAdd`,
   `invGive`, `invRoom`, `distTo` and the crafting queue all follow `actor`. Wrap host-side work for a guest in
   `asActor(p, fn)`. Use `notify(ev, …)` for feedback (toasts, floating text, pickup sounds) so it reaches the
   right player.
3. **Guests don't decide outcomes.** Anything authoritative (ore tiles vanishing, research completing, alien
   pulses and replies, crafting, mining results) is gated with `S.net.role === 'client'` / `isClient()`.
   Guests may simulate for smoothness, and the host's snapshots correct them.
4. **New entity state must save and sync.** If you add a field that changes at runtime, add it to `FIELDS`
   in `save.js`, or handle it in `entToJSON`/`applyEntJSON`/`entFromJSON`. Objects in `FIELDS` are shallow-copied.
   `Inventory` instances (chest `store`) go through `toList`/`loadList`.
5. **Inventories are slots.** Use `Inventory` methods (`count`, `add`, `remove`, `room`, `slotPut`, `slotTake`,
   `toList`, `loadAny`), not Map APIs. Machine slots come from `entSlots(e)`, and moving between any two
   slots is `moveItems(from, to, n)` / `shiftMove(from, entPos)`.
6. **Render layers:** layer 0 is the outlined, shadowed, raycastable world. Layer 1 is overlays: ghosts,
   previews, arrows, wires, sprites, brackets and supply areas, with no outlines and no picking. Put any new
   overlay on layer 1.
7. **Materials:** use `M(color, opts)` (cached toon material). Animated emissive parts need their own material
   instance (see `glowMat`). Static parts go through `st()` in `makeMesh` so they get merged and baked with AO.
8. **Coordinates:** cells are `(x, y, z)`, where `y` is the layer (−2..4) and the ground is layer 0. `DIRS[0]` is
   north (−z), and directions go clockwise. Models are built facing north and rotated by `-dir * π/2`.
9. **Pixel camera:** zoom is whole low-res pixels per tile (`ZOOMS` in `scene.js`). Don't introduce
   continuous camera zoom or yaw outside the existing tweens, or the image starts shimmering.

## Style

- Match the surrounding code: compact, plain JavaScript, no frameworks, no classes unless they earn it
  (`Inventory` does). Comments explain *why* or a non-obvious rule, not what a line does.
- Keep player-facing text short and plain.
- Commit messages: imperative subject, a body that explains the change, and the co-author line used in history.
