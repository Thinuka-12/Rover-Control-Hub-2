import { useEffect, useRef, useState, useCallback } from "react";
import {
  useGetTelemetry, useGetLidarData, useSendRoverCommand, useStopRover,
  useToggleAutonomousMode, useGetArmStatus, useSendArmCommand, useHomeArm,
  useGetMapState, useSetMapRecording, useClearMapPath, useAddWaypoint,
  useGetHomePosition,
  RoverCommandInputCommand, AutonomousToggleInputMode,
} from "@workspace/api-client-react";
import { useRoverWs } from "@/hooks/use-rover-ws";
import { useBluetooth } from "@/hooks/use-bluetooth";
import { useCameraFeeds } from "@/hooks/use-camera-feeds";
import { useLocalSettings } from "@/hooks/use-local-settings";
import { useOperatorRole } from "@/hooks/use-operator-role";
import { OperatorSelector } from "@/components/operator-selector";
import { AutonomousPanel } from "@/components/autonomous-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Battery, Thermometer, Wind, Bluetooth, BluetoothOff, Radio, Target,
  Circle, Square, MapPin, ZoomIn, ZoomOut, Navigation, RotateCcw,
  Grab, Home, WifiOff, Activity, Crosshair, Settings, Map, Shield, Eye,
  Scan, Glasses, Film, ChevronDown,
} from "lucide-react";
import { ArmVisualizer3D } from "@/components/arm-visualizer-3d";
import { LidarVisualizer3D } from "@/components/lidar-visualizer-3d";
import { useProximityAlarm } from "@/hooks/use-proximity-alarm";
import { ArtifactDetection, type ArtifactMarker } from "@/components/artifact-detection";
import { VrMode } from "@/components/vr-mode";
import { MissionRecorder } from "@/components/mission-recorder";
import { GpsPanel } from "@/components/gps-panel";
import { ArcGauge } from "@/components/arc-gauge";
import { Joystick } from "@/components/Joystick";

interface PathPoint { x: number; y: number; headingDeg: number; speed: number; timestamp: string; }
interface Waypoint { id: string; label: string; x: number; y: number; timestamp: string; }
interface Position { x: number; y: number; headingDeg: number; timestamp: string; }

type RightTab = "sensors" | "arm";
type CenterView = "map" | "lidar";

