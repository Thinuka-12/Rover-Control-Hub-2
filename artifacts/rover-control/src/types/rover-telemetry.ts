export type HardwareStatus = "connected" | "disconnected" | "not-verified" | "simulation" | "error";
export type GnssFix = "NO FIX" | "2D FIX" | "3D FIX" | "RTK FIX";
export type WarningLevel = "ok" | "warning" | "critical";

export interface GNSSData {
  latitude: number | null;
  longitude: number | null;
  altitudeM: number | null;
  speedMps: number | null;
  headingDeg: number | null;
  satellites: number;
  fix: GnssFix;
  accuracyM: number | null;
  status: HardwareStatus;
  timestamp: string | null;
}

export interface EncoderWheelData {
  wheelId: string;
  counts: number | null;
  rpm: number | null;
  speedMps: number | null;
  distanceM: number | null;
  status: HardwareStatus;
}

export interface EncoderData {
  wheels: EncoderWheelData[];
  totalDistanceM: number | null;
  odometry: { xM: number; yM: number; headingDeg: number } | null;
  status: HardwareStatus;
  timestamp: string | null;
}

export interface IMUData {
  headingDeg: number | null;
  rollDeg: number | null;
  pitchDeg: number | null;
  accelerationMps2: { x: number; y: number; z: number } | null;
  status: HardwareStatus;
  timestamp: string | null;
}

export interface LidarData {
  points: { angleDeg: number; distanceMm: number; quality: number }[];
  status: HardwareStatus;
  timestamp: string | null;
}

export interface UltrasonicData {
  sensorId: string;
  distanceCm: number | null;
  directionDeg: number | null;
  triggered: boolean;
  status: HardwareStatus;
}

export interface CameraStatus {
  id: "c50" | "a9";
  feed: "clean" | "ai-processed" | "arm";
  status: "streaming" | "disconnected" | "not-verified" | "simulation";
  urlConfigured: boolean;
  timestamp: string | null;
}

export interface AIDetection {
  id: string;
  type: string;
  confidence: number;
  timestamp: string;
  cameraFrame: { source: "c50-ai"; frameId: string | null };
  gnss: Pick<GNSSData, "latitude" | "longitude" | "accuracyM">;
  mapPosition: { xM: number; yM: number } | null;
}

export interface BatteryStatus {
  system: "rover" | "arm" | "esp32";
  voltageV: number | null;
  percentage: number | null;
  currentA: number | null;
  lowBattery: boolean;
  status: HardwareStatus;
  timestamp: string | null;
}

export interface Obstacle {
  id: string;
  source: "lidar" | "ultrasonic";
  distanceMm: number;
  directionDeg: number | null;
  warningLevel: WarningLevel;
  timestamp: string;
}

export interface NavigationData {
  position: { xM: number; yM: number } | null;
  headingDeg: number | null;
  distanceTravelledM: number | null;
  source: "gnss+encoders+imu" | "simulation" | "unavailable";
  accuracyM: number | null;
  timestamp: string | null;
}

export interface ArmState {
  enabled: boolean;
  emergencyStopped: boolean;
  commandedPositions: Record<string, number>;
  measuredPositions: Record<string, number> | null;
  hardware: HardwareStatus;
  feedback: "available" | "unavailable";
  timestamp: string | null;
}

export interface ArmCommand {
  type: "arm_move" | "arm_stop" | "arm_emergency_stop" | "arm_enable";
  joint?: string;
  direction?: -1 | 1;
  speed?: number;
}