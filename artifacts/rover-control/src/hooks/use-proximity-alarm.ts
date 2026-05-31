import { useEffect, useRef, useState } from "react";

interface LidarPoint { angle: number; distanceMm: number; quality: number; }

export type AlarmLevel = "ok" | "warning" | "critical";

export interface ProximityAlarmState {
  alarming: boolean;
  level: AlarmLevel;
  closestMm: number | null;
}

function playBeep(ctx: AudioContext, distMm: number) {
  const isCritical = distMm < 300;
  const freq = isCritical ? 1400 : distMm < 600 ? 880 : 660;
  const dur = isCritical ? 0.12 : 0.16;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = "square";
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.5, ctx.currentTime + dur);
    gain.gain.setValueAtTime(0.14, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur + 0.02);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + dur + 0.02);
  } catch { /* ignore */ }
}

export function useProximityAlarm(
  lidarData: { points?: LidarPoint[] } | undefined,
  thresholdMm: number,
  enabled: boolean
): ProximityAlarmState {
  const [state, setState] = useState<ProximityAlarmState>({ alarming: false, level: "ok", closestMm: null });
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastBeepRef = useRef(0);

  useEffect(() => {
    const pts = lidarData?.points ?? [];
    let closest = Infinity;
    for (const pt of pts) {
      if (pt.distanceMm > 0 && pt.quality > 10 && pt.distanceMm < closest) {
        closest = pt.distanceMm;
      }
    }

    const isClose = enabled && closest < thresholdMm && closest !== Infinity;
    const level: AlarmLevel = !isClose ? "ok" : closest < thresholdMm * 0.4 ? "critical" : "warning";

    setState({ alarming: isClose, level, closestMm: isClose ? closest : null });

    if (isClose) {
      const now = Date.now();
      // Beep faster the closer the obstacle
      const beepInterval = closest < 250 ? 220 : closest < 500 ? 400 : 700;
      if (now - lastBeepRef.current > beepInterval) {
        lastBeepRef.current = now;
        try {
          if (!audioCtxRef.current) {
            audioCtxRef.current = new AudioContext();
          }
          if (audioCtxRef.current.state === "suspended") {
            void audioCtxRef.current.resume();
          }
          playBeep(audioCtxRef.current, closest);
        } catch { /* no audio ctx */ }
      }
    }
  }, [lidarData, thresholdMm, enabled]);

  return state;
}