export default function Dashboard() {
  // ── Data hooks ──────────────────────────────────────────────────────────────
  const { settings, getEffectiveCameraUrl } = useLocalSettings();
  const { status: wsStatus, telemetry: wsTelemetry, lidar: wsLidar, reconnect } = useRoverWs();
  const telemetryRest = useGetTelemetry({ query: { refetchInterval: 1000 } as never });
  const lidarRest = useGetLidarData({ query: { refetchInterval: 1000 } as never });
  const mapStateQuery = useGetMapState({ query: { refetchInterval: 3000 } as never });
  const armQuery = useGetArmStatus({ query: { refetchInterval: 1000 } as never });
  const { btStatus, btDevice, isAvailable, connect: btConnect, disconnect: btDisconnect, sendCommand: btSend } = useBluetooth();
  const { feeds: cameraFeeds } = useCameraFeeds();

  const telemetry = wsTelemetry ?? telemetryRest.data;
  const lidarData = wsLidar ?? lidarRest.data;

  // ── Mutations ───────────────────────────────────────────────────────────────
  const sendCommand = useSendRoverCommand();
  const stopRover = useStopRover();
  const toggleAuto = useToggleAutonomousMode();
  const sendArm = useSendArmCommand();
  const homeArm = useHomeArm();
  const setMapRec = useSetMapRecording();
  const clearMapPath = useClearMapPath();
  const addWaypoint = useAddWaypoint();

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [rightTab, setRightTab] = useState<RightTab>("sensors");
  const [centerView, setCenterView] = useState<CenterView>("map");
  const [activeKey, setActiveKey] = useState<string | null>(null);

  // ── Proximity alarm ──────────────────────────────────────────────────────────
  const [alarmThreshold, setAlarmThreshold] = useState(600);
  const [alarmEnabled, setAlarmEnabled] = useState(true);
  const { alarming, level: alarmLevel, closestMm } = useProximityAlarm(lidarData, alarmThreshold, alarmEnabled);

  // ── Operator role ─────────────────────────────────────────────────────────────
  const { operator, hasRole, assignRole, canDrive, canArm, canAutonom, currentMeta } = useOperatorRole();
  const [showRoleSwitcher, setShowRoleSwitcher] = useState(false);
  const [showAutoPanel, setShowAutoPanel] = useState(false);
  const [showVr, setShowVr] = useState(false);
  const [showMission, setShowMission] = useState(false);
  const [showGps, setShowGps] = useState(false);
  const [showArtifacts, setShowArtifacts] = useState(false);
  const [artifactMarkers, setArtifactMarkers] = useState<ArtifactMarker[]>([]);

  // ── Home position ─────────────────────────────────────────────────────────────
  const homeQuery = useGetHomePosition({ query: { refetchInterval: 5000 } as never });

  // ── Map state ────────────────────────────────────────────────────────────────
  const [localPath, setLocalPath] = useState<PathPoint[]>([]);
  const [localWaypoints, setLocalWaypoints] = useState<Waypoint[]>([]);
  const [recording, setRecording] = useState(false);
  const [mapDist, setMapDist] = useState(0);
  const [mapDur, setMapDur] = useState(0);
  const [wsPos, setWsPos] = useState<Position | null>(null);
  const [mapScale, setMapScale] = useState(40);
  const [mapPan, setMapPan] = useState({ x: 0, y: 0 });
  const [followRover, setFollowRover] = useState(true);
  const [panningMap, setPanningMap] = useState(false);
  const mapPanStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const [wpLabel, setWpLabel] = useState("");

  // ── Camera state ─────────────────────────────────────────────────────────────
  const [camError, setCamError] = useState(false);
  const effectiveCameraUrl = getEffectiveCameraUrl(settings);
  const primaryCameraUrl = cameraFeeds.find((f) => f.url && f.status === "connected")?.url || effectiveCameraUrl || "";

  // ── Canvas refs ──────────────────────────────────────────────────────────────
  const mapCanvasRef = useRef<HTMLCanvasElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapAnimRef = useRef<number>(0);

  // ── Sync map REST state ───────────────────────────────────────────────────────
  useEffect(() => {
    if (mapStateQuery.data) {
      setLocalPath(mapStateQuery.data.path);
      setLocalWaypoints(mapStateQuery.data.waypoints);
      setRecording(mapStateQuery.data.recording);
      setMapDist(mapStateQuery.data.totalDistanceM);
      setMapDur(mapStateQuery.data.durationSeconds);
    }
  }, [mapStateQuery.data]);

  // ── WS position subscription ─────────────────────────────────────────────────
  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}/api/ws`);
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as { type: string; payload: unknown };
        if (msg.type === "position") {
          const pos = msg.payload as Position;
          setWsPos(pos);
          if (recording) {
            setLocalPath((prev) => {
              const last = prev[prev.length - 1];
              if (!last || Math.abs(pos.x - last.x) > 0.02 || Math.abs(pos.y - last.y) > 0.02)
                return [...prev.slice(-4999), { ...pos, speed: wsTelemetry?.rover.speed ?? 0 }];
              return prev;
            });
          }
        }
      } catch { /* ignore */ }
    };
    return () => ws.close();
  }, [recording, wsTelemetry]);

  // ── Recording duration ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!recording) return;
    const iv = setInterval(() => setMapDur((s) => s + 1), 1000);
    return () => clearInterval(iv);
  }, [recording]);


  // ── Map canvas ────────────────────────────────────────────────────────────────
  const currentPos = wsPos ?? mapStateQuery.data?.position ?? { x: 0, y: 0, headingDeg: 0, timestamp: "" };

  useEffect(() => {
    const canvas = mapCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const draw = () => {
      const W = canvas.width, H = canvas.height;
      const cx = W / 2 + mapPan.x, cy = H / 2 + mapPan.y;
      const ox = followRover ? cx - currentPos.x * mapScale : cx;
      const oy = followRover ? cy + currentPos.y * mapScale : cy;
      ctx.fillStyle = "#060606"; ctx.fillRect(0, 0, W, H);
      // Grid
      const gOp = Math.min(1, (mapScale - 10) / 30);
      if (gOp > 0.05) {
        ctx.strokeStyle = `rgba(35,35,35,${gOp})`; ctx.lineWidth = 1;
        for (let x = ox % mapScale; x < W; x += mapScale) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
        for (let y = oy % mapScale; y < H; y += mapScale) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      }
      // Origin crosshair
      ctx.strokeStyle = "rgba(60,60,60,0.7)"; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(ox, 0); ctx.lineTo(ox, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, oy); ctx.lineTo(W, oy); ctx.stroke();
      ctx.setLineDash([]);
      // Path
      if (localPath.length > 1) {
        ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.lineCap = "round";
        for (let i = 1; i < localPath.length; i++) {
          ctx.strokeStyle = `rgba(255,176,0,${0.15 + (i / localPath.length) * 0.85})`;
          ctx.beginPath();
          ctx.moveTo(ox + localPath[i - 1].x * mapScale, oy - localPath[i - 1].y * mapScale);
          ctx.lineTo(ox + localPath[i].x * mapScale, oy - localPath[i].y * mapScale);
          ctx.stroke();
        }
      }
      // Waypoints
      for (const wp of localWaypoints) {
        const wx = ox + wp.x * mapScale, wy = oy - wp.y * mapScale;
        ctx.fillStyle = "#00e5ff"; ctx.beginPath(); ctx.arc(wx, wy, 4, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(0,229,255,0.3)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(wx, wy, 8, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = "#00e5ff"; ctx.font = "bold 9px monospace"; ctx.fillText(wp.label, wx + 6, wy - 4);
      }
      // Home beacon
      const home = homeQuery.data;
      if (home?.set) {
        const hx = ox + home.x * mapScale, hy = oy - home.y * mapScale;
        // Outer pulse ring
        ctx.strokeStyle = "rgba(240,98,146,0.25)"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(hx, hy, 14, 0, Math.PI * 2); ctx.stroke();
        // Inner ring
        ctx.strokeStyle = "#f06292"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(hx, hy, 7, 0, Math.PI * 2); ctx.stroke();
        // H marker
        ctx.fillStyle = "#f06292"; ctx.textAlign = "center"; ctx.font = "bold 8px monospace"; ctx.fillText("H", hx, hy + 3);
        ctx.textAlign = "left"; ctx.font = "8px monospace"; ctx.fillText("HOME", hx + 10, hy - 4);
      }
      // Scale bar
      const bm = mapScale >= 40 ? 5 : mapScale >= 20 ? 10 : 20;
      const bp = bm * mapScale;
      ctx.strokeStyle = "#ffb000"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(12, H - 20); ctx.lineTo(12 + bp, H - 20);
      ctx.moveTo(12, H - 24); ctx.lineTo(12, H - 16);
      ctx.moveTo(12 + bp, H - 24); ctx.lineTo(12 + bp, H - 16); ctx.stroke();
      ctx.fillStyle = "#ffb000"; ctx.font = "9px monospace"; ctx.fillText(`${bm}m`, 12 + bp / 2 - 7, H - 24);
      // Rover
      const rx = ox + currentPos.x * mapScale, ry = oy - currentPos.y * mapScale;
      const hRad = (currentPos.headingDeg - 90) * (Math.PI / 180);
      const grd2 = ctx.createRadialGradient(rx, ry, 0, rx, ry, 16);
      grd2.addColorStop(0, "rgba(0,230,118,0.3)"); grd2.addColorStop(1, "rgba(0,230,118,0)");
      ctx.fillStyle = grd2; ctx.beginPath(); ctx.arc(rx, ry, 16, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.translate(rx, ry); ctx.rotate(hRad);
      ctx.fillStyle = "#00e676"; ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(5, 7); ctx.lineTo(0, 3); ctx.lineTo(-5, 7); ctx.closePath(); ctx.fill();
      ctx.restore();
      // Artifact markers
      for (const am of artifactMarkers) {
        const ax = ox + am.x * mapScale, ay = oy - am.y * mapScale;
        // Glow
        const amGrd = ctx.createRadialGradient(ax, ay, 0, ax, ay, 10);
        amGrd.addColorStop(0, "rgba(204,68,255,0.35)"); amGrd.addColorStop(1, "rgba(204,68,255,0)");
        ctx.fillStyle = amGrd; ctx.beginPath(); ctx.arc(ax, ay, 10, 0, Math.PI * 2); ctx.fill();
        // Diamond marker
        ctx.save(); ctx.translate(ax, ay); ctx.rotate(Math.PI / 4);
        ctx.fillStyle = "#cc44ff"; ctx.strokeStyle = "rgba(204,68,255,0.6)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.rect(-4, -4, 8, 8); ctx.fill(); ctx.stroke();
        ctx.restore();
        // Label
        ctx.fillStyle = "#cc44ff"; ctx.font = "bold 8px monospace";
        ctx.fillText(am.type.slice(0, 10), ax + 7, ay - 4);
      }
      // Coords
      ctx.fillStyle = "#444"; ctx.font = "9px monospace";
      ctx.fillText(`X:${currentPos.x.toFixed(1)} Y:${currentPos.y.toFixed(1)} H:${Math.round(currentPos.headingDeg)}°`, 12, H - 8);
      mapAnimRef.current = requestAnimationFrame(draw);
    };
    mapAnimRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(mapAnimRef.current);
  }, [localPath, localWaypoints, currentPos, mapScale, mapPan, followRover, homeQuery.data, artifactMarkers]);

  // ── Resize map canvas ─────────────────────────────────────────────────────────
  useEffect(() => {
    const el = mapContainerRef.current, canvas = mapCanvasRef.current;
    if (!el || !canvas) return;
    const resize = () => { canvas.width = el.clientWidth; canvas.height = el.clientHeight; };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Keyboard drive ────────────────────────────────────────────────────────────
  const handleDrive = useCallback((cmd: RoverCommandInputCommand | "stop") => {
    if (!canDrive) return;
    if (cmd === "stop") { stopRover.mutate(); if (btStatus === "connected") btSend("STOP"); }
    else { sendCommand.mutate({ data: { command: cmd, speed: 80, duration: null } }); if (btStatus === "connected") btSend(cmd.toUpperCase()); }
  }, [sendCommand, stopRover, btStatus, btSend]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat || document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;
      let cmd: RoverCommandInputCommand | "stop" | null = null;
      switch (e.key.toLowerCase()) {
        case "w": case "arrowup": cmd = "forward"; setActiveKey("up"); break;
        case "s": case "arrowdown": cmd = "backward"; setActiveKey("down"); break;
        case "a": case "arrowleft": cmd = "left"; setActiveKey("left"); break;
        case "d": case "arrowright": cmd = "right"; setActiveKey("right"); break;
        case " ": cmd = "stop"; setActiveKey("stop"); break;
      }
      if (cmd) { e.preventDefault(); handleDrive(cmd); }
    };
    const up = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT") return;
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(e.key.toLowerCase())) {
        handleDrive("stop"); setActiveKey(null);
      }
    };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [handleDrive]);

  // ── Arm local state (optimistic — prevents refetch from snapping sliders mid-drag) ──
  const serverAxisDefaults = [
    { id: 1, label: "Base Rotation", angleDeg: 0,   minDeg: -180, maxDeg: 180 },
    { id: 2, label: "Shoulder",      angleDeg: 45,  minDeg: -90,  maxDeg: 90  },
    { id: 3, label: "Elbow",         angleDeg: -30, minDeg: -135, maxDeg: 135 },
    { id: 4, label: "Wrist Pitch",   angleDeg: 0,   minDeg: -90,  maxDeg: 90  },
    { id: 5, label: "Wrist Roll",    angleDeg: 0,   minDeg: -180, maxDeg: 180 },
    { id: 6, label: "Gripper Rot",   angleDeg: 0,   minDeg: -90,  maxDeg: 90  },
  ];
  const [localAxes, setLocalAxes] = useState(serverAxisDefaults);
  const armDragging = useRef(false);

  useEffect(() => {
    if (!armDragging.current && armQuery.data?.axes?.length) {
      setLocalAxes(armQuery.data.axes.map((a) => ({
        id: a.id, label: a.label, angleDeg: a.angleDeg, minDeg: a.minDeg, maxDeg: a.maxDeg,
      })));
    }
  }, [armQuery.data]);

  const axes = localAxes;

  const rover = telemetry?.rover;
  const sensors = telemetry?.sensors;
  const autoData = telemetry?.autonomous;

  const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const wsColor = wsStatus === "connected" ? "#00e676" : wsStatus === "connecting" ? "#ffb000" : "#ff4444";

  // ── Map pan handlers ──────────────────────────────────────────────────────────
  const onMapMouseDown = (e: React.MouseEvent) => {
    setFollowRover(false); setPanningMap(true);
    mapPanStart.current = { x: e.clientX, y: e.clientY, ox: mapPan.x, oy: mapPan.y };
  };
  const onMapMouseMove = (e: React.MouseEvent) => {
    if (!panningMap) return;
    setMapPan({ x: mapPanStart.current.ox + (e.clientX - mapPanStart.current.x), y: mapPanStart.current.oy + (e.clientY - mapPanStart.current.y) });
  };
  const onMapMouseUp = () => setPanningMap(false);
  const onMapWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setMapScale((s) => Math.max(5, Math.min(200, s * (e.deltaY < 0 ? 1.1 : 0.9))));
  };

  // ── JSX ───────────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="flex flex-col h-screen w-screen bg-background overflow-hidden font-mono text-xs">

        {/* ── HEADER STATUS BAR ─────────────────────────────────────────────── */}
        <header className="flex px-3 h-14 border-b border-border bg-black/60 shrink-0 overflow-x-auto gap-2 items-center">
          {/* Logo */}
          <div className="flex items-center gap-2 shrink-0 mr-2">
            <Activity className="w-5 h-5 text-primary" />
            <span className="font-bold text-primary text-sm tracking-widest">ROVER-CMD</span>
          </div>

          {/* WS */}
          <div className="flex items-center gap-1.5 px-3 py-2 border border-border rounded shrink-0 min-h-[40px]">
            <Radio className="w-4 h-4" style={{ color: wsColor }} />
            <span className="text-xs font-bold" style={{ color: wsColor }}>{wsStatus === "connected" ? "LIVE" : wsStatus === "connecting" ? "CONN…" : "OFFLINE"}</span>
            {wsStatus !== "connected" && <button onClick={reconnect} className="text-xs text-primary underline ml-1">retry</button>}
          </div>

          {/* Battery */}
          <div className="flex items-center gap-1.5 px-3 py-2 border border-border rounded shrink-0 min-h-[40px]">
            <Battery className="w-4 h-4 text-secondary" />
            <span className="text-xs text-secondary font-bold">{rover?.batteryLevel ?? 0}%</span>
          </div>

          {/* Speed */}
          <div className="flex items-center gap-1.5 px-3 py-2 border border-border rounded shrink-0 min-h-[40px]">
            <Wind className="w-4 h-4 text-primary" />
            <span className="text-xs text-primary font-bold">{(rover?.speed ?? 0).toFixed(1)} m/s</span>
          </div>

          {/* Temp */}
          <div className="flex items-center gap-1.5 px-3 py-2 border border-border rounded shrink-0 min-h-[40px]">
            <Thermometer className="w-4 h-4 text-red-400" />
            <span className="text-xs text-red-400 font-bold">{rover?.motorTemperature ?? 0}°C</span>
          </div>

          {/* Direction */}
          <Badge variant="outline" className="text-xs px-3 py-1.5 h-10 border-primary/50 text-primary uppercase shrink-0">
            {rover?.direction ?? "idle"}
          </Badge>

          {/* BLE */}
          <div className="flex items-center gap-1.5 px-3 py-2 border border-border rounded shrink-0 min-h-[40px]">
            {btStatus === "connected" ? (
              <button onClick={btDisconnect} className="flex items-center gap-1.5 text-blue-400">
                <Bluetooth className="w-4 h-4" />
                <span className="text-xs">{btDevice?.name?.slice(0, 10) ?? "BLE"}</span>
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              </button>
            ) : btStatus === "connecting" ? (
              <span className="flex items-center gap-1.5 text-xs text-yellow-400"><Bluetooth className="w-4 h-4 animate-pulse" />PAIRING</span>
            ) : isAvailable ? (
              <button onClick={btConnect} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-blue-400">
                <BluetoothOff className="w-4 h-4" />BLE
              </button>
            ) : (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground/40"><BluetoothOff className="w-4 h-4" />NO BLE</span>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2 shrink-0">
            {/* Proximity alarm badge */}
            {alarming && (
              <span className={`flex items-center gap-1.5 text-xs font-bold border rounded px-3 py-2 shrink-0
                ${alarmLevel === "critical"
                  ? "text-red-300 border-red-500 bg-red-500/20 animate-pulse"
                  : "text-orange-300 border-orange-500/70 bg-orange-500/10 animate-pulse"
                }`}>
                <span className={`w-2 h-2 rounded-full ${alarmLevel === "critical" ? "bg-red-400" : "bg-orange-400"}`} />
                ⚠ OBSTACLE {closestMm != null ? `${Math.round(closestMm)}mm` : ""}
              </span>
            )}

            {/* Recording indicator */}
            {recording && (
              <span className="flex items-center gap-1.5 text-xs text-red-400 animate-pulse border border-red-500/40 rounded px-3 py-2">
                <span className="w-2 h-2 rounded-full bg-red-500" /> REC {fmtDur(mapDur)}
              </span>
            )}

            {/* Autonomous panel button */}
            <button
              onClick={() => setShowAutoPanel(true)}
              className={`flex items-center gap-2 px-3 py-2 border rounded text-xs font-bold transition-colors shrink-0 min-h-[40px] ${
                autoData?.enabled
                  ? "border-primary/70 text-primary bg-primary/10"
                  : "border-border text-muted-foreground hover:text-primary hover:border-primary/50"
              }`}
            >
              <Navigation className="w-4 h-4" />
              AUTO {autoData?.enabled ? `● ${(autoData.mode ?? "").toUpperCase()}` : "OFF"}
            </button>

            {/* Operator role switcher */}
            <div className="relative shrink-0">
              <button
                onClick={() => setShowRoleSwitcher((v) => !v)}
                className="flex items-center gap-2 px-3 py-2 border rounded hover:border-primary/50 transition-colors min-h-[40px]"
                style={{ borderColor: `${currentMeta.color}40` }}
                title="Switch operator role"
              >
                <Shield className="w-4 h-4" style={{ color: currentMeta.color }} />
                <span className="text-xs font-bold" style={{ color: currentMeta.color }}>{currentMeta.label}</span>
                <ChevronDown className="w-3 h-3 ml-0.5 text-muted-foreground/60" />
              </button>

              {showRoleSwitcher && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowRoleSwitcher(false)} />
                  <div className="absolute right-0 top-full mt-1 z-50 bg-black/95 border border-border rounded-lg shadow-2xl overflow-hidden min-w-56 font-mono backdrop-blur-md">
                    <div className="px-4 py-3 border-b border-border">
                      <span className="text-xs text-muted-foreground/60 tracking-widest uppercase">Switch Role</span>
                    </div>
                    {([
                      { role: "pilot" as const,    label: "PILOT",     color: "#00e676", desc: "Full command authority",    icon: "🛡" },
                      { role: "co-pilot" as const, label: "CO-PILOT",  color: "#ffb000", desc: "Drive & sensor monitoring", icon: "⚙" },
                      { role: "observer" as const, label: "OBSERVER",  color: "#888",    desc: "Read-only live feed",       icon: "👁" },
                    ]).map((r) => {
                      const active = operator?.role === r.role;
                      return (
                        <button key={r.role}
                          onClick={() => { assignRole(r.role, operator?.name ?? ""); setShowRoleSwitcher(false); }}
                          className="w-full flex items-center gap-3 px-4 py-4 hover:bg-white/5 transition-colors text-left min-h-[56px]"
                          style={{ background: active ? `${r.color}0d` : undefined }}
                        >
                          <span className="text-xl leading-none">{r.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold tracking-wide" style={{ color: r.color }}>{r.label}</span>
                              {active && (
                                <span className="text-[10px] px-1.5 py-0.5 border rounded" style={{ borderColor: `${r.color}50`, color: r.color }}>ACTIVE</span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground/60 mt-0.5">{r.desc}</div>
                          </div>
                          {active && <div className="w-2 h-2 rounded-full shrink-0" style={{ background: r.color }} />}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Feature panel buttons */}
            <button onClick={() => setShowArtifacts(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-2 border border-cyan-500/40 text-cyan-400 rounded hover:bg-cyan-500/10 shrink-0 transition-colors min-h-[40px]">
              <Scan className="w-4 h-4" /> AI
            </button>
            <button onClick={() => setShowGps(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-2 border border-green-500/40 text-green-400 rounded hover:bg-green-500/10 shrink-0 transition-colors min-h-[40px]">
              <MapPin className="w-4 h-4" /> GPS
            </button>
            <button onClick={() => setShowMission(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-2 border border-purple-500/40 text-purple-400 rounded hover:bg-purple-500/10 shrink-0 transition-colors min-h-[40px]">
              <Film className="w-4 h-4" /> MISSION
            </button>
            <button onClick={() => setShowVr(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-2 border border-blue-500/40 text-blue-400 rounded hover:bg-blue-500/10 shrink-0 transition-colors min-h-[40px]">
              <Glasses className="w-4 h-4" /> VR
            </button>

            <a href="/settings" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary px-3 py-2 border border-border rounded min-h-[40px]">
              <Settings className="w-4 h-4" />
            </a>
          </div>
        </header>

        {/* ── MAIN 3-COLUMN GRID ────────────────────────────────────────────── */}
        <div className="flex flex-1 min-h-0 divide-x divide-border">

          {/* ── LEFT PANEL (300px) ─────────────────────────────────────────── */}
          <div className="w-[300px] shrink-0 flex flex-col divide-y divide-border overflow-y-auto">

            {/* Primary camera */}
            <DashCamWidget url={primaryCameraUrl} camError={camError} onError={() => setCamError(true)} onLoad={() => setCamError(false)} />

            {/* Additional camera feeds (from cameras page config) */}
            {cameraFeeds.slice(0, 2).map((f) => f.url && f.status === "connected" ? (
              <div key={f.id} className="relative bg-black shrink-0" style={{ aspectRatio: "16/9" }}>
                <span className="absolute top-1 left-1 z-10 text-[8px] text-primary/60 font-bold bg-black/60 px-1">{f.label}</span>
                <img src={f.source === "snapshot" && f.snapshotDataUrl ? f.snapshotDataUrl : f.url} alt={f.label} className="w-full h-full object-cover" />
              </div>
            ) : null)}

            {/* Joystick */}
            <div className="p-4 shrink-0">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Drive Control</span>
                <button onClick={() => handleDrive("stop")} className="text-xs border-2 border-destructive text-destructive hover:bg-destructive/20 px-4 py-2 rounded font-bold min-h-[40px] active:bg-destructive active:text-white transition-colors">⏹ STOP</button>
              </div>
              <Joystick onCommand={(cmd) => handleDrive(cmd)} activeKey={activeKey} size={220} />
            </div>

            {/* Telemetry arc gauges */}
            <div className="p-3 shrink-0">
              <span className="text-[10px] text-muted-foreground uppercase block mb-2">Telemetry</span>
              <div className="flex items-center justify-around">
                <ArcGauge
                  value={rover?.batteryLevel ?? 0}
                  label="Battery"
                  unit="%"
                  size={82}
                  strokeWidth={7}
                  color={(rover?.batteryLevel ?? 0) <= 15 ? "#ff4444" : (rover?.batteryLevel ?? 0) <= 30 ? "#ffb000" : "#00e676"}
                />
                <ArcGauge
                  value={rover?.motorTemperature ?? 0}
                  max={100}
                  label="Motor °C"
                  unit="°"
                  size={82}
                  strokeWidth={7}
                  color={(rover?.motorTemperature ?? 0) >= 80 ? "#ff4444" : (rover?.motorTemperature ?? 0) >= 60 ? "#ffb000" : "#00f5ff"}
                />
                <ArcGauge
                  value={Math.min((rover?.speed ?? 0) * 10, 100)}
                  label="Speed"
                  unit="m/s"
                  size={82}
                  strokeWidth={7}
                  color="#0080ff"
                />
              </div>
              {/* Extended telemetry row */}
              <div className="mt-2 space-y-1 text-[9px] font-mono">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Wheels</span>
                  <span className="text-primary">{rover?.wheelCount ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Direction</span>
                  <span className="text-cyan-400 uppercase">{rover?.direction ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">WiFi RSSI</span>
                  <span className="text-yellow-400">— dBm</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">CPU / RAM</span>
                  <span className="text-blue-400">— / —</span>
                </div>
                {/* Per-wheel motor indicators */}
                <div className="pt-1 border-t border-border/40">
                  <div className="text-[8px] text-muted-foreground/50 mb-1 uppercase tracking-wider">Motor Status</div>
                  <div className="grid grid-cols-4 gap-0.5">
                    {["FL","FR","RL","RR"].map((wh) => (
                      <div key={wh} className="flex flex-col items-center gap-0.5">
                        <div className={`w-3 h-3 rounded-sm ${rover?.connected ? "bg-green-500/60" : "bg-muted/20"}`} />
                        <span className="text-[7px] text-muted-foreground/50">{wh}</span>
                      </div>
                    ))}
                    {(rover?.wheelCount ?? 4) >= 6 && ["ML","MR"].map((wh) => (
                      <div key={wh} className="flex flex-col items-center gap-0.5">
                        <div className={`w-3 h-3 rounded-sm ${rover?.connected ? "bg-green-500/60" : "bg-muted/20"}`} />
                        <span className="text-[7px] text-muted-foreground/50">{wh}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className={`flex items-center justify-between pt-0.5 border-t border-border/40 font-bold ${rover?.connected ? "text-green-400" : "text-red-400"}`}>
                  <span>Link</span>
                  <span>{rover?.connected ? "● ONLINE" : "● OFFLINE"}</span>
                </div>
              </div>
            </div>

            {/* Path recording quick controls */}
            <div className="p-4 space-y-3 shrink-0">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground uppercase font-bold">Path Recording</span>
                <span className="text-xs font-mono text-primary">{mapDist.toFixed(1)}m / {fmtDur(mapDur)}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const next = !recording;
                    setMapRec.mutate({ data: { active: next } }, { onSuccess: (d) => { setRecording(d.recording); if (!d.recording) setLocalPath(d.path); } });
                    setRecording(next);
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded border text-xs font-bold transition-colors min-h-[44px] ${recording ? "border-red-500 text-red-400 bg-red-500/10 animate-pulse" : "border-primary/50 text-primary hover:bg-primary/10"}`}
                >
                  {recording ? <><Square className="w-3.5 h-3.5 fill-current" /> STOP REC</> : <><Circle className="w-3.5 h-3.5" /> RECORD</>}
                </button>
                <button
                  onClick={() => clearMapPath.mutate(undefined, { onSuccess: () => { setLocalPath([]); setLocalWaypoints([]); setRecording(false); setMapDist(0); setMapDur(0); } })}
                  className="px-4 py-2.5 border border-border rounded text-muted-foreground text-xs font-bold hover:text-destructive hover:border-destructive min-h-[44px]"
                >CLR</button>
              </div>
              <div className="flex gap-2">
                <Input value={wpLabel} onChange={(e) => setWpLabel(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { addWaypoint.mutate({ data: { label: wpLabel || `WP${localWaypoints.length + 1}` } }, { onSuccess: (wp) => { setLocalWaypoints((p) => [...p, wp]); setWpLabel(""); } }); } }}
                  placeholder="Waypoint label…" className="h-10 text-xs font-mono bg-background border-border px-3 flex-1" />
                <button
                  onClick={() => addWaypoint.mutate({ data: { label: wpLabel || `WP${localWaypoints.length + 1}` } }, { onSuccess: (wp) => { setLocalWaypoints((p) => [...p, wp]); setWpLabel(""); } })}
                  className="px-3 py-2 border border-cyan-500/40 text-cyan-400 rounded text-xs hover:bg-cyan-500/10 min-h-[40px]"
                ><MapPin className="w-4 h-4" /></button>
              </div>
              {/* Waypoint list */}
              <div className="space-y-1 max-h-28 overflow-y-auto">
                {localWaypoints.map((wp, i) => (
                  <div key={wp.id} className="flex items-center gap-2 text-xs py-1">
                    <span className="text-cyan-400 w-4 font-bold">{i + 1}</span>
                    <span className="flex-1 truncate text-foreground">{wp.label}</span>
                    <span className="text-muted-foreground font-mono">{wp.x.toFixed(1)},{wp.y.toFixed(1)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── CENTER PANEL (flex-1) ──────────────────────────────────────── */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Center tab bar */}
            <div className="flex gap-2 px-3 h-12 border-b border-border shrink-0 font-medium justify-between items-center flex-row">
              <button onClick={() => setCenterView("map")}
                className={`flex items-center gap-2 px-4 py-2 rounded text-xs font-bold transition-colors min-h-[40px] ${centerView === "map" ? "bg-primary/20 text-primary border border-primary/50" : "text-muted-foreground hover:text-foreground"}`}>
                <Map className="w-4 h-4" /> MAP
              </button>
              <button onClick={() => setCenterView("lidar")}
                className={`flex items-center gap-2 px-4 py-2 rounded text-xs font-bold transition-colors min-h-[40px] ${alarming
                  ? alarmLevel === "critical" ? "bg-red-500/20 text-red-400 border border-red-500/70" : "bg-orange-500/10 text-orange-400 border border-orange-500/50"
                  : centerView === "lidar" ? "bg-primary/20 text-primary border border-primary/50" : "text-muted-foreground hover:text-foreground"}`}>
                <Target className="w-4 h-4" /> LIDAR {alarming && <span className="animate-pulse">⚠</span>}
              </button>
              {centerView === "lidar" && (
                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={() => setAlarmEnabled((e) => !e)}
                    className={`flex items-center gap-2 px-3 py-2 rounded border text-xs font-bold transition-colors min-h-[40px] ${alarmEnabled ? "border-orange-500/50 text-orange-400 bg-orange-500/10" : "border-border text-muted-foreground"}`}
                  >
                    ⚠ ALARM
                  </button>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground font-mono">DIST</span>
                    <button onClick={() => setAlarmThreshold((t) => Math.max(100, t - 100))} className="w-10 h-10 flex items-center justify-center border border-border rounded text-muted-foreground hover:text-primary text-lg font-bold">−</button>
                    <span className="text-xs font-mono text-primary w-16 text-center">{alarmThreshold}mm</span>
                    <button onClick={() => setAlarmThreshold((t) => Math.min(3000, t + 100))} className="w-10 h-10 flex items-center justify-center border border-border rounded text-muted-foreground hover:text-primary text-lg font-bold">+</button>
                  </div>
                </div>
              )}
              {centerView === "map" && (
                <div className="ml-auto flex items-center gap-1.5">
                  <button onClick={() => setMapScale((s) => Math.min(200, s * 1.25))} className="p-2.5 border border-border rounded hover:border-primary hover:text-primary text-muted-foreground min-h-[40px]"><ZoomIn className="w-4 h-4" /></button>
                  <button onClick={() => setMapScale((s) => Math.max(5, s * 0.8))} className="p-2.5 border border-border rounded hover:border-primary hover:text-primary text-muted-foreground min-h-[40px]"><ZoomOut className="w-4 h-4" /></button>
                  <button onClick={() => { setFollowRover(true); setMapPan({ x: 0, y: 0 }); }}
                    className={`p-2.5 border rounded min-h-[40px] ${followRover ? "border-primary text-primary" : "border-border text-muted-foreground hover:border-primary hover:text-primary"}`}><Navigation className="w-4 h-4" /></button>
                  <button onClick={() => { setMapPan({ x: 0, y: 0 }); setFollowRover(false); }} className="p-2.5 border border-border rounded hover:border-primary text-muted-foreground min-h-[40px]"><RotateCcw className="w-4 h-4" /></button>
                  <span className="text-xs text-muted-foreground font-mono ml-1">{Math.round(mapScale)}px/m</span>
                </div>
              )}
            </div>

            {/* Center view */}
            <div className={`flex-1 relative min-h-0 bg-[#060606] transition-all ${alarming ? alarmLevel === "critical" ? "ring-2 ring-inset ring-red-500/80" : "ring-2 ring-inset ring-orange-500/50" : ""}`}>
              {/* Alarm flash overlay */}
              {alarming && (
                <div className={`absolute inset-0 pointer-events-none z-10 animate-pulse
                  ${alarmLevel === "critical" ? "bg-red-500/8" : "bg-orange-500/5"}`} />
              )}
              {/* MAP */}
              <div ref={mapContainerRef}
                className={`absolute inset-0 cursor-crosshair ${centerView === "map" ? "" : "hidden"}`}
                onMouseDown={onMapMouseDown} onMouseMove={onMapMouseMove} onMouseUp={onMapMouseUp} onMouseLeave={onMapMouseUp} onWheel={onMapWheel}>
                <canvas ref={mapCanvasRef} className="w-full h-full" />
              </div>
              {/* LIDAR 3D */}
              <div className={`absolute inset-0 ${centerView === "lidar" ? "" : "hidden"}`}>
                <LidarVisualizer3D lidarData={lidarData} className="w-full h-full" />
              </div>
            </div>
          </div>

          {/* ── RIGHT PANEL (280px) ────────────────────────────────────────── */}
          <div className="w-[280px] shrink-0 flex flex-col divide-y divide-border">
            {/* Tab bar */}
            <div className="flex h-12 shrink-0">
              {(["sensors", "arm"] as RightTab[]).map((tab) => (
                <button key={tab} onClick={() => setRightTab(tab)}
                  className={`flex-1 text-xs font-bold uppercase tracking-wider transition-colors ${rightTab === tab ? "bg-primary/15 text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}>
                  {tab === "sensors" ? "SENSORS" : "ARM"}
                </button>
              ))}
            </div>

            {/* Sensors tab */}
            {rightTab === "sensors" && (
              <div className="flex-1 overflow-y-auto p-4 space-y-5">
                {/* Ultrasonic */}
                <div>
                  <p className="text-xs text-muted-foreground uppercase border-b border-border/50 pb-1.5 mb-3 font-bold tracking-wider">Ultrasonic (UR)</p>
                  <div className="space-y-3">
                    {sensors?.ultrasonic?.map((u) => (
                      <div key={u.id}>
                        <div className="flex justify-between mb-1">
                          <span className={`text-xs font-bold ${u.triggered ? "text-destructive" : "text-primary"}`}>{u.label}</span>
                          <span className={`text-xs font-mono font-bold ${u.triggered ? "text-destructive animate-pulse" : ""}`}>{u.distanceCm}cm</span>
                        </div>
                        <Progress value={Math.min((u.distanceCm / 400) * 100, 100)}
                          className={`h-2 ${u.triggered ? "bg-destructive/20 [&>div]:bg-destructive" : "bg-muted"}`} />
                      </div>
                    )) ?? <p className="text-xs text-muted-foreground/40">No data</p>}
                  </div>
                </div>

                {/* IR */}
                <div>
                  <p className="text-xs text-muted-foreground uppercase border-b border-border/50 pb-1.5 mb-3 font-bold tracking-wider">Infrared (IR)</p>
                  <div className="grid grid-cols-2 gap-2">
                    {sensors?.infrared?.map((ir) => (
                      <div key={ir.id} className={`p-3 border rounded flex flex-col items-center text-center ${ir.detected ? "border-destructive bg-destructive/10 text-destructive" : "border-border text-muted-foreground"}`}>
                        <span className="text-xs font-bold uppercase">{ir.label}</span>
                        <span className="text-xs mt-0.5">{ir.detected ? "OBSTACLE" : "CLEAR"}</span>
                        <span className="text-[10px] opacity-50 font-mono mt-0.5">{ir.rawValue}</span>
                      </div>
                    )) ?? null}
                  </div>
                </div>

                {/* Obstacle warning */}
                {sensors?.ultrasonic?.some((u) => u.triggered) && (
                  <div className="p-3 border border-destructive rounded bg-destructive/10 text-destructive text-sm text-center font-bold animate-pulse">
                    ⚠ OBSTACLE DETECTED
                  </div>
                )}
              </div>
            )}

            {/* Arm tab */}
            {rightTab === "arm" && (
              <div className="flex-1 flex flex-col min-h-0">
                {/* 3D Visualizer */}
                <div className="h-[200px] shrink-0 border-b border-border bg-[#060606] relative">
                  <ArmVisualizer3D
                    axes={axes}
                    gripping={armQuery.data?.gripping ?? false}
                    className="w-full h-full"
                  />
                  <div className="absolute top-1.5 left-1.5 text-[8px] text-muted-foreground/40 pointer-events-none select-none">
                    DRAG to orbit · SCROLL to zoom
                  </div>
                  <div className="absolute top-1.5 right-1.5 flex items-center gap-1 pointer-events-none">
                    <span className={`text-[9px] font-mono ${armQuery.data?.moving ? "text-yellow-400 animate-pulse" : "text-muted-foreground/40"}`}>
                      {armQuery.data?.moving ? "● MOVING" : "○ HOLD"}
                    </span>
                  </div>
                </div>

                {/* Controls */}
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {/* Arm header */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground uppercase">6-Axis Manipulator</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] text-muted-foreground">GRIP</span>
                    <Switch
                      checked={armQuery.data?.gripping ?? false}
                      onCheckedChange={(c) => sendArm.mutate({ data: { axes: [], grip: c } })}
                      className="scale-75 origin-right"
                    />
                  </div>
                </div>

                {/* Arm status */}
                <div className="flex items-center justify-between">
                  <Grab className={`w-5 h-5 ${armQuery.data?.gripping ? "text-destructive" : "text-primary/40"}`} />
                  <span className={`text-[10px] font-mono ${armQuery.data?.moving ? "text-yellow-400" : "text-muted-foreground"}`}>
                    {armQuery.data?.moving ? "MOVING" : "HOLD"}
                  </span>
                  <Button size="sm" variant="outline" onClick={() => homeArm.mutate()} className="h-6 text-[10px] border-primary/40 text-primary hover:bg-primary/10 px-2">
                    <Home className="w-2.5 h-2.5 mr-1" />HOME
                  </Button>
                </div>

                {/* Axis sliders */}
                <div className="space-y-3">
                  {axes.map((axis) => (
                    <div key={axis.id}>
                      <div className="flex justify-between mb-1">
                        <span className="text-[10px] text-primary font-bold">A{axis.id} — {axis.label}</span>
                        <span className="text-[10px] font-mono text-secondary bg-secondary/10 px-1 rounded">{axis.angleDeg.toFixed(0)}°</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] text-muted-foreground w-7 text-right">{axis.minDeg}°</span>
                        <Slider
                          value={[axis.angleDeg]}
                          min={axis.minDeg}
                          max={axis.maxDeg}
                          step={1}
                          onValueChange={(v) => {
                            armDragging.current = true;
                            setLocalAxes((prev) =>
                              prev.map((a) => a.id === axis.id ? { ...a, angleDeg: v[0] } : a)
                            );
                          }}
                          onValueCommit={(v) => {
                            armDragging.current = false;
                            sendArm.mutate({ data: { axes: [{ id: axis.id, angleDeg: v[0] }], grip: null } });
                          }}
                          className="flex-1"
                        />
                        <span className="text-[9px] text-muted-foreground w-7">{axis.maxDeg}°</span>
                      </div>
                    </div>
                  ))}
                </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* ── Operator selector (first visit) ──────────────────────────────── */}
      {!hasRole && <OperatorSelector onConfirm={assignRole} />}
      {/* ── Autonomous control panel ──────────────────────────────────────── */}
      {showAutoPanel && (
        <AutonomousPanel
          onClose={() => setShowAutoPanel(false)}
          currentPos={currentPos}
          waypoints={localWaypoints}
          canAutonom={canAutonom}
          homeData={homeQuery.data ?? null}
          onHomeRefresh={() => void homeQuery.refetch()}
        />
      )}
      {/* ── Feature panels ─────────────────────────────────────────────────── */}
      {showArtifacts && (
        <ArtifactDetection
          onClose={() => setShowArtifacts(false)}
          cameraUrl={primaryCameraUrl}
          currentPos={currentPos}
          onArtifactDetected={(marker) => setArtifactMarkers((prev) => [...prev.slice(-49), marker])}
        />
      )}
      {showGps && (
        <GpsPanel
          onClose={() => setShowGps(false)}
          currentPos={currentPos}
          artifactMarkers={artifactMarkers}
        />
      )}
      {showMission && (
        <MissionRecorder
          onClose={() => setShowMission(false)}
          rover={rover}
          wsStatus={wsStatus}
          currentPos={currentPos}
        />
      )}
      {showVr && (
        <VrMode
          onClose={() => setShowVr(false)}
          cameraUrl={primaryCameraUrl}
          telemetry={wsTelemetry}
          onPanTiltCommand={(pan, tilt) => {
            // Log pan/tilt commands to console; wire to a camera servo API when available
            void console.debug("[VR] camera pan/tilt", { pan, tilt });
          }}
        />
      )}
      {/* ── Observer overlay (no commands) ───────────────────────────────── */}
      {hasRole && !canDrive && !canAutonom && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-4 py-2 bg-black/80 border border-border rounded-full font-mono backdrop-blur-sm pointer-events-none">
          <Eye className="w-3 h-3 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">OBSERVER MODE — Commands disabled</span>
        </div>
      )}
    </>
  );
}

// ── Mini drive key component ────────────────────────────────────────────────
function DKey({ active, onDown, onUp, label }: { active: boolean; onDown: () => void; onUp: () => void; label: string }) {
  return (
    <button
      className={`rounded border text-xs font-bold transition-colors select-none ${active ? "bg-primary text-primary-foreground border-primary" : "border-primary/50 text-primary hover:bg-primary/20"}`}
      onMouseDown={onDown} onMouseUp={onUp} onMouseLeave={onUp}
      onTouchStart={(e) => { e.preventDefault(); onDown(); }} onTouchEnd={onUp}
    >
      {label}
    </button>
  );
}

// ── Dashboard camera widget with PTZ overlay ─────────────────────────────────
function DashCamWidget({ url, camError, onError, onLoad }: { url: string; camError: boolean; onError: () => void; onLoad: () => void }) {
  const [showPtz, setShowPtz] = useState(false);
  const [pan, setPan] = useState(0);
  const [tilt, setTilt] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [feedback, setFeedback] = useState<string | null>(null);

  const ptz = (label: string, dp: number, dt: number, dz: number) => {
    setPan((p) => Math.max(-90, Math.min(90, p + dp)));
    setTilt((t) => Math.max(-45, Math.min(45, t + dt)));
    setZoom((z) => Math.max(1, Math.min(5, z + dz)));
    setFeedback(label);
    setTimeout(() => setFeedback(null), 600);
  };
  const resetPtz = () => { setPan(0); setTilt(0); setZoom(1); setFeedback("HOME"); setTimeout(() => setFeedback(null), 600); };

  return (
    <div className="relative bg-black shrink-0 group overflow-hidden" style={{ minHeight: 240, maxHeight: 300 }}>
      {/* Status badges */}
      <div className="absolute top-1.5 left-1.5 z-10 flex gap-1">
        <span className="px-1.5 py-0.5 bg-black/70 border border-primary/50 text-primary text-[9px] font-bold">CAM 01</span>
        {!url || camError
          ? <span className="px-1.5 py-0.5 bg-red-900/50 border border-red-500 text-red-400 text-[9px] animate-pulse">NO SIGNAL</span>
          : <span className="px-1.5 py-0.5 bg-green-900/40 border border-green-500/40 text-green-400 text-[9px]">LIVE</span>}
      </div>
      {/* PTZ toggle */}
      <button
        onClick={() => setShowPtz((v) => !v)}
        className={`absolute top-1.5 right-1.5 z-10 px-1.5 py-0.5 text-[8px] font-bold border rounded transition-colors ${showPtz ? "bg-cyan-500/20 border-cyan-500/60 text-cyan-400" : "bg-black/60 border-border text-muted-foreground/50 hover:text-cyan-400 hover:border-cyan-500/30 opacity-0 group-hover:opacity-100"}`}
      >PTZ</button>
      {/* Image with simulated PTZ transform */}
      <div className="absolute inset-0" style={{ transform: `scale(${zoom}) translate(${-pan * 0.2}%, ${tilt * 0.2}%)`, transition: "transform 0.15s ease" }}>
        {url && !camError
          ? <img src={url} alt="cam" className="w-full h-full object-cover" onError={onError} onLoad={onLoad} />
          : <div className="w-full h-full flex items-center justify-center text-muted-foreground/30 gap-2 text-center flex-col">
              <WifiOff className="w-8 h-8" /><span className="text-xs tracking-widest">UPLINK LOST</span>
            </div>}
      </div>
      {/* Crosshair */}
      <Crosshair className="absolute inset-0 m-auto w-10 h-10 text-primary/15 pointer-events-none stroke-1" />
      <div className="absolute top-1 right-1 w-3 h-3 border-t border-r border-primary/30 pointer-events-none" />
      <div className="absolute bottom-1 left-1 w-3 h-3 border-b border-l border-primary/30 pointer-events-none" />
      <div className="absolute bottom-1 right-1 w-3 h-3 border-b border-r border-primary/30 pointer-events-none" />
      {/* PTZ D-pad overlay */}
      {showPtz && (
        <div className="absolute bottom-1.5 right-1.5 z-10 bg-black/75 border border-cyan-500/20 rounded p-1.5 backdrop-blur-sm">
          <div className="grid grid-cols-3 gap-0.5 w-16 mb-1">
            <div />
            <button onClick={() => ptz("TILT UP", 0, -5, 0)} className="w-5 h-5 flex items-center justify-center border border-cyan-500/20 rounded text-cyan-400/60 hover:text-cyan-400 hover:bg-cyan-500/10 text-[8px]">▲</button>
            <div />
            <button onClick={() => ptz("PAN L", -5, 0, 0)} className="w-5 h-5 flex items-center justify-center border border-cyan-500/20 rounded text-cyan-400/60 hover:text-cyan-400 hover:bg-cyan-500/10 text-[8px]">◀</button>
            <button onClick={resetPtz} className="w-5 h-5 flex items-center justify-center border border-cyan-500/20 rounded text-cyan-400/40 hover:text-cyan-400 hover:bg-cyan-500/10 text-[7px]">⌂</button>
            <button onClick={() => ptz("PAN R", 5, 0, 0)} className="w-5 h-5 flex items-center justify-center border border-cyan-500/20 rounded text-cyan-400/60 hover:text-cyan-400 hover:bg-cyan-500/10 text-[8px]">▶</button>
            <div />
            <button onClick={() => ptz("TILT DN", 0, 5, 0)} className="w-5 h-5 flex items-center justify-center border border-cyan-500/20 rounded text-cyan-400/60 hover:text-cyan-400 hover:bg-cyan-500/10 text-[8px]">▼</button>
            <div />
          </div>
          <div className="flex gap-0.5 justify-center">
            <button onClick={() => ptz("Z+", 0, 0, 0.5)} className="px-1 py-0.5 text-[8px] border border-cyan-500/20 rounded text-cyan-400/60 hover:text-cyan-400 hover:bg-cyan-500/10">Z+</button>
            <button onClick={() => ptz("Z-", 0, 0, -0.5)} className="px-1 py-0.5 text-[8px] border border-cyan-500/20 rounded text-cyan-400/60 hover:text-cyan-400 hover:bg-cyan-500/10">Z-</button>
          </div>
          {feedback && <div className="text-[7px] text-cyan-400 text-center mt-0.5 animate-pulse font-mono">{feedback}</div>}
          <div className="text-[7px] text-muted-foreground/40 text-center font-mono mt-0.5">P:{pan > 0 ? "+" : ""}{pan} T:{tilt > 0 ? "+" : ""}{tilt} Z:{zoom.toFixed(1)}×</div>
        </div>
      )}
    </div>
  );
}
