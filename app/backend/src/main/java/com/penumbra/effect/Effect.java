package com.penumbra.effect;

/**
 * An effect maps (LED position along the chain, time) -> color.
 * pos is normalized 0..1 across a device's total LEDs; t is millis since start.
 * Keeping it 1D keeps effects trivial; a 2D canvas can come later if needed.
 */
public interface Effect {
    String name();

    /** @return packed 0xRRGGBB */
    int colorAt(double pos, long t);

    /** HSV(0..1) -> 0xRRGGBB helper for effects. */
    static int hsv(double h, double s, double v) {
        h = (h % 1.0 + 1.0) % 1.0;
        int i = (int) (h * 6);
        double f = h * 6 - i;
        double p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
        double r, g, b;
        switch (i % 6) {
            case 0 -> { r = v; g = t; b = p; }
            case 1 -> { r = q; g = v; b = p; }
            case 2 -> { r = p; g = v; b = t; }
            case 3 -> { r = p; g = q; b = v; }
            case 4 -> { r = t; g = p; b = v; }
            default -> { r = v; g = p; b = q; }
        }
        return ((int) (r * 255) << 16) | ((int) (g * 255) << 8) | (int) (b * 255);
    }
}
