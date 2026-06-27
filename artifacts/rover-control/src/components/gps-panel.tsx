import { useState, useEffect } from "react";
import { X, MapPin, Download, Crosshair, Circle, ZoomIn, ZoomOut } from "lucide-react";
import type { ArtifactMarker } from "@/components/artifact-detection";

const BASE_LAT = 37.77491;
const BASE_LNG = -122.41942;
const M_PER_DEG_LAT = 111_000;
const M_PER_DEG_LNG = 111_000 * Math.cos((BASE_LAT * Math.PI) / 180);

function posToGps(x: number, y: number) {
  return {
    lat: BASE_LAT + y / M_PER_DEG_LAT,
    lng: BASE_LNG + x / M_PER_DEG_LNG,
  };
}

function fmtDMS(deg: number, posLabel: string, negLabel: string) {
  const abs = Math.abs(deg);
  const d = Math.floor(abs);
  const m = Math.floor((abs - d) * 60);
  const s = ((abs - d) * 60 - m) * 60;
  const label = deg >= 0 ? posLabel : negLabel;
  return `${d}° ${m}' ${s.toFixed(3)}" ${label}`;
}

interface TrailPoint { lat: number; lng: number; timestamp: number; }

interface Props {
  onClose: () => void;
  currentPos: { x: number; y: number; headingDeg: number };
  artifactMarkers?: ArtifactMarker[];
}

