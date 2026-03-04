import { useState, useRef, useCallback } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import type { JobResult } from "../types";
import { usePageResults } from "../hooks/usePageResults";
import RoomOverlay from "./RoomOverlay";
import RoomSidebar from "./RoomSidebar";

/**
 * Viewer — displays a rasterised PDF page inside a zoomable / pannable canvas
 * with an SVG room-polygon overlay and a detail sidebar.
 *
 * The <img> element uses its natural (pixel) dimensions so that every pixel in
 * the 300-DPI PNG maps 1:1 to screen pixels at zoom = 1×.  The SVG overlay
 * sits in the same coordinate space and transforms identically.
 */

interface Props {
  job: JobResult;
  onReset: () => void;
}

export default function Viewer({ job, onReset }: Props) {
  const [page, setPage] = useState(0);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [fillOpacity, setFillOpacity] = useState(0.25);
  const imgRef = useRef<HTMLImageElement>(null);

  const imageUrl = job.pages[page]?.url ?? "";

  const { results: pageResults, loading, error, extract } = usePageResults(
    job.job_id,
    page,
  );

  const handleImgLoad = useCallback(() => {
    const img = imgRef.current;
    if (img) {
      setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
    }
  }, []);

  return (
    <div style={styles.wrapper}>
      {/* Toolbar */}
      <div style={styles.toolbar}>
        <button onClick={onReset}>&larr; New upload</button>

        <span style={styles.pageInfo}>
          Page {page + 1} / {job.page_count}
        </span>

        <button
          disabled={page === 0}
          onClick={() => {
            setPage((p) => p - 1);
            setImgSize({ w: 0, h: 0 });
          }}
        >
          Prev
        </button>
        <button
          disabled={page === job.page_count - 1}
          onClick={() => {
            setPage((p) => p + 1);
            setImgSize({ w: 0, h: 0 });
          }}
        >
          Next
        </button>

        <button
          onClick={extract}
          disabled={loading}
          style={{
            ...styles.extractBtn,
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Extracting..." : "Extract Rooms"}
        </button>

        {error && (
          <span style={styles.errorText}>{error}</span>
        )}

        <span style={styles.meta}>
          Job: {job.job_id.slice(0, 8)}&hellip; | {job.dpi} DPI
        </span>
      </div>

      {/* Main content area: canvas + sidebar */}
      <div style={styles.body}>
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
              contentStyle={{ width: "fit-content", height: "fit-content" }}
            >
              <div style={{ position: "relative" }}>
                <img
                  ref={imgRef}
                  src={imageUrl}
                  alt={`Page ${page + 1}`}
                  draggable={false}
                  onLoad={handleImgLoad}
                  style={{ display: "block" }}
                />

                {pageResults && (
                  <RoomOverlay
                    results={pageResults}
                    imageWidth={imgSize.w}
                    imageHeight={imgSize.h}
                    visible={overlayVisible}
                    fillOpacity={fillOpacity}
                  />
                )}
              </div>
            </TransformComponent>
          </TransformWrapper>

          {loading && (
            <div style={styles.loadingOverlay}>
              <div style={styles.loadingBox}>
                <div style={styles.spinner} />
                <p>Extracting rooms with AI...</p>
                <p style={styles.loadingHint}>This may take 15-30 seconds</p>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar — room list, controls, totals */}
        {pageResults && (
          <RoomSidebar
            results={pageResults}
            overlayVisible={overlayVisible}
            onToggleOverlay={() => setOverlayVisible((v) => !v)}
            fillOpacity={fillOpacity}
            onFillOpacityChange={setFillOpacity}
          />
        )}
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
  pageInfo: { fontWeight: 600 },
  meta: { marginLeft: "auto", fontSize: 12, color: "#888" },
  body: {
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
  extractBtn: {
    background: "#4f46e5",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "6px 14px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  errorText: {
    fontSize: 12,
    color: "#dc2626",
    maxWidth: 300,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  loadingOverlay: {
    position: "absolute",
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  loadingBox: {
    background: "#fff",
    borderRadius: 12,
    padding: "32px 48px",
    textAlign: "center",
    boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
  },
  spinner: {
    width: 40,
    height: 40,
    border: "4px solid #e5e7eb",
    borderTopColor: "#4f46e5",
    borderRadius: "50%",
    margin: "0 auto 16px",
    animation: "spin 0.8s linear infinite",
  },
  loadingHint: {
    fontSize: 13,
    color: "#888",
    marginTop: 4,
  },
};
