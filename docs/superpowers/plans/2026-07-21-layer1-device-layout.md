# Layer 1 — Device Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every physical LED a 2-D world coordinate derived from a user-declared map of which gear sits on each controller channel, expose it over REST, and show the fans on a board in the app.

**Architecture:** A new `layout` package in the backend persists channel→component assignments (`ChannelAssignment` in H2), a pure `LayoutBuilder` turns assignments + the controller's channel LED offsets + each component's `LedCoordinates` into fan placements with per-LED world coordinates, and a `LayoutService` wires it to live devices. Two REST endpoints read the layout and write assignments. A new frontend Layout screen renders the fans as a static board and edits the per-channel assignments.

**Tech Stack:** Java 21, Spring Boot 3.3.4 (web + data-jpa), H2, Jackson (already on the web starter), JUnit 5 (`spring-boot-starter-test`, already present). Frontend: React 18, Vite, Tailwind 4, shadcn/ui. Maven runs via the IntelliJ-bundled binary: `"/c/Program Files/JetBrains/IntelliJ IDEA 2025.3.3/plugins/maven/lib/maven3/bin/mvn.cmd"`.

## Global Constraints

- **Git rule (verbatim):** One file change = one commit = one push. Commit each changed file separately and push after each commit, so N changed files produce N commits and N pushes. Never add a `Co-Authored-By` trailer or any "Generated with Claude" / "🤖" attribution. Plain commit messages only.
- **No behavior change to the working hardware render path.** Layer 1 is purely additive. The engine keeps driving `ledsPerChannel` exactly as it does today (126 fallback). The real-count-to-driver change and the live-lit board are explicitly deferred to Layer 2.
- **`controllerKey` format:** `"VID:PID"` uppercase hex, e.g. `"16D5:2A08"` — exactly what `DetectedDevice.id()` returns.
- **Coordinate source:** `ComponentProfile.ledCoordinatesJson` is a JSON array `[[x,y],…]` where entry `i` is the grid position of LED `i` (0-based). `width`/`height` are the grid extents. Verified against `JUMPEAK_CS120.json` (22 LEDs, 11×7).
- **Flat global LED index:** `DetectedDevice` concatenates channels in order. Channel `ch` starts at global offset `Σ ledsPerChannel[0..ch-1]`. LED `i` within channel `ch` has global index `offset(ch) + i`.
- Backend maven build/test from `app/backend`. Frontend typecheck: `npx tsc -b` from `app/frontend`.

---

### Task 1: ChannelAssignment entity + repository

**Files:**
- Create: `app/backend/src/main/java/com/penumbra/layout/ChannelAssignment.java`
- Create: `app/backend/src/main/java/com/penumbra/layout/ChannelAssignmentRepository.java`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `ChannelAssignment` entity: `getControllerKey():String`, `getChannel():int`, `getPosition():int`, `getComponentId():Long`, matching setters, and a convenience constructor `ChannelAssignment(String controllerKey, int channel, int position, Long componentId)`.
  - `ChannelAssignmentRepository extends JpaRepository<ChannelAssignment, Long>` with `List<ChannelAssignment> findByControllerKeyOrderByChannelAscPositionAsc(String controllerKey)` and `@Transactional void deleteByControllerKey(String controllerKey)`.

- [ ] **Step 1: Write the entity**

Create `ChannelAssignment.java`:

```java
package com.penumbra.layout;

import jakarta.persistence.*;

/**
 * One component sitting at a position in a controller channel's daisy chain.
 * "Nollie channel 0 = [CS120, CS120]" is two rows: position 0 and position 1.
 * The controller can't report which model is plugged in, so the user declares it.
 */
@Entity
@Table(name = "channel_assignment")
public class ChannelAssignment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** "VID:PID" of the controller, e.g. "16D5:2A08" (DetectedDevice.id()). */
    private String controllerKey;

    /** 0-based channel index on that controller. */
    private int channel;

    /** Order of this component within the channel's chain (0,1,2…). */
    private int position;

    /** FK → ComponentProfile.id. */
    private Long componentId;

    public ChannelAssignment() { }

    public ChannelAssignment(String controllerKey, int channel, int position, Long componentId) {
        this.controllerKey = controllerKey;
        this.channel = channel;
        this.position = position;
        this.componentId = componentId;
    }

    public Long getId() { return id; }
    public String getControllerKey() { return controllerKey; }
    public void setControllerKey(String v) { this.controllerKey = v; }
    public int getChannel() { return channel; }
    public void setChannel(int v) { this.channel = v; }
    public int getPosition() { return position; }
    public void setPosition(int v) { this.position = v; }
    public Long getComponentId() { return componentId; }
    public void setComponentId(Long v) { this.componentId = v; }
}
```

- [ ] **Step 2: Write the repository**

Create `ChannelAssignmentRepository.java`:

