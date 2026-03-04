import { useState, useRef, useCallback } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import type { JobResult } from "../App";
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
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [fillOpacity, setFillOpacity] = useState(0.25);
  const imgRef = useRef<HTMLImageElement>(null);

  const imageUrl = job.pages[page]?.url ?? "";

  // Get room-detection results for the current page.
  const pageResults = usePageResults(job.job_id, page, imgSize.w, imgSize.h);

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
            key={page} // reset zoom/pan when page changes
          >
            <TransformComponent
              wrapperStyle={{ width: "100%", height: "100%" }}
              contentStyle={{ width: "fit-content", height: "fit-content" }}
            >
              {/*
                Wrapper div with position:relative so the SVG overlay can sit
                exactly on top of the image in the same pixel space.
              */}
              <div style={{ position: "relative" }}>
                {/*
                  The image renders at its natural resolution (300 DPI PNG).
                  Do NOT apply width/height overrides — we need 1:1 pixel
                  mapping so overlay coordinates stay correct.
                */}
                <img
                  ref={imgRef}
                  src={imageUrl}
                  alt={`Page ${page + 1}`}
                  draggable={false}
                  onLoad={handleImgLoad}
                  style={{ display: "block" }}
                />

                {/* SVG room overlay — same pixel space as the image */}
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
  },
};
