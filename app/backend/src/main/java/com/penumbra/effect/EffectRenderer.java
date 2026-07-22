package com.penumbra.effect;

import com.penumbra.effect.spec.EffectSpec;
import com.penumbra.effect.spec.Track;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * Rasterizes an EffectSpec's parametric layers onto a flat int[w*h] canvas of
 * 0xRRGGBB pixels for a given time and property values. Mirror of the canvas
 * SignalRGB effects paint.
 *
 * A layer field is a literal, an "@prop" reference, or a keyframe Track — all
 * three land in the same resolver, so a track over a property reference stays
 * live while the user drags that property's slider.
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
        double speed = resolveNumber(l.speed(), props, 0.0, t);
        switch (type) {
            case "solid" -> {
                int c = resolveColor(l.color(), props, 0xFFFFFF, t);
                for (int i = 0; i < px.length; i++) px[i] = c;
            }
            case "sweep" -> {
                int c = resolveColor(l.color(), props, 0xFFFFFF, t);
                double band = resolveNumber(l.band(), props, 0.2, t);
                double center = (t * speed) % 1.0;
                for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
                    double pos = axisPos(x, y, w, h, xAxis);
                    if (Math.abs(pos - center) <= band / 2) px[y * w + x] = c;
                }
            }
            case "rainbow" -> {
                // Faithful to SignalRGB Rainbow: hue(deg) = pixel - offset, offset
                // scrolls speed/10 deg per frame at 60fps = 6*speed deg/second.
                double offset = t * 6.0 * speed;
                for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
                    double px360 = xAxis ? x : y;
                    double hueDeg = (((px360 - offset) % 360) + 360) % 360;
                    px[y * w + x] = Effect.hsv(hueDeg / 360.0, 1.0, 1.0);
                }
            }
            case "gradient" -> {
                int a = resolveColor(l.color(), props, 0x000000, t);
                int b = resolveColor(l.color2(), props, 0xFFFFFF, t);
                for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
                    px[y * w + x] = lerp(a, b, axisPos(x, y, w, h, xAxis));
                }
            }
            case "pulse" -> {
                double br = 0.5 * (1 - Math.cos(t * speed * 2 * Math.PI));
                for (int i = 0; i < px.length; i++) px[i] = scale(px[i], br);
            }
            case "wipe" -> {
                // SignalRGB "Side to Side": one color wipes in and fully covers the
                // canvas from one edge, then the other color wipes in from the
                // OPPOSITE edge — alternating color AND side each pass.
                int c1 = resolveColor(l.color(), props, 0xFFFFFF, t);
                int c2 = resolveColor(l.color2(), props, 0x000000, t);
                // SignalRGB sweeps 320px at speed/10 px per frame at 60fps, so one
                // full pass takes 320/(6*speed) = 53.33/speed seconds.
                double phase = t * speed / 53.333;
                int wipe = (int) Math.floor(phase);
                double progress = phase - wipe;
                boolean even = (wipe & 1) == 0;
                int incoming = even ? c1 : c2;
                int background = even ? c2 : c1;
                for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
                    double pos = axisPos(x, y, w, h, xAxis);
                    // even passes cover from the right (pos ≥ 1-progress), odd from the left.
                    boolean covered = even ? pos >= 1 - progress : pos <= progress;
                    px[y * w + x] = covered ? incoming : background;
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

    /**
     * Nearest sample at normalized (nx, ny). Nearest, not bilinear, on purpose:
     * SignalRGB never interpolates. Its chain is Ultralight -> QImage::scaled(320,
     * 200, Qt::FastTransformation) -> QPainter::drawPixmap with no
     * SmoothPixmapTransform hint -> QImage::pixelColor(x, y), all nearest.
     */
    public static int sample(int[] canvas, int w, int h, double nx, double ny) {
        int x = (int) Math.round(clamp01(nx) * (w - 1));
        int y = (int) Math.round(clamp01(ny) * (h - 1));
        return canvas[y * w + x];
    }

    /**
     * Resolve a numeric layer field: a literal ("0.3"), an "@prop" reference, or
     * a keyframe track. A track's endpoints recurse through here, so keyframing
     * a property reference keeps the slider live.
     */
    private double resolveNumber(Object value, Map<String, Object> props, double fallback, double t) {
        if (value == null) return fallback;
        Track.Span span = Track.spanAt(value, t);
        if (span != null) {
            double a = resolveNumber(span.from(), props, fallback, t);
            double b = resolveNumber(span.to(), props, fallback, t);
            return a + (b - a) * span.blend();
        }
        Object v = value;
        if (v instanceof String s && s.startsWith("@")) {
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

    private int resolveColor(Object value, Map<String, Object> props, int fallback, double t) {
        if (value == null) return fallback;
        Track.Span span = Track.spanAt(value, t);
        if (span != null) {
            int a = resolveColor(span.from(), props, fallback, t);
            int b = resolveColor(span.to(), props, fallback, t);
            return lerp(a, b, span.blend());
        }
        Object v = value;
        if (v instanceof String s && s.startsWith("@")) {
            Object p = props.get(s.substring(1));
            if (p == null) return fallback;
            v = p;
        }
        try {
            return (int) Long.parseLong(String.valueOf(v).replace("#", ""), 16) & 0xFFFFFF;
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
