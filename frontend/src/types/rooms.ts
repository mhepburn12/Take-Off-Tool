export type WallType = "exterior" | "interior" | "window" | "door";

/** Wall segment edge types and their overlay colours. */
export const EDGE_COLORS: Record<WallType, string> = {
  exterior: "#2563eb",  // blue
  interior: "#16a34a",  // green
  window: "#06b6d4",    // cyan
  door: "#ea580c",      // orange
};

export interface WallSegment {
  start: [number, number]; // [x, y] in image-pixel space
  end: [number, number];
  length_mm: number;
  type: WallType;
}

export interface Room {
  id: string;
  label: string;
  color: string; // unique fill colour per room
  polygon: [number, number][]; // vertices in image-pixel space
  floor_area_m2: number;
  walls: WallSegment[];
}

export interface PageResults {
  page: number;
  rooms: Room[];
  ceiling_height_mm: number;
}

// ── Derived helpers ──────────────────────────────────────────────────

/** Compute the centroid of a simple polygon. */
export function centroid(pts: [number, number][]): [number, number] {
  let cx = 0,
    cy = 0;
  for (const [x, y] of pts) {
    cx += x;
    cy += y;
  }
  return [cx / pts.length, cy / pts.length];
}

/** Total wall length in mm for a room. */
export function totalWallLength(room: Room): number {
  return room.walls.reduce((s, w) => s + w.length_mm, 0);
}

/** Total wall area in m² (length × ceiling height). */
export function totalWallArea(
  room: Room,
  ceilingHeightMm: number,
): number {
  return (totalWallLength(room) * ceilingHeightMm) / 1_000_000;
}

/** Format number with locale thousands separator. */
export function fmtMm(mm: number): string {
  return mm.toLocaleString("en-GB") + " mm";
}

export function fmtM2(m2: number): string {
  return m2.toFixed(1) + " m\u00B2";
}
