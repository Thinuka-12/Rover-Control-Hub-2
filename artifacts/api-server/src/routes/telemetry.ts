import { Router } from "express";

const router = Router();

function generateUltrasonicReadings() {
  const sensors = [
    { id: "ur-front-left", label: "Front Left" },
    { id: "ur-front-right", label: "Front Right" },
    { id: "ur-rear-left", label: "Rear Left" },
    { id: "ur-rear-right", label: "Rear Right" },
    { id: "ur-left", label: "Left Side" },
    { id: "ur-right", label: "Right Side" },
  ];
  return sensors.map((s) => {
    const distanceCm = Math.max(2, 5 + Math.random() * 295);
    return { ...s, distanceCm: Math.round(distanceCm * 10) / 10, triggered: distanceCm < 20 };
  });
}

function generateInfraredReadings() {
  const sensors = [
    { id: "ir-front", label: "Front" },
    { id: "ir-rear", label: "Rear" },
    { id: "ir-left", label: "Left" },
    { id: "ir-right", label: "Right" },
  ];
  return sensors.map((s) => {
    const rawValue = Math.floor(Math.random() * 1024);
    return { ...s, detected: rawValue < 200, rawValue };
  });
}

let roverSpeed = 0;
let roverDirection: string = "stopped";
let batteryLevel = 87.4;
let armAxes = [
  { id: 1, label: "Base Rotation", angleDeg: 0, minDeg: -180, maxDeg: 180 },
  { id: 2, label: "Shoulder", angleDeg: 45, minDeg: -90, maxDeg: 90 },
  { id: 3, label: "Elbow", angleDeg: -30, minDeg: -135, maxDeg: 135 },
  { id: 4, label: "Wrist Pitch", angleDeg: 0, minDeg: -90, maxDeg: 90 },
  { id: 5, label: "Wrist Roll", angleDeg: 0, minDeg: -180, maxDeg: 180 },
  { id: 6, label: "Gripper Rotate", angleDeg: 0, minDeg: -90, maxDeg: 90 },
];

router.get("/telemetry", (req, res) => {
  batteryLevel = Math.max(0, batteryLevel - 0.002);
  res.json({
    rover: {
      connected: true,
      speed: roverSpeed,
      direction: roverDirection,
      batteryLevel: Math.round(batteryLevel * 10) / 10,
      motorTemperature: Math.round((28 + Math.random() * 12) * 10) / 10,
      wheelCount: 6,
    },
    sensors: {
      ultrasonic: generateUltrasonicReadings(),
      infrared: generateInfraredReadings(),
      timestamp: new Date().toISOString(),
    },
    arm: {
      axes: armAxes,
      gripping: false,
      moving: false,
    },
    autonomous: {
      enabled: false,
      mode: "idle",
      obstacleAvoidance: true,
      pathPlanning: true,
    },
    timestamp: new Date().toISOString(),
  });
});

export default router;
