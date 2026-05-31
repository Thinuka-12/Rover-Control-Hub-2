import { useState, useEffect } from "react";
import { Progress } from "@/components/ui/progress";
import {
  useGetAutonomousStatus, useToggleAutonomousMode,
  useGetHomePosition, useSetHomePosition, useInitiateRth, useAbortRth,
  AutonomousToggleInputMode,
} from "@workspace/api-client-react";
import { X, Home, Navigation, Radar, Map, Eye, RotateCcw, AlertTriangle, Play, Square } from "lucide-react";

interface Props {
  onClose: () => void;
  currentPos: { x: number; y: number; headingDeg: number };
  waypoints: { id: string; label: string; x: number; y: number }[];
  canAutonom: boolean;
}

const MODES: { mode: AutonomousToggleInputMode; label: string; icon: React.ReactNode; color: string; description: string; detail: string }[] = [
  {
    mode: "exploring",
    label: "EXPLORE",
    icon: <Radar className="w-4 h-4" />,
    color: "#00e676",
    description: "Active environment mapping",
    detail: "Navigates autonomously, builds occupancy map, avoids obstacles",
  },
  {
    mode: "patrolling",
    label: "PATROL",
    icon: <Map className="w-4 h-4" />,
    color: "#ffb000",
    description: "Repeat recorded path",
    detail: "Loops the recorded path continuously with obstacle diversion",
  },
  {
    mode: "following",
    label: "FOLLOW",
    icon: <Eye className="w-4 h-4" />,
    color: "#4fc3f7",
    description: "Track a designated target",
    detail: "Vision-based target lock with proximity maintain distance",
  },
  {
    mode: "homing",
    label: "HOME",
    icon: <Home className="w-4 h-4" />,
    color: "#f06292",
    description: "Return to home position",
    detail: "Navigates back to saved home coordinates using path planning",
  },
];

