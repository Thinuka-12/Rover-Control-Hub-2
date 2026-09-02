import { useState, useRef, useEffect } from "react";
import { Layout } from "@/components/layout";
import { useCameraFeeds, type CameraFeed, type CameraSource } from "@/hooks/use-camera-feeds";
import { useOperatorRole } from "@/hooks/use-operator-role";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Camera, Wifi, Bluetooth, Plus, Trash2, Maximize2, Minimize2,
  RefreshCw, Settings2, X, ChevronDown, ChevronUp, Eye, EyeOff,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight, ZoomIn, ZoomOut, Home,
} from "lucide-react";

type GridLayout = 1 | 2 | 4 | 6;

const GRID_CONFIGS: { cols: number; rows: number }[] = [
  { cols: 1, rows: 1 },
  { cols: 2, rows: 1 },
  { cols: 2, rows: 2 },
  { cols: 3, rows: 2 },
];

function statusColor(s: CameraFeed["status"]) {
  if (s === "connected") return "text-green-400 border-green-500";
  if (s === "connecting") return "text-yellow-400 border-yellow-500";
  if (s === "error" || s === "offline") return "text-red-400 border-red-500";
  return "text-muted-foreground border-border";
}

function statusDot(s: CameraFeed["status"]) {
  if (s === "connected") return "bg-green-500 animate-pulse";
  if (s === "connecting") return "bg-yellow-500 animate-pulse";
  if (s === "error" || s === "offline") return "bg-red-500";
  return "bg-muted-foreground/40";
}

function useRecordingTimer(active: boolean) {
  const [secs, setSecs] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (active) {
      if (!startRef.current) startRef.current = Date.now();
      const iv = setInterval(() => setSecs(Math.floor((Date.now() - (startRef.current ?? Date.now())) / 1000)), 1000);
      return () => clearInterval(iv);
    }
    startRef.current = null;
    setSecs(0);
    return undefined;
  }, [active]);

  const fmt = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  return { secs, formatted: fmt(secs) };
}

/** Simulated PTZ state per slot */
interface PtzState { pan: number; tilt: number; zoom: number; }

interface CameraSlotProps {
  feed: CameraFeed;
  onUpdate: (patch: Partial<CameraFeed>) => void;
  onRemove: () => void;
  onConnectBle: () => void;
  onStartSnapshot: (url: string) => void;
  onStopSnapshot: () => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  compact?: boolean;
  readOnly?: boolean;
}

