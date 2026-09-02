import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useGetTelemetry } from "@workspace/api-client-react";
import { Activity, Settings, Navigation, Crosshair, Map, Camera, Shield, Cpu, ChevronDown } from "lucide-react";
import { useOperatorRole } from "@/hooks/use-operator-role";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  const telemetry = useGetTelemetry({ query: { refetchInterval: 500 } as never });
  const isConnected = telemetry.data?.rover?.connected ?? false;
  const { operator, hasRole, assignRole, canArm, canConfigure, canViewCameras, canViewMap, currentMeta } = useOperatorRole();
  const [showRoleMenu, setShowRoleMenu] = useState(false);

  const roleOptions = [
    { role: "pilot" as const, label: "PILOT", description: "Drive, clean C50, VR & autonomous", color: "#00e676", Icon: Shield },
    { role: "co-pilot" as const, label: "AI CO-PILOT", description: "AI, GNSS, map & replay", color: "#ffb000", Icon: Cpu },
    { role: "arm-operator" as const, label: "ARM OPERATOR", description: "Dedicated arm control & A9 camera", color: "#00d9ff", Icon: Crosshair },
  ];

  const navItems = [
    { href: "/", label: "MAIN CONTROL", icon: Navigation },
    { href: "/arm", label: "ARM SYSTEM", icon: Crosshair, visible: hasRole && canArm },
    { href: "/arm-operator", label: "ARM CONTROL", icon: Crosshair, visible: hasRole && canArm },
    { href: "/cameras", label: "CAMERAS", icon: Camera, visible: hasRole && canViewCameras },
    { href: "/map", label: "PATH MAP", icon: Map, visible: hasRole && canViewMap },
    { href: "/settings", label: "CONFIG", icon: Settings, visible: hasRole && canConfigure },
    { href: "/diagnostics", label: "DIAGNOSTICS", icon: Activity, visible: hasRole },
  ].filter((item) => item.visible !== false);

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden font-mono text-xs sm:text-sm">
      {/* Sidebar */}
      <div className="w-16 sm:w-52 border-r border-border bg-sidebar flex flex-col items-center sm:items-start shrink-0">
        <div className="p-4 border-b border-border w-full flex items-center justify-center sm:justify-start gap-2 min-h-[56px]">
          <Activity className="h-5 w-5 text-primary shrink-0" />
          <span className="font-bold text-primary hidden sm:inline uppercase tracking-widest text-sm">ROVER-CMD</span>
        </div>

        <nav className="flex-1 w-full flex flex-col gap-1 p-2">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href}>
              <div className={`min-h-[52px] px-2 sm:px-3 rounded flex items-center justify-center sm:justify-start gap-3 cursor-pointer transition-colors ${location === href ? "bg-primary/20 text-primary border border-primary/50" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`}>
                <Icon className="h-5 w-5 shrink-0" />
                <span className="hidden sm:inline text-sm font-semibold tracking-wider">{label}</span>
              </div>
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-border w-full flex flex-col items-center sm:items-start gap-2 min-h-[56px] justify-center">
          <div className="flex items-center justify-center sm:justify-start gap-2 w-full">
            <div className={`h-3 w-3 rounded-full shrink-0 ${isConnected ? "bg-secondary animate-pulse" : "bg-destructive"}`} />
            <span className="hidden sm:inline text-xs text-muted-foreground uppercase">
              {isConnected ? "UPLINK OK" : "NO SIGNAL"}
            </span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-auto relative">
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-transparent to-background/30 z-0" />
        <div className="p-4 sm:p-6 w-full max-w-[1600px] mx-auto z-10 relative flex flex-col gap-4">
          {hasRole && (
            <div className="flex justify-end">
              <div className="relative">
                <button
                  onClick={() => setShowRoleMenu((open) => !open)}
                  className="flex items-center gap-2 px-3 py-2 border rounded text-xs font-bold tracking-wider transition-colors hover:border-primary/50"
                  style={{ borderColor: `${currentMeta.color}50`, color: currentMeta.color }}
                  title="Switch operator mode"
                >
                  <Shield className="w-3.5 h-3.5" />
                  MODE: {currentMeta.label}
                  <ChevronDown className="w-3 h-3 text-muted-foreground" />
                </button>

                {showRoleMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowRoleMenu(false)} />
                    <div className="absolute right-0 top-full mt-1 z-50 w-64 bg-black/95 border border-border rounded-lg shadow-2xl overflow-hidden font-mono backdrop-blur-md">
                      <div className="px-3 py-2 border-b border-border text-[10px] text-muted-foreground/60 tracking-widest uppercase">
                        Switch Operator Mode
                      </div>
                      {roleOptions.map(({ role, label, description, color, Icon }) => {
                        const active = operator?.role === role;
                        return (
                          <button
                            key={role}
                            onClick={() => {
                              assignRole(role, operator?.name ?? "");
                              setShowRoleMenu(false);
                            }}
                            className="w-full flex items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-white/5"
                            style={{ background: active ? `${color}12` : undefined }}
                          >
                            <Icon className="w-4 h-4 shrink-0" style={{ color }} />
                            <span className="flex-1 min-w-0">
                              <span className="block text-xs font-bold tracking-wider" style={{ color }}>{label}</span>
                              <span className="block text-[10px] text-muted-foreground/70 mt-0.5">{description}</span>
                            </span>
                            {active && <span className="text-[9px] font-bold" style={{ color }}>ACTIVE</span>}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}
