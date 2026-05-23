import { Router } from "express";

const router = Router();

let autonomousState = {
  enabled: false,
  mode: "idle" as "idle" | "exploring" | "homing" | "following" | "patrolling",
  obstacleAvoidance: true,
  pathPlanning: true,
};

router.get("/autonomous/status", (req, res) => {
  res.json(autonomousState);
});

router.post("/autonomous/toggle", (req, res) => {
  const { enabled, mode } = req.body as {
    enabled: boolean;
    mode?: string;
  };

  autonomousState.enabled = enabled;
  if (mode) {
    autonomousState.mode = mode as typeof autonomousState.mode;
  } else if (!enabled) {
    autonomousState.mode = "idle";
  }

  req.log.info({ enabled, mode }, "Autonomous mode toggled");
  res.json(autonomousState);
});

export default router;
