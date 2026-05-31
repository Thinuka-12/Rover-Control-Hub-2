import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

interface Axis { id: number; angleDeg: number; }
interface Props { axes: Axis[]; gripping: boolean; className?: string; }

const DEG = Math.PI / 180;

// ── Check WebGL support without crashing ─────────────────────────────────────
function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(
      c.getContext("webgl2") ||
      c.getContext("webgl") ||
      c.getContext("experimental-webgl")
    );
  } catch { return false; }
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  2-D FALLBACK — side-view stick diagram (Canvas 2D API)             ║
// ╚══════════════════════════════════════════════════════════════════════╝
function ArmVisualizer2D({ axes, gripping, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const W = canvas.clientWidth || 260;
      const H = canvas.clientHeight || 300;
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Background
      ctx.fillStyle = "#FFCBA4";
      ctx.fillRect(0, 0, W, H);

      // Grid
      ctx.strokeStyle = "rgba(200,140,100,0.4)"; ctx.lineWidth = 0.5;
      for (let x = 0; x < W; x += 20) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += 20) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

      // Link pixel lengths
      const scale = Math.min(W, H) / 360;
      const L = [0, 80, 90, 70, 30, 16].map((v) => v * scale);

      // Base
      const bx = W / 2, by = H * 0.84;
      ctx.beginPath();
      ctx.ellipse(bx, by + 6, 28 * scale, 8 * scale, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#111"; ctx.fill();
      ctx.strokeStyle = "#ffb000"; ctx.lineWidth = 1.5; ctx.stroke();

      // Joint colors
      const jColors = ["#ffb000", "#ff8800", "#ffcc00", "#00d4ff", "#00e676", "#00e676"];

      // Forward kinematics: axes 2-5 are cumulative angles in side-view plane
      // Axis 1 (base rotation) shown as ring indicator — doesn't affect side view projection
      const a = (id: number) => (axes.find((ax) => ax.id === id)?.angleDeg ?? 0);

      // Build joint positions
      const joints: Array<{ x: number; y: number }> = [{ x: bx, y: by }];
      let cx = bx, cy = by;
      // Link 1 always goes straight up
      cy -= L[1];
      joints.push({ x: cx, y: cy });
      // Links 2-5: cumulative angle from vertical
      let dir = -Math.PI / 2; // pointing up
      const linkAngles = [2, 3, 4, 5].map((id) => a(id) * DEG);
      for (let i = 0; i < 4; i++) {
        dir += linkAngles[i];
        const nx = cx + L[i + 2] * Math.cos(dir);
        const ny = cy + L[i + 2] * Math.sin(dir);
        joints.push({ x: nx, y: ny });
        cx = nx; cy = ny;
      }

      // Draw links
      const linkColors = ["#1a3020", "#162818", "#122015", "#0e1810", "#0a120c"];
      for (let i = 0; i < joints.length - 1; i++) {
        const p = joints[i], q = joints[i + 1];
        const thickness = Math.max(2, (8 - i * 1.2) * scale);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
        ctx.strokeStyle = linkColors[i] || "#0a0a0a";
        ctx.lineWidth = thickness * 2;
        ctx.lineCap = "round"; ctx.stroke();
        // Highlight
        ctx.strokeStyle = `rgba(0,230,118,${0.25 - i * 0.04})`;
        ctx.lineWidth = Math.max(1, thickness * 0.5);
        ctx.stroke();
      }

      // Draw joints
      for (let i = 0; i < joints.length; i++) {
        const { x, y } = joints[i];
        const r = Math.max(3, (10 - i * 1.2) * scale);
        // Glow
        const grd = ctx.createRadialGradient(x, y, 0, x, y, r * 2.5);
        grd.addColorStop(0, jColors[i] + "44"); grd.addColorStop(1, "transparent");
        ctx.beginPath(); ctx.arc(x, y, r * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = grd; ctx.fill();
        // Core
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = jColors[i]; ctx.fill();
        ctx.strokeStyle = "#000"; ctx.lineWidth = 0.5; ctx.stroke();
        // Axis label
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.font = `${Math.max(7, 8 * scale)}px monospace`;
        ctx.fillText(`J${i + 1}`, x + r + 2, y - r);
      }

      // Gripper at end
      const tip = joints[joints.length - 1];
      const gripAngle = a(6);
      const spread = (5 + ((gripAngle + 90) / 180) * 18) * scale;
      const perp = dir + Math.PI / 2;
      const fingerLen = 14 * scale;
      for (const side of [-1, 1]) {
        const fx = tip.x + spread * side * Math.cos(perp);
        const fy = tip.y + spread * side * Math.sin(perp);
        ctx.beginPath();
        ctx.moveTo(tip.x, tip.y);
        ctx.lineTo(fx + fingerLen * Math.cos(dir), fy + fingerLen * Math.sin(dir));
        ctx.strokeStyle = gripping ? "#00e676" : "#00a048";
        ctx.lineWidth = 2.5 * scale;
        ctx.lineCap = "round"; ctx.stroke();
      }

      // Base rotation ring indicator (axis 1)
      const a1 = a(1) * DEG;
      const ringR = 22 * scale;
      ctx.beginPath(); ctx.arc(bx, by, ringR, 0, Math.PI * 2);
      ctx.strokeStyle = "#ffb00033"; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + ringR * Math.cos(a1 - Math.PI / 2), by + ringR * Math.sin(a1 - Math.PI / 2));
      ctx.strokeStyle = "#ffb000"; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(bx + ringR * Math.cos(a1 - Math.PI / 2), by + ringR * Math.sin(a1 - Math.PI / 2), 3, 0, Math.PI * 2);
      ctx.fillStyle = "#ffb000"; ctx.fill();

      // Label
      ctx.fillStyle = "#333";
      ctx.font = `${9 * scale}px monospace`;
      ctx.fillText("SIDE VIEW  (WebGL unavailable)", 6, 12);

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [axes, gripping]);

  return <canvas ref={canvasRef} className={className} style={{ display: "block", width: "100%", height: "100%" }} />;
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  3-D RENDERER — Three.js WebGL                                      ║
// ╚══════════════════════════════════════════════════════════════════════╝

function makeCylinder(len: number, rTop = 0.036, rBot = 0.042): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(rTop, rBot, len, 12, 1);
  const mat = new THREE.MeshStandardMaterial({ color: 0x1a2e1f, metalness: 0.88, roughness: 0.18 });
  const m = new THREE.Mesh(geo, mat); m.position.y = len / 2; m.castShadow = true; return m;
}
function makeJointSphere(r = 0.058, color = 0xffb000): THREE.Mesh {
  const geo = new THREE.SphereGeometry(r, 20, 14);
  const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.25, metalness: 0.9, roughness: 0.12 });
  return new THREE.Mesh(geo, mat);
}
function makeRing(r = 0.07, tube = 0.012): THREE.Mesh {
  const geo = new THREE.TorusGeometry(r, tube, 8, 24);
  const mat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.95, roughness: 0.05 });
  const m = new THREE.Mesh(geo, mat); m.rotation.x = Math.PI / 2; return m;
}

