import { useCallback, useEffect, useRef, useState } from "react";
import type { WsStatus } from "@/hooks/use-rover-ws";

export type ArmJointName = "base" | "shoulder" | "elbow" | "wrist" | "gripper";
export type ArmDirection = -1 | 1;

export interface ArmJointConfig {
  name: ArmJointName;
  label: string;
  minAngle: number;
  maxAngle: number;
  normalSpeed: number;
  precisionSpeed: number;
  inverted: boolean;
  servoChannel: number;
}

export type ArmPositions = Record<ArmJointName, number>;

export const DEFAULT_ARM_CONFIG: ArmJointConfig[] = [
  { name: "base", label: "BASE", minAngle: 0, maxAngle: 180, normalSpeed: 100, precisionSpeed: 25, inverted: false, servoChannel: 0 },
  { name: "shoulder", label: "SHOULDER", minAngle: 0, maxAngle: 180, normalSpeed: 100, precisionSpeed: 25, inverted: false, servoChannel: 1 },
  { name: "elbow", label: "ELBOW", minAngle: 0, maxAngle: 180, normalSpeed: 100, precisionSpeed: 25, inverted: false, servoChannel: 2 },
  { name: "wrist", label: "WRIST", minAngle: 0, maxAngle: 180, normalSpeed: 100, precisionSpeed: 25, inverted: false, servoChannel: 3 },
  { name: "gripper", label: "GRIPPER", minAngle: 0, maxAngle: 100, normalSpeed: 100, precisionSpeed: 25, inverted: false, servoChannel: 4 },
];

const CONFIG_KEY = "rover-arm-config-v1";

function loadConfig(): ArmJointConfig[] {
  try {
    const stored = localStorage.getItem(CONFIG_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<ArmJointConfig>[];
      return DEFAULT_ARM_CONFIG.map((defaultJoint) => ({
        ...defaultJoint,
        ...(parsed.find((joint) => joint.name === defaultJoint.name) ?? {}),
      }));
    }
  } catch {
    // Use safe defaults when local storage is unavailable or malformed.
  }
  return DEFAULT_ARM_CONFIG;
}

function midpoint(joint: ArmJointConfig) {
  return (joint.minAngle + joint.maxAngle) / 2;
}

interface MoveState {
  joint: ArmJointName;
  direction: ArmDirection;
}

interface UseArmControllerOptions {
  simulation: boolean;
  wsStatus: WsStatus;
  sendMessage: (message: { type: string; payload?: unknown }) => boolean;
}

export function useArmController({ simulation, wsStatus, sendMessage }: UseArmControllerOptions) {
  const [config, setConfig] = useState<ArmJointConfig[]>(() => loadConfig());
  const [positions, setPositions] = useState<ArmPositions>(() => {
    const initialConfig = loadConfig();
    return Object.fromEntries(initialConfig.map((joint) => [joint.name, midpoint(joint)])) as ArmPositions;
  });
  const [activeMove, setActiveMove] = useState<MoveState | null>(null);
  const [armStopped, setArmStopped] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const activeMoveRef = useRef<MoveState | null>(null);
  const moveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateConfig = useCallback((name: ArmJointName, patch: Partial<ArmJointConfig>) => {
    setConfig((current) => {
      const next = current.map((joint) => joint.name === name ? { ...joint, ...patch } : joint);
      localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const sendMove = useCallback((move: MoveState, speed: number) => {
    if (simulation) return true;
    return sendMessage({
      type: "arm_move",
      payload: { joint: move.joint, direction: move.direction, speed },
    });
  }, [sendMessage, simulation]);

  const stopCurrent = useCallback((reason?: string) => {
    const move = activeMoveRef.current;
    if (moveTimerRef.current) clearInterval(moveTimerRef.current);
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
    moveTimerRef.current = null;
    watchdogRef.current = null;
    activeMoveRef.current = null;
    setActiveMove(null);
    if (!simulation && move) {
      sendMessage({ type: "arm_stop", payload: { joint: move.joint } });
    }
    if (reason) setWarning(reason);
  }, [sendMessage, simulation]);

  const tickSimulation = useCallback((move: MoveState, speed: number) => {
    const joint = config.find((item) => item.name === move.joint);
    if (!joint) return;
    const effectiveDirection = (joint.inverted ? -1 : 1) * move.direction;
    const step = (speed / 100) * (move.joint === "gripper" ? 2 : 3);
    let reachedLimit = false;
    setPositions((current) => {
      const nextAngle = Math.max(joint.minAngle, Math.min(joint.maxAngle, current[move.joint] + effectiveDirection * step));
      reachedLimit = nextAngle === joint.minAngle || nextAngle === joint.maxAngle;
      return { ...current, [move.joint]: nextAngle };
    });
    if (reachedLimit) stopCurrent(`${joint.label} SOFTWARE LIMIT REACHED`);
  }, [config, stopCurrent]);

  const beginMove = useCallback((joint: ArmJointName, direction: ArmDirection, precision: boolean) => {
    if (armStopped) {
      setWarning("ARM STOPPED — ENABLE ARM TO RESUME");
      return;
    }
    if (!simulation && wsStatus !== "connected") {
      setWarning("CONTROL LINK UNAVAILABLE — MOVEMENT BLOCKED");
      return;
    }
    stopCurrent();
    const jointConfig = config.find((item) => item.name === joint);
    if (!jointConfig) return;
    const move = { joint, direction };
    const speed = precision ? jointConfig.precisionSpeed : jointConfig.normalSpeed;
    activeMoveRef.current = move;
    setActiveMove(move);
    const heartbeat = () => {
      if (!sendMove(move, speed)) {
        stopCurrent("CONTROL LINK LOST — ARM STOPPED");
        return;
      }
      tickSimulation(move, speed);
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
      watchdogRef.current = setTimeout(() => stopCurrent("WATCHDOG TIMEOUT — ARM STOPPED"), 700);
    };
    heartbeat();
    moveTimerRef.current = setInterval(heartbeat, 180);
  }, [armStopped, config, sendMove, simulation, stopCurrent, tickSimulation, wsStatus]);

  const emergencyStop = useCallback(() => {
    stopCurrent();
    setArmStopped(true);
    setWarning("ARM STOPPED");
    if (!simulation) sendMessage({ type: "arm_emergency_stop" });
  }, [sendMessage, simulation, stopCurrent]);

  const enableArm = useCallback(() => {
    setArmStopped(false);
    setWarning(null);
  }, []);

  useEffect(() => {
    if (!simulation && wsStatus !== "connected" && activeMoveRef.current) {
      stopCurrent("CONTROL LINK LOST — ARM STOPPED");
    }
  }, [simulation, stopCurrent, wsStatus]);

  useEffect(() => () => stopCurrent(), [stopCurrent]);

  return {
    config,
    positions,
    activeMove,
    armStopped,
    warning,
    updateConfig,
    beginMove,
    stopCurrent,
    emergencyStop,
    enableArm,
  };
}