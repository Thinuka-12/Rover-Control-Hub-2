import { useState, useEffect, useRef, useCallback } from "react";
import { X, Scan, ZoomIn, Trash2, Download, AlertCircle, MapPin } from "lucide-react";

const BASE_LAT = 37.77491;
const BASE_LNG = -122.41942;
const M_PER_DEG_LAT = 111_000;
const M_PER_DEG_LNG = 111_000 * Math.cos((BASE_LAT * Math.PI) / 180);

function posToGps(x: number, y: number) {
  return {
    lat: BASE_LAT + y / M_PER_DEG_LAT,
    lng: BASE_LNG + x / M_PER_DEG_LNG,
  };
}

interface Detection {
  id: string;
  type: string;
  confidence: number;
  x: number;
  y: number;
  w: number;
  h: number;
  timestamp: number;
  cameraSource: string;
  roverX: number;
  roverY: number;
  lat: number;
  lng: number;
}

export interface ArtifactMarker {
  id: string;
  x: number;
  y: number;
  lat: number;
  lng: number;
  type: string;
  timestamp: number;
}

interface Props {
  onClose: () => void;
  cameraUrl: string;
  currentPos: { x: number; y: number; headingDeg: number };
  onArtifactDetected?: (marker: ArtifactMarker) => void;
}

const ARTIFACT_TYPES = [
  { label: "Rock Formation", color: "#aaaaaa", emoji: "🪨" },
  { label: "Equipment",      color: "#ffb000", emoji: "🔧" },
  { label: "Debris",         color: "#ff4444", emoji: "⚠️" },
  { label: "Bio Sample",     color: "#00e676", emoji: "🌿" },
  { label: "Anomaly",        color: "#00f5ff", emoji: "🔮" },
];

function genId() { return `det-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`; }

function randomDet(pos: { x: number; y: number }, cameraSource: string): Detection {
  const t = ARTIFACT_TYPES[Math.floor(Math.random() * ARTIFACT_TYPES.length)];
  const w = 60 + Math.random() * 120;
  const h = 40 + Math.random() * 80;
  // Jitter rover position slightly to simulate detection offset from rover
  const jx = pos.x + (Math.random() - 0.5) * 3;
  const jy = pos.y + (Math.random() - 0.5) * 3;
  const gps = posToGps(jx, jy);
  return {
    id: genId(),
    type: t.label,
    confidence: 55 + Math.random() * 44,
    x: 20 + Math.random() * (320 - w - 20),
    y: 15 + Math.random() * (180 - h - 15),
    w, h,
    timestamp: Date.now(),
    cameraSource: cameraSource || "Camera (unknown)",
    roverX: pos.x,
    roverY: pos.y,
    lat: gps.lat,
    lng: gps.lng,
  };
}

