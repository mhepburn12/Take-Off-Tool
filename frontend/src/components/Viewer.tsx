import { useCallback, useEffect, useRef, useState } from "react";
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
import type { JobResult } from "../App";

/**
 * Viewer — displays a rasterised PDF page inside a zoomable / pannable canvas
 * with an optional calibration overlay.
 *
 * ## Coordinate-space mapping (IMPORTANT)
 *
 * The `<img>` element renders at its **natural pixel dimensions** (the 300-DPI
 * PNG produced by the backend).  An `<svg>` overlay is placed as a sibling of
 * the `<img>` inside the same `TransformComponent`, so both share the same
 * CSS-transformed coordinate space.
 *
 * The SVG's `viewBox` is set to `"0 0 <imgWidth> <imgHeight>"` and its CSS
 * `width` / `height` are set to match the image's natural size.  This means
 * SVG user-space units === image pixels, regardless of zoom or pan.
 *
 * When the user clicks on the overlay, we convert screen coordinates to SVG
 * user-space via `SVGSVGElement.getScreenCTM()`.  Because the SVG viewBox
 * matches the image pixel grid, the resulting coordinates are already in
 * image-pixel space — no manual zoom/pan compensation is needed.
 *
 *   screenPt  →  svgMatrix⁻¹  →  image-pixel coordinate
 *
 * All coordinates sent to the backend `/api/calibrate` endpoint are therefore
 * in image-pixel space.
 */

interface Props {
  job: JobResult;
  onReset: () => void;
}

interface Point {
  x: number;
  y: number;
}

interface CalibrationResult {
  px_per_mm: number;
  mm_per_px: number;
}

const UNITS = ["mm", "cm", "m", "in", "ft"] as const;

