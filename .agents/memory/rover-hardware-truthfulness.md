---
name: Hardware truthfulness
description: Durable status and simulation conventions for the rover control station.
---

Every hardware-facing status must be based on confirmed telemetry, not on a live browser or API connection alone. Use explicit `SIMULATION`, `NOT VERIFIED`, `DISCONNECTED`, or `ERROR` states when the physical device has not confirmed its presence. Keep clean driver C50 output, AI-processed C50 output, and the A9 arm feed logically separate.

**Why:** The rover application is being developed before the final WRO hardware is connected, so a software link must never be mistaken for a safe-to-operate physical device.

**How to apply:** Preserve this distinction in new adapters, diagnostics, camera health checks, autonomous readiness, battery telemetry, and arm/rover safety flows.