```java
package com.penumbra.layout;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

public interface ChannelAssignmentRepository extends JpaRepository<ChannelAssignment, Long> {

    List<ChannelAssignment> findByControllerKeyOrderByChannelAscPositionAsc(String controllerKey);

    @Transactional
    void deleteByControllerKey(String controllerKey);
}
```

- [ ] **Step 3: Compile**

Run: `cd app/backend && "/c/Program Files/JetBrains/IntelliJ IDEA 2025.3.3/plugins/maven/lib/maven3/bin/mvn.cmd" -q -DskipTests compile`
Expected: build succeeds (Hibernate will create the `channel_assignment` table on next boot).

- [ ] **Step 4: Commit (one file per commit + push)**

```bash
cd D:/programming_WINDOWS_ONLY/projects/penumbra
git add app/backend/src/main/java/com/penumbra/layout/ChannelAssignment.java
git commit -m "feat: channel assignment entity for device layout"
git push
git add app/backend/src/main/java/com/penumbra/layout/ChannelAssignmentRepository.java
git commit -m "feat: channel assignment repository"
git push
```

---

### Task 2: Enrich `/api/components` with id + geometry

The frontend needs each component's `id` (to assign it), `width`, `height`, and parsed `ledCoordinates` (to draw the fan shape). Today `components()` returns only name/brand/type/ledCount/imageUrl.

**Files:**
- Modify: `app/backend/src/main/java/com/penumbra/web/DeviceRestController.java` (the `components()` method, around line 77)

**Interfaces:**
- Consumes: `ComponentProfile` (has `getId`, `getWidth`, `getHeight`, `getLedCoordinatesJson`), the existing `ObjectMapper` — inject one.
- Produces: `GET /api/components` items now include `"id"`, `"width"`, `"height"`, `"ledCoordinates"` (a `List<List<Integer>>`).

- [ ] **Step 1: Inject ObjectMapper into the controller**

In `DeviceRestController.java`, add the field and constructor param. Change the field block (around line 32-43) to:

```java
    private final DeviceManager deviceManager;
    private final EffectEngine engine;
    private final HidService hid;
    private final ComponentProfileRepository components;
    private final com.fasterxml.jackson.databind.ObjectMapper mapper;

    public DeviceRestController(DeviceManager deviceManager, EffectEngine engine, HidService hid,
                                ComponentProfileRepository components,
                                com.fasterxml.jackson.databind.ObjectMapper mapper) {
        this.deviceManager = deviceManager;
        this.engine = engine;
        this.hid = hid;
        this.components = components;
        this.mapper = mapper;
    }
```

- [ ] **Step 2: Add a coordinate-parsing helper**

Add this private method to `DeviceRestController` (near `parseHex`):

```java
    /** Parse a component's "[[x,y],…]" LedCoordinates JSON into a list; [] on any problem. */
    private List<List<Integer>> parseCoords(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            return mapper.readValue(json,
                    new com.fasterxml.jackson.core.type.TypeReference<List<List<Integer>>>() { });
        } catch (Exception e) {
            return List.of();
        }
    }
```

- [ ] **Step 3: Extend the components() DTO**

Replace the body of `components()` (around lines 77-84) with:

```java
    @GetMapping("/components")
    public List<Map<String, Object>> components() {
        return components.findAll().stream().map(c -> Map.<String, Object>of(
                "id", c.getId(),
                "name", c.getDisplayName() == null ? String.valueOf(c.getProductName()) : c.getDisplayName(),
                "brand", c.getBrand() == null ? "" : c.getBrand(),
                "type", c.getType() == null ? "" : c.getType(),
                "ledCount", c.getLedCount(),
                "width", c.getWidth(),
                "height", c.getHeight(),
                "ledCoordinates", parseCoords(c.getLedCoordinatesJson()),
                "imageUrl", c.getImageUrl() == null ? "" : c.getImageUrl())).toList();
    }
```

- [ ] **Step 4: Rebuild the jar and verify the new fields**

Run:
```bash
cd app/backend && "/c/Program Files/JetBrains/IntelliJ IDEA 2025.3.3/plugins/maven/lib/maven3/bin/mvn.cmd" -q -DskipTests package
java -jar target/penumbra-backend-0.1.0.jar >/tmp/eng.log 2>&1 &
sleep 20
curl -s "http://127.0.0.1:8787/api/components" | python -c "import sys,json; d=[c for c in json.load(sys.stdin) if 'CS120' in c['name']][0]; print(d['id'], d['width'], d['height'], len(d['ledCoordinates']))"
```
Expected: prints an id, `11 7 22` (CS120 is 11×7 with 22 coordinate pairs). Then `taskkill //F //IM java.exe`.

- [ ] **Step 5: Commit + push**

```bash
git add app/backend/src/main/java/com/penumbra/web/DeviceRestController.java
git commit -m "feat: expose component id and geometry on /api/components"
git push
```

---

### Task 3: LayoutBuilder (pure logic) + unit test

The heart of Layer 1: turn assignments into world coordinates. Pure function, no Spring, no HID — fully unit-testable.