export default function Viewer({ job, onReset }: Props) {
  const [page, setPage] = useState(0);

  // Calibration state
  const [calibrating, setCalibrating] = useState(false);
  const [points, setPoints] = useState<Point[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [distance, setDistance] = useState("");
  const [unit, setUnit] = useState<string>("mm");
  const [calibration, setCalibration] = useState<CalibrationResult | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  // Refs
  const svgRef = useRef<SVGSVGElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(
    null,
  );
  const transformRef = useRef<ReactZoomPanPinchRef | null>(null);

  const imageUrl = job.pages[page]?.url ?? "";

  // Load existing calibration when page changes
  useEffect(() => {
    setCalibration(null);
    fetch(`/api/calibrate/${job.job_id}/${page}`)
      .then((r) => {
        if (r.ok) return r.json();
        return null;
      })
      .then((data) => {
        if (data) setCalibration({ px_per_mm: data.px_per_mm, mm_per_px: 1 / data.px_per_mm });
      })
      .catch(() => {});
  }, [job.job_id, page]);

  // Track natural image size for the SVG viewBox
  const handleImgLoad = useCallback(() => {
    const img = imgRef.current;
    if (img) {
      setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
    }
  }, []);

  /**
   * Convert a mouse event on the SVG overlay to image-pixel coordinates.
   *
   * Uses the SVG's own screen-CTM which already encodes the CSS transform
   * applied by react-zoom-pan-pinch.  The inverse of that matrix maps screen
   * coordinates back to SVG user-space, which equals image-pixel space because
   * our viewBox matches the image dimensions exactly.
   */
  const screenToImageCoords = useCallback(
    (e: React.MouseEvent<SVGSVGElement>): Point | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const ctm = svg.getScreenCTM();
      if (!ctm) return null;
      const inv = ctm.inverse();
      return {
        x: inv.a * e.clientX + inv.c * e.clientY + inv.e,
        y: inv.b * e.clientX + inv.d * e.clientY + inv.f,
      };
    },
    [],
  );

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!calibrating) return;
      e.stopPropagation();

      const pt = screenToImageCoords(e);
      if (!pt) return;

      if (points.length === 0) {
        setPoints([pt]);
      } else if (points.length === 1) {
        setPoints([points[0], pt]);
        setShowDialog(true);
      }
    },
    [calibrating, points, screenToImageCoords],
  );

  const handleSubmitCalibration = useCallback(async () => {
    if (points.length !== 2) return;
    const dist = parseFloat(distance);
    if (!dist || dist <= 0) {
      setError("Enter a positive distance.");
      return;
    }
    setError(null);

    try {
      const resp = await fetch("/api/calibrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: job.job_id,
          page,
          x1: points[0].x,
          y1: points[0].y,
          x2: points[1].x,
          y2: points[1].y,
          distance: dist,
          unit,
          dpi: job.dpi,
        }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => null);
        setError(body?.detail ?? "Calibration failed.");
        return;
      }
      const data = await resp.json();
      setCalibration({ px_per_mm: data.px_per_mm, mm_per_px: data.mm_per_px });
    } catch {
      setError("Network error.");
      return;
    }

    // Reset calibration mode
    setCalibrating(false);
    setPoints([]);
    setShowDialog(false);
    setDistance("");
  }, [points, distance, unit, job.job_id, job.dpi, page]);

  const cancelCalibration = useCallback(() => {
    setCalibrating(false);
    setPoints([]);
    setShowDialog(false);
    setDistance("");
    setError(null);
  }, []);

  const startCalibration = useCallback(() => {
    setCalibrating(true);
    setPoints([]);
    setShowDialog(false);
    setDistance("");
    setError(null);
  }, []);

  // Disable panning while in calibration mode so clicks go to the overlay
  const panningEnabled = !calibrating;

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

        {/* Calibration controls */}
        {!calibrating ? (
          <button onClick={startCalibration} style={styles.scaleBtn}>
            Set Scale
          </button>
        ) : (
          <button onClick={cancelCalibration} style={styles.cancelBtn}>
            Cancel Scale
          </button>
        )}

        {calibrating && (
          <span style={styles.hint}>
            {points.length === 0
              ? "Click the first point on the plan"
              : points.length === 1
                ? "Click the second point"
                : "Enter distance..."}
          </span>
        )}

        {calibration && !calibrating && (
          <span style={styles.scaleInfo}>
            1 px = {calibration.mm_per_px.toFixed(2)} mm
          </span>
        )}

        <span style={styles.meta}>
          Job: {job.job_id.slice(0, 8)}… | {job.dpi} DPI
        </span>
      </div>

      {/* Zoomable / pannable canvas */}
      <div style={styles.canvasArea}>
        <TransformWrapper
          ref={transformRef}
          initialScale={0.5}
          minScale={0.1}
          maxScale={5}
          centerOnInit
          panning={{ disabled: !panningEnabled }}
          key={page} // reset zoom/pan when page changes
        >
          <TransformComponent
            wrapperStyle={{ width: "100%", height: "100%" }}
            contentStyle={{ width: "fit-content", height: "fit-content" }}
          >
            {/*
              Container holds the image and the SVG overlay as siblings.
              Both are sized to the image's natural dimensions so their
              coordinate spaces are identical.
            */}
            <div style={{ position: "relative", display: "inline-block" }}>
              <img
                ref={imgRef}
                src={imageUrl}
                alt={`Page ${page + 1}`}
                draggable={false}
                style={{ display: "block" }}
                onLoad={handleImgLoad}
              />

              {/* SVG calibration overlay — same size as the image */}
              {imgSize && (
                <svg
                  ref={svgRef}
                  viewBox={`0 0 ${imgSize.w} ${imgSize.h}`}
                  width={imgSize.w}
                  height={imgSize.h}
                  style={styles.svgOverlay}
                  onClick={handleOverlayClick}
                  /* pointer-events only active in calibration mode */
                  pointerEvents={calibrating ? "auto" : "none"}
                >
                  {/* Calibration reference line */}
                  {points.length >= 2 && (
                    <line
                      x1={points[0].x}
                      y1={points[0].y}
                      x2={points[1].x}
                      y2={points[1].y}
                      stroke="#ff2d55"
                      strokeWidth={4}
                      strokeLinecap="round"
                    />
                  )}
                  {/* Draw in-progress line from first point to cursor */}
                  {points.length === 1 && (
                    <CalibrationGhost
                      origin={points[0]}
                      svgRef={svgRef}
                    />
                  )}
                  {/* Point markers */}
                  {points.map((pt, i) => (
                    <circle
                      key={i}
                      cx={pt.x}
                      cy={pt.y}
                      r={8}
                      fill="#ff2d55"
                      stroke="#fff"
                      strokeWidth={2}
                    />
                  ))}
                </svg>
              )}
            </div>
          </TransformComponent>
        </TransformWrapper>
      </div>

      {/* Distance input dialog */}
      {showDialog && (
        <div style={styles.dialogBackdrop}>
          <div style={styles.dialog}>
            <h3 style={{ margin: "0 0 12px" }}>Enter reference distance</h3>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input
                type="number"
                min={0}
                step="any"
                placeholder="Distance"
                value={distance}
                onChange={(e) => setDistance(e.target.value)}
                style={styles.input}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSubmitCalibration();
                }}
              />
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                style={styles.select}
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
            {error && <div style={styles.error}>{error}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={cancelCalibration}>Cancel</button>
              <button
                onClick={handleSubmitCalibration}
                style={styles.submitBtn}
              >
                Calibrate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Renders a ghost line from the first calibration point to the current
 * mouse position, providing real-time visual feedback.
 */
function CalibrationGhost({
  origin,
  svgRef,
}: {
  origin: Point;
  svgRef: React.RefObject<SVGSVGElement | null>;
}) {
  const [cursor, setCursor] = useState<Point | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const svg = svgRef.current;
      if (!svg) return;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const inv = ctm.inverse();
      setCursor({
        x: inv.a * e.clientX + inv.c * e.clientY + inv.e,
        y: inv.b * e.clientX + inv.d * e.clientY + inv.f,
      });
    };
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, [svgRef]);

  if (!cursor) return null;
  return (
    <line
      x1={origin.x}
      y1={origin.y}
      x2={cursor.x}
      y2={cursor.y}
      stroke="#ff2d55"
      strokeWidth={3}
      strokeDasharray="12 6"
      strokeLinecap="round"
      pointerEvents="none"
    />
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

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
  pageInfo: { fontWeight: 600 },
  meta: { marginLeft: "auto", fontSize: 12, color: "#888" },
  canvasArea: {
    flex: 1,
    overflow: "hidden",
    background: "#e0e0e0",
  },
  scaleBtn: {
    background: "#0066ff",
    color: "#fff",
    border: "none",
    borderRadius: 4,
    padding: "4px 12px",
    cursor: "pointer",
  },
  cancelBtn: {
    background: "#ff3b30",
    color: "#fff",
    border: "none",
    borderRadius: 4,
    padding: "4px 12px",
    cursor: "pointer",
  },
  hint: {
    fontSize: 13,
    color: "#0066ff",
    fontStyle: "italic",
  },
  scaleInfo: {
    fontSize: 13,
    color: "#1a8d1a",
    fontWeight: 600,
    background: "#e6f9e6",
    padding: "2px 8px",
    borderRadius: 4,
  },
  svgOverlay: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    cursor: "crosshair",
  },
  dialogBackdrop: {
    position: "fixed" as const,
    inset: 0,
    background: "rgba(0,0,0,0.4)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  dialog: {
    background: "#fff",
    borderRadius: 8,
    padding: 24,
    minWidth: 320,
    boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
  },
  input: {
    flex: 1,
    padding: "6px 10px",
    fontSize: 14,
    border: "1px solid #ccc",
    borderRadius: 4,
  },
  select: {
    padding: "6px 10px",
    fontSize: 14,
    border: "1px solid #ccc",
    borderRadius: 4,
  },
  submitBtn: {
    background: "#0066ff",
    color: "#fff",
    border: "none",
    borderRadius: 4,
    padding: "6px 16px",
    cursor: "pointer",
  },
  error: {
    color: "#ff3b30",
    fontSize: 13,
    marginBottom: 8,
  },
};
