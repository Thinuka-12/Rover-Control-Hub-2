import { useEffect, useState } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useLocalSettings } from "@/hooks/use-local-settings";
import { useRoverWs } from "@/hooks/use-rover-ws";
import {
  ArmDirection,
  ArmJointConfig,
  ArmJointName,
  useArmController,
} from "@/hooks/use-arm-controller";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Camera,
  CheckCircle2,
  CircleStop,
  Cpu,
  Crosshair,
  Keyboard,
  MousePointer2,
  Pause,
  Play,
  Save,
  Settings2,
  ShieldAlert,
  SlidersHorizontal,
  XCircle,
} from "lucide-react";

interface MoveButtonProps {
  testId: string;
  label: string;
  icon: React.ReactNode;
  onStart: () => void;
  onStop: () => void;
  disabled: boolean;
  danger?: boolean;
}

function MoveButton({ testId, label, icon, onStart, onStop, disabled, danger }: MoveButtonProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      disabled={disabled}
      aria-label={`${label} hold to move`}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        onStart();
      }}
      onPointerUp={(event) => {
        event.preventDefault();
        onStop();
      }}
      onPointerCancel={onStop}
      onPointerLeave={onStop}
      onContextMenu={(event) => event.preventDefault()}
      className={`min-h-14 flex-1 flex flex-col items-center justify-center gap-1 rounded border font-mono text-[10px] font-bold tracking-widest transition-colors select-none touch-none ${
        danger
          ? "border-red-500/50 text-red-400 hover:bg-red-500/10 active:bg-red-500/20"
          : "border-primary/40 text-primary hover:bg-primary/10 active:bg-primary/20"
      } disabled:opacity-30 disabled:pointer-events-none`}
    >
      {icon}
      {label}
    </button>
  );
}

interface JointControlProps {
  joint: ArmJointConfig;
  position: number;
  active: boolean;
  disabled: boolean;
  onStart: (direction: ArmDirection) => void;
  onStop: () => void;
}

function JointControl({ joint, position, active, disabled, onStart, onStop }: JointControlProps) {
  const horizontal = joint.name === "base" || joint.name === "wrist";
  const open = joint.name === "gripper" ? "OPEN" : horizontal ? "LEFT" : "UP";
  const close = joint.name === "gripper" ? "CLOSE" : horizontal ? "RIGHT" : "DOWN";
  const openIcon = joint.name === "gripper" ? <ArrowLeft className="w-4 h-4" /> : horizontal ? <ArrowLeft className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" />;
  const closeIcon = joint.name === "gripper" ? <ArrowRight className="w-4 h-4" /> : horizontal ? <ArrowRight className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />;

  return (
    <div className="space-y-2" data-testid={`joint-control-${joint.name}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${active ? "bg-primary animate-pulse" : "bg-muted-foreground/30"}`} />
          <span className="text-xs font-bold tracking-[0.2em] text-primary">{joint.label}</span>
        </div>
        <span data-testid={`text-commanded-position-${joint.name}`} className="font-mono text-xs text-secondary">
          Commanded Position: {position.toFixed(1)}{joint.name === "gripper" ? "%" : "°"}
        </span>
      </div>
      <div className="flex gap-2">
        <MoveButton testId={`button-${joint.name}-${open.toLowerCase()}`} label={open} icon={openIcon} onStart={() => onStart(-1)} onStop={onStop} disabled={disabled} />
        <button
          type="button"
          data-testid={`button-${joint.name}-stop`}
          onClick={onStop}
          className="min-h-14 w-16 flex flex-col items-center justify-center gap-1 rounded border border-border text-muted-foreground hover:border-red-500/50 hover:text-red-400"
        >
          <Pause className="w-4 h-4" />
          STOP
        </button>
        <MoveButton testId={`button-${joint.name}-${close.toLowerCase()}`} label={close} icon={closeIcon} onStart={() => onStart(1)} onStop={onStop} disabled={disabled} />
      </div>
      <div className="flex justify-between text-[9px] text-muted-foreground/60">
        <span>CH {joint.servoChannel}</span>
        <span>{joint.minAngle}° — {joint.maxAngle}°</span>
      </div>
    </div>
  );
}

function ConnectionState({ label, state, detail }: { label: string; state: "connected" | "disconnected" | "unknown"; detail?: string }) {
  const connected = state === "connected";
  const unknown = state === "unknown";
  return (
    <div className="flex items-center gap-2" data-testid={`status-${label.toLowerCase().replaceAll(" ", "-")}`}>
      {connected ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> : unknown ? <CircleStop className="w-3.5 h-3.5 text-yellow-400" /> : <XCircle className="w-3.5 h-3.5 text-red-400" />}
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className={`text-[10px] font-bold ${connected ? "text-green-400" : unknown ? "text-yellow-400" : "text-red-400"}`}>
        {connected ? "CONNECTED" : unknown ? "NOT VERIFIED" : "DISCONNECTED"}
      </span>
      {detail && <span className="text-[9px] text-muted-foreground/50">({detail})</span>}
    </div>
  );
}

