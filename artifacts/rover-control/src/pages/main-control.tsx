import { useEffect, useRef, useState } from "react";
import { Layout } from "@/components/layout";
import {
  useGetTelemetry,
  useGetLidarData,
  useSendRoverCommand,
  useStopRover,
  useGetCameraInfo,
  useToggleAutonomousMode,
  RoverCommandInputCommand,
  AutonomousToggleInputMode,
  useGetRoverStatus,
  useGetSensorReadings,
  useGetAutonomousStatus,
} from "@workspace/api-client-react";
import { useLocalSettings } from "@/hooks/use-local-settings";
import { useRoverWs } from "@/hooks/use-rover-ws";
import { useBluetooth } from "@/hooks/use-bluetooth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Battery, Thermometer, Wind, Target, AlertTriangle, Crosshair, Bluetooth, BluetoothOff, Wifi, WifiOff, Radio } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Joystick } from "@/components/Joystick";

export default function MainControl() {
  const { settings, getEffectiveCameraUrl } = useLocalSettings();

  // REST queries (kept active for compatibility & fallback)
  const telemetryRest = useGetTelemetry({ query: { refetchInterval: settings.refreshRate } as never });
  const lidarRest = useGetLidarData({ query: { refetchInterval: 1000 } as never });
  const camera = useGetCameraInfo({ query: { refetchInterval: 5000 } as never });
  useGetRoverStatus({ query: { refetchInterval: 5000 } as never });
  useGetSensorReadings({ query: { refetchInterval: 5000 } as never });
  const autoStatusQuery = useGetAutonomousStatus({ query: { refetchInterval: 5000 } as never });

  // WebSocket live data (preferred when connected)
  const { status: wsStatus, telemetry: wsTelemetry, lidar: wsLidar, reconnect } = useRoverWs();

  // Prefer WS data, fall back to REST
  const telemetryData = wsTelemetry ?? telemetryRest.data;
  const lidarData = wsLidar ?? lidarRest.data;

  // Bluetooth
  const { btStatus, btDevice, btLog, isAvailable, connect: btConnect, disconnect: btDisconnect, sendCommand: btSend } = useBluetooth();
  const [showBtLog, setShowBtLog] = useState(false);

  // Mutations
  const sendCommand = useSendRoverCommand();
  const stopRover = useStopRover();
  const toggleAuto = useToggleAutonomousMode();

  const [activeKey, setActiveKey] = useState<string | null>(null);

  const handleDriveCommand = (cmd: RoverCommandInputCommand | "stop") => {
    if (cmd === "stop") {
      stopRover.mutate();
      if (btStatus === "connected") btSend("STOP");
    } else {
      sendCommand.mutate({ data: { command: cmd, speed: 80, duration: null } });
      if (btStatus === "connected") btSend(cmd.toUpperCase());
    }
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;
      let cmd: RoverCommandInputCommand | "stop" | null = null;
      switch (e.key.toLowerCase()) {
        case "w": case "arrowup": cmd = "forward"; setActiveKey("up"); break;
        case "s": case "arrowdown": cmd = "backward"; setActiveKey("down"); break;
        case "a": case "arrowleft": cmd = "left"; setActiveKey("left"); break;
        case "d": case "arrowright": cmd = "right"; setActiveKey("right"); break;
        case " ": cmd = "stop"; setActiveKey("stop"); break;
      }
      if (cmd) { e.preventDefault(); handleDriveCommand(cmd); }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;
      const key = e.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
        handleDriveCommand("stop");
        setActiveKey(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => { window.removeEventListener("keydown", handleKeyDown); window.removeEventListener("keyup", handleKeyUp); };
  }, [sendCommand, stopRover, btStatus]);

  const handlePadDown = (cmd: RoverCommandInputCommand) => handleDriveCommand(cmd);
  const handlePadUp = () => handleDriveCommand("stop");

  const roverData = telemetryData?.rover;
  const sensorData = telemetryData?.sensors;
  const autoData = telemetryData?.autonomous ?? autoStatusQuery.data;

  // Camera
  const effectiveCameraUrl = getEffectiveCameraUrl(settings) || camera.data?.streamUrl || "";
  const cameraConnected = Boolean(effectiveCameraUrl);
  const [imgKey, setImgKey] = useState(0);
  const [camError, setCamError] = useState(false);
  useEffect(() => {
    setCamError(false);
    const iv = setInterval(() => setImgKey((k) => k + 1), 1000);
    return () => clearInterval(iv);
  }, [effectiveCameraUrl]);

  // LIDAR canvas
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const size = canvas.width;
      const center = size / 2;
      const maxDist = 5000;

      ctx.fillStyle = "#080808";
      ctx.fillRect(0, 0, size, size);

      // Radar rings
      for (let i = 1; i <= 4; i++) {
        ctx.beginPath();
        ctx.arc(center, center, (center / 4) * i, 0, Math.PI * 2);
        ctx.strokeStyle = i === 4 ? "#2a2a2a" : "#1a1a1a";
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Crosshairs
      ctx.strokeStyle = "#1c1c1c";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(center, 0); ctx.lineTo(center, size);
      ctx.moveTo(0, center); ctx.lineTo(size, center);
      ctx.stroke();

      // Sweep
      const sweepAngle = ((Date.now() % 3000) / 3000) * Math.PI * 2;
      const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
      gradient.addColorStop(0, "rgba(255,176,0,0.12)");
      gradient.addColorStop(1, "rgba(255,176,0,0.01)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, center, sweepAngle - 0.6, sweepAngle);
      ctx.closePath();
      ctx.fill();

      // LIDAR points
      if (lidarData?.points) {
        lidarData.points.forEach((pt) => {
          if (pt.distanceMm <= 0 || pt.distanceMm >= maxDist) return;
          const r = (pt.distanceMm / maxDist) * center;
          const rad = (pt.angle - 90) * (Math.PI / 180);
          const x = center + r * Math.cos(rad);
          const y = center + r * Math.sin(rad);
          const alpha = Math.min(1, pt.quality / 200);
          ctx.fillStyle = pt.distanceMm < 600 ? `rgba(255,60,60,${alpha})` : `rgba(255,176,0,${alpha})`;
          ctx.beginPath();
          ctx.arc(x, y, pt.distanceMm < 600 ? 3 : 2, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      // Rover icon at center
      ctx.fillStyle = "#00e676";
      ctx.beginPath();
      ctx.arc(center, center, 5, 0, Math.PI * 2);
      ctx.fill();

      animFrameRef.current = requestAnimationFrame(draw);
    };

    animFrameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [lidarData]);

  const wsStatusColor = wsStatus === "connected" ? "#00e676" : wsStatus === "connecting" ? "#ffb000" : "#ff4444";
  const wsLabel = wsStatus === "connected" ? "WS LIVE" : wsStatus === "connecting" ? "WS CONN..." : "WS OFF";

  return (
    <Layout>
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-wider text-primary">Mission Control</h1>
          <p className="text-muted-foreground text-xs">REAL-TIME TELEMETRY & COMMAND</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* WS status */}
          <div className="flex items-center gap-2 px-3 py-1 border border-border rounded text-xs font-mono">
            <Radio className="w-3 h-3" style={{ color: wsStatusColor }} />
            <span style={{ color: wsStatusColor }}>{wsLabel}</span>
            {wsStatus !== "connected" && (
              <button onClick={reconnect} className="text-muted-foreground hover:text-primary text-[10px] underline ml-1">
                retry
              </button>
            )}
          </div>

          {/* Bluetooth */}
          <div className="flex items-center gap-2 px-3 py-1 border border-border rounded">
            {btStatus === "connected" ? (
              <button onClick={btDisconnect} className="flex items-center gap-2 text-xs" title={`Connected: ${btDevice?.name}`}>
                <Bluetooth className="w-3 h-3 text-blue-400" />
                <span className="text-blue-400 font-mono text-xs">{btDevice?.name?.substring(0, 12) ?? "BLE"}</span>
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse inline-block" />
              </button>
            ) : btStatus === "connecting" ? (
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <Bluetooth className="w-3 h-3 animate-pulse" /> PAIRING...
              </span>
            ) : isAvailable ? (
              <button onClick={btConnect} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary">
                <BluetoothOff className="w-3 h-3" /> BLUETOOTH
              </button>
            ) : (
              <span className="text-xs text-muted-foreground/50 flex items-center gap-1">
                <BluetoothOff className="w-3 h-3" /> NO BLE
              </span>
            )}
            {btLog.length > 0 && btStatus === "connected" && (
              <button onClick={() => setShowBtLog((v) => !v)} className="text-[10px] text-muted-foreground hover:text-primary underline">
                log
              </button>
            )}
          </div>

          {/* Autonomous mode */}
          <div className="flex flex-col items-end border border-border rounded px-3 py-1">
            <span className="text-[10px] text-muted-foreground uppercase">Autonomous</span>
            <div className="flex items-center gap-2 mt-0.5">
              <Switch
                checked={autoData?.enabled ?? false}
                onCheckedChange={(c) => toggleAuto.mutate({ data: { enabled: c, mode: (autoData?.mode === "idle" ? "exploring" : (autoData?.mode ?? "exploring")) as AutonomousToggleInputMode } })}
              />
              <Select
                value={autoData?.mode || "idle"}
                onValueChange={(val: string) => toggleAuto.mutate({ data: { enabled: autoData?.enabled ?? false, mode: val as AutonomousToggleInputMode } })}
                disabled={!(autoData?.enabled)}
              >
                <SelectTrigger className="w-[120px] h-7 text-xs bg-background">
                  <SelectValue placeholder="Mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="idle">IDLE</SelectItem>
                  <SelectItem value="exploring">EXPLORING</SelectItem>
                  <SelectItem value="homing">HOMING</SelectItem>
                  <SelectItem value="following">FOLLOWING</SelectItem>
                  <SelectItem value="patrolling">PATROLLING</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </header>

      {/* BT log panel */}
      {showBtLog && btLog.length > 0 && (
        <div className="mb-4 border border-blue-500/30 rounded bg-black p-3 font-mono text-xs text-blue-300 max-h-32 overflow-y-auto">
          {btLog.map((line, i) => <div key={i}>{line}</div>)}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left — camera + controls */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Camera feed */}
          <Card className="border-primary/30 relative overflow-hidden bg-black min-h-[280px]">
            <div className="absolute top-2 left-2 z-10 flex gap-2">
              <span className="px-2 py-1 bg-black/70 border border-primary/50 text-primary font-bold text-xs">CAM 01</span>
              {settings.cameraSource === "wifi" && (
                <span className="px-2 py-1 bg-black/70 border border-border text-muted-foreground text-xs flex items-center gap-1">
                  <Wifi className="w-3 h-3" /> WIFI
                </span>
              )}
              {!cameraConnected || camError ? (
                <span className="px-2 py-1 bg-red-900/50 border border-red-500 text-red-400 animate-pulse font-bold text-xs">NO SIGNAL</span>
              ) : (
                <span className="px-2 py-1 bg-green-900/40 border border-green-500/50 text-green-400 text-xs">LIVE</span>
              )}
            </div>

            {cameraConnected && !camError ? (
              <img
                key={imgKey}
                src={`${effectiveCameraUrl}${effectiveCameraUrl.includes("?") ? "&" : "?"}t=${Date.now()}`}
                alt="Rover Camera Feed"
                className="w-full h-full object-cover"
                style={{ minHeight: 260, filter: "contrast(1.2) saturate(1.1)" }}
                onError={() => setCamError(true)}
                onLoad={() => setCamError(false)}
              />
            ) : (
              <div className="w-full flex items-center justify-center flex-col text-destructive/40 py-20 gap-3">
                <WifiOff className="h-10 w-10" />
                <p className="text-xs tracking-widest">UPLINK LOST</p>
                {settings.cameraSource === "none" && (
                  <p className="text-[11px] text-muted-foreground/50">Configure camera in Settings</p>
                )}
                {settings.cameraSource === "wifi" && (
                  <p className="text-[11px] text-muted-foreground/50 font-mono">
                    {`http://${settings.wifiCameraIp}:${settings.wifiCameraPort}${settings.wifiCameraPath}`}
                  </p>
                )}
              </div>
            )}

            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                <Crosshair className="w-14 h-14 text-primary/25 stroke-1" />
              </div>
              {/* Corner brackets */}
              <div className="absolute top-2 right-2 w-5 h-5 border-t-2 border-r-2 border-primary/30" />
              <div className="absolute bottom-2 left-2 w-5 h-5 border-b-2 border-l-2 border-primary/30" />
              <div className="absolute bottom-2 right-2 w-5 h-5 border-b-2 border-r-2 border-primary/30" />
            </div>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Joystick */}
            <Card className="border-border bg-card">
              <CardHeader className="py-3 border-b border-border">
                <CardTitle className="text-sm font-bold tracking-widest flex items-center justify-between">
                  DRIVE CONTROL
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-[10px] h-6 px-2 border-destructive/50 text-destructive hover:bg-destructive/20"
                    onClick={() => handleDriveCommand("stop")}
                  >
                    STOP
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 flex justify-center items-center">
                <Joystick onCommand={handleDriveCommand} activeKey={activeKey} />
              </CardContent>
            </Card>

            {/* Telemetry */}
            <Card className="border-border bg-card">
              <CardHeader className="py-3 border-b border-border">
                <CardTitle className="text-sm font-bold tracking-widest">TELEMETRY</CardTitle>
              </CardHeader>
              <CardContent className="p-4 flex flex-col gap-4">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm"><Battery className="w-4 h-4 text-secondary" /> BATTERY</div>
                    <div className="font-bold text-secondary text-lg">{roverData?.batteryLevel ?? 0}%</div>
                  </div>
                  <Progress value={roverData?.batteryLevel ?? 0} className="h-2 bg-muted" />
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm"><Wind className="w-4 h-4 text-primary" /> SPEED</div>
                  <div className="font-bold text-primary text-lg">{(roverData?.speed ?? 0).toFixed(2)} m/s</div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm"><Thermometer className="w-4 h-4 text-destructive" /> TEMP</div>
                  <div className="font-bold text-destructive text-lg">{roverData?.motorTemperature ?? 0}°C</div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-muted-foreground text-sm">DIRECTION</div>
                  <Badge variant="outline" className="font-mono text-xs border-primary/50 text-primary uppercase">
                    {roverData?.direction ?? "—"}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-muted-foreground text-sm">WHEELS</div>
                  <span className="text-xs font-mono text-foreground">{roverData?.wheelCount ?? "—"}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Right — LIDAR + sensors */}
        <div className="flex flex-col gap-6">
          <Card className="border-border bg-card">
            <CardHeader className="py-3 border-b border-border">
              <CardTitle className="text-sm font-bold tracking-widest flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" /> RADAR / LIDAR
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 flex justify-center items-center">
              <canvas ref={canvasRef} width={280} height={280}
                className="rounded-full border border-border max-w-full aspect-square" />
            </CardContent>
          </Card>

          <Card className="border-border bg-card flex-1">
            <CardHeader className="py-3 border-b border-border">
              <CardTitle className="text-sm font-bold tracking-widest">PROXIMITY SENSORS</CardTitle>
            </CardHeader>
            <CardContent className="p-4 flex flex-col gap-4 overflow-y-auto max-h-[320px]">
              <div className="space-y-2">
                <h4 className="text-xs text-muted-foreground uppercase border-b border-border/50 pb-1">Ultrasonic (UR)</h4>
                {sensorData?.ultrasonic.map((u) => (
                  <div key={u.id} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className={u.triggered ? "text-destructive font-bold" : "text-primary"}>{u.label}</span>
                      <span className={u.triggered ? "text-destructive font-bold animate-pulse" : "text-foreground font-mono"}>{u.distanceCm} cm</span>
                    </div>
                    <Progress value={Math.min((u.distanceCm / 400) * 100, 100)}
                      className={`h-1 ${u.triggered ? "bg-destructive/20 [&>div]:bg-destructive" : "bg-muted"}`} />
                  </div>
                ))}
              </div>
              <div className="space-y-2 mt-2">
                <h4 className="text-xs text-muted-foreground uppercase border-b border-border/50 pb-1">Infrared (IR)</h4>
                <div className="grid grid-cols-2 gap-2">
                  {sensorData?.infrared.map((ir) => (
                    <div key={ir.id} className={`p-2 border rounded flex flex-col items-center justify-center text-center ${ir.detected ? "border-destructive bg-destructive/10 text-destructive" : "border-border text-muted-foreground"}`}>
                      <span className="text-[10px] uppercase font-bold">{ir.label}</span>
                      <span className="text-xs">{ir.detected ? "OBSTACLE" : "CLEAR"}</span>
                      <span className="text-[10px] font-mono opacity-60">{ir.rawValue}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
