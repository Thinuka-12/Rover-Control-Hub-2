import { Router, type IRouter } from "express";
import healthRouter from "./health";
import roverRouter from "./rover";
import sensorsRouter from "./sensors";
import armRouter from "./arm";
import autonomousRouter from "./autonomous";
import cameraRouter from "./camera";
import telemetryRouter from "./telemetry";
import mapRouter from "./map";

const router: IRouter = Router();

router.use(healthRouter);
router.use(roverRouter);
router.use(sensorsRouter);
router.use(armRouter);
router.use(autonomousRouter);
router.use(cameraRouter);
router.use(telemetryRouter);
router.use(mapRouter);

export default router;
