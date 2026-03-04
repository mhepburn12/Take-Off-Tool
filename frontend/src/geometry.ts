import type { Point } from "./types";

/**
 * Signed area of a polygon using the shoelace formula.
 * Returns the absolute area in square-pixels.
 */
export function polygonArea(vertices: Point[]): number {
  const n = vertices.length;
  if (n < 3) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = vertices[i];
    const [x2, y2] = vertices[(i + 1) % n];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

/** Euclidean distance between two points (pixels). */
export function dist(a: Point, b: Point): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

/** Perimeter of a polygon (pixels). */
export function polygonPerimeter(vertices: Point[]): number {
  const n = vertices.length;
  if (n < 2) return 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    total += dist(vertices[i], vertices[(i + 1) % n]);
  }
  return total;
}

/** Length of each wall segment. Returns an array parallel to the edges. */
export function wallLengths(vertices: Point[]): number[] {
  const n = vertices.length;
  return Array.from({ length: n }, (_, i) =>
    dist(vertices[i], vertices[(i + 1) % n]),
  );
}

/**
 * Wall areas — each wall segment length × wallHeight.
 * If wallHeight is null, returns an empty array.
 */
export function wallAreas(
  vertices: Point[],
  wallHeight: number | null,
  scaleFactor: number | null,
): number[] {
  if (wallHeight == null || scaleFactor == null) return [];
  return wallLengths(vertices).map(
    (len) => (len / scaleFactor) * wallHeight,
  );
}

/** Convert pixel² to m² given a scale factor (px-per-metre). */
export function pixelAreaToM2(
  areaPx: number,
  scaleFactor: number | null,
): number | null {
  if (scaleFactor == null) return null;
  return areaPx / (scaleFactor * scaleFactor);
}

/** Midpoint of two points. */
export function midpoint(a: Point, b: Point): Point {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}
