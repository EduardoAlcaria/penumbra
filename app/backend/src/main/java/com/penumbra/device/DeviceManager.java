package com.penumbra.device;

import com.penumbra.hid.HidService;
import com.penumbra.profile.ControllerProfile;
import com.penumbra.profile.ControllerProfileRepository;
import jakarta.annotation.PreDestroy;
import org.hid4java.HidDevice;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Enumerates HID devices, matches them to controller profiles by VID/PID,
 * runs auto-detect, and keeps the live device set. This is the whole
 * "plug it in and it just works" path — no user configuration.
 */
@Service
public class DeviceManager {
    private static final Logger log = LoggerFactory.getLogger(DeviceManager.class);

    private final HidService hidService;
    private final ControllerProfileRepository profiles;

    /** key = "VID:PID:path" so two identical controllers don't collide. */
    private final Map<String, DetectedDevice> active = new ConcurrentHashMap<>();

    /** Recognized controllers we refuse to drive (e.g. unsupported framing), rebuilt each rescan. */
    private volatile List<UnsupportedDevice> unsupported = List.of();

    /** A plugged-in controller we know but can't drive yet, plus why (surfaced in the UI). */
    public record UnsupportedDevice(String id, String name, String reason) { }

    public DeviceManager(HidService hidService, ControllerProfileRepository profiles) {
        this.hidService = hidService;
        this.profiles = profiles;
    }

    // After ApplicationReady so the ProfileSeeder (a CommandLineRunner) has
    // populated the profile table first — @PostConstruct scanned an empty DB
    // on first boot and matched nothing.
    @EventListener(ApplicationReadyEvent.class)
    void init() { rescan(); }

    /** Match attached HID devices to known controller profiles. */
    public synchronized void rescan() {
        List<UnsupportedDevice> refused = new ArrayList<>();
        List<HidDevice> attached = hidService.attachedDevices();

        // Prune devices no longer on the bus — unplugged, or re-enumerated with a
        // new path after a replug. Without this, rescan could only ever add.
        Set<String> present = new HashSet<>();
        for (HidDevice dev : attached) present.add(key(dev));
        active.entrySet().removeIf(e -> {
            if (present.contains(e.getKey())) return false;
            log.info("Detached {}", e.getValue().getProfile().getName());
            e.getValue().shutdown();
            return true;
        });

        for (HidDevice dev : attached) {
            String key = key(dev);
            if (active.containsKey(key)) continue;

            profiles.findByVendorIdAndProductId(dev.getVendorId() & 0xFFFF, dev.getProductId() & 0xFFFF)
                .filter(p -> p.getHidInterface() < 0 || p.getHidInterface() == dev.getInterfaceNumber())
                .ifPresent(profile -> attach(key, profile, dev, refused));
        }
        this.unsupported = List.copyOf(refused);
    }

    private static String key(HidDevice dev) {
        return String.format("%04X:%04X:%s", dev.getVendorId() & 0xFFFF,
                dev.getProductId() & 0xFFFF, dev.getPath());
    }

    private void attach(String key, ControllerProfile profile, HidDevice dev, List<UnsupportedDevice> refused) {
        DetectedDevice device = new DetectedDevice(profile, dev);
        String reason = device.unsupportedReason();
        if (reason != null) {
            refused.add(new UnsupportedDevice(device.id(), profile.getName(), reason));
            return;
        }
        if (device.initialize()) {
            active.put(key, device);
            log.info("Attached {}", profile.getName());
        }
    }

    public List<UnsupportedDevice> unsupported() {
        return unsupported;
    }

    public List<DetectedDevice> devices() {
        return List.copyOf(active.values());
    }

    @PreDestroy
    void shutdown() {
        active.values().forEach(DetectedDevice::shutdown);
        active.clear();
    }
}
