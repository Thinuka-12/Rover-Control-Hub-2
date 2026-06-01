import { useState } from "react";
import { type OperatorRole, type OperatorMeta } from "@/hooks/use-operator-role";
import { Shield, Eye, Cpu } from "lucide-react";

const ROLES: { role: OperatorRole; icon: React.ReactNode; meta: OperatorMeta; badge: string; perms: string[] }[] = [
  {
    role: "pilot",
    icon: <Shield className="w-5 h-5" />,
    meta: { label: "PILOT", color: "#00e676", description: "Primary operator with full command authority" },
    badge: "border-[#00e676]/60 bg-[#00e676]/10",
    perms: ["Drive control", "Arm manipulation", "Autonomous mode", "Configuration"],
  },
  {
    role: "co-pilot",
    icon: <Cpu className="w-5 h-5" />,
    meta: { label: "CO-PILOT", color: "#ffb000", description: "Secondary operator with drive-only authority" },
    badge: "border-[#ffb000]/60 bg-[#ffb000]/10",
    perms: ["Drive control", "Sensor monitoring", "Path recording"],
  },
  {
    role: "observer",
    icon: <Eye className="w-5 h-5" />,
    meta: { label: "OBSERVER", color: "#888", description: "Read-only live telemetry and camera access" },
    badge: "border-border bg-muted/20",
    perms: ["Live feed", "Sensor read", "Map view"],
  },
];

interface Props {
  onConfirm: (role: OperatorRole, name: string) => void;
}

export function OperatorSelector({ onConfirm }: Props) {
  const [selected, setSelected] = useState<OperatorRole>("pilot");
  const [name, setName] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm font-mono">
      <div className="w-[480px] border border-border rounded-lg bg-background shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-black/40">
          <Shield className="w-5 h-5 text-primary" />
          <div>
            <div className="font-bold text-sm tracking-widest text-primary">OPERATOR IDENTIFICATION</div>
            <div className="text-[10px] text-muted-foreground">Select your role before accessing mission control</div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div className="space-y-1.5">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Operator Callsign</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onConfirm(selected, name); }}
              placeholder="e.g. ALPHA-1, Commander, Dr. Chen…"
              className="w-full h-8 bg-black/60 border border-border rounded px-3 text-[12px] font-mono focus:outline-none focus:border-primary transition-colors placeholder:text-muted-foreground/40"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Role Assignment</label>
            <div className="space-y-2">
              {ROLES.map((r) => {
                const active = selected === r.role;
                return (
                  <button key={r.role} onClick={() => setSelected(r.role)}
                    className={`w-full text-left border rounded-md p-3 transition-all ${active ? r.badge : "border-border bg-black/20 hover:border-border/80"}`}>
                    <div className="flex items-start gap-3">
                      <span style={{ color: active ? r.meta.color : "#555" }} className="mt-0.5 shrink-0">{r.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[11px] font-bold" style={{ color: active ? r.meta.color : "#888" }}>{r.meta.label}</span>
                          {active && <span className="text-[8px] px-1.5 py-0.5 border rounded" style={{ borderColor: r.meta.color + "60", color: r.meta.color }}>SELECTED</span>}
                        </div>
                        <div className="text-[10px] text-muted-foreground mb-1.5">{r.meta.description}</div>
                        <div className="flex flex-wrap gap-1">
                          {r.perms.map((p) => (
                            <span key={p} className="text-[9px] px-1.5 py-0.5 bg-white/5 border border-white/10 rounded text-muted-foreground">{p}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <button onClick={() => onConfirm(selected, name)}
            className="w-full h-9 bg-primary/20 hover:bg-primary/30 border border-primary/50 text-primary font-bold text-[12px] tracking-wider rounded transition-colors">
            CONFIRM &amp; ENTER MISSION CONTROL
          </button>
        </div>
      </div>
    </div>
  );
}
