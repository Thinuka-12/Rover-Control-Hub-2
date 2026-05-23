import { useState, useEffect } from "react";

export interface AppSettings {
  arduinoIp: string;
  arduinoPort: string;
  cameraUrl: string;
  refreshRate: number;
  ultrasonicCount: number;
  infraredCount: number;
  wheelCount: number;
}

const DEFAULT_SETTINGS: AppSettings = {
  arduinoIp: "192.168.1.100",
  arduinoPort: "8080",
  cameraUrl: "http://192.168.1.101:8080/video",
  refreshRate: 50,
  ultrasonicCount: 4,
  infraredCount: 2,
  wheelCount: 6,
};

export function useLocalSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const stored = localStorage.getItem("rover-settings");
      if (stored) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.error("Failed to load settings", e);
    }
    return DEFAULT_SETTINGS;
  });

  const saveSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    localStorage.setItem("rover-settings", JSON.stringify(newSettings));
  };

  return { settings, saveSettings };
}
