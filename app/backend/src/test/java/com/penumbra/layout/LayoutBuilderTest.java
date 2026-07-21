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
