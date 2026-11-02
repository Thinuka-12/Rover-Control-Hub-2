import { useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/layout";
import { useOperatorRole } from "@/hooks/use-operator-role";
import { useArtifactRecords, type ArtifactRecord, type VerificationStatus } from "@/hooks/use-artifact-records";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Archive, Search, CircleCheck as CheckCircle2, Circle as XCircle, Clock, FileImage, MapPin, TriangleAlert as AlertTriangle, RotateCcw, Trash as Trash2, Save, X } from "lucide-react";

const STATUS_META: Record<VerificationStatus, { label: string; color: string; className: string; icon: typeof Clock }> = {
  pending: { label: "PENDING", color: "#ffb000", className: "border-amber-500/40 bg-amber-500/10 text-amber-300", icon: Clock },
  confirmed: { label: "CONFIRMED", color: "#00e676", className: "border-green-500/40 bg-green-500/10 text-green-300", icon: CheckCircle2 },
  rejected: { label: "REJECTED", color: "#ff4444", className: "border-red-500/40 bg-red-500/10 text-red-300", icon: XCircle },
};

const LABEL_OPTIONS = ["Rock Formation", "Equipment", "Debris", "Bio Sample", "Anomaly"];

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatGps(lat: number | null, lng: number | null): string {
  if (lat === null || lng === null) return "Not recorded";
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

function StatCard({ label, value, icon: Icon, color, className }: { label: string; value: number; icon: typeof Archive; color: string; className: string }) {
  return (
    <div className={`rounded-lg border p-4 ${className}`} data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold tracking-[0.15em] text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4" style={{ color }} />
      </div>
      <div className="mt-2 text-3xl font-bold tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}

function ImagePreview({ url, label }: { url: string | null; label: string }) {
  if (url) {
    return <img src={url} alt={`Artifact ${label}`} className="w-full h-full object-cover" />;
  }
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-black/40 border border-border rounded">
      <FileImage className="h-8 w-8 text-muted-foreground/30" />
      <span className="text-[10px] text-muted-foreground/50">NO IMAGE LINKED</span>
    </div>
  );
}

function ArtifactCard({ record, onOpen }: { record: ArtifactRecord; onOpen: (r: ArtifactRecord) => void }) {
  const sm = STATUS_META[record.status];
  const StatusIcon = sm.icon;
  return (
    <Card
      className="border-border bg-card cursor-pointer hover:border-primary/40 transition-colors overflow-hidden"
      onClick={() => onOpen(record)}
      data-testid={`artifact-card-${record.displayId}`}
    >
      <div className="flex">
        <div className="w-24 h-24 shrink-0 border-r border-border">
          <ImagePreview url={record.imageUrl} label={record.displayId} />
        </div>
        <div className="flex-1 min-w-0 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-primary tracking-wider">{record.displayId}</span>
                {record.isDemo && (
                  <span className="text-[8px] font-bold tracking-wider text-amber-300/70 border border-amber-500/30 px-1 rounded">DEMO</span>
                )}
              </div>
              <span className="block text-sm font-semibold text-foreground mt-0.5 truncate">{record.label}</span>
            </div>
            <Badge variant="outline" className={`text-[9px] ${sm.className}`}>
              <StatusIcon className="h-3 w-3 mr-1" />
              {sm.label}
            </Badge>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
            <span>{formatDateTime(record.detectedAt)}</span>
            {record.confidence !== null && (
              <span className={record.confidence >= 70 ? "text-green-400" : record.confidence >= 50 ? "text-amber-400" : "text-red-400"}>
                CONF {Math.round(record.confidence)}%
              </span>
            )}
            <span className="flex items-center gap-0.5">
              <MapPin className="h-2.5 w-2.5" />
              {record.lat !== null ? "GPS" : "—"}
            </span>
          </div>
          {record.notes && (
            <p className="mt-1.5 text-[10px] text-muted-foreground/70 line-clamp-2">{record.notes}</p>
          )}
        </div>
      </div>
    </Card>
  );
}

function ReviewDialog({
  record,
  open,
  onClose,
  onSaveStatus,
  onSaveNotes,
  onDelete,
}: {
  record: ArtifactRecord | null;
  open: boolean;
  onClose: () => void;
  onSaveStatus: (id: string, status: VerificationStatus) => void;
  onSaveNotes: (id: string, notes: string) => void;
  onDelete: (id: string) => void;
}) {
  const { toast } = useToast();
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<VerificationStatus>("pending");

  useEffect(() => {
    if (record) {
      setNotes(record.notes);
      setStatus(record.status);
    }
  }, [record?.id]);

  if (!record) return null;

  const handleSaveNotes = () => {
    onSaveNotes(record.id, notes);
    toast({ title: "Notes saved", description: `Operator notes updated for ${record.displayId}.` });
  };

  const handleStatusChange = (s: VerificationStatus) => {
    setStatus(s);
    onSaveStatus(record.id, s);
    toast({ title: "Status updated", description: `${record.displayId} marked as ${STATUS_META[s].label}.` });
  };

  const handleDelete = () => {
    onDelete(record.id);
    toast({ title: "Record deleted", description: `${record.displayId} removed from register.`, variant: "destructive" });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl bg-card border-border font-mono">
        <DialogHeader>
          <DialogTitle className="text-primary tracking-widest flex items-center gap-2">
            <Archive className="h-4 w-4" />
            {record.displayId}
            {record.isDemo && (
              <span className="text-[9px] font-bold tracking-wider text-amber-300/70 border border-amber-500/30 px-1.5 py-0.5 rounded">DEMO RECORD</span>
            )}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {record.source} · Review and verify artifact detection record
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-4">
          <div className="space-y-3">
            <div className="aspect-square rounded-lg overflow-hidden border border-border">
              <ImagePreview url={record.imageUrl} label={record.displayId} />
            </div>
            <div className="text-[10px] text-muted-foreground/60 text-center">
              Image preview area
            </div>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Detection Label</Label>
                <div className="mt-1 text-sm font-semibold text-foreground">{record.label}</div>
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Confidence</Label>
                <div className="mt-1 text-sm font-semibold" style={{ color: record.confidence !== null ? (record.confidence >= 70 ? "#00e676" : record.confidence >= 50 ? "#ffb000" : "#ff4444") : undefined }}>
                  {record.confidence !== null ? `${Math.round(record.confidence)}%` : "Not recorded"}
                </div>
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Date / Time</Label>
                <div className="mt-1 text-xs text-foreground">{formatDateTime(record.detectedAt)}</div>
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">GPS Coordinates</Label>
                <div className="mt-1 text-xs text-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3 text-muted-foreground" />
                  {formatGps(record.lat, record.lng)}
                </div>
              </div>
            </div>

            <div>
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Verification Status</Label>
              <div className="mt-2 flex gap-2">
                {(Object.keys(STATUS_META) as VerificationStatus[]).map((s) => {
                  const m = STATUS_META[s];
                  const Icon = m.icon;
                  const active = status === s;
                  return (
                    <Button
                      key={s}
                      variant="outline"
                      size="sm"
                      onClick={() => handleStatusChange(s)}
                      className={`text-[10px] font-bold tracking-wider border transition-colors ${active ? m.className : "border-border text-muted-foreground hover:text-foreground"}`}
                      data-testid={`status-btn-${s}`}
                    >
                      <Icon className="h-3 w-3 mr-1" />
                      {m.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div>
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wider" htmlFor="artifact-notes">Operator Notes</Label>
              <Textarea
                id="artifact-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add review notes, observations, or verification details..."
                className="mt-1 min-h-[80px] font-mono text-xs bg-background border-border"
                data-testid="artifact-notes-input"
              />
              <Button onClick={handleSaveNotes} size="sm" className="mt-2 text-[10px] tracking-wider">
                <Save className="h-3 w-3 mr-1" /> SAVE NOTES
              </Button>
            </div>
          </div>
        </div>

        {record.isDemo && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <AlertTriangle className="h-4 w-4 text-amber-300 shrink-0 mt-0.5" />
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              This is a <span className="text-amber-300 font-bold">demonstration record</span> seeded for UI preview. It is not a real rover detection and was not produced by a live YOLO model, ESP32 camera, or GPS fix.
            </p>
          </div>
        )}

        <DialogFooter className="flex-row gap-2 justify-between sm:justify-between">
          <Button variant="outline" size="sm" onClick={handleDelete} className="text-destructive border-destructive/40 hover:bg-destructive/10 text-[10px]">
            <Trash2 className="h-3 w-3 mr-1" /> DELETE
          </Button>
          <Button variant="outline" size="sm" onClick={onClose} className="text-[10px]">
            <X className="h-3 w-3 mr-1" /> CLOSE
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddRecordDialog({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (partial: Partial<Omit<ArtifactRecord, "id" | "displayId" | "isDemo">>) => void;
}) {
  const { toast } = useToast();
  const [label, setLabel] = useState(LABEL_OPTIONS[0]);
  const [confidence, setConfidence] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [notes, setNotes] = useState("");

  const reset = () => {
    setLabel(LABEL_OPTIONS[0]);
    setConfidence("");
    setLat("");
    setLng("");
    setNotes("");
  };

  const handleAdd = () => {
    onAdd({
      label,
      confidence: confidence.trim() !== "" ? Math.min(100, Math.max(0, parseFloat(confidence))) : null,
      lat: lat.trim() !== "" ? parseFloat(lat) : null,
      lng: lng.trim() !== "" ? parseFloat(lng) : null,
      notes: notes.trim(),
      status: "pending",
      detectedAt: new Date().toISOString(),
      source: "MANUAL ENTRY",
    });
    toast({ title: "Record added", description: `New ${label} artifact record created.` });
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-lg bg-card border-border font-mono">
        <DialogHeader>
          <DialogTitle className="text-primary tracking-widest flex items-center gap-2">
            <Archive className="h-4 w-4" /> ADD ARTIFACT RECORD
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Manually create a new candidate artifact record for review.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Detection Label</Label>
            <Select value={label} onValueChange={setLabel}>
              <SelectTrigger className="mt-1 font-mono bg-background border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LABEL_OPTIONS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Confidence %</Label>
              <Input type="number" min={0} max={100} value={confidence} onChange={(e) => setConfidence(e.target.value)}
                placeholder="—" className="mt-1 font-mono bg-background border-border" />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Latitude</Label>
              <Input value={lat} onChange={(e) => setLat(e.target.value)}
                placeholder="—" className="mt-1 font-mono bg-background border-border" />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Longitude</Label>
              <Input value={lng} onChange={(e) => setLng(e.target.value)}
                placeholder="—" className="mt-1 font-mono bg-background border-border" />
            </div>
          </div>

          <div>
            <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Operator Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Initial observations..." className="mt-1 min-h-[60px] font-mono text-xs bg-background border-border" />
          </div>

          <p className="text-[9px] text-muted-foreground/60 leading-relaxed">
            Confidence and GPS fields are optional. Leave blank if not available.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => { reset(); onClose(); }} className="text-[10px]">
            <X className="h-3 w-3 mr-1" /> CANCEL
          </Button>
          <Button onClick={handleAdd} size="sm" className="text-[10px]">
            <Save className="h-3 w-3 mr-1" /> ADD RECORD
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ArtifactsPage() {
  const { currentMeta } = useOperatorRole();
  const { records, counts, setStatus, setNotes, deleteRecord, addRecord, resetToDemo } = useArtifactRecords();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | VerificationStatus>("all");
  const [selected, setSelected] = useState<ArtifactRecord | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const haystack = `${r.displayId} ${r.label} ${r.notes}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [records, search, statusFilter]);

  const handleOpen = (r: ArtifactRecord) => {
    setSelected(r);
    setDialogOpen(true);
  };

  const handleClose = () => {
    setDialogOpen(false);
    setSelected(null);
  };

  const handleResetDemo = () => {
    resetToDemo();
    toast({ title: "Demo records restored", description: "Artifact register reset to demonstration dataset." });
  };

  return (
    <Layout>
      <div className="space-y-4" data-testid="artifacts-page">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Archive className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-bold tracking-widest text-primary">ARTIFACT RECORDS</h1>
            </div>
            <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              Detection register &amp; verification · {currentMeta.label}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleResetDemo} className="text-[10px] tracking-wider">
              <RotateCcw className="h-3 w-3 mr-1" /> RESET DEMO
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)} className="text-[10px] tracking-wider">
              <Archive className="h-3 w-3 mr-1" /> ADD RECORD
            </Button>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <AlertTriangle className="h-4 w-4 text-amber-300 shrink-0 mt-0.5" />
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Records are stored locally in the browser. Demonstration records are clearly labelled and are <span className="text-amber-300 font-bold">not</span> real rover detections — they were not produced by a live YOLO model, ESP32 camera, or GPS fix.
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="TOTAL" value={counts.total} icon={Archive} color="#00d9ff" className="border-border bg-card" />
          <StatCard label="PENDING" value={counts.pending} icon={Clock} color="#ffb000" className="border-amber-500/30 bg-amber-500/5" />
          <StatCard label="CONFIRMED" value={counts.confirmed} icon={CheckCircle2} color="#00e676" className="border-green-500/30 bg-green-500/5" />
          <StatCard label="REJECTED" value={counts.rejected} icon={XCircle} color="#ff4444" className="border-red-500/30 bg-red-500/5" />
        </div>

        <Card className="border-border bg-card">
          <CardHeader className="pb-3 border-b border-border">
            <CardTitle className="text-primary tracking-widest uppercase text-sm flex items-center gap-2">
              <Search className="h-4 w-4" /> ARTIFACT REGISTER
            </CardTitle>
            <CardDescription className="text-[10px]">Search and filter all candidate records</CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by ID, label, or notes..."
                  className="pl-8 font-mono bg-background border-border"
                  data-testid="artifact-search"
                />
              </div>
              <Select value={statusFilter} onValueChange={(v: "all" | VerificationStatus) => setStatusFilter(v)}>
                <SelectTrigger className="w-full sm:w-44 font-mono bg-background border-border" data-testid="artifact-status-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground/50">
                <Archive className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-xs">No records match the current filter.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {filtered.map((r) => (
                  <ArtifactCard key={r.id} record={r} onOpen={handleOpen} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ReviewDialog
        record={selected}
        open={dialogOpen}
        onClose={handleClose}
        onSaveStatus={setStatus}
        onSaveNotes={setNotes}
        onDelete={deleteRecord}
      />

      <AddRecordDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={addRecord}
      />
    </Layout>
  );
}
