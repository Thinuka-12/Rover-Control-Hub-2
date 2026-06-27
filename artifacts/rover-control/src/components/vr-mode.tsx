import { useState, useEffect, useRef } from "react";
import { X, Crosshair, Compass, Battery, Radio, Eye } from "lucide-react";
import type { WsTelemetry } from "@/hooks/use-rover-ws";

interface Props {
  onClose: () => void;
  cameraUrl: string;
  telemetry: WsTelemetry | null;
}

interface DeviceOrientationEvt extends Event {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
}

export function VrMode({ onClose, cameraUrl, telemetry }: Props) {
  const [orientation, setOrientation] = useState({ alpha: 0, beta: 0, gamma: 0 });
  const [hasOri, setHasOri] = useState(false);
  const [permError, setPermError] = useState("");
  const scanLineRef = useRef<HTMLDivElement>(null);

  // DeviceOrientation
  useEffect(() => {
    const handler = (e: Event) => {
      const ev = e as DeviceOrientationEvt;
      setOrientation({
        alpha: ev.alpha ?? 0,
        beta: ev.beta ?? 0,
        gamma: ev.gamma ?? 0,
      });
      setHasOri(true);
    };

    if (typeof DeviceOrientationEvent !== "undefined") {
      const DevOri = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
      if (typeof DevOri.requestPermission === "function") {
        DevOri.requestPermission()
          .then((state: string) => {
            if (state === "granted") {
              window.addEventListener("deviceorientation", handler);
            } else {
              setPermError("Permission denied — orientation disabled");
            }
          })
          .catch(() => setPermError("Orientation not available on this device"));
      } else {
        window.addEventListener("deviceorientation", handler);
      }
    } else {
      setPermError("DeviceOrientation not supported");
    }

    return () => window.removeEventListener("deviceorientation", handler);
  }, []);

  // Animate scan line
  useEffect(() => {
    const el = scanLineRef.current;
    if (!el) return;
    let y = 0;
    let raf: number;
    const tick = () => {
      y = (y + 0.6) % 100;
      el.style.top = `${y}%`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const battery = telemetry?.rover.batteryLevel ?? 0;
  const speed = telemetry?.rover.speed ?? 0;
  const heading = telemetry?.rover.direction ?? "IDLE";
  const connected = telemetry?.rover.connected ?? false;

  // Apply slight tilt transform based on gamma (left-right tilt)
  const tiltDeg = hasOri ? Math.max(-8, Math.min(8, (orientation.gamma ?? 0) * 0.15)) : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col font-mono overflow-hidden">

      {/* Camera fill — full screen */}
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

      {/* Scan-line overlay */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          ref={scanLineRef}
          className="absolute left-0 right-0 h-px pointer-events-none"
          style={{ background: "linear-gradient(90deg, transparent, rgba(0,245,255,0.18), transparent)" }}
        />
        {/* CRT lines */}
        <div className="absolute inset-0" style={{ background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.04) 2px, rgba(0,0,0,0.04) 4px)" }} />
        {/* Vignette */}
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.7) 100%)" }} />
      </div>

      {/* ── HUD elements ── */}

      {/* Top-left: status */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 pointer-events-none">
        <div className="flex items-center gap-2 px-2 py-1 bg-black/50 border border-cyan-500/20 backdrop-blur-sm" style={{ boxShadow: "0 0 10px rgba(0,245,255,0.08) inset" }}>
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
      </div>

      {/* Top-right: close + VR label */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-3">
        <div className="px-3 py-1 bg-black/60 border border-cyan-500/30 backdrop-blur-sm">
          <span className="text-[10px] font-bold text-cyan-400 tracking-widest">VR MODE</span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 bg-black/70 border border-border rounded hover:border-cyan-500/50 text-muted-foreground hover:text-foreground transition-colors backdrop-blur-sm"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Bottom-left: orientation data */}
      <div className="absolute bottom-4 left-4 z-10 pointer-events-none">
        <div className="px-3 py-2 bg-black/60 border border-cyan-500/15 backdrop-blur-sm space-y-1">
          <div className="flex items-center gap-1.5 mb-1">
            <Compass className="w-3 h-3 text-cyan-400/60" />
            <span className="text-[9px] text-cyan-400/60 tracking-widest uppercase">Orientation</span>
          </div>
          {hasOri ? (
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { label: "YAW", val: orientation.alpha },
                { label: "PITCH", val: orientation.beta },
                { label: "ROLL", val: orientation.gamma },
              ].map(({ label, val }) => (
                <div key={label}>
                  <div className="text-[8px] text-cyan-400/40">{label}</div>
                  <div className="text-[11px] font-bold text-cyan-400">{Math.round(val ?? 0)}°</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[9px] text-muted-foreground/40">
              {permError || "Move device to activate"}
            </div>
          )}
        </div>
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

      {/* Center: crosshair */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
        <div className="relative">
          <Crosshair className="w-16 h-16 text-cyan-400/20 stroke-1" />
          {/* Center dot */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 bg-cyan-400/50 rounded-full" />
          {/* Corner brackets */}
          <div className="absolute -top-3 -left-3 w-4 h-4 border-t border-l border-cyan-400/30" />
          <div className="absolute -top-3 -right-3 w-4 h-4 border-t border-r border-cyan-400/30" />
          <div className="absolute -bottom-3 -left-3 w-4 h-4 border-b border-l border-cyan-400/30" />
          <div className="absolute -bottom-3 -right-3 w-4 h-4 border-b border-r border-cyan-400/30" />
        </div>
      </div>

      {/* Border glow */}
      <div className="absolute inset-0 pointer-events-none border border-cyan-500/10" style={{ boxShadow: "0 0 60px rgba(0,245,255,0.05) inset" }} />
    </div>
  );
}
