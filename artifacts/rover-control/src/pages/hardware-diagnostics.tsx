import { useMemo } from "react";
import { Activity, Battery, Camera, Cpu, Gauge, MapPin, Radio, ScanLine, ShieldAlert, Wifi } from "lucide-react";
import { Layout } from "@/components/layout";
import { useLocalSettings } from "@/hooks/use-local-settings";
import { useOperatorRole } from "@/hooks/use-operator-role";
import { useRoverWs } from "@/hooks/use-rover-ws";
import { useGetTelemetry } from "@workspace/api-client-react";

type DiagnosticStatus = "connected" | "simulation" | "configured" | "not-verified" | "disconnected" | "stopped";

interface DiagnosticItem {
  label: string;
  status: DiagnosticStatus;
  detail: string;
  icon: typeof Cpu;
}

const STATUS_STYLES: Record<DiagnosticStatus, { label: string; color: string; className: string }> = {
  connected: { label: "CONNECTED", color: "#00e676", className: "border-green-500/40 bg-green-500/5 text-green-300" },
  simulation: { label: "SIMULATION", color: "#ffb000", className: "border-amber-500/40 bg-amber-500/5 text-amber-300" },
  configured: { label: "CONFIGURED", color: "#ffb000", className: "border-amber-500/40 bg-amber-500/5 text-amber-300" },
  "not-verified": { label: "NOT VERIFIED", color: "#ffb000", className: "border-amber-500/40 bg-amber-500/5 text-amber-300" },
  disconnected: { label: "DISCONNECTED", color: "#ff4444", className: "border-red-500/40 bg-red-500/5 text-red-300" },
  stopped: { label: "STOPPED", color: "#ff4444", className: "border-red-500/40 bg-red-500/5 text-red-300" },
};

