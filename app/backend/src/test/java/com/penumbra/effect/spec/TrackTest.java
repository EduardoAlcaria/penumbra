package com.penumbra.effect.spec;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class TrackTest {

    /** keys: 0s -> 0, 2s -> 10, linear, looping. */
    private static Map<String, Object> ramp() {
        return Map.of("keys", List.of(
                Map.of("t", 0.0, "v", 0.0),
                Map.of("t", 2.0, "v", 10.0)));
    }

    private static double at(Object track, double t) {
        Track.Span s = Track.spanAt(track, t);
        assertNotNull(s, "expected a track");
        double a = Double.parseDouble(String.valueOf(s.from()));
        double b = Double.parseDouble(String.valueOf(s.to()));
        return a + (b - a) * s.blend();
    }

    @Test
    void scalarsAreNotTracks() {
        assertFalse(Track.isTrack("0.3"));
        assertFalse(Track.isTrack("@speed"));
        assertFalse(Track.isTrack(null));
        assertFalse(Track.isTrack(Map.of("keys", List.of())));
        assertNull(Track.spanAt("0.3", 1.0));
    }

    @Test
    void interpolatesBetweenKeys() {
        assertEquals(0.0, at(ramp(), 0.0), 1e-9);
        assertEquals(5.0, at(ramp(), 1.0), 1e-9);
        assertEquals(2.5, at(ramp(), 0.5), 1e-9);
    }

    @Test
    void loopsByDefault() {
        // 2.5s into a 2s track is 0.5s in.
        assertEquals(at(ramp(), 0.5), at(ramp(), 2.5), 1e-9);
        // Negative time wraps forward, not backwards past the start.
        assertEquals(at(ramp(), 1.5), at(ramp(), -0.5), 1e-9);
    }

    @Test
    void loopFalseHoldsTheEnds() {
        Map<String, Object> t = Map.of("loop", false, "keys", List.of(
                Map.of("t", 0.0, "v", 0.0),
                Map.of("t", 2.0, "v", 10.0)));
        assertEquals(0.0, at(t, -5.0), 1e-9);
        assertEquals(10.0, at(t, 99.0), 1e-9);
    }

    @Test
    void easeShapesTheSegmentItStarts() {
        Map<String, Object> t = Map.of("keys", List.of(
                Map.of("t", 0.0, "v", 0.0, "ease", "in"),
                Map.of("t", 2.0, "v", 10.0)));
        // quad-in at the midpoint is a quarter of the way, not half.
        assertEquals(2.5, at(t, 1.0), 1e-9);
    }

    @Test
    void holdDoesNotInterpolate() {
        Map<String, Object> t = Map.of("keys", List.of(
                Map.of("t", 0.0, "v", 3.0, "ease", "hold"),
                Map.of("t", 2.0, "v", 9.0)));
        assertEquals(3.0, at(t, 1.9), 1e-9);
    }

    @Test
    void singleKeyIsAConstant() {
        Object t = Map.of("keys", List.of(Map.of("t", 4.0, "v", 7.0)));
        assertEquals(7.0, at(t, 0.0), 1e-9);
        assertEquals(7.0, at(t, 100.0), 1e-9);
    }

    @Test
    void keysAreSortedByTime() {
        Object t = Map.of("keys", List.of(
                Map.of("t", 2.0, "v", 10.0),
                Map.of("t", 0.0, "v", 0.0)));
        assertEquals(5.0, at(t, 1.0), 1e-9);
    }

    @Test
    void endpointsAreLeftRawSoTheResolverCanHandleThem() {
        // A track over property references must hand the refs back untouched.
        Object t = Map.of("keys", List.of(
                Map.of("t", 0.0, "v", "@a"),
                Map.of("t", 1.0, "v", "#ff0000")));
        Track.Span s = Track.spanAt(t, 0.5);
        assertNotNull(s);
        assertEquals("@a", s.from());
        assertEquals("#ff0000", s.to());
        assertEquals(0.5, s.blend(), 1e-9);
    }
}
