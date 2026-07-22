package com.penumbra.effect;

import com.penumbra.device.DetectedDevice;
import com.penumbra.device.DeviceManager;
import com.penumbra.effect.spec.EffectSpec;
import com.penumbra.layout.LayoutService;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

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