export function GpsPanel({ onClose, currentPos, artifactMarkers = [] }: Props) {
  const [geofenceRadius, setGeofenceRadius] = useState(50);
  const [geofenceActive, setGeofenceActive] = useState(false);
  const [homeGps] = useState(() => posToGps(0, 0));
  const [trail, setTrail] = useState<TrailPoint[]>([]);
  const [accuracy] = useState(() => 1.5 + Math.random() * 3);
  const [satellites] = useState(() => Math.floor(8 + Math.random() * 6));
  const [altitude] = useState(() => 42 + Math.random() * 10);

  const gps = posToGps(currentPos.x, currentPos.y);

  // Record trail
  useEffect(() => {
    const pt: TrailPoint = { ...gps, timestamp: Date.now() };
    setTrail((prev) => {
      const last = prev[prev.length - 1];
      if (last && Math.abs(last.lat - pt.lat) < 0.000001 && Math.abs(last.lng - pt.lng) < 0.000001) {
        return prev;
      }
      return [...prev.slice(-199), pt];
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPos.x, currentPos.y]);

  const distFromOrigin = Math.sqrt(currentPos.x ** 2 + currentPos.y ** 2);
  const outsideGeofence = geofenceActive && distFromOrigin > geofenceRadius;

  const exportGeoJSON = () => {
    const geojson = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { name: "Rover Current Position", timestamp: new Date().toISOString() },
          geometry: { type: "Point", coordinates: [gps.lng, gps.lat] },
        },
        {
          type: "Feature",
          properties: { name: "Home Position" },
          geometry: { type: "Point", coordinates: [homeGps.lng, homeGps.lat] },
        },
        {
          type: "Feature",
          properties: { name: "Breadcrumb Trail" },
          geometry: { type: "LineString", coordinates: trail.map((p) => [p.lng, p.lat]) },
        },
        ...(geofenceActive ? [{
          type: "Feature",
          properties: { name: "Geofence", radius_m: geofenceRadius },
          geometry: { type: "Point", coordinates: [homeGps.lng, homeGps.lat] },
        }] : []),
        ...artifactMarkers.map((m) => ({
          type: "Feature",
          properties: { name: m.type, detectedAt: new Date(m.timestamp).toISOString() },
          geometry: { type: "Point", coordinates: [m.lng, m.lat] },
        })),
      ],
    };
    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: "application/geo+json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `rover-gps-${Date.now()}.geojson`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportKml = () => {
    const coords = trail.map((p) => `${p.lng},${p.lat},0`).join("\n");
    const artifactPlacemarks = artifactMarkers.map((m) => `
    <Placemark>
      <name>${m.type} (${new Date(m.timestamp).toLocaleTimeString()})</name>
      <Point><coordinates>${m.lng},${m.lat},0</coordinates></Point>
    </Placemark>`).join("");
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Rover Path</name>
    <Placemark><name>Home Position</name>
      <Point><coordinates>${homeGps.lng},${homeGps.lat},0</coordinates></Point>
    </Placemark>
    <Placemark><name>Current Position</name>
      <Point><coordinates>${gps.lng},${gps.lat},0</coordinates></Point>
    </Placemark>
    <Placemark><name>Breadcrumb Trail</name>
      <LineString><coordinates>${coords}</coordinates></LineString>
    </Placemark>${artifactPlacemarks}
  </Document>
</kml>`;
    const blob = new Blob([kml], { type: "application/vnd.google-earth.kml+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `rover-path-${Date.now()}.kml`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportArtifactCsv = () => {
    const header = "id,type,timestamp,lat,lng,rover_x,rover_y";
    const rows = artifactMarkers.map((m) =>
      `${m.id},${m.type},${new Date(m.timestamp).toISOString()},${m.lat.toFixed(8)},${m.lng.toFixed(8)},${m.x.toFixed(3)},${m.y.toFixed(3)}`
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `artifacts-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-end bg-black/60 backdrop-blur-sm font-mono"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="h-full w-[380px] bg-[#050d0a] border-l border-green-500/20 flex flex-col overflow-hidden shadow-2xl"
        style={{ boxShadow: "0 0 40px rgba(0,230,118,0.05) inset" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-green-500/20 bg-black/40 shrink-0">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-green-400" />
            <span className="font-bold text-[12px] tracking-widest text-green-400">GPS NAVIGATION</span>
            {outsideGeofence && (
              <span className="text-[10px] text-red-400 border border-red-500/40 px-1 animate-pulse">GEOFENCE!</span>
            )}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">

          {/* Main coords display */}
          <div className="px-4 py-4 border-b border-border bg-black/30 space-y-3">
            <div className="text-center space-y-1">
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-2">Live Position</div>
              <div className="text-[15px] font-bold text-green-400 tabular-nums leading-tight" style={{ textShadow: "0 0 20px rgba(0,230,118,0.3)" }}>
                {gps.lat.toFixed(7)}°
              </div>
              <div className="text-[11px] text-green-400/60 font-mono">{fmtDMS(gps.lat, "N", "S")}</div>
              <div className="text-[15px] font-bold text-green-400 tabular-nums leading-tight mt-1">
                {gps.lng.toFixed(7)}°
              </div>
              <div className="text-[11px] text-green-400/60 font-mono">{fmtDMS(gps.lng, "E", "W")}</div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="border border-border rounded p-2">
                <div className="text-[9px] text-muted-foreground uppercase">Satellites</div>
                <div className="text-[14px] font-bold text-green-400">{satellites}</div>
              </div>
              <div className="border border-border rounded p-2">
                <div className="text-[9px] text-muted-foreground uppercase">Accuracy</div>
                <div className="text-[14px] font-bold text-green-400">{accuracy.toFixed(1)}m</div>
              </div>
              <div className="border border-border rounded p-2">
                <div className="text-[9px] text-muted-foreground uppercase">Altitude</div>
                <div className="text-[14px] font-bold text-green-400">{altitude.toFixed(1)}m</div>
              </div>
            </div>
          </div>

          {/* Odometry */}
          <div className="px-4 py-3 border-b border-border space-y-2">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Rover Odometry</div>
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className="flex justify-between"><span className="text-muted-foreground">X (East)</span><span className="text-green-400 font-mono">{currentPos.x.toFixed(3)} m</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Y (North)</span><span className="text-green-400 font-mono">{currentPos.y.toFixed(3)} m</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Heading</span><span className="text-green-400 font-mono">{Math.round(currentPos.headingDeg)}°</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Dist Origin</span><span className="text-green-400 font-mono">{distFromOrigin.toFixed(2)} m</span></div>
            </div>
          </div>

          {/* Home pin */}
          <div className="px-4 py-3 border-b border-border space-y-1.5">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Home Pin (Origin)</div>
            <div className="flex items-center gap-2 text-[10px]">
              <MapPin className="w-3 h-3 text-pink-400 shrink-0" />
              <span className="font-mono text-pink-300">{homeGps.lat.toFixed(6)}, {homeGps.lng.toFixed(6)}</span>
            </div>
            <div className="text-[9px] text-muted-foreground">
              {distFromOrigin < 1 ? "Rover is at home" : `${distFromOrigin.toFixed(2)} m from home`}
            </div>
          </div>

          {/* Geofence */}
          <div className="px-4 py-3 border-b border-border space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Circle className="w-3.5 h-3.5 text-green-400/70" />
                <span className="text-[10px] font-bold text-green-400 uppercase tracking-wider">Geofence</span>
              </div>
              <button
                onClick={() => setGeofenceActive((a) => !a)}
                className={`px-2 py-0.5 border rounded text-[10px] font-bold transition-colors ${geofenceActive ? "border-green-500/50 text-green-400 bg-green-500/10" : "border-border text-muted-foreground hover:border-green-500/30"}`}
              >
                {geofenceActive ? "ACTIVE" : "OFF"}
              </button>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground">Radius from home</span>
                <span className={`font-mono font-bold ${outsideGeofence ? "text-red-400 animate-pulse" : "text-green-400"}`}>{geofenceRadius}m</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setGeofenceRadius((r) => Math.max(5, r - 5))} className="w-6 h-6 border border-border rounded text-muted-foreground hover:text-green-400 hover:border-green-500/40 flex items-center justify-center"><ZoomOut className="w-3 h-3" /></button>
                <input
                  type="range" min={5} max={500} step={5} value={geofenceRadius}
                  onChange={(e) => setGeofenceRadius(Number(e.target.value))}
                  className="flex-1 h-1.5 rounded appearance-none cursor-pointer"
                  style={{ accentColor: "#00e676" }}
                />
                <button onClick={() => setGeofenceRadius((r) => Math.min(500, r + 5))} className="w-6 h-6 border border-border rounded text-muted-foreground hover:text-green-400 hover:border-green-500/40 flex items-center justify-center"><ZoomIn className="w-3 h-3" /></button>
              </div>
              {outsideGeofence && (
                <div className="flex items-center gap-1.5 text-[10px] text-red-400 border border-red-500/30 bg-red-500/8 px-2 py-1 rounded animate-pulse">
                  ⚠ Rover is {(distFromOrigin - geofenceRadius).toFixed(1)}m outside geofence boundary
                </div>
              )}
            </div>
          </div>

          {/* Artifact markers */}
          {artifactMarkers.length > 0 && (
            <div className="px-4 py-3 border-b border-border space-y-1.5">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
                <span>Detected Artifacts</span>
                <div className="flex items-center gap-2">
                  <span className="text-cyan-400">{artifactMarkers.length} pins</span>
                  <button onClick={exportArtifactCsv}
                    className="flex items-center gap-1 text-muted-foreground hover:text-cyan-400 transition-colors px-1.5 py-0.5 border border-border rounded">
                    <Download className="w-2.5 h-2.5" /> CSV
                  </button>
                </div>
              </div>
              <div className="space-y-1 max-h-36 overflow-y-auto">
                {artifactMarkers.slice(-10).reverse().map((m) => (
                  <div key={m.id} className="flex items-center gap-2 text-[9px] py-0.5 border-b border-border/30">
                    <MapPin className="w-2.5 h-2.5 text-cyan-500/60 shrink-0" />
                    <span className="font-bold text-cyan-400/80 shrink-0">{m.type}</span>
                    <span className="font-mono text-muted-foreground/60 flex-1 truncate">{m.lat.toFixed(5)}, {m.lng.toFixed(5)}</span>
                    <span className="text-muted-foreground/40 shrink-0">{new Date(m.timestamp).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Breadcrumb trail */}
          <div className="px-4 py-3 space-y-1">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
              <span>Breadcrumb Trail</span>
              <span className="text-green-400">{trail.length} pts</span>
            </div>
            <div className="space-y-0.5 max-h-36 overflow-y-auto">
              {trail.slice(-10).reverse().map((pt, i) => (
                <div key={pt.timestamp} className="flex items-center gap-2 text-[9px] text-muted-foreground py-0.5">
                  <Crosshair className="w-2.5 h-2.5 text-green-500/30 shrink-0" />
                  <span className="font-mono flex-1 truncate">{pt.lat.toFixed(6)}, {pt.lng.toFixed(6)}</span>
                  <span className="text-muted-foreground/40">{i === 0 ? "now" : new Date(pt.timestamp).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Export footer */}
        <div className="px-3 py-2.5 border-t border-border bg-black/30 shrink-0 flex items-center gap-2 flex-wrap">
          <button onClick={exportGeoJSON}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-green-500/40 text-green-400 rounded text-[10px] hover:bg-green-500/10 transition-colors">
            <Download className="w-3 h-3" /> GeoJSON
          </button>
          <button onClick={exportKml}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-green-500/30 text-green-400/80 rounded text-[10px] hover:bg-green-500/8 transition-colors">
            <Download className="w-3 h-3" /> KML
          </button>
          {artifactMarkers.length > 0 && (
            <button onClick={exportArtifactCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-cyan-500/30 text-cyan-400/80 rounded text-[10px] hover:bg-cyan-500/8 transition-colors">
              <Download className="w-3 h-3" /> Artifacts CSV
            </button>
          )}
          <span className="ml-auto text-[9px] text-muted-foreground/30 font-mono">SIM GPS</span>
        </div>
      </div>
    </div>
  );
}
