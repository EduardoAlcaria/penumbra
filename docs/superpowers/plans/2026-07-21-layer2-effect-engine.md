# Layer 2 — Effect Format + 2-D Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 1-D `colorAt(pos,t)` effect model with SignalRGB's canvas-sample model driven by declarative YAML: the engine rasterizes an effect's layers onto a 2-D canvas each frame, and every LED samples the canvas at its world coordinate (from Layer 1's layout), so effects that address *sides* (left/right) work on the real hardware.

**Architecture:** A new `EffectSpec` record tree is parsed from YAML (`jackson-dataformat-yaml`). `EffectRenderer` rasterizes a spec's parametric layers (solid/sweep/rainbow/gradient/pulse) onto an `int[]` canvas for a given time + property values. `LayoutService` exposes a per-controller world map (flat LED index → normalized x,y). `EffectEngine` rewrites its tick to rasterize once per frame then sample per LED. `EffectStore` seeds built-in effect YAMLs and lists/loads them; REST endpoints list/activate effects and expose the current frame for the live board. The frontend lists YAML effects, renders their declared property controls, and tints the layout board from the live frame.

**Tech Stack:** Java 21, Spring Boot 3.3.4, Jackson + `jackson-dataformat-yaml`, JUnit 5. Frontend: React 18, Vite, TS. Maven via the IntelliJ-bundled binary.

## Global Constraints

- **Git rule (verbatim):** One file change = one commit = one push. Commit each changed file separately and push after each. No `Co-Authored-By` / "Generated with Claude" / "🤖". Plain messages. Pushes go to `main` (intended).
- **Effect format is YAML**, hand-editable, same family as themes. Backend parses with `jackson-dataformat-yaml`.
- **No keyframes in v1** — layers animate parametrically from `speed`. Keyframes are deferred to the Layer 3 editor. Note the deferral where relevant; do not build them.
- **Effects are backend-owned**, not Tauri-side: the Java engine seeds/lists/loads/runs them and the editor will use REST. This avoids a shared-dir problem with the Tauri config dir.
- **`controllerKey`** = `DetectedDevice.id()` = `"VID:PID"` uppercase hex.
- **World normalization:** an LED at world `(x,y)` maps to canvas via `nx=(x-minX)/(maxX-minX)`, `ny=(y-minY)/(maxY-minY)` from the controller's layout bounds; guard zero-span → `0.5`. LEDs with no layout entry (unassigned channels) fall back to `nx=i/(total-1)`, `ny=0.5`.
- **Color packing:** `0xRRGGBB` int throughout, matching `DetectedDevice.setLed` and `Effect.hsv`.
- Maven build/test from `app/backend`; frontend typecheck `npx tsc -b` from `app/frontend`.

---

### Task 1: Add the YAML parser dependency

**Files:**
- Modify: `app/backend/pom.xml`

**Interfaces:**
- Produces: `com.fasterxml.jackson.dataformat:jackson-dataformat-yaml` on the classpath so a `new ObjectMapper(new YAMLFactory())` can read effect YAML.

- [ ] **Step 1: Add the dependency**

In `pom.xml`, add inside `<dependencies>` (after the existing jackson/web starters, before the test starter):

```xml
        <dependency>
            <groupId>com.fasterxml.jackson.dataformat</groupId>
            <artifactId>jackson-dataformat-yaml</artifactId>
        </dependency>
```

(The version is managed by the Spring Boot parent — no explicit version.)

- [ ] **Step 2: Verify it resolves**

Run: `cd app/backend && "/c/Program Files/JetBrains/IntelliJ IDEA 2025.3.3/plugins/maven/lib/maven3/bin/mvn.cmd" -q -DskipTests compile`
Expected: build succeeds and the artifact downloads without error.

- [ ] **Step 3: Commit + push**

```bash
git add app/backend/pom.xml
git commit -m "build: add jackson-dataformat-yaml for effect parsing"
git push
```

---

### Task 2: Effect model records

**Files:**
- Create: `app/backend/src/main/java/com/penumbra/effect/spec/EffectSpec.java`

**Interfaces:**
- Produces (all in package `com.penumbra.effect.spec`):
  - `record EffectSpec(String name, String description, Canvas canvas, List<Property> properties, List<Layer> layers)`
  - `record Canvas(int width, int height)`
  - `record Property(String key, String label, String type, @JsonProperty("default") Object def, Double min, Double max, List<String> values)`
  - `record Layer(String type, String color, String color2, String axis, Double band, Double speed, Double spread, Double center)`
  - All must tolerate missing YAML fields (nulls) via `@JsonIgnoreProperties(ignoreUnknown = true)`.

- [ ] **Step 1: Write the records**

Create `EffectSpec.java`:

```java
package com.penumbra.effect.spec;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

/**
 * An effect parsed from YAML: editable properties + parametric layers painted
 * onto a 2-D canvas. Keyframes are intentionally absent in v1 (Layer 3 editor).
 * Records ignore unknown fields so the format can grow without breaking old files.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record EffectSpec(
        String name,
        String description,
        Canvas canvas,
        List<Property> properties,
        List<Layer> layers) {

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Canvas(int width, int height) { }

    /** A user-editable control. "default" is a YAML keyword-ish key, mapped explicitly. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Property(
            String key,
            String label,
            String type,
            @JsonProperty("default") Object def,
            Double min,
            Double max,
            List<String> values) { }

    /** One parametric paint op. Unused fields are null for a given type. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Layer(
            String type,
            String color,
            String color2,
            String axis,
            Double band,
            Double speed,
            Double spread,
            Double center) { }
}
```

- [ ] **Step 2: Compile**

Run: `cd app/backend && "/c/Program Files/JetBrains/IntelliJ IDEA 2025.3.3/plugins/maven/lib/maven3/bin/mvn.cmd" -q -DskipTests compile`
Expected: success.

- [ ] **Step 3: Commit + push**

```bash
git add app/backend/src/main/java/com/penumbra/effect/spec/EffectSpec.java
git commit -m "feat: effect spec records for YAML-defined effects"
git push
```

