/**
 * Shared TypeScript types for all API requests and responses.
 */

// ---------------------------------------------------------------------------
// Upload API
// ---------------------------------------------------------------------------

/** Metadata about a single rasterised page. */
export interface PageInfo {
  page: number;
  url: string;
  width: number;
  height: number;
}

/** Response from POST /api/upload. */
export interface JobResult {
  job_id: string;
  page_count: number;
  dpi: number;
  pages: PageInfo[];
}

// ---------------------------------------------------------------------------
// AI Extraction API
// ---------------------------------------------------------------------------

/** Request body for POST /api/extract. */
export interface ExtractRequest {
  job_id: string;
  page: number;
  prompt?: string;
  model?: string;
}

/** Response from POST /api/extract. */
export interface ExtractResponse {
  success: boolean;
  data: Record<string, unknown> | null;
  error: string | null;
  retries_used: number;
}

// ---------------------------------------------------------------------------
// Polygon Validation API
// ---------------------------------------------------------------------------

/** A 2D point in pixel coordinates. */
export interface Point {
  x: number;
  y: number;
}

/** Request body for POST /api/validate-polygon. */
export interface PolygonInput {
  vertices: Point[];
}

/** Response from POST /api/validate-polygon. */
export interface PolygonValidationResult {
  valid: boolean;
  reason: string | null;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/** Unit system options. */
export type UnitSystem = "mm" | "m" | "ft" | "in";

/** User-configurable application settings. */
export interface AppSettings {
  defaultCeilingHeight: number;
  units: UnitSystem;
  claudeModel: string;
}

/** Default application settings. */
export const DEFAULT_SETTINGS: AppSettings = {
  defaultCeilingHeight: 2700,
  units: "mm",
  claudeModel: "claude-sonnet-4-20250514",
};

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

/** Toast notification severity levels. */
export type ToastType = "success" | "error" | "warning" | "info";

/** A single toast notification. */
export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}
