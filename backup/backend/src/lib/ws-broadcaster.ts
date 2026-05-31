import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage, Server } from "http";
import { logger } from "./logger";
import { tickPosition } from "../routes/map";

interface LidarPoint {
  angle: number;
  distanceMm: number;
  quality: number;
}

function generateUltrasonic() {
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

function generateInfrared() {
  return [
    { id: "ir-front", label: "Front" },
    { id: "ir-rear", label: "Rear" },
    { id: "ir-left", label: "Left" },
    { id: "ir-right", label: "Right" },
  ].map((s) => {
    const rawValue = Math.floor(Math.random() * 1024);
    return { ...s, detected: rawValue < 200, rawValue };
  });
}

function generateLidar(): LidarPoint[] {
  const points: LidarPoint[] = [];
  for (let i = 0; i < 360; i++) {
    let distanceMm = 1000 + Math.random() * 4000;
    if (i >= 30 && i <= 50) distanceMm = 300 + Math.random() * 200;
    if (i >= 170 && i <= 190) distanceMm = 500 + Math.random() * 300;
    if (i >= 260 && i <= 280) distanceMm = 800 + Math.random() * 400;
    points.push({ angle: i, distanceMm: Math.round(distanceMm), quality: Math.floor(150 + Math.random() * 105) });
  }
  return points;
}

let batteryLevel = 87.4;
let roverSpeed = 0;
let roverDirection = "stopped";

export function setRoverState(speed: number, direction: string) {
  roverSpeed = speed;
  roverDirection = direction;
}

export function attachWebSocketServer(httpServer: Server) {
  const wss = new WebSocketServer({ server: httpServer, path: "/api/ws" });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    logger.info({ ip: req.socket.remoteAddress }, "WebSocket client connected");

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { type: string; payload?: unknown };
        logger.info({ type: msg.type }, "WS message from client");
        ws.send(JSON.stringify({ type: "ack", payload: msg.type }));
      } catch {
        // ignore malformed
      }
    });

    ws.on("close", () => {
      logger.info({ ip: req.socket.remoteAddress }, "WebSocket client disconnected");
    });
  });

  function broadcast(data: string) {
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(data);
    }
  }

  // Broadcast telemetry + position at 500ms
  const telemetryInterval = setInterval(() => {
    if (wss.clients.size === 0) return;
    batteryLevel = Math.max(0, batteryLevel - 0.001);

    // Advance position simulation
    const pos = tickPosition();

    broadcast(JSON.stringify({
      type: "telemetry",
      payload: {
        rover: {
          connected: true,
          speed: roverSpeed,
          direction: roverDirection,
          batteryLevel: Math.round(batteryLevel * 10) / 10,
          motorTemperature: Math.round((28 + Math.random() * 12) * 10) / 10,
          wheelCount: 6,
        },
        sensors: {
          ultrasonic: generateUltrasonic(),
          infrared: generateInfrared(),
          timestamp: new Date().toISOString(),
        },
        autonomous: {
          enabled: false,
          mode: "idle",
          obstacleAvoidance: true,
          pathPlanning: true,
        },
        timestamp: new Date().toISOString(),
      },
    }));

    // Broadcast position update
    broadcast(JSON.stringify({
      type: "position",
      payload: {
        x: Math.round(pos.x * 100) / 100,
        y: Math.round(pos.y * 100) / 100,
        headingDeg: Math.round(pos.headingDeg * 10) / 10,
        timestamp: new Date().toISOString(),
      },
    }));
  }, 500);

  // Broadcast LIDAR at 1000ms
  const lidarInterval = setInterval(() => {
    if (wss.clients.size === 0) return;
    broadcast(JSON.stringify({
      type: "lidar",
      payload: { points: generateLidar(), timestamp: new Date().toISOString() },
    }));
  }, 1000);

  wss.on("close", () => {
    clearInterval(telemetryInterval);
    clearInterval(lidarInterval);
  });

  logger.info("WebSocket server attached at /api/ws");
  return wss;
}
