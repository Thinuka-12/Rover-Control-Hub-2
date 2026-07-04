import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useGetTelemetry } from "@workspace/api-client-react";
import { Activity, Settings, Navigation, Crosshair, Map, Camera } from "lucide-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  const telemetry = useGetTelemetry({ query: { refetchInterval: 500 } as never });
  const isConnected = telemetry.data?.rover?.connected ?? false;

  const navItems = [
    { href: "/", label: "MAIN CONTROL", icon: Navigation },
    { href: "/arm", label: "ARM SYSTEM", icon: Crosshair },
    { href: "/cameras", label: "CAMERAS", icon: Camera },
    { href: "/map", label: "PATH MAP", icon: Map },
    { href: "/settings", label: "CONFIG", icon: Settings },
  ];

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
          {children}
        </div>
      </main>
    </div>
  );
}
