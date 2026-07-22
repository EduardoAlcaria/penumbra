package com.penumbra.effect;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.penumbra.device.DetectedDevice;
import com.penumbra.device.DeviceManager;
import com.penumbra.effect.spec.EffectSpec;
import com.penumbra.layout.LayoutService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.Path;
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
    private static final Logger log = LoggerFactory.getLogger(EffectEngine.class);

    /** Persisted active effect (name + property values), so a restart resumes it. */
    private static final Path STATE_FILE = Path.of("config", "active-effect.json");
    private final ObjectMapper json = new ObjectMapper();

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
        loadState(); // resume the last effect, or fall back to rainbow
    }

    public void setEffect(EffectSpec spec, Map<String, Object> props) {
        if (spec != null) {
            this.active = spec;
            this.props = props == null ? Map.of() : props;
            saveState();
        }
    }

    public String activeName() {
        return active == null ? "none" : active.name();
    }

    public Map<String, Object> activeProps() {
        return props;
    }

    /** Sample the active effect's canvas into an n-wide strip for a live UI preview. */
    public String[] previewStrip(int n) {
        EffectSpec fx = active;
        if (fx == null || n <= 0) return new String[0];
        int w = fx.canvas() == null ? 1 : Math.max(1, fx.canvas().width());
        int h = fx.canvas() == null ? 1 : Math.max(1, fx.canvas().height());
        int[] canvas = renderer.render(fx, props, System.currentTimeMillis() - startMillis);
        String[] out = new String[n];
        for (int i = 0; i < n; i++) {
            double nx = n == 1 ? 0.0 : i / (double) (n - 1);
            int rgb = EffectRenderer.sample(canvas, w, h, nx, 0.5);
            out[i] = String.format("#%06X", rgb & 0xFFFFFF);
        }
        return out;
    }

    private void loadState() {
        try {
            if (Files.exists(STATE_FILE)) {
                Map<?, ?> m = json.readValue(Files.readAllBytes(STATE_FILE), Map.class);
                EffectSpec spec = store.byName(String.valueOf(m.get("name")));
                if (spec != null) {
                    this.active = spec;
                    Object p = m.get("props");
                    @SuppressWarnings("unchecked")
                    Map<String, Object> pm = p instanceof Map<?, ?> ? (Map<String, Object>) p : Map.of();
                    this.props = pm;
                    return;
                }
            }
        } catch (Exception e) {
            log.warn("Could not load saved effect: {}", e.getMessage());
        }
        this.active = store.byName("rainbow");
    }

    private void saveState() {
        try {
            Files.createDirectories(STATE_FILE.getParent());
            Map<String, Object> m = new java.util.LinkedHashMap<>();
            m.put("name", active == null ? null : active.name());
            m.put("props", props);
            Files.write(STATE_FILE, json.writeValueAsBytes(m));
        } catch (Exception e) {
            log.warn("Could not save active effect: {}", e.getMessage());
        }
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
            boolean configured = !map.isEmpty();
            int[] frame = new int[total];
            for (int i = 0; i < total; i++) {
                double[] xy = map.get(i);
                int rgb;
                if (xy != null) {
                    // Real fan LED: sample the effect at its position on the canvas.
                    rgb = EffectRenderer.sample(canvas, w, h, xy[0], xy[1]);
                } else if (configured) {
                    // Phantom LED on a configured controller (unassigned channel or
                    // index past the real fans) — keep it dark, like SignalRGB drives
                    // only the real per-channel LED count. This kills the blotches.
                    rgb = 0;
                } else {
                    // No layout at all: light everything on a 1-D slice so an
                    // unconfigured controller still shows the effect.
                    double nx = total == 1 ? 0.0 : i / (double) (total - 1);
                    rgb = EffectRenderer.sample(canvas, w, h, nx, 0.5);
                }
                frame[i] = rgb;
                device.setLed(i, rgb);
            }
            lastFrame.put(device.id(), frame);
            device.renderFrame();
        }
    }
}
