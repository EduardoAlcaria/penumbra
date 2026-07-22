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
                new EffectSpec.Layer("sweep", "#0000FF", null, "x", "0.25", "0.0", null, null);
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