export default function RoboticArmOperator() {
  const { settings, saveSettings } = useLocalSettings();
  const { status: wsStatus, armState, sendMessage } = useRoverWs();
  const [simulation, setSimulation] = useState(() => localStorage.getItem("rover-arm-simulation") !== "false");
  const [precision, setPrecision] = useState(false);
  const [keyboardEnabled, setKeyboardEnabled] = useState(true);
  const [showConfig, setShowConfig] = useState(false);
  const [a9Url, setA9Url] = useState(settings.a9CameraUrl);
  const [cameraState, setCameraState] = useState<"disconnected" | "connected" | "error">(settings.a9CameraUrl ? "disconnected" : "error");
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const controller = useArmController({ simulation, wsStatus, armState, sendMessage });
  const {
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
  } = controller;

  useEffect(() => {
    localStorage.setItem("rover-arm-simulation", String(simulation));
  }, [simulation]);

  useEffect(() => {
    setA9Url(settings.a9CameraUrl);
  }, [settings.a9CameraUrl]);

  const updateA9Url = (url: string) => {
    setA9Url(url);
    setCameraState(url ? "disconnected" : "error");
    saveSettings({ ...settings, a9CameraUrl: url });
  };

  useEffect(() => {
    if (!keyboardEnabled) return;
    const movementKeys: Record<string, [ArmJointName, ArmDirection]> = {
      a: ["base", -1], d: ["base", 1],
      w: ["shoulder", 1], s: ["shoulder", -1],
      i: ["elbow", 1], k: ["elbow", -1],
      j: ["wrist", -1], l: ["wrist", 1],
      o: ["gripper", -1], p: ["gripper", 1],
    };
    const pressed = new Set<string>();
    const isFormField = (target: EventTarget | null) => target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;

    const onKeyDown = (event: KeyboardEvent) => {
      if (isFormField(event.target) || event.repeat) return;
      if (event.key === "Shift") {
        setPrecision(true);
        return;
      }
      if (event.key.toLowerCase() === "x") {
        event.preventDefault();
      emergencyStop();
        return;
      }
      if (event.key === " ") {
        event.preventDefault();
        stopCurrent();
        return;
      }
      const move = movementKeys[event.key.toLowerCase()];
      if (!move || pressed.has(event.key.toLowerCase())) return;
      event.preventDefault();
      pressed.add(event.key.toLowerCase());
      beginMove(move[0], move[1], event.shiftKey);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        setPrecision(false);
        return;
      }
      if (pressed.has(event.key.toLowerCase())) {
        pressed.delete(event.key.toLowerCase());
        stopCurrent();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      stopCurrent();
    };
  }, [beginMove, emergencyStop, keyboardEnabled, stopCurrent]);

  const disabled = armStopped || (!simulation && wsStatus !== "connected");

  return (
    <Layout>
      <header className="flex flex-col gap-3 border-b border-border pb-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Crosshair className="w-5 h-5 text-primary" />
              <h1 className="text-2xl font-bold uppercase tracking-wider text-primary">ARM CONTROL</h1>
              <span className="rounded border border-primary/30 bg-primary/5 px-2 py-1 text-[9px] text-primary">DEDICATED OPERATOR</span>
            </div>
            <p className="text-muted-foreground text-xs mt-1">A9 MANIPULATOR VIEW // HOLD CONTROLS TO MOVE</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded border border-border px-3 py-2">
              <span className="text-[10px] text-muted-foreground">SIMULATION MODE</span>
              <Switch data-testid="switch-simulation-mode" checked={simulation} onCheckedChange={setSimulation} />
            </div>
            <Button data-testid="button-precision-mode" variant={precision ? "secondary" : "outline"} onClick={() => setPrecision((value) => !value)} className={precision ? "border-secondary text-secondary" : "border-border"}>
              <SlidersHorizontal className="w-3.5 h-3.5" /> {precision ? "PRECISION 25%" : "NORMAL 100%"}
            </Button>
            <Button data-testid="button-arm-config" variant="outline" onClick={() => setShowConfig((value) => !value)} className="border-border">
              <Settings2 className="w-3.5 h-3.5" /> CONFIG
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border/60 pt-3">
          <ConnectionState label="ESP32" state={simulation ? "connected" : wsStatus === "connected" ? "unknown" : "disconnected"} detail={simulation ? "SIMULATION" : "WS LINK"} />
          <ConnectionState label="Arm" state={simulation ? "connected" : "unknown"} detail={simulation ? "SIMULATED" : "HARDWARE FEEDBACK UNAVAILABLE"} />
          <ConnectionState label="A9 Camera" state={cameraState === "connected" ? "connected" : "disconnected"} detail={cameraState === "error" ? "URL NOT SET" : undefined} />
          <span className={`text-[10px] ${wsStatus === "connected" ? "text-green-400" : "text-yellow-400"}`}>CONTROL LINK: {wsStatus.toUpperCase()}</span>
        </div>
      </header>

      {warning && (
        <div data-testid="status-arm-warning" className="flex items-center gap-2 rounded border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-300">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {warning}
        </div>
      )}

      <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1.5fr)_minmax(420px,0.8fr)] gap-4 min-h-0">
        <div className="space-y-4">
          <Card className="overflow-hidden border-border bg-card">
            <CardHeader className="flex flex-row items-center justify-between border-b border-border py-3">
              <CardTitle className="flex items-center gap-2 text-xs tracking-[0.2em] text-primary">
                <Camera className="w-4 h-4" /> A9 LIVE MANIPULATOR FEED
              </CardTitle>
              <span data-testid="status-a9-feed" className={`text-[10px] ${cameraState === "connected" ? "text-green-400" : "text-red-400"}`}>
                {cameraState === "connected" ? "LIVE" : "A9 CAMERA DISCONNECTED"}
              </span>
            </CardHeader>
            <CardContent className="p-0">
              <div className="relative flex aspect-video min-h-[320px] items-center justify-center overflow-hidden bg-black">
                {a9Url ? (
                  <img
                    data-testid="img-a9-camera"
                    src={a9Url}
                    alt="A9 arm camera stream"
                    className={`h-full w-full object-contain ${cameraState === "connected" ? "opacity-100" : "opacity-40"}`}
                    onLoad={() => setCameraState("connected")}
                    onError={() => setCameraState("error")}
                  />
                ) : (
                  <div className="text-center text-muted-foreground/60">
                    <Camera className="mx-auto mb-3 h-12 w-12" />
                    <p className="text-sm font-bold tracking-widest">A9 CAMERA DISCONNECTED</p>
                    <p className="mt-1 text-[10px]">Enter the stream URL in SYSTEM CONFIG</p>
                  </div>
                )}
                <div className="absolute left-3 top-3 flex items-center gap-2 rounded border border-border bg-black/70 px-2 py-1 text-[9px] text-muted-foreground">
                  <span className={`h-2 w-2 rounded-full ${cameraState === "connected" ? "bg-green-400 animate-pulse" : "bg-red-400"}`} />
                  A9 / ARM VIEW
                </div>
                <div className="pointer-events-none absolute inset-5 border border-primary/10" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader className="flex flex-row items-center justify-between border-b border-border py-3">
              <CardTitle className="flex items-center gap-2 text-xs tracking-[0.2em] text-primary">
                <Crosshair className="w-4 h-4" /> COMMANDED JOINT POSITIONS
              </CardTitle>
              <span className="text-[9px] text-muted-foreground/60">NO SERVO FEEDBACK CONNECTED</span>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-5">
              {config.map((joint) => (
                <div key={joint.name} data-testid={`card-position-${joint.name}`} className="rounded border border-border bg-black/20 p-3">
                  <p className="text-[9px] text-muted-foreground">{joint.label}</p>
                  <p className="mt-1 text-lg font-bold text-secondary">{positions[joint.name].toFixed(0)}{joint.name === "gripper" ? "%" : "°"}</p>
                  <p className="text-[8px] text-muted-foreground/60">{joint.name === "gripper" ? (positions.gripper < 50 ? "OPEN" : "CLOSED") : "COMMAND ONLY"}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className={`border-border bg-card ${armStopped ? "border-red-500/60" : ""}`}>
            <CardHeader className="border-b border-border py-3">
              <CardTitle className="flex items-center justify-between text-xs tracking-[0.2em] text-primary">
                <span className="flex items-center gap-2"><Cpu className="w-4 h-4" /> JOINT CONTROL</span>
                <span data-testid="status-arm-state" className={armStopped ? "text-red-400" : "text-green-400"}>{armStopped ? "ARM STOPPED" : activeMove ? "MOVING" : "POSITION HOLD"}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 p-4">
              {config.map((joint) => (
                <JointControl
                  key={joint.name}
                  joint={joint}
                  position={positions[joint.name]}
                  active={activeMove?.joint === joint.name}
                  disabled={disabled}
                  onStart={(direction) => beginMove(joint.name, direction, precision)}
                  onStop={stopCurrent}
                />
              ))}
              <div className="grid grid-cols-2 gap-2 border-t border-border pt-4">
                <Button data-testid="button-emergency-stop" onClick={emergencyStop} className="min-h-12 bg-red-600 text-white hover:bg-red-500">
                  <ShieldAlert className="w-4 h-4" /> EMERGENCY STOP
                </Button>
                <Button data-testid="button-enable-arm" onClick={enableArm} disabled={!armStopped} variant="outline" className="min-h-12 border-green-500/50 text-green-400">
                  <Play className="w-4 h-4" /> ENABLE ARM
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader className="flex flex-row items-center justify-between border-b border-border py-3">
              <CardTitle className="flex items-center gap-2 text-xs tracking-[0.2em] text-primary"><Keyboard className="w-4 h-4" /> KEYBOARD CONTROL</CardTitle>
              <Switch data-testid="switch-keyboard-control" checked={keyboardEnabled} onCheckedChange={setKeyboardEnabled} />
            </CardHeader>
            <CardContent className="p-4">
              <button data-testid="button-keyboard-help" type="button" onClick={() => setShowKeyboardHelp((value) => !value)} className="flex w-full items-center justify-between text-left text-[10px] text-muted-foreground hover:text-primary">
                <span className="flex items-center gap-2"><MousePointer2 className="w-3 h-3" /> Pointer buttons support mouse and touch hold-to-move</span>
                <span>{showKeyboardHelp ? "HIDE" : "SHOW"} KEY MAP</span>
              </button>
              {showKeyboardHelp && (
                <div data-testid="panel-keyboard-help" className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 text-[10px] text-muted-foreground">
                  <span>A / D — Base</span><span>W / S — Shoulder</span>
                  <span>I / K — Elbow</span><span>J / L — Wrist</span>
                  <span>O / P — Gripper</span><span>SHIFT — Precision</span>
                  <span>SPACE — Stop</span><span>X — Emergency Stop</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {showConfig && (
        <Card className="border-primary/30 bg-card">
          <CardHeader className="flex flex-row items-center justify-between border-b border-border py-3">
            <CardTitle className="flex items-center gap-2 text-xs tracking-[0.2em] text-primary"><Settings2 className="w-4 h-4" /> ARM CONFIGURATION</CardTitle>
            <span className="text-[9px] text-muted-foreground">SAVED LOCALLY FOR THIS OPERATOR CONSOLE</span>
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
              {config.map((joint) => (
                <div key={joint.name} className="space-y-2 rounded border border-border bg-black/20 p-3">
                  <p className="text-[10px] font-bold tracking-widest text-primary">{joint.label}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-[9px] text-muted-foreground">MIN</Label><Input data-testid={`input-${joint.name}-min`} type="number" value={joint.minAngle} onChange={(event) => updateConfig(joint.name, { minAngle: Number(event.target.value) })} /></div>
                    <div><Label className="text-[9px] text-muted-foreground">MAX</Label><Input data-testid={`input-${joint.name}-max`} type="number" value={joint.maxAngle} onChange={(event) => updateConfig(joint.name, { maxAngle: Number(event.target.value) })} /></div>
                    <div><Label className="text-[9px] text-muted-foreground">NORMAL %</Label><Input data-testid={`input-${joint.name}-normal-speed`} type="number" min={1} max={100} value={joint.normalSpeed} onChange={(event) => updateConfig(joint.name, { normalSpeed: Number(event.target.value) })} /></div>
                    <div><Label className="text-[9px] text-muted-foreground">PRECISION %</Label><Input data-testid={`input-${joint.name}-precision-speed`} type="number" min={1} max={100} value={joint.precisionSpeed} onChange={(event) => updateConfig(joint.name, { precisionSpeed: Number(event.target.value) })} /></div>
                  </div>
                  <div className="flex items-center justify-between pt-1 text-[9px] text-muted-foreground">
                    <span>SERVO CH {joint.servoChannel}</span>
                    <button type="button" data-testid={`button-invert-${joint.name}`} onClick={() => updateConfig(joint.name, { inverted: !joint.inverted })} className={joint.inverted ? "text-secondary" : "text-muted-foreground"}>INVERT {joint.inverted ? "ON" : "OFF"}</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-2">
                <Label className="text-[9px] tracking-widest text-muted-foreground">A9 CAMERA URL</Label>
                <Input data-testid="input-arm-a9-url" value={a9Url} onChange={(event) => updateA9Url(event.target.value)} placeholder="http://192.168.1.210/stream" />
              </div>
              <Button data-testid="button-save-arm-config" variant="outline" onClick={() => saveSettings({ ...settings, a9CameraUrl: a9Url })} className="border-primary/40 text-primary">
                <Save className="w-3.5 h-3.5" /> SAVE A9 URL
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </Layout>
  );
}