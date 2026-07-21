# Penumbra Effects System — End-to-End Design

**Date:** 2026-07-21
**Status:** Approved for planning (Layer 1 first)

## Context

Penumbra today drives every LED as a flat 1-D chain. The engine asks the active
effect `colorAt(pos, t)` where `pos` is `0..1` across a device's total LEDs, then
writes the result to the controller. Effects are three hard-coded Java classes
(`RainbowEffect`, `StaticEffect`, `BreathingEffect`) and the frontend picks from a
fixed list.

The user wants what SignalRGB offers: **spatial, file-based effects authored in an
in-app visual editor** — effects that understand *sides* (the left vs. right strip
of a fan), a canvas that shows the real fans, and a Render button that exports the
design to YAML the engine can run. The reference the user pointed to is SignalRGB's
`Side To Side.html`.

This document designs the whole system end to end. It is built in three layers,
each its own implementation plan. **Layer 1 (Device Layout) ships first** and is
independently testable; Layers 2 and 3 build on it.

## How SignalRGB does it (reference)

From `Side To Side.html` (SignalRGB effect file):

1. **Declarative properties.** `<meta property=...>` tags in the head declare the
   effect's editable controls: `color1`/`color2` (`type="color"`), `speed`
   (`type="number"`), `direction` (`type="combobox"`), `rainbow`
   (`type="boolean"`) — each with `label`, `tooltip`, `default`, `min`/`max`.
   This is where "is this effect's color customizable?" lives — it is data, not a
   code flag.
2. **A 2-D canvas.** `<canvas width="320" height="200">`. The script paints
   shapes on it every animation frame (the "side to side" motion is a rectangle
   sweeping across X from 320→0).
3. **Per-LED sampling.** Each physical LED has a world coordinate; SignalRGB reads
   the canvas pixel at that coordinate to get the LED's color. Left-column LEDs and
   right-column LEDs sample different X, so *sides emerge from position* — there is
   no hard-coded "left"/"right" region.

Penumbra copies this model, with one change: instead of arbitrary JS, effects are
**declarative YAML** produced by the editor (same format family as the themes, and
hand-editable — comments, clean nesting). Engine and editor render the *same*
canvas, so the editor is WYSIWYG. Parsed backend-side with `jackson-dataformat-yaml`
(maps YAML straight onto the effect records) and frontend-side with `js-yaml`.

## Architecture

Three layers plus the runtime flow that ties them together.

```
Editor (Layer 3)  ──Render──▶  effect.json  ──▶  Engine (Layer 2)
   paints a 2-D canvas                              rasterizes canvas per frame
   against a fan board                                     │ samples per LED
        ▲                                                  ▼
   fan board  ◀────────── Device Layout (Layer 1) ──────▶  LED → (x,y) world map
   (real fans placed on the grid, LEDs at world coordinates)
```

- **Layer 1 — Device Layout:** where each physical LED sits on a 2-D world grid,
  derived from which gear is on which controller channel.
- **Layer 2 — Effect format + engine:** the effect YAML schema and the engine that
  rasterizes it to a canvas and samples each LED's world coordinate.
- **Layer 3 — Editor:** the visual authoring UI that exports effect YAML.

### Runtime flow (end to end)

1. User assigns gear to channels (Layer 1) → engine holds an `LED index → (x,y)` map.
2. User picks/authors an effect in Penumbra's own editor (Layer 3) → `effect.yaml`
   in the effects dir.
3. User activates it → `POST /api/effect` with the file → engine loads the YAML.
4. Each ~16 ms tick: engine rasterizes the effect's layers onto an offscreen canvas
   for the current time, then for every LED samples the canvas at its world `(x,y)`,
   writes the color, latches the frame to the Nollie.

---

## Layer 1 — Device Layout (ships first)

**Goal:** give every physical LED a 2-D world coordinate, from a user-declared map
of *what gear is on each controller channel*. This is the foundation for spatial
effects and for the editor's real-hardware preview. It also fixes LED counts (a
CS120 is 22 LEDs, not the 126 fallback the engine guesses today).

The controller cannot report *which model* is on a channel (the Nollie OS 2.1
firmware does not even report counts reliably), so assignment is **manual** — the
same as SignalRGB, where the user adds each device by hand.

### Data model

New JPA entity, persisted in H2:

