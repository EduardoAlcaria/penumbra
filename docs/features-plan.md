# Penumbra — features roadmap

Working plan for the desktop-app redesign. Decomposed into independent phases;
build **A first** (it holds everything else). Each phase is its own
spec → implementation cycle. Status: **A, B, C and D done.**

## Current state (done)

- Desktop app works: Tauri (Rust) window boots the Spring engine and kills it on
  exit. `penumbra.exe` + `penumbra-backend.jar` beside it.
- Single-screen UI: header, live light-strip preview (`--glow` tracks the active
  color), controllers list, effect panel (rainbow/static/breathing, color,
  speed), unsupported-controller warning dialog.
- shadcn/ui set up (Button, Card, Slider, Dialog) + `cn` util + `@` alias.
- Engine REST: `GET /api/status`, `/api/devices`, `/api/unsupported`,
  `POST /api/rescan`, `/api/effect`. CORS `*` (local-only, 127.0.0.1).
- Safety: LED count clamped to profile ceiling; framing guard refuses
  controllers whose packet header could hit a command opcode.

## Phase A — App shell (build first) — DONE

Turn the single view into a sidebar-driven multi-screen app.

- **Routing**: no router lib needed for ~4 screens. A `Shell` component holds
  `const [screen, setScreen] = useState<Screen>("effects")` and renders the
  active screen. Add react-router only if deep-linking is ever needed.
- **Sidebar** (`components/Sidebar.tsx`): nav items (Effects, Devices, Settings),
  active state, the live status dot, the Rescan button, app wordmark. Bottom:
  config gear -> Settings.
- **Screens** (`screens/`):
  - `EffectsScreen` — effect cards (rainbow/static/breathing + future ones) with
    a search box and the color/speed controls. Each effect = a card.
  - `DevicesScreen` — controller cards + search/filter (see Phase D for photos).
  - `SettingsScreen` — placeholder now; filled by Phase B/C.
- **Card system**: reuse shadcn `Card`; extract a `SearchBar` component shared by
  Effects and Devices screens.
- **Keep**: `LivePreview` (hero on Effects screen), unsupported dialog (global),
  the `--glow` ambient behind the shell.
- **Startup animation**: a splash overlay on first mount — wordmark + a light
  sweep that resolves into the shell (respect `prefers-reduced-motion`). Pure
  CSS/Framer-free; a keyframed overlay that fades out after ~1s or once the first
  `/api/status` succeeds.
- **Animations**: screen transitions (fade/slide), card hover, sidebar active
  indicator. Keep restrained.

Files: `App.tsx` -> thin; new `components/Shell.tsx`, `components/Sidebar.tsx`,
`components/SearchBar.tsx`, `screens/*.tsx`. No backend change.

## Phase B — Config (frontend + backend) — DONE

Shipped: `GET /api/i18n?lang=` (ResourceBundle `i18n/messages*.properties`, en
base + pt), `I18nProvider`/`useT` with localStorage persistence and boot retry,
autostart toggle (`tauri-plugin-autostart`), "Open config folder"
(`open_config_dir` command via `tauri-plugin-opener`, creates the dir first).
Settings screen is tabbed: General / System / About.

- **i18n (Java ResourceBundle)**: backend `messages_en.properties`,
  `messages_pt.properties`, ... under `resources/i18n/`. Endpoint
  `GET /api/i18n?lang=pt` returns key→string map from the `ResourceBundle` for
  that locale (fallback to system locale, then en). Frontend: a tiny `t(key)`
  hook that fetches the bundle once and caches; language selector in Settings
  persists choice (localStorage). Ceiling: flat key map, no pluralization yet.
- **Auto-startup toggle**: use `tauri-plugin-autostart` (writes the Windows
  Run key / equivalent). Settings toggle calls `enable()`/`disable()`.
- **Open file location**: `tauri-plugin-opener` (or shell reveal) to open the
  themes/config dir in the OS file manager.

## Phase C — YAML themes — DONE

Shipped: themes dir = app-config-dir/themes, seeded with ember.yaml +
aurora.yaml on first use (Rust `list_themes`/`open_themes_dir` commands, no fs
plugin). Format: flat `css-var: value` YAML subset parsed in `lib/themes.ts`;
picker in Settings > General; re-read on window focus; choice persists in
localStorage and restores at boot.

- **Theme dir**: `%APPDATA%/penumbra/themes/*.yaml` (created on first run).
- **Format**: YAML mapping token→value matching the CSS vars in `index.css`
  (`background`, `card`, `primary`, `--glow` default, fonts, radius).
- **Load/apply**: frontend reads the dir via Tauri fs plugin, parses with
  `js-yaml`, applies by setting CSS custom properties on `:root`. Theme picker in
  Settings; "Open themes folder" button (Phase B opener).
- **Watch (optional)**: re-read on focus, or a Tauri fs watcher for live edits.
- Ship 2–3 built-in themes as YAML so the format is self-documenting.

## Phase D — Rich devices — DONE

Shipped: `GET /api/components` (name/brand/type/ledCount/imageUrl from the 209
bundled profiles, SignalRGB asset URLs per the open-question answer); Devices
screen gained status chips (all/detected/unsupported) and a gear library grid
with photos, type filter chips, and the shared search box (capped at 60 cards).

- **Photos**: open question — source of controller/gear images. Options: (1)
  bundle a small set locally (offline, fits the no-cloud ethos), (2) reference
  SignalRGB asset URLs (online, against the ethos). Lean bundle-local. Component
  JSON already has an `imageUrl` field to map from.
- **Filters**: by brand / channel count / detected-vs-unsupported on the Devices
  screen, alongside the Phase A search box.

## Open questions to resolve before each phase

- A: exact screen list — is Settings one screen or tabbed sections?
      it is tabbed
- B: which languages first (pt + en)? persist language server-side or client-side?
    client side
- C: do themes cover only colors, or also layout/animation toggles?
    same way signal does
- D: bundle device images, or accept online asset URLs?
    get the ones from signal

## How to run while iterating

```
cd app/frontend && npx tauri dev      # boots engine + hot-reloads UI
```

Rebuild the shipped app after changes:

```
cd app/backend  && mvn clean package -DskipTests
cd app/frontend && npx tauri build --no-bundle
copy ..\backend\target\penumbra-backend-0.1.0.jar src-tauri\target\release\penumbra-backend.jar
```
