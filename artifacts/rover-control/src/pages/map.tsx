import { useEffect, useRef, useState, useCallback } from "react";
import { Layout } from "@/components/layout";
import {
  useGetMapState,
  useSetMapRecording,
  useClearMapPath,
  useAddWaypoint,
} from "@workspace/api-client-react";
import { useRoverWs } from "@/hooks/use-rover-ws";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MapPin, Trash2, Download, Circle, Square, Navigation, Crosshair, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

interface PathPoint { x: number; y: number; headingDeg: number; speed: number; timestamp: string; }
interface Waypoint { id: string; label: string; x: number; y: number; timestamp: string; }
interface Position { x: number; y: number; headingDeg: number; timestamp: string; }

export default function MapPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // REST queries for initial state
  const mapStateQuery = useGetMapState({ query: { refetchInterval: 2000 } as never });
  const setRecording = useSetMapRecording();
  const clearPath = useClearMapPath();
  const addWaypoint = useAddWaypoint();

  // Live position from WebSocket
  const { status: wsStatus, telemetry: wsTelemetry } = useRoverWs();
  const [wsPosition, setWsPosition] = useState<Position | null>(null);

  // Local path state (built from server + WS updates)
  const [localPath, setLocalPath] = useState<PathPoint[]>([]);
  const [localWaypoints, setLocalWaypoints] = useState<Waypoint[]>([]);
  const [recording, setRecordingState] = useState(false);
  const [totalDist, setTotalDist] = useState(0);
  const [durationSec, setDurationSec] = useState(0);

  // Map view state
  const [scale, setScale] = useState(40); // px per meter
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const [followRover, setFollowRover] = useState(true);

  // Waypoint label input
  const [wpLabel, setWpLabel] = useState("");

  // Sync from REST on load
  useEffect(() => {
    if (mapStateQuery.data) {
      setLocalPath(mapStateQuery.data.path);
      setLocalWaypoints(mapStateQuery.data.waypoints);
      setRecordingState(mapStateQuery.data.recording);
      setTotalDist(mapStateQuery.data.totalDistanceM);
      setDurationSec(mapStateQuery.data.durationSeconds);
    }
  }, [mapStateQuery.data]);

  // Accept WS position messages via a custom hook extension
  // We attach a custom listener to the raw WS via a global ref trick — simpler: poll via useRoverWs patch
  // Instead, subscribe to position via the ws hook's extra data
  const wsRef = useRef<WebSocket | null>(null);
  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}/api/ws`);
    wsRef.current = ws;
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
                const speed = wsTelemetry?.rover.speed ?? 0;
                return [...prev.slice(-4999), { ...pos, speed }];
              }
              return prev;
            });
          }
        }
      } catch { /* ignore */ }
    };
    return () => { ws.close(); };
  }, [recording]);

  // Duration counter
  useEffect(() => {
    if (!recording) return;
    const iv = setInterval(() => setDurationSec((s) => s + 1), 1000);
    return () => clearInterval(iv);
  }, [recording]);

  const currentPos = wsPosition ?? mapStateQuery.data?.position ?? { x: 0, y: 0, headingDeg: 0, timestamp: "" };

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

      // If following rover, offset center to rover position
      const originX = followRover ? cx - currentPos.x * scale : cx;
      const originY = followRover ? cy + currentPos.y * scale : cy;

      ctx.fillStyle = "#080808";
      ctx.fillRect(0, 0, W, H);

      // Grid
      const gridStep = scale; // 1m grid
      const gridOpacity = Math.min(1, (scale - 10) / 30);
      if (gridOpacity > 0.05) {
        ctx.strokeStyle = `rgba(40,40,40,${gridOpacity})`;
        ctx.lineWidth = 1;
        const startX = originX % gridStep;
        const startY = originY % gridStep;
        for (let x = startX; x < W; x += gridStep) {
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
        }
        for (let y = startY; y < H; y += gridStep) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        }
      }

      // Major grid (10m)
      const majorStep = scale * 10;
      if (majorStep > 20) {
        ctx.strokeStyle = "rgba(50,50,50,0.6)";
        ctx.lineWidth = 1;
        const mStartX = originX % majorStep;
        const mStartY = originY % majorStep;
        for (let x = mStartX; x < W; x += majorStep) {
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
        }
        for (let y = mStartY; y < H; y += majorStep) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        }
      }

      // Origin crosshair
      ctx.strokeStyle = "rgba(80,80,80,0.8)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(originX, 0); ctx.lineTo(originX, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, originY); ctx.lineTo(W, originY); ctx.stroke();
      ctx.setLineDash([]);

      // Path trail
      const path = localPath;
      if (path.length > 1) {
        ctx.lineWidth = 2;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        // Color gradient: old = dim amber, recent = bright amber
        for (let i = 1; i < path.length; i++) {
          const alpha = 0.15 + (i / path.length) * 0.85;
          ctx.strokeStyle = `rgba(255,176,0,${alpha})`;
          ctx.beginPath();
          const px0 = originX + path[i - 1].x * scale;
          const py0 = originY - path[i - 1].y * scale;
          const px1 = originX + path[i].x * scale;
          const py1 = originY - path[i].y * scale;
          ctx.moveTo(px0, py0);
          ctx.lineTo(px1, py1);
          ctx.stroke();
        }

        // Path dots every N points
        const dotEvery = Math.max(1, Math.floor(path.length / 60));
        ctx.fillStyle = "rgba(255,176,0,0.5)";
        for (let i = 0; i < path.length; i += dotEvery) {
          const px = originX + path[i].x * scale;
          const py = originY - path[i].y * scale;
          ctx.beginPath();
          ctx.arc(px, py, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Waypoints
      for (const wp of localWaypoints) {
        const wx = originX + wp.x * scale;
        const wy = originY - wp.y * scale;
        // Pin
        ctx.fillStyle = "#00e5ff";
        ctx.beginPath();
        ctx.arc(wx, wy, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(0,229,255,0.4)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(wx, wy, 10, 0, Math.PI * 2);
        ctx.stroke();
        // Label
        ctx.fillStyle = "#00e5ff";
        ctx.font = "bold 10px monospace";
        ctx.fillText(wp.label, wx + 8, wy - 6);
      }

      // Scale bar
      const barMeters = scale >= 40 ? 5 : scale >= 20 ? 10 : 20;
      const barPx = barMeters * scale;
      const barX = 20;
      const barY = H - 30;
      ctx.strokeStyle = "#ffb000";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(barX, barY); ctx.lineTo(barX + barPx, barY);
      ctx.moveTo(barX, barY - 4); ctx.lineTo(barX, barY + 4);
      ctx.moveTo(barX + barPx, barY - 4); ctx.lineTo(barX + barPx, barY + 4);
      ctx.stroke();
      ctx.fillStyle = "#ffb000";
      ctx.font = "10px monospace";
      ctx.fillText(`${barMeters}m`, barX + barPx / 2 - 8, barY - 8);

      // Rover icon at current position
      const rx = originX + currentPos.x * scale;
      const ry = originY - currentPos.y * scale;
      const headingRad = (currentPos.headingDeg - 90) * (Math.PI / 180);

      // Glow
      const grd = ctx.createRadialGradient(rx, ry, 0, rx, ry, 20);
      grd.addColorStop(0, "rgba(0,230,118,0.3)");
      grd.addColorStop(1, "rgba(0,230,118,0)");
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(rx, ry, 20, 0, Math.PI * 2); ctx.fill();

      // Body
      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate(headingRad);
      ctx.fillStyle = "#00e676";
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(6, 8);
      ctx.lineTo(0, 4);
      ctx.lineTo(-6, 8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Coords
      ctx.fillStyle = "#555";
      ctx.font = "10px monospace";
      ctx.fillText(`X: ${currentPos.x.toFixed(2)}m  Y: ${currentPos.y.toFixed(2)}m  HDG: ${Math.round(currentPos.headingDeg)}°`, 20, H - 12);

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [localPath, localWaypoints, currentPos, scale, panOffset, followRover]);

  // Resize canvas to container
  useEffect(() => {
    const el = containerRef.current;
    const canvas = canvasRef.current;
    if (!el || !canvas) return;
    const resize = () => {
      canvas.width = el.clientWidth;
      canvas.height = el.clientHeight;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Pan handlers
  const onMouseDown = (e: React.MouseEvent) => {
    setFollowRover(false);
    setIsPanning(true);
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

  const handleToggleRecording = () => {
    const next = !recording;
    setRecording.mutate({ data: { active: next } }, {
      onSuccess: (data) => {
        setRecordingState(data.recording);
        if (!data.recording) {
          setLocalPath(data.path);
          setTotalDist(data.totalDistanceM);
        }
      },
    });
    setRecordingState(next);
  };

  const handleClear = () => {
    clearPath.mutate(undefined, {
      onSuccess: () => {
        setLocalPath([]);
        setLocalWaypoints([]);
        setRecordingState(false);
        setTotalDist(0);
        setDurationSec(0);
      },
    });
  };

  const handleAddWaypoint = () => {
    const label = wpLabel.trim() || `WP ${localWaypoints.length + 1}`;
    addWaypoint.mutate({ data: { label } }, {
      onSuccess: (wp) => {
        setLocalWaypoints((prev) => [...prev, wp]);
        setWpLabel("");
      },
    });
  };

  const handleExport = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      totalDistanceM: totalDist,
      durationSeconds: durationSec,
      path: localPath,
      waypoints: localWaypoints,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rover-path-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  return (
    <Layout>
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-wider text-primary">PATH MAP</h1>
          <p className="text-muted-foreground text-xs">ODOMETRY TRACE & WAYPOINT NAVIGATION</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Recording toggle */}
          <Button
            onClick={handleToggleRecording}
            variant="outline"
            className={recording
              ? "border-red-500 text-red-400 hover:bg-red-500/10 animate-pulse"
              : "border-primary/50 text-primary hover:bg-primary/10"}
          >
            {recording ? <Square className="w-3 h-3 mr-2 fill-current" /> : <Circle className="w-3 h-3 mr-2" />}
            {recording ? "STOP REC" : "START REC"}
          </Button>
          <Button variant="outline" onClick={handleClear} className="border-border text-muted-foreground hover:text-destructive hover:border-destructive">
            <Trash2 className="w-3 h-3 mr-2" /> CLEAR
          </Button>
          <Button variant="outline" onClick={handleExport} disabled={localPath.length === 0} className="border-border text-muted-foreground hover:text-primary hover:border-primary">
            <Download className="w-3 h-3 mr-2" /> EXPORT
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 flex-1">
        {/* Map canvas */}
        <div className="lg:col-span-3 flex flex-col gap-2">
          {/* Map toolbar */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <button onClick={() => setScale((s) => Math.min(200, s * 1.25))} className="p-1.5 border border-border rounded hover:border-primary hover:text-primary">
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setScale((s) => Math.max(5, s * 0.8))} className="p-1.5 border border-border rounded hover:border-primary hover:text-primary">
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => { setFollowRover(true); setPanOffset({ x: 0, y: 0 }); }}
              className={`p-1.5 border rounded hover:text-primary ${followRover ? "border-primary text-primary" : "border-border hover:border-primary"}`}
              title="Follow rover"
            >
              <Navigation className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => { setPanOffset({ x: 0, y: 0 }); setFollowRover(false); }}
              className="p-1.5 border border-border rounded hover:border-primary hover:text-primary"
              title="Reset view"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <span className="ml-2 font-mono">{Math.round(scale)}px/m</span>
            {recording && (
              <span className="ml-2 text-red-400 font-mono flex items-center gap-1 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> REC {formatDuration(durationSec)}
              </span>
            )}
            <span className="ml-auto text-muted-foreground/60 text-[10px]">Drag to pan · Scroll to zoom · Click FOLLOW to track rover</span>
          </div>

          <div
            ref={containerRef}
            className="border border-border rounded bg-[#080808] cursor-crosshair relative overflow-hidden"
            style={{ height: "calc(100vh - 280px)", minHeight: 360 }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onWheel={onWheel}
          >
            <canvas ref={canvasRef} className="w-full h-full" />
          </div>
        </div>

        {/* Side panel */}
        <div className="flex flex-col gap-4">
          {/* Stats */}
          <Card className="border-border bg-card">
            <CardHeader className="py-3 border-b border-border">
              <CardTitle className="text-xs font-bold tracking-widest text-primary">MISSION STATS</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-xs">Status</span>
                <Badge variant="outline" className={recording ? "border-red-500 text-red-400 animate-pulse" : "border-border text-muted-foreground"}>
                  {recording ? "RECORDING" : "IDLE"}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground text-xs">Distance</span>
                <span className="font-mono text-primary text-xs">{totalDist.toFixed(2)} m</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground text-xs">Duration</span>
                <span className="font-mono text-xs">{formatDuration(durationSec)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground text-xs">Path points</span>
                <span className="font-mono text-xs">{localPath.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground text-xs">Waypoints</span>
                <span className="font-mono text-xs">{localWaypoints.length}</span>
              </div>
              <div className="border-t border-border/50 pt-2 space-y-1">
                <span className="text-muted-foreground text-[10px] uppercase">Current Position</span>
                <div className="font-mono text-xs text-foreground">
                  <div>X: <span className="text-primary">{currentPos.x.toFixed(3)} m</span></div>
                  <div>Y: <span className="text-primary">{currentPos.y.toFixed(3)} m</span></div>
                  <div>HDG: <span className="text-primary">{Math.round(currentPos.headingDeg)}°</span></div>
                </div>
              </div>
              <div className="flex justify-between items-center border-t border-border/50 pt-2">
                <span className="text-muted-foreground text-[10px] uppercase">WS</span>
                <span className={`text-[10px] font-mono ${wsStatus === "connected" ? "text-green-400" : "text-red-400"}`}>
                  {wsStatus.toUpperCase()}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Add waypoint */}
          <Card className="border-border bg-card">
            <CardHeader className="py-3 border-b border-border">
              <CardTitle className="text-xs font-bold tracking-widest flex items-center gap-2">
                <MapPin className="w-3 h-3 text-cyan-400" /> WAYPOINTS
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-3">
              <div className="flex gap-2">
                <Input
                  value={wpLabel}
                  onChange={(e) => setWpLabel(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddWaypoint(); }}
                  placeholder="Label..."
                  className="font-mono text-xs bg-background border-border h-8"
                />
                <Button
                  onClick={handleAddWaypoint}
                  size="sm"
                  variant="outline"
                  className="border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10 px-2 h-8"
                >
                  <MapPin className="w-3 h-3" />
                </Button>
              </div>

              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {localWaypoints.length === 0 && (
                  <p className="text-xs text-muted-foreground/50 text-center py-2">No waypoints yet</p>
                )}
                {localWaypoints.map((wp, i) => (
                  <div key={wp.id} className="flex items-center gap-2 p-1.5 border border-border rounded text-xs">
                    <span className="text-cyan-400 font-bold font-mono w-4">{i + 1}</span>
                    <span className="flex-1 truncate">{wp.label}</span>
                    <span className="font-mono text-muted-foreground text-[10px]">
                      {wp.x.toFixed(1)},{wp.y.toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Instructions */}
          <Card className="border-border bg-card">
            <CardContent className="p-3 space-y-1.5 text-[10px] text-muted-foreground">
              <p className="font-bold text-foreground text-[11px] mb-2">HOW TO USE</p>
              <p>1. Press <span className="font-mono text-primary">START REC</span> to begin tracing.</p>
              <p>2. Drive the rover from Main Control (WASD).</p>
              <p>3. Drop waypoints at points of interest.</p>
              <p>4. Press <span className="font-mono text-primary">STOP REC</span> to pause recording.</p>
              <p>5. <span className="font-mono text-primary">EXPORT</span> saves path as JSON.</p>
              <p className="pt-1 border-t border-border/50">Scroll to zoom · Drag to pan · <span className="text-primary">FOLLOW</span> re-centers on rover.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