---

### Task 3: EffectRenderer (rasterize layers to a canvas) + unit test

The core logic: paint a spec's layers onto an `int[w*h]` canvas for a time and property values. Pure, deterministic, unit-tested (TDD).

**Files:**
- Create: `app/backend/src/main/java/com/penumbra/effect/EffectRenderer.java`
- Test: `app/backend/src/test/java/com/penumbra/effect/EffectRendererTest.java`

**Interfaces:**
- Consumes: `EffectSpec` (Task 2), `Effect.hsv` (existing static helper in `com.penumbra.effect.Effect`).
- Produces:
  - `int[] render(EffectSpec spec, Map<String,Object> props, long tMillis)` — returns a `width*height` array of `0xRRGGBB`, row-major.
  - `static int sample(int[] canvas, int w, int h, double nx, double ny)` — nearest-pixel sample at normalized `nx,ny ∈ [0,1]`.

**Layer semantics (v1):**
- `solid` — fill the whole canvas with `color`.
- `sweep` — over a base, a moving band of `color` of width `band` (fraction 0..1) travelling along `axis` (`"x"`/`"y"`); band center = `(t*speed) mod 1`. Pixels within the band get `color`; others unchanged (so a `solid` below shows through). This is "side to side".
- `rainbow` — hue = `axisPos*spread + t*speed`, full sat/val (`Effect.hsv`).
- `gradient` — lerp `color`→`color2` along `axis`.
- `pulse` — a modifier: multiply every pixel's brightness by `0.5*(1 - cos(t*speed*2π))` (breathing).
- Color strings: `"@key"` resolves to `props[key]` (falling back to the property's default is the caller's job — for the test, props carries concrete values); otherwise a `#RRGGBB` hex.

- [ ] **Step 1: Write the failing test**

Create `EffectRendererTest.java`:

```java
package com.penumbra.effect;

import com.penumbra.effect.spec.EffectSpec;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class EffectRendererTest {

    private final EffectRenderer renderer = new EffectRenderer();

    private static EffectSpec.Layer solid(String color) {
        return new EffectSpec.Layer("solid", color, null, null, null, null, null, null);
    }

    @Test
    void solidFillsEveryPixelWithHexColor() {
        EffectSpec spec = new EffectSpec("t", "", new EffectSpec.Canvas(4, 4),
                List.of(), List.of(solid("#00FF00")));
        int[] px = renderer.render(spec, Map.of(), 0L);
        assertEquals(16, px.length);
        for (int p : px) assertEquals(0x00FF00, p);
    }

    @Test
    void solidResolvesColorFromProperty() {
        EffectSpec spec = new EffectSpec("t", "", new EffectSpec.Canvas(2, 2),
                List.of(), List.of(solid("@c")));
        int[] px = renderer.render(spec, Map.of("c", "#0000FF"), 0L);
        for (int p : px) assertEquals(0x0000FF, p);
    }

    @Test
    void sweepPaintsOnlyTheBandLeavingTheBaseElsewhere() {
        // Base red, a blue vertical band of width 0.25 centered at x=0 (t=0,speed=0).
        EffectSpec.Layer sweep =
                new EffectSpec.Layer("sweep", "#0000FF", null, "x", 0.25, 0.0, null, null);
        EffectSpec spec = new EffectSpec("t", "", new EffectSpec.Canvas(8, 1),
                List.of(), List.of(solid("#FF0000"), sweep));
        int[] px = renderer.render(spec, Map.of(), 0L);
        assertEquals(0x0000FF, px[0]);           // leftmost inside the band
        assertEquals(0xFF0000, px[7]);           // far right is still the base
    }

    @Test
    void sampleReadsNearestPixel() {
        int[] canvas = { 0x111111, 0x222222, 0x333333, 0x444444 }; // 4x1
        assertEquals(0x111111, EffectRenderer.sample(canvas, 4, 1, 0.0, 0.5));
        assertEquals(0x444444, EffectRenderer.sample(canvas, 4, 1, 1.0, 0.5));
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd app/backend && "/c/Program Files/JetBrains/IntelliJ IDEA 2025.3.3/plugins/maven/lib/maven3/bin/mvn.cmd" -q -Dtest=EffectRendererTest test`
Expected: FAIL — `EffectRenderer` does not exist.

- [ ] **Step 3: Write the implementation**

Create `EffectRenderer.java`:

