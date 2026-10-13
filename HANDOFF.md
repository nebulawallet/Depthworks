# Handoff

Where Depthworks stands, what has been checked, what hasn't, and what to do next.
Written for whoever picks this up next, person or agent. Read [AGENTS.md](AGENTS.md) for how the code
fits together and [DESIGN.md](DESIGN.md) for the game's intent.

## The game in one paragraph

A pixelated 2.5D factory game modelled closely on Factorio: you walk an engineer, mine by hand, craft,
automate with belts and inserters, power machines through pole networks, and research up a tech tree.
Two things are its own. First, **depth**: you build on stacked layers, up onto hollow frames and down into
two rock layers, and "precision" (machinery that is actually working) unlocks more of them. Second, the
endgame is not a rocket but **a conversation**: a transmitter sends the mechanisms working around it as
glyphs, and something answers using only the mechanisms it has heard.

## Status

| Area | State |
|---|---|
| Core loop (mine → smelt → craft → automate → research) | Done, played through in code-driven tests |
| Engineer, Factorio controls, reach, collision | Done |
| Inventories | Real slots (80 for the player, 16/32 for chests), drag and drop, typed machine slots |
| Logistics | Belts in 3 tiers (4 items per tile, compression, side-loading, curves), undergrounds, splitters, lifts |
| Power | Coal generators, solar, small/medium poles, separate networks. Steam chain (water pump → boilers → steam engines, Factorio's 1:20:40, load-based), high voltage power lines (21×21), transformer stations, hand-strung power and transformer cables, brownouts, flashing plugs on unpowered machines |
| Water | Ocean on the south/east edges, inland lakes, short rivers with a flow direction per tile (`world.flow`, for boats later). No walking or building on water except pumps |
| Map | Minimap, big map (M) with zoom/pan, markers, labelled areas, terrain/resources/production/power views |
| Interface | Three quickbars cycled with X, Hide UI (H), rebindable keys in the help window (F1) |
| Research | 21 techs, 4 science pack tiers, gated by precision for depth |
| Depth | Layers −2..4, hollow frames, ghosting, lazily painted underground floors |
| Alien conversation | 9 scripted exchanges plus ambient replies, glyph animations, clarity that grows |
| Look | Pixel-snapped camera, toon shading, outline post pass, ore piles, trees/rocks, particles |
| Sound | All synthesised (Web Audio), proximity machine loops, volume slider |
| Co-op | Peer-to-peer (PeerJS), invite codes, nicknames, chat, host-authoritative sync |
| Save | localStorage autosave every 30 s; old formats still load |
| Hosting | Repo is public. **GitHub Pages must be switched on by the owner** (Settings → Pages → Deploy from branch → `main` / root) |

## Verified, and how

Most checks used the `window.depthworks` console hooks plus screenshots in a headless-ish browser pane.

- **Single player:** hand mining, crafting (including auto-crafting missing parts), the burner start,
  the power network, belts/undergrounds/splitters/lifts, inserter pitch, research, transmitter first
  contact, and save/load round-trips.
- **Real mouse and keyboard:** clicking machines (object picking), inventory and crafting clicks, dragging a stack into a
  furnace slot, depth mode toggles, I/O arrows and hints.
- **Co-op, using two tabs on one machine:** host and join by code, building, mining and Ctrl+click transfer as a guest,
  chat, leaving and rejoining with the inventory restored, and drag/shift moves into a host's chest
  from a guest.

## Not verified (treat as risks)

- **Co-op across real networks.** All tests ran on one computer. NAT traversal relies on PeerJS's free
  STUN/TURN; a strict network may fail to connect, and PeerJS's public broker could be down.
- **Held input feel.** Holding WASD and holding right-click to mine were driven from code, not real held
  keys. The tuning (speed 6.5, acceleration) has not been judged by hand.
- **Late game.** Research costs, precision thresholds (15 / 45 / 110) and the full 9-step conversation
  have not been played end to end.
- **Big factories.** Not profiled. Each entity is its own Three.js group; `pickTarget` raycasts every
  entity on the layer, and the alt-arrow, audio and co-op snapshot loops scan every entity.
- **Sound mix.** Played without errors but never listened to for balance.

## Known rough edges

- In co-op, guests also simulate between host snapshots, so belts and machines can visibly "pop" when a
  correction lands (snapshots every 150 ms, a full one every 3 s).
- The building hand (`S.sel`, a reference into the inventory) and the drag cursor (a pending move
  between slots) are separate concepts. That's fine in play, but worth knowing before touching either.
- Furnace result slots show one slot per output type. A furnace that switched recipes can show two.
- Saves live only in the browser. There is no export or import, and clearing site data loses them.
- A harmless 404 for a CDN source map shows up in the console.

## Suggested next steps (in rough priority)

1. **Turn on GitHub Pages and test co-op with a friend on another network.** This is the biggest unknown.
2. **Performance pass:** build a 1000-plus entity factory and profile it. Likely wins are instancing belts and inserters,
   spatial lookup for picking, and limiting snapshot scans to changed entities (dirty flags).
3. **Two-lane belts.** This is the most visible Factorio difference left.
4. **Blueprints / copy-paste** and a **map view**.
5. **Enemies and turrets**, if the game should have pressure; it currently has none.
6. **Save export/import** (download/upload JSON) so worlds survive browser resets and can be shared.
7. **Fluids** (pumps, pipes, oil) if the tech tree is extended.
8. Richer alien grammar (glyph parameters carrying meaning) and music.

## How the owner likes to work

- They want it to play and feel like Factorio, with real systems behind it, not mock-ups.
- They are blunt about jank: smoothness, readability and polish matter as much as features.
- They want things pushed live (GitHub Pages) once done.
