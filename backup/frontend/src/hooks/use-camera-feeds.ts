import { useState, useCallback, useRef } from "react";

export type CameraSource = "wifi" | "ble" | "snapshot";
export type CameraStatus = "idle" | "connecting" | "connected" | "error" | "offline";

export interface CameraFeed {
  id: string;
  label: string;
  source: CameraSource;
  url: string;
  bleDeviceName?: string;
  status: CameraStatus;
  errorMsg?: string;
  snapshotDataUrl?: string;
  snapshotTs?: number;
}

const LS_KEY = "rover_camera_feeds_v2";

function genId() { return `cam-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

function loadFromStorage(): CameraFeed[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CameraFeed[];
    return parsed.map((c) => ({ ...c, status: "idle", snapshotDataUrl: undefined }));
  } catch { return []; }
}

function saveToStorage(feeds: CameraFeed[]) {
  const toSave = feeds.map(({ snapshotDataUrl: _, ...rest }) => rest);
  localStorage.setItem(LS_KEY, JSON.stringify(toSave));
}

export function useCameraFeeds() {
  const [feeds, setFeeds] = useState<CameraFeed[]>(() => loadFromStorage());
  const snapshotTimers = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  const save = useCallback((updated: CameraFeed[]) => {
    setFeeds(updated);
    saveToStorage(updated);
  }, []);

  const addFeed = useCallback((partial: Partial<CameraFeed> = {}) => {
    const feed: CameraFeed = {
      id: genId(),
      label: `Camera ${Date.now().toString().slice(-4)}`,
      source: "wifi",
      url: "",
      status: "idle",
      ...partial,
    };
    setFeeds((prev) => {
      const next = [...prev, feed];
      saveToStorage(next);
      return next;
    });
    return feed.id;
  }, []);

  const removeFeed = useCallback((id: string) => {
    if (snapshotTimers.current[id]) { clearInterval(snapshotTimers.current[id]); delete snapshotTimers.current[id]; }
    setFeeds((prev) => { const next = prev.filter((f) => f.id !== id); saveToStorage(next); return next; });
  }, []);

  const updateFeed = useCallback((id: string, patch: Partial<CameraFeed>) => {
    setFeeds((prev) => {
      const next = prev.map((f) => f.id === id ? { ...f, ...patch } : f);
      saveToStorage(next);
      return next;
    });
  }, []);

  const setStatus = useCallback((id: string, status: CameraStatus, errorMsg?: string) => {
    setFeeds((prev) => prev.map((f) => f.id === id ? { ...f, status, errorMsg } : f));
  }, []);

  // Snapshot polling — fetch still frames every N ms
  const startSnapshot = useCallback((id: string, url: string, intervalMs = 500) => {
    if (snapshotTimers.current[id]) clearInterval(snapshotTimers.current[id]);
    const doFetch = async () => {
      try {
        const r = await fetch(`${url}?_t=${Date.now()}`, { signal: AbortSignal.timeout(2000) });
        if (!r.ok) { setStatus(id, "error", `HTTP ${r.status}`); return; }
        const blob = await r.blob();
        const dataUrl = await new Promise<string>((res) => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result as string);
          reader.readAsDataURL(blob);
        });
        setFeeds((prev) => prev.map((f) => f.id === id ? { ...f, status: "connected", snapshotDataUrl: dataUrl, snapshotTs: Date.now(), errorMsg: undefined } : f));
      } catch { setStatus(id, "offline", "Snapshot fetch failed"); }
    };
    doFetch();
    snapshotTimers.current[id] = setInterval(doFetch, intervalMs);
    setStatus(id, "connecting");
  }, [setStatus]);

  const stopSnapshot = useCallback((id: string) => {
    if (snapshotTimers.current[id]) { clearInterval(snapshotTimers.current[id]); delete snapshotTimers.current[id]; }
    setStatus(id, "idle");
  }, [setStatus]);

  // BLE camera connect — scans for any BLE device (camera mode)
  const connectBle = useCallback(async (id: string) => {
    if (!("bluetooth" in navigator)) {
      setStatus(id, "error", "Web Bluetooth not available");
      return;
    }
    setStatus(id, "connecting");
    try {
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          "00001800-0000-1000-8000-00805f9b34fb", // Generic Access
          "0000180a-0000-1000-8000-00805f9b34fb", // Device Information
          "6e400001-b5a3-f393-e0a9-e50e24dcca9e", // Nordic UART
        ],
      });
      device.addEventListener("gattserverdisconnected", () => {
        setFeeds((prev) => prev.map((f) => f.id === id ? { ...f, status: "offline", bleDeviceName: f.bleDeviceName, errorMsg: "BLE disconnected" } : f));
      });
      await device.gatt!.connect();
      const name = device.name ?? "Unknown BLE Camera";
      setFeeds((prev) => {
        const next: CameraFeed[] = prev.map((f) => f.id === id ? { ...f, status: "connected" as CameraStatus, bleDeviceName: name, label: f.label === `Camera ${id.slice(-4)}` ? name : f.label } : f);
        saveToStorage(next);
        return next;
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("cancel") || msg.includes("chosen")) setStatus(id, "idle");
      else setStatus(id, "error", msg);
    }
  }, [setStatus]);

  const reorderFeeds = useCallback((from: number, to: number) => {
    setFeeds((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      saveToStorage(next);
      return next;
    });
  }, []);

  return { feeds, addFeed, removeFeed, updateFeed, setStatus, startSnapshot, stopSnapshot, connectBle, reorderFeeds };
}
