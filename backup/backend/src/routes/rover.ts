import { Router } from "express";

const router = Router();

let roverState = {
  connected: true,
  speed: 0,
  direction: "stopped" as "forward" | "backward" | "left" | "right" | "stopped",
  batteryLevel: 87.4,
  motorTemperature: 32.1,
  wheelCount: 6,
};

router.get("/rover/status", (req, res) => {
  roverState.batteryLevel = Math.max(0, roverState.batteryLevel - 0.001);
  roverState.motorTemperature = 28 + Math.random() * 12;
  res.json(roverState);
});

router.post("/rover/command", (req, res) => {
  const { command, speed, duration } = req.body as {
    command: string;
    speed?: number;
    duration?: number | null;
  };

  const validCommands = ["forward", "backward", "left", "right", "stop"];
  if (!validCommands.includes(command)) {
    res.status(400).json({ success: false, message: "Invalid command" });
    return;
  }

  if (command === "stop") {
    roverState.direction = "stopped";
    roverState.speed = 0;
  } else {
    roverState.direction = command as typeof roverState.direction;
    roverState.speed = speed ?? 50;
  }

  req.log.info({ command, speed, duration }, "Rover command received");

  if (duration && duration > 0) {
    setTimeout(() => {
      roverState.direction = "stopped";
      roverState.speed = 0;
    }, duration);
  }

  res.json({ success: true, message: `Command '${command}' executed` });
});

router.post("/rover/stop", (req, res) => {
  roverState.direction = "stopped";
  roverState.speed = 0;
  req.log.info("Emergency stop triggered");
  res.json({ success: true, message: "Emergency stop executed" });
});

export default router;
