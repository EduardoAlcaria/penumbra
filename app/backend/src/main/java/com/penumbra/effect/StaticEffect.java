package com.penumbra.effect;

/** One solid color. */
public class StaticEffect implements Effect {
    private final int rgb;
    public StaticEffect(int rgb) { this.rgb = rgb; }
    public String name() { return "static"; }
    public int colorAt(double pos, long t) { return rgb; }
}
