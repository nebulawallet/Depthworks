# Depthworks (working title)

A pixelated 2.5D factory game in the Factorio tradition. The endgame isn't a rocket. It's a conversation.
You build a transmitter, and something answers. It can only talk using the mechanisms it has
watched you use.

## Pillars

1. **Real 3D machines, read as pixel art.** Every entity is an actual 3D object made of moving parts
   (turrets, jointed arms, spindles, gears, drill heads). The scene is rendered at low resolution and
   scaled up, so you get crisp pixels with real depth, occlusion and shadow.
2. **Depth is a mechanic.** The world has layers. Hollow things (frames now; later housings,
   gantries, ducts) let you build *inside* them and *on top of* them. Excavation opens layers below the
   ground.
3. **Precision is earned through volume.** You can only build at finer depth and resolution by drawing
   on the engineering you already have running. Your factory is the tool that makes the next tool.
4. **Communication follows the same rule.** The aliens' vocabulary is limited to the mechanics you have
   transmitted. The more precisely you can build, the more precisely you can understand them.

## Two control sets

| Flat mode (default) | Depth mode (`Tab`) |
|---|---|
| Fixed isometric view, layer 0 only | Lower camera, orbit in 90° steps (`Q`/`E`) |
| Pan, zoom, place, rotate, remove | Choose the working layer (`Z`/`X`); layers above turn to ghosts |
| Classic belt and inserter logistics | Inserter pitch (`F`): level / lift / drop between layers |

The toggle is intentional friction. Flat mode is for throughput. Depth mode is for construction.

## Precision tiers

**Active engineering volume** = the summed volume of machines that did work in the last 8 seconds.
Idle or decorative builds don't count. A hollow frame with a working machine *inside* it counts
double, which rewards actually using depth.

| Tier | Need | Unlocks |
|---|---|---|
| 0 Coarse | 0 | layers 0–1, low-poly models |
| 1 Fitted | 15 | layer 2; layer −1 once Excavation is researched; finer models |
| 2 Toleranced | 45 | layer 3; layer −2 once Deep excavation is researched |
| 3 Resonant | 110 | layer 4, highest model resolution, the Resonance tech |

Research also checks precision: Excavation needs tier 1, Deep excavation tier 2, Resonance tier 3.
Tier-ups rebuild every model with more radial segments. Precision is something you can *see*.

## The signal

- A transmitter burns one resonance pack per pulse. Resonance packs need crystal (from layer −1)
  and abyssal alloy (from layer −2), so the conversation literally sits at the bottom of the world.
- A pulse carries a **sentence**: the transmitter hears every working machine within 5 tiles,
  nearest first. Glyphs include `flow` belts, `tunnel` undergrounds, `split` splitters,
  `rise` lifts, `swing` inserters, `bore` drills, `heat` furnaces, `make` assemblers, `think` labs,
  `keep` chests, `spark` generators and `shine` solar. There is also `hollow` for a frame with a
  working machine inside, and `above`/`below`/`abyss` for layers.
- The aliens speak using **only glyphs they've been taught**. Each scripted message ends with a
  request ("show us how you come apart" → `tunnel` + `split`). You answer by building those
  mechanisms next to the transmitter. Between exchanges, they send ambient messages.
- Translation **clarity** depends on precision tier, vocabulary size and pulse count. Old messages
  re-render as clarity improves, so you understand past messages better as your factory gets better.

## Look

The scene is rendered at one third of screen resolution with a grid-aligned 3/4 camera. The
camera is snapped to whole pixels; the leftover sub-pixel offset slides the canvas, so motion is
smooth without the shimmer you usually get from low-res rendering. Materials are toon-shaded with a
4-step ramp and baked contact shading. A post pass draws dark outlines at depth edges and light
highlights at creases (from a normal pass), then converts to sRGB. Zoom moves in whole pixels per
tile (6 to 40), so tiles stay crisp.

## Status (v3)

Built:
- **The engineer:** a character you walk with WASD. The camera follows them. They collide with
  machines, trees and rocks, get carried by belts, and can walk under hollow frames. Building and
  mining have reach limits (10 tiles, or 3 for ore).
- **Factorio controls:** E inventory, Q pipette, R rotate, Z drop, hold F to pick up, Ctrl+click to
  move items in or out of machines. Hold right-click to mine ore, trees, rocks and buildings, with a
  progress bar at the cursor and a pickaxe animation.
- **Inventory and crafting:** 80 real slots with stack sizes, and items that don't fit spill onto the
  ground. Opening a machine shows its typed slots (fuel, input, result, ingredients, packs, storage)
  next to your inventory. You drag stacks between them, right-drag for half, or shift+click to send across. Crafting is recursive (missing parts get crafted), with left / right / shift for 1 / 5 /
  all. The crafting queue sits in the corner and can be cancelled.
- **Burner start:** you land with 8 iron plates, a burner drill and a stone furnace. Burner drills
  and inserters (which can leech their own fuel), wood from trees, stone and coal from rocks, and
  wooden chests. Drills with nothing in front drop ore on the ground.
- **Power:** small and medium poles join into separate networks by wire reach, each with its own
  supply and demand. Wires and supply areas are visible, and machines outside an area show "not
  connected".
- **Logistics:** belts carry 4 items per tile with compression, side-loading and auto-curves, in 3
  speeds. Also underground belts, splitters and lifts. Dragging a belt over an existing one
  replaces it (fast-replace).
- **Progression:** about 25 machines, 21 technologies, 4 science pack tiers, and precision tiers
  that unlock layers −2 to 4.
- **The signal:** a 9-exchange alien conversation, answered by arranging working machines around
  the transmitter.

Co-op: peer to peer over WebRTC (PeerJS broker for the handshake), with 6-character invite codes and
nicknames. The host is authoritative. Friends send inputs and actions, which the host runs with the same
rules (through an `actor` binding, so every rule knows whose inventory and position to use). The host streams
world changes as they happen, plus snapshots of changed machines at about 7 Hz and a full correction every 3 s.
Friends simulate locally between snapshots so belts and arms move smoothly.

Later additions (see HANDOFF.md): water and steam power, pipes and oil refining, vehicles built from engines and
frames, roads, rails, ports and depots with routes, separate factories in one world, and fish.

Not yet built: enemies and turrets, two-lane belts, blueprints and copy-paste, a larger or infinite map, music,
rotational precision, and richer alien grammar.

## Open questions

- Should the conversation branch, depending on *which* machines you used to answer?
- Should precision depth go much further: sub-cell placement, voxel-scale machines?
- Engine: stay on the web (Three.js) or move to Godot once the core loop is proven?
