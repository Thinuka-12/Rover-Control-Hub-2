import { Layout } from "@/components/layout";
import { useLocalSettings, type AppSettings } from "@/hooks/use-local-settings";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Save, Wifi, Bluetooth, Cpu, Camera } from "lucide-react";
import { useBluetooth } from "@/hooks/use-bluetooth";

export default function Settings() {
  const { settings, saveSettings, getEffectiveCameraUrl } = useLocalSettings();
  const [local, setLocal] = useState<AppSettings>(settings);
  const { toast } = useToast();
  const { btStatus, btDevice, isAvailable, connect: btConnect, disconnect: btDisconnect, btLog } = useBluetooth();

  const handleSave = () => {
    saveSettings(local);
    toast({ title: "Configuration Saved", description: "Settings saved to local storage." });
  };

  const effectiveUrl = getEffectiveCameraUrl(local);

  return (
    <Layout>
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-wider text-primary">SYSTEM CONFIG</h1>
          <p className="text-muted-foreground text-xs">LOCAL CONNECTION PARAMETERS</p>
        </div>
        <Button onClick={handleSave} className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Save className="w-4 h-4 mr-2" /> SAVE CONFIG
        </Button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* WiFi Camera */}
        <Card className="border-border bg-card md:col-span-2">
          <CardHeader className="pb-2 border-b border-border">
            <CardTitle className="text-primary tracking-widest uppercase flex items-center gap-2">
              <Camera className="w-4 h-4" /> Camera Feed
            </CardTitle>
            <CardDescription>Configure live video source. WiFi mode connects to an ESP32-CAM or IP camera.</CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground uppercase text-xs">Camera Source</Label>
              <Select
                value={local.cameraSource}
                onValueChange={(v: "wifi" | "manual" | "none") => setLocal({ ...local, cameraSource: v })}
              >
                <SelectTrigger className="font-mono bg-background border-border w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="wifi">WiFi (ESP32-CAM / IP Camera)</SelectItem>
                  <SelectItem value="manual">Manual URL</SelectItem>
                  <SelectItem value="none">Disabled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {local.cameraSource === "wifi" && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border border-border rounded p-4 bg-muted/10">
                <div className="sm:col-span-1 space-y-2">
                  <Label className="text-muted-foreground uppercase text-xs flex items-center gap-1">
                    <Wifi className="w-3 h-3" /> Camera IP Address
                  </Label>
                  <Input value={local.wifiCameraIp} onChange={(e) => setLocal({ ...local, wifiCameraIp: e.target.value })}
                    className="font-mono bg-background border-border" placeholder="192.168.1.200" />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground uppercase text-xs">Port</Label>
                  <Input value={local.wifiCameraPort} onChange={(e) => setLocal({ ...local, wifiCameraPort: e.target.value })}
                    className="font-mono bg-background border-border" placeholder="80" />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground uppercase text-xs">Stream Path</Label>
                  <Input value={local.wifiCameraPath} onChange={(e) => setLocal({ ...local, wifiCameraPath: e.target.value })}
                    className="font-mono bg-background border-border" placeholder="/stream" />
                </div>
                {effectiveUrl && (
                  <div className="sm:col-span-3 text-[11px] font-mono text-muted-foreground bg-black/30 p-2 rounded border border-border">
                    Stream URL: <span className="text-primary">{effectiveUrl}</span>
                  </div>
                )}
                <div className="sm:col-span-3 text-xs text-muted-foreground space-y-0.5">
                  <p>For ESP32-CAM: set path to <span className="font-mono text-primary">/stream</span> for MJPEG or <span className="font-mono text-primary">/capture</span> for snapshots.</p>
                  <p>For other IP cameras: use the full MJPEG endpoint path.</p>
                </div>
              </div>
            )}

            {local.cameraSource === "manual" && (
              <div className="space-y-2">
                <Label className="text-muted-foreground uppercase text-xs">Full Stream URL</Label>
                <Input value={local.cameraUrl} onChange={(e) => setLocal({ ...local, cameraUrl: e.target.value })}
                  className="font-mono bg-background border-border" placeholder="http://192.168.1.200/stream" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Arduino / WiFi connection */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-2 border-b border-border">
            <CardTitle className="text-primary tracking-widest uppercase flex items-center gap-2">
              <Wifi className="w-4 h-4" /> WiFi Connection
            </CardTitle>
            <CardDescription>Arduino/ESP32 WebSocket endpoint over WiFi.</CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground uppercase text-xs">Arduino IP Address</Label>
              <Input value={local.arduinoIp} onChange={(e) => setLocal({ ...local, arduinoIp: e.target.value })}
                className="font-mono bg-background border-border" />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground uppercase text-xs">Arduino Port</Label>
              <Input value={local.arduinoPort} onChange={(e) => setLocal({ ...local, arduinoPort: e.target.value })}
                className="font-mono bg-background border-border" />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground uppercase text-xs">Telemetry Poll Rate (ms)</Label>
              <Input type="number" value={local.refreshRate}
                onChange={(e) => setLocal({ ...local, refreshRate: parseInt(e.target.value) || 500 })}
                className="font-mono bg-background border-border" />
            </div>
          </CardContent>
        </Card>

        {/* Bluetooth */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-2 border-b border-border">
            <CardTitle className="text-primary tracking-widest uppercase flex items-center gap-2">
              <Bluetooth className="w-4 h-4" /> Bluetooth (BLE)
            </CardTitle>
            <CardDescription>
              Connect to Arduino via Web Bluetooth. Supports Nordic UART Service (HC-08, HM-10, nRF52840).
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            {!isAvailable ? (
              <div className="text-sm text-muted-foreground border border-border rounded p-3 bg-muted/10">
                Web Bluetooth is not available in this browser. Use Chrome or Edge on Android/Windows/macOS.
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-mono">
                      Status: <span className={btStatus === "connected" ? "text-green-400" : btStatus === "connecting" ? "text-yellow-400" : "text-muted-foreground"}>
                        {btStatus.toUpperCase()}
                      </span>
                    </p>
                    {btDevice && <p className="text-xs text-muted-foreground mt-1">Device: {btDevice.name}</p>}
                  </div>
                  {btStatus === "connected" ? (
                    <Button variant="outline" onClick={btDisconnect} className="border-destructive text-destructive hover:bg-destructive/10 text-xs">
                      Disconnect
                    </Button>
                  ) : (
                    <Button variant="outline" onClick={btConnect} disabled={btStatus === "connecting"}
                      className="border-blue-500/50 text-blue-400 hover:bg-blue-500/10 text-xs">
                      <Bluetooth className="w-3 h-3 mr-1" />
                      {btStatus === "connecting" ? "Scanning..." : "Scan & Connect"}
                    </Button>
                  )}
                </div>

                <div className="text-xs text-muted-foreground space-y-1 border border-border rounded p-3 bg-black/20">
                  <p className="font-bold text-foreground mb-2">Arduino BLE Setup</p>
                  <p>1. Add an HC-08 or HM-10 BLE module to your Arduino.</p>
                  <p>2. Connect TX/RX to Arduino serial pins.</p>
                  <p>3. Commands sent as plain text (e.g. <span className="font-mono text-primary">FORWARD\n</span>).</p>
                  <p>4. Click "Scan & Connect" — select your device from the browser picker.</p>
                </div>

                {btLog.length > 0 && (
                  <div className="border border-blue-500/20 rounded bg-black/30 p-2 font-mono text-xs text-blue-300 max-h-32 overflow-y-auto">
                    {btLog.map((line, i) => <div key={i}>{line}</div>)}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Hardware config */}
        <Card className="border-border bg-card md:col-span-2">
          <CardHeader className="pb-2 border-b border-border">
            <CardTitle className="text-primary tracking-widest uppercase flex items-center gap-2">
              <Cpu className="w-4 h-4" /> Hardware Configuration
            </CardTitle>
            <CardDescription>Physical sensor and motor counts.</CardDescription>
          </CardHeader>
          <CardContent className="pt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground uppercase text-xs">Ultrasonic Sensor Count</Label>
              <Input type="number" min={0} max={12} value={local.ultrasonicCount}
                onChange={(e) => setLocal({ ...local, ultrasonicCount: parseInt(e.target.value) || 0 })}
                className="font-mono bg-background border-border" />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground uppercase text-xs">Infrared Sensor Count</Label>
              <Input type="number" min={0} max={12} value={local.infraredCount}
                onChange={(e) => setLocal({ ...local, infraredCount: parseInt(e.target.value) || 0 })}
                className="font-mono bg-background border-border" />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground uppercase text-xs">Wheel Count (4 or 6)</Label>
              <Input type="number" min={4} max={6} step={2} value={local.wheelCount}
                onChange={(e) => setLocal({ ...local, wheelCount: parseInt(e.target.value) || 6 })}
                className="font-mono bg-background border-border" />
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
