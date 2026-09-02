import { useEffect, useRef, useState, useCallback } from "react";
import { Layout } from "@/components/layout";
import {
  useGetMapState,
  useSetMapRecording,
  useClearMapPath,
  useAddWaypoint,
} from "@workspace/api-client-react";
import { useRoverWs } from "@/hooks/use-rover-ws";
import { useOperatorRole } from "@/hooks/use-operator-role";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  MapPin, Trash2, Download, Circle, Square, Navigation,
  ZoomIn, ZoomOut, RotateCcw, Play, Pause, StopCircle, Upload, Film,
} from "lucide-react";

interface PathPoint { x: number; y: number; headingDeg: number; speed: number; timestamp: string; }
interface Waypoint { id: string; label: string; x: number; y: number; timestamp: string; }
interface Position { x: number; y: number; headingDeg: number; timestamp: string; }
interface ExportFile {
  exportedAt?: string;
  totalDistanceM?: number;
  durationSeconds?: number;
  path: PathPoint[];
  waypoints?: Waypoint[];
}

type Mode = "live" | "replay";
type ReplayState = "idle" | "playing" | "paused";

const SPEEDS = [0.25, 0.5, 1, 2, 5, 10, 20] as const;

function drawRover(ctx: CanvasRenderingContext2D, rx: number, ry: number, headingDeg: number, color: string, alpha = 1) {
  const headingRad = (headingDeg - 90) * (Math.PI / 180);
  // Glow
  const grd = ctx.createRadialGradient(rx, ry, 0, rx, ry, 20);
  grd.addColorStop(0, `rgba(0,230,118,${0.3 * alpha})`);
  grd.addColorStop(1, "rgba(0,230,118,0)");
  ctx.fillStyle = grd;
  ctx.beginPath(); ctx.arc(rx, ry, 20, 0, Math.PI * 2); ctx.fill();
  // Body arrow
  ctx.save();
  ctx.translate(rx, ry);
  ctx.rotate(headingRad);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.lineTo(6, 8);
  ctx.lineTo(0, 4);
  ctx.lineTo(-6, 8);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
}

