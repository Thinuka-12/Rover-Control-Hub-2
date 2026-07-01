import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

interface LidarPoint { angle: number; distanceMm: number; quality: number; }
interface Props { lidarData?: { points?: LidarPoint[] }; className?: string; }

const MAX_DIST_M = 5.0;
const DEG = Math.PI / 180;
const MAX_PTS = 720;

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl") || (c.getContext as (s: string) => unknown)("experimental-webgl"));
  } catch { return false; }
}

// ╔══════════════════════════════════════════════════════╗
// ║  2-D FALLBACK — classic radar canvas                 ║
// ╚══════════════════════════════════════════════════════╝
function LidarRadar2D({ lidarData, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const W = canvas.clientWidth || 420, H = canvas.clientHeight || 420;
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const C = Math.min(W, H) / 2, ox = W / 2, oy = H / 2;
      ctx.fillStyle = "#060606"; ctx.fillRect(0, 0, W, H);
      for (let i = 1; i <= 4; i++) {
        ctx.beginPath(); ctx.arc(ox, oy, (C / 4) * i, 0, Math.PI * 2);
        ctx.strokeStyle = i === 4 ? "#2a2a2a" : "#181818"; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = "#333"; ctx.font = "9px monospace";
        ctx.fillText(`${Math.round(i * MAX_DIST_M * 1000 / 4)}mm`, ox + (C / 4) * i + 2, oy - 2);
      }
      ctx.strokeStyle = "#181818"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(ox, 0); ctx.lineTo(ox, H); ctx.moveTo(0, oy); ctx.lineTo(W, oy); ctx.stroke();
      const sw = ((Date.now() % 3000) / 3000) * Math.PI * 2;
      const grd = ctx.createRadialGradient(ox, oy, 0, ox, oy, C);
      grd.addColorStop(0, "rgba(255,176,0,0.12)"); grd.addColorStop(1, "rgba(255,176,0,0.01)");
      ctx.fillStyle = grd; ctx.beginPath(); ctx.moveTo(ox, oy);
      ctx.arc(ox, oy, C, sw - 0.6, sw); ctx.closePath(); ctx.fill();
      lidarData?.points?.forEach((pt) => {
        if (pt.distanceMm <= 0 || pt.distanceMm >= MAX_DIST_M * 1000) return;
        const r = (pt.distanceMm / (MAX_DIST_M * 1000)) * C;
        const rad = (pt.angle - 90) * DEG;
        const alpha = Math.min(1, pt.quality / 200);
        ctx.fillStyle = pt.distanceMm < 600 ? `rgba(255,60,60,${alpha})` : `rgba(255,176,0,${alpha})`;
        ctx.beginPath(); ctx.arc(ox + r * Math.cos(rad), oy + r * Math.sin(rad), pt.distanceMm < 600 ? 3 : 2, 0, Math.PI * 2); ctx.fill();
      });
      ctx.fillStyle = "#00e676"; ctx.beginPath(); ctx.arc(ox, oy, 4, 0, Math.PI * 2); ctx.fill();
      animRef.current = requestAnimationFrame(draw);
    };
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [lidarData]);

  return <canvas ref={canvasRef} className={className} style={{ display: "block", width: "100%", height: "100%" }} />;
}

