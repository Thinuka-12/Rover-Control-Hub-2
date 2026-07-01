import { useState, useEffect } from "react";
import { Progress } from "@/components/ui/progress";
import {
  useGetAutonomousStatus, useToggleAutonomousMode, useAbortRth,
  AutonomousToggleInputMode, type HomeState,
} from "@workspace/api-client-react";
import { X, Home, Navigation, Radar, Map, Eye, RotateCcw, AlertTriangle, Play, Square, Search, Grid } from "lucide-react";

interface Props {
  onClose: () => void;
  currentPos: { x: number; y: number; headingDeg: number };
  waypoints: { id: string; label: string; x: number; y: number }[];
  canAutonom: boolean;
  homeData: HomeState | null;
  onHomeRefresh: () => void;
}

/** Modes backed by a real API toggle (sent to rover firmware). */
const API_MODES = ["exploring", "patrolling", "following", "homing"] as const;
type ApiMode = (typeof API_MODES)[number];

/** Modes that are UI-only simulations — never sent to the rover. */
const SIM_MODES = ["artifact_search", "area_scan"] as const;
type SimMode = (typeof SIM_MODES)[number];

const MODES: {
  mode: ApiMode | SimMode;
  label: string;
  simOnly?: boolean;
  icon: React.ReactNode;
  color: string;
  description: string;
  detail: string;
}[] = [
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
    detail: "Vision-based target lock maintaining set distance",
  },
  {
    mode: "homing",
    label: "HOME",
    icon: <Home className="w-4 h-4" />,
    color: "#f06292",
    description: "Return to home position",
    detail: "Navigates back to saved home coordinates using path planning",
  },
  {
    mode: "artifact_search",
    simOnly: true,
    label: "ARTIFACT SCAN",
    icon: <Search className="w-4 h-4" />,
    color: "#00f5ff",
    description: "Simulated spiral search pattern",
    detail: "UI simulation: outward spiral scan with AI vision active — marks artifact positions on map (requires firmware upgrade for hardware support)",
  },
  {
    mode: "area_scan",
    simOnly: true,
    label: "AREA SCAN",
    icon: <Grid className="w-4 h-4" />,
    color: "#cc44ff",
    description: "Simulated systematic coverage",
    detail: "UI simulation: lawnmower grid pattern over defined region (requires firmware upgrade for hardware support)",
  },
];

