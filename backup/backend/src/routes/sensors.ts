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
    return {
      ...s,
      distanceCm: Math.round(distanceCm * 10) / 10,
      triggered: distanceCm < 20,
    };
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
    return {
      ...s,
      detected: rawValue < 200,
      rawValue,
    };
  });
}

router.get("/sensors", (req, res) => {
  res.json({
    ultrasonic: generateUltrasonicReadings(),
    infrared: generateInfraredReadings(),
    timestamp: new Date().toISOString(),
  });
});

router.get("/sensors/lidar", (req, res) => {
  const points = [];
  const numPoints = 360;

  for (let i = 0; i < numPoints; i++) {
    const angle = i;
    let distanceMm = 1000 + Math.random() * 4000;

    // Simulate obstacles at certain angles
    if (angle >= 30 && angle <= 50) distanceMm = 300 + Math.random() * 200;
    if (angle >= 170 && angle <= 190) distanceMm = 500 + Math.random() * 300;
    if (angle >= 260 && angle <= 280) distanceMm = 800 + Math.random() * 400;

    points.push({
      angle,
      distanceMm: Math.round(distanceMm),
      quality: Math.floor(150 + Math.random() * 105),
    });
  }

  res.json({
    points,
    timestamp: new Date().toISOString(),
  });
});

export default router;