// ╔══════════════════════════════════════════════════════╗
// ║  3-D LIDAR — Three.js WebGL point cloud              ║
// ╚══════════════════════════════════════════════════════╝
function LidarVisualizer3DInner({ lidarData, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ptGeoRef = useRef<THREE.BufferGeometry | null>(null);
  const posRef = useRef(new Float32Array(MAX_PTS * 3));
  const colRef = useRef(new Float32Array(MAX_PTS * 3));
  const sweepRef = useRef<THREE.Group | null>(null);
  const animRef = useRef(0);
  const orbit = useRef({ az: Math.PI / 6, el: 0.55, r: 7.5, dragging: false, lx: 0, ly: 0 });

  // ── Scene setup (once) ─────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.clientWidth || 640, H = canvas.clientHeight || 480;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 100);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050810);
    scene.fog = new THREE.FogExp2(0x050810, 0.055);

    // ── Lighting ─────────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0x101828, 6));
    const dirLight = new THREE.DirectionalLight(0x4488ff, 1.2);
    dirLight.position.set(3, 8, 3); dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(1024, 1024);
    scene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0x00e676, 0.4);
    fillLight.position.set(-5, 2, -3); scene.add(fillLight);
    const roverLight = new THREE.PointLight(0x00e676, 1.5, 3);
    roverLight.position.set(0, 0.5, 0); scene.add(roverLight);

    // ── Ground ───────────────────────────────────────────────────────────────
    const groundGeo = new THREE.PlaneGeometry(12, 12);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x070c12, roughness: 0.98, metalness: 0 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.01; ground.receiveShadow = true;
    scene.add(ground);

    // Grid
    const grid = new THREE.GridHelper(12, 48, 0x0a1525, 0x0a1525);
    grid.position.y = -0.008; scene.add(grid);

    // ── Scan plane (translucent disc showing scan area) ───────────────────────
    const planeGeo = new THREE.CircleGeometry(MAX_DIST_M, 64);
    const planeMat = new THREE.MeshBasicMaterial({ color: 0x001830, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false });
    const scanPlane = new THREE.Mesh(planeGeo, planeMat);
    scanPlane.rotation.x = -Math.PI / 2; scene.add(scanPlane);

    // ── Distance rings ────────────────────────────────────────────────────────
    const ringDistances = [1.25, 2.5, 3.75, 5.0];
    ringDistances.forEach((d, i) => {
      const geo = new THREE.TorusGeometry(d, 0.008, 6, 80);
      const alpha = 0.15 + i * 0.08;
      const mat = new THREE.MeshBasicMaterial({ color: 0x1a3a5a, transparent: true, opacity: alpha, depthWrite: false });
      const ring = new THREE.Mesh(geo, mat);
      ring.rotation.x = Math.PI / 2; scene.add(ring);
    });

    // N/S/E/W tick marks at outer ring
    for (let a = 0; a < 360; a += 30) {
      const rad = a * DEG;
      const r = MAX_DIST_M;
      const pts = [
        new THREE.Vector3(r * 0.97 * Math.cos(rad), 0, r * 0.97 * Math.sin(rad)),
        new THREE.Vector3(r * Math.cos(rad), 0, r * Math.sin(rad)),
      ];
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x1a3a5a, transparent: true, opacity: 0.4 }));
      scene.add(line);
    }

    // ── Rover model ───────────────────────────────────────────────────────────
    const roverGroup = new THREE.Group();

    // Body
    const bodyGeo = new THREE.BoxGeometry(0.28, 0.12, 0.38);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x0a1a0a, metalness: 0.85, roughness: 0.15 });
    const body = new THREE.Mesh(bodyGeo, bodyMat); body.position.y = 0.1; body.castShadow = true;
    roverGroup.add(body);

    // Wheels (4)
    const wMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.6, roughness: 0.5 });
    const wGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.04, 16);
    [[-0.18, 0, -0.16], [-0.18, 0, 0.16], [0.18, 0, -0.16], [0.18, 0, 0.16]].forEach(([x, y, z]) => {
      const w = new THREE.Mesh(wGeo, wMat);
      w.rotation.z = Math.PI / 2; w.position.set(x, y + 0.07, z); w.castShadow = true;
      roverGroup.add(w);
    });

    // LIDAR sensor (teal sphere on top)
    const sensorGeo = new THREE.SphereGeometry(0.04, 12, 8);
    const sensorMat = new THREE.MeshStandardMaterial({ color: 0x00e676, emissive: 0x00e676, emissiveIntensity: 0.6, metalness: 0.9 });
    const sensor = new THREE.Mesh(sensorGeo, sensorMat); sensor.position.y = 0.22;
    roverGroup.add(sensor);

    // Sensor glow ring
    const glowGeo = new THREE.TorusGeometry(0.06, 0.01, 6, 24);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x00e676, transparent: true, opacity: 0.6 });
    const glow = new THREE.Mesh(glowGeo, glowMat); glow.position.y = 0.22;
    roverGroup.add(glow);

    // Forward indicator (arrow stripe)
    const arrowGeo = new THREE.ConeGeometry(0.04, 0.1, 6);
    const arrowMat = new THREE.MeshStandardMaterial({ color: 0x00e676, emissive: 0x00e676, emissiveIntensity: 0.3 });
    const arrow = new THREE.Mesh(arrowGeo, arrowMat);
    arrow.position.set(0, 0.1, -0.2); arrow.rotation.x = Math.PI / 2; roverGroup.add(arrow);

    scene.add(roverGroup);

    // ── Sweep group ───────────────────────────────────────────────────────────
    const sweepGroup = new THREE.Group();
    // Sector mesh (triangle fan)
    const sectorSegs = 24;
    const sectorAngle = 0.55; // radians of trailing glow
    const posArr: number[] = [0, 0, 0];
    for (let i = 0; i <= sectorSegs; i++) {
      const a = (i / sectorSegs) * sectorAngle;
      posArr.push(MAX_DIST_M * Math.cos(a), 0, MAX_DIST_M * Math.sin(a));
    }
    const idxArr: number[] = [];
    for (let i = 0; i < sectorSegs; i++) idxArr.push(0, i + 1, i + 2);
    const sectorGeo = new THREE.BufferGeometry();
    sectorGeo.setAttribute("position", new THREE.Float32BufferAttribute(posArr, 3));
    sectorGeo.setIndex(idxArr);
    const sectorMat = new THREE.MeshBasicMaterial({ color: 0xffb000, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false });
    sweepGroup.add(new THREE.Mesh(sectorGeo, sectorMat));

    // Sweep line (bright leading edge)
    const sweepLinePts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(MAX_DIST_M, 0, 0)];
    const sweepLineGeo = new THREE.BufferGeometry().setFromPoints(sweepLinePts);
    const sweepLineMat = new THREE.LineBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0.7 });
    sweepGroup.add(new THREE.Line(sweepLineGeo, sweepLineMat));

    scene.add(sweepGroup);
    sweepRef.current = sweepGroup;

    // ── Point cloud ───────────────────────────────────────────────────────────
    const ptGeo = new THREE.BufferGeometry();
    ptGeo.setAttribute("position", new THREE.BufferAttribute(posRef.current, 3));
    ptGeo.setAttribute("color", new THREE.BufferAttribute(colRef.current, 3));
    ptGeo.setDrawRange(0, 0);

    const ptMat = new THREE.PointsMaterial({
      size: 0.055,
      vertexColors: true,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });
    const pointCloud = new THREE.Points(ptGeo, ptMat);
    scene.add(pointCloud);
    ptGeoRef.current = ptGeo;

    // ── Obstacle highlight rings ──────────────────────────────────────────────
    // (drawn per-frame via point cloud, visual enough)

    // ── Orbit controls ────────────────────────────────────────────────────────
    const onDown = (e: MouseEvent) => { orbit.current.dragging = true; orbit.current.lx = e.clientX; orbit.current.ly = e.clientY; };
    const onMove = (e: MouseEvent) => {
      if (!orbit.current.dragging) return;
      orbit.current.az -= (e.clientX - orbit.current.lx) * 0.010;
      orbit.current.el = Math.max(0.05, Math.min(1.4, orbit.current.el - (e.clientY - orbit.current.ly) * 0.008));
      orbit.current.lx = e.clientX; orbit.current.ly = e.clientY;
    };
    const onUp = () => { orbit.current.dragging = false; };
    const onWheel = (e: WheelEvent) => { e.preventDefault(); orbit.current.r = Math.max(2, Math.min(14, orbit.current.r + e.deltaY * 0.01)); };

    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    // ── Render loop ───────────────────────────────────────────────────────────
    const lookAt = new THREE.Vector3(0, 0, 0);
    const tick = () => {
      animRef.current = requestAnimationFrame(tick);

      // Auto-orbit
      if (!orbit.current.dragging) orbit.current.az += 0.0012;
      const { az, el, r } = orbit.current;
      camera.position.set(r * Math.cos(el) * Math.sin(az), r * Math.sin(el), r * Math.cos(el) * Math.cos(az));
      camera.lookAt(lookAt);

      // Sweep rotation
      if (sweepRef.current) {
        sweepRef.current.rotation.y = ((Date.now() % 3000) / 3000) * Math.PI * 2;
      }

      // Sensor glow pulse
      const pulse = 0.4 + 0.3 * Math.sin(Date.now() / 300);
      (sensorMat as THREE.MeshStandardMaterial).emissiveIntensity = pulse;

      // Responsive resize
      const cW = canvas.clientWidth, cH = canvas.clientHeight;
      if (canvas.width !== cW || canvas.height !== cH) {
        renderer.setSize(cW, cH, false);
        camera.aspect = cW / cH;
        camera.updateProjectionMatrix();
      }

      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(animRef.current);
      canvas.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      canvas.removeEventListener("wheel", onWheel);
      renderer.dispose();
      ptGeoRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Update point cloud when LIDAR data changes ────────────────────────────
  useEffect(() => {
    const ptGeo = ptGeoRef.current;
    if (!ptGeo) return;

    const pts = lidarData?.points ?? [];
    let count = 0;
    const pos = posRef.current;
    const col = colRef.current;

    for (const pt of pts) {
      if (count >= MAX_PTS) break;
      if (pt.distanceMm <= 0 || pt.distanceMm >= MAX_DIST_M * 1000) continue;
      const dist = pt.distanceMm / 1000;
      const angle = pt.angle * DEG;
      const alpha = Math.min(1, pt.quality / 200);

      // Convert polar → Cartesian in XZ plane
      pos[count * 3]     = dist * Math.cos(angle);
      pos[count * 3 + 1] = 0;
      pos[count * 3 + 2] = -dist * Math.sin(angle);

      // Color: red-orange for close, amber for mid, green for far
      if (pt.distanceMm < 600) {
        col[count * 3] = alpha; col[count * 3 + 1] = 0.15 * alpha; col[count * 3 + 2] = 0.1 * alpha;
      } else if (pt.distanceMm < 2000) {
        col[count * 3] = alpha; col[count * 3 + 1] = 0.69 * alpha; col[count * 3 + 2] = 0;
      } else {
        col[count * 3] = 0.3 * alpha; col[count * 3 + 1] = 0.9 * alpha; col[count * 3 + 2] = 0.4 * alpha;
      }
      count++;
    }

    ptGeo.setDrawRange(0, count);
    ptGeo.attributes.position.needsUpdate = true;
    ptGeo.attributes.color.needsUpdate = true;
  }, [lidarData]);

  return (
    <div className={className} style={{ position: "relative", width: "100%", height: "100%" }}>
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%", cursor: "grab" }}
        className="text-[color:var(--neon-green)] bg-[color:var(--button-outline)] border-t-[color:var(--neon-green)] border-r-[color:var(--neon-green)] border-b-[color:var(--neon-green)] border-l-[color:var(--neon-green)]" />
      {/* HUD overlay */}
      <div style={{ position: "absolute", top: 8, left: 10, pointerEvents: "none" }} className="font-mono text-[9px] space-y-0.5">
        <div className="text-[#00e676]/60">● LIDAR 3D</div>
        <div className="text-muted-foreground/40">DRAG · SCROLL</div>
      </div>
      <div style={{ position: "absolute", top: 8, right: 10, pointerEvents: "none" }} className="font-mono text-[9px] text-right space-y-0.5">
        {[1.25, 2.5, 3.75, 5.0].map((d) => (
          <div key={d} className="text-[#1a3a5a] text-[8px]">{d * 1000}mm</div>
        ))}
      </div>
      {/* Point count */}
      <div style={{ position: "absolute", bottom: 8, left: 10, pointerEvents: "none" }} className="font-mono text-[8px] text-muted-foreground/30">
        {lidarData?.points?.length ?? 0} pts
      </div>
      {/* Legend */}
      <div style={{ position: "absolute", bottom: 8, right: 10, pointerEvents: "none" }} className="font-mono text-[8px] space-y-0.5 text-right">
        <div><span style={{ color: "#ff3030" }}>■</span> &lt;600mm</div>
        <div><span style={{ color: "#ffb000" }}>■</span> &lt;2m</div>
        <div><span style={{ color: "#4de87a" }}>■</span> &gt;2m</div>
      </div>
    </div>
  );
}

// ╔══════════════════════════════════════════════════════╗
// ║  PUBLIC EXPORT                                       ║
// ╚══════════════════════════════════════════════════════╝
export function LidarVisualizer3D(props: Props) {
  const [use3D] = useState(() => hasWebGL());
  if (use3D) return <LidarVisualizer3DInner {...props} />;
  return <LidarRadar2D {...props} />;
}
