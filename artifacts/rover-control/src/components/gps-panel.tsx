import { useState, useEffect } from "react";
import { X, MapPin, Download, Crosshair, Circle, ZoomIn, ZoomOut } from "lucide-react";

interface Props {
  onClose: () => void;
  currentPos: { x: number; y: number; headingDeg: number };
}

// Simulated GPS base origin — San Francisco demo coords
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

export function GpsPanel({ onClose, currentPos }: Props) {
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

  // Distance from geofence center (origin)
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
          properties: { name: "Breadcrumb Trail" },
          geometry: {
            type: "LineString",
            coordinates: trail.map((p) => [p.lng, p.lat]),
          },
        },
        ...(geofenceActive ? [{
          type: "Feature",
          properties: { name: "Geofence", radius_m: geofenceRadius },
          geometry: { type: "Point", coordinates: [homeGps.lng, homeGps.lat] },
        }] : []),
      ],
    };
    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: "application/geo+json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `rover-gps-${Date.now()}.geojson`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportKml = () => {
    const coords = trail.map((p) => `${p.lng},${p.lat},0`).join("\n");
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Rover Path</name>
    <Placemark><name>Current Position</name>
      <Point><coordinates>${gps.lng},${gps.lat},0</coordinates></Point>
    </Placemark>
    <Placemark><name>Breadcrumb Trail</name>
      <LineString><coordinates>${coords}</coordinates></LineString>
    </Placemark>
  </Document>
</kml>`;
    const blob = new Blob([kml], { type: "application/vnd.google-earth.kml+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `rover-path-${Date.now()}.kml`; a.click();
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

        {/* Main coords display */}
        <div className="px-4 py-4 border-b border-border bg-black/30 shrink-0 space-y-3">
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

          {/* Satellite / accuracy row */}
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

        {/* Odometry-derived data */}
        <div className="px-4 py-3 border-b border-border shrink-0 space-y-2">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Rover Odometry</div>
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div className="flex justify-between"><span className="text-muted-foreground">X (East)</span><span className="text-green-400 font-mono">{currentPos.x.toFixed(3)} m</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Y (North)</span><span className="text-green-400 font-mono">{currentPos.y.toFixed(3)} m</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Heading</span><span className="text-green-400 font-mono">{Math.round(currentPos.headingDeg)}°</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Dist Origin</span><span className="text-green-400 font-mono">{distFromOrigin.toFixed(2)} m</span></div>
          </div>
        </div>

        {/* Geofence */}
        <div className="px-4 py-3 border-b border-border shrink-0 space-y-2.5">
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

        {/* Breadcrumb trail info */}
        <div className="flex-1 px-4 py-3 overflow-y-auto space-y-1">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
            <span>Breadcrumb Trail</span>
            <span className="text-green-400">{trail.length} pts</span>
          </div>
          <div className="space-y-0.5 max-h-40 overflow-y-auto">
            {trail.slice(-10).reverse().map((pt, i) => (
              <div key={pt.timestamp} className="flex items-center gap-2 text-[9px] text-muted-foreground py-0.5">
                <Crosshair className="w-2.5 h-2.5 text-green-500/30 shrink-0" />
                <span className="font-mono flex-1 truncate">{pt.lat.toFixed(6)}, {pt.lng.toFixed(6)}</span>
                <span className="text-muted-foreground/40">{i === 0 ? "now" : new Date(pt.timestamp).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Export footer */}
        <div className="px-3 py-2.5 border-t border-border bg-black/30 shrink-0 flex items-center gap-2">
          <button onClick={exportGeoJSON}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-green-500/40 text-green-400 rounded text-[10px] hover:bg-green-500/10 transition-colors">
            <Download className="w-3 h-3" /> GeoJSON
          </button>
          <button onClick={exportKml}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-green-500/30 text-green-400/80 rounded text-[10px] hover:bg-green-500/8 transition-colors">
            <Download className="w-3 h-3" /> KML
          </button>
          <span className="ml-auto text-[9px] text-muted-foreground/30 font-mono">SIM GPS</span>
        </div>
      </div>
    </div>
  );
}
