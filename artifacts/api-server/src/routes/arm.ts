import { Router } from "express";

const router = Router();

let armState = {
  axes: [
    { id: 1, label: "Base Rotation", angleDeg: 0, minDeg: -180, maxDeg: 180 },
    { id: 2, label: "Shoulder", angleDeg: 45, minDeg: -90, maxDeg: 90 },
    { id: 3, label: "Elbow", angleDeg: -30, minDeg: -135, maxDeg: 135 },
    { id: 4, label: "Wrist Pitch", angleDeg: 0, minDeg: -90, maxDeg: 90 },
    { id: 5, label: "Wrist Roll", angleDeg: 0, minDeg: -180, maxDeg: 180 },
    { id: 6, label: "Gripper Rotate", angleDeg: 0, minDeg: -90, maxDeg: 90 },
  ],
  gripping: false,
  moving: false,
};

router.get("/arm/status", (req, res) => {
  res.json(armState);
});

router.post("/arm/command", (req, res) => {
  const { axes, grip } = req.body as {
    axes: { id: number; angleDeg: number }[];
    grip?: boolean | null;
  };

  if (axes && Array.isArray(axes)) {
    for (const cmd of axes) {
      const axis = armState.axes.find((a) => a.id === cmd.id);
      if (axis) {
        const clamped = Math.max(axis.minDeg, Math.min(axis.maxDeg, cmd.angleDeg));
        axis.angleDeg = Math.round(clamped * 10) / 10;
      }
    }
    armState.moving = true;
    setTimeout(() => {
      armState.moving = false;
    }, 500);
  }

  if (grip !== undefined && grip !== null) {
    armState.gripping = grip;
  }

  req.log.info({ axes, grip }, "Arm command received");
  res.json({ success: true, message: "Arm command executed" });
});

router.post("/arm/home", (req, res) => {
  armState.axes = armState.axes.map((a) => ({ ...a, angleDeg: 0 }));
  armState.gripping = false;
  armState.moving = true;
  setTimeout(() => {
    armState.moving = false;
  }, 2000);

  req.log.info("Arm homing initiated");
  res.json({ success: true, message: "Arm homing to zero position" });
});

export default router;
