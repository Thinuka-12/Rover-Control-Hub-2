import { useState, useEffect, useRef } from "react";
import { X, Crosshair, Compass, Battery, Radio, Eye } from "lucide-react";
import type { WsTelemetry } from "@/hooks/use-rover-ws";

interface Props {
  onClose: () => void;
  cameraUrl: string;
  telemetry: WsTelemetry | null;
  /** Called when head orientation crosses a threshold and command mode is active. */
  onPanTiltCommand?: (pan: number, tilt: number) => void;
}

interface DeviceOrientationEvt extends Event {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
}

/** Map orientation angles to a discrete command label and direction. */
function orientationToCommand(gamma: number, beta: number): {
  label: string; pan: number; tilt: number; active: boolean;
} {
  const pan = Math.max(-90, Math.min(90, gamma));       // left(-) / right(+) roll
  const tilt = Math.max(-45, Math.min(45, beta - 30)); // forward(-) / back(+) pitch (offset by 30° for natural hold)
  const active = Math.abs(pan) > 10 || Math.abs(tilt) > 8;

  let label = "HOLD";
  if (Math.abs(pan) >= Math.abs(tilt) * 1.5) {
    label = pan > 15 ? "PAN RIGHT" : pan < -15 ? "PAN LEFT" : "HOLD";
  } else {
    label = tilt < -10 ? "TILT DOWN" : tilt > 10 ? "TILT UP" : "HOLD";
  }

  return { label, pan: Math.round(pan), tilt: Math.round(tilt), active };
}

