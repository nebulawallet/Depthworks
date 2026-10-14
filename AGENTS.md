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
  `host(...)`, `join(...)`, `toggleModal(id)`, plus the live `S`, `world` and `inv`. `run` takes driving keys too:
  `run(2, { mx: 0, mz: 0, fx: 0, fz: 1 })` holds W while you sit in a vehicle. Modules can be reached with
  `await import('/src/transport.js')` and friends: same instances as the game.
- **Hidden or background tabs get no `requestAnimationFrame`.** Step the game with `depthworks.run(seconds)`,
  or render explicitly, instead of waiting for frames. A worker heartbeat in `main.js` keeps co-op ticking when
  frames stall.
- **Co-op test:** open two tabs. In tab A set a nickname, then Host co-op → New world, and read `depthworks.S.net.code`.
  In tab B use Join co-op with that code, then drive actions with `depthworks.doAction(...)` and compare `world` on both tabs.
- `begin(true, sandbox, slot, { size, seed, biomes, water, ores })` starts a generated world (see `newWorld`).
  `ensureChunks(x, z, r)` makes chunks without walking there.
- Clear test data afterwards: the keys are `depthworks.save.v3` (slot 1), `depthworks.save.v3.2` … `.5` (slots 2–5), `depthworks.saves` (the slot index),
  `depthworks.nick`, `depthworks.volume`, `depthworks.keys`, `depthworks.settings` and `depthworks.worldopts` in localStorage.

## Architecture

| File | Role |
|---|---|
| `src/data.js` | Pure data: items (stack sizes), entities, recipes, techs, tiers, tiles, fluids, voltages, quickbars, the alien script |
| `src/state.js` | Shared mutable state `S`, `world` maps, chunk storage (`chunkOf`, `tileAt`, `underOf`, `patchAt`), `EntMap`, `Inventory` class, players, `actor`, the event `bus`, the old fixed-map generators (worlds from before chunks), deposits, the day clock (`daylight`), quickbars |
| `src/worldgen.js` | Generated worlds: climate noise and biomes, water and rivers, ores per biome, trees, oil, weedy patches, made chunk by chunk from the seed; `newWorld`, the landing site, world edits |
| `src/terrain.js` | Drawing the ground chunk by chunk around the camera: progressive painting with LOD by zoom, clutter (ore piles, trees, flora, weeds), water surfaces, underground floors |
| `src/multi.js` | Buildings over several tiles (greenhouse rooms, dams): footprints, joining touching ones, splitting, walls and doors |
| `src/farm.js` | Weedy patches and the shovel, greenhouses, water shared over irrigation |
| `src/plants.js` | Dams, uranium reactors and coolant towers, repairs |
| `src/body.js` | Biome hazards and exposure, medical lab research, `playerMods` (everything that changes the engineer's numbers) |
| `src/copypaste.js` | The clipboard: copying and pasting settings between buildings, belt lines, routes and stops |
| `src/sim.js` | All game rules: machines and their augments (`machineStats`), drills and deposit layers, lamps, power networks and voltages, cables, research, precision, crafting (free in sandbox), the engineer, health and stamina, building (and auto-craft on place), slots, map marks, factory reassignment |
| `src/belts.js` | Belts: lanes (2, or 3 on bus belts), lines (runs of tiles simulated as one), the nodes where lines end (splitters, bus channels, side-loads, other belts), line settings, networks |
| `src/fluids.js` | Fluid networks: fluid boxes per entity, pipes, underground pipes, pumps, valves, tanks, machine ports, throughput, the steam chain |
| `src/transport.js` | Roads (tile layer), rails and signal blocks, vehicles and driving, A* over road/rail/water tiles, the shared path follower, depots, routes and schedules |
| `src/fish.js` | Water bodies, fish and their populations, fishing nets on boats |
| `src/logistics.js` | The logistics window (L): one route editor and map for rail, road and sea, plus the belt lines tab (line editor, map, network diagram) |
| `src/net.js` | Co-op: `doAction`, hosting/joining, op broadcast, snapshots, chat |
| `src/save.js` | Save slots, export/import files, the entity JSON format (shared with net sync), old-save migration |
| `src/scene.js` | Rendering: camera, post pass (outlines, night and the light buffer), terrain, clutter, particles, entity meshes, picking, arrows, preview |
| `src/models.js` | Procedural models, toon materials, ghost/preview variants, engineer, inserter IK |
| `src/ui.js` | HUD and panels (HTML), quickbars, vitals, the pause menu and settings, hide UI, key binding screen, drag and drop, chat, name tags, goals |
| `src/map.js` | Minimap and big map: chunk-cached drawing, view modes (terrain, resources, production, power), markers and areas |
| `src/input.js` | Key bindings: actions, defaults, rebinding (saved in localStorage); mouse combos like `Shift+Mouse0` |
| `src/main.js` | Boot, title screen (slots, load game, host/join), input, game loop (paused while the menu is open in solo) |
| `src/audio.js`, `src/signal.js`, `src/icons.js` | Sound, the alien conversation, pixel icons |

Modules talk through direct imports plus `bus` events (`placed`, `removed`, `remesh`, `ore`, `feat`, `research`,
`tier`, `pulse`, `signal`, `inv`, `players`, `chat`, `power`, `links`, `marks`, `openmap`, `roads`, `routes`,
`factories`, `vehicles`, `fluids`, `announce`, `orelayer`, `belts`, `gain`, …).

Keys go through `input.js`: check `is('action', e.code)` (or `isDown` for held keys), never a hard-coded code,
so players can rebind them. Add new actions to `ACTIONS`.

## Rules that keep things working

1. **World changes from input or UI go through `doAction(op)`** (`net.js`). Never mutate the world directly
   from `ui.js` or `main.js`. In solo and on the host, it applies at once. On a guest, it's sent to the host. Add new
   actions to `applyAction`.
2. **Game rules read the acting player through `actor`** (`state.js`), never `S.player`. `invGet`, `invAdd`,
   `invGive`, `invRoom`, `distTo` and the crafting queue all follow `actor`. Wrap host-side work for a guest in
   `asActor(p, fn)`. Use `notify(ev, …)` for feedback (toasts, floating text, pickup sounds) so it reaches the
   right player.
3. **Guests don't decide outcomes.** Anything authoritative (ore tiles vanishing, research completing, alien
   pulses and replies, crafting, mining results, vehicles moving, fish breeding) is gated with
   `S.net.role === 'client'` / `isClient()`.
   Guests may simulate for smoothness, and the host's snapshots correct them.
