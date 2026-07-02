package com.penumbra.profile;

import jakarta.persistence.*;

/**
 * The "recipe" for talking to an RGB controller (e.g. Nollie 8 v2).
 * Extracted once from a SignalRGB device .js into pure data, then stored in H2.
 *
 * Auto-detect note: this does NOT store how many LEDs are attached. It stores
 * how to ASK the controller. The count comes from the hardware at runtime
 * (see autoDetectCmd -> the controller replies with LEDs per channel).
 */
@Entity
@Table(name = "controller_profile",
       uniqueConstraints = @UniqueConstraint(columnNames = {"vendorId", "productId"}))
public class ControllerProfile {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String name;          // "Nollie 8 v2"
    private String brand;         // "Nollie"

    private int vendorId;         // 0x16D2
    private int productId;        // 0x1F01

    /** HID interface to bind (Nollie uses interface 0). -1 = any. */
    private int hidInterface = -1;

    /** Full HID report length incl. report id byte (Nollie = 65). */
    private int reportLength = 65;

    private int channelCount = 1;
    private int maxLedsPerChannel = 126;

    /** LED byte order the controller expects. */
    private String colorOrder = "GRB";

    /** LEDs packed per output report. */
    private int maxLedsPerPacket = 21;

    /**
     * Packet framing strategy. Different vendors frame bytes differently;
     * GenericHidController switches on this. Only "nollie" implemented for now.
     */
    private String framing = "nollie";

    /** Command to query LEDs-per-channel, comma-separated bytes AFTER report id. e.g. "252,3" */
    private String autoDetectCmd = "252,3";

    /** How to parse the reply. "u16be_per_channel" = channelCount x uint16 big-endian. */
    private String autoDetectReply = "u16be_per_channel";

    /** Latch/commit packet sent after a full frame, bytes after report id. e.g. "255" */
    private String latch = "255";

    public ControllerProfile() { }

    // --- getters / setters ---
    public Long getId() { return id; }
    public String getName() { return name; }
    public void setName(String v) { this.name = v; }
    public String getBrand() { return brand; }
    public void setBrand(String v) { this.brand = v; }
    public int getVendorId() { return vendorId; }
    public void setVendorId(int v) { this.vendorId = v; }
    public int getProductId() { return productId; }
    public void setProductId(int v) { this.productId = v; }
    public int getHidInterface() { return hidInterface; }
    public void setHidInterface(int v) { this.hidInterface = v; }
    public int getReportLength() { return reportLength; }
    public void setReportLength(int v) { this.reportLength = v; }
    public int getChannelCount() { return channelCount; }
    public void setChannelCount(int v) { this.channelCount = v; }
    public int getMaxLedsPerChannel() { return maxLedsPerChannel; }
    public void setMaxLedsPerChannel(int v) { this.maxLedsPerChannel = v; }
    public String getColorOrder() { return colorOrder; }
    public void setColorOrder(String v) { this.colorOrder = v; }
    public int getMaxLedsPerPacket() { return maxLedsPerPacket; }
    public void setMaxLedsPerPacket(int v) { this.maxLedsPerPacket = v; }
    public String getFraming() { return framing; }
    public void setFraming(String v) { this.framing = v; }
    public String getAutoDetectCmd() { return autoDetectCmd; }
    public void setAutoDetectCmd(String v) { this.autoDetectCmd = v; }
    public String getAutoDetectReply() { return autoDetectReply; }
    public void setAutoDetectReply(String v) { this.autoDetectReply = v; }
    public String getLatch() { return latch; }
    public void setLatch(String v) { this.latch = v; }
}
