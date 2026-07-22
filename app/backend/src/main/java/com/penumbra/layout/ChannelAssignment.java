package com.penumbra.layout;

import jakarta.persistence.*;

/**
 * One component sitting at a position in a controller channel's daisy chain.
 * "Nollie channel 0 = [CS120, CS120]" is two rows: position 0 and position 1.
 * The controller can't report which model is plugged in, so the user declares it.
 */
@Entity
@Table(name = "channel_assignment")
public class ChannelAssignment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** "VID:PID" of the controller, e.g. "16D5:2A08" (DetectedDevice.id()). */
    private String controllerKey;

    /** 0-based channel index on that controller. */
    private int channel;

    /** Order of this component within the channel's chain (0,1,2…). */
    private int position;

    /** FK → ComponentProfile.id. */
    private Long componentId;

    /** Explicit placement on the 320x200 effect canvas; null = auto-arranged. */
    private Double canvasX;
    private Double canvasY;

    public ChannelAssignment() { }

    public ChannelAssignment(String controllerKey, int channel, int position, Long componentId) {
        this.controllerKey = controllerKey;
        this.channel = channel;
        this.position = position;
        this.componentId = componentId;
    }

    public Long getId() { return id; }
    public String getControllerKey() { return controllerKey; }
    public void setControllerKey(String v) { this.controllerKey = v; }
    public int getChannel() { return channel; }
    public void setChannel(int v) { this.channel = v; }
    public int getPosition() { return position; }
    public void setPosition(int v) { this.position = v; }
    public Long getComponentId() { return componentId; }
    public void setComponentId(Long v) { this.componentId = v; }
    public Double getCanvasX() { return canvasX; }
    public void setCanvasX(Double v) { this.canvasX = v; }
    public Double getCanvasY() { return canvasY; }
    public void setCanvasY(Double v) { this.canvasY = v; }
}