export function AutonomousPanel({ onClose, currentPos, waypoints, canAutonom }: Props) {
  const autoQuery = useGetAutonomousStatus({ query: { refetchInterval: 1000 } as never });
  const homeQuery = useGetHomePosition({ query: { refetchInterval: 2000 } as never });
  const toggleAuto = useToggleAutonomousMode();
  const setHomeMut = useSetHomePosition();
  const initiateRth = useInitiateRth();
  const abortRth = useAbortRth();

  const auto = autoQuery.data;
  const home = homeQuery.data;

  const [rthProgress, setRthProgress] = useState(0);
  const [rthActive, setRthActive] = useState(false);
  const [rthEta, setRthEta] = useState<number | null>(null);
  const [missionPlan, setMissionPlan] = useState<string[]>([]);
  const [missionRunning, setMissionRunning] = useState(false);
  const [missionIdx, setMissionIdx] = useState(0);

  // Poll RTH progress from response
  useEffect(() => {
    if (!rthActive) return;
    const iv = setInterval(() => {
      fetch("/api/rover/rth/status")
        .then((r) => r.json() as Promise<{ active: boolean; progressPct: number; etaSeconds: number | null }>)
        .then((d) => {
          setRthProgress(d.progressPct);
          setRthEta(d.etaSeconds);
          if (!d.active && d.progressPct >= 99) {
            setRthActive(false);
            void toggleAuto.mutateAsync({ data: { enabled: false, mode: "homing" as AutonomousToggleInputMode } });
          }
        })
        .catch(() => { /* ignore */ });
    }, 600);
    return () => clearInterval(iv);
  }, [rthActive]);

  const setMode = (mode: AutonomousToggleInputMode) => {
    if (!canAutonom) return;
    toggleAuto.mutate({ data: { enabled: true, mode } });
  };

  const abort = () => {
    if (!canAutonom) return;
    toggleAuto.mutate({ data: { enabled: false, mode: (auto?.mode ?? "exploring") as AutonomousToggleInputMode } });
    if (rthActive) {
      abortRth.mutate(undefined as never);
      setRthActive(false); setRthProgress(0); setRthEta(null);
    }
    setMissionRunning(false); setMissionIdx(0);
  };

  const doSetHome = () => {
    if (!canAutonom) return;
    setHomeMut.mutate({ data: { x: currentPos.x, y: currentPos.y } } as never);
  };

  const doRth = () => {
    if (!canAutonom || !home?.set) return;
    initiateRth.mutate({ data: { x: currentPos.x, y: currentPos.y } } as never, {
      onSuccess: () => { setRthActive(true); setRthProgress(0); setMode("homing"); },
    });
  };

  const addToMission = (id: string) => {
    if (!missionPlan.includes(id)) setMissionPlan((p) => [...p, id]);
  };

  const removeFromMission = (id: string) => {
    setMissionPlan((p) => p.filter((i) => i !== id));
  };

  const executeMission = () => {
    if (missionPlan.length === 0 || !canAutonom) return;
    setMissionRunning(true);
    setMissionIdx(0);
    setMode("following");
  };

  const stopMission = () => {
    setMissionRunning(false);
    setMissionIdx(0);
    abort();
  };

  const isEnabled = auto?.enabled ?? false;
  const currentMode = auto?.mode ?? "idle";

  const modeColor = MODES.find((m) => m.mode === currentMode)?.color ?? "#666";

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-end bg-black/60 backdrop-blur-sm font-mono" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="h-full w-[420px] bg-[#080c10] border-l border-border flex flex-col overflow-hidden shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-black/40 shrink-0">
          <div className="flex items-center gap-2">
            <Navigation className="w-4 h-4 text-primary" />
            <span className="font-bold text-[12px] tracking-widest text-primary">AUTONOMOUS CONTROL</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* Status Banner */}
          <div className={`rounded border p-3 ${isEnabled ? "border-[color:var(--mc)] bg-[color:var(--mc)]/10" : "border-border bg-black/30"}`}
            style={{ "--mc": modeColor } as React.CSSProperties}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${isEnabled ? "animate-pulse" : ""}`} style={{ background: isEnabled ? modeColor : "#444" }} />
                <span className="text-[11px] font-bold" style={{ color: isEnabled ? modeColor : "#666" }}>
                  {isEnabled ? currentMode.toUpperCase() : "STANDBY"}
                </span>
              </div>
              {isEnabled && (
                <button onClick={abort} disabled={!canAutonom}
                  className="flex items-center gap-1 px-2 py-0.5 border border-red-500/60 bg-red-500/10 text-red-400 rounded text-[10px] font-bold hover:bg-red-500/20 disabled:opacity-40">
                  <Square className="w-2.5 h-2.5 fill-current" /> ABORT
                </button>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {isEnabled
                ? MODES.find((m) => m.mode === currentMode)?.detail ?? "Autonomous navigation active"
                : "Select a mode below to engage autonomous operations"}
            </div>
            {!canAutonom && (
              <div className="mt-2 flex items-center gap-1.5 text-[9px] text-orange-400/80">
                <AlertTriangle className="w-3 h-3" /> Pilot role required to engage autonomous mode
              </div>
            )}
          </div>

          {/* ── Mode Cards ──────────────────────────────────────────────── */}
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Navigation Mode</div>
            <div className="grid grid-cols-2 gap-2">
              {MODES.map((m) => {
                const active = isEnabled && currentMode === m.mode;
                return (
                  <button key={m.mode} onClick={() => setMode(m.mode)} disabled={!canAutonom}
                    className={`text-left p-3 rounded border transition-all disabled:opacity-40 ${active
                      ? "border-[color:var(--mc)] bg-[color:var(--mc)]/15 shadow-inner"
                      : "border-border bg-black/30 hover:border-border/80 hover:bg-white/5"}`}
                    style={{ "--mc": m.color } as React.CSSProperties}>
                    <div className="flex items-center gap-1.5 mb-1.5" style={{ color: active ? m.color : "#777" }}>
                      {m.icon}
                      <span className="text-[10px] font-bold tracking-wider">{m.label}</span>
                      {active && <span className="ml-auto w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: m.color }} />}
                    </div>
                    <div className="text-[9px] text-muted-foreground leading-tight">{m.description}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Return to Home ───────────────────────────────────────────── */}
          <div className="border border-border rounded p-3 space-y-2.5">
            <div className="flex items-center gap-2">
              <Home className="w-3.5 h-3.5 text-[#f06292]" />
              <span className="text-[10px] font-bold text-[#f06292] tracking-wider">RETURN TO HOME</span>
            </div>

            {home?.set ? (
              <div className="text-[10px] text-muted-foreground font-mono">
                HOME SET — <span className="text-primary">X:{home.x.toFixed(2)}m  Y:{home.y.toFixed(2)}m</span>
                {home.setAt && <span className="ml-2 text-muted-foreground/50">{new Date(home.setAt).toLocaleTimeString()}</span>}
              </div>
            ) : (
              <div className="text-[10px] text-muted-foreground/50">No home position set</div>
            )}

            {rthActive && (
              <div className="space-y-1">
                <div className="flex justify-between text-[9px]">
                  <span className="text-[#f06292] animate-pulse">● RETURNING TO HOME</span>
                  <span className="text-muted-foreground">{rthEta != null ? `ETA ${rthEta}s` : "—"}</span>
                </div>
                <Progress value={rthProgress} className="h-1.5" />
                <div className="text-[9px] text-right text-muted-foreground">{Math.round(rthProgress)}%</div>
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={doSetHome} disabled={!canAutonom}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 border border-border rounded text-[10px] text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-40 transition-colors">
                <Navigation className="w-3 h-3" /> SET HOME HERE
              </button>
              <button onClick={rthActive ? () => { abortRth.mutate(undefined as never); setRthActive(false); setRthProgress(0); } : doRth}
                disabled={!canAutonom || (!home?.set && !rthActive)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 border rounded text-[10px] font-bold disabled:opacity-40 transition-colors ${rthActive
                  ? "border-red-500/60 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                  : "border-[#f06292]/50 bg-[#f06292]/10 text-[#f06292] hover:bg-[#f06292]/20"}`}>
                {rthActive ? <><RotateCcw className="w-3 h-3" /> ABORT RTH</> : <><Home className="w-3 h-3" /> RETURN HOME</>}
              </button>
            </div>
          </div>

          {/* ── Mission Plan ─────────────────────────────────────────────── */}
          <div className="border border-border rounded p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Map className="w-3.5 h-3.5 text-primary" />
                <span className="text-[10px] font-bold text-primary tracking-wider">MISSION PLAN</span>
              </div>
              {missionPlan.length > 0 && (
                <span className="text-[9px] text-muted-foreground">{missionPlan.length} waypoint{missionPlan.length !== 1 ? "s" : ""}</span>
              )}
            </div>

            {/* Waypoint queue */}
            {missionPlan.length === 0 ? (
              <div className="text-[10px] text-muted-foreground/40 py-2 text-center">No waypoints queued — add from list below</div>
            ) : (
              <div className="space-y-1">
                {missionPlan.map((id, idx) => {
                  const wp = waypoints.find((w) => w.id === id);
                  if (!wp) return null;
                  const isCurrent = missionRunning && idx === missionIdx;
                  return (
                    <div key={id} className={`flex items-center gap-2 py-1 px-2 rounded text-[10px] ${isCurrent ? "bg-primary/15 border border-primary/30" : "bg-white/3"}`}>
                      <span className={`font-bold w-4 text-center ${isCurrent ? "text-primary animate-pulse" : "text-muted-foreground/50"}`}>{idx + 1}</span>
                      <span className="flex-1 truncate">{wp.label}</span>
                      <span className="text-muted-foreground/40 font-mono text-[9px]">{wp.x.toFixed(1)},{wp.y.toFixed(1)}</span>
                      {!missionRunning && (
                        <button onClick={() => removeFromMission(id)} className="text-muted-foreground/40 hover:text-red-400">
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add waypoints */}
            {!missionRunning && waypoints.length > 0 && (
              <div className="space-y-1">
                <div className="text-[9px] text-muted-foreground/60 uppercase tracking-wider">Available waypoints</div>
                <div className="space-y-0.5 max-h-28 overflow-y-auto">
                  {waypoints.filter((w) => !missionPlan.includes(w.id)).map((w) => (
                    <button key={w.id} onClick={() => addToMission(w.id)}
                      className="w-full flex items-center gap-2 py-1 px-2 rounded text-[10px] bg-white/3 hover:bg-white/8 border border-transparent hover:border-primary/20 text-left transition-colors">
                      <span className="text-cyan-400/60">+</span>
                      <span className="flex-1 truncate text-muted-foreground">{w.label}</span>
                      <span className="text-muted-foreground/30 font-mono text-[9px]">{w.x.toFixed(1)},{w.y.toFixed(1)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Execute / Stop mission */}
            {missionPlan.length > 0 && (
              <button onClick={missionRunning ? stopMission : executeMission} disabled={!canAutonom}
                className={`w-full flex items-center justify-center gap-2 py-2 border rounded text-[10px] font-bold disabled:opacity-40 transition-colors ${missionRunning
                  ? "border-red-500/60 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                  : "border-primary/50 bg-primary/10 text-primary hover:bg-primary/20"}`}>
                {missionRunning ? <><Square className="w-3 h-3 fill-current" /> ABORT MISSION</> : <><Play className="w-3 h-3 fill-current" /> EXECUTE MISSION</>}
              </button>
            )}
          </div>

          {/* ── System Settings ───────────────────────────────────────────── */}
          <div className="border border-border rounded p-3 space-y-2">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">System Settings</div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">Obstacle avoidance</span>
              <span className={`text-[10px] font-bold ${auto?.obstacleAvoidance ? "text-[#00e676]" : "text-red-400"}`}>
                {auto?.obstacleAvoidance ? "ENABLED" : "DISABLED"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">Path planning</span>
              <span className={`text-[10px] font-bold ${auto?.pathPlanning ? "text-[#00e676]" : "text-red-400"}`}>
                {auto?.pathPlanning ? "ENABLED" : "DISABLED"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
