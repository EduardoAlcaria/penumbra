package com.penumbra.effect.spec;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

/**
 * An effect parsed from YAML: editable properties + parametric layers painted
 * onto a 2-D canvas, with keyframe Tracks on any animatable layer field.
 * Records ignore unknown fields so the format can grow without breaking old files.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record EffectSpec(
        String name,
        String description,
        Canvas canvas,
        List<Property> properties,
        List<Layer> layers) {

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Canvas(int width, int height) { }

    /** A user-editable control. "default" is a YAML keyword-ish key, mapped explicitly. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Property(
            String key,
            String label,
            String type,
            @JsonProperty("default") Object def,
            Double min,
            Double max,
            List<String> values) { }

    /**
     * One parametric paint op. Unused fields are null for a given type.
     *
     * Animatable fields are Object because each accepts three shapes: a literal
     * ("0.3", "#ff0000"), a property reference ("@speed"), or a {@link Track} of
     * keyframes. The renderer resolves all three, and a track's endpoints go
     * back through the same resolver, so keyframing a property reference works.
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Layer(
            String type,
            Object color,
            Object color2,
            String axis,
            Object band,
            Object speed,
            Object spread,
            Object center) { }
}
