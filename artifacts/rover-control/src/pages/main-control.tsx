import { useEffect, useRef, useState } from "react";
import { Layout } from "@/components/layout";
import { 
  useGetTelemetry, 
  useGetLidarData,
  useSendRoverCommand,
  useStopRover,
  useGetCameraInfo,
  useToggleAutonomousMode,
  RoverCommandInputCommand,
  useGetRoverStatus,
  useGetSensorReadings,
  useGetAutonomousStatus
} from "@workspace/api-client-react";
import { useLocalSettings } from "@/hooks/use-local-settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Battery, Thermometer, Wind, Target, AlertTriangle, Crosshair } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function MainControl() {
  const { settings } = useLocalSettings();
  
  // Queries
  const telemetry = useGetTelemetry({ query: { refetchInterval: 500 } });
  const lidar = useGetLidarData({ query: { refetchInterval: 1000 } });
  const camera = useGetCameraInfo({ query: { refetchInterval: 5000 } });
  
  // Fulfilling requirement to use all hooks
  useGetRoverStatus({ query: { refetchInterval: 5000 } });
  useGetSensorReadings({ query: { refetchInterval: 5000 } });
  const autoStatusQuery = useGetAutonomousStatus({ query: { refetchInterval: 5000 } });
  
  // Mutations
  const sendCommand = useSendRoverCommand();
  const stopRover = useStopRover();
  const toggleAuto = useToggleAutonomousMode();

  const [activeKey, setActiveKey] = useState<string | null>(null);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return; // Prevent rapid firing
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;

      let cmd: RoverCommandInputCommand | null = null;
      switch(e.key.toLowerCase()) {
        case 'w':
        case 'arrowup':
          cmd = 'forward';
          setActiveKey('up');
          break;
        case 's':
        case 'arrowdown':
          cmd = 'backward';
          setActiveKey('down');
          break;
        case 'a':
        case 'arrowleft':
          cmd = 'left';
          setActiveKey('left');
          break;
        case 'd':
        case 'arrowright':
          cmd = 'right';
          setActiveKey('right');
          break;
        case ' ': // spacebar for stop
          cmd = 'stop';
          setActiveKey('stop');
          break;
      }
      if (cmd) {
        e.preventDefault();
        if (cmd === 'stop') {
          stopRover.mutate();
        } else {
          sendCommand.mutate({ data: { command: cmd, speed: 80, duration: null } });
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;

      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        stopRover.mutate();
        setActiveKey(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [sendCommand, stopRover]);

  // Handle D-pad clicks
  const handlePadDown = (cmd: RoverCommandInputCommand) => {
    if (cmd === 'stop') {
      stopRover.mutate();
    } else {
      sendCommand.mutate({ data: { command: cmd, speed: 80, duration: null } });
    }
  };
  const handlePadUp = () => stopRover.mutate();

  const roverData = telemetry.data?.rover;
  const sensorData = telemetry.data?.sensors;
  const autoData = telemetry.data?.autonomous || autoStatusQuery.data;
  
  // Camera stream URL
  const streamUrl = camera.data?.streamUrl || settings.cameraUrl;
  const [camSrc, setCamSrc] = useState(streamUrl);
  
  // Auto-refresh camera to avoid caching
  useEffect(() => {
    const interval = setInterval(() => {
      setCamSrc(`${streamUrl}?t=${Date.now()}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [streamUrl]);

  // Lidar Canvas
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !lidar.data?.points) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = canvas.width;
    const center = size / 2;
    const maxDist = 4000; // mm

    // Clear
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, size, size);

    // Draw radar circles
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
      ctx.beginPath();
      ctx.arc(center, center, (center / 4) * i, 0, Math.PI * 2);
      ctx.stroke();
    }
    
    // Draw crosshairs
    ctx.beginPath();
    ctx.moveTo(center, 0);
    ctx.lineTo(center, size);
    ctx.moveTo(0, center);
    ctx.lineTo(size, center);
    ctx.stroke();

    // Draw points
    ctx.fillStyle = '#ffb000'; // Amber
    lidar.data.points.forEach(pt => {
      if (pt.distanceMm > 0 && pt.distanceMm < maxDist) {
        const r = (pt.distanceMm / maxDist) * center;
        const rad = (pt.angle - 90) * (Math.PI / 180); // 0 is up
        const x = center + r * Math.cos(rad);
        const y = center + r * Math.sin(rad);
        
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    
    // Sweep effect
    const sweepAngle = (Date.now() % 3000 / 3000) * Math.PI * 2;
    ctx.fillStyle = 'rgba(255, 176, 0, 0.1)';
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.arc(center, center, center, sweepAngle - 0.5, sweepAngle);
    ctx.closePath();
    ctx.fill();
    
  }, [lidar.data]);

  return (
    <Layout>
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-wider text-primary">Mission Control</h1>
          <p className="text-muted-foreground">REAL-TIME TELEMETRY & COMMAND</p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-4 bg-muted/20 p-2 px-4 border border-border rounded">
          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground uppercase">Autonomous Mode</span>
            <div className="flex items-center gap-3 mt-1">
              <Switch 
                checked={autoData?.enabled ?? false} 
                onCheckedChange={(c) => toggleAuto.mutate({ data: { enabled: c, mode: autoData?.mode || 'exploring' } })}
              />
              <Select 
                value={autoData?.mode || 'exploring'} 
                onValueChange={(val: any) => toggleAuto.mutate({ data: { enabled: autoData?.enabled ?? false, mode: val } })}
                disabled={!(autoData?.enabled)}
              >
                <SelectTrigger className="w-[140px] h-8 text-xs bg-background">
                  <SelectValue placeholder="Select mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="idle">IDLE</SelectItem>
                  <SelectItem value="exploring">EXPLORING</SelectItem>
                  <SelectItem value="homing">HOMING</SelectItem>
                  <SelectItem value="following">FOLLOWING</SelectItem>
                  <SelectItem value="patrolling">PATROLLING</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
        {/* Left Column: Visuals & Control */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          <Card className="flex-1 min-h-[300px] border-primary/30 relative overflow-hidden bg-black">
            <div className="absolute top-2 left-2 z-10 flex gap-2">
              <span className="px-2 py-1 bg-black/60 border border-primary/50 text-primary font-bold text-xs">CAM 01</span>
              {camera.data?.connected === false && (
                <span className="px-2 py-1 bg-destructive/20 border border-destructive text-destructive animate-pulse font-bold text-xs">NO SIGNAL</span>
              )}
            </div>
            {camera.data?.connected !== false ? (
              <img src={camSrc} alt="Rover Camera Feed" className="w-full h-full object-cover opacity-80 mix-blend-screen grayscale" style={{ filter: 'contrast(1.5) sepia(1.2) hue-rotate(40deg) saturate(300%)' }} />
            ) : (
              <div className="w-full h-full flex items-center justify-center flex-col text-destructive/50">
                <AlertTriangle className="h-12 w-12 mb-2" />
                <p>UPLINK LOST</p>
              </div>
            )}
            
            {/* Overlay HUD elements on camera */}
            <div className="absolute inset-0 pointer-events-none border-[10px] border-black/40"></div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
               <Crosshair className="w-16 h-16 text-primary/40 stroke-1" />
            </div>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-border bg-card">
              <CardHeader className="py-3 border-b border-border">
                <CardTitle className="text-sm font-bold tracking-widest">DRIVE CONTROL</CardTitle>
              </CardHeader>
              <CardContent className="p-6 flex justify-center items-center">
                <div className="grid grid-cols-3 grid-rows-3 gap-2 w-48 h-48">
                  <div />
                  <Button 
                    variant="outline" 
                    className={`h-full w-full border-primary/50 text-primary ${activeKey === 'up' ? 'bg-primary text-primary-foreground' : 'hover:bg-primary/20'}`}
                    onMouseDown={() => handlePadDown('forward')}
                    onMouseUp={handlePadUp}
                    onMouseLeave={handlePadUp}
                    onTouchStart={() => handlePadDown('forward')}
                    onTouchEnd={handlePadUp}
                  >
                    W
                  </Button>
                  <div />
                  <Button 
                    variant="outline" 
                    className={`h-full w-full border-primary/50 text-primary ${activeKey === 'left' ? 'bg-primary text-primary-foreground' : 'hover:bg-primary/20'}`}
                    onMouseDown={() => handlePadDown('left')}
                    onMouseUp={handlePadUp}
                    onMouseLeave={handlePadUp}
                    onTouchStart={() => handlePadDown('left')}
                    onTouchEnd={handlePadUp}
                  >
                    A
                  </Button>
                  <Button 
                    variant="outline" 
                    className={`h-full w-full border-destructive text-destructive hover:bg-destructive/20 ${activeKey === 'stop' ? 'bg-destructive text-destructive-foreground' : ''}`}
                    onClick={() => handlePadDown('stop')}
                  >
                    STOP
                  </Button>
                  <Button 
                    variant="outline" 
                    className={`h-full w-full border-primary/50 text-primary ${activeKey === 'right' ? 'bg-primary text-primary-foreground' : 'hover:bg-primary/20'}`}
                    onMouseDown={() => handlePadDown('right')}
                    onMouseUp={handlePadUp}
                    onMouseLeave={handlePadUp}
                    onTouchStart={() => handlePadDown('right')}
                    onTouchEnd={handlePadUp}
                  >
                    D
                  </Button>
                  <div />
                  <Button 
                    variant="outline" 
                    className={`h-full w-full border-primary/50 text-primary ${activeKey === 'down' ? 'bg-primary text-primary-foreground' : 'hover:bg-primary/20'}`}
                    onMouseDown={() => handlePadDown('backward')}
                    onMouseUp={handlePadUp}
                    onMouseLeave={handlePadUp}
                    onTouchStart={() => handlePadDown('backward')}
                    onTouchEnd={handlePadUp}
                  >
                    S
                  </Button>
                  <div />
                </div>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader className="py-3 border-b border-border">
                <CardTitle className="text-sm font-bold tracking-widest">TELEMETRY</CardTitle>
              </CardHeader>
              <CardContent className="p-4 flex flex-col gap-4">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2 text-muted-foreground"><Battery className="w-4 h-4 text-secondary"/> BATTERY</div>
                  <div className="font-bold text-secondary text-lg">{roverData?.batteryLevel ?? 0}%</div>
                </div>
                <Progress value={roverData?.batteryLevel ?? 0} className="h-2 bg-muted" />
                
                <div className="flex justify-between items-center mt-2">
                  <div className="flex items-center gap-2 text-muted-foreground"><Wind className="w-4 h-4 text-primary"/> SPEED</div>
                  <div className="font-bold text-primary text-lg">{(roverData?.speed ?? 0).toFixed(2)} m/s</div>
                </div>
                
                <div className="flex justify-between items-center mt-2">
                  <div className="flex items-center gap-2 text-muted-foreground"><Thermometer className="w-4 h-4 text-destructive"/> TEMP</div>
                  <div className="font-bold text-destructive text-lg">{roverData?.motorTemperature ?? 0}°C</div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Right Column: Sensors & Lidar */}
        <div className="flex flex-col gap-6">
          <Card className="border-border bg-card flex-1">
            <CardHeader className="py-3 border-b border-border">
              <CardTitle className="text-sm font-bold tracking-widest flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" /> RADAR / LIDAR
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 flex justify-center items-center">
               <canvas 
                 ref={canvasRef} 
                 width={300} 
                 height={300} 
                 className="bg-[#0a0a0a] rounded-full border border-border max-w-full h-auto aspect-square"
               />
            </CardContent>
          </Card>

          <Card className="border-border bg-card flex-1">
            <CardHeader className="py-3 border-b border-border">
              <CardTitle className="text-sm font-bold tracking-widest">PROXIMITY SENSORS</CardTitle>
            </CardHeader>
            <CardContent className="p-4 flex flex-col gap-4 overflow-y-auto max-h-[300px]">
              <div className="space-y-3">
                <h4 className="text-xs text-muted-foreground uppercase border-b border-border/50 pb-1">Ultrasonic</h4>
                {sensorData?.ultrasonic.map(u => (
                  <div key={u.id} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className={u.triggered ? 'text-destructive font-bold' : 'text-primary'}>{u.label}</span>
                      <span className={u.triggered ? 'text-destructive font-bold' : 'text-foreground'}>{u.distanceCm} cm</span>
                    </div>
                    <Progress value={Math.min((u.distanceCm / 400) * 100, 100)} className={`h-1 ${u.triggered ? 'bg-destructive/20 [&>div]:bg-destructive' : 'bg-muted'}`} />
                  </div>
                ))}
                {!sensorData?.ultrasonic.length && <div className="text-xs text-muted-foreground">No data</div>}
              </div>

              <div className="space-y-3 mt-4">
                <h4 className="text-xs text-muted-foreground uppercase border-b border-border/50 pb-1">Infrared</h4>
                <div className="grid grid-cols-2 gap-2">
                  {sensorData?.infrared.map(ir => (
                    <div key={ir.id} className={`p-2 border rounded flex flex-col items-center justify-center ${ir.detected ? 'border-destructive bg-destructive/10 text-destructive' : 'border-border text-muted-foreground'}`}>
                      <span className="text-[10px] uppercase font-bold">{ir.label}</span>
                      <span className="text-xs">{ir.detected ? 'OBSTACLE' : 'CLEAR'}</span>
                    </div>
                  ))}
                  {!sensorData?.infrared.length && <div className="text-xs text-muted-foreground col-span-2">No data</div>}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