```java
package com.penumbra.effect;

import com.penumbra.effect.spec.EffectSpec;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * Rasterizes an EffectSpec's parametric layers onto a flat int[w*h] canvas of
 * 0xRRGGBB pixels for a given time and property values. No keyframes (v1); each
 * layer animates from its own speed. Mirror of the canvas SignalRGB effects paint.
 */
@Component
public class EffectRenderer {

    public int[] render(EffectSpec spec, Map<String, Object> props, long tMillis) {
        int w = Math.max(1, spec.canvas() == null ? 1 : spec.canvas().width());
        int h = Math.max(1, spec.canvas() == null ? 1 : spec.canvas().height());
        int[] px = new int[w * h];
        double t = tMillis / 1000.0;
        List<EffectSpec.Layer> layers = spec.layers() == null ? List.of() : spec.layers();
        for (EffectSpec.Layer layer : layers) drawLayer(px, w, h, layer, props, t);
        return px;
    }

    private void drawLayer(int[] px, int w, int h, EffectSpec.Layer l, Map<String, Object> props, double t) {
        String type = l.type() == null ? "solid" : l.type();
        boolean xAxis = !"y".equalsIgnoreCase(l.axis());
        double speed = l.speed() == null ? 0.0 : l.speed();
        switch (type) {
            case "solid" -> {
                int c = resolveColor(l.color(), props, 0xFFFFFF);
                for (int i = 0; i < px.length; i++) px[i] = c;
            }
            case "sweep" -> {
                int c = resolveColor(l.color(), props, 0xFFFFFF);
                double band = l.band() == null ? 0.2 : l.band();
                double center = (t * speed) % 1.0;
                for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
                    double pos = axisPos(x, y, w, h, xAxis);
                    if (wrappedDist(pos, center) <= band / 2) px[y * w + x] = c;
                }
            }
            case "rainbow" -> {
                double spread = l.spread() == null ? 1.0 : l.spread();
                for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
                    double pos = axisPos(x, y, w, h, xAxis);
                    px[y * w + x] = Effect.hsv(pos * spread + t * speed, 1.0, 1.0);
                }
            }
            case "gradient" -> {
                int a = resolveColor(l.color(), props, 0x000000);
                int b = resolveColor(l.color2(), props, 0xFFFFFF);
                for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
                    px[y * w + x] = lerp(a, b, axisPos(x, y, w, h, xAxis));
                }
            }
            case "pulse" -> {
                double br = 0.5 * (1 - Math.cos(t * speed * 2 * Math.PI));
                for (int i = 0; i < px.length; i++) px[i] = scale(px[i], br);
            }
            default -> { /* unknown layer type: ignore, keep canvas as-is */ }
        }
    }

    /** Normalized position along the chosen axis, 0..1. */
    private static double axisPos(int x, int y, int w, int h, boolean xAxis) {
        if (xAxis) return w == 1 ? 0.0 : x / (double) (w - 1);
        return h == 1 ? 0.0 : y / (double) (h - 1);
    }

    /** Shortest distance between two positions on a 0..1 wrap-around ring. */
    private static double wrappedDist(double a, double b) {
        double d = Math.abs(a - b) % 1.0;
        return Math.min(d, 1.0 - d);
    }

    public static int sample(int[] canvas, int w, int h, double nx, double ny) {
        int x = (int) Math.round(clamp01(nx) * (w - 1));
        int y = (int) Math.round(clamp01(ny) * (h - 1));
        return canvas[y * w + x];
    }

    private int resolveColor(String s, Map<String, Object> props, int fallback) {
        if (s == null) return fallback;
        String v = s;
        if (s.startsWith("@")) {
            Object p = props.get(s.substring(1));
            if (p == null) return fallback;
            v = String.valueOf(p);
        }
        try {
            return (int) Long.parseLong(v.replace("#", ""), 16) & 0xFFFFFF;
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    private static int lerp(int a, int b, double f) {
        int ar = (a >> 16) & 0xFF, ag = (a >> 8) & 0xFF, ab = a & 0xFF;
        int br = (b >> 16) & 0xFF, bg = (b >> 8) & 0xFF, bb = b & 0xFF;
        int r = (int) (ar + (br - ar) * f);
        int g = (int) (ag + (bg - ag) * f);
        int bl = (int) (ab + (bb - ab) * f);
        return (r << 16) | (g << 8) | bl;
    }

    private static int scale(int c, double f) {
        int r = (int) (((c >> 16) & 0xFF) * f);
        int g = (int) (((c >> 8) & 0xFF) * f);
        int b = (int) ((c & 0xFF) * f);
        return (r << 16) | (g << 8) | b;
    }

    private static double clamp01(double v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd app/backend && "/c/Program Files/JetBrains/IntelliJ IDEA 2025.3.3/plugins/maven/lib/maven3/bin/mvn.cmd" -q -Dtest=EffectRendererTest test`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit + push (each file separately)**

```bash
git add app/backend/src/main/java/com/penumbra/effect/EffectRenderer.java
git commit -m "feat: parametric effect renderer rasterizing layers to a canvas"
git push
git add app/backend/src/test/java/com/penumbra/effect/EffectRendererTest.java
git commit -m "test: effect renderer solid, sweep band, property color, sampling"
git push
```

---

### Task 4: World map on LayoutService

The engine needs, per controller, each flat LED index's normalized `(x,y)` on the canvas. Derive it from the existing `layoutFor` + bounds, and expose a version so the engine can cache.

**Files:**
- Modify: `app/backend/src/main/java/com/penumbra/layout/LayoutService.java`

**Interfaces:**
- Consumes: existing `layoutFor(controllerKey)` → `LayoutBuilder.Layout` (fans → leds `{flatIndex,x,y}`, bounds).
- Produces:
  - `Map<Integer, double[]> worldMapFor(String controllerKey)` — flatIndex → `{nx, ny}` in `[0,1]`. Empty map if no layout.
  - `int version()` — bumped whenever assignments change, so the engine knows to rebuild caches.

- [ ] **Step 1: Add a version counter bumped on assignment change**

In `LayoutService`, add the field and bump it in `setAssignments`:

```java
    private final java.util.concurrent.atomic.AtomicInteger version =
            new java.util.concurrent.atomic.AtomicInteger();

    public int version() { return version.get(); }
```

And at the end of `setAssignments(...)`, after the save loop, add:

```java
        version.incrementAndGet();
```

- [ ] **Step 2: Add worldMapFor**

Add this method to `LayoutService`:

```java
    /** Flat LED index → normalized (nx, ny) in [0,1] on the effect canvas. */
    public Map<Integer, double[]> worldMapFor(String controllerKey) {
        LayoutBuilder.Layout l = layoutFor(controllerKey);
        Map<Integer, double[]> map = new java.util.HashMap<>();
        if (l.fans().isEmpty()) return map;
        double spanX = l.maxX() - l.minX();
        double spanY = l.maxY() - l.minY();
        for (LayoutBuilder.FanPlacement fan : l.fans()) {
            for (LayoutBuilder.LedPoint p : fan.leds()) {
                double nx = spanX <= 0 ? 0.5 : (p.x() - l.minX()) / spanX;
                double ny = spanY <= 0 ? 0.5 : (p.y() - l.minY()) / spanY;
                map.put(p.flatIndex(), new double[] { nx, ny });
            }
        }
        return map;
    }
```

- [ ] **Step 3: Compile**

Run: `cd app/backend && "/c/Program Files/JetBrains/IntelliJ IDEA 2025.3.3/plugins/maven/lib/maven3/bin/mvn.cmd" -q -DskipTests compile`
Expected: success.

