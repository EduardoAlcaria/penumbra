package com.penumbra.effect.spec;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

/**
 * A keyframe track: any animatable layer field can hold one instead of a scalar.
 *
 * <pre>
 * center:
 *   loop: true          # default; false holds the last key
 *   keys:
 *     - { t: 0.0, v: 0.0, ease: inOut }
 *     - { t: 1.5, v: 1.0, ease: inOut }
 *     - { t: 3.0, v: 0.0 }
 * </pre>
 *
 * {@code t} is seconds. {@code v} is whatever the field accepts — a number, a
 * "#rrggbb", or an "@prop" reference — so the renderer resolves the endpoints
 * and blends them, and a track over property references keeps working when the
 * user drags the slider those properties are bound to.
 *
 * {@code ease} sits on the key that *starts* a segment and shapes the run to the
 * next key.
 */
public final class Track {

    private Track() { }

    /** The two keys surrounding a time, and how far between them (already eased). */
    public record Span(Object from, Object to, double blend) { }

    /** True if this YAML value is a track rather than a scalar. */
    public static boolean isTrack(Object value) {
        return value instanceof Map<?, ?> m && m.get("keys") instanceof List<?> l && !l.isEmpty();
    }

    /**
     * Where the track sits at {@code tSeconds}. Returns null if the value is not
     * a usable track, so callers can fall back to scalar handling.
     */
    public static Span spanAt(Object value, double tSeconds) {
        if (!isTrack(value)) return null;
        Map<?, ?> track = (Map<?, ?>) value;

        record Key(double t, Object v, String ease) { }
        List<Key> keys = new ArrayList<>();
        for (Object o : (List<?>) track.get("keys")) {
            if (!(o instanceof Map<?, ?> k)) continue;
            Object v = k.get("v");
            if (v == null) continue;
            keys.add(new Key(num(k.get("t"), 0), v, str(k.get("ease"))));
        }
        if (keys.isEmpty()) return null;
        keys.sort(Comparator.comparingDouble(Key::t));
        if (keys.size() == 1) return new Span(keys.get(0).v(), keys.get(0).v(), 0);

        double first = keys.get(0).t();
        double last = keys.get(keys.size() - 1).t();
        double span = last - first;
        boolean loop = !(Boolean.FALSE.equals(track.get("loop")));

        double t = tSeconds;
        if (span <= 0) return new Span(keys.get(0).v(), keys.get(0).v(), 0);
        if (loop) {
            t = first + (((t - first) % span) + span) % span;
        } else if (t <= first) {
            return new Span(keys.get(0).v(), keys.get(0).v(), 0);
        } else if (t >= last) {
            Object v = keys.get(keys.size() - 1).v();
            return new Span(v, v, 0);
        }

        for (int i = 0; i < keys.size() - 1; i++) {
            Key a = keys.get(i), b = keys.get(i + 1);
            if (t < a.t() || t > b.t()) continue;
            double dt = b.t() - a.t();
            double f = dt <= 0 ? 0 : (t - a.t()) / dt;
            return new Span(a.v(), b.v(), ease(a.ease(), f));
        }
        Object v = keys.get(keys.size() - 1).v();
        return new Span(v, v, 0);
    }

    /** linear (default), in, out, inOut, hold. */
    private static double ease(String kind, double f) {
        if (kind == null) return f;
        return switch (kind.toLowerCase()) {
            case "in" -> f * f;
            case "out" -> 1 - (1 - f) * (1 - f);
            case "inout" -> f * f * (3 - 2 * f);
            case "hold", "step" -> 0;
            default -> f;
        };
    }

    private static double num(Object o, double fallback) {
        if (o instanceof Number n) return n.doubleValue();
        try {
            return Double.parseDouble(String.valueOf(o));
        } catch (RuntimeException e) {
            return fallback;
        }
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }
}
