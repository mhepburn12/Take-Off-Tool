import { useState, useCallback } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import type { JobResult } from "../App";

/**
 * Viewer — displays a rasterised PDF page inside a zoomable / pannable canvas.
 *
 * The <img> element uses its natural (pixel) dimensions so that every pixel in
 * the 300-DPI PNG maps 1:1 to screen pixels at zoom = 1×.  Any future overlay
 * layer should position elements in this same pixel coordinate system.
 *
 * Pixel ↔ PDF-point conversion:
 *   const SCALE = dpi / 72;          // 300/72 ≈ 4.1667
 *   pdfPt  = pixel / SCALE;
 *   pixel  = pdfPt * SCALE;
 */

interface Props {
  job: JobResult;
  onReset: () => void;
}

export default function Viewer({ job, onReset }: Props) {
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState<string | null>(null);

  const imageUrl = job.pages[page]?.url ?? "";

  const handleExport = useCallback(
    async (format: "csv" | "json" | "pdf") => {
      setExporting(format);
      try {
        const url = `/api/export/${format}/${job.job_id}`;
        const res = await fetch(url);
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.detail ?? `Export failed (${res.status})`);
        }
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);

        // Extract filename from Content-Disposition or use default
        const disposition = res.headers.get("Content-Disposition");
        let filename = `takeoff_export.${format === "csv" ? "xlsx" : format}`;
        if (disposition) {
          const match = disposition.match(/filename="?([^"]+)"?/);
          if (match) filename = match[1];
        }

        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      } catch (err) {
        alert(
          err instanceof Error ? err.message : "Export failed"
        );
      } finally {
        setExporting(null);
      }
    },
    [job.job_id]
  );

  return (
    <div style={styles.wrapper}>
      {/* Toolbar */}
      <div style={styles.toolbar}>
        <button onClick={onReset}>← New upload</button>

        <span style={styles.pageInfo}>
          Page {page + 1} / {job.page_count}
        </span>

        <button
          disabled={page === 0}
          onClick={() => setPage((p) => p - 1)}
        >
          Prev
        </button>
        <button
          disabled={page === job.page_count - 1}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>

        <div style={styles.exportGroup}>
          <button
            style={styles.exportBtn}
            disabled={exporting !== null}
            onClick={() => handleExport("csv")}
            title="Download Excel spreadsheet with room measurements"
          >
            {exporting === "csv" ? "…" : "⬇ Excel"}
          </button>
          <button
            style={styles.exportBtn}
            disabled={exporting !== null}
            onClick={() => handleExport("pdf")}
            title="Download PDF report with annotated plan images"
          >
            {exporting === "pdf" ? "…" : "⬇ PDF"}
          </button>
          <button
            style={styles.exportBtn}
            disabled={exporting !== null}
            onClick={() => handleExport("json")}
            title="Download raw measurement data as JSON"
          >
            {exporting === "json" ? "…" : "⬇ JSON"}
          </button>
        </div>

        <span style={styles.meta}>
          Job: {job.job_id.slice(0, 8)}… | {job.dpi} DPI
        </span>
      </div>

      {/* Zoomable / pannable canvas */}
      <div style={styles.canvasArea}>
        <TransformWrapper
          initialScale={0.5}
          minScale={0.1}
          maxScale={5}
          centerOnInit
          key={page} // reset zoom/pan when page changes
        >
          <TransformComponent
            wrapperStyle={{ width: "100%", height: "100%" }}
            contentStyle={{ width: "fit-content", height: "fit-content" }}
          >
            {/*
              The image renders at its natural resolution (300 DPI PNG).
              Do NOT apply width/height overrides — we need 1:1 pixel mapping
              so overlay coordinates stay correct.
            */}
            <img
              src={imageUrl}
              alt={`Page ${page + 1}`}
              draggable={false}
              style={{ display: "block" }}
            />
          </TransformComponent>
        </TransformWrapper>
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
  },
  pageInfo: { fontWeight: 600 },
  exportGroup: {
    display: "flex",
    gap: 6,
    marginLeft: 12,
    paddingLeft: 12,
    borderLeft: "1px solid #ddd",
  },
  exportBtn: {
    fontSize: "0.8em",
    padding: "4px 10px",
    background: "#4f46e5",
    color: "#fff",
    border: "none",
    borderRadius: 4,
    fontWeight: 500,
  },
  meta: { marginLeft: "auto", fontSize: 12, color: "#888" },
  canvasArea: {
    flex: 1,
    overflow: "hidden",
    background: "#e0e0e0",
  },
};
