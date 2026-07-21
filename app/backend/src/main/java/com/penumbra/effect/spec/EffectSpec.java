package com.penumbra.effect.spec;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

/**
 * An effect parsed from YAML: editable properties + parametric layers painted
 * onto a 2-D canvas. Keyframes are intentionally absent in v1 (Layer 3 editor).
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

    /** One parametric paint op. Unused fields are null for a given type. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Layer(
            String type,
            String color,
            String color2,
            String axis,
            Double band,
            Double speed,
            Double spread,
            Double center) { }
}
