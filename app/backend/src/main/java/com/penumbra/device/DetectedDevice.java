package com.penumbra.device;

import com.penumbra.profile.ControllerProfile;
import org.hid4java.HidDevice;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Arrays;

/**
 * A controller that is physically plugged in right now: profile + open HID
 * handle + the LED layout auto-detected from the hardware + the live color
 * buffer the effect engine writes into.
 *
 * Framing is profile-driven. Only the "nollie" framing is implemented so far
 * (matches the user's controller); other vendors plug in as new branches.
 */
public class DetectedDevice {
    private static final Logger log = LoggerFactory.getLogger(DetectedDevice.class);

    private final ControllerProfile profile;
    private final HidDevice hid;

    private int[] ledsPerChannel;   // filled by auto-detect
    private int totalLeds;
    private int[] ledColors;        // 0xRRGGBB per LED, global index; effects write here

    public DetectedDevice(ControllerProfile profile, HidDevice hid) {
        this.profile = profile;
        this.hid = hid;
    }

    public ControllerProfile getProfile() { return profile; }
    public int getTotalLeds() { return totalLeds; }
    public int[] getLedsPerChannel() { return ledsPerChannel; }
    public String id() { return String.format("%04X:%04X", profile.getVendorId(), profile.getProductId()); }

    /** Open the device and ask the hardware how many LEDs are on each channel. */
    public boolean initialize() {
        if (!hid.open()) {
            log.warn("Could not open {} ({})", profile.getName(), id());
            return false;
        }
        this.ledsPerChannel = autoDetect();
        this.totalLeds = Arrays.stream(ledsPerChannel).sum();
        this.ledColors = new int[Math.max(totalLeds, 1)];
        log.info("{} up: channels={} leds/ch={} total={}",
                profile.getName(), profile.getChannelCount(),
                Arrays.toString(ledsPerChannel), totalLeds);
        return true;
    }

    /** The "works out of the box" magic: JSON says how to ask, hardware answers. */
    private int[] autoDetect() {
        int channels = profile.getChannelCount();
        int[] counts = new int[channels];
        try {
            byte[] cmd = parseBytes(profile.getAutoDetectCmd());
            writeReport(cmd);
            byte[] reply = new byte[profile.getReportLength()];
            hid.read(reply, 200);
            // ponytail: numbered-report offset may be +1 on some hardware; tune if counts look shifted.
            if ("u16be_per_channel".equals(profile.getAutoDetectReply())) {
                for (int i = 0; i < channels; i++) {
                    counts[i] = ((reply[i * 2] & 0xFF) << 8) | (reply[i * 2 + 1] & 0xFF);
                }
            }
        } catch (Exception e) {
            log.warn("Auto-detect failed for {}, defaulting to 0 LEDs/channel: {}", id(), e.getMessage());
        }
        return counts;
    }

    /** Effects call this to set a global LED, then renderFrame() flushes. */
    public void setLed(int globalIdx, int rgb) {
        if (ledColors != null && globalIdx >= 0 && globalIdx < ledColors.length) {
            ledColors[globalIdx] = rgb;
        }
    }

    /** Pack the current buffer into the controller's wire format and flush. */
    public void renderFrame() {
        if ("nollie".equals(profile.getFraming())) {
            renderNollie();
        }
    }

    private void renderNollie() {
        int perPacket = profile.getMaxLedsPerPacket();
        int channels = profile.getChannelCount();
        int globalOffset = 0;

        for (int ch = 0; ch < channels; ch++) {
            int count = ledsPerChannel[ch];
            byte[] grb = new byte[count * 3];
            for (int i = 0; i < count; i++) {
                int rgb = ledColors[globalOffset + i];
                grb[i * 3]     = (byte) ((rgb >> 8) & 0xFF);  // G
                grb[i * 3 + 1] = (byte) ((rgb >> 16) & 0xFF); // R
                grb[i * 3 + 2] = (byte) (rgb & 0xFF);         // B
            }
            globalOffset += count;

            int numPackets = (int) Math.ceil(count / (double) perPacket);
            for (int p = 0; p < numPackets; p++) {
                int chunkStart = p * perPacket * 3;
                int chunkLen = Math.min(perPacket * 3, grb.length - chunkStart);
                byte[] msg = new byte[1 + chunkLen];
                msg[0] = (byte) (p + ch * 6);   // Nollie channel/packet header
                System.arraycopy(grb, chunkStart, msg, 1, chunkLen);
                writeReport(msg);
            }
        }
        writeReport(parseBytes(profile.getLatch()));  // commit frame
    }

    /** Write one HID output report: reportId 0x00 + payload, padded to reportLength-1. */
    private void writeReport(byte[] payload) {
        int dataLen = profile.getReportLength() - 1;
        byte[] data = new byte[dataLen];
        System.arraycopy(payload, 0, data, 0, Math.min(payload.length, dataLen));
        hid.write(data, dataLen, (byte) 0x00);
    }

    public void shutdown() {
        try {
            if (ledColors != null) Arrays.fill(ledColors, 0);
            renderFrame();
        } catch (Exception ignored) { }
        hid.close();
    }

    private static byte[] parseBytes(String csv) {
        if (csv == null || csv.isBlank()) return new byte[0];
        String[] parts = csv.split(",");
        byte[] out = new byte[parts.length];
        for (int i = 0; i < parts.length; i++) out[i] = (byte) Integer.parseInt(parts[i].trim());
        return out;
    }
}
