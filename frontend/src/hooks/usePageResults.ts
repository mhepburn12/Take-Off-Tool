import { useState, useCallback } from "react";
import type { PageResults, Room, WallSegment, WallType } from "../types/rooms";

const ROOM_PALETTE = [
  "#6366f1", "#f59e0b", "#10b981", "#ef4444",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316",
];

const EDGE_TYPE_MAP: Record<string, WallType> = {
  exterior_wall: "exterior",
  interior_wall: "interior",
  window: "window",
  door: "door",
};

/**
 * Hook that extracts room data from the backend API and returns
 * structured PageResults for overlay rendering.
 */
export function usePageResults(
  jobId: string,
  page: number,
): {
  results: PageResults | null;
  loading: boolean;
  error: string | null;
  extract: () => Promise<void>;
} {
  const [results, setResults] = useState<PageResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const extract = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/extract/${jobId}/${page}`, {
        method: "POST",
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.detail ?? `Extraction failed (${res.status})`);
        setLoading(false);
        return;
      }

      const data = await res.json();
      const rooms: Room[] = (data.rooms ?? []).map(
        (r: Record<string, unknown>, idx: number) => {
          const vertices = r.vertices as number[][];
          const polygon: [number, number][] = vertices.map(
            ([x, y]) => [x, y] as [number, number],
          );

          const walls: WallSegment[] = (r.walls as Record<string, unknown>[]).map(
            (w) => ({
              start: (w.from as number[]) as [number, number],
              end: (w.to as number[]) as [number, number],
              length_mm: w.length_mm as number,
              type: EDGE_TYPE_MAP[(w.edge_type as string)] ?? "interior",
            }),
          );

          return {
            id: `room-${idx}`,
            label: r.label as string,
            color: ROOM_PALETTE[idx % ROOM_PALETTE.length],
            polygon,
            floor_area_m2: r.floor_area_m2 as number,
            walls,
          };
        },
      );

      setResults({
        page,
        rooms,
        ceiling_height_mm: (data.ceiling_height_mm as number) ?? 2400,
      });
    } catch {
      setError("Network error during extraction.");
    } finally {
      setLoading(false);
    }
  }, [jobId, page]);

  return { results, loading, error, extract };
}