**Files:**
- Create: `app/backend/src/main/java/com/penumbra/layout/LayoutBuilder.java`
- Test: `app/backend/src/test/java/com/penumbra/layout/LayoutBuilderTest.java`

**Interfaces:**
- Consumes: nothing (static utility).
- Produces (all `public` nested in `LayoutBuilder`):
  - `record FanSpec(long componentId, String name, String imageUrl, int width, int height, int[][] coords)` — `coords[i] = {x,y}` for LED `i`; `coords.length == ledCount`.
  - `record LedPoint(int flatIndex, double x, double y)`
  - `record FanPlacement(long componentId, String name, String imageUrl, int channel, int position, double originX, double originY, int width, int height, List<LedPoint> leds)`
  - `record Layout(List<FanPlacement> fans, double minX, double minY, double maxX, double maxY)`
  - `static Layout build(int[] ledsPerChannel, Map<Integer, List<FanSpec>> chainsByChannel)`

**Algorithm:** For each channel `ch`, global offset = `Σ ledsPerChannel[0..ch-1]`. Fans in the channel are laid left→right along X (`xCursor += width + GAP`), channels stack down Y (`yBase = ch * (ROW_HEIGHT + GAP)`). Each LED `i` of a fan gets global index `offset + localFlat + i`, world `(originX + coords[i][0], originY + coords[i][1])`. `GAP = 2`, `ROW_HEIGHT = 8` (world units; a fan is a few units tall).

- [ ] **Step 1: Write the failing test**

Create `LayoutBuilderTest.java`:

```java
package com.penumbra.layout;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class LayoutBuilderTest {

    // A tiny 2-LED "fan": LED0 at local (0,0) left, LED1 at local (2,0) right, width 3.
    private static LayoutBuilder.FanSpec tinyFan(long id) {
        return new LayoutBuilder.FanSpec(id, "Tiny", "", 3, 1, new int[][] { {0, 0}, {2, 0} });
    }

    @Test
    void twoFansOnOneChannelSitSideBySide() {
        // Channel 0 has 10 LEDs on the device (fallback), two 2-LED fans assigned.
        int[] ledsPerChannel = { 10 };
        LayoutBuilder.Layout layout = LayoutBuilder.build(
                ledsPerChannel,
                Map.of(0, List.of(tinyFan(1L), tinyFan(2L))));

        assertEquals(2, layout.fans().size());

        // Fan 0 starts at x=0; its two LEDs are flat indices 0 and 1.
        LayoutBuilder.FanPlacement f0 = layout.fans().get(0);
        assertEquals(0.0, f0.originX());
        assertEquals(0, f0.leds().get(0).flatIndex());
        assertEquals(0.0, f0.leds().get(0).x());   // 0 + 0
        assertEquals(2.0, f0.leds().get(1).x());   // 0 + 2

        // Fan 1 starts at x = width + GAP = 3 + 2 = 5; flat indices continue 2,3.
        LayoutBuilder.FanPlacement f1 = layout.fans().get(1);
        assertEquals(5.0, f1.originX());
        assertEquals(2, f1.leds().get(0).flatIndex());
        assertEquals(5.0, f1.leds().get(0).x());   // 5 + 0
        assertEquals(7.0, f1.leds().get(1).x());   // 5 + 2
    }

    @Test
    void secondChannelOffsetsFlatIndexByPriorChannelCount() {
        // Channel 0 = 10 LEDs (device fallback), channel 1 has one fan.
        int[] ledsPerChannel = { 10, 10 };
        LayoutBuilder.Layout layout = LayoutBuilder.build(
                ledsPerChannel,
                Map.of(1, List.of(tinyFan(1L))));

        LayoutBuilder.FanPlacement f = layout.fans().get(0);
        assertEquals(1, f.channel());
        // Channel 1 starts at global offset 10.
        assertEquals(10, f.leds().get(0).flatIndex());
        assertEquals(11, f.leds().get(1).flatIndex());
        // Channel 1 sits one row down: yBase = 1 * (ROW_HEIGHT 8 + GAP 2) = 10.
        assertEquals(10.0, f.originY());
    }

    @Test
    void boundsCoverAllLeds() {
        LayoutBuilder.Layout layout = LayoutBuilder.build(
                new int[] { 10 },
                Map.of(0, List.of(tinyFan(1L), tinyFan(2L))));
        assertEquals(0.0, layout.minX());
        assertEquals(7.0, layout.maxX());   // rightmost LED
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd app/backend && "/c/Program Files/JetBrains/IntelliJ IDEA 2025.3.3/plugins/maven/lib/maven3/bin/mvn.cmd" -q -Dtest=LayoutBuilderTest test`
Expected: FAIL — `LayoutBuilder` does not compile / class not found.

- [ ] **Step 3: Write the implementation**

Create `LayoutBuilder.java`:

