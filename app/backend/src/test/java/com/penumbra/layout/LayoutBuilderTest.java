package com.penumbra.layout;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class LayoutBuilderTest {

    private static final double CELL = LayoutBuilder.CELL;

    // A tiny 2-LED "fan": LED0 at cell (0,0), LED1 at cell (2,0), 3 cells wide.
    private static LayoutBuilder.FanSpec tinyFan(long id) {
        return new LayoutBuilder.FanSpec(id, "Tiny", "", 3, 1, new int[][] { {0, 0}, {2, 0} }, null, null);
    }

    private static LayoutBuilder.FanSpec placedFan(long id, double x, double y) {
        return new LayoutBuilder.FanSpec(id, "Tiny", "", 3, 1, new int[][] { {0, 0}, {2, 0} }, x, y);
    }

    @Test
    void twoFansOnOneChannelSitSideBySide() {
        LayoutBuilder.Layout layout = LayoutBuilder.build(
                new int[] { 10 },
                Map.of(0, List.of(tinyFan(1L), tinyFan(2L))));

        assertEquals(2, layout.fans().size());
        LayoutBuilder.FanPlacement f0 = layout.fans().get(0);
        LayoutBuilder.FanPlacement f1 = layout.fans().get(1);

        // Fan 1 sits one fan width plus one gap to the right of fan 0.
        assertEquals(3 * CELL + 2 * CELL, f1.originX() - f0.originX());
        assertEquals(f0.originY(), f1.originY());

        // Flat indices run through the chain.
        assertEquals(0, f0.leds().get(0).flatIndex());
        assertEquals(1, f0.leds().get(1).flatIndex());
        assertEquals(2, f1.leds().get(0).flatIndex());

        // LEDs sit at cell centers, measured from the fan's origin.
        assertEquals(f0.originX() + 0.5 * CELL, f0.leds().get(0).x());
        assertEquals(f0.originX() + 2.5 * CELL, f0.leds().get(1).x());
        assertEquals(2, f0.leds().get(1).cx());
    }

    @Test
    void secondChannelOffsetsFlatIndexByPriorChannelCount() {
        LayoutBuilder.Layout layout = LayoutBuilder.build(
                new int[] { 10, 10 },
                Map.of(1, List.of(tinyFan(1L))));

        LayoutBuilder.FanPlacement f = layout.fans().get(0);
        assertEquals(1, f.channel());
        assertEquals(10, f.leds().get(0).flatIndex());
        assertEquals(11, f.leds().get(1).flatIndex());
    }

    @Test
    void channelsStackDown() {
        LayoutBuilder.Layout layout = LayoutBuilder.build(
                new int[] { 10, 10 },
                Map.of(0, List.of(tinyFan(1L)), 1, List.of(tinyFan(2L))));

        double y0 = layout.fans().stream().filter(f -> f.channel() == 0).findFirst().orElseThrow().originY();
        double y1 = layout.fans().stream().filter(f -> f.channel() == 1).findFirst().orElseThrow().originY();
        assertTrue(y1 > y0, "channel 1 must sit below channel 0");
    }

    @Test
    void autoArrangedFansAreCenteredOnTheCanvas() {
        LayoutBuilder.Layout layout = LayoutBuilder.build(
                new int[] { 10 },
                Map.of(0, List.of(tinyFan(1L))));

        LayoutBuilder.FanPlacement f = layout.fans().get(0);
        assertEquals((LayoutBuilder.CANVAS_W - 3 * CELL) / 2, f.originX());
        assertEquals((LayoutBuilder.CANVAS_H - 1 * CELL) / 2, f.originY());
    }

    @Test
    void storedPlacementWinsOverAutoArrange() {
        LayoutBuilder.Layout layout = LayoutBuilder.build(
                new int[] { 10 },
                Map.of(0, List.of(placedFan(1L, 12, 34))));

        LayoutBuilder.FanPlacement f = layout.fans().get(0);
        assertEquals(12.0, f.originX());
        assertEquals(34.0, f.originY());
        assertEquals(12 + 0.5 * CELL, f.leds().get(0).x());
        assertEquals(34 + 0.5 * CELL, f.leds().get(0).y());
    }

    @Test
    void boundsAreTheCanvasNotTheFans() {
        LayoutBuilder.Layout layout = LayoutBuilder.build(
                new int[] { 10 },
                Map.of(0, List.of(tinyFan(1L), tinyFan(2L))));
        assertEquals(0.0, layout.minX());
        assertEquals(0.0, layout.minY());
        assertEquals(LayoutBuilder.CANVAS_W, layout.maxX());
        assertEquals(LayoutBuilder.CANVAS_H, layout.maxY());
    }
}
