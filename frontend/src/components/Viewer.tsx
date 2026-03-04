import { useState, useEffect, useCallback, useRef } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import type {
  JobResult,
  Point,
  AppSettings,
  ExtractResponse,
  PolygonValidationResult,
} from "../types";
import Sidebar from "./Sidebar";
import LoadingOverlay from "./LoadingOverlay";

/**
 * Viewer — displays a rasterised PDF page inside a zoomable / pannable canvas
 * with a collapsible sidebar for tools, polygon management, and AI extraction.
 *
 * The ``<img>`` element uses its natural (pixel) dimensions so that every pixel in
 * the 300-DPI PNG maps 1:1 to screen pixels at zoom = 1x.  Any future overlay
 * layer should position elements in this same pixel coordinate system.
 *
 * Pixel <-> PDF-point conversion:
 *   const SCALE = dpi / 72;          // 300/72 ~ 4.1667
 *   pdfPt  = pixel / SCALE;
 *   pixel  = pdfPt * SCALE;
 */

interface PolygonData {
  id: string;
  vertices: Point[];
  valid: boolean;
  validationReason: string | null;
  label: string;
}

interface Props {
  job: JobResult;
  settings: AppSettings;
  onReset: () => void;
  onOpenSettings: () => void;
  onAddToast: (
    type: "success" | "error" | "warning" | "info",
    message: string,
  ) => void;
}