```java
package com.penumbra.layout;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Pure geometry: assignments + the controller's per-channel LED offsets +
 * each component's local coordinates -> fan placements with per-LED world
 * coordinates. No Spring, no hardware — the piece worth unit-testing.
 *
 * Layout rule (v1): fans in a channel run left→right along X; channels stack
 * down Y. Deliberately simple; drag-to-arrange is a later layer.
 */
public final class LayoutBuilder {

    private static final double GAP = 2;         // world units between fans / channels
    private static final double ROW_HEIGHT = 8;  // vertical pitch between channels

    private LayoutBuilder() { }

    public record FanSpec(long componentId, String name, String imageUrl,
                          int width, int height, int[][] coords) { }

    public record LedPoint(int flatIndex, double x, double y) { }

    public record FanPlacement(long componentId, String name, String imageUrl,
                               int channel, int position,
                               double originX, double originY, int width, int height,
                               List<LedPoint> leds) { }

    public record Layout(List<FanPlacement> fans,
                         double minX, double minY, double maxX, double maxY) { }

    public static Layout build(int[] ledsPerChannel, Map<Integer, List<FanSpec>> chainsByChannel) {
        List<FanPlacement> fans = new ArrayList<>();
        double minX = Double.POSITIVE_INFINITY, minY = Double.POSITIVE_INFINITY;
        double maxX = Double.NEGATIVE_INFINITY, maxY = Double.NEGATIVE_INFINITY;

        for (int ch = 0; ch < ledsPerChannel.length; ch++) {
            List<FanSpec> chain = chainsByChannel.get(ch);
            if (chain == null || chain.isEmpty()) continue;

            int globalOffset = 0;
            for (int c = 0; c < ch; c++) globalOffset += ledsPerChannel[c];

            double yBase = ch * (ROW_HEIGHT + GAP);
            double xCursor = 0;
            int localFlat = 0;

            for (int p = 0; p < chain.size(); p++) {
                FanSpec fan = chain.get(p);
                List<LedPoint> leds = new ArrayList<>(fan.coords().length);
                for (int i = 0; i < fan.coords().length; i++) {
                    int flat = globalOffset + localFlat + i;
                    double x = xCursor + fan.coords()[i][0];
                    double y = yBase + fan.coords()[i][1];
                    leds.add(new LedPoint(flat, x, y));
                    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
                    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
                }
                fans.add(new FanPlacement(fan.componentId(), fan.name(), fan.imageUrl(),
                        ch, p, xCursor, yBase, fan.width(), fan.height(), leds));
                localFlat += fan.coords().length;
                xCursor += fan.width() + GAP;
            }
        }

        if (fans.isEmpty()) return new Layout(List.of(), 0, 0, 0, 0);
        return new Layout(fans, minX, minY, maxX, maxY);
    }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd app/backend && "/c/Program Files/JetBrains/IntelliJ IDEA 2025.3.3/plugins/maven/lib/maven3/bin/mvn.cmd" -q -Dtest=LayoutBuilderTest test`
Expected: PASS (3 tests green).

- [ ] **Step 5: Commit + push (each file separately)**

```bash
git add app/backend/src/main/java/com/penumbra/layout/LayoutBuilder.java
git commit -m "feat: pure layout builder mapping assignments to world coordinates"
git push
git add app/backend/src/test/java/com/penumbra/layout/LayoutBuilderTest.java
git commit -m "test: layout builder side-by-side and channel-offset geometry"
git push
```

---

### Task 4: LayoutService — wire the builder to live devices + assignments

**Files:**
- Create: `app/backend/src/main/java/com/penumbra/layout/LayoutService.java`

**Interfaces:**
- Consumes: `DeviceManager.devices()` → `List<DetectedDevice>` (each has `id():String`, `getLedsPerChannel():int[]`), `ChannelAssignmentRepository`, `ComponentProfileRepository`, `ObjectMapper`, `LayoutBuilder.build`.
- Produces:
  - `record AssignmentDto(int channel, int position, Long componentId)`
  - `LayoutBuilder.Layout layoutFor(String controllerKey)` — builds the layout for one controller from its live channel counts + stored assignments.
  - `List<String> controllerKeys()` — ids of currently attached controllers.
  - `void setAssignments(String controllerKey, List<AssignmentDto> items)` — replaces that controller's assignments.

- [ ] **Step 1: Write the service**

Create `LayoutService.java`:

