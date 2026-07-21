package com.penumbra.layout;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Pure geometry: assignments + the controller's per-channel LED offsets +
 * each component's local coordinates -> fan placements with per-LED world
 * coordinates. No Spring, no hardware — the piece worth unit-testing.
 *
 * Layout rule (v1): fans in a channel run left→right along X; channels stack
 * down Y. Deliberately simple; drag-to-arrange is a later layer.
 */
public final class LayoutBuilder {

    private static final double GAP = 2;         // world units between fans / channels
    private static final double ROW_HEIGHT = 8;  // vertical pitch between channels

    private LayoutBuilder() { }

    public record FanSpec(long componentId, String name, String imageUrl,
                          int width, int height, int[][] coords) { }

    public record LedPoint(int flatIndex, double x, double y) { }

    public record FanPlacement(long componentId, String name, String imageUrl,
                               int channel, int position,
                               double originX, double originY, int width, int height,
                               List<LedPoint> leds) { }

    public record Layout(List<FanPlacement> fans,
                         double minX, double minY, double maxX, double maxY) { }

    public static Layout build(int[] ledsPerChannel, Map<Integer, List<FanSpec>> chainsByChannel) {
        List<FanPlacement> fans = new ArrayList<>();
        double minX = Double.POSITIVE_INFINITY, minY = Double.POSITIVE_INFINITY;
        double maxX = Double.NEGATIVE_INFINITY, maxY = Double.NEGATIVE_INFINITY;

        for (int ch = 0; ch < ledsPerChannel.length; ch++) {
            List<FanSpec> chain = chainsByChannel.get(ch);
            if (chain == null || chain.isEmpty()) continue;

            int globalOffset = 0;
            for (int c = 0; c < ch; c++) globalOffset += ledsPerChannel[c];

            double yBase = ch * (ROW_HEIGHT + GAP);
            double xCursor = 0;
            int localFlat = 0;

            for (int p = 0; p < chain.size(); p++) {
                FanSpec fan = chain.get(p);
                List<LedPoint> leds = new ArrayList<>(fan.coords().length);
                for (int i = 0; i < fan.coords().length; i++) {
                    int flat = globalOffset + localFlat + i;
                    double x = xCursor + fan.coords()[i][0];
                    double y = yBase + fan.coords()[i][1];
                    leds.add(new LedPoint(flat, x, y));
                    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
                    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
                }
                fans.add(new FanPlacement(fan.componentId(), fan.name(), fan.imageUrl(),
                        ch, p, xCursor, yBase, fan.width(), fan.height(), leds));
                localFlat += fan.coords().length;
                xCursor += fan.width() + GAP;
            }
        }

        if (fans.isEmpty()) return new Layout(List.of(), 0, 0, 0, 0);
        return new Layout(fans, minX, minY, maxX, maxY);
    }
}
