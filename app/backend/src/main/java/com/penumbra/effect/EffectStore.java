package com.penumbra.effect;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import com.penumbra.effect.spec.EffectSpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * Loads the built-in effect YAMLs bundled on the classpath. Effects are backend
 * data (not Tauri-side), so the engine and the future editor share them via REST.
 */
@Service
public class EffectStore {
    private static final Logger log = LoggerFactory.getLogger(EffectStore.class);

    private final ObjectMapper yaml = new ObjectMapper(new YAMLFactory());
    private final List<EffectSpec> effects = new ArrayList<>();

    public EffectStore() {
        load();
    }

    private void load() {
        try {
            Resource[] files = new PathMatchingResourcePatternResolver()
                    .getResources("classpath:effects/*.yaml");
            for (Resource r : files) {
                try (var in = r.getInputStream()) {
                    effects.add(yaml.readValue(in, EffectSpec.class));
                }
            }
            log.info("Loaded {} built-in effects", effects.size());
        } catch (Exception e) {
            log.error("Failed loading built-in effects", e);
        }
    }

    public List<EffectSpec> all() {
        return List.copyOf(effects);
    }

    public EffectSpec byName(String name) {
        return effects.stream().filter(e -> e.name().equalsIgnoreCase(name)).findFirst().orElse(null);
    }

    public EffectSpec parse(String yamlText) {
        try {
            return yaml.readValue(yamlText, EffectSpec.class);
        } catch (Exception e) {
            throw new IllegalArgumentException("Invalid effect YAML: " + e.getMessage(), e);
        }
    }
}