function DiagnosticCard({ item }: { item: DiagnosticItem }) {
  const status = STATUS_STYLES[item.status];
  const Icon = item.icon;
  return (
    <div className={`rounded-lg border p-3 ${status.className}`} data-testid={`diagnostic-${item.label.toLowerCase().replaceAll(" ", "-")}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="h-4 w-4 shrink-0" style={{ color: status.color }} />
          <span className="text-xs font-bold tracking-wider text-foreground">{item.label}</span>
        </div>
        <span className="shrink-0 text-[9px] font-bold tracking-wider" style={{ color: status.color }}>{status.label}</span>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">{item.detail}</p>
    </div>
  );
}

export default function HardwareDiagnostics() {
  const { settings, getEffectiveCameraUrl } = useLocalSettings();
  const { status: wsStatus, telemetry, armState } = useRoverWs();
  const telemetryRest = useGetTelemetry({ query: { refetchInterval: 1000 } as never });
  const { currentMeta } = useOperatorRole();
  const rover = telemetry?.rover ?? telemetryRest.data?.rover;
  const sensors = telemetry?.sensors ?? telemetryRest.data?.sensors;
  const simulation = typeof window !== "undefined" && localStorage.getItem("rover-arm-simulation") !== "false";
  const c50Configured = Boolean(getEffectiveCameraUrl(settings));
  const a9Configured = Boolean(settings.a9CameraUrl);

  const diagnostics = useMemo<DiagnosticItem[]>(() => [
    {
      label: "ESP32 CONTROLLER",
      status: wsStatus === "connected" ? "not-verified" : "disconnected",
      detail: wsStatus === "connected" ? "API/WebSocket uplink is live; physical ESP32 presence is not verified." : "No WebSocket uplink to the control server.",
      icon: Cpu,
    },
    {
      label: "TB6612FNG MOTOR DRIVER",
      status: "not-verified",
      detail: "No physical driver telemetry is available from the current simulator.",
      icon: Gauge,
    },
    {
      label: "PCA9685 SERVO DRIVER",
      status: armState?.hardware.controller === "connected" ? "connected" : "not-verified",
      detail: armState?.hardware.feedback === "unavailable" ? "Command channel only; servo feedback is unavailable." : "Driver status reported by the arm channel.",
      icon: Cpu,
    },
    {
      label: "WHEEL MOTORS",
      status: "not-verified",
      detail: `${rover?.wheelCount ?? settings.wheelCount} wheel channels are modeled; motor power feedback is unavailable.`,
      icon: Activity,
    },
    {
      label: "WHEEL ENCODERS",
      status: "not-verified",
      detail: "Encoder counts and wheel odometry are not connected to physical hardware.",
      icon: Activity,
    },
    {
      label: "GNSS / GPS",
      status: sensors ? "simulation" : "disconnected",
      detail: sensors ? "Position and trail data are simulated; no GNSS fix is verified." : "No GNSS telemetry received.",
      icon: MapPin,
    },
    {
      label: "IMU",
      status: "not-verified",
      detail: "No physical orientation or inertial sensor stream is available.",
      icon: ScanLine,
    },
    {
      label: "LIDAR",
      status: telemetry ? "simulation" : "disconnected",
      detail: telemetry ? "Point cloud and obstacle alarms are simulator data." : "No LIDAR telemetry received.",
      icon: ScanLine,
    },
    {
      label: "ULTRASONIC ARRAY",
      status: sensors ? "simulation" : "disconnected",
      detail: sensors ? "Distance values are simulator data; sensor wiring is not verified." : "No ultrasonic telemetry received.",
      icon: Radio,
    },
    {
      label: "C50 CAMERA",
      status: c50Configured ? "not-verified" : "disconnected",
      detail: c50Configured ? "A C50 URL is configured; stream health and physical camera connection are not verified." : "No C50 stream URL is configured.",
      icon: Camera,
    },
    {
      label: "A9 CAMERA",
      status: a9Configured ? "not-verified" : "disconnected",
      detail: a9Configured ? "An A9 URL is configured; stream health and physical camera connection are not verified." : "No A9 stream URL is configured.",
      icon: Camera,
    },
    {
      label: "ROBOTIC ARM",
      status: simulation ? "simulation" : armState?.emergencyStopped ? "stopped" : "not-verified",
      detail: simulation ? "Arm commands are simulation-only; positions are commanded, not measured." : armState?.emergencyStopped ? "Arm safety stop is active." : "Physical servo connection is not verified.",
      icon: ShieldAlert,
    },
    {
      label: "BATTERY",
      status: "simulation",
      detail: `${Math.round(rover?.batteryLevel ?? 0)}% estimated value; no battery-management telemetry is verified.`,
      icon: Battery,
    },
  ], [armState, c50Configured, a9Configured, rover, sensors, simulation, telemetry, wsStatus, settings.wheelCount]);

  return (
    <Layout>
      <div className="space-y-4" data-testid="hardware-diagnostics-page">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-bold tracking-widest text-primary">HARDWARE DIAGNOSTICS</h1>
            </div>
            <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              Read-only health and integration truth table · {currentMeta.label}
            </p>
          </div>
          <div className="flex items-center gap-2 rounded border border-border px-3 py-2 text-[10px] font-bold tracking-wider text-muted-foreground">
            <Wifi className="h-3.5 w-3.5" />
            API UPLINK: <span className={wsStatus === "connected" ? "text-green-400" : "text-red-400"}>{wsStatus.toUpperCase()}</span>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
          <div>
            <div className="text-xs font-bold tracking-wider text-amber-300">PHYSICAL HARDWARE NOT VERIFIED</div>
            <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
              Live API, simulator and configured URLs are shown separately from physical device health. This page never infers that an ESP32, motor driver, sensor, or camera is connected merely because the software channel is available.
            </p>
          </div>
        </div>

        <section>
          <div className="mb-2 flex items-center gap-2 text-[10px] font-bold tracking-[0.2em] text-muted-foreground">
            <Cpu className="h-3.5 w-3.5" /> CONTROL, MOTION & SAFETY
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {diagnostics.slice(0, 5).map((item) => <DiagnosticCard key={item.label} item={item} />)}
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center gap-2 text-[10px] font-bold tracking-[0.2em] text-muted-foreground">
            <ScanLine className="h-3.5 w-3.5" /> NAVIGATION & SENSORS
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {diagnostics.slice(5, 9).map((item) => <DiagnosticCard key={item.label} item={item} />)}
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center gap-2 text-[10px] font-bold tracking-[0.2em] text-muted-foreground">
            <Camera className="h-3.5 w-3.5" /> CAMERAS, ARM & POWER
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {diagnostics.slice(9).map((item) => <DiagnosticCard key={item.label} item={item} />)}
          </div>
        </section>
      </div>
    </Layout>
  );
}