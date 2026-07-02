package com.penumbra.web;

import com.penumbra.device.DetectedDevice;
import com.penumbra.device.DeviceManager;
import com.penumbra.effect.*;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * The whole UI API. Local only. No auth — it binds to 127.0.0.1.
 */
@RestController
@RequestMapping("/api")
@CrossOrigin(origins = {"http://localhost:5173", "http://127.0.0.1:5173"})  // Vite dev
public class DeviceRestController {

    private final DeviceManager deviceManager;
    private final EffectEngine engine;

    public DeviceRestController(DeviceManager deviceManager, EffectEngine engine) {
        this.deviceManager = deviceManager;
        this.engine = engine;
    }

    @GetMapping("/status")
    public Map<String, Object> status() {
        return Map.of(
                "effect", engine.activeName(),
                "deviceCount", deviceManager.devices().size());
    }

    @GetMapping("/devices")
    public List<Map<String, Object>> devices() {
        return deviceManager.devices().stream().map(DeviceRestController::toDto).toList();
    }

    @PostMapping("/rescan")
    public List<Map<String, Object>> rescan() {
        deviceManager.rescan();
        return devices();
    }

    /** body: {"type":"rainbow","color":"#009bde","speed":0.2,"spread":1.0} */
    @PostMapping("/effect")
    public Map<String, Object> setEffect(@RequestBody EffectRequest req) {
        engine.setEffect(build(req));
        return Map.of("effect", engine.activeName());
    }

    private Effect build(EffectRequest req) {
        int rgb = parseHex(req.color());
        double speed = req.speed() == null ? 0.2 : req.speed();
        return switch (req.type() == null ? "rainbow" : req.type()) {
            case "static" -> new StaticEffect(rgb);
            case "breathing" -> new BreathingEffect(rgb, speed);
            default -> new RainbowEffect(speed, req.spread() == null ? 1.0 : req.spread());
        };
    }

    private static Map<String, Object> toDto(DetectedDevice d) {
        return Map.of(
                "id", d.id(),
                "name", d.getProfile().getName(),
                "brand", d.getProfile().getBrand(),
                "channels", d.getProfile().getChannelCount(),
                "ledsPerChannel", d.getLedsPerChannel(),
                "totalLeds", d.getTotalLeds());
    }

    private static int parseHex(String hex) {
        if (hex == null) return 0x009bde;
        return (int) Long.parseLong(hex.replace("#", ""), 16) & 0xFFFFFF;
    }

    public record EffectRequest(String type, String color, Double speed, Double spread) { }
}