4. **New entity state must save and sync.** If you add a field that changes at runtime, add it to `FIELDS`
   in `save.js`, or handle it in `entToJSON`/`applyEntJSON`/`entFromJSON`. Objects in `FIELDS` are shallow-copied.
   `Inventory` instances (chest `store`) go through `toList`/`loadList`.
5. **Inventories are slots.** Use `Inventory` methods (`count`, `add`, `remove`, `room`, `slotPut`, `slotTake`,
   `toList`, `loadAny`), not Map APIs. Machine slots come from `entSlots(e)`, and moving between any two
   slots is `moveItems(from, to, n)` / `shiftMove(from, entPos)`.
6. **Render layers:** layer 0 is the outlined, shadowed, raycastable world. Layer 1 is world overlays with no
   outlines and no picking: ghosts, wires, water surfaces, pulse rings. Layer 2 (`UI_LAYER` in `models.js`) is
   interface drawn in the world: cursor brackets, build preview, arrows, grids, supply areas, power plugs, alt-mode
   icons. Hide UI (H) stops rendering layer 2 and hides every page element except the game view, so new HTML and
   new layer-2 overlays hide with it automatically. Put interface overlays on `UI_LAYER`.
7. **Materials:** use `M(color, opts)` (cached toon material). Animated emissive parts need their own material
   instance (see `glowMat`). Static parts go through `st()` in `makeMesh` so they get merged and baked with AO.
8. **Coordinates:** cells are `(x, y, z)`, where `y` is the layer (−2..4) and the ground is layer 0. `DIRS[0]` is
   north (−z), and directions go clockwise. Models are built facing north and rotated by `-dir * π/2`.
9. **Pixel camera:** zoom is whole low-res pixels per tile (`ZOOMS` in `scene.js`). Don't introduce
   continuous camera zoom or yaw outside the existing tweens, or the image starts shimmering.
10. **Water is a tile grid,** not entities: `world.tiles` (index into `TILES`) and `world.flow` (a `DIRS` index, or −1)
    on the surface. Use `isWater`, `tileAt` and `flowAt`. Liquid tiles block walking and building except for things
    marked `onWater`. If you change `generateWater`, bump `WATER_GEN` so older saves get their water redone.
11. **Power** is rebuilt from scratch whenever `world.powerDirty` is set: poles of one voltage join by wire reach,
    overlapping supply areas and hand-strung `world.links`. Engines, boilers and pumps only work as hard as what
    draws on them.
