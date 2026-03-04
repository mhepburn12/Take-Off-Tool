/** A 2-D point in image-pixel space. */
export type Point = [x: number, y: number];

/** A room polygon with computed metrics. */
export interface Room {
  id: string;
  label: string;
  vertices: Point[];
  /** Optional wall height in metres — used for wall-area calc. */
  wallHeight: number | null;
}

/** Payload shape returned by / sent to the backend. */
export interface PageResults {
  rooms: { label: string; vertices: number[][]; wall_height: number | null }[];
  scale_factor: number | null;
}