```
ChannelAssignment
  id
  controllerKey   // "16D5:2A08" — matches DeviceManager's device id
  channel         // 0-based channel index on the controller
  position        // order of this component in the channel's daisy chain (0,1,2…)
  componentId     // FK → ComponentProfile.id
```

A channel's chain = all `ChannelAssignment` rows for `(controllerKey, channel)`
ordered by `position`. `ComponentProfile` already stores everything needed:
`ledCount`, `width`, `height`, `ledCoordinatesJson` (per-LED `[x,y]` on a local
grid, e.g. CS120 is 11×7).

### Layout builder

Given the assignments, build the world map:

- **Within a channel chain:** place components left→right along X. Component *k*
  starts at `xOffset = Σ(width + GAP)` of the components before it. Each LED's world
  X = `xOffset + localX`, world Y = `localY` (from `ledCoordinatesJson`).
- **Across channels:** stack channels down the Y axis; channel *c* starts at
  `yOffset = c * (maxChannelHeight + GAP)`.
- **Flat-index mapping:** the engine addresses LEDs by a flat per-channel index. For
  each `(channel, chainPosition, localLedIndex)` compute the flat index the way
  `DetectedDevice` already packs channels, and record `flatIndex → (worldX, worldY)`.
- **Unassigned channels:** keep the current 126-fallback behavior and lay them out as
  a plain horizontal strip so nothing is invisible.

Output: `LedWorldMap` — `worldX[]`, `worldY[]` indexed by flat LED index, plus the
world bounds (for normalizing to the canvas in Layer 2) and the fan placements (for
the board in the frontend). Rebuilt on rescan and on any assignment change.

### API

- `GET /api/layout` → `{ bounds, fans: [{componentId, name, imageUrl, channel,
  position, originX, originY, width, height, leds: [{flatIndex, x, y}]}] }`.
- `GET /api/components` (exists) gains `id`, `width`, `height`, and
  `ledCoordinates` so the frontend can draw fan shapes.
- `PUT /api/layout/assignments` → body: list of `{channel, position, componentId}`
  for a controller; replaces that controller's assignments, rebuilds the map.

### LED count fix

An assigned channel's LED count = Σ component `ledCount` (real). Only unassigned
channels fall back to 126. This replaces the flat 126 guess for configured hardware.

### Frontend — the fan board (view-only)

A new **Layout** screen (or a panel on Devices): renders each fan as a small
top-view cell at its world origin, LEDs drawn at their `(x,y)`, lit live by the
current effect's colors (polled, or computed client-side from the active effect).
Above it: per-channel assignment rows (pick a component from the 209-item library,
add/remove/reorder in chain). This is the board Layer 3's editor is later built on —
**no painting yet**, just display + assignment.

### Layer 1 verification

- Assign 3× CS120 to Nollie channel 0 → `GET /api/layout` returns 3 fans side by
  side; each fan's LED coordinates match `JUMPEAK_CS120.json`; channel LED count is
  66, not 126.
- The Layout board shows three fans in a row, LEDs animating with the active effect.
- Left-column LEDs (localX 0) and right-column LEDs (localX 10) have distinct world
  X across all three fans.

---

## Layer 2 — Effect format + engine

**Goal:** replace the 1-D `colorAt(pos, t)` model with SignalRGB's canvas-sample
model, driven by declarative effect YAML.

### Effect YAML schema (v1)

```yaml
name: Side to Side
description: Colors sweep back and forth across the setup.
canvas: { width: 320, height: 200 }
properties:
  - { key: color1, label: Color 1, type: color, default: "#082EFF" }
  - { key: color2, label: Color 2, type: color, default: "#FF03AF" }
  - { key: speed,  label: Speed,  type: number, default: 15, min: 0, max: 100 }
layers:
  - { type: solid, color: "@color1" }
  - type: sweep
    axis: x
    color: "@color2"
    band: 0.3
    speed: "@speed"
    keyframes:
      - { t: 0, pos: 0 }
      - { t: 1, pos: 1 }
```

- **`properties`** — the editable controls (mirrors SignalRGB `meta property`).
  Drives the Effects-screen UI. An effect with no `color` property is simply not
  color-customizable — this *supersedes the current `customizableColor` frontend
  flag*, which Layer 2 removes in favor of reading `properties`.
- **`layers`** — drawn in order onto the canvas each frame. Layer types for v1:
  `solid`, `gradient` (2-stop, along an axis), `sweep` (a moving band along an
  axis — this is "side to side"), `radial` (from a center), `image` (a painted
  bitmap, how the editor stores freeform painting). `@key` references a property
  value; `keyframes` interpolate a layer's params over normalized looping time
  `t ∈ [0,1)` at a rate set by `speed`.