export function VrMode({ onClose, cameraUrl, telemetry, onPanTiltCommand }: Props) {
  const [orientation, setOrientation] = useState({ alpha: 0, beta: 0, gamma: 0 });
  const [hasOri, setHasOri] = useState(false);
  const [permError, setPermError] = useState("");
  const [iosPermPending, setIosPermPending] = useState(false);
  const [commandMode, setCommandMode] = useState(false);
  const scanLineRef = useRef<HTMLDivElement>(null);
  const lastCmdRef = useRef<{ pan: number; tilt: number; ts: number }>({ pan: 0, tilt: 0, ts: 0 });

  // DeviceOrientation with iOS 13+ permission
  const requestOrientation = () => {
    const handler = (e: Event) => {
      const ev = e as DeviceOrientationEvt;
      setOrientation({ alpha: ev.alpha ?? 0, beta: ev.beta ?? 0, gamma: ev.gamma ?? 0 });
      setHasOri(true);
    };

    if (typeof DeviceOrientationEvent === "undefined") {
      setPermError("DeviceOrientation not supported on this browser/device");
      return;
    }

    const DevOri = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
    if (typeof DevOri.requestPermission === "function") {
      // iOS 13+: must call from user gesture
      setIosPermPending(true);
      DevOri.requestPermission()
        .then((state: string) => {
          setIosPermPending(false);
          if (state === "granted") {
            window.addEventListener("deviceorientation", handler);
          } else {
            setPermError("Orientation permission denied");
          }
        })
        .catch(() => { setIosPermPending(false); setPermError("Orientation not available on this device"); });
    } else {
      window.addEventListener("deviceorientation", handler);
    }

    return () => window.removeEventListener("deviceorientation", handler);
  };

  useEffect(() => {
    const cleanup = requestOrientation();
    return cleanup;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scan line animation
  useEffect(() => {
    const el = scanLineRef.current;
    if (!el) return;
    let y = 0; let raf: number;
    const tick = () => { y = (y + 0.6) % 100; el.style.top = `${y}%`; raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Emit pan/tilt commands when command mode active
  useEffect(() => {
    if (!hasOri || !commandMode || !onPanTiltCommand) return;
    const cmd = orientationToCommand(orientation.gamma, orientation.beta);
    const now = Date.now();
    // Debounce: only emit when active and at least 250ms since last
    if (cmd.active && now - lastCmdRef.current.ts > 250) {
      lastCmdRef.current = { pan: cmd.pan, tilt: cmd.tilt, ts: now };
      onPanTiltCommand(cmd.pan, cmd.tilt);
    }
  }, [orientation, hasOri, commandMode, onPanTiltCommand]);

  const battery = telemetry?.rover.batteryLevel ?? 0;
  const speed = telemetry?.rover.speed ?? 0;
  const heading = telemetry?.rover.direction ?? "IDLE";
  const connected = telemetry?.rover.connected ?? false;

  const tiltDeg = hasOri ? Math.max(-8, Math.min(8, orientation.gamma * 0.15)) : 0;

  const cmd = hasOri ? orientationToCommand(orientation.gamma, orientation.beta) : null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col font-mono overflow-hidden">

      {/* Camera — full screen */}
      <div className="absolute inset-0" style={{ transform: `rotate(${tiltDeg}deg) scale(1.05)`, transformOrigin: "center", transition: "transform 0.1s linear" }}>
        {cameraUrl ? (
          <img src={cameraUrl} alt="VR camera" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-[#050808] flex items-center justify-center">
            <div className="text-center space-y-3">
              <Eye className="w-16 h-16 mx-auto text-cyan-900/50" />
              <p className="text-cyan-900 font-mono text-sm tracking-widest">NO CAMERA SIGNAL</p>
              <p className="text-[10px] text-cyan-900/40">Configure feed on Cameras page</p>
            </div>
          </div>
        )}
      </div>

      {/* Overlays */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div ref={scanLineRef} className="absolute left-0 right-0 h-px pointer-events-none"
          style={{ background: "linear-gradient(90deg, transparent, rgba(0,245,255,0.18), transparent)" }} />
        <div className="absolute inset-0" style={{ background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.04) 2px, rgba(0,0,0,0.04) 4px)" }} />
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.7) 100%)" }} />
      </div>

      {/* Top-left: status */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 pointer-events-none">
        <div className="flex items-center gap-2 px-2 py-1 bg-black/50 border border-cyan-500/20 backdrop-blur-sm">
          <Radio className="w-3 h-3" style={{ color: connected ? "#00e676" : "#ff4444" }} />
          <span className="text-[10px]" style={{ color: connected ? "#00e676" : "#ff4444" }}>
            {connected ? "ROVER LINK ACTIVE" : "LINK LOST"}
          </span>
        </div>
        <div className="flex items-center gap-2 px-2 py-1 bg-black/50 border border-cyan-500/20 backdrop-blur-sm">
          <Battery className="w-3 h-3 text-cyan-400" />
          <div className="flex items-center gap-1">
            <div className="w-20 h-1.5 bg-black/60 border border-cyan-500/20 rounded-sm overflow-hidden">
              <div className="h-full rounded-sm transition-all" style={{ width: `${battery}%`, background: battery > 30 ? "#00f5ff" : battery > 15 ? "#ffb000" : "#ff4444" }} />
            </div>
            <span className="text-[10px] text-cyan-400 font-bold">{battery}%</span>
          </div>
        </div>
        {!hasOri && (
          <div className="px-2 py-1 bg-black/50 border border-orange-500/20 backdrop-blur-sm text-[9px] text-orange-400/70">
            {permError
              ? permError
              : iosPermPending
                ? "Requesting permission…"
                : typeof (DeviceOrientationEvent as unknown as { requestPermission?: unknown }).requestPermission === "function"
                  ? "Tap ENABLE ORIENT to activate"
                  : "Move device to activate head-tracking"
            }
          </div>
        )}
      </div>

      {/* Top-right: controls */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-3">
        <div className="px-3 py-1 bg-black/60 border border-cyan-500/30 backdrop-blur-sm">
          <span className="text-[10px] font-bold text-cyan-400 tracking-widest">VR MODE</span>
        </div>
        {/* iOS permission button */}
        {!hasOri && typeof (DeviceOrientationEvent as unknown as { requestPermission?: unknown }).requestPermission === "function" && !iosPermPending && !permError && (
          <button onClick={requestOrientation}
            className="px-2 py-1 bg-black/70 border border-cyan-500/50 text-cyan-400 text-[10px] rounded hover:bg-cyan-500/10 backdrop-blur-sm pointer-events-auto">
            ENABLE ORIENT
          </button>
        )}
        {/* Command mode toggle */}
        {hasOri && (
          <button
            onClick={() => setCommandMode((v) => !v)}
            className={`px-2 py-1 backdrop-blur-sm text-[10px] rounded border transition-colors pointer-events-auto ${
              commandMode
                ? "bg-cyan-500/20 border-cyan-500/60 text-cyan-400"
                : "bg-black/70 border-border text-muted-foreground hover:text-cyan-400 hover:border-cyan-500/30"
            }`}
          >
            CMD {commandMode ? "ON" : "OFF"}
          </button>
        )}
        <button onClick={onClose}
          className="p-1.5 bg-black/70 border border-border rounded hover:border-cyan-500/50 text-muted-foreground hover:text-foreground transition-colors backdrop-blur-sm pointer-events-auto">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Bottom-left: orientation + command output */}
      <div className="absolute bottom-4 left-4 z-10 pointer-events-none space-y-2">
        <div className="px-3 py-2 bg-black/60 border border-cyan-500/15 backdrop-blur-sm space-y-1">
          <div className="flex items-center gap-1.5 mb-1">
            <Compass className="w-3 h-3 text-cyan-400/60" />
            <span className="text-[9px] text-cyan-400/60 tracking-widest uppercase">Head Orientation</span>
          </div>
          {hasOri ? (
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { label: "YAW",   val: orientation.alpha },
                { label: "PITCH", val: orientation.beta  },
                { label: "ROLL",  val: orientation.gamma },
              ].map(({ label, val }) => (
                <div key={label}>
                  <div className="text-[8px] text-cyan-400/40">{label}</div>
                  <div className="text-[11px] font-bold text-cyan-400">{Math.round(val ?? 0)}°</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[9px] text-muted-foreground/40">
              {permError || "Awaiting device orientation…"}
            </div>
          )}
        </div>

        {/* Pan/Tilt command output panel */}
        {hasOri && cmd && (
          <div className={`px-3 py-2 bg-black/70 border backdrop-blur-sm space-y-1 transition-colors ${commandMode && cmd.active ? "border-cyan-500/60" : "border-cyan-500/15"}`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[8px] text-cyan-400/40 tracking-widest uppercase">Camera Command Output</span>
              {commandMode && <span className="text-[8px] text-cyan-400 animate-pulse">● TX</span>}
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="text-center">
                <div className="text-[8px] text-cyan-400/40">PAN</div>
                <div className={`text-[13px] font-bold tabular-nums ${Math.abs(cmd.pan) > 15 ? "text-cyan-400" : "text-cyan-400/40"}`}>{cmd.pan > 0 ? "+" : ""}{cmd.pan}°</div>
              </div>
              <div className="text-center">
                <div className={`text-[11px] font-bold tracking-widest px-2 py-0.5 border rounded ${cmd.active && commandMode ? "text-cyan-400 border-cyan-500/60 bg-cyan-500/10" : "text-muted-foreground/40 border-border"}`}>
                  {commandMode ? cmd.label : "CMD OFF"}
                </div>
              </div>
              <div className="text-center">
                <div className="text-[8px] text-cyan-400/40">TILT</div>
                <div className={`text-[13px] font-bold tabular-nums ${Math.abs(cmd.tilt) > 8 ? "text-cyan-400" : "text-cyan-400/40"}`}>{cmd.tilt > 0 ? "+" : ""}{cmd.tilt}°</div>
              </div>
            </div>
            {commandMode && (
              <div className="text-[8px] text-muted-foreground/30 text-center">
                {onPanTiltCommand ? "Sending to controller" : "Display only — no camera PTZ connected"}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom-center: speed + heading */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
        <div className="px-4 py-2 bg-black/60 border border-cyan-500/15 backdrop-blur-sm text-center space-y-0.5">
          <div className="text-[20px] font-bold text-cyan-400" style={{ fontVariantNumeric: "tabular-nums", textShadow: "0 0 20px rgba(0,245,255,0.4)" }}>
            {speed.toFixed(1)} <span className="text-[11px] text-cyan-400/60">m/s</span>
          </div>
          <div className="text-[9px] text-cyan-400/60 tracking-widest">{heading.toUpperCase()}</div>
        </div>
      </div>

      {/* Center crosshair */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
        <div className="relative">
          <Crosshair className={`w-16 h-16 stroke-1 transition-colors ${cmd?.active && commandMode ? "text-cyan-400/40" : "text-cyan-400/20"}`} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 bg-cyan-400/50 rounded-full" />
          <div className="absolute -top-3 -left-3 w-4 h-4 border-t border-l border-cyan-400/30" />
          <div className="absolute -top-3 -right-3 w-4 h-4 border-t border-r border-cyan-400/30" />
          <div className="absolute -bottom-3 -left-3 w-4 h-4 border-b border-l border-cyan-400/30" />
          <div className="absolute -bottom-3 -right-3 w-4 h-4 border-b border-r border-cyan-400/30" />
        </div>
      </div>

      <div className="absolute inset-0 pointer-events-none border border-cyan-500/10" style={{ boxShadow: "0 0 60px rgba(0,245,255,0.05) inset" }} />
    </div>
  );
}