export default function MapPage() {
  const { canEditMap, canViewMap } = useOperatorRole();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // REST / mutation hooks
  const mapStateQuery = useGetMapState({ query: { refetchInterval: 2000 } as never });
  const setRecording = useSetMapRecording();
  const clearPath = useClearMapPath();
  const addWaypoint = useAddWaypoint();

  // WS
  const { status: wsStatus, telemetry: wsTelemetry } = useRoverWs();
  const [wsPosition, setWsPosition] = useState<Position | null>(null);

  // Live mode state
  const [localPath, setLocalPath] = useState<PathPoint[]>([]);
  const [localWaypoints, setLocalWaypoints] = useState<Waypoint[]>([]);
  const [recording, setRecordingState] = useState(false);
  const [totalDist, setTotalDist] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [wpLabel, setWpLabel] = useState("");

  // Replay state
  const [mode, setMode] = useState<Mode>("live");
  const [replayPath, setReplayPath] = useState<PathPoint[]>([]);
  const [replayWaypoints, setReplayWaypoints] = useState<Waypoint[]>([]);
  const [replayIndex, setReplayIndex] = useState(0);
  const [replayState, setReplayState] = useState<ReplayState>("idle");
  const [replaySpeed, setReplaySpeed] = useState<number>(1);
  const [replayFile, setReplayFile] = useState<string>("");
  const [replayMeta, setReplayMeta] = useState<{ totalDistanceM?: number; durationSeconds?: number; exportedAt?: string } | null>(null);
  const replayInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Map view
  const [scale, setScale] = useState(40);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const [followRover, setFollowRover] = useState(true);

  // Sync REST state on load
  useEffect(() => {
    if (mapStateQuery.data) {
      setLocalPath(mapStateQuery.data.path);
      setLocalWaypoints(mapStateQuery.data.waypoints);
      setRecordingState(mapStateQuery.data.recording);
      setTotalDist(mapStateQuery.data.totalDistanceM);
      setDurationSec(mapStateQuery.data.durationSeconds);
    }
  }, [mapStateQuery.data]);

  // WS position subscription (separate socket so replay mode still sees live rover)
  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}/api/ws`);
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as { type: string; payload: unknown };
        if (msg.type === "position") {
          const pos = msg.payload as Position;
          setWsPosition(pos);
          if (recording) {
            setLocalPath((prev) => {
              const last = prev[prev.length - 1];
              if (!last || Math.abs(pos.x - last.x) > 0.02 || Math.abs(pos.y - last.y) > 0.02) {
                return [...prev.slice(-4999), { ...pos, speed: wsTelemetry?.rover.speed ?? 0 }];
              }
              return prev;
            });
          }
        }
      } catch { /* ignore */ }
    };
    return () => ws.close();
  }, [recording, wsTelemetry]);

  // Recording duration counter
  useEffect(() => {
    if (!recording) return;
    const iv = setInterval(() => setDurationSec((s) => s + 1), 1000);
    return () => clearInterval(iv);
  }, [recording]);

  // Replay playback tick
  const stopReplayInterval = useCallback(() => {
    if (replayInterval.current) { clearInterval(replayInterval.current); replayInterval.current = null; }
  }, []);

  useEffect(() => {
    if (replayState !== "playing" || replayPath.length === 0) { stopReplayInterval(); return; }
    // interval ticks at 100ms, advancing index by speed * 0.1 * (path density factor)
    // We aim to replay in roughly realtime at speed=1 (500ms per point = 2 pts/s)
    const msPerTick = 100;
    const ptsPerTick = replaySpeed * (msPerTick / 500); // at speed=1, 100ms tick → 0.2 pts; we advance fractionally
    let fractional = 0;
    replayInterval.current = setInterval(() => {
      fractional += ptsPerTick;
      const whole = Math.floor(fractional);
      if (whole > 0) {
        fractional -= whole;
        setReplayIndex((i) => {
          const next = i + whole;
          if (next >= replayPath.length - 1) {
            stopReplayInterval();
            setReplayState("paused");
            return replayPath.length - 1;
          }
          return next;
        });
      }
    }, msPerTick);
    return () => stopReplayInterval();
  }, [replayState, replaySpeed, replayPath.length, stopReplayInterval]);

  // Derived display values
  const livePos = wsPosition ?? mapStateQuery.data?.position ?? { x: 0, y: 0, headingDeg: 0, timestamp: "" };
  const replayPos: Position | null = replayPath.length > 0
    ? { ...replayPath[Math.min(replayIndex, replayPath.length - 1)], timestamp: "" }
    : null;
  const displayPos = mode === "replay" && replayPos ? replayPos : livePos;

  // Elapsed replay time string
  const replayElapsed = (() => {
    if (replayPath.length < 2) return "0:00";
    const total = replayMeta?.durationSeconds ?? replayPath.length * 0.5;
    const elapsed = (replayIndex / (replayPath.length - 1)) * total;
    const m = Math.floor(elapsed / 60);
    const s = Math.floor(elapsed % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  })();

  // Canvas draw
  const animRef = useRef<number>(0);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const W = canvas.width;
      const H = canvas.height;
      const cx = W / 2 + panOffset.x;
      const cy = H / 2 + panOffset.y;
      const originX = followRover ? cx - displayPos.x * scale : cx;
      const originY = followRover ? cy + displayPos.y * scale : cy;

      ctx.fillStyle = "#080808";
      ctx.fillRect(0, 0, W, H);

      // Grid
      const gridStep = scale;
      const gridOpacity = Math.min(1, (scale - 10) / 30);
      if (gridOpacity > 0.05) {
        ctx.strokeStyle = `rgba(40,40,40,${gridOpacity})`;
        ctx.lineWidth = 1;
        for (let x = originX % gridStep; x < W; x += gridStep) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
        for (let y = originY % gridStep; y < H; y += gridStep) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      }
      const majorStep = scale * 10;
      if (majorStep > 20) {
        ctx.strokeStyle = "rgba(50,50,50,0.6)";
        ctx.lineWidth = 1;
        for (let x = originX % majorStep; x < W; x += majorStep) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
        for (let y = originY % majorStep; y < H; y += majorStep) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      }

      // Origin crosshair
      ctx.strokeStyle = "rgba(80,80,80,0.8)"; ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(originX, 0); ctx.lineTo(originX, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, originY); ctx.lineTo(W, originY); ctx.stroke();
      ctx.setLineDash([]);

      if (mode === "replay" && replayPath.length > 1) {
        // ── REPLAY MODE ─────────────────────────────────────
        // Ghost: full path in dim purple
        ctx.lineWidth = 1.5; ctx.lineJoin = "round"; ctx.lineCap = "round";
        for (let i = 1; i < replayPath.length; i++) {
          ctx.strokeStyle = "rgba(160,80,255,0.2)";
          ctx.beginPath();
          ctx.moveTo(originX + replayPath[i - 1].x * scale, originY - replayPath[i - 1].y * scale);
          ctx.lineTo(originX + replayPath[i].x * scale, originY - replayPath[i].y * scale);
          ctx.stroke();
        }
        // Played: up to replayIndex in bright amber
        const playedEnd = Math.min(replayIndex + 1, replayPath.length);
        ctx.lineWidth = 2;
        for (let i = 1; i < playedEnd; i++) {
          const alpha = 0.2 + (i / playedEnd) * 0.8;
          ctx.strokeStyle = `rgba(255,176,0,${alpha})`;
          ctx.beginPath();
          ctx.moveTo(originX + replayPath[i - 1].x * scale, originY - replayPath[i - 1].y * scale);
          ctx.lineTo(originX + replayPath[i].x * scale, originY - replayPath[i].y * scale);
          ctx.stroke();
        }
        // Waypoints (replay)
        for (const wp of replayWaypoints) {
          const wx = originX + wp.x * scale, wy = originY - wp.y * scale;
          ctx.fillStyle = "#00e5ff"; ctx.beginPath(); ctx.arc(wx, wy, 5, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "rgba(0,229,255,0.3)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(wx, wy, 10, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = "#00e5ff"; ctx.font = "bold 10px monospace"; ctx.fillText(wp.label, wx + 8, wy - 6);
        }
        // Start marker
        const sp = replayPath[0];
        ctx.fillStyle = "rgba(0,255,100,0.6)"; ctx.font = "bold 11px monospace";
        ctx.fillText("START", originX + sp.x * scale + 8, originY - sp.y * scale + 4);
        ctx.beginPath(); ctx.arc(originX + sp.x * scale, originY - sp.y * scale, 5, 0, Math.PI * 2); ctx.fill();
        // End marker
        const ep = replayPath[replayPath.length - 1];
        ctx.fillStyle = "rgba(255,80,80,0.6)";
        ctx.fillText("END", originX + ep.x * scale + 8, originY - ep.y * scale + 4);
        ctx.beginPath(); ctx.arc(originX + ep.x * scale, originY - ep.y * scale, 5, 0, Math.PI * 2); ctx.fill();
        // Replay rover (purple/magenta)
        if (replayPos) drawRover(ctx, originX + replayPos.x * scale, originY - replayPos.y * scale, replayPos.headingDeg, "#cc44ff");
      } else {
        // ── LIVE MODE ────────────────────────────────────────
        const path = localPath;
        if (path.length > 1) {
          ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.lineCap = "round";
          for (let i = 1; i < path.length; i++) {
            const alpha = 0.15 + (i / path.length) * 0.85;
            ctx.strokeStyle = `rgba(255,176,0,${alpha})`;
            ctx.beginPath();
            ctx.moveTo(originX + path[i - 1].x * scale, originY - path[i - 1].y * scale);
            ctx.lineTo(originX + path[i].x * scale, originY - path[i].y * scale);
            ctx.stroke();
          }
          const dotEvery = Math.max(1, Math.floor(path.length / 60));
          ctx.fillStyle = "rgba(255,176,0,0.5)";
          for (let i = 0; i < path.length; i += dotEvery) {
            const px = originX + path[i].x * scale, py = originY - path[i].y * scale;
            ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2); ctx.fill();
          }
        }
        // Planned/autonomous route: waypoint chain is intentionally distinct
        // from the recorded breadcrumb path.
        if (localWaypoints.length > 1) {
          ctx.strokeStyle = "rgba(0,229,255,0.75)";
          ctx.lineWidth = 1.5;
          ctx.setLineDash([7, 5]);
          ctx.beginPath();
          localWaypoints.forEach((wp, index) => {
            const x = originX + wp.x * scale, y = originY - wp.y * scale;
            if (index === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
          ctx.stroke();
          ctx.setLineDash([]);
        }
        // Live waypoints
        for (const wp of localWaypoints) {
          const wx = originX + wp.x * scale, wy = originY - wp.y * scale;
          ctx.fillStyle = "#00e5ff"; ctx.beginPath(); ctx.arc(wx, wy, 5, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "rgba(0,229,255,0.4)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(wx, wy, 10, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = "#00e5ff"; ctx.font = "bold 10px monospace"; ctx.fillText(wp.label, wx + 8, wy - 6);
        }
        // Live rover (green)
        drawRover(ctx, originX + livePos.x * scale, originY - livePos.y * scale, livePos.headingDeg, "#00e676");
      }

      // Scale bar
      const barMeters = scale >= 40 ? 5 : scale >= 20 ? 10 : 20;
      const barPx = barMeters * scale;
      const barX = 20, barY = H - 30;
      ctx.strokeStyle = "#ffb000"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(barX, barY); ctx.lineTo(barX + barPx, barY);
      ctx.moveTo(barX, barY - 4); ctx.lineTo(barX, barY + 4);
      ctx.moveTo(barX + barPx, barY - 4); ctx.lineTo(barX + barPx, barY + 4); ctx.stroke();
      ctx.fillStyle = "#ffb000"; ctx.font = "10px monospace";
      ctx.fillText(`${barMeters}m`, barX + barPx / 2 - 8, barY - 8);

      // Coords (bottom)
      ctx.fillStyle = "#555"; ctx.font = "10px monospace";
      ctx.fillText(`X: ${displayPos.x.toFixed(2)}m  Y: ${displayPos.y.toFixed(2)}m  HDG: ${Math.round(displayPos.headingDeg)}°`, 20, H - 12);

      // Mode badge (top-right)
      if (mode === "replay") {
        ctx.fillStyle = "rgba(180,80,255,0.15)";
        ctx.fillRect(W - 90, 8, 82, 22);
        ctx.strokeStyle = "rgba(180,80,255,0.5)"; ctx.lineWidth = 1;
        ctx.strokeRect(W - 90, 8, 82, 22);
        ctx.fillStyle = "#cc44ff"; ctx.font = "bold 10px monospace";
        ctx.fillText("◀ REPLAY", W - 84, 23);
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [localPath, localWaypoints, livePos, replayPath, replayWaypoints, replayPos, replayIndex, mode, scale, panOffset, followRover, displayPos]);

  // Resize canvas
  useEffect(() => {
    const el = containerRef.current, canvas = canvasRef.current;
    if (!el || !canvas) return;
    const resize = () => { canvas.width = el.clientWidth; canvas.height = el.clientHeight; };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Pan/zoom handlers
  const onMouseDown = (e: React.MouseEvent) => {
    setFollowRover(false); setIsPanning(true);
    panStart.current = { x: e.clientX, y: e.clientY, ox: panOffset.x, oy: panOffset.y };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    setPanOffset({ x: panStart.current.ox + (e.clientX - panStart.current.x), y: panStart.current.oy + (e.clientY - panStart.current.y) });
  };
  const onMouseUp = () => setIsPanning(false);
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setScale((s) => Math.max(5, Math.min(200, s * (e.deltaY < 0 ? 1.1 : 0.9))));
  };

  // File load for replay
  const handleFileLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canViewMap) return;
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string) as ExportFile;
        if (!Array.isArray(data.path) || data.path.length === 0) { alert("No path data found in file."); return; }
        setReplayPath(data.path);
        setReplayWaypoints(data.waypoints ?? []);
        setReplayIndex(0);
        setReplayState("idle");
        setReplayMeta({ totalDistanceM: data.totalDistanceM, durationSeconds: data.durationSeconds, exportedAt: data.exportedAt });
        setReplayFile(file.name);
        setMode("replay");
        setFollowRover(true);
        setPanOffset({ x: 0, y: 0 });
        stopReplayInterval();
      } catch { alert("Invalid replay file."); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleReplayPlay = () => {
    if (replayIndex >= replayPath.length - 1) setReplayIndex(0);
    setReplayState("playing");
    setFollowRover(true);
  };
  const handleReplayPause = () => {
    stopReplayInterval();
    setReplayState("paused");
  };
  const handleReplayStop = () => {
    stopReplayInterval();
    setReplayState("idle");
    setReplayIndex(0);
  };
  const handleExitReplay = () => {
    stopReplayInterval();
    setReplayState("idle");
    setMode("live");
    setReplayPath([]);
    setReplayWaypoints([]);
    setReplayFile("");
    setFollowRover(true);
    setPanOffset({ x: 0, y: 0 });
  };

  // Live recording controls
  const handleToggleRecording = () => {
    if (!canEditMap) return;
    const next = !recording;
    setRecording.mutate({ data: { active: next } }, {
      onSuccess: (data) => {
        setRecordingState(data.recording);
        if (!data.recording) { setLocalPath(data.path); setTotalDist(data.totalDistanceM); }
      },
    });
    setRecordingState(next);
  };
  const handleClear = () => {
    if (!canEditMap) return;
    clearPath.mutate(undefined, {
      onSuccess: () => { setLocalPath([]); setLocalWaypoints([]); setRecordingState(false); setTotalDist(0); setDurationSec(0); },
    });
  };
  const handleAddWaypoint = () => {
    if (!canEditMap) return;
    const label = wpLabel.trim() || `WP ${localWaypoints.length + 1}`;
    addWaypoint.mutate({ data: { label } }, { onSuccess: (wp) => { setLocalWaypoints((p) => [...p, wp]); setWpLabel(""); } });
  };
  const handleExport = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), totalDistanceM: totalDist, durationSeconds: durationSec, path: localPath, waypoints: localWaypoints }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `rover-path-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const formatDuration = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const replayProgress = replayPath.length > 1 ? replayIndex / (replayPath.length - 1) : 0;
  const replayTotal = (() => {
    const total = replayMeta?.durationSeconds ?? replayPath.length * 0.5;
    const m = Math.floor(total / 60), s = Math.floor(total % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  })();

  return (
    <Layout>
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-wider text-primary">PATH MAP</h1>
          <p className="text-muted-foreground text-xs">
            {mode === "replay"
              ? <span className="text-purple-400">REPLAY MODE — {replayFile}</span>
              : "ODOMETRY TRACE & WAYPOINT NAVIGATION"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {mode === "live" ? (
            <>
              {canEditMap && (
                <>
                  <Button onClick={handleToggleRecording} variant="outline"
                    className={recording ? "border-red-500 text-red-400 hover:bg-red-500/10 animate-pulse" : "border-primary/50 text-primary hover:bg-primary/10"}>
                    {recording ? <Square className="w-3 h-3 mr-2 fill-current" /> : <Circle className="w-3 h-3 mr-2" />}
                    {recording ? "STOP REC" : "START REC"}
                  </Button>
                  <Button variant="outline" onClick={handleClear} className="border-border text-muted-foreground hover:text-destructive hover:border-destructive">
                    <Trash2 className="w-3 h-3 mr-2" /> CLEAR
                  </Button>
                  <Button variant="outline" onClick={handleExport} disabled={localPath.length === 0} className="border-border text-muted-foreground hover:text-primary hover:border-primary">
                    <Download className="w-3 h-3 mr-2" /> EXPORT
                  </Button>
                </>
              )}
              <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="border-purple-500/50 text-purple-400 hover:bg-purple-500/10">
                <Film className="w-3 h-3 mr-2" /> LOAD REPLAY
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={handleExitReplay} className="border-border text-muted-foreground hover:text-primary hover:border-primary">
              ← BACK TO LIVE
            </Button>
          )}
          <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleFileLoad} />
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 flex-1">
        {/* Map canvas area */}
        <div className="lg:col-span-3 flex flex-col gap-2">
          {/* Toolbar */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <button onClick={() => setScale((s) => Math.min(200, s * 1.25))} className="p-1.5 border border-border rounded hover:border-primary hover:text-primary"><ZoomIn className="w-3.5 h-3.5" /></button>
            <button onClick={() => setScale((s) => Math.max(5, s * 0.8))} className="p-1.5 border border-border rounded hover:border-primary hover:text-primary"><ZoomOut className="w-3.5 h-3.5" /></button>
            <button onClick={() => { setFollowRover(true); setPanOffset({ x: 0, y: 0 }); }}
              className={`p-1.5 border rounded hover:text-primary ${followRover ? "border-primary text-primary" : "border-border hover:border-primary"}`} title="Follow rover">
              <Navigation className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => { setPanOffset({ x: 0, y: 0 }); setFollowRover(false); }} className="p-1.5 border border-border rounded hover:border-primary hover:text-primary" title="Reset pan"><RotateCcw className="w-3.5 h-3.5" /></button>
            <span className="ml-1 font-mono">{Math.round(scale)}px/m</span>
            {mode === "live" && recording && (
              <span className="ml-2 text-red-400 font-mono flex items-center gap-1 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> REC {formatDuration(durationSec)}
              </span>
            )}
            {mode === "replay" && (
              <span className="ml-2 text-purple-400 font-mono text-[10px]">
                {replayState === "playing" ? "▶ PLAYING" : replayState === "paused" ? "⏸ PAUSED" : "⏹ STOPPED"} {replayElapsed}/{replayTotal}
              </span>
            )}
             <div className="ml-auto flex items-center gap-3 text-[9px] font-mono">
               <span className="flex items-center gap-1 text-amber-300"><i className="h-px w-4 bg-amber-300" /> RECORDED</span>
               <span className="flex items-center gap-1 text-cyan-300"><i className="h-px w-4 border-t border-dashed border-cyan-300" /> PLANNED</span>
               {mode === "replay" && <span className="flex items-center gap-1 text-purple-300"><i className="h-px w-4 bg-purple-300" /> REPLAY</span>}
               <span className="text-muted-foreground/60 hidden sm:inline">Drag · Scroll</span>
             </div>
          </div>

          {/* Replay transport bar */}
          {mode === "replay" && (
            <div className="flex flex-col gap-2 bg-card border border-purple-500/30 rounded px-3 py-2">
              {/* Scrubber */}
              <div className="flex items-center gap-3">
                <span className="font-mono text-[10px] text-purple-400 w-10">{replayElapsed}</span>
                <input
                  type="range" min={0} max={replayPath.length - 1} value={replayIndex}
                  onChange={(e) => { stopReplayInterval(); setReplayState("paused"); setReplayIndex(Number(e.target.value)); }}
                  className="flex-1 h-1 accent-purple-500 cursor-pointer"
                />
                <span className="font-mono text-[10px] text-muted-foreground w-10 text-right">{replayTotal}</span>
              </div>
              {/* Transport controls + speed */}
              <div className="flex items-center gap-2">
                <button onClick={handleReplayPlay} disabled={replayState === "playing"}
                  className="p-1.5 border border-purple-500/50 rounded text-purple-400 hover:bg-purple-500/10 disabled:opacity-40">
                  <Play className="w-4 h-4" />
                </button>
                <button onClick={handleReplayPause} disabled={replayState !== "playing"}
                  className="p-1.5 border border-purple-500/50 rounded text-purple-400 hover:bg-purple-500/10 disabled:opacity-40">
                  <Pause className="w-4 h-4" />
                </button>
                <button onClick={handleReplayStop}
                  className="p-1.5 border border-purple-500/50 rounded text-purple-400 hover:bg-purple-500/10">
                  <StopCircle className="w-4 h-4" />
                </button>
                <div className="ml-3 flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground mr-1">SPEED</span>
                  {SPEEDS.map((s) => (
                    <button key={s} onClick={() => setReplaySpeed(s)}
                      className={`px-1.5 py-0.5 text-[10px] font-mono border rounded ${replaySpeed === s ? "border-purple-500 text-purple-300 bg-purple-500/10" : "border-border text-muted-foreground hover:border-purple-500/50 hover:text-purple-400"}`}>
                      {s}×
                    </button>
                  ))}
                </div>
                <div className="ml-auto flex items-center gap-2 text-[10px]">
                  <span className="text-muted-foreground">{replayIndex + 1}/{replayPath.length} pts</span>
                  {replayMeta?.totalDistanceM != null && <span className="text-purple-400">{replayMeta.totalDistanceM.toFixed(2)} m</span>}
                </div>
              </div>
            </div>
          )}

          {/* Canvas */}
          <div ref={containerRef}
            className="border border-border rounded bg-[#080808] cursor-crosshair relative overflow-hidden"
            style={{ height: mode === "replay" ? "calc(100vh - 340px)" : "calc(100vh - 280px)", minHeight: 300 }}
            onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp} onWheel={onWheel}>
            <canvas ref={canvasRef} className="w-full h-full" />
          </div>
        </div>

        {/* Side panel */}
        <div className="flex flex-col gap-4">
          {/* Stats card */}
          <Card className="border-border bg-card">
            <CardHeader className="py-3 border-b border-border">
              <CardTitle className="text-xs font-bold tracking-widest text-primary">
                {mode === "replay" ? "REPLAY INFO" : "MISSION STATS"}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {mode === "replay" ? (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-xs">Status</span>
                    <Badge variant="outline" className={
                      replayState === "playing" ? "border-purple-500 text-purple-400 animate-pulse" :
                      replayState === "paused" ? "border-yellow-500 text-yellow-400" : "border-border text-muted-foreground"}>
                      {replayState.toUpperCase()}
                    </Badge>
                  </div>
                  <div className="flex justify-between"><span className="text-muted-foreground text-xs">Progress</span><span className="font-mono text-purple-400 text-xs">{Math.round(replayProgress * 100)}%</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground text-xs">Points</span><span className="font-mono text-xs">{replayPath.length}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground text-xs">Distance</span><span className="font-mono text-xs">{(replayMeta?.totalDistanceM ?? 0).toFixed(2)} m</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground text-xs">Waypoints</span><span className="font-mono text-xs">{replayWaypoints.length}</span></div>
                  {replayMeta?.exportedAt && <div className="text-[10px] text-muted-foreground border-t border-border/50 pt-2">Recorded: {new Date(replayMeta.exportedAt).toLocaleString()}</div>}
                  <div className="border-t border-border/50 pt-2 space-y-1">
                    <span className="text-muted-foreground text-[10px] uppercase">Playback Position</span>
                    <div className="font-mono text-xs">
                      <div>X: <span className="text-purple-400">{displayPos.x.toFixed(3)} m</span></div>
                      <div>Y: <span className="text-purple-400">{displayPos.y.toFixed(3)} m</span></div>
                      <div>HDG: <span className="text-purple-400">{Math.round(displayPos.headingDeg)}°</span></div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-xs">Status</span>
                    <Badge variant="outline" className={recording ? "border-red-500 text-red-400 animate-pulse" : "border-border text-muted-foreground"}>
                      {recording ? "RECORDING" : "IDLE"}
                    </Badge>
                  </div>
                  <div className="flex justify-between"><span className="text-muted-foreground text-xs">Distance</span><span className="font-mono text-primary text-xs">{totalDist.toFixed(2)} m</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground text-xs">Duration</span><span className="font-mono text-xs">{formatDuration(durationSec)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground text-xs">Path points</span><span className="font-mono text-xs">{localPath.length}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground text-xs">Waypoints</span><span className="font-mono text-xs">{localWaypoints.length}</span></div>
                   <div className="flex justify-between"><span className="text-muted-foreground text-xs">Position source</span><span className="font-mono text-[10px] text-amber-300">SIMULATION</span></div>
                   <div className="flex justify-between"><span className="text-muted-foreground text-xs">Encoders / IMU</span><span className="font-mono text-[10px] text-amber-300">NOT VERIFIED</span></div>
                  <div className="border-t border-border/50 pt-2 space-y-1">
                    <span className="text-muted-foreground text-[10px] uppercase">Current Position</span>
                    <div className="font-mono text-xs">
                      <div>X: <span className="text-primary">{livePos.x.toFixed(3)} m</span></div>
                      <div>Y: <span className="text-primary">{livePos.y.toFixed(3)} m</span></div>
                      <div>HDG: <span className="text-primary">{Math.round(livePos.headingDeg)}°</span></div>
                    </div>
                  </div>
                  <div className="flex justify-between items-center border-t border-border/50 pt-2">
                    <span className="text-muted-foreground text-[10px] uppercase">WS</span>
                    <span className={`text-[10px] font-mono ${wsStatus === "connected" ? "text-green-400" : "text-red-400"}`}>{wsStatus.toUpperCase()}</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Waypoints / Replay load */}
          {mode === "live" ? (
            <Card className="border-border bg-card">
              <CardHeader className="py-3 border-b border-border">
                <CardTitle className="text-xs font-bold tracking-widest flex items-center gap-2"><MapPin className="w-3 h-3 text-cyan-400" /> WAYPOINTS</CardTitle>
              </CardHeader>
              <CardContent className="p-3 space-y-3">
                {canEditMap && (
                  <div className="flex gap-2">
                    <Input value={wpLabel} onChange={(e) => setWpLabel(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleAddWaypoint(); }}
                      placeholder="Label..." className="font-mono text-xs bg-background border-border h-8" />
                    <Button onClick={handleAddWaypoint} size="sm" variant="outline" className="border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10 px-2 h-8">
                      <MapPin className="w-3 h-3" />
                    </Button>
                  </div>
                )}
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {localWaypoints.length === 0 && <p className="text-xs text-muted-foreground/50 text-center py-2">No waypoints yet</p>}
                  {localWaypoints.map((wp, i) => (
                    <div key={wp.id} className="flex items-center gap-2 p-1.5 border border-border rounded text-xs">
                      <span className="text-cyan-400 font-bold font-mono w-4">{i + 1}</span>
                      <span className="flex-1 truncate">{wp.label}</span>
                      <span className="font-mono text-muted-foreground text-[10px]">{wp.x.toFixed(1)},{wp.y.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-purple-500/20 bg-card">
              <CardHeader className="py-3 border-b border-border">
                <CardTitle className="text-xs font-bold tracking-widest flex items-center gap-2 text-purple-400"><Film className="w-3 h-3" /> REPLAY WAYPOINTS</CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {replayWaypoints.length === 0 && <p className="text-xs text-muted-foreground/50 text-center py-2">No waypoints in this recording</p>}
                  {replayWaypoints.map((wp, i) => (
                    <div key={wp.id} className="flex items-center gap-2 p-1.5 border border-border rounded text-xs">
                      <span className="text-cyan-400 font-bold font-mono w-4">{i + 1}</span>
                      <span className="flex-1 truncate">{wp.label}</span>
                      <span className="font-mono text-muted-foreground text-[10px]">{wp.x.toFixed(1)},{wp.y.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Help card */}
          <Card className="border-border bg-card">
            <CardContent className="p-3 space-y-1.5 text-[10px] text-muted-foreground">
              {mode === "live" ? (
                <>
                  <p className="font-bold text-foreground text-[11px] mb-2">HOW TO USE</p>
                  <p>1. Press <span className="font-mono text-primary">START REC</span> to begin tracing.</p>
                  <p>2. Drive the rover (WASD on Main Control).</p>
                  <p>3. Drop waypoints at points of interest.</p>
                  <p>4. <span className="font-mono text-primary">EXPORT</span> saves the path as JSON.</p>
                  <p>5. <span className="font-mono text-purple-400">LOAD REPLAY</span> to play back any saved JSON.</p>
                  <p className="pt-1 border-t border-border/50">Scroll to zoom · Drag to pan · <span className="text-primary">▲</span> to follow rover.</p>
                </>
              ) : (
                <>
                  <p className="font-bold text-foreground text-[11px] mb-2">REPLAY CONTROLS</p>
                  <p><span className="font-mono text-purple-400">▶ PLAY</span> — start/resume animation.</p>
                  <p><span className="font-mono text-purple-400">⏸ PAUSE</span> — freeze at current frame.</p>
                  <p><span className="font-mono text-purple-400">⏹ STOP</span> — rewind to start.</p>
                  <p>Drag the <span className="text-purple-400">scrubber</span> to jump to any point.</p>
                  <p>Speed buttons: <span className="text-purple-400">0.25×–20×</span> real-time.</p>
                  <p className="pt-1 border-t border-border/50">Ghost path = full route. <span className="text-primary">Amber</span> = played so far.</p>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