```java
package com.penumbra.layout;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.penumbra.device.DetectedDevice;
import com.penumbra.device.DeviceManager;
import com.penumbra.profile.ComponentProfile;
import com.penumbra.profile.ComponentProfileRepository;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;

/**
 * Bridges stored channel assignments and the live device set into a world
 * layout. Assignments are keyed by controller "VID:PID"; the live device
 * supplies the per-channel LED offsets the flat index depends on.
 */
@Service
public class LayoutService {

    public record AssignmentDto(int channel, int position, Long componentId) { }

    private final DeviceManager deviceManager;
    private final ChannelAssignmentRepository assignments;
    private final ComponentProfileRepository components;
    private final ObjectMapper mapper;

    public LayoutService(DeviceManager deviceManager, ChannelAssignmentRepository assignments,
                         ComponentProfileRepository components, ObjectMapper mapper) {
        this.deviceManager = deviceManager;
        this.assignments = assignments;
        this.components = components;
        this.mapper = mapper;
    }

    public List<String> controllerKeys() {
        return deviceManager.devices().stream().map(DetectedDevice::id).toList();
    }

    public LayoutBuilder.Layout layoutFor(String controllerKey) {
        DetectedDevice device = deviceManager.devices().stream()
                .filter(d -> d.id().equals(controllerKey))
                .findFirst().orElse(null);
        if (device == null || device.getLedsPerChannel() == null) {
            return new LayoutBuilder.Layout(List.of(), 0, 0, 0, 0);
        }

        Map<Integer, List<LayoutBuilder.FanSpec>> chains = new TreeMap<>();
        for (ChannelAssignment a : assignments.findByControllerKeyOrderByChannelAscPositionAsc(controllerKey)) {
            LayoutBuilder.FanSpec spec = specFor(a.getComponentId());
            if (spec == null) continue;
            chains.computeIfAbsent(a.getChannel(), k -> new ArrayList<>()).add(spec);
        }
        return LayoutBuilder.build(device.getLedsPerChannel(), chains);
    }

    public void setAssignments(String controllerKey, List<AssignmentDto> items) {
        assignments.deleteByControllerKey(controllerKey);
        for (AssignmentDto it : items) {
            if (it.componentId() == null) continue;
            assignments.save(new ChannelAssignment(controllerKey, it.channel(), it.position(), it.componentId()));
        }
    }

    private LayoutBuilder.FanSpec specFor(Long componentId) {
        Optional<ComponentProfile> found = components.findById(componentId);
        if (found.isEmpty()) return null;
        ComponentProfile c = found.get();
        int[][] coords = parseCoords(c.getLedCoordinatesJson());
        String name = c.getDisplayName() == null ? String.valueOf(c.getProductName()) : c.getDisplayName();
        return new LayoutBuilder.FanSpec(c.getId(), name,
                c.getImageUrl() == null ? "" : c.getImageUrl(),
                c.getWidth(), c.getHeight(), coords);
    }

    private int[][] parseCoords(String json) {
        if (json == null || json.isBlank()) return new int[0][];
        try {
            return mapper.readValue(json, int[][].class);
        } catch (Exception e) {
            return new int[0][];
        }
    }
}
```

- [ ] **Step 2: Compile**

Run: `cd app/backend && "/c/Program Files/JetBrains/IntelliJ IDEA 2025.3.3/plugins/maven/lib/maven3/bin/mvn.cmd" -q -DskipTests compile`
Expected: build succeeds.

- [ ] **Step 3: Commit + push**

```bash
git add app/backend/src/main/java/com/penumbra/layout/LayoutService.java
git commit -m "feat: layout service bridging assignments and live devices"
git push
```

---

### Task 5: Layout REST endpoints

**Files:**
- Modify: `app/backend/src/main/java/com/penumbra/web/DeviceRestController.java`

**Interfaces:**
- Consumes: `LayoutService` (inject), its `controllerKeys()`, `layoutFor(key)`, `setAssignments(key, items)`, `AssignmentDto`.
- Produces:
  - `GET /api/layout` → `{ controllers: [ { controllerKey, bounds:{minX,minY,maxX,maxY}, fans:[FanPlacement…] } ] }`.
  - `PUT /api/layout/assignments?controllerKey=…` body `[ {channel, position, componentId} ]` → returns the rebuilt layout for that controller.

- [ ] **Step 1: Inject LayoutService**

Add `private final com.penumbra.layout.LayoutService layout;` to the field block and the constructor param + assignment (follow the same pattern Task 2 used for `mapper`).

- [ ] **Step 2: Add the endpoints**

Add these methods to `DeviceRestController` (after `components()`):

```java
    @GetMapping("/layout")
    public Map<String, Object> layout() {
        List<Map<String, Object>> controllers = new java.util.ArrayList<>();
        for (String key : layout.controllerKeys()) {
            controllers.add(layoutDto(key, layout.layoutFor(key)));
        }
        return Map.of("controllers", controllers);
    }

    @PutMapping("/layout/assignments")
    public Map<String, Object> setAssignments(@RequestParam String controllerKey,
                                              @RequestBody List<com.penumbra.layout.LayoutService.AssignmentDto> items) {
        layout.setAssignments(controllerKey, items);
        return layoutDto(controllerKey, layout.layoutFor(controllerKey));
    }

    private static Map<String, Object> layoutDto(String key, com.penumbra.layout.LayoutBuilder.Layout l) {
        List<Map<String, Object>> fans = l.fans().stream().map(f -> Map.<String, Object>of(
                "componentId", f.componentId(),
                "name", f.name(),
                "imageUrl", f.imageUrl(),
                "channel", f.channel(),
                "position", f.position(),
                "originX", f.originX(),
                "originY", f.originY(),
                "width", f.width(),
                "height", f.height(),
                "leds", f.leds().stream().map(p -> Map.<String, Object>of(
                        "flatIndex", p.flatIndex(), "x", p.x(), "y", p.y())).toList())).toList();
        return Map.of(
                "controllerKey", key,
                "bounds", Map.of("minX", l.minX(), "minY", l.minY(), "maxX", l.maxX(), "maxY", l.maxY()),
                "fans", fans);
    }
```

