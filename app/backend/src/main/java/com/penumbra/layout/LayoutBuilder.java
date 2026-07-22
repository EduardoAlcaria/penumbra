package com.penumbra.layout;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Pure geometry: assignments + the controller's per-channel LED offsets +
 * each component's local coordinates -> fan placements with per-LED canvas
 * coordinates. No Spring, no hardware — the piece worth unit-testing.
 *
 * Coordinates are pixels on the same fixed 320x200 canvas the effects paint,
 * which is how SignalRGB models it: the canvas never resizes, a device just
 * occupies a rect on it and shows whatever the effect is doing there.
 *
 * A fan with no stored placement is auto-arranged: fans in a channel run
 * left->right, channels stack down, and the whole block is centered. Dragging a
 * fan stores an explicit placement that wins over the auto position.
 */
public final class LayoutBuilder {

    /** The effect canvas, in pixels. Matches SignalRGB's hardcoded 320x200. */
    public static final int CANVAS_W = 320;
    public static final int CANVAS_H = 200;

    /**
     * A fan's footprint on the canvas, in pixels. Square, because a fan is square
     * — the component's LED grid is not (a CS120 addresses 11x7), so each axis
     * gets its own cell size, which is what SignalRGB's separate scaleX/scaleY
     * are for.
     * ponytail: one size for every fan; split per component when a 140mm shows up.
     */
    public static final double FAN_SIZE = 40;

    /** Between channels only. Fans daisy-chained on one channel sit flush. */
    private static final double GAP = 8;

    private LayoutBuilder() { }

    /** x/y are an explicit canvas placement for this fan; null means auto-arrange. */
    public record FanSpec(long componentId, String name, String imageUrl,
                          int width, int height, int[][] coords,
                          Double x, Double y) { }

    /** x/y are canvas pixels; cx/cy are the LED's cell in the component's own grid. */
    public record LedPoint(int flatIndex, double x, double y, int cx, int cy) { }

    /** width/height are canvas pixels; cols/rows are the component's LED grid. */
    public record FanPlacement(long componentId, String name, String imageUrl,
                               int channel, int position,
                               double originX, double originY, double width, double height,
                               int cols, int rows, List<LedPoint> leds) { }

    public record Layout(List<FanPlacement> fans,
                         double minX, double minY, double maxX, double maxY) { }

    public static Layout build(int[] ledsPerChannel, Map<Integer, List<FanSpec>> chainsByChannel) {
        // Pass 1: auto position every fan, so the block can be centered as a whole.
        record Auto(int channel, int position, FanSpec spec, int flat, double x, double y) { }
        List<Auto> autos = new ArrayList<>();
        double autoMaxX = 0, autoMaxY = 0;

        for (int ch = 0; ch < ledsPerChannel.length; ch++) {
            List<FanSpec> chain = chainsByChannel.get(ch);
            if (chain == null || chain.isEmpty()) continue;

            int globalOffset = 0;
            for (int c = 0; c < ch; c++) globalOffset += ledsPerChannel[c];

            double y = ch * (FAN_SIZE + GAP);
            double x = 0;
            int localFlat = 0;
            for (int p = 0; p < chain.size(); p++) {
                FanSpec fan = chain.get(p);
                autos.add(new Auto(ch, p, fan, globalOffset + localFlat, x, y));
                localFlat += fan.coords().length;
                x += FAN_SIZE; // flush: a daisy chain reads as one block of fans
                autoMaxX = Math.max(autoMaxX, x);
                autoMaxY = Math.max(autoMaxY, y + FAN_SIZE);
            }
        }
        if (autos.isEmpty()) return new Layout(List.of(), 0, 0, CANVAS_W, CANVAS_H);

        double shiftX = Math.max(0, (CANVAS_W - autoMaxX) / 2);
        double shiftY = Math.max(0, (CANVAS_H - autoMaxY) / 2);

        // Pass 2: emit, letting a stored placement override the auto position.
        List<FanPlacement> fans = new ArrayList<>(autos.size());
        for (Auto a : autos) {
            FanSpec fan = a.spec();
            double originX = fan.x() != null ? fan.x() : a.x() + shiftX;
            double originY = fan.y() != null ? fan.y() : a.y() + shiftY;
            // Per-axis cell size: the grid is squeezed onto the square footprint.
            double cellW = FAN_SIZE / Math.max(1, fan.width());
            double cellH = FAN_SIZE / Math.max(1, fan.height());
            List<LedPoint> leds = new ArrayList<>(fan.coords().length);
            for (int i = 0; i < fan.coords().length; i++) {
                int cx = fan.coords()[i][0], cy = fan.coords()[i][1];
                // Cell centers, like SignalRGB sampling a device grid pixel: the
                // LED at cell (cx, cy) reads canvas (originX + (cx+0.5)*cellW, ...).
                leds.add(new LedPoint(a.flat() + i,
                        originX + (cx + 0.5) * cellW,
                        originY + (cy + 0.5) * cellH, cx, cy));
            }
            fans.add(new FanPlacement(fan.componentId(), fan.name(), fan.imageUrl(),
                    a.channel(), a.position(), originX, originY,
                    FAN_SIZE, FAN_SIZE,
                    fan.width(), fan.height(), leds));
        }
        // Bounds are the canvas, not the fans: the effect always spans the canvas.
        return new Layout(fans, 0, 0, CANVAS_W, CANVAS_H);
    }
}
