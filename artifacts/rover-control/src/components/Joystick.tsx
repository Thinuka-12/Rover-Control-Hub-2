import { useRef, useCallback, useEffect } from "react";

type Direction = "forward" | "backward" | "left" | "right" | "stop";

interface JoystickProps {
  onCommand: (cmd: Direction) => void;
  activeKey?: string | null;
}

const DEAD_ZONE = 0.2;

export function Joystick({ onCommand, activeKey }: JoystickProps) {
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const activeCmd = useRef<Direction | null>(null);
  const isDragging = useRef(false);

  const getCenter = () => {
    const rect = baseRef.current!.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, r: rect.width / 2 };
  };

  const resolveDirection = (nx: number, ny: number): Direction | null => {
    if (Math.abs(nx) < DEAD_ZONE && Math.abs(ny) < DEAD_ZONE) return null;
    if (Math.abs(ny) >= Math.abs(nx)) return ny < 0 ? "forward" : "backward";
    return nx < 0 ? "left" : "right";
  };

  const moveKnob = useCallback((clientX: number, clientY: number) => {
    const { x: cx, y: cy, r } = getCenter();
    const dx = clientX - cx;
    const dy = clientY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const clamp = Math.min(dist, r * 0.55);
    const angle = Math.atan2(dy, dx);
    const kx = Math.cos(angle) * clamp;
    const ky = Math.sin(angle) * clamp;

    if (knobRef.current) {
      knobRef.current.style.transform = `translate(${kx}px, ${ky}px)`;
    }

    const nx = kx / (r * 0.55);
    const ny = ky / (r * 0.55);
    const dir = resolveDirection(nx, ny);
    const cmd: Direction = dir ?? "stop";

    if (cmd !== activeCmd.current) {
      activeCmd.current = cmd;
      onCommand(cmd);
    }
  }, [onCommand]);

  const resetKnob = useCallback(() => {
    isDragging.current = false;
    activeCmd.current = null;
    if (knobRef.current) {
      knobRef.current.style.transform = "translate(0px, 0px)";
    }
    onCommand("stop");
  }, [onCommand]);

  // Touch handlers
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    isDragging.current = true;
    const t = e.touches[0];
    moveKnob(t.clientX, t.clientY);
  }, [moveKnob]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (!isDragging.current) return;
    const t = e.touches[0];
    moveKnob(t.clientX, t.clientY);
  }, [moveKnob]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    resetKnob();
  }, [resetKnob]);

  // Mouse handlers
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    moveKnob(e.clientX, e.clientY);
  }, [moveKnob]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      moveKnob(e.clientX, e.clientY);
    };
    const onMouseUp = () => {
      if (!isDragging.current) return;
      resetKnob();
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [moveKnob, resetKnob]);

  const dirFromKey = activeKey === "up" ? "forward" : activeKey === "down" ? "backward" : activeKey === "left" ? "left" : activeKey === "right" ? "right" : null;
  const keyKnobX = dirFromKey === "left" ? -28 : dirFromKey === "right" ? 28 : 0;
  const keyKnobY = dirFromKey === "forward" ? -28 : dirFromKey === "backward" ? 28 : 0;

  return (
    <div className="flex flex-col items-center gap-3 select-none">
      {/* Base */}
      <div
        ref={baseRef}
        className="relative rounded-full border-2 border-primary/40 bg-primary/5 flex items-center justify-center touch-none cursor-none"
        style={{ width: 160, height: 160, boxShadow: "0 0 24px rgba(255,176,0,0.08) inset" }}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        {/* Ring guides */}
        <div className="absolute rounded-full border border-primary/10" style={{ width: 100, height: 100 }} />
        <div className="absolute rounded-full border border-primary/10" style={{ width: 50, height: 50 }} />

        {/* Crosshair lines */}
        <div className="absolute w-full h-px bg-primary/10" />
        <div className="absolute h-full w-px bg-primary/10" />

        {/* Direction labels */}
        <span className="absolute top-2 text-[9px] text-primary/40 font-mono tracking-widest">FWD</span>
        <span className="absolute bottom-2 text-[9px] text-primary/40 font-mono tracking-widest">REV</span>
        <span className="absolute left-2 text-[9px] text-primary/40 font-mono tracking-widest" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>L</span>
        <span className="absolute right-2 text-[9px] text-primary/40 font-mono tracking-widest" style={{ writingMode: "vertical-rl" }}>R</span>

        {/* Knob */}
        <div
          ref={knobRef}
          className="absolute rounded-full border-2 border-primary bg-primary/20 flex items-center justify-center pointer-events-none"
          style={{
            width: 52,
            height: 52,
            transition: isDragging.current ? "none" : "transform 0.15s ease-out",
            transform: !isDragging.current && dirFromKey
              ? `translate(${keyKnobX}px, ${keyKnobY}px)`
              : "translate(0px, 0px)",
            boxShadow: "0 0 12px rgba(255,176,0,0.35)",
          }}
        >
          <div className="w-3 h-3 rounded-full bg-primary/70" />
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground font-mono tracking-wider">DRAG TO STEER • WASD STILL WORKS</p>
    </div>
  );
}
