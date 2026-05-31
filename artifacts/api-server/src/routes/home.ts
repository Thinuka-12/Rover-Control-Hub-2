import { Router } from "express";

const router = Router();

interface HomeState {
  set: boolean;
  x: number;
  y: number;
  setAt: string | null;
}

interface RthStatus {
  active: boolean;
  progressPct: number;
  etaSeconds: number | null;
  startX: number;
  startY: number;
  homeX: number;
  homeY: number;
}

let homeState: HomeState = { set: false, x: 0, y: 0, setAt: null };
let rthState: RthStatus = { active: false, progressPct: 0, etaSeconds: null, startX: 0, startY: 0, homeX: 0, homeY: 0 };

let rthInterval: ReturnType<typeof setInterval> | null = null;

function startRthSimulation(fromX: number, fromY: number, toX: number, toY: number) {
  if (rthInterval) clearInterval(rthInterval);
  const dist = Math.sqrt((toX - fromX) ** 2 + (toY - fromY) ** 2);
  const speed = 0.5; // m/s simulated
  const totalSec = dist > 0 ? dist / speed : 2;

  rthState = {
    active: true,
    progressPct: 0,
    etaSeconds: Math.ceil(totalSec),
    startX: fromX,
    startY: fromY,
    homeX: toX,
    homeY: toY,
  };

  let elapsed = 0;
  rthInterval = setInterval(() => {
    elapsed += 0.5;
    rthState.progressPct = Math.min(100, (elapsed / totalSec) * 100);
    rthState.etaSeconds = Math.max(0, Math.ceil(totalSec - elapsed));

    if (rthState.progressPct >= 100) {
      rthState.active = false;
      if (rthInterval) { clearInterval(rthInterval); rthInterval = null; }
    }
  }, 500);
}

router.get("/rover/home", (_req, res) => {
  res.json(homeState);
});

router.post("/rover/home/set", (req, res) => {
  const currentX: number = (req.body as { x?: number }).x ?? 0;
  const currentY: number = (req.body as { y?: number }).y ?? 0;

  homeState = { set: true, x: currentX, y: currentY, setAt: new Date().toISOString() };
  req.log.info({ home: homeState }, "Home position set");
  res.json(homeState);
});

router.post("/rover/rth", (req, res) => {
  if (!homeState.set) {
    res.status(400).json({ active: false, progressPct: 0, etaSeconds: null, startX: 0, startY: 0, homeX: 0, homeY: 0 });
    return;
  }

  const fromX: number = (req.body as { x?: number }).x ?? 0;
  const fromY: number = (req.body as { y?: number }).y ?? 0;

  req.log.info({ from: { fromX, fromY }, to: homeState }, "RTH initiated");
  startRthSimulation(fromX, fromY, homeState.x, homeState.y);
  res.json(rthState);
});

router.get("/rover/rth/status", (_req, res) => {
  res.json(rthState);
});

router.post("/rover/rth/abort", (req, res) => {
  if (rthInterval) { clearInterval(rthInterval); rthInterval = null; }
  rthState.active = false;
  rthState.progressPct = 0;
  rthState.etaSeconds = null;
  req.log.info("RTH aborted");
  res.json({ success: true, message: "RTH aborted" });
});

export default router;
export { homeState, rthState };
