import { useState, useCallback, useMemo } from "react";

export type VerificationStatus = "pending" | "confirmed" | "rejected";

export interface ArtifactRecord {
  id: string;
  displayId: string;
  label: string;
  confidence: number | null;
  detectedAt: string;
  lat: number | null;
  lng: number | null;
  notes: string;
  status: VerificationStatus;
  imageUrl: string | null;
  isDemo: boolean;
  source: string;
}

const LS_KEY = "rover-artifact-records-v1";
const DEMO_FLAG_KEY = "rover-artifact-records-demo-seeded-v1";

const BASE_LAT = 37.7749;
const BASE_LNG = -122.4194;

function genDisplayId(n: number): string {
  return `AR-${String(n).padStart(4, "0")}`;
}

function loadFromStorage(): ArtifactRecord[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ArtifactRecord[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function saveToStorage(records: ArtifactRecord[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(records));
}

function nextDisplayId(records: ArtifactRecord[]): string {
  let max = 0;
  for (const r of records) {
    const m = /^AR-(\d+)$/.exec(r.displayId);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return genDisplayId(max + 1);
}

function isoDaysAgo(days: number, hours = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(d.getHours() - hours);
  return d.toISOString();
}

function demoRecords(): ArtifactRecord[] {
  return [
    {
      id: "demo-1",
      displayId: "AR-0001",
      label: "Rock Formation",
      confidence: 82,
      detectedAt: isoDaysAgo(0, 2),
      lat: BASE_LAT + 0.0012,
      lng: BASE_LNG - 0.0008,
      notes: "Angular basalt-like outcrop near crater rim. Candidate for mineralogy follow-up.",
      status: "pending",
      imageUrl: null,
      isDemo: true,
      source: "DEMO — SIMULATED AI SCAN",
    },
    {
      id: "demo-2",
      displayId: "AR-0002",
      label: "Equipment",
      confidence: 67,
      detectedAt: isoDaysAgo(0, 5),
      lat: BASE_LAT + 0.0024,
      lng: BASE_LNG + 0.0011,
      notes: "Possible metallic debris near deployment zone. Size estimated 30–40 cm.",
      status: "confirmed",
      imageUrl: null,
      isDemo: true,
      source: "DEMO — SIMULATED AI SCAN",
    },
    {
      id: "demo-3",
      displayId: "AR-0003",
      label: "Anomaly",
      confidence: 41,
      detectedAt: isoDaysAgo(1, 1),
      lat: null,
      lng: null,
      notes: "Low-confidence thermal anomaly. No GPS fix at detection time. Needs re-scan.",
      status: "pending",
      imageUrl: null,
      isDemo: true,
      source: "DEMO — SIMULATED AI SCAN",
    },
    {
      id: "demo-4",
      displayId: "AR-0004",
      label: "Bio Sample",
      confidence: 73,
      detectedAt: isoDaysAgo(1, 6),
      lat: BASE_LAT - 0.0009,
      lng: BASE_LNG + 0.0023,
      notes: "Green-tinted patch on sheltered rock surface. Possible biological colonization.",
      status: "confirmed",
      imageUrl: null,
      isDemo: true,
      source: "DEMO — SIMULATED AI SCAN",
    },
    {
      id: "demo-5",
      displayId: "AR-0005",
      label: "Debris",
      confidence: 58,
      detectedAt: isoDaysAgo(2, 3),
      lat: BASE_LAT + 0.0005,
      lng: BASE_LNG - 0.0017,
      notes: "Scattered fragments. Likely rover track disturbance, not a native feature.",
      status: "rejected",
      imageUrl: null,
      isDemo: true,
      source: "DEMO — SIMULATED AI SCAN",
    },
    {
      id: "demo-6",
      displayId: "AR-0006",
      label: "Rock Formation",
      confidence: null,
      detectedAt: isoDaysAgo(2, 8),
      lat: BASE_LAT + 0.0031,
      lng: BASE_LNG - 0.0004,
      notes: "Layered sedimentary pattern. No confidence score recorded (manual entry).",
      status: "pending",
      imageUrl: null,
      isDemo: true,
      source: "DEMO — MANUAL ENTRY",
    },
  ];
}

function seedDemoRecords(): ArtifactRecord[] {
  const existing = loadFromStorage();
  const seeded = localStorage.getItem(DEMO_FLAG_KEY);
  if (existing.length > 0 || seeded) return existing;
  const demos = demoRecords();
  saveToStorage(demos);
  localStorage.setItem(DEMO_FLAG_KEY, "1");
  return demos;
}

export function useArtifactRecords() {
  const [records, setRecords] = useState<ArtifactRecord[]>(() => {
    if (typeof window === "undefined") return [];
    return seedDemoRecords();
  });

  const persist = useCallback((next: ArtifactRecord[]) => {
    setRecords(next);
    saveToStorage(next);
  }, []);

  const addRecord = useCallback(
    (partial: Partial<Omit<ArtifactRecord, "id" | "displayId" | "isDemo">>): string => {
      let createdId = "";
      setRecords((prev) => {
        const record: ArtifactRecord = {
          id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          displayId: nextDisplayId(prev),
          label: partial.label ?? "Unknown",
          confidence: partial.confidence ?? null,
          detectedAt: partial.detectedAt ?? new Date().toISOString(),
          lat: partial.lat ?? null,
          lng: partial.lng ?? null,
          notes: partial.notes ?? "",
          status: partial.status ?? "pending",
          imageUrl: partial.imageUrl ?? null,
          isDemo: false,
          source: partial.source ?? "MANUAL ENTRY",
        };
        createdId = record.id;
        const next = [record, ...prev];
        saveToStorage(next);
        return next;
      });
      return createdId;
    },
    [],
  );

  const updateRecord = useCallback(
    (id: string, patch: Partial<ArtifactRecord>) => {
      setRecords((prev) => {
        const next = prev.map((r) => (r.id === id ? { ...r, ...patch } : r));
        saveToStorage(next);
        return next;
      });
    },
    [],
  );

  const setStatus = useCallback(
    (id: string, status: VerificationStatus) => {
      setRecords((prev) => {
        const next = prev.map((r) => (r.id === id ? { ...r, status } : r));
        saveToStorage(next);
        return next;
      });
    },
    [],
  );

  const setNotes = useCallback(
    (id: string, notes: string) => {
      setRecords((prev) => {
        const next = prev.map((r) => (r.id === id ? { ...r, notes } : r));
        saveToStorage(next);
        return next;
      });
    },
    [],
  );

  const deleteRecord = useCallback((id: string) => {
    setRecords((prev) => {
      const next = prev.filter((r) => r.id !== id);
      saveToStorage(next);
      return next;
    });
  }, []);

  const resetToDemo = useCallback(() => {
    const demos = demoRecords();
    persist(demos);
    localStorage.setItem(DEMO_FLAG_KEY, "1");
  }, [persist]);

  const counts = useMemo(() => {
    const total = records.length;
    const pending = records.filter((r) => r.status === "pending").length;
    const confirmed = records.filter((r) => r.status === "confirmed").length;
    const rejected = records.filter((r) => r.status === "rejected").length;
    return { total, pending, confirmed, rejected };
  }, [records]);

  return {
    records,
    counts,
    addRecord,
    updateRecord,
    setStatus,
    setNotes,
    deleteRecord,
    resetToDemo,
  };
}
