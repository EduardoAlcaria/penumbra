package com.penumbra.layout;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.penumbra.device.DetectedDevice;
import com.penumbra.device.DeviceManager;
import com.penumbra.profile.ComponentProfile;
import com.penumbra.profile.ComponentProfileRepository;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;

/**
 * Bridges stored channel assignments and the live device set into a world
 * layout. Assignments are keyed by controller "VID:PID"; the live device
 * supplies the per-channel LED offsets the flat index depends on.
 */
@Service
public class LayoutService {

    public record AssignmentDto(int channel, int position, Long componentId) { }

    private final DeviceManager deviceManager;
    private final ChannelAssignmentRepository assignments;
    private final ComponentProfileRepository components;
    private final ObjectMapper mapper;
    private final java.util.concurrent.atomic.AtomicInteger version =
            new java.util.concurrent.atomic.AtomicInteger();

    public LayoutService(DeviceManager deviceManager, ChannelAssignmentRepository assignments,
                         ComponentProfileRepository components, ObjectMapper mapper) {
        this.deviceManager = deviceManager;
        this.assignments = assignments;
        this.components = components;
        this.mapper = mapper;
    }

    public List<String> controllerKeys() {
        return deviceManager.devices().stream().map(DetectedDevice::id).toList();
    }

    public int version() { return version.get(); }

    public LayoutBuilder.Layout layoutFor(String controllerKey) {
        DetectedDevice device = deviceManager.devices().stream()
                .filter(d -> d.id().equals(controllerKey))
                .findFirst().orElse(null);
        if (device == null || device.getLedsPerChannel() == null) {
            return new LayoutBuilder.Layout(List.of(), 0, 0, 0, 0);
        }

        Map<Integer, List<LayoutBuilder.FanSpec>> chains = new TreeMap<>();
        for (ChannelAssignment a : assignments.findByControllerKeyOrderByChannelAscPositionAsc(controllerKey)) {
            LayoutBuilder.FanSpec spec = specFor(a);
            if (spec == null) continue;
            chains.computeIfAbsent(a.getChannel(), k -> new ArrayList<>()).add(spec);
        }
        return LayoutBuilder.build(device.getLedsPerChannel(), chains);
    }

    /**
     * Flat LED index → normalized (nx, ny) in [0,1] across the effect canvas.
     * Normalized against the canvas itself, never the fans' bounding box: a fan
     * that covers a corner of the canvas must only ever see that corner of the
     * effect, exactly as SignalRGB does it.
     */
    public Map<Integer, double[]> worldMapFor(String controllerKey) {
        LayoutBuilder.Layout l = layoutFor(controllerKey);
        Map<Integer, double[]> map = new java.util.HashMap<>();
        for (LayoutBuilder.FanPlacement fan : l.fans()) {
            for (LayoutBuilder.LedPoint p : fan.leds()) {
                map.put(p.flatIndex(), new double[] {
                        p.x() / LayoutBuilder.CANVAS_W,
                        p.y() / LayoutBuilder.CANVAS_H });
            }
        }
        return map;
    }

    public void setAssignments(String controllerKey, List<AssignmentDto> items) {
        assignments.deleteByControllerKey(controllerKey);
        for (AssignmentDto it : items) {
            if (it.componentId() == null) continue;
            assignments.save(new ChannelAssignment(controllerKey, it.channel(), it.position(), it.componentId()));
        }
        version.incrementAndGet();
    }

    /** Drop a fan at (x, y) on the canvas. Null x/y puts it back on auto-arrange. */
    public void setPlacement(String controllerKey, int channel, int position, Double x, Double y) {
        assignments.findByControllerKeyAndChannelAndPosition(controllerKey, channel, position)
                .ifPresent(a -> {
                    a.setCanvasX(x);
                    a.setCanvasY(y);
                    assignments.save(a);
                    version.incrementAndGet();
                });
    }

    /** Choose the SVG artwork for every fan on a channel. Null goes back to auto. */
    public void setSvgModel(String controllerKey, int channel, String svgModel) {
        for (ChannelAssignment a : assignments.findByControllerKeyOrderByChannelAscPositionAsc(controllerKey)) {
            if (a.getChannel() != channel) continue;
            a.setSvgModel(svgModel);
            assignments.save(a);
        }
        version.incrementAndGet();
    }

    private LayoutBuilder.FanSpec specFor(ChannelAssignment a) {
        Optional<ComponentProfile> found = components.findById(a.getComponentId());
        if (found.isEmpty()) return null;
        ComponentProfile c = found.get();
        int[][] coords = parseCoords(c.getLedCoordinatesJson());
        String name = c.getDisplayName() == null ? String.valueOf(c.getProductName()) : c.getDisplayName();
        return new LayoutBuilder.FanSpec(c.getId(), name,
                c.getImageUrl() == null ? "" : c.getImageUrl(),
                c.getWidth(), c.getHeight(), coords,
                a.getCanvasX(), a.getCanvasY(), a.getSvgModel());
    }

    private int[][] parseCoords(String json) {
        if (json == null || json.isBlank()) return new int[0][];
        try {
            return mapper.readValue(json, int[][].class);
        } catch (Exception e) {
            return new int[0][];
        }
    }
}
