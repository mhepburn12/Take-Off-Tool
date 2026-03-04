import { useState, useEffect, useCallback, useRef } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import type { JobResult } from "../App";
import type { Room, Point, PageResults } from "../types";
import PolygonEditor from "./PolygonEditor";
import Sidebar from "./Sidebar";

/**
 * Viewer — displays a rasterised PDF page inside a zoomable / pannable canvas
 * with an SVG polygon overlay for room editing.
 *
 * The <img> element uses its natural (pixel) dimensions so that every pixel in
 * the 300-DPI PNG maps 1:1 to screen pixels at zoom = 1×.  The SVG overlay
 * uses the same pixel coordinate system.
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

let nextId = 1;
function genId() {
  return `room-${nextId++}-${Date.now()}`;
}

export default function Viewer({ job, onReset }: Props) {
  const [page, setPage] = useState(0);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [scaleFactor, setScaleFactor] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Add-room mode
  const [addingRoom, setAddingRoom] = useState(false);
  const [pendingVertices, setPendingVertices] = useState<Point[]>([]);

  // Image natural dimensions (needed for SVG viewBox)
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const imageUrl = job.pages[page]?.url ?? "";

  // ---- Fetch saved results when page changes ----

  useEffect(() => {
    let cancelled = false;
    setRooms([]);
    setSelectedRoomId(null);
    setScaleFactor(null);
    setAddingRoom(false);
    setPendingVertices([]);

    fetch(`/api/results/${job.job_id}/${page}`)
      .then((r) => r.json())
      .then((data: PageResults) => {
        if (cancelled) return;
        setScaleFactor(data.scale_factor ?? null);
        setRooms(
          (data.rooms ?? []).map((r) => ({
            id: genId(),
            label: r.label,
            vertices: r.vertices as Point[],
            wallHeight: r.wall_height ?? null,
          })),
        );
      })
      .catch(() => {
        /* no saved data — start empty */
      });

    return () => {
      cancelled = true;
    };
  }, [job.job_id, page]);

  // ---- Image load → capture natural dimensions ----

  const handleImageLoad = useCallback(() => {
    const img = imgRef.current;
    if (img) {
      setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
    }
  }, []);

  // ---- Room CRUD ----

  const handleUpdateVertices = useCallback(
    (roomId: string, vertices: Point[]) => {
      setRooms((prev) =>
        prev.map((r) => (r.id === roomId ? { ...r, vertices } : r)),
      );
    },
    [],
  );

  const handleDeleteRoom = useCallback(
    (id: string) => {
      setRooms((prev) => prev.filter((r) => r.id !== id));
      if (selectedRoomId === id) setSelectedRoomId(null);
    },
    [selectedRoomId],
  );

  const handleStartAddRoom = useCallback(() => {
    setAddingRoom(true);
    setPendingVertices([]);
    setSelectedRoomId(null);
  }, []);

  const handleAddPendingVertex = useCallback((pt: Point) => {
    setPendingVertices((prev) => [...prev, pt]);
  }, []);

  const handleFinishAddRoom = useCallback(
    (label: string) => {
      if (pendingVertices.length < 3) return;
      const newRoom: Room = {
        id: genId(),
        label,
        vertices: [...pendingVertices],
        wallHeight: null,
      };
      setRooms((prev) => [...prev, newRoom]);
      setSelectedRoomId(newRoom.id);
      setAddingRoom(false);
      setPendingVertices([]);
    },
    [pendingVertices],
  );

  const handleCancelAddRoom = useCallback(() => {
    setAddingRoom(false);
    setPendingVertices([]);
  }, []);

  // ---- Save ----

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const body: PageResults = {
        rooms: rooms.map((r) => ({
          label: r.label,
          vertices: r.vertices,
          wall_height: r.wallHeight,
        })),
        scale_factor: scaleFactor,
      };
      await fetch(`/api/results/${job.job_id}/${page}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } finally {
      setSaving(false);
    }
  }, [rooms, scaleFactor, job.job_id, page]);

  return (
    <div style={styles.outer}>
      {/* Sidebar */}
      <Sidebar
        rooms={rooms}
        selectedRoomId={selectedRoomId}
        onSelectRoom={setSelectedRoomId}
        scaleFactor={scaleFactor}
        onAddRoom={handleStartAddRoom}
        onDeleteRoom={handleDeleteRoom}
        onSave={handleSave}
        addingRoom={addingRoom}
        onFinishAddRoom={handleFinishAddRoom}
        onCancelAddRoom={handleCancelAddRoom}
        pendingVertexCount={pendingVertices.length}
        saving={saving}
      />

      {/* Main viewer area */}
      <div style={styles.viewerCol}>
        {/* Toolbar */}
        <div style={styles.toolbar}>
          <button onClick={onReset}>&larr; New upload</button>

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

          <span style={styles.meta}>
            Job: {job.job_id.slice(0, 8)}&hellip; | {job.dpi} DPI
          </span>
        </div>

        {/* Zoomable / pannable canvas */}
        <div style={styles.canvasArea}>
          <TransformWrapper
            initialScale={0.5}
            minScale={0.1}
            maxScale={5}
            centerOnInit
            key={page}
            // Disable panning when we're in add-room mode so clicks register
            panning={{ disabled: addingRoom }}
          >
            <TransformComponent
              wrapperStyle={{ width: "100%", height: "100%" }}
              contentStyle={{ width: "fit-content", height: "fit-content" }}
            >
              {/*
                Container keeps img + SVG overlay aligned.
                The SVG is absolutely positioned on top of the img,
                sharing the same pixel coordinate space.
              */}
              <div style={{ position: "relative", display: "inline-block" }}>
                <img
                  ref={imgRef}
                  src={imageUrl}
                  alt={`Page ${page + 1}`}
                  draggable={false}
                  style={{ display: "block" }}
                  onLoad={handleImageLoad}
                />

                {imgSize && (
                  <PolygonEditor
                    imageWidth={imgSize.w}
                    imageHeight={imgSize.h}
                    rooms={rooms}
                    selectedRoomId={selectedRoomId}
                    onSelectRoom={setSelectedRoomId}
                    onUpdateVertices={handleUpdateVertices}
                    addingRoom={addingRoom}
                    pendingVertices={pendingVertices}
                    onAddPendingVertex={handleAddPendingVertex}
                  />
                )}
              </div>
            </TransformComponent>
          </TransformWrapper>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  outer: {
    display: "flex",
    flex: 1,
    overflow: "hidden",
  },
  viewerCol: {
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
  canvasArea: {
    flex: 1,
    overflow: "hidden",
    background: "#e0e0e0",
  },
};