export function AutonomousPanel({ onClose, currentPos, waypoints, canAutonom, homeData, onHomeRefresh }: Props) {
  const autoQuery = useGetAutonomousStatus({ query: { refetchInterval: 1000 } as never });
  const toggleAuto = useToggleAutonomousMode();
  const abortRthMut = useAbortRth();

  const isEnabled = autoQuery.data?.enabled ?? false;
  const currentMode = autoQuery.data?.mode ?? "idle";

  // Local simulation state for UI-only modes (not sent to rover API)
  const [simMode, setSimMode] = useState<SimMode | null>(null);
  const [simProgress, setScanProgress] = useState(0);

  // Simulate scan progress for sim modes
  useEffect(() => {
    if (!simMode) { setScanProgress(0); return; }
    setScanProgress(0);
    const iv = setInterval(() => setScanProgress((p) => p >= 100 ? 0 : p + 0.4), 200);
    return () => clearInterval(iv);
  }, [simMode]);

  // Find which mode is visually "active" for highlighting
  const activeApiMode = isEnabled ? currentMode : null;
  const activeSimMode = simMode;

  const setMode = (modeId: ApiMode | SimMode) => {
    if (!canAutonom) return;
    const def = MODES.find((m) => m.mode === modeId);
    if (!def) return;

    if (def.simOnly) {
      // Sim-only: disable any real API mode first, then activate sim mode
      if (isEnabled) {
        toggleAuto.mutate({ data: { enabled: false } });
      }
      setSimMode((prev) => (prev === modeId ? null : (modeId as SimMode)));
      return;
    }

    // Real API mode: clear any sim mode
    setSimMode(null);
    toggleAuto.mutate({ data: { enabled: !isEnabled || currentMode !== modeId, mode: modeId as AutonomousToggleInputMode } });
  };

  const stopAll = () => {
    setSimMode(null);
    setScanProgress(0);
    if (isEnabled) {
      toggleAuto.mutate({ data: { enabled: false } });
    }
  };

  const abortRth = () => {
    setSimMode(null);
    abortRthMut.mutate(undefined as never);
  };

  const isModeActive = (modeId: ApiMode | SimMode) => {
    const def = MODES.find((m) => m.mode === modeId);
    if (def?.simOnly) return activeSimMode === modeId;
    return activeApiMode === modeId;
  };

  const anyActive = isEnabled || !!simMode;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-end bg-black/60 backdrop-blur-sm font-mono"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="h-full w-[380px] bg-[#06090d] border-l border-primary/20 flex flex-col overflow-hidden shadow-2xl"
        style={{ boxShadow: "0 0 40px rgba(0,245,255,0.06) inset" }}>

        {/* Header */}
        <div className="flex px-4 py-3 border-b border-primary/20 shrink-0 justify-between items-start flex-row text-center bg-[color:var(--color-red-50)]">
          <div className="flex items-center gap-2">
            <Navigation className="w-4 h-4 text-primary" />
            <span className="font-bold text-[12px] tracking-widest text-primary">AUTONOMOUS MODE</span>
          </div>
          <div className="flex items-center gap-2">
            {anyActive && (
              <button
                onClick={stopAll}
                className="flex items-center gap-1 px-2 py-0.5 border border-red-500/50 bg-red-500/10 text-red-400 rounded text-[10px] hover:bg-red-500/20 transition-colors"
              >
                <Square className="w-3 h-3 fill-current" /> STOP ALL
              </button>
            )}
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
          </div>
        </div>

        {/* Operator gate */}
        {!canAutonom && (
          <div className="px-4 py-3 border-b border-orange-500/20 bg-orange-500/5 shrink-0 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
            <span className="text-[10px] text-orange-300">Autonomous control requires Pilot role. Current operator does not have this permission.</span>
          </div>
        )}

        {/* Route planning status indicator */}
        <div className="px-4 py-2 border-b border-border shrink-0 bg-[color:var(--color-red-50)]">
          <div className="flex items-center justify-between gap-3 text-[9px] font-mono">
            {/* Planning phase */}
            {(() => {
              const planPhase: "PLANNING" | "EXECUTING" | "IDLE" =
                !isEnabled && !simMode ? "IDLE"
                : autoQuery.data?.pathPlanning && isEnabled ? "PLANNING"
                : "EXECUTING";
              const phaseColor = planPhase === "PLANNING" ? "#ffb000" : planPhase === "EXECUTING" ? "#00e676" : "#555";
              return (
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground/50 uppercase tracking-wider">Route</span>
                  <div className="flex items-center gap-1 px-1.5 py-0.5 border rounded"
                    style={{ borderColor: `${phaseColor}40`, background: `${phaseColor}0d` }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: phaseColor, boxShadow: planPhase !== "IDLE" ? `0 0 6px ${phaseColor}` : "none", animation: planPhase === "PLANNING" ? "pulse 1s infinite" : "none" }} />
                    <span style={{ color: phaseColor }}>{planPhase}</span>
                  </div>
                </div>
              );
            })()}
            {/* Obstacle avoidance */}
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground/50 uppercase tracking-wider">Obstacles</span>
              <span className={autoQuery.data?.obstacleAvoidance ? "text-green-400" : "text-muted-foreground/40"}>
                {autoQuery.data?.obstacleAvoidance ? "● AVOIDANCE ON" : "○ OFF"}
              </span>
            </div>
            {/* Path planning flag */}
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground/50">Path</span>
              <span className={autoQuery.data?.pathPlanning ? "text-cyan-400" : "text-muted-foreground/40"}>
                {autoQuery.data?.pathPlanning ? "PLANNING" : "DIRECT"}
              </span>
            </div>
          </div>
        </div>

        {/* Sim mode warning banner */}
        {simMode && (
          <div className="px-4 py-2 border-b bg-blue-500/8 border-blue-500/20 shrink-0 flex items-start gap-2 text-[10px]">
            <AlertTriangle className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
            <span className="text-blue-300">
              <span className="font-bold text-blue-400">SIMULATION MODE</span> — this pattern runs in the UI only. No commands are sent to the rover. Requires firmware upgrade for hardware support.
            </span>
          </div>
        )}

        {/* Scroll region */}
        <div className="flex-1 overflow-y-auto bg-[color:var(--color-gray-50)]">

          {/* Mode cards */}
          <div className="p-4 space-y-2 bg-[color:var(--color-gray-50)]">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3">Select Mode</div>

            {MODES.map((m) => {
              const active = isModeActive(m.mode);
              return (
                <button
                  key={m.mode}
                  disabled={!canAutonom}
                  onClick={() => setMode(m.mode)}
                  className={`w-full text-left p-3 rounded border transition-all relative ${
                    active
                      ? "border-[color:var(--mc)]/60 bg-[color:var(--mc)]/10"
                      : "border-border hover:border-[color:var(--mc)]/30 hover:bg-[color:var(--mc)]/5"
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                  style={{ "--mc": m.color } as React.CSSProperties}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span style={{ color: active ? m.color : "var(--muted-foreground)" }}>{m.icon}</span>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-bold" style={{ color: active ? m.color : "var(--foreground)" }}>{m.label}</span>
                          {m.simOnly && (
                            <span className="text-[8px] font-bold px-1 border rounded" style={{ color: m.color, borderColor: `${m.color}40` }}>SIM</span>
                          )}
                        </div>
                        <span className="text-[9px] text-muted-foreground">{m.description}</span>
                      </div>
                    </div>
                    {active && (
                      <div className="flex items-center gap-1 shrink-0">
                        <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: m.color }} />
                        <span className="text-[9px] font-bold" style={{ color: m.color }}>ACTIVE</span>
                      </div>
                    )}
                  </div>
                  {active && (
                    <p className="text-[9px] text-muted-foreground mt-1.5 leading-relaxed">{m.detail}</p>
                  )}
                </button>
              );
            })}
          </div>

          {/* Sim scan progress */}
          {simMode && (
            <div className="mx-4 mb-4 border rounded p-3 space-y-2 bg-[color:var(--sc)]/5"
              style={{ "--sc": simMode === "artifact_search" ? "#00f5ff" : "#cc44ff", borderColor: `${simMode === "artifact_search" ? "#00f5ff" : "#cc44ff"}30` } as React.CSSProperties}>
              <div className="flex justify-between text-[10px]">
                <span style={{ color: simMode === "artifact_search" ? "#00f5ff" : "#cc44ff" }}>
                  {simMode === "artifact_search" ? "● SCANNING FOR ARTIFACTS [SIM]" : "● AREA SCAN IN PROGRESS [SIM]"}
                </span>
                <span className="text-muted-foreground">{Math.round(Math.min(simProgress, 100))}%</span>
              </div>
              <Progress value={Math.min(simProgress, 100)} className="h-1.5" />
              <div className="text-[9px] text-muted-foreground">
                {simMode === "artifact_search"
                  ? "Simulated spiral search — connect AI detection panel to see markers"
                  : `Simulated grid row ${Math.ceil(simProgress / 10)} of 10 — systematic coverage`}
              </div>
            </div>
          )}

          {/* RTH controls */}
          {(currentMode === "homing" && isEnabled) && (
            <div className="mx-4 mb-4 flex items-center gap-2 p-3 border border-pink-500/20 bg-pink-500/5 rounded">
              <Home className="w-3.5 h-3.5 text-pink-400 shrink-0" />
              <span className="text-[10px] text-pink-300 flex-1">Homing in progress — returning to saved home</span>
              <button
                onClick={abortRth}
                className="shrink-0 flex items-center gap-1 px-2 py-0.5 border border-pink-500/40 text-pink-400 rounded text-[9px] hover:bg-pink-500/15 transition-colors"
              >
                <RotateCcw className="w-2.5 h-2.5" /> ABORT
              </button>
            </div>
          )}

          {/* Home position section */}
          <div className="px-4 pb-4 space-y-2 bg-[color:var(--color-gray-50)]">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Home Position</div>
            {homeData ? (
              <div className="border border-border rounded p-3 text-[10px] space-y-1 bg-black/20">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">X</span>
                  <span className="font-mono text-foreground">{homeData.x.toFixed(3)} m</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Y</span>
                  <span className="font-mono text-foreground">{homeData.y.toFixed(3)} m</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Set at</span>
                  <span className="font-mono text-muted-foreground">
                    {homeData.setAt ? new Date(homeData.setAt).toLocaleTimeString() : "—"}
                  </span>
                </div>
              </div>
            ) : (
              <div className="border border-dashed border-border rounded p-3 text-center">
                <p className="text-[10px] text-muted-foreground">No home position set</p>
                <p className="text-[9px] text-muted-foreground/40 mt-0.5">Use the main dashboard to set home</p>
              </div>
            )}
            <button
              onClick={onHomeRefresh}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors"
            >
              <RotateCcw className="w-3 h-3" /> Refresh
            </button>
          </div>

          {/* Waypoints */}
          <div className="px-4 pb-4 space-y-2 bg-[color:var(--color-gray-50)]">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Waypoints <span className="text-primary">{waypoints.length}</span>
            </div>
            {waypoints.length === 0 ? (
              <p className="text-[9px] text-muted-foreground/40">No waypoints saved — add them on the map</p>
            ) : (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {waypoints.map((wp) => (
                  <div key={wp.id} className="flex items-center gap-2 py-1 px-2 border border-border rounded text-[10px]">
                    <Navigation className="w-2.5 h-2.5 text-primary/60 shrink-0" />
                    <span className="flex-1 truncate text-foreground">{wp.label}</span>
                    <span className="font-mono text-muted-foreground">{wp.x.toFixed(1)}, {wp.y.toFixed(1)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Current position */}
          <div className="mx-4 mb-4 border border-border rounded p-3 bg-black/20">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Rover Position</div>
            <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
              <div><div className="text-muted-foreground">X</div><div className="font-mono text-primary">{currentPos.x.toFixed(2)}</div></div>
              <div><div className="text-muted-foreground">Y</div><div className="font-mono text-primary">{currentPos.y.toFixed(2)}</div></div>
              <div><div className="text-muted-foreground">HDG</div><div className="font-mono text-primary">{Math.round(currentPos.headingDeg)}°</div></div>
            </div>
          </div>

        </div>

        {/* Status footer */}
        <div className="px-4 py-2.5 border-t border-border bg-black/30 shrink-0 flex items-center gap-2 text-[10px] font-mono">
          <div className={`w-2 h-2 rounded-full ${anyActive ? "animate-pulse bg-primary" : "bg-muted-foreground/30"}`} />
          <span className={anyActive ? "text-primary" : "text-muted-foreground"}>
            {simMode
              ? `SIM: ${MODES.find((m) => m.mode === simMode)?.label}`
              : isEnabled
                ? `API: ${currentMode.toUpperCase()}`
                : "STANDBY"
            }
          </span>
          {isEnabled && !simMode && <span className="ml-auto text-muted-foreground/40 text-[9px]">Obstacle avoidance: {autoQuery.data?.obstacleAvoidance ? "ON" : "OFF"}</span>}
          {simMode && <span className="ml-auto text-blue-400/60 text-[9px]">SIMULATION — no rover commands sent</span>}
        </div>
      </div>
    </div>
  );
}