- Built-in effects (rainbow/static/breathing) are re-expressed as YAML so there is
  one code path.

### Engine

- `EffectEngine.tick()` changes from per-LED `colorAt` to: rasterize the active
  effect's layers onto an offscreen `float[w*h*3]` canvas for the current time, then
  for each device LED sample the canvas at the LED's world `(x,y)` (from Layer 1's
  `LedWorldMap`, normalized into canvas space), write, and latch.
- Sampling: nearest-pixel for v1 (bilinear later if it looks blocky).
- Effects with no layout map (no Layer 1 assignment) fall back to sampling along a
  1-D strip so unassigned setups still light.
- A small `EffectRenderer` interprets the YAML layer list; keep it isolated and unit
  tested (a 2×2 canvas with a known layer stack yields known pixels).

### Effects storage

Effect YAML files live in `app_config_dir/effects/*.yaml`, seeded with the
built-ins on first run — mirrors the existing themes dir mechanism in
`src-tauri/src/lib.rs` (`themes_dir`, `list_themes`, `BUILTIN_THEMES`). Add
`effects_dir`, `list_effects`, `open_effects_dir`. `POST /api/effect` accepts a
file name (loads + parses the YAML) as well as the current inline body for
back-compat.

### Layer 2 verification

- Load the built-in "Side to Side" YAML → the Nollie sweeps color across the fans;
  left fans change before right fans.
- Static/rainbow/breathing YAML match the old hard-coded versions.
- `EffectRenderer` unit test: known layer stack → known canvas pixels.

---

## Layer 3 — Editor

**Goal:** the visual authoring UI that produces effect YAML.

- **Fan board:** reuses Layer 1's board. A search bar picks a fan **model** from the
  library; a count selector places *N* of them side by side as the authoring canvas
  (this is a design surface — it need not equal the user's real hardware).
- **Templates:** start from an existing effect (loads its YAML to edit) or blank.
- **Tools:** select regions/parts of the board, paint colors, edit the property
  controls (colors, speed), and a keyframe timeline for animating layer params.
  Freeform painting is stored as an `image` layer; parametric edits map to the other
  layer types.
- **Render button:** serializes the board + layers + keyframes + properties to the
  effect YAML schema, writes it to the effects dir, and it appears in the Effects
  screen.
- **Interactive canvas (deferred from Layer 1):** fans get user-defined positions
  (drag), individual selection, and *linking* — where linking means defining the
  daisy-chain topology and order between fans (chain two fans = same chain, in the
  linked order; leaving a fan unlinked = a single "unifan"). This replaces Layer 1's
  auto side-by-side arrangement and per-channel count stepper with an explicit
  visual wiring editor. Needs persisted per-fan x/y + chain links in the data model.

### Layer 3 verification

- Pick CS120 × 3, paint the left column red and right column blue, Render → a new
  effect appears, runs on hardware, left strips red / right strips blue.
- Add a keyframe moving a sweep across X → Render → the hardware animates it.

---

## Data model & files summary

- **H2:** new `ChannelAssignment` entity (Layer 1).
- **`ComponentProfile`:** already carries `ledCoordinatesJson`, `width`, `height`,
  `ledCount` — no change beyond exposing them in `/api/components`.
- **Config dirs (Tauri):** `themes/` exists; add `effects/` with the same seed
  mechanism.
- **Effect files:** `app_config_dir/effects/*.json` (Layer 2/3).

## Build order

1. **Layer 1 — Device Layout.** Standalone; testable without touching effects.
2. **Layer 2 — Effect YAML + 2-D engine.** Needs Layer 1's world map.
3. **Layer 3 — Editor.** Needs Layers 1 and 2.

Each layer gets its own implementation plan via the writing-plans skill. This
document is the shared design; the first plan covers Layer 1 only.

## Deferred / non-goals (v1)

- Drag-to-arrange fans on the board — v1 auto-arranges side by side; dragging comes
  later.
- Rotation/scale of fans on the canvas — v1 uses each component's native grid.
- Bilinear canvas sampling, blend modes between layers — nearest-pixel, ordered draw
  for v1.
- Sharing/importing SignalRGB `.html` effects directly — Penumbra effects are YAML;
  interop is out of scope.
