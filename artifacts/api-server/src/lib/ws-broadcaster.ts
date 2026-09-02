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

type ArmJointName = "base" | "shoulder" | "elbow" | "wrist" | "gripper";
type ArmDirection = -1 | 1;
interface ArmJointState {
  name: ArmJointName;
  label: string;
  minAngle: number;
  maxAngle: number;
  commandedAngle: number;
  measuredAngle: number | null;
  normalSpeed: number;
  precisionSpeed: number;
  inverted: boolean;
  servoChannel: number;
}
interface ArmMoveState {
  joint: ArmJointName;
  direction: ArmDirection;
  speed: number;
  lastHeartbeat: number;
}

const ARM_WATCHDOG_MS = 700;
const armJoints: ArmJointState[] = [
  { name: "base", label: "BASE", minAngle: 0, maxAngle: 180, commandedAngle: 90, measuredAngle: null, normalSpeed: 100, precisionSpeed: 25, inverted: false, servoChannel: 0 },
  { name: "shoulder", label: "SHOULDER", minAngle: 0, maxAngle: 180, commandedAngle: 90, measuredAngle: null, normalSpeed: 100, precisionSpeed: 25, inverted: false, servoChannel: 1 },
  { name: "elbow", label: "ELBOW", minAngle: 0, maxAngle: 180, commandedAngle: 90, measuredAngle: null, normalSpeed: 100, precisionSpeed: 25, inverted: false, servoChannel: 2 },
  { name: "wrist", label: "WRIST", minAngle: 0, maxAngle: 180, commandedAngle: 90, measuredAngle: null, normalSpeed: 100, precisionSpeed: 25, inverted: false, servoChannel: 3 },
  { name: "gripper", label: "GRIPPER", minAngle: 0, maxAngle: 100, commandedAngle: 50, measuredAngle: null, normalSpeed: 100, precisionSpeed: 25, inverted: false, servoChannel: 4 },
];
let armEnabled = true;
let armEmergencyStopped = false;
const armMovesByClient = new Map<WebSocket, Map<ArmJointName, ArmMoveState>>();

function armStatePayload() {
  const activeMoves = Array.from(armMovesByClient.values()).flatMap((moves) =>
    Array.from(moves.values()).map(({ joint, direction, speed }) => ({ joint, direction, speed })),
  );
  return {
    enabled: armEnabled,
    emergencyStopped: armEmergencyStopped,
    activeMoves,
    joints: armJoints.map(({ name, commandedAngle, measuredAngle, minAngle, maxAngle }) => ({
      name, commandedAngle, measuredAngle, minAngle, maxAngle,
    })),
    hardware: {
      controller: "not-verified" as const,
      feedback: "unavailable" as const,
    },
    updatedAt: new Date().toISOString(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseArmMove(payload: unknown): { joint: ArmJointName; direction: ArmDirection; speed: number } | null {
  if (!isRecord(payload)) return null;
  const joint = payload.joint;
  const direction = payload.direction;
  const speed = payload.speed;
  if (
    (joint !== "base" && joint !== "shoulder" && joint !== "elbow" && joint !== "wrist" && joint !== "gripper") ||
    (direction !== -1 && direction !== 1) ||
    typeof speed !== "number" ||
    !Number.isFinite(speed)
  ) return null;
  return { joint, direction, speed: Math.max(1, Math.min(100, speed)) };
}

export function attachWebSocketServer(httpServer: Server) {
  const wss = new WebSocketServer({ server: httpServer, path: "/api/ws" });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    logger.info({ ip: req.socket.remoteAddress }, "WebSocket client connected");
    const clientMoves = new Map<ArmJointName, ArmMoveState>();
    armMovesByClient.set(ws, clientMoves);
    ws.send(JSON.stringify({ type: "arm_state", payload: armStatePayload() }));

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { type: string; payload?: unknown };
        logger.info({ type: msg.type }, "WS message from client");

        if (msg.type === "arm_move") {
          const move = parseArmMove(msg.payload);
          if (!move) {
            ws.send(JSON.stringify({ type: "arm_ack", payload: { command: msg.type, accepted: false, reason: "INVALID_ARM_MOVE" } }));
            return;
          }
          if (!armEnabled || armEmergencyStopped) {
            ws.send(JSON.stringify({ type: "arm_ack", payload: { command: msg.type, accepted: false, reason: "ARM_STOPPED" } }));
            return;
          }
          const joint = armJoints.find((item) => item.name === move.joint);
          if (!joint) return;
          const effectiveDirection = (joint.inverted ? -1 : 1) * move.direction;
          const step = (move.speed / 100) * (move.joint === "gripper" ? 2 : 3);
          joint.commandedAngle = Math.max(joint.minAngle, Math.min(joint.maxAngle, joint.commandedAngle + effectiveDirection * step));
          clientMoves.set(move.joint, { ...move, lastHeartbeat: Date.now() });
          ws.send(JSON.stringify({ type: "arm_ack", payload: { command: msg.type, accepted: true, applied: "commanded-only", joint: move.joint } }));
          broadcast(JSON.stringify({ type: "arm_state", payload: armStatePayload() }));
          return;
        }

        if (msg.type === "arm_stop") {
          const joint = isRecord(msg.payload) && typeof msg.payload.joint === "string" ? msg.payload.joint : null;
          if (joint && (["base", "shoulder", "elbow", "wrist", "gripper"] as string[]).includes(joint)) {
            clientMoves.delete(joint as ArmJointName);
          } else {
            clientMoves.clear();
          }
          ws.send(JSON.stringify({ type: "arm_ack", payload: { command: msg.type, accepted: true, joint: joint ?? "all" } }));
          broadcast(JSON.stringify({ type: "arm_state", payload: armStatePayload() }));
          return;
        }

        if (msg.type === "arm_emergency_stop") {
          armEnabled = false;
          armEmergencyStopped = true;
          for (const moves of armMovesByClient.values()) moves.clear();
          ws.send(JSON.stringify({ type: "arm_ack", payload: { command: msg.type, accepted: true } }));
          broadcast(JSON.stringify({ type: "arm_state", payload: armStatePayload() }));
          return;
        }

        if (msg.type === "arm_enable") {
          armEnabled = true;
          armEmergencyStopped = false;
          ws.send(JSON.stringify({ type: "arm_ack", payload: { command: msg.type, accepted: true } }));
          broadcast(JSON.stringify({ type: "arm_state", payload: armStatePayload() }));
          return;
        }

        ws.send(JSON.stringify({ type: "ack", payload: msg.type }));
      } catch {
        // ignore malformed
      }
    });

    ws.on("close", () => {
      const hadMoves = clientMoves.size > 0;
      armMovesByClient.delete(ws);
      if (hadMoves) broadcast(JSON.stringify({ type: "arm_state", payload: armStatePayload() }));
      logger.info({ ip: req.socket.remoteAddress }, "WebSocket client disconnected");
    });
  });

  function broadcast(data: string) {
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(data);
    }
  }

  const armWatchdogInterval = setInterval(() => {
    const now = Date.now();
    let stoppedMove = false;
    for (const moves of armMovesByClient.values()) {
      for (const [joint, move] of moves) {
        if (now - move.lastHeartbeat > ARM_WATCHDOG_MS) {
          moves.delete(joint);
          stoppedMove = true;
        }
      }
    }
    if (stoppedMove) {
      broadcast(JSON.stringify({ type: "arm_state", payload: armStatePayload() }));
    }
  }, 150);

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
    clearInterval(armWatchdogInterval);
  });

  logger.info("WebSocket server attached at /api/ws");
  return wss;
}