- [ ] **Step 3: Rebuild + verify end to end with a real assignment**

Run:
```bash
cd app/backend && "/c/Program Files/JetBrains/IntelliJ IDEA 2025.3.3/plugins/maven/lib/maven3/bin/mvn.cmd" -q -DskipTests package
java -jar target/penumbra-backend-0.1.0.jar >/tmp/eng.log 2>&1 &
sleep 20
CS=$(curl -s "http://127.0.0.1:8787/api/components" | python -c "import sys,json;print([c for c in json.load(sys.stdin) if 'CS120' in c['name']][0]['id'])")
# assign two CS120 to channel 0 of the Nollie
curl -s -X PUT "http://127.0.0.1:8787/api/layout/assignments?controllerKey=16D5:2A08" \
  -H "Content-Type: application/json" \
  -d "[{\"channel\":0,\"position\":0,\"componentId\":$CS},{\"channel\":0,\"position\":1,\"componentId\":$CS}]" \
  | python -c "import sys,json; d=json.load(sys.stdin); print('fans',len(d['fans']),'first led flat',d['fans'][0]['leds'][0]['flatIndex'],'second fan originX',d['fans'][1]['originX'])"
curl -s "http://127.0.0.1:8787/api/layout" | python -c "import sys,json; print('controllers',len(json.load(sys.stdin)['controllers']))"
taskkill //F //IM java.exe
```
Expected: `fans 2 first led flat 0 second fan originX 13.0` (CS120 width 11 + GAP 2), and `controllers 1`. Assignment persists in H2.

- [ ] **Step 4: Commit + push**

```bash
git add app/backend/src/main/java/com/penumbra/web/DeviceRestController.java
git commit -m "feat: layout REST endpoints (get layout, set assignments)"
git push
```

---

### Task 6: Frontend API client + types

**Files:**
- Modify: `app/frontend/src/lib/api.ts`

**Interfaces:**
- Consumes: `GET /api/components` (now with geometry), `GET /api/layout`, `PUT /api/layout/assignments`.
- Produces: `Component` gains `id, width, height, ledCoordinates`; new `LayoutFan`, `ControllerLayout`, `Assignment` types; `api.layout()`, `api.setAssignments(controllerKey, items)`.

- [ ] **Step 1: Extend the Component interface and add layout types**

In `api.ts`, replace the `Component` interface with:

```ts
/** Bundled gear (fans/strips) with SignalRGB asset photos + LED geometry. */
export interface Component {
  id: number;
  name: string;
  brand: string;
  type: string;
  ledCount: number;
  width: number;
  height: number;
  ledCoordinates: [number, number][];
  imageUrl: string;
}

export interface LayoutLed { flatIndex: number; x: number; y: number }
export interface LayoutFan {
  componentId: number;
  name: string;
  imageUrl: string;
  channel: number;
  position: number;
  originX: number;
  originY: number;
  width: number;
  height: number;
  leds: LayoutLed[];
}
export interface ControllerLayout {
  controllerKey: string;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  fans: LayoutFan[];
}
export interface Assignment { channel: number; position: number; componentId: number }
```

- [ ] **Step 2: Add the API methods**

Add to the `api` object:

```ts
  layout: () =>
    fetch(`${BASE}/api/layout`).then(json<{ controllers: ControllerLayout[] }>),
  setAssignments: (controllerKey: string, items: Assignment[]) =>
    fetch(`${BASE}/api/layout/assignments?controllerKey=${encodeURIComponent(controllerKey)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(items),
    }).then(json<ControllerLayout>),
