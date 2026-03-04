import type { PageResults } from "../types/rooms";
import { centroid, fmtM2, fmtMm, EDGE_COLORS } from "../types/rooms";

interface Props {
  results: PageResults;
  imageWidth: number;
  imageHeight: number;
  visible: boolean;
  fillOpacity: number;
}

/**
 * SVG overlay that renders room polygons, wall edges, room labels, and wall
 * dimension annotations.  Coordinates are in the same image-pixel space as the
 * plan PNG so it stays perfectly aligned at all zoom / pan levels.
 */
export default function RoomOverlay({
  results,
  imageWidth,
  imageHeight,
  visible,
  fillOpacity,
}: Props) {
  if (!visible) return null;

  return (
    <svg
      viewBox={`0 0 ${imageWidth} ${imageHeight}`}
      width={imageWidth}
      height={imageHeight}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        pointerEvents: "none",
      }}
    >
      {results.rooms.map((room) => {
        const pts = room.polygon.map(([x, y]) => `${x},${y}`).join(" ");
        const [cx, cy] = centroid(room.polygon);

        return (
          <g key={room.id}>
            {/* Filled polygon */}
            <polygon
              points={pts}
              fill={room.color}
              fillOpacity={fillOpacity}
              stroke="none"
            />

            {/* Wall‑segment edges, coloured by type */}
            {room.walls.map((wall, i) => (
              <line
                key={`${room.id}-wall-${i}`}
                x1={wall.start[0]}
                y1={wall.start[1]}
                x2={wall.end[0]}
                y2={wall.end[1]}
                stroke={EDGE_COLORS[wall.type]}
                strokeWidth={4}
                strokeLinecap="round"
              />
            ))}

            {/* Room label + area at centroid */}
            <text
              x={cx}
              y={cy}
              textAnchor="middle"
              dominantBaseline="central"
              fill="#fff"
              stroke="#000"
              strokeWidth={4}
              paintOrder="stroke"
              fontSize={28}
              fontWeight={700}
              fontFamily="system-ui, sans-serif"
            >
              {room.label} — {fmtM2(room.floor_area_m2)}
            </text>

            {/* Wall dimension labels along each segment */}
            {room.walls.map((wall, i) => {
              const [x1, y1] = wall.start;
              const [x2, y2] = wall.end;
              const mx = (x1 + x2) / 2;
              const my = (y1 + y2) / 2;
              let angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
              // Keep text readable (not upside-down).
              if (angle > 90) angle -= 180;
              if (angle < -90) angle += 180;
              // Offset perpendicular to the segment so the label doesn't
              // overlap the wall line itself.
              const perpX = -(y2 - y1);
              const perpY = x2 - x1;
              const perpLen = Math.sqrt(perpX * perpX + perpY * perpY) || 1;
              const offsetPx = 18;
              const ox = mx + (perpX / perpLen) * offsetPx;
              const oy = my + (perpY / perpLen) * offsetPx;

              return (
                <text
                  key={`${room.id}-dim-${i}`}
                  x={ox}
                  y={oy}
                  textAnchor="middle"
                  dominantBaseline="central"
                  transform={`rotate(${angle},${ox},${oy})`}
                  fill="#fff"
                  stroke="#000"
                  strokeWidth={3}
                  paintOrder="stroke"
                  fontSize={18}
                  fontWeight={600}
                  fontFamily="system-ui, sans-serif"
                >
                  {fmtMm(wall.length_mm)}
                </text>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}
