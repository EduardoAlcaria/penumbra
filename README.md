# Penumbra

Local-only RGB control. No cloud, no login, no telemetry, no marketplace.
Detects your controller, **asks the hardware how many LEDs are on each channel**
(works out of the box like SignalRGB), runs effects, pushes colors over HID.

## Why it exists

SignalRGB works out of the box but is heavy (bundled Chromium, Ultralight, OCR,
FFmpeg) and cloud-tied. OpenRGB is light but makes you manually type how many
LEDs each channel has. Penumbra takes the good half of each: OpenRGB's direct
HID approach + SignalRGB's per-controller auto-detect protocol.

## Architecture

```
frontend (React + Tailwind 4 + shadcn theme)  ── REST ──►  backend (Spring Boot)
                                                              │
                                    ┌─────────────────────────┼───────────────────────┐
                                    ▼                         ▼                        ▼
                              DeviceManager             EffectEngine (60fps)      H2 (local db)
                              match VID/PID ──► DetectedDevice ──► HID out    ControllerProfile
                              auto-detect LEDs    (nollie framing)            ComponentProfile
```

- **ControllerProfile** — the "recipe" for a controller (VID/PID, channels,
  color order, and the auto-detect command). Extracted once from SignalRGB's
  device `.js` into pure data. No dependency on SignalRGB at runtime.
- **Auto-detect** — `DetectedDevice` opens the HID device and sends the profile's
  `autoDetectCmd` (Nollie: `FC 03`); the controller replies with LEDs per channel.
  The JSON stores *how to ask*; the hardware answers *how many*.
- **ComponentProfile** — LED layout of passive gear (fans/strips). 209 maps
  bundled from SignalRGB's `Components/*.json` (pure data). Signal not required.
- **EffectEngine** — 60fps loop; each effect maps (LED position, time) → color.

## Run (dev)

Backend (Java 21, needs internet once for Maven deps):
```
cd app/backend
./mvnw spring-boot:run          # binds 127.0.0.1:8787, seeds H2 on first boot
```

Frontend:
```
cd app/frontend
npm install
npm run dev                     # http://127.0.0.1:5173 (proxies /api to backend)
```

## Supported now

- Nollie 8 v2 / 16 v3 / 32 controllers (auto-detect + GRB render).
- Effects: static, rainbow wave, breathing.
- 209 passive-gear LED maps in the DB.

More controllers = one `ControllerProfile` row + (if a new wire format) one
branch in `DetectedDevice`.
