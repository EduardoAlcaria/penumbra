package com.penumbra.profile;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import java.nio.file.*;
import java.util.stream.Stream;

/**
 * One-time data import. Populates H2 from what SignalRGB already has on disk:
 *  - passive gear LED maps  <- Components/*.json  (pure data, copied as-is)
 *  - controller recipes     <- extracted by hand from the device .js into profiles
 *
 * Runs only when tables are empty, so it's cheap on every boot.
 */
@Component
public class ProfileSeeder implements CommandLineRunner {
    private static final Logger log = LoggerFactory.getLogger(ProfileSeeder.class);

    private final ControllerProfileRepository controllers;
    private final ComponentProfileRepository components;
    private final ObjectMapper mapper = new ObjectMapper();

    @Value("${penumbra.signal-components-dir:}")
    private String componentsDir;

    public ProfileSeeder(ControllerProfileRepository controllers, ComponentProfileRepository components) {
        this.controllers = controllers;
        this.components = components;
    }

    @Override
    public void run(String... args) {
        if (controllers.count() == 0) seedControllers();
        if (components.count() == 0) importComponents();
    }

    /** Nollie family recipes extracted from SignalRGB's Nollie*.js. */
    private void seedControllers() {
        // Nollie 8 v2 — the user's controller. Auto-detect: FC 03 -> 8x u16be LEDs/channel.
        controllers.save(nollie("Nollie 8 v2", 0x16D2, 0x1F01, 8));
        controllers.save(nollie("Nollie 16 v3", 0x3061, 0x4716, 16));
        controllers.save(nollie("Nollie 32",    0x3061, 0x4714, 32));
        log.info("Seeded {} controller profiles", controllers.count());
    }

    private ControllerProfile nollie(String name, int vid, int pid, int channels) {
        ControllerProfile p = new ControllerProfile();
        p.setName(name);
        p.setBrand("Nollie");
        p.setVendorId(vid);
        p.setProductId(pid);
        p.setHidInterface(0);
        p.setReportLength(65);
        p.setChannelCount(channels);
        p.setMaxLedsPerChannel(126);
        p.setColorOrder("GRB");
        p.setMaxLedsPerPacket(21);
        p.setFraming("nollie");
        p.setAutoDetectCmd("252,3");        // 0xFC 0x03
        p.setAutoDetectReply("u16be_per_channel");
        p.setLatch("255");                  // 0xFF commit
        return p;
    }

    /** Copy every SignalRGB Components/*.json into component_profile. */
    private void importComponents() {
        if (componentsDir == null || componentsDir.isBlank()) return;
        Path root = Paths.get(componentsDir);
        if (!Files.isDirectory(root)) {
            log.warn("Components dir not found, skipping import: {}", componentsDir);
            return;
        }
        int[] n = {0};
        try (Stream<Path> paths = Files.walk(root)) {
            paths.filter(pp -> pp.toString().toLowerCase().endsWith(".json")).forEach(pp -> {
                try {
                    JsonNode j = mapper.readTree(Files.readString(pp));
                    ComponentProfile c = new ComponentProfile();
                    c.setProductName(text(j, "ProductName"));
                    c.setDisplayName(text(j, "DisplayName"));
                    c.setBrand(text(j, "Brand"));
                    c.setType(text(j, "Type"));
                    c.setLedCount(j.path("LedCount").asInt(0));
                    c.setWidth(j.path("Width").asInt(0));
                    c.setHeight(j.path("Height").asInt(0));
                    c.setLedMappingJson(nodeStr(j, "LedMapping"));
                    c.setLedCoordinatesJson(nodeStr(j, "LedCoordinates"));
                    c.setLedNamesJson(nodeStr(j, "LedNames"));
                    c.setImageUrl(text(j, "ImageUrl"));
                    components.save(c);
                    n[0]++;
                } catch (Exception e) {
                    log.debug("Skip {}: {}", pp, e.getMessage());
                }
            });
        } catch (Exception e) {
            log.warn("Component import failed: {}", e.getMessage());
        }
        log.info("Imported {} component profiles from SignalRGB", n[0]);
    }

    private static String text(JsonNode j, String field) {
        JsonNode n = j.get(field);
        return n == null || n.isNull() ? null : n.asText();
    }
    private static String nodeStr(JsonNode j, String field) {
        JsonNode n = j.get(field);
        return n == null || n.isNull() ? null : n.toString();
    }
}
