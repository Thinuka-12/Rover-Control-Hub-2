import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useGetTelemetry } from "@workspace/api-client-react";
import { Activity, Camera, Settings, Cpu, Map, Navigation, Crosshair } from "lucide-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  // Force dark mode
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  const telemetry = useGetTelemetry({ query: { refetchInterval: 500 } as never });
  const isConnected = telemetry.data?.rover?.connected ?? false;

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden font-mono text-xs sm:text-sm">
      {/* Sidebar */}
      <div className="w-16 sm:w-48 border-r border-border bg-sidebar flex flex-col items-center sm:items-start shrink-0">
        <div className="p-4 border-b border-border w-full flex items-center justify-center sm:justify-start gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <span className="font-bold text-primary hidden sm:inline uppercase tracking-widest">ROVER-CMD</span>
        </div>
        
        <nav className="flex-1 w-full flex flex-col gap-2 p-2">
          <Link href="/">
            <div className={`p-3 rounded flex items-center justify-center sm:justify-start gap-3 cursor-pointer transition-colors ${location === '/' ? 'bg-primary/20 text-primary border border-primary/50' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'}`}>
              <Navigation className="h-5 w-5" />
              <span className="hidden sm:inline">MAIN CONTROL</span>
            </div>
          </Link>
          <Link href="/arm">
            <div className={`p-3 rounded flex items-center justify-center sm:justify-start gap-3 cursor-pointer transition-colors ${location === '/arm' ? 'bg-primary/20 text-primary border border-primary/50' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'}`}>
              <Crosshair className="h-5 w-5" />
              <span className="hidden sm:inline">ARM SYSTEM</span>
            </div>
          </Link>
          <Link href="/settings">
            <div className={`p-3 rounded flex items-center justify-center sm:justify-start gap-3 cursor-pointer transition-colors ${location === '/settings' ? 'bg-primary/20 text-primary border border-primary/50' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'}`}>
              <Settings className="h-5 w-5" />
              <span className="hidden sm:inline">CONFIGURATION</span>
            </div>
          </Link>
        </nav>

        <div className="p-4 border-t border-border w-full flex flex-col items-center sm:items-start gap-2">
          <div className="flex items-center justify-center sm:justify-start gap-2 w-full">
            <div className={`h-3 w-3 rounded-full ${isConnected ? 'bg-secondary animate-pulse' : 'bg-destructive'}`} />
            <span className="hidden sm:inline text-xs text-muted-foreground uppercase">{isConnected ? 'UPLINK OK' : 'NO SIGNAL'}</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-auto bg-[url('/noise.png')] bg-repeat opacity-95 relative">
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-transparent to-background/50 z-0" />
        <div className="p-4 sm:p-6 w-full max-w-[1600px] mx-auto z-10 relative flex flex-col gap-6">
          {children}
        </div>
      </main>
    </div>
  );
}