```

- [ ] **Step 3: Typecheck**

Run: `cd app/frontend && npx tsc -b`
Expected: no errors.

- [ ] **Step 4: Commit + push**

```bash
git add app/frontend/src/lib/api.ts
git commit -m "feat: frontend layout API client and geometry types"
git push
```

---

### Task 7: Frontend Layout screen (board + assignment UI)

**Files:**
- Create: `app/frontend/src/screens/LayoutScreen.tsx`
- Modify: `app/frontend/src/components/Sidebar.tsx` (add a "Layout" nav item)
- Modify: `app/frontend/src/components/Shell.tsx` (route to the new screen)
- Modify: `app/backend/src/main/resources/i18n/messages.properties` and `messages_pt.properties` (nav + screen strings)

**Interfaces:**
- Consumes: `api.layout()`, `api.components()`, `api.setAssignments()`, `Component`, `ControllerLayout`, `LayoutFan`.
- Produces: a `LayoutScreen` default export; a `"layout"` value added to the `Screen` union.

- [ ] **Step 1: Add i18n keys (both files)**

Append to `messages.properties`:

```properties
nav.layout=Layout
layout.title=Device Layout
layout.empty.title=No controller detected
layout.empty.hint=Plug in a controller and hit Rescan to lay out its fans.
layout.channel=Channel
layout.addfan=Add fan
layout.pickfan=Pick a fan model
layout.save=Save layout
layout.saved=Layout saved
```

Append to `messages_pt.properties`:

```properties
nav.layout=Layout
layout.title=Layout dos dispositivos
layout.empty.title=Nenhum controlador detectado
layout.empty.hint=Conecta um controlador e clica em Reescanear para posicionar os fans.
layout.channel=Canal
layout.addfan=Adicionar fan
layout.pickfan=Escolher modelo de fan
layout.save=Salvar layout
layout.saved=Layout salvo
```

- [ ] **Step 2: Add the Layout nav item to the Screen union + Sidebar**

In `Sidebar.tsx`, change the `Screen` type (line 7) to:

```ts
export type Screen = "effects" | "devices" | "layout" | "settings";
```

And add a nav entry to the `items` array (after `devices`), importing an icon — add `LayoutGrid` to the lucide import on line 2:

```ts
import { Cpu, LayoutGrid, RefreshCw, Settings, Sparkles } from "lucide-react";
```
```ts
    { id: "devices", label: t("nav.devices"), icon: Cpu },
    { id: "layout", label: t("nav.layout"), icon: LayoutGrid },
```

- [ ] **Step 3: Route the screen in Shell**

In `Shell.tsx`, add the import and the render branch, and the title. Add import near the other screen imports:

```tsx
import LayoutScreen from "@/screens/LayoutScreen";
```
Add to the `titles` record (Screen → string):

```tsx
    layout: t("layout.title"),
```
Add the render branch next to the others:

```tsx
            {screen === "layout" && <LayoutScreen devices={devices} />}
```

- [ ] **Step 4: Write the Layout screen**

Create `LayoutScreen.tsx`:

```tsx
import { useEffect, useMemo, useState } from "react";
import { api, type Component, type ControllerLayout, type Device } from "@/lib/api";
import SearchBar from "@/components/SearchBar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useT } from "@/lib/i18n";

interface Props {
  devices: Device[];
}

// One row per assigned fan; the channel comes from the row's channel field.
interface Row {
  channel: number;
  componentId: number;
}

/** Draws one controller's fans as a static board, scaled to fit the card. */
function Board({ layout }: { layout: ControllerLayout }) {
  const { minX, minY, maxX, maxY } = layout.bounds;
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);
  const scale = 26; // px per world unit
  return (
    <div
      className="relative rounded-xl bg-muted/30 ring-1 ring-inset ring-white/10"
      style={{ width: (w + 2) * scale, height: (h + 2) * scale }}
    >
      {layout.fans.flatMap((fan) =>
        fan.leds.map((led) => (
          <span
            key={`${fan.channel}-${fan.position}-${led.flatIndex}`}
            className="absolute h-2 w-2 rounded-full"
            style={{
              left: (led.x - minX + 1) * scale,
              top: (led.y - minY + 1) * scale,
              background: "var(--glow)",
              boxShadow: "0 0 6px var(--glow)",
            }}
          />
        )),
      )}
    </div>
  );
}

