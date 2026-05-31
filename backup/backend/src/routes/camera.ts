import { Router } from "express";

const router = Router();

router.get("/camera/info", (req, res) => {
  const streamUrl = process.env["CAMERA_STREAM_URL"] ?? "";
  res.json({
    streamUrl,
    resolution: "1280x720",
    fps: 30,
    connected: Boolean(streamUrl),
  });
});

export default router;
