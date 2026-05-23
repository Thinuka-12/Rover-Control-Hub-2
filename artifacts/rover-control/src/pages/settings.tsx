import { Layout } from "@/components/layout";
import { useLocalSettings } from "@/hooks/use-local-settings";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Save } from "lucide-react";

export default function Settings() {
  const { settings, saveSettings } = useLocalSettings();
  const [local, setLocal] = useState(settings);
  const { toast } = useToast();

  const handleSave = () => {
    saveSettings(local);
    toast({
      title: "Configuration Saved",
      description: "Local settings have been updated.",
    });
  };

  return (
    <Layout>
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-wider text-primary">SYSTEM CONFIG</h1>
          <p className="text-muted-foreground">LOCAL CONNECTION PARAMETERS</p>
        </div>
        <Button onClick={handleSave} className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Save className="w-4 h-4 mr-2" /> SAVE CONFIG
        </Button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-primary tracking-widest uppercase">Connection</CardTitle>
            <CardDescription>Network details for the Arduino and Camera.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground uppercase text-xs">Arduino IP Address</Label>
              <Input 
                value={local.arduinoIp} 
                onChange={(e) => setLocal({...local, arduinoIp: e.target.value})} 
                className="font-mono bg-background border-border"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground uppercase text-xs">Arduino Port</Label>
              <Input 
                value={local.arduinoPort} 
                onChange={(e) => setLocal({...local, arduinoPort: e.target.value})} 
                className="font-mono bg-background border-border"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground uppercase text-xs">Camera Stream URL</Label>
              <Input 
                value={local.cameraUrl} 
                onChange={(e) => setLocal({...local, cameraUrl: e.target.value})} 
                className="font-mono bg-background border-border"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground uppercase text-xs">Telemetry Refresh Rate (ms)</Label>
              <Input 
                type="number"
                value={local.refreshRate} 
                onChange={(e) => setLocal({...local, refreshRate: parseInt(e.target.value) || 50})} 
                className="font-mono bg-background border-border"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-primary tracking-widest uppercase">Hardware</CardTitle>
            <CardDescription>Physical configuration of the rover.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground uppercase text-xs">Ultrasonic Sensor Count</Label>
              <Input 
                type="number"
                value={local.ultrasonicCount} 
                onChange={(e) => setLocal({...local, ultrasonicCount: parseInt(e.target.value) || 0})} 
                className="font-mono bg-background border-border"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground uppercase text-xs">Infrared Sensor Count</Label>
              <Input 
                type="number"
                value={local.infraredCount} 
                onChange={(e) => setLocal({...local, infraredCount: parseInt(e.target.value) || 0})} 
                className="font-mono bg-background border-border"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground uppercase text-xs">Wheel Count</Label>
              <Input 
                type="number"
                value={local.wheelCount} 
                onChange={(e) => setLocal({...local, wheelCount: parseInt(e.target.value) || 0})} 
                className="font-mono bg-background border-border"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