12. **Fluids** (`fluids.js`) are rebuilt from scratch whenever `world.fluidDirty` is set (placing, removing,
    rotating, changing a recipe or a depot's fuel). Every entity has fluid boxes (`boxesOf`): pipes carry whatever
    their line carries; buildings with `fluids` join neighbours on every side (and pipes only on `pipeSides`);
    machines with `ports` connect only at those sides, with fluids given by their recipe's `fin` / `fout`. A network
    is a pool: `draw` (limited by its throughput) and `push`. Amounts live in each entity's `fa` between rebuilds,
    so splits, joins and saves keep fluid. Never let two fluids join: `fluidConflict` refuses it at placement.
13. **Factories:** every non-`shared` entity has `fac`. Anything that links two entities (belts, inserters, drills,
    power, pipes, underground pairs) must check `sameFac(a, b)`. New buildings get the builder's factory through
    `place(..., fac)`; the guest sends `fac` with its place action.
14. **Transport:** roads are a tile map (`world.roads`), not entities; rails are entities. Trucks, boats and trains
    are units (`world.units`) with a tile `path` and a position `s` along it (`evalPath`); cars and tanks are free
    vehicles. Route logic (`plan`, `schedule`, `dockTick`) is shared by all three ways. The host moves every
    vehicle; guests only show the snapshots. Bump `world.wayVersion` when roads or rails change so paths get checked.
15. **Belts are lines** (`belts.js`). Items live on a line's lanes, not on tiles; a tile is `e.belt` with `line`/`off`.
    Use `dropOnBelt`, `takeFromBelt`, `putAt`, `segItems`, `clearSeg`, never a tile's own list. Anything that changes how
    tiles connect (placing, removing, rotating, splitter filters, bus channels, line augments) sets `world.beltDirty`.
    Line settings (`lcfg`) live on the line's first tile; augments sit on whichever tile holds them.
16. **Augments:** machines read speed, power, productivity and reach from `machineStats(e)` only. New producers get
    slots from `augSlots` (default 2 for `PRODUCER_KINDS`).
17. **Deposits** never disappear: `depleteOre` moves them down a `DEPOSIT` layer. Tune layers in `data.js`.
18. **Retired things** go in `RETIRED` (data.js) with what they give back; `save.js` takes them out of old saves.
19. **Day and night** come from the world clock: read `daylight()` (`state.js`), never a timer of your own. Anything
    that should glow at night gets a `light: { r, color, flicker }` on its entity (or a line in `GLOW` in data.js);
    the scene draws it into the light buffer. Don't add Three.js scene lights for it.
20. **Health is the host's.** Damage and respawn happen in `healthTick`/`hurt` (sim.js) on the host only; stamina is
    run by whoever moves the engineer.
21. **Placing through `placeOrCraft`** (sim.js), not `place`, for anything the player builds: it handles running out.
22. **Sandbox** is `S.sandbox`: check it where something should be free (crafting, the give action), not elsewhere.
23. **The world is chunks.** Never allocate anything world-sized (`GRID` can be 65536). Generated worlds (`world.gen`) are
    made from the seed; anything that changes generated things must go in `world.edits` too (`removeFeat`, `clearPatch`,
    ore and oil changes), or it comes back when the chunk is made again. Saves keep only `gen` and `edits`. Worlds from
    before chunks (`world.gen === null`, 96 tiles) keep their surface in the save. Underground deposits are made lazily:
    call `underOf(x, z)` before looking at layers −1 and −2. `GRID` is a live binding: read it, never cache it.
24. **Rendering only what is near.** `terrain.js` loads chunks around the camera and drops the rest; buildings get models
    only while their chunk is shown (`chunkShown`). Loops over all buildings for drawing should check distance first.
25. **Buildings over several tiles** (`multi` in data) have a `foot` and live in `world.ents` under their anchor, other
    tiles in `world.ents.occ`: `world.ents.get(key)` finds them from any tile. Remove and move them with `clearFoot`,
    `setFoot` and `rekey` (multi.js), never by deleting a tile key. Kinds that join or split need `KINDS` handlers.
    `tileMine` in data allows Ctrl-mining one tile. Roads are objects too: every tile of one drag shares `o`.
26. **Engineer numbers** (speed, reach, mining, crafting, health, stamina) come from `playerMods(p)`, `reachOf`,
    `maxHealth` and `maxStamina` (body.js), never straight from `PLAYER`, so hazards and medical upgrades apply.
27. **Copy and paste:** buildings plug into `copyBuilding` / `applyToBuilding` (copypaste.js); panels mark rows with
    `data-clip="kind:ref"` and register `CLIP_UI[kind]`. Apply only what fits the target and ignore the rest.
28. **Ingredient groups:** a recipe ingredient `'#seed'` takes any item of `GROUPS.seed`. Use `ingredientMatches`.

## Style

- Match the surrounding code: compact, plain JavaScript, no frameworks, no classes unless they earn it
  (`Inventory` does). Comments explain *why* or a non-obvious rule, not what a line does.
- Keep player-facing text short and plain.
- Commit messages: imperative subject, a body that explains the change, and the co-author line used in history.
