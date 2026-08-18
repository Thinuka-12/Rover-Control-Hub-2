import { useCallback, useSyncExternalStore } from "react";

export type OperatorRole = "pilot" | "co-pilot" | "observer";

export interface OperatorState {
  role: OperatorRole;
  name: string;
  id: string;
  assignedAt: string;
}

const STORAGE_KEY = "rover-operator-v1";
const subscribers = new Set<() => void>();
let cachedOperator: OperatorState | null | undefined;

function load(): OperatorState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as OperatorState) : null;
  } catch { return null; }
}

function save(s: OperatorState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

function subscribe(callback: () => void) {
  subscribers.add(callback);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      cachedOperator = load();
      callback();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    subscribers.delete(callback);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot() {
  if (cachedOperator === undefined) cachedOperator = load();
  return cachedOperator;
}

function notifySubscribers() {
  subscribers.forEach((callback) => callback());
}

export interface OperatorMeta { label: string; color: string; description: string }

const ROLE_META: Record<OperatorRole, OperatorMeta> = {
  pilot: {
    label: "PILOT",
    color: "#00e676",
    description: "Full command authority — drive, arm, configure, autonomous",
  },
  "co-pilot": {
    label: "CO-PILOT",
    color: "#ffb000",
    description: "Drive and sensor monitoring only — no arm or config changes",
  },
  observer: {
    label: "OBSERVER",
    color: "#888",
    description: "Read-only live feed — no commands permitted",
  },
};

export function useOperatorRole() {
  const operator = useSyncExternalStore(subscribe, getSnapshot, () => null);

  const assignRole = useCallback((role: OperatorRole, name: string) => {
    const s: OperatorState = {
      role,
      name: name.trim() || `Op-${Math.floor(Math.random() * 9000) + 1000}`,
      id: `op-${Date.now()}`,
      assignedAt: new Date().toISOString(),
    };
    save(s);
    cachedOperator = s;
    notifySubscribers();
  }, []);

  const releaseRole = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    cachedOperator = null;
    notifySubscribers();
  }, []);

  const role = operator?.role ?? "observer";
  const meta = ROLE_META[role];

  return {
    operator,
    hasRole: operator !== null,
    assignRole,
    releaseRole,
    meta: ROLE_META,
    currentMeta: meta,
    // Permission gates
    canDrive: role === "pilot" || role === "co-pilot",
    canArm: role === "pilot",
    canConfigure: role === "pilot",
    canAutonom: role === "pilot",
    canViewCameras: operator !== null,
    canViewMap: operator !== null,
    canEditMap: role === "pilot" || role === "co-pilot",
    canManageCameras: role === "pilot" || role === "co-pilot",
    isObserver: role === "observer",
  };
}
