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
        double speed = resolveNumber(l.speed(), props, 0.0);
        switch (type) {
            case "solid" -> {
                int c = resolveColor(l.color(), props, 0xFFFFFF);
                for (int i = 0; i < px.length; i++) px[i] = c;
            }
            case "sweep" -> {
                int c = resolveColor(l.color(), props, 0xFFFFFF);
                double band = resolveNumber(l.band(), props, 0.2);
                double center = (t * speed) % 1.0;
                for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
                    double pos = axisPos(x, y, w, h, xAxis);
                    if (Math.abs(pos - center) <= band / 2) px[y * w + x] = c;
                }
            }
            case "rainbow" -> {
                double spread = resolveNumber(l.spread(), props, 1.0);
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
            case "wipe" -> {
                // Two colors washing back and forth: a boundary sweeps across on a
                // triangle wave, color on the left, color2 on the right. SignalRGB's
                // "side to side" in spirit — full color, not a thin band.
                int c1 = resolveColor(l.color(), props, 0xFFFFFF);
                int c2 = resolveColor(l.color2(), props, 0x000000);
                double phase = (t * speed) % 2.0;
                double center = phase < 1.0 ? phase : 2.0 - phase; // 0 → 1 → 0
                for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
                    double pos = axisPos(x, y, w, h, xAxis);
                    px[y * w + x] = pos <= center ? c1 : c2;
                }
            }
            default -> { /* unknown layer type: ignore, keep canvas as-is */ }
        }
    }

    /** Normalized position along the chosen axis, 0..1. */
    private static double axisPos(int x, int y, int w, int h, boolean xAxis) {
        if (xAxis) return w == 1 ? 0.0 : x / (double) (w - 1);
        return h == 1 ? 0.0 : y / (double) (h - 1);
    }

    public static int sample(int[] canvas, int w, int h, double nx, double ny) {
        int x = (int) Math.round(clamp01(nx) * (w - 1));
        int y = (int) Math.round(clamp01(ny) * (h - 1));
        return canvas[y * w + x];
    }

    /** Resolve a numeric layer field: a literal ("0.3"), an "@prop" reference, or fallback. */
    private double resolveNumber(String s, Map<String, Object> props, double fallback) {
        if (s == null) return fallback;
        Object v = s;
        if (s.startsWith("@")) {
            v = props.get(s.substring(1));
            if (v == null) return fallback;
        }
        if (v instanceof Number n) return n.doubleValue();
        try {
            return Double.parseDouble(String.valueOf(v));
        } catch (NumberFormatException e) {
            return fallback;
        }
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
