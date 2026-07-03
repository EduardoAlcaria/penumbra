package com.penumbra.profile;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Component;

/**
 * One-time data import. Populates H2 from data BUNDLED IN THE JAR:
 *  - passive gear LED maps  <- classpath:/components/**.json (copied from SignalRGB once, now ours)
 *  - controller recipes     <- extracted from the device .js into code below
 *
 * No dependency on SignalRGB at runtime OR first boot. Runs only when tables
 * are empty, so it's cheap on every start.
 */
@Component
public class ProfileSeeder implements CommandLineRunner {
    private static final Logger log = LoggerFactory.getLogger(ProfileSeeder.class);

    private final ControllerProfileRepository controllers;
    private final ComponentProfileRepository components;
    private final ObjectMapper mapper = new ObjectMapper();

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
        // 16/32ch are seeded so they are RECOGNIZED (the UI can warn the user), but the
        // framing guard in DetectedDevice refuses to DRIVE them: they speak OpenRGB's
        // 1025-byte SendPacket protocol, not this interval-6 framing. They stay disabled
        // until a real "nollie_big" framing exists.
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

    /** Load every bundled classpath:/components/**.json into component_profile. */
    private void importComponents() {
        int n = 0;
        try {
            Resource[] files = new PathMatchingResourcePatternResolver()
                    .getResources("classpath*:/components/**/*.json");
            for (Resource r : files) {
                try (var in = r.getInputStream()) {
                    JsonNode j = mapper.readTree(in);
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
                    n++;
                } catch (Exception e) {
                    log.debug("Skip {}: {}", r.getFilename(), e.getMessage());
                }
            }
        } catch (Exception e) {
            log.warn("Component import failed: {}", e.getMessage());
        }
        log.info("Imported {} bundled component profiles", n);
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
