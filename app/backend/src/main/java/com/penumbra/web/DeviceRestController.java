package com.penumbra.web;

import com.penumbra.device.DetectedDevice;
import com.penumbra.device.DeviceManager;
import com.penumbra.effect.*;
import com.penumbra.hid.HidService;
import org.springframework.web.bind.annotation.*;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.ResourceBundle;

/**
 * The whole UI API. Local only. No auth — it binds to 127.0.0.1.
 */
@RestController
@RequestMapping("/api")
// Allow-list only. A wildcard here lets any website the user visits read this
// local API (HID enumeration, effect control) since it binds 127.0.0.1 that the
// browser can still reach. Enumerate the Vite dev + Tauri webview origins.
@CrossOrigin(origins = {
        "http://localhost:5173", "http://127.0.0.1:5173",   // Vite dev
        "http://tauri.localhost", "https://tauri.localhost", // Tauri v2 webview (Windows)
        "tauri://localhost"                                   // Tauri webview (macOS/Linux)
})
public class DeviceRestController {

    private final DeviceManager deviceManager;
    private final EffectEngine engine;
    private final HidService hid;

    public DeviceRestController(DeviceManager deviceManager, EffectEngine engine, HidService hid) {
        this.deviceManager = deviceManager;
        this.engine = engine;
        this.hid = hid;
    }

    /** Raw dump of every attached HID device — use it to find an unknown controller's VID/PID. */
    @GetMapping("/hid/scan")
    public List<Map<String, Object>> hidScan() {
        return hid.attachedDevices().stream().map(d -> Map.<String, Object>of(
                "vid", String.format("0x%04X", d.getVendorId() & 0xFFFF),
                "pid", String.format("0x%04X", d.getProductId() & 0xFFFF),
                "product", d.getProduct() == null ? "" : d.getProduct(),
                "manufacturer", d.getManufacturer() == null ? "" : d.getManufacturer(),
                "interface", d.getInterfaceNumber(),
                "usagePage", String.format("0x%04X", d.getUsagePage() & 0xFFFF))).toList();
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

    /** Recognized controllers Penumbra refuses to drive, with a reason for the UI to show. */
    @GetMapping("/unsupported")
    public List<Map<String, Object>> unsupported() {
        return deviceManager.unsupported().stream().map(u -> Map.<String, Object>of(
                "id", u.id(),
                "name", u.name(),
                "reason", u.reason())).toList();
    }

    /**
     * UI strings for the requested language ("en", "pt", ...). No-fallback control
     * so an unknown language lands on the English base bundle, not the OS locale.
     */
    @GetMapping("/i18n")
    public Map<String, String> i18n(@RequestParam(name = "lang", required = false) String lang) {
        Locale locale = (lang == null || lang.isBlank()) ? Locale.getDefault() : Locale.forLanguageTag(lang);
        ResourceBundle bundle = ResourceBundle.getBundle("i18n.messages", locale,
                ResourceBundle.Control.getNoFallbackControl(ResourceBundle.Control.FORMAT_PROPERTIES));
        Map<String, String> out = new LinkedHashMap<>();
        for (String key : Collections.list(bundle.getKeys())) out.put(key, bundle.getString(key));
        return out;
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
