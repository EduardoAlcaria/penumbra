# Penumbra

Local-only RGB lighting control for PC hardware. Penumbra detects your RGB
controller, asks the hardware how many LEDs are on each channel, and drives
effects over USB HID at 60 fps — all from a single native desktop app. No cloud,
no login, no account, no telemetry.

![Penumbra](docs/screenshot.png "Penumbra")

## Features

* Native desktop app (Tauri + WebView2) — not a browser tab, no bundled Chromium
* Automatic per-channel LED detection (asks the controller, no manual counts)
* Real-time effects at 60 fps: rainbow, static, breathing
* Live in-app light preview that mirrors what the hardware is doing
* Local HTTP/REST engine bound to `127.0.0.1` — nothing leaves your machine
* Reuses device profiles/protocols distilled from SignalRGB into plain data
* Warns you when a controller is detected but not yet safely drivable
* Runs standalone: the app boots its own engine and shuts it down on exit

## Supported Devices

Penumbra ships with profiles for the Nollie controller family. The 8-channel
**Nollie 8 v2** (`16D2:1F01`) is the reference, fully verified device.

| Controller    | VID:PID     | Status                          |
|---------------|-------------|---------------------------------|
| Nollie 8 v2   | `16D2:1F01` | Supported                       |
| Nollie 16 v3  | `3061:4716` | Detected, driving not yet impl. |
| Nollie 32     | `3061:4714` | Detected, driving not yet impl. |

Passive gear (fans/strips) LED layouts are bundled as data. Adding a new
controller is a matter of adding one `ControllerProfile` (VID/PID, channel
count, color order, auto-detect command, framing).

## Requirements

To build and run Penumbra from source you need:

* **JDK 21+** (Temurin/OpenJDK) — the lighting engine
* **Maven 3.9+** — builds the engine jar
* **Node.js 18+** and npm — the frontend
* **Rust (stable) + Cargo** — builds the desktop shell
* **WebView2 runtime** — ships with Windows 10/11; the desktop window uses it
* A supported OS: **Windows**, **Linux**, or **macOS** (HID access via hid4java)

At runtime the packaged app needs a **JDK 21+** on the machine (it launches the
engine jar with `java -jar`).

## Building

Clone the repo, then build each part.

**1. Lighting engine (jar):**

```
cd app/backend
mvn clean package -DskipTests
```

Produces `app/backend/target/penumbra-backend-0.1.0.jar`.

**2. Frontend dependencies:**

```
cd app/frontend
npm install
```

**3. Desktop app:**

```
cd app/frontend
npx tauri build
```

The build embeds the frontend and bundles the engine jar. To run the raw binary
instead of the installer, copy the jar next to the executable as
`penumbra-backend.jar`:

```
copy ..\backend\target\penumbra-backend-0.1.0.jar src-tauri\target\release\penumbra-backend.jar
```

Then launch `src-tauri/target/release/penumbra.exe`.

## Running (development)

Run the engine and the frontend separately with hot reload:

```
# terminal 1 — engine on http://127.0.0.1:8787
cd app/backend
mvn spring-boot:run

# terminal 2 — Vite dev server on http://localhost:5173
cd app/frontend
npm run dev
```

Or run the full desktop shell in dev mode (boots the engine automatically):

```
cd app/frontend
npx tauri dev
```

## Architecture

```
Tauri desktop shell (Rust)
  │  spawns / kills
  ▼
Lighting engine (Spring Boot, 127.0.0.1:8787)
  │
  ├── DeviceManager     enumerate HID, match VID/PID -> ControllerProfile
  ├── DetectedDevice    auto-detect LEDs/channel, frame packets, HID out
  ├── EffectEngine      60 fps loop: (LED position, time) -> color
  └── H2 (local db)     ControllerProfile + ComponentProfile (bundled data)

React + Tailwind 4 + shadcn/ui  ── REST ──►  engine
```

* **ControllerProfile** — how to talk to a controller (VID/PID, channels, color
  order, auto-detect command, framing). Stored as data, extracted from SignalRGB
  device definitions. No dependency on SignalRGB at runtime.
* **DetectedDevice** — opens the HID device, sends the profile's auto-detect
  command (Nollie: `FC 03`), and the controller replies with LEDs per channel.
  Counts are clamped to the profile ceiling before rendering.
* **EffectEngine** — 60 fps render loop; each effect maps position and time to a
  color, written into the per-device buffer and flushed as HID reports.
* **Desktop shell** — a Tauri window (WebView2) that serves the React UI and
  supervises the engine process for the app's lifetime.

## Warning

Penumbra talks directly to hardware using reverse-engineered protocols. As with
any tool of this kind (see OpenRGB's own warning), there is inherent risk in
sending data to a device whose firmware is not fully documented. Penumbra clamps
LED counts and refuses to drive controllers whose framing could collide with a
command opcode, specifically to avoid pushing a controller into an unexpected
state. Even so, use it at your own risk.

## License

TBD.
