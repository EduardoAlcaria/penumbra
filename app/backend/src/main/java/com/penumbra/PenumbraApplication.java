package com.penumbra;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Penumbra: local-only RGB control engine.
 * No cloud, no login, no telemetry. Detects controllers, auto-reads their LED
 * counts from the hardware, runs effects, pushes colors over HID.
 */
@SpringBootApplication
@EnableScheduling
public class PenumbraApplication {
    public static void main(String[] args) {
        SpringApplication.run(PenumbraApplication.class, args);
    }
}
