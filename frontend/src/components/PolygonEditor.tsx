import { useCallback, useRef, useState } from "react";
import type { Room, Point } from "../types";
import { midpoint } from "../geometry";

interface Props {
  /** Natural image dimensions (px). The SVG viewBox matches these. */
  imageWidth: number;
  imageHeight: number;
  rooms: Room[];
  selectedRoomId: string | null;
  onSelectRoom: (id: string | null) => void;
  onUpdateVertices: (roomId: string, vertices: Point[]) => void;
  /** When in "add room" mode, each click adds a vertex. */
  addingRoom: boolean;
  pendingVertices: Point[];
  onAddPendingVertex: (pt: Point) => void;
}

const VERTEX_RADIUS = 6;
const MIDPOINT_RADIUS = 4;

export default function PolygonEditor({
  imageWidth,
  imageHeight,
  rooms,
  selectedRoomId,
  onSelectRoom,
  onUpdateVertices,
  addingRoom,
  pendingVertices,
  onAddPendingVertex,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragState, setDragState] = useState<{
    roomId: string;
    vertexIndex: number;
  } | null>(null);

  /** Convert a mouse/pointer event to image-pixel coordinates. */
  const toImageCoords = useCallback(
    (e: React.MouseEvent | PointerEvent): Point | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const ctm = svg.getScreenCTM();
      if (!ctm) return null;
      const transformed = pt.matrixTransform(ctm.inverse());
      return [transformed.x, transformed.y];
    },
    [],
  );

  // ---- Drag handling ----

  const handlePointerDown = useCallback(
    (roomId: string, vertexIndex: number, e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      (e.target as Element).setPointerCapture(e.pointerId);
      setDragState({ roomId, vertexIndex });
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragState) return;
      const coord = toImageCoords(e);
      if (!coord) return;
      const room = rooms.find((r) => r.id === dragState.roomId);
      if (!room) return;
      const updated: Point[] = room.vertices.map((v, i) =>
        i === dragState.vertexIndex ? coord : v,
      );
      onUpdateVertices(dragState.roomId, updated);
    },
    [dragState, rooms, toImageCoords, onUpdateVertices],
  );

  const handlePointerUp = useCallback(() => {
    setDragState(null);
  }, []);

  // ---- Click on SVG background (for add-room mode or deselect) ----

  const handleSvgClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (addingRoom) {
        const coord = toImageCoords(e);
        if (coord) onAddPendingVertex(coord);
        return;
      }
      // Deselect if clicking on empty area
      onSelectRoom(null);
    },
    [addingRoom, toImageCoords, onAddPendingVertex, onSelectRoom],
  );

  // ---- Right-click to delete vertex ----

  const handleVertexContextMenu = useCallback(
    (roomId: string, vertexIndex: number, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const room = rooms.find((r) => r.id === roomId);
      if (!room || room.vertices.length <= 3) return; // minimum 3 vertices
      const updated = room.vertices.filter((_, i) => i !== vertexIndex);
      onUpdateVertices(roomId, updated);
    },
    [rooms, onUpdateVertices],
  );

  // ---- Click midpoint to insert vertex ----

  const handleMidpointClick = useCallback(
    (roomId: string, edgeIndex: number, e: React.MouseEvent) => {
      e.stopPropagation();
      const room = rooms.find((r) => r.id === roomId);
      if (!room) return;
      const a = room.vertices[edgeIndex];
      const b = room.vertices[(edgeIndex + 1) % room.vertices.length];
      const mid = midpoint(a, b);
      const updated = [
        ...room.vertices.slice(0, edgeIndex + 1),
        mid,
        ...room.vertices.slice(edgeIndex + 1),
      ];
      onUpdateVertices(roomId, updated);
    },
    [rooms, onUpdateVertices],
  );

  // ---- Render helpers ----

  const pointsToString = (pts: Point[]) =>
    pts.map(([x, y]) => `${x},${y}`).join(" ");

  const selectedRoom = rooms.find((r) => r.id === selectedRoomId);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${imageWidth} ${imageHeight}`}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: imageWidth,
        height: imageHeight,
        pointerEvents: dragState ? "auto" : undefined,
        cursor: addingRoom ? "crosshair" : undefined,
      }}
      onClick={handleSvgClick}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* All room polygons */}
      {rooms.map((room) => {
        const isSelected = room.id === selectedRoomId;
        return (
          <g key={room.id}>
            <polygon
              points={pointsToString(room.vertices)}
              fill={isSelected ? "rgba(59,130,246,0.25)" : "rgba(59,130,246,0.10)"}
              stroke={isSelected ? "#2563eb" : "#3b82f6"}
              strokeWidth={isSelected ? 3 : 1.5}
              style={{ cursor: "pointer", pointerEvents: "auto" }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectRoom(room.id);
              }}
            />
            {/* Label at centroid */}
            <text
              x={room.vertices.reduce((s, v) => s + v[0], 0) / room.vertices.length}
              y={room.vertices.reduce((s, v) => s + v[1], 0) / room.vertices.length}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={14}
              fontWeight={600}
              fill={isSelected ? "#1e40af" : "#2563eb"}
              style={{ pointerEvents: "none", userSelect: "none" }}
            >
              {room.label}
            </text>
          </g>
        );
      })}

      {/* Vertex handles and midpoints for selected room */}
      {selectedRoom && (
        <g>
          {/* Edge midpoints (add vertex) */}
          {selectedRoom.vertices.map((v, i) => {
            const next =
              selectedRoom.vertices[(i + 1) % selectedRoom.vertices.length];
            const mid = midpoint(v, next);
            return (
              <circle
                key={`mid-${i}`}
                cx={mid[0]}
                cy={mid[1]}
                r={MIDPOINT_RADIUS}
                fill="#93c5fd"
                stroke="#2563eb"
                strokeWidth={1}
                style={{ cursor: "pointer", pointerEvents: "auto" }}
                onClick={(e) =>
                  handleMidpointClick(selectedRoom.id, i, e)
                }
              />
            );
          })}

          {/* Vertex handles */}
          {selectedRoom.vertices.map((v, i) => (
            <circle
              key={`vtx-${i}`}
              cx={v[0]}
              cy={v[1]}
              r={VERTEX_RADIUS}
              fill="#fff"
              stroke="#2563eb"
              strokeWidth={2}
              style={{ cursor: "grab", pointerEvents: "auto", touchAction: "none" }}
              onPointerDown={(e) =>
                handlePointerDown(selectedRoom.id, i, e)
              }
              onContextMenu={(e) =>
                handleVertexContextMenu(selectedRoom.id, i, e)
              }
            />
          ))}
        </g>
      )}

      {/* Pending polygon while in add-room mode */}
      {addingRoom && pendingVertices.length > 0 && (
        <g>
          <polyline
            points={pointsToString(pendingVertices)}
            fill="none"
            stroke="#f59e0b"
            strokeWidth={2}
            strokeDasharray="6 3"
          />
          {pendingVertices.map((v, i) => (
            <circle
              key={`pending-${i}`}
              cx={v[0]}
              cy={v[1]}
              r={VERTEX_RADIUS}
              fill="#fbbf24"
              stroke="#d97706"
              strokeWidth={2}
              style={{ pointerEvents: "none" }}
            />
          ))}
        </g>
      )}
    </svg>
  );
}
