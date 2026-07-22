package com.penumbra.web;

import com.penumbra.device.DetectedDevice;
import com.penumbra.device.DeviceManager;
import com.penumbra.effect.*;
import com.penumbra.effect.spec.EffectSpec;
import com.penumbra.hid.HidService;
import com.penumbra.profile.ComponentProfileRepository;
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
        "http://localhost:8788", "http://127.0.0.1:8788",   // Vite dev
        "http://tauri.localhost", "https://tauri.localhost", // Tauri v2 webview (Windows)
        "tauri://localhost"                                   // Tauri webview (macOS/Linux)
})
public class DeviceRestController {

    private final DeviceManager deviceManager;
    private final EffectEngine engine;
    private final HidService hid;
    private final ComponentProfileRepository components;
    private final com.fasterxml.jackson.databind.ObjectMapper mapper;
    private final com.penumbra.layout.LayoutService layout;
    private final EffectStore effects;

    public DeviceRestController(DeviceManager deviceManager, EffectEngine engine, HidService hid,
                                ComponentProfileRepository components,
                                com.fasterxml.jackson.databind.ObjectMapper mapper,
                                com.penumbra.layout.LayoutService layout,
                                EffectStore effects) {
        this.deviceManager = deviceManager;
        this.engine = engine;
        this.hid = hid;
        this.components = components;
        this.mapper = mapper;
        this.layout = layout;
        this.effects = effects;
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

    /** The bundled gear library (fans/strips distilled from SignalRGB), for the Devices screen. */
    @GetMapping("/components")
    public List<Map<String, Object>> components() {
        return components.findAll().stream().map(c -> Map.<String, Object>of(
                "id", c.getId(),
                "name", c.getDisplayName() == null ? String.valueOf(c.getProductName()) : c.getDisplayName(),
                "brand", c.getBrand() == null ? "" : c.getBrand(),
                "type", c.getType() == null ? "" : c.getType(),
                "ledCount", c.getLedCount(),
                "width", c.getWidth(),
                "height", c.getHeight(),
                "ledCoordinates", parseCoords(c.getLedCoordinatesJson()),
                "imageUrl", c.getImageUrl() == null ? "" : c.getImageUrl())).toList();
    }

    @GetMapping("/layout")
    public Map<String, Object> layout() {
        List<Map<String, Object>> controllers = new java.util.ArrayList<>();
        for (String key : layout.controllerKeys()) {
            controllers.add(layoutDto(key, layout.layoutFor(key)));
        }
        return Map.of("controllers", controllers);
    }

    @PutMapping("/layout/assignments")
    public Map<String, Object> setAssignments(@RequestParam String controllerKey,
                                              @RequestBody List<com.penumbra.layout.LayoutService.AssignmentDto> items) {
        layout.setAssignments(controllerKey, items);
        return layoutDto(controllerKey, layout.layoutFor(controllerKey));
    }

    private static Map<String, Object> layoutDto(String key, com.penumbra.layout.LayoutBuilder.Layout l) {
        List<Map<String, Object>> fans = l.fans().stream().map(f -> Map.<String, Object>of(
                "componentId", f.componentId(),
                "name", f.name(),
                "imageUrl", f.imageUrl(),
                "channel", f.channel(),
                "position", f.position(),
                "originX", f.originX(),
                "originY", f.originY(),
                "width", f.width(),
                "height", f.height(),
                "leds", f.leds().stream().map(p -> Map.<String, Object>of(
                        "flatIndex", p.flatIndex(), "x", p.x(), "y", p.y())).toList())).toList();
        return Map.of(
                "controllerKey", key,
                "bounds", Map.of("minX", l.minX(), "minY", l.minY(), "maxX", l.maxX(), "maxY", l.maxY()),
                "fans", fans);
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

    @GetMapping("/effects")
    public List<Map<String, Object>> effects() {
        return effects.all().stream().map(DeviceRestController::effectDto).toList();
    }

    /** The current effect + its property values, so the UI restores after a restart. */
    @GetMapping("/effect/active")
    public Map<String, Object> activeEffect() {
        return Map.of("name", engine.activeName(), "props", engine.activeProps());
    }

    /** An n-wide strip of the active effect's canvas right now, for a live preview. */
    @GetMapping("/effect/canvas")
    public Map<String, Object> effectCanvas(@RequestParam(name = "n", defaultValue = "48") int n) {
        return Map.of("colors", engine.previewStrip(Math.min(Math.max(n, 1), 256)));
    }

    /** body: {"name":"side-to-side","props":{...}} or {"yaml":"...","props":{...}} */
    @PostMapping("/effect")
    public Map<String, Object> setEffect(@RequestBody Map<String, Object> body) {
        EffectSpec spec;
        Object yaml = body.get("yaml");
        if (yaml instanceof String s && !s.isBlank()) {
            spec = effects.parse(s);
        } else {
            spec = effects.byName(String.valueOf(body.get("name")));
        }
        @SuppressWarnings("unchecked")
        Map<String, Object> props = body.get("props") instanceof Map<?, ?> m
                ? (Map<String, Object>) m : Map.of();
        engine.setEffect(spec, props);
        return Map.of("effect", engine.activeName());
    }

    @GetMapping("/frame")
    public Map<String, Object> frame() {
        List<Map<String, Object>> controllers = new java.util.ArrayList<>();
        for (String key : layout.controllerKeys()) {
            int[] colors = engine.frameFor(key);
            List<String> hex = new java.util.ArrayList<>(colors.length);
            for (int c : colors) hex.add(String.format("#%06X", c & 0xFFFFFF));
            controllers.add(Map.of("controllerKey", key, "colors", hex));
        }
        return Map.of("controllers", controllers);
    }

    private static Map<String, Object> effectDto(EffectSpec e) {
        List<Map<String, Object>> props = (e.properties() == null ? List.<EffectSpec.Property>of() : e.properties())
                .stream().map(p -> {
                    Map<String, Object> m = new java.util.LinkedHashMap<>();
                    m.put("key", p.key());
                    m.put("label", p.label());
                    m.put("type", p.type());
                    m.put("default", p.def());
                    m.put("min", p.min());
                    m.put("max", p.max());
                    m.put("values", p.values());
                    return m;
                }).toList();
        return Map.of(
                "name", e.name(),
                "description", e.description() == null ? "" : e.description(),
                "properties", props);
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

    /** Parse a component's "[[x,y],…]" LedCoordinates JSON into a list; [] on any problem. */
    private List<List<Integer>> parseCoords(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            return mapper.readValue(json,
                    new com.fasterxml.jackson.core.type.TypeReference<List<List<Integer>>>() { });
        } catch (Exception e) {
            return List.of();
        }
    }
}