function CameraSlot({ feed, onUpdate, onRemove, onConnectBle, onStartSnapshot, onStopSnapshot, fullscreen, onToggleFullscreen, compact, readOnly = false }: CameraSlotProps) {
  const [showConfig, setShowConfig] = useState(feed.url === "");
  const [showPtz, setShowPtz] = useState(false);
  const [localUrl, setLocalUrl] = useState(feed.url);
  const [localLabel, setLocalLabel] = useState(feed.label);
  const [snapshotInterval, setSnapshotInterval] = useState(500);
  const [mjpegError, setMjpegError] = useState(false);
  const [recording, setRecording] = useState(false);
  const [ptz, setPtz] = useState<PtzState>({ pan: 0, tilt: 0, zoom: 1 });
  const [ptzFeedback, setPtzFeedback] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const { formatted: recTime } = useRecordingTimer(recording);

  // Simulated latency / health metrics
  const [latencyMs] = useState(() => Math.floor(20 + Math.random() * 60));
  const [fpsEst] = useState(() => Math.floor(20 + Math.random() * 15));
  const isLive = feed.source === "wifi" && feed.url && feed.status === "connected";
  const isSnapshot = feed.source === "snapshot" && feed.status === "connected";
  const isActive = isLive || isSnapshot;

  useEffect(() => { setMjpegError(false); }, [feed.url]);

  const applyWifi = () => {
    onUpdate({ url: localUrl, label: localLabel, source: "wifi", status: "connecting", errorMsg: undefined });
    setShowConfig(false);
  };
  const applySnapshot = () => {
    onUpdate({ url: localUrl, label: localLabel, source: "snapshot" });
    onStartSnapshot(localUrl);
    setShowConfig(false);
  };
  const stopSnap = () => { onStopSnapshot(); setShowConfig(true); };

  const ptzCmd = (action: string, delta: Partial<PtzState>) => {
    setPtz((prev) => ({
      pan:  Math.max(-90, Math.min(90, prev.pan + (delta.pan ?? 0))),
      tilt: Math.max(-45, Math.min(45, prev.tilt + (delta.tilt ?? 0))),
      zoom: Math.max(1, Math.min(10, prev.zoom + (delta.zoom ?? 0))),
    }));
    setPtzFeedback(action);
    setTimeout(() => setPtzFeedback(null), 700);
  };

  const resetPtz = () => {
    setPtz({ pan: 0, tilt: 0, zoom: 1 });
    setPtzFeedback("HOME");
    setTimeout(() => setPtzFeedback(null), 700);
  };

  return (
    <div className={`relative flex flex-col bg-[#060606] border rounded overflow-hidden group transition-all duration-200 ${fullscreen ? "border-primary/60" : "border-border"}`}>
      {/* Top bar */}
      <div className={`flex items-center justify-between px-2 py-1 border-b border-border bg-black/60 z-10 ${compact ? "h-7" : "h-8"}`}>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot(feed.status)}`} />
          <span className="font-mono text-[10px] text-foreground truncate">{feed.label}</span>
          {feed.source === "ble" && <Bluetooth className="w-2.5 h-2.5 text-blue-400 shrink-0" />}
          {(feed.source === "wifi" || feed.source === "snapshot") && <Wifi className="w-2.5 h-2.5 text-cyan-400/60 shrink-0" />}
          {/* Health badge */}
          {isActive && !compact && (
            <span className="text-[8px] font-mono text-green-400/60 border border-green-500/20 px-1 rounded">
              {latencyMs}ms · {fpsEst}fps
            </span>
          )}
          {/* Recording timer */}
          {recording && (
            <span className="flex items-center gap-0.5 text-[9px] font-mono text-red-400 animate-pulse shrink-0">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />{recTime}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {feed.status === "error" || feed.status === "offline" ? (
            <span className="text-[9px] text-red-400 font-mono truncate max-w-20">{feed.errorMsg?.slice(0, 20)}</span>
          ) : (
            <Badge variant="outline" className={`text-[9px] px-1 py-0 h-4 ${statusColor(feed.status)}`}>
              {feed.status.toUpperCase()}
            </Badge>
          )}
          {/* PTZ toggle */}
          {isActive && !readOnly && (
            <button onClick={() => setShowPtz((v) => !v)}
              className={`p-0.5 rounded text-[8px] font-bold border transition-colors ${showPtz ? "border-cyan-500/50 text-cyan-400 bg-cyan-500/10" : "border-border text-muted-foreground/50 hover:text-cyan-400 hover:border-cyan-500/30"}`}
              title="PTZ Controls">
              PTZ
            </button>
          )}
          {/* Recording toggle */}
          {isActive && !readOnly && (
            <button onClick={() => setRecording((r) => !r)}
              className={`p-0.5 rounded transition-colors ${recording ? "text-red-400" : "text-muted-foreground hover:text-red-400"}`}
              title={recording ? "Stop recording" : "Start recording timer"}>
              <span className={`w-2 h-2 rounded-full inline-block ${recording ? "bg-red-500 animate-pulse" : "bg-muted-foreground/30"}`} />
            </button>
          )}
          {!readOnly && (
            <button onClick={() => setShowConfig((v) => !v)} className="p-0.5 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground">
              <Settings2 className="w-3 h-3" />
            </button>
          )}
          <button onClick={onToggleFullscreen} className="p-0.5 rounded hover:bg-white/10 text-muted-foreground hover:text-primary">
            {fullscreen ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
          </button>
          {!readOnly && (
            <button onClick={onRemove} className="p-0.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* PTZ panel */}
      {showPtz && isActive && (
        <div className="border-b border-cyan-500/20 bg-black/80 p-2 z-10">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[9px] font-mono text-cyan-400/70 uppercase tracking-widest">PTZ Control</span>
            <span className="text-[8px] font-mono text-muted-foreground/40">
              P:{ptz.pan > 0 ? "+" : ""}{ptz.pan}° T:{ptz.tilt > 0 ? "+" : ""}{ptz.tilt}° Z:{ptz.zoom.toFixed(1)}×
            </span>
          </div>
          <div className="flex items-center gap-3">
            {/* D-pad */}
            <div className="grid grid-cols-3 gap-0.5 w-20">
              <div />
              <button onClick={() => ptzCmd("TILT UP", { tilt: -5 })}
                className="w-6 h-6 flex items-center justify-center border border-cyan-500/20 rounded text-cyan-400/60 hover:text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-500/50 transition-colors">
                <ArrowUp className="w-3 h-3" />
              </button>
              <div />
              <button onClick={() => ptzCmd("PAN LEFT", { pan: -5 })}
                className="w-6 h-6 flex items-center justify-center border border-cyan-500/20 rounded text-cyan-400/60 hover:text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-500/50 transition-colors">
                <ArrowLeft className="w-3 h-3" />
              </button>
              <button onClick={resetPtz}
                className="w-6 h-6 flex items-center justify-center border border-cyan-500/20 rounded text-cyan-400/40 hover:text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-500/50 transition-colors">
                <Home className="w-2.5 h-2.5" />
              </button>
              <button onClick={() => ptzCmd("PAN RIGHT", { pan: 5 })}
                className="w-6 h-6 flex items-center justify-center border border-cyan-500/20 rounded text-cyan-400/60 hover:text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-500/50 transition-colors">
                <ArrowRight className="w-3 h-3" />
              </button>
              <div />
              <button onClick={() => ptzCmd("TILT DOWN", { tilt: 5 })}
                className="w-6 h-6 flex items-center justify-center border border-cyan-500/20 rounded text-cyan-400/60 hover:text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-500/50 transition-colors">
                <ArrowDown className="w-3 h-3" />
              </button>
              <div />
            </div>

            {/* Zoom */}
            <div className="flex flex-col gap-0.5">
              <button onClick={() => ptzCmd("ZOOM IN", { zoom: 0.5 })}
                className="w-6 h-6 flex items-center justify-center border border-cyan-500/20 rounded text-cyan-400/60 hover:text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-500/50 transition-colors">
                <ZoomIn className="w-3 h-3" />
              </button>
              <button onClick={() => ptzCmd("ZOOM OUT", { zoom: -0.5 })}
                className="w-6 h-6 flex items-center justify-center border border-cyan-500/20 rounded text-cyan-400/60 hover:text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-500/50 transition-colors">
                <ZoomOut className="w-3 h-3" />
              </button>
            </div>

            {/* Feedback + step size */}
            <div className="flex-1 space-y-1">
              {ptzFeedback && (
                <div className="text-[9px] font-mono text-cyan-400 font-bold animate-pulse">{ptzFeedback}</div>
              )}
              <div className="text-[8px] text-muted-foreground/40 font-mono">Simulated PTZ — wire to camera API</div>
            </div>
          </div>

          {/* Apply zoom to image via CSS transform */}
          <style>{`
            .cam-${feed.id.replace(/[^a-z0-9]/gi, "")} img {
              transform: scale(${ptz.zoom}) translate(${-ptz.pan * 0.3}%, ${ptz.tilt * 0.3}%);
              transition: transform 0.2s ease;
            }
          `}</style>
        </div>
      )}

      {/* Config panel */}
      {showConfig && !readOnly && (
        <div className="border-b border-border bg-black/80 p-2 space-y-1.5 z-10">
          <Input value={localLabel} onChange={(e) => setLocalLabel(e.target.value)}
            placeholder="Camera label" className="font-mono text-[10px] h-6 bg-background border-border px-2" />
          <div className="flex gap-1">
            <Input value={localUrl} onChange={(e) => setLocalUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") applyWifi(); }}
              placeholder="http://192.168.x.x/stream" className="font-mono text-[10px] h-6 bg-background border-border px-2 flex-1" />
          </div>
          <div className="flex flex-wrap gap-1">
            <button onClick={applyWifi}
              className="flex items-center gap-1 px-2 py-0.5 text-[10px] border border-cyan-500/40 text-cyan-400 rounded hover:bg-cyan-500/10 font-mono">
              <Wifi className="w-2.5 h-2.5" /> MJPEG
            </button>
            <button onClick={applySnapshot}
              className="flex items-center gap-1 px-2 py-0.5 text-[10px] border border-green-500/40 text-green-400 rounded hover:bg-green-500/10 font-mono">
              <Camera className="w-2.5 h-2.5" /> SNAPSHOT {snapshotInterval}ms
            </button>
            <button onClick={onConnectBle}
              className="flex items-center gap-1 px-2 py-0.5 text-[10px] border border-blue-500/40 text-blue-400 rounded hover:bg-blue-500/10 font-mono">
              <Bluetooth className="w-2.5 h-2.5" /> BLE SCAN
            </button>
            {feed.source === "snapshot" && feed.status === "connected" && (
              <button onClick={stopSnap}
                className="flex items-center gap-1 px-2 py-0.5 text-[10px] border border-red-500/40 text-red-400 rounded hover:bg-red-500/10 font-mono">
                STOP
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-muted-foreground font-mono">SNAP INTERVAL:</span>
            {[250, 500, 1000, 2000].map((ms) => (
              <button key={ms} onClick={() => setSnapshotInterval(ms)}
                className={`text-[9px] font-mono px-1 py-0 border rounded ${snapshotInterval === ms ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>
                {ms}ms
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Video content */}
      <div className={`flex-1 relative bg-black flex items-center justify-center overflow-hidden cam-${feed.id.replace(/[^a-z0-9]/gi, "")}`} style={{ minHeight: compact ? 100 : 160 }}>
        {feed.source === "wifi" && feed.url && !showConfig ? (
          mjpegError ? (
            <div className="text-center text-xs text-muted-foreground space-y-1 p-4">
              <Camera className="w-8 h-8 mx-auto opacity-20 mb-2" />
              <p className="text-red-400 text-[10px]">Stream unavailable</p>
              <p className="text-[9px] opacity-60">{feed.url}</p>
              <button onClick={() => { setMjpegError(false); onUpdate({ status: "connecting" }); }} className="mt-1 text-[10px] text-primary border border-primary/30 px-2 py-0.5 rounded hover:bg-primary/10 flex items-center gap-1 mx-auto">
                <RefreshCw className="w-2.5 h-2.5" /> RETRY
              </button>
            </div>
          ) : (
            <img ref={imgRef} src={feed.url} alt={feed.label} className="w-full h-full object-contain"
              onLoad={() => onUpdate({ status: "connected", errorMsg: undefined })}
              onError={() => { setMjpegError(true); onUpdate({ status: "error", errorMsg: "Stream unreachable" }); }}
              style={{ maxHeight: "100%", maxWidth: "100%" }} />
          )
        ) : feed.source === "snapshot" && feed.snapshotDataUrl ? (
          <div className="relative w-full h-full">
            <img src={feed.snapshotDataUrl} alt={feed.label} className="w-full h-full object-contain" />
            {feed.snapshotTs && (
              <span className="absolute bottom-1 right-1 text-[9px] font-mono text-white/40">
                {new Date(feed.snapshotTs).toLocaleTimeString()}
              </span>
            )}
          </div>
        ) : feed.source === "ble" && feed.bleDeviceName && !feed.url ? (
          <div className="text-center p-4 space-y-2">
            <Bluetooth className="w-8 h-8 mx-auto text-blue-400 opacity-60" />
            <p className="text-[10px] text-blue-300 font-mono">{feed.bleDeviceName}</p>
            <p className="text-[9px] text-muted-foreground">BLE connected. Enter WiFi stream URL above to view feed.</p>
          </div>
        ) : (
          <div className="text-center p-4 space-y-2">
            <Camera className="w-8 h-8 mx-auto opacity-10" />
            <p className="text-[10px] text-muted-foreground/60 font-mono">NO SIGNAL</p>
            {!feed.url && !readOnly && <p className="text-[9px] text-muted-foreground/40">Click ⚙ to configure stream</p>}
          </div>
        )}

        {/* Scan-line overlay */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)" }} />

        {/* Corner brackets when live */}
        {isActive && (
          <>
            <div className="absolute top-1 left-1 w-4 h-4 border-t border-l border-primary/30" />
            <div className="absolute top-1 right-1 w-4 h-4 border-t border-r border-primary/30" />
            <div className="absolute bottom-1 left-1 w-4 h-4 border-b border-l border-primary/30" />
            <div className="absolute bottom-1 right-1 w-4 h-4 border-b border-r border-primary/30" />
          </>
        )}

        {/* Health badge overlay */}
        {isActive && (
          <div className="absolute bottom-1.5 left-1.5 flex gap-1 pointer-events-none">
            <span className="px-1 py-0.5 bg-black/70 border border-green-500/20 text-green-400/60 text-[8px] font-mono">
              {latencyMs}ms
            </span>
            <span className="px-1 py-0.5 bg-black/70 border border-cyan-500/20 text-cyan-400/60 text-[8px] font-mono">
              {fpsEst}fps
            </span>
          </div>
        )}

        {/* Recording REC badge */}
        {recording && (
          <div className="absolute top-1.5 left-1.5 flex items-center gap-1 px-1.5 py-0.5 bg-black/80 border border-red-500/50 pointer-events-none">
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
            <span className="text-[9px] font-mono text-red-400">REC {recTime}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CamerasPage() {
  const { feeds, addFeed, removeFeed, updateFeed, connectBle, startSnapshot, stopSnapshot } = useCameraFeeds();
  const { canManageCameras, operator } = useOperatorRole();
  const [gridLayout, setGridLayout] = useState<GridLayout>(feeds.length <= 1 ? 1 : feeds.length <= 2 ? 2 : feeds.length <= 4 ? 4 : 6);
  const [fullscreenId, setFullscreenId] = useState<string | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);

  const layoutConfig = GRID_CONFIGS[gridLayout === 1 ? 0 : gridLayout === 2 ? 1 : gridLayout === 4 ? 2 : 3];
  const slotCount = gridLayout;
  const slots = Array.from({ length: slotCount }, (_, i) => feeds[i] ?? null);

  const handleAddFeed = (source: CameraSource) => {
    addFeed({ source, status: "idle", label: `Camera ${feeds.length + 1}` });
    setShowAddMenu(false);
    const newCount = feeds.length + 1;
    if (newCount <= 1) setGridLayout(1);
    else if (newCount <= 2) setGridLayout(2);
    else if (newCount <= 4) setGridLayout(4);
    else setGridLayout(6);
  };

  const handleAddBle = () => {
    const id = addFeed({ source: "ble", status: "idle", label: `BLE Camera ${feeds.length + 1}` });
    setShowAddMenu(false);
    setTimeout(() => { connectBle(id); }, 100);
  };

  const fullscreenFeed = fullscreenId ? feeds.find((f) => f.id === fullscreenId) : null;

  const liveCount = feeds.filter((f) => f.status === "connected").length;
  const errCount = feeds.filter((f) => f.status === "error" || f.status === "offline").length;

  return (
    <Layout>
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-wider text-primary">CAMERAS</h1>
          <p className="text-muted-foreground text-xs">MULTI-FEED SURVEILLANCE — WIFI · BLUETOOTH · SNAPSHOT · PTZ</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 border border-border rounded p-1">
            {([1, 2, 4, 6] as GridLayout[]).map((n) => (
              <button key={n} onClick={() => setGridLayout(n)}
                className={`px-2 py-0.5 text-[10px] font-mono rounded transition-colors ${gridLayout === n ? "bg-primary/20 text-primary border border-primary/50" : "text-muted-foreground hover:text-foreground"}`}>
                {n === 1 ? "1×1" : n === 2 ? "2×1" : n === 4 ? "2×2" : "3×2"}
              </button>
            ))}
          </div>
          {canManageCameras && <div className="relative">
            <Button variant="outline" onClick={() => setShowAddMenu((v) => !v)}
              className="border-primary/50 text-primary hover:bg-primary/10 text-xs">
              <Plus className="w-3 h-3 mr-1" /> ADD CAMERA
              {showAddMenu ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
            </Button>
            {showAddMenu && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded shadow-xl min-w-44">
                <button onClick={() => handleAddFeed("wifi")}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-primary/10 text-left">
                  <Wifi className="w-3.5 h-3.5 text-cyan-400" />
                  <div>
                    <p className="font-mono text-foreground">WiFi / MJPEG</p>
                    <p className="text-[10px] text-muted-foreground">ESP32-CAM, IP camera</p>
                  </div>
                </button>
                <button onClick={() => handleAddFeed("snapshot")}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-primary/10 text-left border-t border-border">
                  <Camera className="w-3.5 h-3.5 text-green-400" />
                  <div>
                    <p className="font-mono text-foreground">Snapshot Poll</p>
                    <p className="text-[10px] text-muted-foreground">Periodic still frame fetch</p>
                  </div>
                </button>
                <button onClick={handleAddBle}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-primary/10 text-left border-t border-border">
                  <Bluetooth className="w-3.5 h-3.5 text-blue-400" />
                  <div>
                    <p className="font-mono text-foreground">Bluetooth (BLE)</p>
                    <p className="text-[10px] text-muted-foreground">Scan & pair nearby camera</p>
                  </div>
                </button>
              </div>
            )}
          </div>}
        </div>
      </header>

      {/* Fullscreen overlay */}
      {fullscreenFeed && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-black/80">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${fullscreenFeed.status === "connected" ? "bg-green-500 animate-pulse" : "bg-muted-foreground/40"}`} />
              <span className="font-mono text-sm text-foreground">{fullscreenFeed.label}</span>
              <Badge variant="outline" className={`text-[10px] ${statusColor(fullscreenFeed.status)}`}>{fullscreenFeed.status.toUpperCase()}</Badge>
            </div>
            <button onClick={() => setFullscreenId(null)} className="p-1.5 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground">
              <Minimize2 className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
            {fullscreenFeed.source === "wifi" && fullscreenFeed.url ? (
              <img src={fullscreenFeed.url} alt={fullscreenFeed.label} className="w-full h-full object-contain" />
            ) : fullscreenFeed.source === "snapshot" && fullscreenFeed.snapshotDataUrl ? (
              <img src={fullscreenFeed.snapshotDataUrl} alt={fullscreenFeed.label} className="w-full h-full object-contain" />
            ) : (
              <div className="text-center space-y-2">
                <Camera className="w-16 h-16 mx-auto opacity-10" />
                <p className="font-mono text-muted-foreground">NO SIGNAL</p>
              </div>
            )}
            <div className="absolute inset-0 pointer-events-none" style={{ background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.04) 2px, rgba(0,0,0,0.04) 4px)" }} />
          </div>
        </div>
      )}

      {/* Status bar */}
      <div className="flex items-center gap-4 text-[10px] font-mono text-muted-foreground border border-border rounded px-3 py-1.5 bg-card">
        <span className="text-foreground/60">FEEDS: <span className="text-primary">{feeds.length}</span></span>
        <span className="text-green-400">{liveCount} LIVE</span>
        {errCount > 0 && <span className="text-red-400">{errCount} ERROR</span>}
        <span className="text-blue-400">{feeds.filter((f) => f.source === "ble").length} BLE</span>
        <span className="text-cyan-400">{feeds.filter((f) => f.source === "wifi" || f.source === "snapshot").length} WIFI</span>
        <span className="ml-auto text-muted-foreground/50">GRID {gridLayout === 1 ? "1×1" : gridLayout === 2 ? "2×1" : gridLayout === 4 ? "2×2" : "3×2"} · PTZ enabled</span>
      </div>

      {/* Camera grid */}
      {feeds.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 border border-dashed border-border rounded bg-card/30 py-16">
          <Camera className="w-12 h-12 opacity-10" />
          <div className="text-center">
            <p className="text-muted-foreground font-mono text-sm">NO CAMERAS CONFIGURED</p>
            <p className="text-muted-foreground/50 text-xs mt-1">Click ADD CAMERA to connect your first feed</p>
          </div>
          {canManageCameras ? (
            <div className="flex gap-3">
              <button onClick={() => handleAddFeed("wifi")} className="flex items-center gap-2 px-4 py-2 text-xs border border-cyan-500/40 text-cyan-400 rounded hover:bg-cyan-500/10">
                <Wifi className="w-3.5 h-3.5" /> WiFi / MJPEG
              </button>
              <button onClick={handleAddBle} className="flex items-center gap-2 px-4 py-2 text-xs border border-blue-500/40 text-blue-400 rounded hover:bg-blue-500/10">
                <Bluetooth className="w-3.5 h-3.5" /> Bluetooth
              </button>
              <button onClick={() => handleAddFeed("snapshot")} className="flex items-center gap-2 px-4 py-2 text-xs border border-green-500/40 text-green-400 rounded hover:bg-green-500/10">
                <Camera className="w-3.5 h-3.5" /> Snapshot
              </button>
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground/60 font-mono">
              {operator?.role === "co-pilot" ? "AI CO-PILOT MODE — CAMERA CONFIGURATION DISABLED" : "ARM OPERATOR MODE — CAMERA CONTROLS DISABLED"}
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-2 flex-1"
          style={{ gridTemplateColumns: `repeat(${layoutConfig.cols}, 1fr)`, gridTemplateRows: `repeat(${layoutConfig.rows}, 1fr)`, minHeight: 0 }}>
          {slots.map((feed, i) =>
            feed ? (
              <CameraSlot
                key={feed.id}
                feed={feed}
                compact={gridLayout >= 4}
                onUpdate={(patch) => updateFeed(feed.id, patch)}
                onRemove={() => removeFeed(feed.id)}
                onConnectBle={() => connectBle(feed.id)}
                onStartSnapshot={(url) => startSnapshot(feed.id, url)}
                onStopSnapshot={() => stopSnapshot(feed.id)}
                fullscreen={fullscreenId === feed.id}
                onToggleFullscreen={() => setFullscreenId((id) => id === feed.id ? null : feed.id)}
                readOnly={!canManageCameras}
              />
            ) : (
              <div key={`empty-${i}`}
                className="border border-dashed border-border/40 rounded flex flex-col items-center justify-center gap-2 bg-card/20 cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors"
                onClick={() => { addFeed({ source: "wifi" }); }}>
                <Plus className="w-5 h-5 text-muted-foreground/30" />
                <span className="text-[10px] font-mono text-muted-foreground/30">ADD FEED</span>
              </div>
            )
          )}
        </div>
      )}

      {/* Connection tips */}
      <div className="border border-border rounded bg-card">
        <div className="px-3 py-2 border-b border-border flex items-center gap-2">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">QUICK CONNECT GUIDE</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-border">
          <div className="p-3 space-y-1 text-[10px] text-muted-foreground">
            <p className="flex items-center gap-1.5 font-bold text-cyan-400 mb-1.5"><Wifi className="w-3 h-3" /> WiFi / MJPEG</p>
            <p>1. Flash ESP32-CAM with <span className="font-mono text-primary">CameraWebServer</span> sketch.</p>
            <p>2. Connect ESP32 to same WiFi as this device.</p>
            <p>3. Enter <span className="font-mono text-primary">http://&lt;ESP32-IP&gt;/stream</span>.</p>
            <p>4. Use PTZ controls to simulate pan/tilt (wire to servo API).</p>
          </div>
          <div className="p-3 space-y-1 text-[10px] text-muted-foreground">
            <p className="flex items-center gap-1.5 font-bold text-blue-400 mb-1.5"><Bluetooth className="w-3 h-3" /> Bluetooth BLE</p>
            <p>1. Click <span className="font-mono text-primary">BLE SCAN</span> in any camera slot.</p>
            <p>2. Browser shows nearby BLE devices — select your camera.</p>
            <p>3. After pairing, enter the camera's WiFi stream URL to view feed.</p>
            <p className="text-muted-foreground/50">Requires Chrome/Edge.</p>
          </div>
          <div className="p-3 space-y-1 text-[10px] text-muted-foreground">
            <p className="flex items-center gap-1.5 font-bold text-green-400 mb-1.5"><Camera className="w-3 h-3" /> Snapshot Poll</p>
            <p>For cameras with <span className="font-mono text-primary">/capture</span> endpoints (ESP32-CAM, etc.).</p>
            <p>Fetches a JPEG every 250–2000ms and displays it.</p>
            <p>Lower latency requirements than MJPEG.</p>
            <p>Enter URL and click <span className="font-mono text-primary">SNAPSHOT</span>.</p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
