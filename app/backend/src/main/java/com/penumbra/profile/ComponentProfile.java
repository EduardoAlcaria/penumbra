package com.penumbra.profile;

import jakarta.persistence.*;

/**
 * LED-layout profile for passive ARGB gear (fans, strips, panels).
 * Imported directly from SignalRGB's Components/*.json — these ARE plain data,
 * so we reuse them as-is (unlike controller protocols, which are code).
 *
 * Used when a controller channel can't self-report and the user says
 * "channel 1 = APNX FP2 fan" -> we know it's 16 LEDs with this coordinate map.
 */
@Entity
@Table(name = "component_profile")
public class ComponentProfile {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String productName;   // "APNX FP2"
    private String displayName;   // "APNX FP2 - 16 LED"
    private String brand;         // "APNX"
    private String type;          // "Fan" / "Strip" / ...
    private int ledCount;
    private int width;
    private int height;

    /** JSON arrays copied verbatim from the Signal Components file. */
    @Lob @Column(columnDefinition = "CLOB")
    private String ledMappingJson;
    @Lob @Column(columnDefinition = "CLOB")
    private String ledCoordinatesJson;
    @Lob @Column(columnDefinition = "CLOB")
    private String ledNamesJson;

    private String imageUrl;

    public ComponentProfile() { }

    public Long getId() { return id; }
    public String getProductName() { return productName; }
    public void setProductName(String v) { this.productName = v; }
    public String getDisplayName() { return displayName; }
    public void setDisplayName(String v) { this.displayName = v; }
    public String getBrand() { return brand; }
    public void setBrand(String v) { this.brand = v; }
    public String getType() { return type; }
    public void setType(String v) { this.type = v; }
    public int getLedCount() { return ledCount; }
    public void setLedCount(int v) { this.ledCount = v; }
    public int getWidth() { return width; }
    public void setWidth(int v) { this.width = v; }
    public int getHeight() { return height; }
    public void setHeight(int v) { this.height = v; }
    public String getLedMappingJson() { return ledMappingJson; }
    public void setLedMappingJson(String v) { this.ledMappingJson = v; }
    public String getLedCoordinatesJson() { return ledCoordinatesJson; }
    public void setLedCoordinatesJson(String v) { this.ledCoordinatesJson = v; }
    public String getLedNamesJson() { return ledNamesJson; }
    public void setLedNamesJson(String v) { this.ledNamesJson = v; }
    public String getImageUrl() { return imageUrl; }
    public void setImageUrl(String v) { this.imageUrl = v; }
}
