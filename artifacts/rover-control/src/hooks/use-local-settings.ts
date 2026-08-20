import { useState } from "react";

export interface AppSettings {
  arduinoIp: string;
  arduinoPort: string;
  cameraUrl: string;
  wifiCameraIp: string;
  wifiCameraPort: string;
  wifiCameraPath: string;
  a9CameraUrl: string;
  cameraSource: "wifi" | "manual" | "none";
  refreshRate: number;
  ultrasonicCount: number;
  infraredCount: number;
  wheelCount: number;
}

const DEFAULT_SETTINGS: AppSettings = {
  arduinoIp: "192.168.1.100",
  arduinoPort: "8080",
  cameraUrl: "",
  wifiCameraIp: "192.168.1.200",
  wifiCameraPort: "80",
  wifiCameraPath: "/stream",
  a9CameraUrl: "",
  cameraSource: "none",
  refreshRate: 500,
  ultrasonicCount: 6,
  infraredCount: 4,
  wheelCount: 6,
};

export function useLocalSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const stored = localStorage.getItem("rover-settings-v2");
      if (stored) return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    } catch {
      // ignore
    }
    return DEFAULT_SETTINGS;
  });

  const saveSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    localStorage.setItem("rover-settings-v2", JSON.stringify(newSettings));
  };

  const getEffectiveCameraUrl = (s: AppSettings): string => {
    if (s.cameraSource === "wifi") {
      return `http://${s.wifiCameraIp}:${s.wifiCameraPort}${s.wifiCameraPath}`;
    }
    if (s.cameraSource === "manual") return s.cameraUrl;
    return "";
  };

  return { settings, saveSettings, getEffectiveCameraUrl };
}
