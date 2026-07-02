package com.penumbra.effect;

/** Rainbow wave travelling along the LED chain. */
public class RainbowEffect implements Effect {
    private final double speed;   // cycles per second
    private final double spread;  // rainbows across the chain
    public RainbowEffect(double speed, double spread) {
        this.speed = speed;
        this.spread = spread;
    }
    public String name() { return "rainbow"; }
    public int colorAt(double pos, long t) {
        double h = pos * spread + (t / 1000.0) * speed;
        return Effect.hsv(h, 1.0, 1.0);
    }
}
