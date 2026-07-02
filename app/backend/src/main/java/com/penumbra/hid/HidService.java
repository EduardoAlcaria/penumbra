package com.penumbra.hid;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.hid4java.HidDevice;
import org.hid4java.HidManager;
import org.hid4java.HidServices;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * Thin wrapper over hid4java (bundles native hidapi). Enumerates attached HID
 * devices so DeviceManager can match them against controller profiles.
 */
@Service
public class HidService {
    private static final Logger log = LoggerFactory.getLogger(HidService.class);

    private HidServices hidServices;

    @PostConstruct
    void start() {
        hidServices = HidManager.getHidServices();
        hidServices.start();
        log.info("HID services started");
    }

    @PreDestroy
    void stop() {
        if (hidServices != null) {
            hidServices.shutdown();
        }
    }

    public List<HidDevice> attachedDevices() {
        return hidServices.getAttachedHidDevices();
    }
}