export default function LayoutScreen({ devices }: Props) {
  const { t } = useT();
  const [gear, setGear] = useState<Component[]>([]);
  const [layout, setLayout] = useState<ControllerLayout | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState("");

  const controllerKey = devices[0]?.id ?? null;

  useEffect(() => {
    api.components().then(setGear).catch(() => {});
  }, []);

  useEffect(() => {
    if (!controllerKey) return;
    api.layout().then((d) => {
      const mine = d.controllers.find((c) => c.controllerKey === controllerKey) ?? null;
      setLayout(mine);
      setRows(mine ? mine.fans.map((f) => ({ channel: f.channel, componentId: f.componentId })) : []);
    }).catch(() => {});
  }, [controllerKey]);

  const fans = useMemo(
    () => gear.filter((g) => g.type === "Fan" && g.name.toLowerCase().includes(query.trim().toLowerCase())),
    [gear, query],
  );

  const channelCount = devices[0]?.channels ?? 0;

  const addRow = (channel: number, componentId: number) =>
    setRows((r) => [...r, { channel, componentId }]);
  const removeRow = (idx: number) => setRows((r) => r.filter((_, i) => i !== idx));

  const save = () => {
    if (!controllerKey) return;
    // position = order within each channel, derived from row order
    const perChannel: Record<number, number> = {};
    const items = rows.map((row) => {
      const position = perChannel[row.channel] ?? 0;
      perChannel[row.channel] = position + 1;
      return { channel: row.channel, position, componentId: row.componentId };
    });
    api.setAssignments(controllerKey, items).then(setLayout).catch(() => {});
  };

  if (!controllerKey) {
    return (
      <Card className="border-dashed bg-card/40 p-10 text-center">
        <div className="font-medium">{t("layout.empty.title")}</div>
        <div className="mt-1 text-sm text-muted-foreground">{t("layout.empty.hint")}</div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {layout && layout.fans.length > 0 && (
        <Card className="animate-rise overflow-auto p-5">
          <Board layout={layout} />
        </Card>
      )}

      <Card className="animate-rise p-5" style={{ animationDelay: "0.06s" }}>
        <SearchBar value={query} onChange={setQuery} placeholder={t("layout.pickfan")} />
        <div className="mt-4 space-y-4">
          {Array.from({ length: channelCount }, (_, ch) => (
            <div key={ch} className="rounded-lg bg-muted/20 p-3">
              <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                {t("layout.channel")} {ch + 1}
              </div>
              <div className="flex flex-wrap gap-2">
                {rows.map((row, idx) =>
                  row.channel === ch ? (
                    <button
                      key={idx}
                      onClick={() => removeRow(idx)}
                      className="rounded-full bg-secondary px-3 py-1 text-xs ring-1 ring-primary/40 hover:ring-destructive/60"
                    >
                      {gear.find((g) => g.id === row.componentId)?.name ?? row.componentId} ✕
                    </button>
                  ) : null,
                )}
                <select
                  className="rounded-md border border-border bg-transparent px-2 py-1 text-xs"
                  value=""
                  onChange={(e) => e.target.value && addRow(ch, Number(e.target.value))}
                >
                  <option value="">＋ {t("layout.addfan")}</option>
                  {fans.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5">
          <Button onClick={save}>{t("layout.save")}</Button>
        </div>
      </Card>
    </div>
  );
}
```

- [ ] **Step 5: Typecheck**

Run: `cd app/frontend && npx tsc -b`
Expected: no errors.

- [ ] **Step 6: Rebuild backend jar (i18n strings changed) + run the full app**

Run:
```bash
cd app/backend && "/c/Program Files/JetBrains/IntelliJ IDEA 2025.3.3/plugins/maven/lib/maven3/bin/mvn.cmd" -q -DskipTests package
cp target/penumbra-backend-0.1.0.jar ../frontend/src-tauri/target/debug/penumbra-backend.jar
cd ../frontend && npx tauri dev
```
Manual check: open the **Layout** tab → pick two CS120 on Channel 1 → **Save layout** → the board shows two fans side by side; reopening the tab shows the saved assignment (persisted). No effect/rescan regressions.

- [ ] **Step 7: Commit + push (each file separately)**

```bash
cd D:/programming_WINDOWS_ONLY/projects/penumbra
git add app/backend/src/main/resources/i18n/messages.properties
git commit -m "feat: layout screen i18n strings (en)"
git push
git add app/backend/src/main/resources/i18n/messages_pt.properties
git commit -m "feat: layout screen i18n strings (pt)"
git push
git add app/frontend/src/screens/LayoutScreen.tsx
git commit -m "feat: device layout screen with fan board and assignment UI"
git push
git add app/frontend/src/components/Sidebar.tsx
git commit -m "feat: layout nav item in sidebar"
git push
git add app/frontend/src/components/Shell.tsx
git commit -m "feat: route the layout screen"
git push
```

---

## Self-Review

**Spec coverage (Layer 1 section of the design doc):**
- Data model `ChannelAssignment` → Task 1. ✓
- Layout builder (within-channel X, across-channel Y, flat-index mapping, unassigned skip) → Task 3 (+ test). ✓
- `GET /api/layout`, `PUT /api/layout/assignments` → Task 5. ✓
- `/api/components` gains id/width/height/coordinates → Task 2. ✓
- Frontend view-only fan board + assignment UI → Task 7. ✓
- **LED count fix (driver-side)** and **live-lit board** → *explicitly deferred to Layer 2* per Global Constraints (no change to the 60fps render path in Layer 1). The layout API still reports true per-fan geometry, so the informational intent is met; the driver-side count change lands with the engine rewrite in Layer 2. Noted deviation, not a gap.

**Placeholder scan:** none — every step has full code or an exact command + expected output.

**Type consistency:** `FanSpec/LedPoint/FanPlacement/Layout` names match across Tasks 3-5; `AssignmentDto(channel, position, componentId)` matches the frontend `Assignment` and the PUT body; `controllerKey` = `DetectedDevice.id()` = `"16D5:2A08"` used consistently in Tasks 4, 5, 7.

## Verification (end-to-end, after all tasks)

1. `mvn -Dtest=LayoutBuilderTest test` → 3 green.
2. Assign 2× CS120 to channel 0 via `PUT /api/layout/assignments` → `GET /api/layout` shows 2 fans, second `originX = 13.0`, LED flat indices 0-21 then 22-43.
3. In the app, the Layout tab board shows the fans; assignment persists across restarts (H2).
4. Effects, Rescan, and Devices screens still work (no regression).
