package com.penumbra.effect;

import com.penumbra.device.DetectedDevice;
import com.penumbra.device.DeviceManager;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * The render loop. ~60 fps: for every LED of every device, ask the active
 * effect for a color, write it, flush the frame to hardware.
 */
@Service
public class EffectEngine {

    private final DeviceManager deviceManager;
    private volatile Effect active = new RainbowEffect(0.2, 1.0);
    private final long startMillis = System.currentTimeMillis();

    public EffectEngine(DeviceManager deviceManager) {
        this.deviceManager = deviceManager;
    }

    public void setEffect(Effect effect) {
        if (effect != null) this.active = effect;
    }

    public String activeName() { return active.name(); }

    // ponytail: fixed ~60fps; expose penumbra.render-fps as a real knob when it matters.
    @Scheduled(fixedRate = 16)
    void tick() {
        long t = System.currentTimeMillis() - startMillis;
        Effect fx = active;
        for (DetectedDevice device : deviceManager.devices()) {
            int total = device.getTotalLeds();
            if (total <= 0) continue;
            for (int i = 0; i < total; i++) {
                double pos = total == 1 ? 0.0 : i / (double) (total - 1);
                device.setLed(i, fx.colorAt(pos, t));
            }
            device.renderFrame();
        }
    }
}
