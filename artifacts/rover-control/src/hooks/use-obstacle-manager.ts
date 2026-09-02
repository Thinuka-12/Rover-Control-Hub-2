import { useMemo } from "react";
import type { WsLidar, WsTelemetry } from "@/hooks/use-rover-ws";
import type { Obstacle, WarningLevel } from "@/types/rover-telemetry";

function levelFor(distanceMm: number, thresholdMm: number): WarningLevel {
  if (distanceMm >= thresholdMm) return "ok";
  return distanceMm < thresholdMm * 0.4 ? "critical" : "warning";
}

export function useObstacleManager(
  lidarData: WsLidar | null | undefined,
  telemetry: WsTelemetry | null | undefined,
  thresholdMm: number,
) {
  const obstacles = useMemo<Obstacle[]>(() => {
    const now = new Date().toISOString();
    const lidar = (lidarData?.points ?? [])
      .filter((point) => point.distanceMm > 0 && point.quality > 10)
      .sort((a, b) => a.distanceMm - b.distanceMm)
      .slice(0, 12)
      .map((point, index) => ({
        id: `lidar-${index}`,
        source: "lidar" as const,
        distanceMm: point.distanceMm,
        directionDeg: point.angle,
        warningLevel: levelFor(point.distanceMm, thresholdMm),
        timestamp: now,
      }));
    const ultrasonic = (telemetry?.sensors.ultrasonic ?? [])
      .filter((sensor) => sensor.distanceCm > 0)
      .map((sensor) => ({
        id: `ultrasonic-${sensor.id}`,
        source: "ultrasonic" as const,
        distanceMm: sensor.distanceCm * 10,
        directionDeg: null,
        warningLevel: sensor.triggered ? "critical" as const : levelFor(sensor.distanceCm * 10, thresholdMm),
        timestamp: now,
      }));
    return [...lidar, ...ultrasonic].sort((a, b) => a.distanceMm - b.distanceMm);
  }, [lidarData, telemetry, thresholdMm]);

  const closest = obstacles[0] ?? null;
  return {
    obstacles,
    closest,
    warningLevel: closest?.warningLevel ?? "ok",
    hasWarning: obstacles.some((obstacle) => obstacle.warningLevel !== "ok"),
  };
}