const L1 = 0.80, L2 = 0.85, L3 = 0.70, L4 = 0.28, L5 = 0.16;

function ArmVisualizer3DInner({ axes, gripping, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const jointRefs = useRef<THREE.Group[]>([]);
  const fingerRefs = useRef<{ l: THREE.Mesh; r: THREE.Mesh } | null>(null);
  const animRef = useRef(0);
  const orbit = useRef({ az: Math.PI / 4, el: 0.42, r: 4.2, dragging: false, lx: 0, ly: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.clientWidth || 260, H = canvas.clientHeight || 300;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 50);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xFFCBA4);
    scene.fog = new THREE.FogExp2(0xFFCBA4, 0.10);

    scene.add(new THREE.AmbientLight(0x202428, 3.5));
    const sun = new THREE.DirectionalLight(0xffd090, 2.8);
    sun.position.set(4, 8, 3); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { near: 0.1, far: 20, left: -3, right: 3, top: 5, bottom: -1 });
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x00e676, 0.45); fill.position.set(-3, 2, -3); scene.add(fill);
    const rim = new THREE.DirectionalLight(0x4488ff, 0.3); rim.position.set(0, -2, -4); scene.add(rim);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshStandardMaterial({ color: 0xF5B08A, roughness: 0.9, metalness: 0.05 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    scene.add(new THREE.GridHelper(6, 24, 0xD4845A, 0xE8A07A));

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.12, 32), new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.95, roughness: 0.08 }));
    base.position.y = 0.06; base.castShadow = true; scene.add(base);
    const mr = makeRing(0.18, 0.018); mr.position.y = 0.12; scene.add(mr);

    const j1 = new THREE.Group(); j1.position.set(0, 0.12, 0);
    const j2 = new THREE.Group(); j2.position.set(0, L1, 0);
    const j3 = new THREE.Group(); j3.position.set(0, L2, 0);
    const j4 = new THREE.Group(); j4.position.set(0, L3, 0);
    const j5 = new THREE.Group(); j5.position.set(0, L4, 0);
    j1.add(j2); j2.add(j3); j3.add(j4); j4.add(j5);

    j1.add(makeCylinder(L1, 0.040, 0.048));
    j2.add(makeCylinder(L2, 0.034, 0.042));
    j3.add(makeCylinder(L3, 0.028, 0.036));
    j4.add(makeCylinder(L4, 0.022, 0.030));
    j5.add(makeCylinder(L5, 0.018, 0.022));

    const jColors = [0xffb000, 0xff8800, 0xffcc00, 0x00d4ff, 0x00e676];
    const jSizes = [0.065, 0.052, 0.048, 0.044, 0.040];
    const jRingSizes = [0.08, 0.068, 0.062, 0.055, 0.050];
    [j1, j2, j3, j4, j5].forEach((j, i) => {
      j.add(makeJointSphere(jSizes[i], jColors[i]));
      j.add(makeRing(jRingSizes[i]));
    });

    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 0.025), new THREE.MeshStandardMaterial({ color: 0x334433, metalness: 0.9 }));
    brace.position.y = L1 * 0.5; j1.add(brace);

    const grip = new THREE.Group(); grip.position.set(0, L5, 0);
    const gripBase = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 0.04), new THREE.MeshStandardMaterial({ color: 0x0a2010, metalness: 0.9 }));
    gripBase.position.y = 0.012; grip.add(gripBase);
    const fMat = new THREE.MeshStandardMaterial({ color: 0x00e676, emissive: 0x00e676, emissiveIntensity: 0.15, metalness: 0.7 });
    const fGeo = new THREE.BoxGeometry(0.018, 0.14, 0.022);
    const fl = new THREE.Mesh(fGeo, fMat); fl.position.set(-0.055, 0.07, 0);
    const fr = new THREE.Mesh(fGeo, fMat); fr.position.set(0.055, 0.07, 0);
    grip.add(fl, fr); fingerRefs.current = { l: fl, r: fr }; j5.add(grip);

    scene.add(j1);
    jointRefs.current = [j1, j2, j3, j4, j5];

    // Initial angles
    const a = (id: number) => (axes.find((ax) => ax.id === id)?.angleDeg ?? 0) * DEG;
    j1.rotation.y = a(1); j2.rotation.x = a(2); j3.rotation.x = a(3); j4.rotation.x = a(4); j5.rotation.z = a(5);

    // Mouse orbit
    const down = (e: MouseEvent) => { orbit.current.dragging = true; orbit.current.lx = e.clientX; orbit.current.ly = e.clientY; };
    const move = (e: MouseEvent) => {
      if (!orbit.current.dragging) return;
      orbit.current.az -= (e.clientX - orbit.current.lx) * 0.012;
      orbit.current.el = Math.max(-0.1, Math.min(1.2, orbit.current.el - (e.clientY - orbit.current.ly) * 0.008));
      orbit.current.lx = e.clientX; orbit.current.ly = e.clientY;
    };
    const up = () => { orbit.current.dragging = false; };
    const wheel = (e: WheelEvent) => { e.preventDefault(); orbit.current.r = Math.max(2, Math.min(8, orbit.current.r + e.deltaY * 0.005)); };

    canvas.addEventListener("mousedown", down);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    canvas.addEventListener("wheel", wheel, { passive: false });

    const lookAt = new THREE.Vector3(0, 1.3, 0);
    const tick = () => {
      animRef.current = requestAnimationFrame(tick);
      if (!orbit.current.dragging) orbit.current.az += 0.0015;
      const { az, el, r } = orbit.current;
      camera.position.set(lookAt.x + r * Math.cos(el) * Math.sin(az), lookAt.y + r * Math.sin(el), lookAt.z + r * Math.cos(el) * Math.cos(az));
      camera.lookAt(lookAt);
      const cW = canvas.clientWidth, cH = canvas.clientHeight;
      if (canvas.width !== cW || canvas.height !== cH) {
        renderer.setSize(cW, cH, false); camera.aspect = cW / cH; camera.updateProjectionMatrix();
      }
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(animRef.current);
      canvas.removeEventListener("mousedown", down);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      canvas.removeEventListener("wheel", wheel);
      renderer.dispose();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update joints when axes change
  useEffect(() => {
    const [j1, j2, j3, j4, j5] = jointRefs.current;
    if (!j1) return;
    const a = (id: number) => (axes.find((ax) => ax.id === id)?.angleDeg ?? 0) * DEG;
    j1.rotation.y = a(1); j2.rotation.x = a(2); j3.rotation.x = a(3); j4.rotation.x = a(4); j5.rotation.z = a(5);
    if (fingerRefs.current) {
      const spread = 0.022 + ((( axes.find((ax) => ax.id === 6)?.angleDeg ?? 0) + 90) / 180) * 0.065;
      fingerRefs.current.l.position.x = -spread;
      fingerRefs.current.r.position.x = spread;
    }
  }, [axes, gripping]);

  return <canvas ref={canvasRef} className={className} style={{ display: "block", width: "100%", height: "100%", cursor: "grab" }} />;
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  PUBLIC EXPORT — auto-selects 3D or 2D based on environment         ║
// ╚══════════════════════════════════════════════════════════════════════╝
export function ArmVisualizer3D(props: Props) {
  const [use3D] = useState(() => hasWebGL());
  if (use3D) {
    return <ArmVisualizer3DInner {...props} />;
  }
  return <ArmVisualizer2D {...props} />;
}