export function ArtifactDetection({ onClose, cameraUrl, currentPos, onArtifactDetected }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [history, setHistory] = useState<Detection[]>([]);
  const [scanning, setScanning] = useState(true);
  const [flash, setFlash] = useState(false);
  const animRef = useRef<number>(0);
  const scanLineY = useRef(0);

  // Derive a label for the camera source
  const cameraLabel = cameraUrl
    ? cameraUrl.includes("192.168")
      ? `WiFi — ${cameraUrl.split("/")[2] ?? "camera"}`
      : cameraUrl.length > 0
        ? "Camera (configured)"
        : "Unknown"
    : "No Camera";

  const typeInfo = useCallback((type: string) => ARTIFACT_TYPES.find((t) => t.label === type) ?? ARTIFACT_TYPES[0], []);

  // Simulate new detections
  useEffect(() => {
    if (!scanning) return;
    const spawnDet = () => {
      const newDet = randomDet(currentPos, cameraLabel);
      setDetections((prev) => {
        const filtered = prev.filter((d) => Date.now() - d.timestamp < 6000);
        return [...filtered.slice(-5), newDet];
      });
      setHistory((prev) => [newDet, ...prev.slice(0, 29)]);
      setFlash(true);
      setTimeout(() => setFlash(false), 800);
      // Notify parent so map can show a marker
      onArtifactDetected?.({
        id: newDet.id,
        x: newDet.roverX,
        y: newDet.roverY,
        lat: newDet.lat,
        lng: newDet.lng,
        type: newDet.type,
        timestamp: newDet.timestamp,
      });
    };
    const delay = 5000 + Math.random() * 10000;
    const t = setTimeout(spawnDet, delay);
    return () => clearTimeout(t);
  // Re-schedule whenever a detection fires or position changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detections, scanning, currentPos.x, currentPos.y]);

  // Canvas draw — scanline + bounding boxes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      if (scanning) {
        scanLineY.current = (scanLineY.current + 1.5) % H;
        const grad = ctx.createLinearGradient(0, scanLineY.current - 20, 0, scanLineY.current + 20);
        grad.addColorStop(0, "rgba(0,245,255,0)");
        grad.addColorStop(0.5, "rgba(0,245,255,0.12)");
        grad.addColorStop(1, "rgba(0,245,255,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, scanLineY.current - 20, W, 40);
      }

      const now = Date.now();
      const active = detections.filter((d) => now - d.timestamp < 6000);
      for (const d of active) {
        const age = (now - d.timestamp) / 6000;
        const alpha = Math.max(0, 1 - age);
        const info = typeInfo(d.type);
        const col = info.color;
        const scaleX = W / 320, scaleY = H / 180;
        const rx = d.x * scaleX, ry = d.y * scaleY, rw = d.w * scaleX, rh = d.h * scaleY;

        ctx.shadowColor = col; ctx.shadowBlur = 10;
        ctx.strokeStyle = `${col}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`;
        ctx.lineWidth = 1.5; ctx.setLineDash([]);
        ctx.strokeRect(rx, ry, rw, rh);

        const cs = 8; ctx.lineWidth = 2.5; ctx.strokeStyle = col;
        [[rx, ry], [rx + rw, ry], [rx, ry + rh], [rx + rw, ry + rh]].forEach(([x, y], idx) => {
          const sx = idx % 2 === 0 ? 1 : -1, sy = idx < 2 ? 1 : -1;
          ctx.beginPath();
          ctx.moveTo(x, y + sy * cs); ctx.lineTo(x, y); ctx.lineTo(x + sx * cs, y);
          ctx.stroke();
        });
        ctx.shadowBlur = 0;

        const label = `${d.type.toUpperCase()}  ${Math.round(d.confidence)}%`;
        ctx.font = "bold 9px monospace";
        const lw = ctx.measureText(label).width;
        ctx.fillStyle = "rgba(0,0,0,0.75)";
        ctx.fillRect(rx - 1, ry - 16, lw + 6, 14);
        ctx.fillStyle = `${col}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`;
        ctx.fillText(label, rx + 2, ry - 5);
      }

      animRef.current = requestAnimationFrame(draw);
    };
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [detections, scanning, typeInfo]);

  const exportHistory = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      roverPosition: currentPos,
      totalDetections: history.length,
      detections: history.map((d) => ({
        id: d.id,
        type: d.type,
        confidence: Math.round(d.confidence),
        time: new Date(d.timestamp).toISOString(),
        cameraSource: d.cameraSource,
        roverPosition: { x: d.roverX, y: d.roverY },
        gpsCoordinates: { lat: d.lat, lng: d.lng },
        boundingBox: { x: d.x, y: d.y, w: d.w, h: d.h },
      })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `artifact-report-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-end bg-black/60 backdrop-blur-sm font-mono"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="h-full w-[400px] bg-[#060a0d] border-l border-cyan-500/20 flex flex-col overflow-hidden shadow-2xl"
        style={{ boxShadow: "0 0 40px rgba(0,245,255,0.08) inset" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-cyan-500/20 bg-black/40 shrink-0">
          <div className="flex items-center gap-2">
            <Scan className="w-4 h-4 text-cyan-400" />
            <span className="font-bold text-[12px] tracking-widest text-cyan-400">AI ARTIFACT DETECTION</span>
            {flash && <span className="text-[10px] text-cyan-300 animate-pulse">◆ NEW</span>}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setScanning((s) => !s)}
              className={`px-2 py-0.5 border rounded text-[10px] font-bold transition-colors ${scanning
                ? "border-cyan-500/50 text-cyan-400 bg-cyan-500/10" : "border-border text-muted-foreground hover:border-cyan-500/40"}`}
            >
              {scanning ? "■ STOP" : "▶ SCAN"}
            </button>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
          </div>
        </div>

        {/* Camera source badge */}
        <div className="px-3 py-1.5 border-b border-border bg-black/30 shrink-0 flex items-center gap-2 text-[9px] font-mono">
          <span className="text-muted-foreground/60">SOURCE:</span>
          <span className={`font-bold ${cameraUrl ? "text-cyan-400" : "text-muted-foreground/40"}`}>{cameraLabel}</span>
          <span className="ml-auto text-muted-foreground/30">
            Rover X:{currentPos.x.toFixed(1)} Y:{currentPos.y.toFixed(1)} HDG:{Math.round(currentPos.headingDeg)}°
          </span>
        </div>

        {/* Camera view with overlay */}
        <div className="relative shrink-0 bg-black" style={{ aspectRatio: "16/9" }}>
          {cameraUrl ? (
            <img src={cameraUrl} alt="Camera feed" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-black">
              <div className="grid grid-cols-2 gap-3 opacity-10">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="w-12 h-8 bg-gray-700 rounded" />
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground/40 font-mono mt-2">CAMERA FEED OFFLINE</p>
              <p className="text-[9px] text-muted-foreground/20">Configure camera on Cameras page</p>
            </div>
          )}
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" width={320} height={180} />
          <div className="absolute top-1.5 left-1.5 flex gap-1 pointer-events-none">
            <span className="px-1.5 py-0.5 bg-black/70 border border-cyan-500/40 text-cyan-400 text-[9px] font-bold">AI SCAN</span>
            {scanning && <span className="px-1.5 py-0.5 bg-cyan-900/40 border border-cyan-500/40 text-cyan-300 text-[9px] animate-pulse">ACTIVE</span>}
          </div>
          <div className="absolute top-1.5 right-1.5 text-[9px] font-mono text-cyan-400/60 pointer-events-none">
            {detections.filter((d) => Date.now() - d.timestamp < 6000).length} LIVE
          </div>
          {scanning && (
            <div className="absolute inset-0 pointer-events-none border border-cyan-500/20" style={{ boxShadow: "0 0 15px rgba(0,245,255,0.15) inset" }} />
          )}
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-3 px-3 py-2 border-b border-border bg-black/20 text-[10px] font-mono shrink-0">
          <span className="text-muted-foreground">TOTAL <span className="text-cyan-400">{history.length}</span></span>
          {ARTIFACT_TYPES.map((t) => {
            const count = history.filter((d) => d.type === t.label).length;
            if (count === 0) return null;
            return <span key={t.label} style={{ color: t.color }}>{t.emoji} {count}</span>;
          })}
          <button onClick={exportHistory} disabled={history.length === 0}
            className="ml-auto flex items-center gap-1 text-muted-foreground hover:text-cyan-400 disabled:opacity-30 transition-colors">
            <Download className="w-3 h-3" /> EXPORT
          </button>
          <button onClick={() => { setDetections([]); setHistory([]); }}
            className="flex items-center gap-1 text-muted-foreground hover:text-red-400 transition-colors">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>

        {/* Detection history */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Detection History</div>

          {history.length === 0 ? (
            <div className="py-8 text-center space-y-2">
              <ZoomIn className="w-8 h-8 mx-auto text-muted-foreground/20" />
              <p className="text-[10px] text-muted-foreground/40">No detections yet</p>
              <p className="text-[9px] text-muted-foreground/20">AI scanning will detect artifacts automatically</p>
            </div>
          ) : (
            history.map((d, i) => {
              const info = typeInfo(d.type);
              const fresh = Date.now() - d.timestamp < 6000;
              return (
                <div key={d.id}
                  className={`px-2 py-1.5 rounded border transition-all ${fresh ? "border-[color:var(--c)]/50 bg-[color:var(--c)]/8" : "border-border bg-white/2"}`}
                  style={{ "--c": info.color } as React.CSSProperties}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-base shrink-0">{info.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold truncate" style={{ color: info.color }}>{d.type}</span>
                        {i === 0 && fresh && <span className="text-[8px] text-cyan-300 animate-pulse shrink-0">NEW</span>}
                      </div>
                      <div className="text-[9px] text-muted-foreground font-mono">
                        CONF {Math.round(d.confidence)}%  ·  {new Date(d.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                    <div className="text-[9px] text-right font-mono shrink-0">
                      <div style={{ color: info.color }}>{Math.round(d.confidence)}%</div>
                      <div className="text-muted-foreground/40">#{history.length - i}</div>
                    </div>
                  </div>
                  {/* GPS coordinates row */}
                  <div className="flex items-center gap-1.5 mt-1 text-[8px] font-mono text-muted-foreground/50">
                    <MapPin className="w-2 h-2 shrink-0" style={{ color: info.color + "80" }} />
                    <span>{d.lat.toFixed(6)}, {d.lng.toFixed(6)}</span>
                    <span className="text-muted-foreground/30">·</span>
                    <span className="truncate" title={d.cameraSource}>{d.cameraSource}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer status */}
        <div className="px-3 py-2 border-t border-border bg-black/30 shrink-0 flex items-center gap-2 text-[9px] font-mono text-muted-foreground">
          <AlertCircle className="w-3 h-3 text-cyan-500/50" />
          Simulated AI · markers pushed to GPS panel
          <span className="ml-auto text-muted-foreground/40">X:{currentPos.x.toFixed(1)} Y:{currentPos.y.toFixed(1)}</span>
        </div>
      </div>
    </div>
  );
}
