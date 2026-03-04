import { useState, useEffect } from "react";
import type { PageResults, Room, WallSegment } from "../types/rooms";

/**
 * Hook that provides room-detection results for a given page.
 *
 * Currently returns hard-coded demo data so the overlay can be developed and
 * tested before the real detection backend is wired up.  When the backend
 * endpoint exists, replace the body of this hook with a fetch call.
 *
 * All coordinates are in image-pixel space (300 DPI rasterised PNG).
 */
export function usePageResults(
  _jobId: string,
  page: number,
  imageWidth: number,
  imageHeight: number,
): PageResults | null {
  const [results, setResults] = useState<PageResults | null>(null);

  useEffect(() => {
    if (imageWidth === 0 || imageHeight === 0) {
      setResults(null);
      return;
    }
    // Generate demo rooms scaled to the actual image dimensions.
    setResults(buildDemoResults(page, imageWidth, imageHeight));
  }, [page, imageWidth, imageHeight]);

  return results;
}

// ── Demo data generator ──────────────────────────────────────────────

const ROOM_PALETTE = [
  "#6366f1", // indigo
  "#f59e0b", // amber
  "#10b981", // emerald
  "#ef4444", // red
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
];

function buildDemoResults(
  page: number,
  w: number,
  h: number,
): PageResults {
  // Margins as fraction of image size.
  const mx = w * 0.08;
  const my = h * 0.08;
  const iw = w - 2 * mx; // inner width
  const ih = h - 2 * my; // inner height

  const rooms: Room[] = [];

  if (page === 0) {
    // ── Page 0: four-room layout ──
    const midX = mx + iw * 0.55;
    const midY = my + ih * 0.5;

    rooms.push(
      makeRoom("kitchen", "Kitchen", ROOM_PALETTE[0], [
        [mx, my],
        [midX, my],
        [midX, midY],
        [mx, midY],
      ]),
      makeRoom("living", "Living Room", ROOM_PALETTE[1], [
        [midX, my],
        [mx + iw, my],
        [mx + iw, midY],
        [midX, midY],
      ]),
      makeRoom("bedroom", "Bedroom 1", ROOM_PALETTE[2], [
        [mx, midY],
        [midX, midY],
        [midX, my + ih],
        [mx, my + ih],
      ]),
      makeRoom("bath", "Bathroom", ROOM_PALETTE[3], [
        [midX, midY],
        [mx + iw, midY],
        [mx + iw, my + ih],
        [midX, my + ih],
      ]),
    );
  } else {
    // ── Other pages: L-shaped + small room ──
    const notchW = iw * 0.35;
    const notchH = ih * 0.35;
    rooms.push(
      makeRoom("main", "Open Plan", ROOM_PALETTE[4], [
        [mx, my],
        [mx + iw, my],
        [mx + iw, my + ih - notchH],
        [mx + iw - notchW, my + ih - notchH],
        [mx + iw - notchW, my + ih],
        [mx, my + ih],
      ]),
      makeRoom("study", "Study", ROOM_PALETTE[5], [
        [mx + iw - notchW, my + ih - notchH],
        [mx + iw, my + ih - notchH],
        [mx + iw, my + ih],
        [mx + iw - notchW, my + ih],
      ]),
    );
  }

  return { page, rooms, ceiling_height_mm: 2400 };
}

/**
 * Build a Room from a polygon.  Wall segments are generated from consecutive
 * vertex pairs with synthetic lengths and alternating types for demo purposes.
 */
function makeRoom(
  id: string,
  label: string,
  color: string,
  polygon: [number, number][],
): Room {
  const walls: WallSegment[] = [];
  const types: WallSegment["type"][] = [
    "exterior",
    "interior",
    "window",
    "door",
  ];

  for (let i = 0; i < polygon.length; i++) {
    const start = polygon[i];
    const end = polygon[(i + 1) % polygon.length];
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    // Approximate mm from pixels at 300 DPI (1 px ≈ 0.0847 mm).
    // For demo we scale up to architectural sizes (~2000-6000 mm).
    const pxLen = Math.sqrt(dx * dx + dy * dy);
    const length_mm = Math.round(pxLen * 3.5);

    walls.push({
      start,
      end,
      length_mm,
      type: types[i % types.length],
    });
  }

  // Shoelace formula for area (pixels² → m² via arbitrary scale for demo).
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [x1, y1] = polygon[i];
    const [x2, y2] = polygon[(i + 1) % polygon.length];
    area += x1 * y2 - x2 * y1;
  }
  area = Math.abs(area) / 2;
  // Convert px² to m² using scale: 1 px ≈ 0.0847 mm → (0.0847e-3)² m²/px²
  // Multiply by a factor to get realistic room sizes for demo.
  const floor_area_m2 = parseFloat(((area * 3.5 * 3.5) / 1_000_000).toFixed(1));

  return { id, label, color, polygon, floor_area_m2, walls };
}
