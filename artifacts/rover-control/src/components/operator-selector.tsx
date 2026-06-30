import { type OperatorRole } from "@/hooks/use-operator-role";
import { Shield, Eye, Cpu } from "lucide-react";

interface RoleConfig {
  role: OperatorRole;
  icon: React.ReactNode;
  label: string;
  color: string;
  glowColor: string;
  description: string;
  perms: string[];
}

const ROLES: RoleConfig[] = [
  {
    role: "pilot",
    icon: <Shield className="w-7 h-7" />,
    label: "PILOT",
    color: "#00e676",
    glowColor: "rgba(0,230,118,0.15)",
    description: "Full command authority",
    perms: ["Drive", "Arm", "Autonomous", "Config"],
  },
  {
    role: "co-pilot",
    icon: <Cpu className="w-7 h-7" />,
    label: "CO-PILOT",
    color: "#ffb000",
    glowColor: "rgba(255,176,0,0.15)",
    description: "Drive & sensor monitoring",
    perms: ["Drive", "Sensors", "Map"],
  },
  {
    role: "observer",
    icon: <Eye className="w-7 h-7" />,
    label: "OBSERVER",
    color: "#888888",
    glowColor: "rgba(136,136,136,0.12)",
    description: "Read-only live feed",
    perms: ["Camera", "Telemetry", "Map"],
  },
];

interface Props {
  onConfirm: (role: OperatorRole, name: string) => void;
}

export function OperatorSelector({ onConfirm }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95 backdrop-blur-md font-mono">

      {/* Scan-line texture */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: "repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.08) 2px,rgba(0,0,0,0.08) 4px)" }} />

      {/* Corner brackets */}
      <div className="absolute top-6 left-6 w-12 h-12 border-t-2 border-l-2 border-primary/30" />
      <div className="absolute top-6 right-6 w-12 h-12 border-t-2 border-r-2 border-primary/30" />
      <div className="absolute bottom-6 left-6 w-12 h-12 border-b-2 border-l-2 border-primary/30" />
      <div className="absolute bottom-6 right-6 w-12 h-12 border-b-2 border-r-2 border-primary/30" />

      <div className="relative z-10 flex flex-col items-center gap-10 w-full max-w-2xl px-6">

        {/* Header */}
        <div className="text-center space-y-1">
          <div className="text-[10px] tracking-[0.4em] text-primary/60 uppercase mb-3">Tec-code // Rover Control</div>
          <h1 className="text-2xl font-bold tracking-[0.2em] text-foreground uppercase">
            Select Your Role
          </h1>
          <p className="text-[11px] text-muted-foreground tracking-widest">Choose an operator role to enter mission control</p>
        </div>

        {/* Role cards */}
        <div className="grid grid-cols-3 gap-4 w-full">
          {ROLES.map((r) => (
            <button
              key={r.role}
              onClick={() => onConfirm(r.role, "")}
              className="group relative flex flex-col items-center gap-4 py-8 px-4 border rounded-lg transition-all duration-200 hover:scale-[1.03] active:scale-[0.98] focus:outline-none"
              style={{
                borderColor: `${r.color}30`,
                background: "rgba(0,0,0,0.6)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = `${r.color}90`;
                (e.currentTarget as HTMLButtonElement).style.background = r.glowColor;
                (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 0 32px ${r.color}20, inset 0 0 24px ${r.color}08`;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = `${r.color}30`;
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,0,0,0.6)";
                (e.currentTarget as HTMLButtonElement).style.boxShadow = "";
              }}
            >
              {/* Icon */}
              <div className="transition-transform duration-200 group-hover:scale-110"
                style={{ color: r.color, filter: `drop-shadow(0 0 8px ${r.color}60)` }}>
                {r.icon}
              </div>

              {/* Label */}
              <div className="space-y-1.5 text-center">
                <div className="text-[13px] font-bold tracking-[0.2em]" style={{ color: r.color }}>
                  {r.label}
                </div>
                <div className="text-[10px] text-muted-foreground leading-relaxed">
                  {r.description}
                </div>
              </div>

              {/* Permission tags */}
              <div className="flex flex-wrap justify-center gap-1">
                {r.perms.map((p) => (
                  <span key={p}
                    className="text-[8px] px-1.5 py-0.5 rounded border tracking-wide"
                    style={{ borderColor: `${r.color}25`, color: `${r.color}80`, background: `${r.color}08` }}>
                    {p}
                  </span>
                ))}
              </div>

              {/* Bottom enter hint */}
              <div className="text-[9px] tracking-widest transition-opacity duration-200 opacity-0 group-hover:opacity-100"
                style={{ color: r.color }}>
                ENTER →
              </div>
            </button>
          ))}
        </div>

        <p className="text-[9px] text-muted-foreground/40 tracking-widest">
          Role persists in this browser — switch anytime from the dashboard header
        </p>
      </div>
    </div>
  );
}