export default function Viewer({
  job,
  settings,
  onReset,
  onOpenSettings,
  onAddToast,
}: Props) {
  const [page, setPage] = useState<number>(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [polygons, setPolygons] = useState<PolygonData[]>([]);
  const [selectedPolygonId, setSelectedPolygonId] = useState<string | null>(null);
  const [extractionData, setExtractionData] = useState<ExtractResponse | null>(null);
  const [extracting, setExtracting] = useState<boolean>(false);

  // Undo stack for vertex moves
  const undoStack = useRef<{ polygonId: string; vertexIdx: number; prev: Point }[]>([]);

  const imageUrl: string = job.pages[page]?.url ?? "";

  // -----------------------------------------------------------------------
  // Polygon validation via backend
  // -----------------------------------------------------------------------
  /** Validate a polygon for self-intersections via the backend. */
  const validatePolygon = async (vertices: Point[]): Promise<PolygonValidationResult> => {
    try {
      const res = await fetch("/api/validate-polygon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vertices }),
      });
      if (!res.ok) {
        return { valid: false, reason: "Validation request failed." };
      }
      return (await res.json()) as PolygonValidationResult;
    } catch {
      return { valid: false, reason: "Network error during validation." };
    }
  };

  // Expose validatePolygon for external polygon-add flows
  void validatePolygon;

  // -----------------------------------------------------------------------
  // AI Extraction
  // -----------------------------------------------------------------------
  const handleExtract = useCallback(async (): Promise<void> => {
    setExtracting(true);
    setExtractionData(null);
    onAddToast("info", "Starting AI extraction...");

    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: job.job_id,
          page,
          model: settings.claudeModel,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const errMsg = body?.detail ?? `Extraction failed (${res.status})`;
        setExtractionData({ success: false, data: null, error: errMsg, retries_used: 0 });
        onAddToast("error", errMsg);
        return;
      }

      const data = (await res.json()) as ExtractResponse;
      setExtractionData(data);

      if (data.success) {
        onAddToast("success", "Extraction complete!");
      } else {
        onAddToast("error", data.error ?? "Extraction returned an error.");
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Network error during extraction.";
      setExtractionData({ success: false, data: null, error: errMsg, retries_used: 0 });
      onAddToast("error", errMsg);
    } finally {
      setExtracting(false);
    }
  }, [job.job_id, page, settings.claudeModel, onAddToast]);

  // -----------------------------------------------------------------------
  // Keyboard shortcuts
  // -----------------------------------------------------------------------
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      // Escape — deselect polygon
      if (e.key === "Escape") {
        setSelectedPolygonId(null);
        return;
      }

      // Delete — remove selected vertex (last vertex of selected polygon)
      if (e.key === "Delete" && selectedPolygonId) {
        setPolygons((prev) =>
          prev
            .map((p) => {
              if (p.id !== selectedPolygonId) return p;
              if (p.vertices.length <= 1) return null; // remove polygon entirely
              return { ...p, vertices: p.vertices.slice(0, -1) };
            })
            .filter(Boolean) as PolygonData[],
        );
        onAddToast("info", "Vertex removed.");
        return;
      }

      // Ctrl+Z — undo last vertex move
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        const entry = undoStack.current.pop();
        if (!entry) {
          onAddToast("warning", "Nothing to undo.");
          return;
        }
        setPolygons((prev) =>
          prev.map((p) => {
            if (p.id !== entry.polygonId) return p;
            const verts = [...p.vertices];
            verts[entry.vertexIdx] = entry.prev;
            return { ...p, vertices: verts };
          }),
        );
        onAddToast("info", "Undo: vertex position restored.");
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedPolygonId, onAddToast]);

  // -----------------------------------------------------------------------
  // Delete selected vertex helper (for sidebar button)
  // -----------------------------------------------------------------------
  const handleDeleteVertex = useCallback((): void => {
    if (!selectedPolygonId) return;
    setPolygons((prev) =>
      prev
        .map((p) => {
          if (p.id !== selectedPolygonId) return p;
          if (p.vertices.length <= 1) return null;
          return { ...p, vertices: p.vertices.slice(0, -1) };
        })
        .filter(Boolean) as PolygonData[],
    );
    onAddToast("info", "Vertex removed.");
  }, [selectedPolygonId, onAddToast]);

  // -----------------------------------------------------------------------
  // SVG overlay — render polygons with self-intersection highlighting
  // -----------------------------------------------------------------------
  const renderPolygonOverlay = (): React.ReactNode => {
    if (polygons.length === 0) return null;

    return (
      <svg
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      >
        {polygons.map((poly) => {
          if (poly.vertices.length < 2) return null;
          const points = poly.vertices.map((v) => `${v.x},${v.y}`).join(" ");
          const isSelected = poly.id === selectedPolygonId;
          const strokeColor = !poly.valid ? "#ef4444" : isSelected ? "#3b82f6" : "#22c55e";
          const fillColor = !poly.valid
            ? "rgba(239,68,68,0.15)"
            : isSelected
              ? "rgba(59,130,246,0.1)"
              : "rgba(34,197,94,0.1)";

          return (
            <polygon
              key={poly.id}
              points={points}
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth={2}
              strokeDasharray={!poly.valid ? "6,3" : "none"}
            />
          );
        })}
      </svg>
    );
  };

  return (
    <div style={styles.wrapper}>
      {extracting && <LoadingOverlay message="Extracting data with AI..." />}

      {/* Toolbar */}
      <div style={styles.toolbar}>
        <button onClick={onReset}>{"\u2190"} New upload</button>

        <span style={styles.pageInfo}>
          Page {page + 1} / {job.page_count}
        </span>

        <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
          Prev
        </button>
        <button
          disabled={page === job.page_count - 1}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>

        <span style={styles.meta}>
          Job: {job.job_id.slice(0, 8)}... | {job.dpi} DPI
        </span>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button onClick={onOpenSettings} title="Settings">
            Settings
          </button>
        </div>
      </div>

      {/* Main content area */}
      <div style={styles.mainArea}>
        {/* Zoomable / pannable canvas */}
        <div style={styles.canvasArea}>
          <TransformWrapper
            initialScale={0.5}
            minScale={0.1}
            maxScale={5}
            centerOnInit
            key={page}
          >
            <TransformComponent
              wrapperStyle={{ width: "100%", height: "100%" }}
              contentStyle={{ width: "fit-content", height: "fit-content", position: "relative" }}
            >
              <img
                src={imageUrl}
                alt={`Page ${page + 1}`}
                draggable={false}
                style={{ display: "block" }}
              />
              {renderPolygonOverlay()}
            </TransformComponent>
          </TransformWrapper>
        </div>

        {/* Sidebar */}
        <Sidebar
          jobId={job.job_id}
          page={page}
          settings={settings}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((c) => !c)}
          polygons={polygons}
          selectedPolygonId={selectedPolygonId}
          onSelectPolygon={setSelectedPolygonId}
          onDeleteVertex={handleDeleteVertex}
          extractionData={extractionData}
          extracting={extracting}
          onExtract={handleExtract}
        />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    overflow: "hidden",
  },
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "8px 16px",
    background: "#fff",
    borderBottom: "1px solid #ddd",
    flexShrink: 0,
    flexWrap: "wrap",
  },
  pageInfo: { fontWeight: 600, fontSize: 14 },
  meta: { fontSize: 12, color: "#888" },
  mainArea: {
    display: "flex",
    flex: 1,
    overflow: "hidden",
  },
  canvasArea: {
    flex: 1,
    overflow: "hidden",
    background: "#e0e0e0",
    position: "relative",
  },
};