- [ ] **Step 4: Commit + push**

```bash
git add app/backend/src/main/java/com/penumbra/layout/LayoutService.java
git commit -m "feat: per-controller world map and version for the effect engine"
git push
```

---

### Task 5: EffectStore — seed built-in effect YAMLs, list + load

**Files:**
- Create: `app/backend/src/main/resources/effects/rainbow.yaml`
- Create: `app/backend/src/main/resources/effects/static.yaml`
- Create: `app/backend/src/main/resources/effects/breathing.yaml`
- Create: `app/backend/src/main/resources/effects/side-to-side.yaml`
- Create: `app/backend/src/main/java/com/penumbra/effect/EffectStore.java`

**Interfaces:**
- Consumes: `EffectSpec` (Task 2), the bundled resource YAMLs.
- Produces:
  - `List<EffectSpec> all()` — every built-in effect, parsed.
  - `EffectSpec byName(String name)` — one effect by its `name`, or null.
  - `EffectSpec parse(String yaml)` — parse an inline YAML string (used by activation).

- [ ] **Step 1: Write the four built-in YAMLs**

`rainbow.yaml`:
```yaml
name: rainbow
description: A rainbow wave travelling across the setup.
canvas: { width: 64, height: 8 }
properties:
  - { key: speed, label: Speed, type: number, default: 0.2, min: 0, max: 2 }
  - { key: spread, label: Spread, type: number, default: 1, min: 0.2, max: 4 }
layers:
  - { type: rainbow, axis: x, speed: "@speed", spread: "@spread" }
```

`static.yaml`:
```yaml
name: static
description: One solid color.
canvas: { width: 8, height: 8 }
properties:
  - { key: color, label: Color, type: color, default: "#009bde" }
layers:
  - { type: solid, color: "@color" }
```

`breathing.yaml`:
```yaml
name: breathing
description: One color fading in and out.
canvas: { width: 8, height: 8 }
properties:
  - { key: color, label: Color, type: color, default: "#009bde" }
  - { key: speed, label: Speed, type: number, default: 0.5, min: 0, max: 3 }
layers:
  - { type: solid, color: "@color" }
  - { type: pulse, speed: "@speed" }
```

`side-to-side.yaml`:
```yaml
name: side-to-side
description: A color band sweeps left to right across the setup.
canvas: { width: 64, height: 8 }
properties:
  - { key: base, label: Base color, type: color, default: "#082EFF" }
  - { key: band, label: Band color, type: color, default: "#FF03AF" }
  - { key: speed, label: Speed, type: number, default: 0.4, min: 0, max: 3 }
layers:
  - { type: solid, color: "@base" }
  - { type: sweep, axis: x, color: "@band", band: 0.3, speed: "@speed" }
```

- [ ] **Step 2: Write the store**

Create `EffectStore.java`:

```java
package com.penumbra.effect;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import com.penumbra.effect.spec.EffectSpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * Loads the built-in effect YAMLs bundled on the classpath. Effects are backend
 * data (not Tauri-side), so the engine and the future editor share them via REST.
 */
@Service
public class EffectStore {
    private static final Logger log = LoggerFactory.getLogger(EffectStore.class);

    private final ObjectMapper yaml = new ObjectMapper(new YAMLFactory());
    private final List<EffectSpec> effects = new ArrayList<>();

    public EffectStore() {
        load();
    }

    private void load() {
        try {
            Resource[] files = new PathMatchingResourcePatternResolver()
                    .getResources("classpath:effects/*.yaml");
            for (Resource r : files) {
                try (var in = r.getInputStream()) {
                    effects.add(yaml.readValue(in, EffectSpec.class));
                }
            }
            log.info("Loaded {} built-in effects", effects.size());
        } catch (Exception e) {
            log.error("Failed loading built-in effects", e);
        }
    }

    public List<EffectSpec> all() {
        return List.copyOf(effects);
    }

    public EffectSpec byName(String name) {
        return effects.stream().filter(e -> e.name().equalsIgnoreCase(name)).findFirst().orElse(null);
    }

    public EffectSpec parse(String yamlText) {
        try {
            return yaml.readValue(yamlText, EffectSpec.class);
        } catch (Exception e) {
            throw new IllegalArgumentException("Invalid effect YAML: " + e.getMessage(), e);
        }
    }
}
```

- [ ] **Step 3: Build and verify the effects load**

Run:
```bash
cd app/backend && "/c/Program Files/JetBrains/IntelliJ IDEA 2025.3.3/plugins/maven/lib/maven3/bin/mvn.cmd" -q -DskipTests package
taskkill //F //IM java.exe 2>/dev/null
java -jar target/penumbra-backend-0.1.0.jar >/tmp/eng.log 2>&1 &
sleep 20
grep "Loaded .* built-in effects" /tmp/eng.log
taskkill //F //IM java.exe 2>/dev/null
```
Expected: log line `Loaded 4 built-in effects`.

- [ ] **Step 4: Commit + push (each file separately)**

```bash
git add app/backend/src/main/resources/effects/rainbow.yaml
git commit -m "feat: built-in rainbow effect yaml"
git push
git add app/backend/src/main/resources/effects/static.yaml
git commit -m "feat: built-in static effect yaml"
git push
git add app/backend/src/main/resources/effects/breathing.yaml
git commit -m "feat: built-in breathing effect yaml"
git push
git add app/backend/src/main/resources/effects/side-to-side.yaml
git commit -m "feat: built-in side-to-side effect yaml"
git push
git add app/backend/src/main/java/com/penumbra/effect/EffectStore.java
git commit -m "feat: effect store loading built-in effect yamls"
git push
```

---

### Task 6: EffectEngine — rasterize per frame + sample per LED

Rewrite the engine's tick from 1-D `colorAt` to canvas rasterization + per-LED world sampling. Keep the safe fallback so unconfigured setups still light.

**Files:**
- Modify: `app/backend/src/main/java/com/penumbra/effect/EffectEngine.java`

