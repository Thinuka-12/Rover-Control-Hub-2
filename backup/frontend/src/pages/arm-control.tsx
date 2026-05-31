import { Layout } from "@/components/layout";
import { useGetArmStatus, useSendArmCommand, useHomeArm } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { RotateCcw, Grab, PowerOff } from "lucide-react";
import { useEffect, useRef } from "react";

export default function ArmControl() {
  const { data: armStatus } = useGetArmStatus({ query: { refetchInterval: 1000 } as never });
  const sendCommand = useSendArmCommand();
  const homeArm = useHomeArm();

  const handleAxisChange = (id: number, val: number[]) => {
    sendCommand.mutate({ data: { axes: [{ id, angleDeg: val[0] }], grip: null } });
  };

  const handleGripToggle = (checked: boolean) => {
    sendCommand.mutate({ data: { axes: [], grip: checked } });
  };

  const axes = armStatus?.axes || [
    { id: 1, label: "Base Pan", angleDeg: 90, minDeg: 0, maxDeg: 180 },
    { id: 2, label: "Shoulder Tilt", angleDeg: 90, minDeg: 0, maxDeg: 180 },
    { id: 3, label: "Elbow Tilt", angleDeg: 90, minDeg: 0, maxDeg: 180 },
    { id: 4, label: "Wrist Pitch", angleDeg: 90, minDeg: 0, maxDeg: 180 },
    { id: 5, label: "Wrist Roll", angleDeg: 90, minDeg: 0, maxDeg: 180 },
    { id: 6, label: "Gripper", angleDeg: 90, minDeg: 0, maxDeg: 180 },
  ];

  return (
    <Layout>
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-wider text-primary">ARM SYSTEM</h1>
          <p className="text-muted-foreground">MULTI-AXIS MANIPULATOR CONTROL</p>
        </div>
        
        <div className="flex gap-4">
          <Button variant="outline" className="border-primary text-primary hover:bg-primary/20" onClick={() => homeArm.mutate()}>
            <RotateCcw className="w-4 h-4 mr-2" /> HOME POS
          </Button>
          <Button variant="outline" className="border-destructive text-destructive hover:bg-destructive/20">
            <PowerOff className="w-4 h-4 mr-2" /> DISABLE MOTORS
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
        <Card className="border-border bg-card">
          <CardHeader className="py-4 border-b border-border flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-bold tracking-widest">JOINT CALIBRATION</CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">GRIPPER ENGAGE</span>
              <Switch checked={armStatus?.gripping ?? false} onCheckedChange={handleGripToggle} />
            </div>
          </CardHeader>
          <CardContent className="p-6 flex flex-col gap-8">
            {axes.map((axis) => (
              <div key={axis.id} className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-primary text-sm uppercase">AXIS 0{axis.id} // {axis.label}</span>
                  <span className="text-secondary font-mono text-sm bg-secondary/10 px-2 py-1 rounded border border-secondary/20">
                    {axis.angleDeg.toFixed(1)}°
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-muted-foreground">{axis.minDeg}°</span>
                  <Slider 
                    value={[axis.angleDeg]} 
                    min={axis.minDeg} 
                    max={axis.maxDeg} 
                    step={1}
                    onValueCommit={(val) => handleAxisChange(axis.id, val)}
                    className="flex-1"
                  />
                  <span className="text-xs text-muted-foreground">{axis.maxDeg}°</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border bg-card flex items-center justify-center overflow-hidden relative min-h-[400px]">
          <div className="absolute inset-0 bg-[url('/grid.svg')] bg-repeat opacity-10 pointer-events-none"></div>
          
          {/* Abstract arm visualizer */}
          <div className="relative w-64 h-64 border border-primary/30 rounded-full flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border border-dashed border-primary/20 animate-[spin_60s_linear_infinite]"></div>
            <div className="text-center space-y-2">
              <Grab className={`w-16 h-16 mx-auto ${armStatus?.gripping ? 'text-destructive' : 'text-primary/50'}`} />
              <div className="text-xs tracking-widest text-primary uppercase">
                {armStatus?.moving ? 'MOTION DETECTED' : 'POSITION HOLD'}
              </div>
              <div className="text-[10px] text-muted-foreground">
                Base Pan: {axes[0].angleDeg}°<br/>
                Shoulder: {axes[1].angleDeg}°
              </div>
            </div>
            
            {/* Draw little angle arcs */}
            {axes.slice(0,3).map((a, i) => (
              <div 
                key={a.id} 
                className="absolute w-full h-full border-2 border-transparent rounded-full pointer-events-none transition-transform duration-500"
                style={{ 
                  transform: `rotate(${a.angleDeg}deg) scale(${1 + i*0.2})`,
                  borderTopColor: 'hsl(var(--secondary))',
                  opacity: 0.3
                }}
              />
            ))}
          </div>
        </Card>
      </div>
    </Layout>
  );
}
