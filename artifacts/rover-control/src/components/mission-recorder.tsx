import { useState, useEffect, useRef, useCallback } from "react";
import { X, Circle, Square, Download, Trash2, Camera, Play, Pause, SkipBack, CheckCircle, AlertTriangle, Info, Activity } from "lucide-react";
import type { WsTelemetry, WsStatus } from "@/hooks/use-rover-ws";

interface MissionEvent {
  id: string;
  type: "start" | "stop" | "waypoint" | "obstacle" | "artifact" | "mode_change" | "battery_warn" | "photo" | "telemetry" | "info";
  message: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

interface Props {
  onClose: () => void;
  rover: WsTelemetry["rover"] | undefined;
  wsStatus: WsStatus;
  currentPos?: { x: number; y: number; headingDeg: number };
}

function genId() { return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`; }

const EVENT_ICONS: Record<MissionEvent["type"], React.ReactNode> = {
  start:        <Play className="w-3 h-3 text-green-400" />,
  stop:         <Square className="w-3 h-3 text-red-400" />,
  waypoint:     <CheckCircle className="w-3 h-3 text-cyan-400" />,
  obstacle:     <AlertTriangle className="w-3 h-3 text-orange-400" />,
  artifact:     <CheckCircle className="w-3 h-3 text-purple-400" />,
  mode_change:  <Info className="w-3 h-3 text-yellow-400" />,
  battery_warn: <AlertTriangle className="w-3 h-3 text-red-400" />,
  photo:        <Camera className="w-3 h-3 text-blue-400" />,
  telemetry:    <Activity className="w-3 h-3 text-green-400/60" />,
  info:         <Info className="w-3 h-3 text-muted-foreground" />,
};

const EVENT_COLORS: Record<MissionEvent["type"], string> = {
  start: "#00e676", stop: "#ff4444", waypoint: "#00f5ff",
  obstacle: "#ffb000", artifact: "#cc44ff", mode_change: "#ffb000",
  battery_warn: "#ff4444", photo: "#4fc3f7", telemetry: "#444", info: "#555",
};

export function MissionRecorder({ onClose, rover, wsStatus, currentPos }: Props) {
  const [recording, setRecording] = useState(false);
  const [events, setEvents] = useState<MissionEvent[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [playbackIdx, setPlaybackIdx] = useState<number | null>(null);
  const [playbackActive, setPlaybackActive] = useState(false);
  const [showTelemetry, setShowTelemetry] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const playbackTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevBattery = useRef<number | null>(null);
  const prevSpeed = useRef<number | null>(null);
  const prevConnected = useRef<boolean | null>(null);

  const addEvent = useCallback((type: MissionEvent["type"], message: string, data?: Record<string, unknown>) => {
    const evt: MissionEvent = { id: genId(), type, message, timestamp: Date.now(), data };
    setEvents((prev) => [...prev, evt]);
    setTimeout(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    }, 50);
    return evt;
  }, []);

  // Recording elapsed timer
  useEffect(() => {
    if (!recording) return;
    const iv = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(iv);
  }, [recording]);

  // Stable refs so interval callback can read latest values without being in deps
  const elapsedRef = useRef(0);
  const currentPosRef = useRef(currentPos);
  useEffect(() => { elapsedRef.current = elapsed; }, [elapsed]);
  useEffect(() => { currentPosRef.current = currentPos; }, [currentPos]);

  // Auto telemetry snapshot every 30 seconds — deps intentionally exclude elapsed/currentPos
  useEffect(() => {
    if (!recording || !rover) return;
    const iv = setInterval(() => {
      const pos = currentPosRef.current;
      addEvent("telemetry", `Telemetry snapshot @ T+${fmtDur(elapsedRef.current)}`, {
        battery: rover.batteryLevel,
        speed: rover.speed,
        motorTemp: rover.motorTemperature,
        direction: rover.direction,
        connected: rover.connected,
        position: pos ? { x: pos.x, y: pos.y, headingDeg: pos.headingDeg } : null,
      });
    }, 30000);
    return () => clearInterval(iv);
  }, [recording, rover, addEvent]);

  // Battery warning
  useEffect(() => {
    if (!recording || !rover) return;
    const bat = rover.batteryLevel;
    if (prevBattery.current !== null && prevBattery.current > 20 && bat <= 20) {
      addEvent("battery_warn", `Battery critical: ${bat}%`, { batteryLevel: bat });
    }
    prevBattery.current = bat;
  }, [recording, rover, addEvent]);

  // Speed change detection (significant changes)
  useEffect(() => {
    if (!recording || !rover) return;
    const spd = rover.speed;
    if (prevSpeed.current !== null) {
      if (prevSpeed.current < 0.1 && spd > 0.3) addEvent("info", `Rover started moving — speed ${spd.toFixed(1)} m/s`, { speed: spd });
      else if (prevSpeed.current > 0.3 && spd < 0.1) addEvent("info", "Rover stopped", { speed: spd });
    }
    prevSpeed.current = spd;
  }, [recording, rover, addEvent]);

  // Connection changes
  useEffect(() => {
    if (!recording) return;
    if (prevConnected.current !== null && prevConnected.current !== (wsStatus === "connected")) {
      if (wsStatus === "connected") {
        addEvent("info", "Telemetry link re-established");
      } else {
        addEvent("info", "Telemetry link lost — reconnecting…");
      }
    }
    prevConnected.current = wsStatus === "connected";
  }, [recording, wsStatus, addEvent]);

  // Playback tick
  useEffect(() => {
    if (!playbackActive || events.length === 0) {
      if (playbackTimer.current) { clearInterval(playbackTimer.current); playbackTimer.current = null; }
      return;
    }
    playbackTimer.current = setInterval(() => {
      setPlaybackIdx((prev) => {
        const next = (prev ?? -1) + 1;
        if (next >= events.length) { setPlaybackActive(false); return events.length - 1; }
        return next;
      });
    }, 600);
    return () => { if (playbackTimer.current) clearInterval(playbackTimer.current); };
  }, [playbackActive, events.length]);

  const startRecording = () => {
    setRecording(true);
    setElapsed(0);
    setPlaybackIdx(null);
    setPlaybackActive(false);
    prevBattery.current = rover?.batteryLevel ?? null;
    prevSpeed.current = rover?.speed ?? null;
    prevConnected.current = wsStatus === "connected";
    addEvent("start", "Mission recording started", {
      battery: rover?.batteryLevel,
      speed: rover?.speed,
      motorTemp: rover?.motorTemperature,
      wsStatus,
      position: currentPos ?? null,
    });
  };

  const stopRecording = () => {
    setRecording(false);
    addEvent("stop", `Mission complete — ${fmtDur(elapsed)} elapsed, ${events.length + 1} events`, {
      finalBattery: rover?.batteryLevel,
      finalPos: currentPos ?? null,
      durationS: elapsed,
    });
  };

  const takePhoto = () => {
    const now = new Date();
    const mTime = fmtDur(elapsed);
    const snapshot = {
      capturedAt: now.toISOString(),
      missionTime: mTime,
      battery: rover?.batteryLevel ?? null,
      speed: rover?.speed ?? null,
      motorTemp: rover?.motorTemperature ?? null,
      direction: rover?.direction ?? null,
      connected: rover?.connected ?? null,
      position: currentPos ?? null,
    };
    addEvent("photo", `Snapshot captured @ T+${mTime}`, snapshot);

    // Generate a telemetry data card PNG via Canvas API
    try {
      const W = 480, H = 240;
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      const ctx = c.getContext("2d")!;

      // Background
      ctx.fillStyle = "#07090f"; ctx.fillRect(0, 0, W, H);
      // Border
      ctx.strokeStyle = "#cc44ff"; ctx.lineWidth = 1.5; ctx.strokeRect(1, 1, W - 2, H - 2);
      // Corner accents
      [[ 0, 0, 1, 0 ], [ 0, 0, 0, 1 ], [ 1, 0, 0, 0 ], [ 1, 0, 1, 0 ],
       [ 0, 1, 1, 1 ], [ 0, 1, 0, 0 ], [ 1, 1, 0, 1 ], [ 1, 1, 1, 1 ]].forEach(() => {});
      ctx.strokeStyle = "#cc44ff44"; ctx.lineWidth = 1;
      const cs = 14;
      [[0,0,1,0],[0,0,0,1]].forEach(([sx,sy,ex,ey]) =>
        void (ctx.beginPath(), ctx.moveTo(sx*(W-1),sy*(H-1)), ctx.lineTo(sx*(W-1)+ex*cs,sy*(H-1)+ey*cs), ctx.stroke()));
      ctx.strokeStyle = "#cc44ff80";

      // Header
      ctx.fillStyle = "#cc44ff"; ctx.font = "bold 11px monospace";
      ctx.fillText("MISSION SNAPSHOT", 12, 22);
      ctx.fillStyle = "#555"; ctx.font = "9px monospace";
      ctx.fillText(now.toLocaleString(), 12, 36);
      ctx.fillText(`T+ ${mTime}`, W - 80, 22);

      // Divider
      ctx.strokeStyle = "#cc44ff30"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(12, 44); ctx.lineTo(W - 12, 44); ctx.stroke();

      // Telemetry grid
      const rows: [string, string, string][] = [
        ["Battery",    `${rover?.batteryLevel ?? "—"}%`,             rover?.batteryLevel !== undefined && rover.batteryLevel <= 20 ? "#ff4444" : "#00e676"],
        ["Speed",      `${rover?.speed?.toFixed(2) ?? "—"} m/s`,     "#00f5ff"],
        ["Motor Temp", `${rover?.motorTemperature ?? "—"}°C`,        "#ffb000"],
        ["Direction",  (rover?.direction ?? "—").toUpperCase(),       "#4fc3f7"],
        ["Link",       rover?.connected ? "ONLINE" : "OFFLINE",       rover?.connected ? "#00e676" : "#ff4444"],
        ["Pos X",      currentPos ? `${currentPos.x.toFixed(2)}m` : "—", "#aaa"],
        ["Pos Y",      currentPos ? `${currentPos.y.toFixed(2)}m` : "—", "#aaa"],
        ["Heading",    currentPos ? `${Math.round(currentPos.headingDeg)}°` : "—", "#aaa"],
      ];

      const colW = (W - 24) / 2;
      rows.forEach(([label, value, color], i) => {
        const col = i % 2, row = Math.floor(i / 2);
        const x = 12 + col * colW, y = 60 + row * 42;
        ctx.fillStyle = "#333"; ctx.font = "8px monospace"; ctx.fillText(label.toUpperCase(), x, y);
        ctx.fillStyle = color; ctx.font = "bold 15px monospace"; ctx.fillText(value, x, y + 16);
      });

      // Footer
      ctx.fillStyle = "#333"; ctx.font = "8px monospace";
      ctx.fillText("TEC-CODE // ROVER CONTROL — MISSION DATA", 12, H - 8);

      // Download
      c.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `snapshot-${Date.now()}.png`; a.click();
        URL.revokeObjectURL(url);
      }, "image/png");
    } catch { /* canvas unavailable */ }

    // Visual flash
    document.body.style.filter = "brightness(1.6)";
    setTimeout(() => { document.body.style.filter = ""; }, 120);
  };

  const addManualEvent = (type: MissionEvent["type"], msg: string) => {
    if (recording) addEvent(type, msg, { position: currentPos ?? null });
  };

  const exportMission = () => {
    const report = {
      exportedAt: new Date().toISOString(),
      duration: elapsed,
      totalEvents: events.length,
      events: events.map((e) => ({ ...e, time: new Date(e.timestamp).toISOString() })),
      summary: {
        waypoints:  events.filter((e) => e.type === "waypoint").length,
        obstacles:  events.filter((e) => e.type === "obstacle").length,
        artifacts:  events.filter((e) => e.type === "artifact").length,
        photos:     events.filter((e) => e.type === "photo").length,
        telemetry:  events.filter((e) => e.type === "telemetry").length,
        batteryWarnings: events.filter((e) => e.type === "battery_warn").length,
      },
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `mission-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const clearAll = () => {
    if (recording) return;
    setEvents([]); setPlaybackIdx(null); setPlaybackActive(false); setElapsed(0);
  };

  const startPlayback = () => { setPlaybackIdx(0); setPlaybackActive(true); };
  const pausePlayback = () => setPlaybackActive(false);
  const resetPlayback = () => { setPlaybackIdx(null); setPlaybackActive(false); };

  const fmtDur = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const visibleEvents = playbackIdx !== null
    ? events.slice(0, playbackIdx + 1)
    : events.filter((e) => showTelemetry || e.type !== "telemetry");

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-end bg-black/60 backdrop-blur-sm font-mono"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="h-full w-[400px] bg-[#070810] border-l border-purple-500/20 flex flex-col overflow-hidden shadow-2xl"
        style={{ boxShadow: "0 0 40px rgba(180,80,255,0.06) inset" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-purple-500/20 bg-black/40 shrink-0">
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${recording ? "bg-red-500 animate-pulse" : "bg-purple-500/40"}`} />
            <span className="font-bold text-[12px] tracking-widest text-purple-400">MISSION RECORDER</span>
            {recording && <span className="text-[10px] text-red-400 font-mono ml-1">T+ {fmtDur(elapsed)}</span>}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>

        {/* Live telemetry strip */}
        {rover && (
          <div className="px-4 py-1.5 border-b border-border bg-black/30 shrink-0 flex items-center gap-3 text-[9px] font-mono text-muted-foreground">
            <span className={rover.connected ? "text-green-400" : "text-red-400"}>● {rover.connected ? "LIVE" : "OFFLINE"}</span>
            <span>BAT <span className="text-primary">{rover.batteryLevel}%</span></span>
            <span>SPD <span className="text-primary">{rover.speed.toFixed(1)}m/s</span></span>
            <span>TEMP <span className="text-primary">{rover.motorTemperature}°</span></span>
            {currentPos && <span>X:{currentPos.x.toFixed(1)} Y:{currentPos.y.toFixed(1)}</span>}
          </div>
        )}

        {/* Controls */}
        <div className="px-4 py-3 border-b border-border bg-black/20 shrink-0 space-y-2.5">
          <div className="flex gap-2">
            {!recording ? (
              <button onClick={startRecording}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-red-500/50 bg-red-500/10 text-red-400 rounded text-[11px] font-bold hover:bg-red-500/20 transition-colors">
                <Circle className="w-3.5 h-3.5" /> START RECORDING
              </button>
            ) : (
              <button onClick={stopRecording}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-red-500/70 bg-red-500/15 text-red-400 rounded text-[11px] font-bold hover:bg-red-500/25 animate-pulse transition-colors">
                <Square className="w-3.5 h-3.5 fill-current" /> STOP ({fmtDur(elapsed)})
              </button>
            )}
            <button onClick={takePhoto} disabled={!recording}
              title="Capture telemetry snapshot"
              className="px-3 py-2 border border-blue-500/40 text-blue-400 rounded text-[10px] hover:bg-blue-500/10 disabled:opacity-30 transition-colors">
              <Camera className="w-3.5 h-3.5" />
            </button>
          </div>

          {recording && (
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => addManualEvent("waypoint", "Waypoint reached")}
                className="flex items-center gap-1 px-2 py-0.5 border border-cyan-500/30 text-cyan-400 text-[9px] rounded hover:bg-cyan-500/10">
                <CheckCircle className="w-2.5 h-2.5" /> WP REACHED
              </button>
              <button onClick={() => addManualEvent("obstacle", "Obstacle encountered")}
                className="flex items-center gap-1 px-2 py-0.5 border border-orange-500/30 text-orange-400 text-[9px] rounded hover:bg-orange-500/10">
                <AlertTriangle className="w-2.5 h-2.5" /> OBSTACLE
              </button>
              <button onClick={() => addManualEvent("artifact", "Artifact detected")}
                className="flex items-center gap-1 px-2 py-0.5 border border-purple-500/30 text-purple-400 text-[9px] rounded hover:bg-purple-500/10">
                <CheckCircle className="w-2.5 h-2.5" /> ARTIFACT
              </button>
              <button onClick={() => addManualEvent("mode_change", "Autonomous mode changed")}
                className="flex items-center gap-1 px-2 py-0.5 border border-yellow-500/30 text-yellow-400 text-[9px] rounded hover:bg-yellow-500/10">
                <Info className="w-2.5 h-2.5" /> MODE CHANGE
              </button>
            </div>
          )}

          {/* Filter toggle */}
          <div className="flex items-center justify-end gap-2 text-[9px]">
            <span className="text-muted-foreground/60">Show telemetry ticks</span>
            <button
              onClick={() => setShowTelemetry((v) => !v)}
              className={`w-8 h-4 rounded-full transition-colors ${showTelemetry ? "bg-purple-500/60" : "bg-muted/30"}`}
            >
              <div className={`w-3 h-3 bg-white rounded-full transition-transform mx-0.5 ${showTelemetry ? "translate-x-4" : "translate-x-0"}`} />
            </button>
          </div>
        </div>

        {/* Timeline scrubber */}
        {events.length > 1 && (
          <div className="px-4 py-3 border-b border-border bg-black/20 shrink-0 space-y-2">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>PLAYBACK TIMELINE</span>
              <span>{playbackIdx !== null ? `${playbackIdx + 1} / ${events.length}` : `${events.length} events`}</span>
            </div>
            <input
              type="range" min={0} max={events.length - 1}
              value={playbackIdx ?? events.length - 1}
              onChange={(e) => { setPlaybackActive(false); setPlaybackIdx(parseInt(e.target.value)); }}
              className="w-full h-1.5 rounded appearance-none cursor-pointer"
              style={{ accentColor: "#cc44ff" }}
            />
            <div className="flex gap-2 justify-center">
              <button onClick={resetPlayback} className="p-1 border border-border rounded text-muted-foreground hover:text-foreground hover:border-purple-500/40"><SkipBack className="w-3 h-3" /></button>
              {playbackActive
                ? <button onClick={pausePlayback} className="p-1 border border-purple-500/50 rounded text-purple-400 bg-purple-500/10"><Pause className="w-3 h-3" /></button>
                : <button onClick={startPlayback} className="p-1 border border-purple-500/50 rounded text-purple-400 bg-purple-500/10"><Play className="w-3 h-3 fill-current" /></button>
              }
              <span className="text-[9px] text-muted-foreground self-center">
                {playbackIdx !== null ? new Date(events[playbackIdx].timestamp).toLocaleTimeString() : "—"}
              </span>
            </div>
          </div>
        )}

        {/* Event feed */}
        <div ref={listRef} className="flex-1 overflow-y-auto p-3 space-y-1">
          {events.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <Circle className="w-8 h-8 mx-auto text-muted-foreground/20" />
              <p className="text-[10px] text-muted-foreground/40">No events recorded</p>
              <p className="text-[9px] text-muted-foreground/20">Press START RECORDING to begin</p>
              <p className="text-[9px] text-muted-foreground/20">Telemetry snapshots auto-log every 30 s</p>
            </div>
          ) : (
            visibleEvents.map((evt, i) => {
              const isPlayhead = playbackIdx !== null && i === playbackIdx;
              return (
                <div key={evt.id}
                  className={`flex items-start gap-2 px-2 py-1.5 rounded transition-all ${isPlayhead ? "bg-purple-500/15 border border-purple-500/30" : "border border-transparent hover:bg-white/2"}`}
                >
                  <span className="mt-0.5 shrink-0">{EVENT_ICONS[evt.type]}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] leading-snug" style={{ color: EVENT_COLORS[evt.type] }}>
                      {evt.message}
                    </p>
                    {evt.type === "telemetry" && evt.data && (
                      <p className="text-[8px] text-muted-foreground/40 font-mono mt-0.5">
                        {String(evt.data.battery)}% · {Number(evt.data.speed).toFixed(1)}m/s · {String(evt.data.motorTemp)}°C
                      </p>
                    )}
                    {evt.type === "photo" && evt.data && (
                      <p className="text-[8px] text-blue-400/40 font-mono mt-0.5">
                        BAT:{String(evt.data.battery)}% · SPD:{Number(evt.data.speed).toFixed(1)}m/s · {String(evt.data.direction)}
                      </p>
                    )}
                    <p className="text-[9px] text-muted-foreground/50 font-mono mt-0.5">
                      {new Date(evt.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                  {isPlayhead && <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse mt-1.5 shrink-0" />}
                </div>
              );
            })
          )}
        </div>

        {/* Footer actions */}
        <div className="px-3 py-2.5 border-t border-border bg-black/30 shrink-0 flex items-center gap-2">
          <button onClick={exportMission} disabled={events.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-purple-500/40 text-purple-400 rounded text-[10px] hover:bg-purple-500/10 disabled:opacity-30 transition-colors">
            <Download className="w-3 h-3" /> EXPORT JSON
          </button>
          <button onClick={clearAll} disabled={recording || events.length === 0}
            className="flex items-center gap-1.5 px-2 py-1.5 border border-border text-muted-foreground rounded text-[10px] hover:text-red-400 hover:border-red-500/40 disabled:opacity-30 transition-colors">
            <Trash2 className="w-3 h-3" /> CLEAR
          </button>
          <span className="ml-auto text-[9px] text-muted-foreground/40 font-mono">
            {events.filter((e) => e.type === "photo").length} 📷  {events.filter((e) => e.type === "waypoint").length} 📍  {events.filter((e) => e.type === "telemetry").length} 📊
          </span>
        </div>
      </div>
    </div>
  );
}