**Interfaces:**
- Consumes: `EffectRenderer.render` + `EffectRenderer.sample` (Task 3), `EffectStore` (Task 5), `LayoutService.worldMapFor` + `version` (Task 4), `DeviceManager.devices()`, `DetectedDevice.{getTotalLeds,setLed,renderFrame,id}`.
- Produces:
  - `void setEffect(EffectSpec spec, Map<String,Object> props)` — set the active effect + property values.
  - `String activeName()` — unchanged contract (returns the active effect's name).
  - `int[] frameFor(String controllerKey)` — the last per-LED colors written for that controller (for the live board / `/api/frame`).

- [ ] **Step 1: Replace the engine body**

Replace the whole content of `EffectEngine.java` with:

```java
package com.penumbra.effect;

import com.penumbra.device.DetectedDevice;
import com.penumbra.device.DeviceManager;
import com.penumbra.effect.spec.EffectSpec;
import com.penumbra.layout.LayoutService;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * The render loop. ~60 fps: rasterize the active effect onto a 2-D canvas, then
 * for every LED of every device sample the canvas at that LED's world coordinate
 * (from the layout). LEDs with no layout entry fall back to a 1-D horizontal
 * slice so an unconfigured setup still lights.
 */
@Service
public class EffectEngine {

    private final DeviceManager deviceManager;
    private final EffectRenderer renderer;
    private final EffectStore store;
    private final LayoutService layout;
    private final long startMillis = System.currentTimeMillis();

    private volatile EffectSpec active;
    private volatile Map<String, Object> props = Map.of();

    /** Cached world maps per controller, rebuilt when the layout version changes. */
    private final Map<String, Map<Integer, double[]>> worldCache = new ConcurrentHashMap<>();
    private volatile int cachedVersion = -1;

    /** Last colors written per controller, for the live board. */
    private final Map<String, int[]> lastFrame = new ConcurrentHashMap<>();

    public EffectEngine(DeviceManager deviceManager, EffectRenderer renderer,
                        EffectStore store, LayoutService layout) {
        this.deviceManager = deviceManager;
        this.renderer = renderer;
        this.store = store;
        this.layout = layout;
        this.active = store.byName("rainbow"); // sensible default at boot
    }

    public void setEffect(EffectSpec spec, Map<String, Object> props) {
        if (spec != null) {
            this.active = spec;
            this.props = props == null ? Map.of() : props;
        }
    }

    public String activeName() {
        return active == null ? "none" : active.name();
    }

    public int[] frameFor(String controllerKey) {
        return lastFrame.getOrDefault(controllerKey, new int[0]);
    }

    // ponytail: fixed ~60fps; expose penumbra.render-fps as a real knob when it matters.
    @Scheduled(fixedRate = 16)
    void tick() {
        EffectSpec fx = active;
        if (fx == null) return;

        int version = layout.version();
        if (version != cachedVersion) {
            worldCache.clear();
            cachedVersion = version;
        }

        long t = System.currentTimeMillis() - startMillis;
        int w = fx.canvas() == null ? 1 : Math.max(1, fx.canvas().width());
        int h = fx.canvas() == null ? 1 : Math.max(1, fx.canvas().height());
        int[] canvas = renderer.render(fx, props, t);

        for (DetectedDevice device : deviceManager.devices()) {
            int total = device.getTotalLeds();
            if (total <= 0) continue;
            Map<Integer, double[]> map = worldCache.computeIfAbsent(
                    device.id(), layout::worldMapFor);
            int[] frame = new int[total];
            for (int i = 0; i < total; i++) {
                double[] xy = map.get(i);
                double nx = xy != null ? xy[0] : (total == 1 ? 0.0 : i / (double) (total - 1));
                double ny = xy != null ? xy[1] : 0.5;
                int rgb = EffectRenderer.sample(canvas, w, h, nx, ny);
                frame[i] = rgb;
                device.setLed(i, rgb);
            }
            lastFrame.put(device.id(), frame);
            device.renderFrame();
        }
    }
}
```

- [ ] **Step 2: Verify it compiles and boots (nothing else references the old Effect classes' constructors except the controller, fixed in Task 7)**

Run: `cd app/backend && "/c/Program Files/JetBrains/IntelliJ IDEA 2025.3.3/plugins/maven/lib/maven3/bin/mvn.cmd" -q -DskipTests compile`
Expected: **This will fail to compile** `DeviceRestController` (its `build(...)` still calls `engine.setEffect(Effect)`). That is expected — Task 7 updates the controller. If `EffectEngine.java` itself has errors, fix those; leave the controller error for Task 7.

- [ ] **Step 3: Commit + push**

```bash
git add app/backend/src/main/java/com/penumbra/effect/EffectEngine.java
git commit -m "feat: 2D canvas engine sampling each LED at its world coordinate"
git push
```

---

### Task 7: REST — list effects, activate by name/props, expose frame

Rewire the effect endpoints to the new engine and add effect listing + the live frame.

**Files:**
- Modify: `app/backend/src/main/java/com/penumbra/web/DeviceRestController.java`

**Interfaces:**
- Consumes: `EffectStore.all/byName/parse`, `EffectEngine.setEffect/activeName/frameFor`, `LayoutService.controllerKeys`, `EffectSpec`.
- Produces:
  - `GET /api/effects` → `[{name, description, properties:[{key,label,type,default,min,max,values}]}]`.
  - `POST /api/effect` — body `{ "name": "side-to-side", "props": {"speed":0.5, ...} }` (activate a built-in by name with property overrides) OR `{ "yaml": "...", "props": {...} }` (inline). Returns `{effect: name}`.
  - `GET /api/frame` → `{ controllers: [{controllerKey, colors:["#RRGGBB", ...]}] }` for the live board.

- [ ] **Step 1: Swap the EffectEngine dependency shape**

The controller already injects `EffectEngine engine`. Add `EffectStore` to the constructor (same pattern as the `mapper`/`layout` fields). Add the import `import com.penumbra.effect.spec.EffectSpec;` and `import com.penumbra.effect.EffectStore;`.

Add field + constructor param:
```java
    private final com.penumbra.effect.EffectStore effects;
```
(add `EffectStore effects` to the constructor signature and `this.effects = effects;`)

- [ ] **Step 2: Replace the effect endpoint + build() helper**

Replace the existing `setEffect(...)` method and its private `build(...)` and `parseHex(...)` helpers with:

```java
    @GetMapping("/effects")
    public List<Map<String, Object>> effects() {
        return effects.all().stream().map(DeviceRestController::effectDto).toList();
    }

    /** body: {"name":"side-to-side","props":{...}} or {"yaml":"...","props":{...}} */
    @PostMapping("/effect")
    public Map<String, Object> setEffect(@RequestBody Map<String, Object> body) {
        EffectSpec spec;
        Object yaml = body.get("yaml");
        if (yaml instanceof String s && !s.isBlank()) {
            spec = effects.parse(s);
        } else {
            spec = effects.byName(String.valueOf(body.get("name")));
        }
        @SuppressWarnings("unchecked")
        Map<String, Object> props = body.get("props") instanceof Map<?, ?> m
                ? (Map<String, Object>) m : Map.of();
        engine.setEffect(spec, props);
        return Map.of("effect", engine.activeName());
    }

    @GetMapping("/frame")
    public Map<String, Object> frame() {
        List<Map<String, Object>> controllers = new java.util.ArrayList<>();
        for (String key : layout.controllerKeys()) {
            int[] colors = engine.frameFor(key);
            List<String> hex = new java.util.ArrayList<>(colors.length);
            for (int c : colors) hex.add(String.format("#%06X", c & 0xFFFFFF));
            controllers.add(Map.of("controllerKey", key, "colors", hex));
        }
        return Map.of("controllers", controllers);
    }

    private static Map<String, Object> effectDto(EffectSpec e) {
        List<Map<String, Object>> props = (e.properties() == null ? List.<EffectSpec.Property>of() : e.properties())
                .stream().map(p -> {
                    Map<String, Object> m = new java.util.LinkedHashMap<>();
                    m.put("key", p.key());
                    m.put("label", p.label());
                    m.put("type", p.type());
                    m.put("default", p.def());
                    m.put("min", p.min());
                    m.put("max", p.max());
                    m.put("values", p.values());
                    return m;
                }).toList();
        return Map.of(
                "name", e.name(),
                "description", e.description() == null ? "" : e.description(),
                "properties", props);
    }
```

Also delete the now-unused `EffectRequest` record and the `import com.penumbra.effect.*;` can stay (still used for nothing else — leave it). If the compiler flags `EffectRequest` as referenced elsewhere, it is not.

- [ ] **Step 3: Rebuild + verify effects run end to end**

Run:
```bash
cd app/backend && "/c/Program Files/JetBrains/IntelliJ IDEA 2025.3.3/plugins/maven/lib/maven3/bin/mvn.cmd" -q -DskipTests package
taskkill //F //IM java.exe 2>/dev/null
java -jar target/penumbra-backend-0.1.0.jar >/tmp/eng.log 2>&1 &
sleep 20
echo "--- effects list ---"; curl -s http://127.0.0.1:8787/api/effects | python -c "import sys,json;print([e['name'] for e in json.load(sys.stdin)])"
echo "--- activate side-to-side ---"; curl -s -X POST http://127.0.0.1:8787/api/effect -H "Content-Type: application/json" -d '{"name":"side-to-side","props":{"speed":0.6}}'
echo; echo "--- frame has colors ---"; curl -s http://127.0.0.1:8787/api/frame | python -c "import sys,json;d=json.load(sys.stdin);c=d['controllers'];print('controllers',len(c),'first colors', (c[0]['colors'][:3] if c else 'none'))"
taskkill //F //IM java.exe 2>/dev/null
```
Expected: effects list `['breathing','rainbow','side-to-side','static']` (order may vary), activation returns `{"effect":"side-to-side"}`, and the frame shows a controller with hex colors (assuming the Nollie is attached). Watch the physical hardware sweep colors.

- [ ] **Step 4: Commit + push**

```bash
git add app/backend/src/main/java/com/penumbra/web/DeviceRestController.java
git commit -m "feat: effect listing, YAML/name activation, and live frame endpoint"
git push
```

---

### Task 8: Frontend API client — effects, activation, frame

**Files:**
- Modify: `app/frontend/src/lib/api.ts`

**Interfaces:**
- Produces: `EffectProperty`, `EffectInfo`, `Frame` types; `api.effects()`, `api.setEffect(body)`, `api.frame()`. The old `setEffect(EffectRequest)` is replaced.

- [ ] **Step 1: Replace the effect types and methods**

In `api.ts`, replace the `EffectRequest` interface with:

```ts
export interface EffectProperty {
  key: string;
  label: string;
  type: "color" | "number" | "boolean" | "combobox" | string;
  default: unknown;
  min: number | null;
  max: number | null;
  values: string[] | null;
}
export interface EffectInfo {
  name: string;
  description: string;
  properties: EffectProperty[];
}
export interface ControllerFrame {
  controllerKey: string;
  colors: string[];
}
```

Replace the `setEffect` entry in the `api` object and add the new ones:

```ts
  effects: () => fetch(`${BASE}/api/effects`).then(json<EffectInfo[]>),
  setEffect: (body: { name?: string; yaml?: string; props?: Record<string, unknown> }) =>
    fetch(`${BASE}/api/effect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(json<{ effect: string }>),
  frame: () =>
    fetch(`${BASE}/api/frame`).then(json<{ controllers: ControllerFrame[] }>),
```

- [ ] **Step 2: Typecheck (will surface EffectsScreen/Shell breakage, fixed in Task 9)**

Run: `cd app/frontend && npx tsc -b`
Expected: errors in `Shell.tsx`/`EffectsScreen.tsx` referencing the removed `EffectRequest` — expected; Task 9 fixes them. `api.ts` itself must be error-free.

- [ ] **Step 3: Commit + push**

```bash
git add app/frontend/src/lib/api.ts
git commit -m "feat: frontend effects list, activation, and frame API"
git push
```

---

### Task 9: EffectsScreen — list YAML effects with their declared controls

Rebuild the Effects screen to list the backend effects and render each effect's declared properties as controls, sending values on change. This replaces the hard-coded three-effect list and the `customizableColor` flag (properties drive the UI now).

**Files:**
- Rewrite: `app/frontend/src/screens/EffectsScreen.tsx`
- Modify: `app/frontend/src/components/Shell.tsx` (the effect state + `apply` wiring)

**Interfaces:**
- Consumes: `api.effects()`, `api.setEffect()`, `EffectInfo`, `EffectProperty`.
- Produces: an `EffectsScreen` that holds the selected effect name + property values and posts them.

- [ ] **Step 1: Simplify Shell's effect wiring**

In `Shell.tsx`, remove the `effect`/`color`/`speed`/`apply` effect-specific state and the `EffectRequest` import; the Effects screen now owns effect state. Replace the block:

```tsx
  const [effect, setEffect] = useState<EffectRequest["type"]>("rainbow");
  const [color, setColor] = useState("#009bde");
  const [speed, setSpeed] = useState(0.2);
```
with nothing (delete those lines), and delete the `apply` function and the `import ... EffectRequest ...`. Change the Effects render branch:
```tsx
            {screen === "effects" && (
              <EffectsScreen effect={effect} color={color} speed={speed} apply={apply} />
            )}
```
to:
```tsx
            {screen === "effects" && <EffectsScreen />}
```

- [ ] **Step 2: Rewrite EffectsScreen**

Replace the whole file `EffectsScreen.tsx` with:

```tsx
import { useEffect, useMemo, useState } from "react";
import { api, type EffectInfo, type EffectProperty } from "@/lib/api";
import SearchBar from "@/components/SearchBar";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Default value for a property, coerced to the control's type. */
function defaultFor(p: EffectProperty): unknown {
  if (p.default !== null && p.default !== undefined) return p.default;
  if (p.type === "number") return p.min ?? 0;
  if (p.type === "color") return "#009bde";
  return "";
}

export default function EffectsScreen() {
  const { t } = useT();
  const [list, setList] = useState<EffectInfo[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [props, setProps] = useState<Record<string, unknown>>({});
  const [query, setQuery] = useState("");

  useEffect(() => {
    api.effects().then(setList).catch(() => {});
  }, []);

  const current = useMemo(() => list.find((e) => e.name === active) ?? null, [list, active]);

  const select = (e: EffectInfo) => {
    const initial: Record<string, unknown> = {};
    for (const p of e.properties) initial[p.key] = defaultFor(p);
    setActive(e.name);
    setProps(initial);
    api.setEffect({ name: e.name, props: initial }).catch(() => {});
  };

  const setProp = (key: string, value: unknown) => {
    const next = { ...props, [key]: value };
    setProps(next);
    if (active) api.setEffect({ name: active, props: next }).catch(() => {});
  };

  const visible = list.filter((e) => e.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="animate-rise">
        <SearchBar value={query} onChange={setQuery} placeholder={t("effects.search")} />
      </div>

      <div className="animate-rise grid gap-4 sm:grid-cols-2 lg:grid-cols-3" style={{ animationDelay: "0.06s" }}>
        {visible.map((e) => (
          <Card
            key={e.name}
            onClick={() => select(e)}
            className={cn(
              "cursor-pointer p-4 transition-all hover:-translate-y-0.5 hover:bg-card/80",
              active === e.name && "ring-1 ring-primary/60",
            )}
          >
            <div className="font-semibold capitalize">{e.name.replace(/-/g, " ")}</div>
            <p className="mt-1 text-xs text-muted-foreground">{e.description}</p>
          </Card>
        ))}
      </div>

      {current && current.properties.length > 0 && (
        <Card className="animate-rise max-w-md space-y-5 p-5" style={{ animationDelay: "0.1s" }}>
          {current.properties.map((p) => (
            <div key={p.key}>
              <label className="mb-2 flex items-center justify-between font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                {p.label}
                <span className="text-foreground/70">
                  {p.type === "number" ? Number(props[p.key] ?? 0).toFixed(2) : String(props[p.key] ?? "")}
                </span>
              </label>
              {p.type === "color" ? (
                <input
                  type="color"
                  value={String(props[p.key] ?? "#009bde")}
                  onChange={(e) => setProp(p.key, e.target.value)}
                  className="h-10 w-14 cursor-pointer rounded-lg border border-border bg-transparent"
                />
              ) : p.type === "number" ? (
                <Slider
                  value={[Number(props[p.key] ?? p.min ?? 0)]}
                  min={p.min ?? 0}
                  max={p.max ?? 1}
                  step={0.05}
                  onValueChange={([v]) => setProp(p.key, v)}
                />
              ) : (
                <input
                  className="w-full rounded-md border border-border bg-secondary px-2 py-1 text-sm text-foreground"
                  value={String(props[p.key] ?? "")}
                  onChange={(e) => setProp(p.key, e.target.value)}
                />
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd app/frontend && npx tsc -b`
Expected: no errors. (If `LivePreview` is now unused anywhere, leave the component file in place — do not delete unrelated files.)

- [ ] **Step 4: Commit + push (each file separately)**

```bash
git add app/frontend/src/screens/EffectsScreen.tsx
git commit -m "feat: effects screen lists yaml effects with their declared controls"
git push
git add app/frontend/src/components/Shell.tsx
git commit -m "refactor: effects screen owns effect state"
git push
```

---

### Task 10: Live board — tint fans from the frame

Make the Layout board reactive: poll `/api/frame` and tint each fan by the average of its LEDs' current colors (a simple, correct first version; per-LED SVG segments come later).

**Files:**
- Modify: `app/frontend/src/screens/LayoutScreen.tsx`

**Interfaces:**
- Consumes: `api.frame()`, `ControllerFrame`, the existing `LayoutFan.leds[].flatIndex`.
- Produces: the `Board` overlays a live color tint per fan.

- [ ] **Step 1: Poll the frame and pass colors into Board**

In `LayoutScreen.tsx`, add frame state and a poll, and compute a per-fan average color. Add inside the component (near the other state):

```tsx
  const [colors, setColors] = useState<string[]>([]);
  useEffect(() => {
    if (!controllerKey) return;
    const tick = () =>
      api
        .frame()
        .then((f) => setColors(f.controllers.find((c) => c.controllerKey === controllerKey)?.colors ?? []))
        .catch(() => {});
    tick();
    const id = setInterval(tick, 100); // 10 fps is plenty for a preview
    return () => clearInterval(id);
  }, [controllerKey]);
```

Add the import of `ControllerFrame` is not required (only `api.frame` used). Pass `colors` to `Board`: change `<Board layout={layout} />` to `<Board layout={layout} colors={colors} />`.

- [ ] **Step 2: Tint each fan in Board**

Change the `Board` signature and add a tint overlay. Replace the `Board` function's signature line and add an average-color overlay per fan:

```tsx
function Board({ layout, colors }: { layout: ControllerLayout; colors: string[] }) {
```

Inside the `layout.fans.map(...)` that renders the `<img>`, wrap it so a tint layer sits over the fan. Replace the `<img .../>` return with:

```tsx
          <div
            key={`fan-${fan.channel}-${fan.position}`}
            className="absolute"
            style={{
              left: (fan.originX - minX + 1) * scale,
              top: (fan.originY - minY + 1) * scale,
              width: fan.width * scale,
              height: fan.height * scale,
            }}
          >
            {fan.imageUrl ? (
              <img
                src={fan.imageUrl}
                alt={fan.name}
                loading="lazy"
                className="h-full w-full object-contain"
                onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
              />
            ) : null}
            <div
              className="pointer-events-none absolute inset-0 rounded-md mix-blend-color"
              style={{ background: avgColor(fan.leds.map((l) => colors[l.flatIndex]).filter(Boolean) as string[]) }}
            />
          </div>
```

Add the helper above `Board`:

```tsx
/** Average of #RRGGBB strings → an rgb() string; transparent if none. */
function avgColor(hexes: string[]): string {
  if (hexes.length === 0) return "transparent";
  let r = 0, g = 0, b = 0;
  for (const h of hexes) {
    const n = parseInt(h.slice(1), 16);
    r += (n >> 16) & 0xff;
    g += (n >> 8) & 0xff;
    b += n & 0xff;
  }
  const k = hexes.length;
  return `rgb(${Math.round(r / k)}, ${Math.round(g / k)}, ${Math.round(b / k)})`;
}
```

- [ ] **Step 3: Typecheck**

Run: `cd app/frontend && npx tsc -b`
Expected: no errors.

- [ ] **Step 4: Rebuild backend jar (resources changed across the layer) + run the app**

Run:
```bash
cd app/backend && "/c/Program Files/JetBrains/IntelliJ IDEA 2025.3.3/plugins/maven/lib/maven3/bin/mvn.cmd" -q -DskipTests package
cp target/penumbra-backend-0.1.0.jar ../frontend/src-tauri/target/debug/penumbra-backend.jar
cd ../frontend && npx tauri dev
```
Manual check: Effects tab lists the four effects; picking "side-to-side" and moving Speed sweeps the hardware; the Layout board fans tint with the live colors and animate. No regressions in Devices/Layout assignment.

- [ ] **Step 5: Commit + push**

```bash
git add app/frontend/src/screens/LayoutScreen.tsx
git commit -m "feat: live-reactive layout board tinted from the current frame"
git push
```

---

## Self-Review

**Spec coverage (Layer 2 section of the design doc):**
- YAML effect format + parser (`jackson-dataformat-yaml`) → Tasks 1, 2, 5. ✓
- `properties` supersede the `customizableColor` flag → Task 9 (screen reads declared properties). ✓
- `layers` (solid/gradient/sweep/radial/pulse) rasterized → Task 3. *Deviation:* `radial` is not implemented in v1 (no built-in needs it); solid/sweep/rainbow/gradient/pulse cover the four built-ins including side-to-side. Add `radial` when an effect needs it. Keyframes deferred per Global Constraints.
- Engine rasterize + per-LED world sampling, 1-D fallback → Tasks 4, 6. ✓
- Built-in effects re-expressed as YAML → Task 5. ✓
- Effects storage + list/activate + `POST /api/effect` by name/inline → Tasks 5, 7. *Note:* effects are read-only built-ins in v1; the editor's save-new-effect (`POST /api/effects`) lands with Layer 3. `effects_dir`/`open_effects_dir` (Tauri) are not needed because effects are backend-owned.
- Live board via `GET /api/frame` → Tasks 7, 10. (Per-LED SVG segments deferred; v1 tints each fan by its average LED color.)

**Placeholder scan:** none — every step has full code or an exact command with expected output.

**Type consistency:** `EffectSpec`/`Canvas`/`Property`/`Layer` names match across Tasks 2, 3, 5, 6, 7; `EffectRenderer.render`/`sample` signatures match Tasks 3 and 6; `worldMapFor`/`version` match Tasks 4 and 6; frontend `EffectInfo`/`EffectProperty`/`ControllerFrame` match the DTOs from Task 7; `setEffect({name,props})` body matches the Task 7 endpoint.

## Verification (end-to-end, after all tasks)

1. `mvn -Dtest=EffectRendererTest test` → 4 green.
2. `GET /api/effects` lists the four built-ins with their properties.
3. `POST /api/effect {"name":"side-to-side","props":{"speed":0.6}}` → the Nollie sweeps a band across the fans; left fans change before right fans (sides work).
4. `GET /api/frame` returns per-LED hex colors; the Layout board tints live.
5. Effects screen: picking an effect and moving its sliders changes the hardware; the `static` effect exposes only a color, `rainbow` only speed/spread (properties drive the controls).
6. Devices/Layout assignment unaffected.
