import { useCallback, useSyncExternalStore } from "react";

export type OperatorRole = "pilot" | "co-pilot" | "arm-operator";

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
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OperatorState>;
    // Migrate consoles that still have the retired read-only Observer role.
    const storedRole = parsed.role as string | undefined;
    const role = storedRole === "observer" ? "arm-operator" : storedRole;
    if (role !== "pilot" && role !== "co-pilot" && role !== "arm-operator") return null;
    return {
      role,
      name: typeof parsed.name === "string" ? parsed.name : "",
      id: typeof parsed.id === "string" ? parsed.id : `op-${Date.now()}`,
      assignedAt: typeof parsed.assignedAt === "string" ? parsed.assignedAt : new Date().toISOString(),
    };
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
    description: "Drive, clean C50, VR, PTZ and autonomous",
  },
  "co-pilot": {
    label: "CO-PILOT",
    color: "#ffb000",
    description: "AI, GNSS, sensors, map and replay — no drive or arm",
  },
  "arm-operator": {
    label: "ARM OPERATOR",
    color: "#00d9ff",
    description: "Dedicated arm control and A9 camera",
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

  const role = operator?.role ?? "arm-operator";
  const meta = ROLE_META[role];

  return {
    operator,
    hasRole: operator !== null,
    assignRole,
    releaseRole,
    meta: ROLE_META,
    currentMeta: meta,
    // Permission gates
    canDrive: role === "pilot",
    canArm: role === "arm-operator",
    canConfigure: role === "pilot",
    canAutonom: role === "pilot",
    canViewCameras: role === "pilot" || role === "co-pilot",
    canViewMap: role === "pilot" || role === "co-pilot",
    canEditMap: role === "co-pilot",
    canManageCameras: role === "pilot",
    canUseAi: role === "co-pilot",
    canUseGnss: role === "co-pilot",
    canUseVr: role === "pilot",
    isArmOperator: role === "arm-operator",
  };
}
