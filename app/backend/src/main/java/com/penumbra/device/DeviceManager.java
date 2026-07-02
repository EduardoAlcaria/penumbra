package com.penumbra.device;

import com.penumbra.hid.HidService;
import com.penumbra.profile.ControllerProfile;
import com.penumbra.profile.ControllerProfileRepository;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.hid4java.HidDevice;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
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

    public DeviceManager(HidService hidService, ControllerProfileRepository profiles) {
        this.hidService = hidService;
        this.profiles = profiles;
    }

    @PostConstruct
    void init() { rescan(); }

    /** Match attached HID devices to known controller profiles. */
    public synchronized void rescan() {
        for (HidDevice dev : hidService.attachedDevices()) {
            String key = String.format("%04X:%04X:%s", dev.getVendorId() & 0xFFFF,
                    dev.getProductId() & 0xFFFF, dev.getPath());
            if (active.containsKey(key)) continue;

            profiles.findByVendorIdAndProductId(dev.getVendorId() & 0xFFFF, dev.getProductId() & 0xFFFF)
                .filter(p -> p.getHidInterface() < 0 || p.getHidInterface() == dev.getInterfaceNumber())
                .ifPresent(profile -> attach(key, profile, dev));
        }
    }

    private void attach(String key, ControllerProfile profile, HidDevice dev) {
        DetectedDevice device = new DetectedDevice(profile, dev);
        if (device.initialize()) {
            active.put(key, device);
            log.info("Attached {}", profile.getName());
        }
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
