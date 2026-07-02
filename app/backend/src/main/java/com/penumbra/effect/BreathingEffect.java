package com.penumbra.effect;

/** One color fading in and out. */
public class BreathingEffect implements Effect {
    private final int rgb;
    private final double speed;   // breaths per second
    public BreathingEffect(int rgb, double speed) {
        this.rgb = rgb;
        this.speed = speed;
    }
    public String name() { return "breathing"; }
    public int colorAt(double pos, long t) {
        double b = 0.5 * (1 - Math.cos((t / 1000.0) * speed * 2 * Math.PI));
        int r = (int) (((rgb >> 16) & 0xFF) * b);
        int g = (int) (((rgb >> 8) & 0xFF) * b);
        int bl = (int) ((rgb & 0xFF) * b);
        return (r << 16) | (g << 8) | bl;
    }
}
