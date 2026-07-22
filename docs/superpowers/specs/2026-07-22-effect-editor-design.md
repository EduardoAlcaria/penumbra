# Effect editor (Layer 3) — design

Penumbra's own visual editor for authoring effect YAML: a layer stack, exposed
properties, keyframe tracks, templates, presets, and a live preview that drives
the real hardware.

Layers 1 and 2 already ship. Layer 1 gives every LED a coordinate on the fixed
320×200 effect canvas. Layer 2 rasterizes an effect's parametric layers onto that
canvas and samples each LED, and already resolves keyframe tracks
(`effect/spec/Track.java`). This spec covers the editor and the plumbing it
needs.

A painted-frame layer type is deliberately **not** part of this spec — see
[Out of scope](#out-of-scope).

## Background: what SignalRGB does

SignalRGB has no editor and no keyframes. Its effects are handwritten HTML/JS
that paint a 320×200 canvas at 60 fps; `<meta property=…>` tags in the `<head>`
declare user controls, and each becomes a JS global the script reads. What it
calls a preset (`savedStateA/B/C`, `AvailablePresets`, `currentPreset`) is a
named snapshot of property values — nothing more.

So Penumbra's parametric YAML layers are already past what SignalRGB has, and
keyframes are ground it never covered. Two things are worth taking from it: the
property type vocabulary, and presets-as-property-snapshots.

Findings are recorded in `2026-07-22-signalrgb-engine-decompiled.md`.

## Decisions

| Question | Decision |
|---|---|
| Spec scope | Features 1–4 here; painted layer gets its own spec |
| Where user effects live | The app config dir, path handed to the backend by Tauri |
| Templates vs presets | Both — they solve different problems |
| Live preview | A draft slot in the engine, driving the real fans |
| Editor layout | Three panels + a full-width timeline |
| Keyframe UX | Stopwatch toggle + auto-key while scrubbing |
| Exposed properties | Full editor: create, rename, remove, bind fields |

## Storage

`lib.rs` already spawns the Java engine. It gains one flag:
`-Dpenumbra.config-dir=<app_config_dir>`. A new `PenumbraPaths` component
resolves that system property, falling back to `${user.home}/.penumbra` when it
is absent — which is the case when the jar is run by hand in development.

```
<config-dir>/
  themes/             already exists, written by the Tauri side
  effects/*.yaml      user effects, writable
  presets.json        property snapshots, keyed by effect name
  active-effect.json  moves here
```

The four built-ins (`rainbow`, `static`, `breathing`, `side-to-side`) stay on the
classpath and are **read-only**. Editing one is always "save as", which produces
a user effect.

Moving `active-effect.json` under the config dir fixes a bug found while
designing this: the file is written relative to the process working directory,
which is `app/backend` under Maven but `app/backend/target` when the Tauri shell
spawns the jar — two different files, and `mvn clean` deletes the app's. The
one-time cost is that the currently saved active effect resets once. The H2
datasource URL has the same flaw and is deliberately left alone.

### Presets live outside the effect file

A preset is a named map of property values. They live in `presets.json`, not
inside the effect YAML, because built-ins are read-only: a preset stored in the
file would only work for user effects, or would silently fork a built-in the
first time you saved one. A separate file keyed by effect name treats both the
same.

## Effect format additions

Tracks already exist. Three renderer changes make the new property types
meaningful — without them the types would be declarable but inert:

- `axis` resolves `@prop` references, which is what gives `combobox` (x / y)
  something to drive.
- `Layer` gains `enabled` (boolean, default true), which gives `boolean`
  something to drive and lets the editor mute a layer.
- A `hue` property resolves to a fully saturated color at that hue, so a color
  field can be bound to a hue slider.

Property types in scope: `color`, `number`, `boolean`, `combobox`, `hue`.

`textfield` is **out**: no layer field consumes text, so it would be a declarable
type that does nothing. SignalRGB has it because it has text overlays.

Alpha in colors (`#RRGGBBAA`) is out. Accepting it and ignoring the alpha would
be a lie, and honouring it needs a compositing model — today every layer
overwrites whole pixels. That is its own change, not a field type.

## API

Effect routes move out of `DeviceRestController` into a new
`EffectRestController`. This is not tidying for its own sake: that controller
already carries HID, devices, components, layout and i18n, and this spec would
roughly double its effect routes. Splitting while working in it is cheaper than
splitting later.

Effects are sent as **JSON, not a YAML string**. The backend serializes to YAML
with the Jackson mapper it already has, so the browser needs no YAML library and
the format's owner stays the backend.

| Verb | Route | Body / notes |
|---|---|---|
| GET | `/api/effects` | now includes `source` (`builtin`\|`user`) and `presets` |
| GET | `/api/effects/{name}/yaml` | read-only, for the editor's generated-source view |
| POST | `/api/effects` | `{name, spec, overwrite?}` → validate, write, reload. 409 on collision |
| DELETE | `/api/effects/{name}` | user effects only; 403 on a built-in |
| POST | `/api/effect/draft` | `{spec, props, t?}` → set the draft slot |
| DELETE | `/api/effect/draft` | clear it; the saved effect resumes |
| PUT | `/api/effects/{name}/presets/{preset}` | body is the property map |
| DELETE | `/api/effects/{name}/presets/{preset}` | |
| GET | `/api/effect/canvas?w=&h=` | extended: a `w×h` grid, not just the 1-D strip |

### The draft slot

`EffectEngine` gains `draft` and `draftProps`, both volatile. `tick()` renders the
draft when one is set, otherwise the active effect. The draft is never persisted.

Two behaviours matter:

- **Expiry.** The draft clears itself after ~10 s without an update. If the
  editor window closes or the UI hangs, the lights return to the saved effect
  instead of being held hostage. The editor pushes a heartbeat while open.
- **Time override.** `POST /api/effect/draft` accepts an optional `t` (seconds).
  When set, the engine renders the draft at that fixed time instead of the wall
  clock. Auto-key requires this: to place a key at t=1.5 s the preview must be
  showing t=1.5 s.

## The editor

A new `Editor` item in the sidebar. Each card on the Effects screen also gets an
*edit* button that opens the editor with that effect loaded — which is also how
templates work: open a built-in, change it, save under a new name.

Opening `Editor` with nothing loaded shows an empty state offering **Create from
scratch** or **Start from a template** (any effect, built-in or user). A `New`
button in the header offers the same two paths at any time.

From scratch means: name `untitled`, canvas 320×200, no properties, no layers.
The layer stack is empty with a single large `+ add layer`, which is the only
thing clickable until the first layer exists. No guessed default layer.

Leaving the editor, pressing `New`, or loading another effect with unsaved
changes asks for confirmation. Editor state lives in the browser until `Save`,
so without that guard one sidebar click loses the work.

### Layout

Three panels with the timeline full-width beneath them.

```
┌──────────┬───────────────────────┬──────────────┐
│ layers   │ preview               │ properties   │
│          │  · fan board (live)   │  · layer     │
│ gradient │  · 320×200 canvas     │    fields    │
│ wipe     │    + fan rects        │  · effect    │
│ pulse    │                       │    props     │
│ + add    │                       │              │
├──────────┴───────────────────────┴──────────────┤
│ timeline    ◆────────◆──────────────◆           │
└─────────────────────────────────────────────────┘
```

**Left — layer stack.** Add (menu of `solid`, `sweep`, `rainbow`, `gradient`,
`pulse`, `wipe`), remove, reorder by dragging, select. Each row shows the type
and a one-line summary. Order is paint order, exactly as in the YAML.

**Centre — preview.** Two stacked views:

- The existing fan board in read-only mode (no dragging). Because the draft
  drives the engine, `/api/frame` already returns the draft, so this is the real
  hardware, in the real layout, through the real nearest sampling.
- The whole 320×200 canvas with each fan's rect drawn over it, so it is obvious
  what falls outside them. This is what the `w`/`h` extension to
  `/api/effect/canvas` is for.

**Right — properties.** Two sections: the selected layer's fields, each with a
stopwatch toggle and an `@` button to bind it to an exposed property; and the
effect's declared properties, with create / rename / remove and type, default,
min, max. The declared properties are what the Effects screen turns into
controls and what presets snapshot.

**Timeline.** A ruler in seconds, one row per animated field across *all* layers
rather than only the selected one, so the whole effect is visible at once. Keys
drag to move, delete to remove; selecting a key exposes its `ease`. Each track
has a `loop` toggle. The ruler runs to the latest key, minimum 4 s, adjustable.

Two playhead modes: **follow**, where the playhead tracks engine time and the
animation runs, and **scrub**, where the playhead is pinned and the engine is
frozen to it via the draft's `t`.

**Header.** Effect name, a `builtin`/`user` badge, `Save` / `Save as`, and the
preset bar — switch between snapshots, save the current values under a name,
delete one.

### Keyframes

Every animatable field carries a stopwatch toggle. Turning it on makes the
current value the first key and gives the field a track. From then on, moving the
playhead and changing the value creates a key at the playhead automatically.
Turning the stopwatch off drops the track and the field goes back to a constant.
This is the After Effects / Blender / Figma model.

Because `Track` hands key values back raw and `EffectRenderer` resolves them,
keying a field that is bound to `@speed` keeps working — the slider stays live
under the animation.

## Error handling

| Case | Behaviour |
|---|---|
| Invalid spec on save | 400 with the parser message, shown inline in the editor |
| Name already taken | 409, with an overwrite option |
| Overwrite or delete a built-in | 403 |
| Draft push fails | Editing continues; a "preview offline" chip appears. Nothing is lost — state is in the browser until save |
| Backend down | Same as above |

## Testing

Backend, with the JUnit setup already in the project:

- `PenumbraPaths` — property present, property absent.
- `EffectStore` — loads built-ins plus user effects from a temp dir; save; name
  collision; refuses to delete a built-in; reloads without a restart.
- `PresetStore` — round-trip; unknown effect.
- `EffectEngine` — the draft takes over; the draft expires; the time override
  freezes output.
- `EffectRenderer` — `axis` via `@prop`; `enabled: false` skips the layer; a hue
  property resolves to a color.
- `Track` — already covered by `TrackTest`.

The frontend has no test framework today and this spec does not introduce one.
Frontend coverage is a manual checklist, stated plainly rather than implied.

### End-to-end verification

1. Create from scratch, add `gradient` and `wipe`, expose `color1`, `color2` and
   `speed`, key `center` with three keys, save.
2. The effect appears on the Effects screen with its sliders; activating it
   lights the fans; restarting the backend keeps it.
3. Open the editor and kill the UI — the lights return to the saved effect within
   about 10 s.

## Out of scope

- **Painted-frame layer.** Its own spec, reusing this interpolator and timeline.
- **Alpha compositing.**
- **`textfield` properties.**
- **Undo/redo.** Called out rather than buried: an editor without undo gets
  annoying fast, and this is the most likely first follow-up. Better left out and
  named than bolted on badly.
