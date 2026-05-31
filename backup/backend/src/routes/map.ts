import { Router } from "express";

const router = Router();

interface PathPoint {
  x: number;
  y: number;
  headingDeg: number;
  timestamp: string;
  speed: number;
}

interface Waypoint {
  id: string;
  label: string;
  x: number;
  y: number;
  timestamp: string;
}

// Simulated position state — integrates direction + speed like odometry
let posX = 0;
let posY = 0;
let headingDeg = 0;
let currentSpeed = 0;
let currentDirection = "stopped";

let recording = false;
let recordingStartedAt: string | null = null;
let path: PathPoint[] = [];
let waypoints: Waypoint[] = [];
let lastPathPoint = Date.now();

// Called by the rover route when a command is sent
export function updateRoverMovement(speed: number, direction: string) {
  currentSpeed = speed;
  currentDirection = direction;
}

// Called every 500ms by the WS broadcaster to advance simulated position
export function tickPosition() {
  const dt = 0.5; // seconds
  const metersPerTick = (currentSpeed / 100) * 1.5 * dt; // max 1.5 m/s at speed=100

  if (currentDirection !== "stopped" && metersPerTick > 0) {
    const headingRad = (headingDeg - 90) * (Math.PI / 180);

    switch (currentDirection) {
      case "forward":
        posX += Math.cos(headingRad) * metersPerTick;
        posY += Math.sin(headingRad) * metersPerTick;
        break;
      case "backward":
        posX -= Math.cos(headingRad) * metersPerTick;
        posY -= Math.sin(headingRad) * metersPerTick;
        break;
      case "left":
        headingDeg = (headingDeg - 3 + 360) % 360;
        break;
      case "right":
        headingDeg = (headingDeg + 3) % 360;
        break;
    }

    // Record path point every 500ms when recording
    if (recording && Date.now() - lastPathPoint >= 400) {
      path.push({ x: posX, y: posY, headingDeg, timestamp: new Date().toISOString(), speed: currentSpeed });
      lastPathPoint = Date.now();
      // Cap path at 5000 points
      if (path.length > 5000) path = path.slice(-5000);
    }
  }

  return { x: posX, y: posY, headingDeg };
}

function calcTotalDistance(): number {
  if (path.length < 2) return 0;
  let dist = 0;
  for (let i = 1; i < path.length; i++) {
    const dx = path[i].x - path[i - 1].x;
    const dy = path[i].y - path[i - 1].y;
    dist += Math.sqrt(dx * dx + dy * dy);
  }
  return Math.round(dist * 100) / 100;
}

function calcDuration(): number {
  if (!recordingStartedAt) return 0;
  return Math.round((Date.now() - new Date(recordingStartedAt).getTime()) / 1000);
}

router.get("/map/state", (req, res) => {
  res.json({
    position: { x: Math.round(posX * 100) / 100, y: Math.round(posY * 100) / 100, headingDeg: Math.round(headingDeg * 10) / 10, timestamp: new Date().toISOString() },
    path,
    waypoints,
    recording,
    recordingStartedAt,
    totalDistanceM: calcTotalDistance(),
    durationSeconds: calcDuration(),
  });
});

router.post("/map/recording", (req, res) => {
  const { active } = req.body as { active: boolean };
  if (active && !recording) {
    recording = true;
    recordingStartedAt = new Date().toISOString();
    req.log.info("Path recording started");
  } else if (!active && recording) {
    recording = false;
    req.log.info({ points: path.length }, "Path recording stopped");
  }
  res.json({
    position: { x: Math.round(posX * 100) / 100, y: Math.round(posY * 100) / 100, headingDeg: Math.round(headingDeg * 10) / 10, timestamp: new Date().toISOString() },
    path,
    waypoints,
    recording,
    recordingStartedAt,
    totalDistanceM: calcTotalDistance(),
    durationSeconds: calcDuration(),
  });
});

router.post("/map/path/clear", (req, res) => {
  path = [];
  waypoints = [];
  recording = false;
  recordingStartedAt = null;
  req.log.info("Path cleared");
  res.json({ success: true, message: "Path cleared" });
});

router.post("/map/waypoint", (req, res) => {
  const { label } = req.body as { label: string };
  const waypoint: Waypoint = {
    id: `wp-${Date.now()}`,
    label: label || `WP ${waypoints.length + 1}`,
    x: Math.round(posX * 100) / 100,
    y: Math.round(posY * 100) / 100,
    timestamp: new Date().toISOString(),
  };
  waypoints.push(waypoint);
  req.log.info({ waypoint }, "Waypoint added");
  res.json(waypoint);
});

export default router;
