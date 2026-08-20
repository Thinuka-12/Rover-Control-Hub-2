import { useEffect, useRef, useState, useCallback } from "react";

export type WsStatus = "connecting" | "connected" | "disconnected" | "error";
export interface WsCommand {
  type: string;
  payload?: unknown;
}

export interface WsTelemetry {
  rover: {
    connected: boolean;
    speed: number;
    direction: string;
    batteryLevel: number;
    motorTemperature: number;
    wheelCount: number;
  };
  sensors: {
    ultrasonic: { id: string; label: string; distanceCm: number; triggered: boolean }[];
    infrared: { id: string; label: string; detected: boolean; rawValue: number }[];
    timestamp: string;
  };
  autonomous: {
    enabled: boolean;
    mode: string;
    obstacleAvoidance: boolean;
    pathPlanning: boolean;
  };
  timestamp: string;
}

export interface WsLidar {
  points: { angle: number; distanceMm: number; quality: number }[];
  timestamp: string;
}

interface UseRoverWsReturn {
  status: WsStatus;
  telemetry: WsTelemetry | null;
  lidar: WsLidar | null;
  reconnect: () => void;
  sendMessage: (message: WsCommand) => boolean;
}

function buildWsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/ws`;
}

export function useRoverWs(): UseRoverWsReturn {
  const [status, setStatus] = useState<WsStatus>("connecting");
  const [telemetry, setTelemetry] = useState<WsTelemetry | null>(null);
  const [lidar, setLidar] = useState<WsLidar | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const sendMessage = useCallback((message: WsCommand) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return false;
    wsRef.current.send(JSON.stringify(message));
    return true;
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      if (wsRef.current.readyState < 2) {
        wsRef.current.close();
      }
    }

    setStatus("connecting");
    const ws = new WebSocket(buildWsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setStatus("connected");
    };

    ws.onmessage = (event: MessageEvent) => {
      if (!mountedRef.current) return;
      try {
        const msg = JSON.parse(event.data as string) as { type: string; payload: unknown };
        if (msg.type === "telemetry") {
          setTelemetry(msg.payload as WsTelemetry);
        } else if (msg.type === "lidar") {
          setLidar(msg.payload as WsLidar);
        }
      } catch {
        // ignore malformed
      }
    };

    ws.onerror = () => {
      if (!mountedRef.current) return;
      setStatus("error");
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setStatus("disconnected");
      // Auto-reconnect after 3 seconds
      reconnectTimer.current = setTimeout(() => {
        if (mountedRef.current) connect();
      }, 3000);
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.onopen = null;
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.onmessage = null;
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { status, telemetry, lidar, reconnect: connect, sendMessage };
}
