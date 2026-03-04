import type { Point, AppSettings, ExtractResponse } from "../types";

interface PolygonData {
  id: string;
  vertices: Point[];
  valid: boolean;
  validationReason: string | null;
  label: string;
}

interface Props {
  jobId: string;
  page: number;
  settings: AppSettings;
  collapsed: boolean;
  onToggle: () => void;
  polygons: PolygonData[];
  selectedPolygonId: string | null;
  onSelectPolygon: (id: string | null) => void;
  onDeleteVertex: () => void;
  extractionData: ExtractResponse | null;
  extracting: boolean;
  onExtract: () => void;
}

/** Collapsible sidebar for polygon list, extraction results, and tools. */
export default function Sidebar({
  collapsed,
  onToggle,
  polygons,
  selectedPolygonId,
  onSelectPolygon,
  extractionData,
  extracting,
  onExtract,
}: Props) {
  if (collapsed) {
    return (
      <div style={styles.collapsedBar}>
        <button onClick={onToggle} style={styles.toggleBtn} title="Expand sidebar">
          {"\u25C0"}
        </button>
      </div>
    );
  }

  return (
    <div style={styles.sidebar}>
      <div style={styles.sidebarHeader}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Tools</h3>
        <button onClick={onToggle} style={styles.toggleBtn} title="Collapse sidebar">
          {"\u25B6"}
        </button>
      </div>

      {/* AI Extraction */}
      <div style={styles.section}>
        <h4 style={styles.sectionTitle}>AI Extraction</h4>
        <button
          onClick={onExtract}
          disabled={extracting}
          style={{
            ...styles.extractBtn,
            opacity: extracting ? 0.6 : 1,
          }}
        >
          {extracting ? "Extracting..." : "Extract from Plan"}
        </button>
        {extractionData && !extractionData.success && (
          <div style={styles.errorBox}>
            <p style={{ margin: 0, fontSize: 12, color: "#dc2626" }}>
              {extractionData.error}
            </p>
            <button onClick={onExtract} style={styles.retryBtn}>
              Retry
            </button>
          </div>
        )}
        {extractionData?.success && extractionData.data && (
          <pre style={styles.resultPre}>
            {JSON.stringify(extractionData.data, null, 2)}
          </pre>
        )}
      </div>

      {/* Polygons */}
      <div style={styles.section}>
        <h4 style={styles.sectionTitle}>
          Polygons ({polygons.length})
        </h4>
        {polygons.length === 0 && (
          <p style={styles.emptyMsg}>No polygons drawn yet.</p>
        )}
        {polygons.map((poly) => (
          <div
            key={poly.id}
            onClick={() => onSelectPolygon(poly.id)}
            style={{
              ...styles.polyItem,
              background: selectedPolygonId === poly.id ? "#eff6ff" : "#fff",
              borderColor: !poly.valid ? "#ef4444" : selectedPolygonId === poly.id ? "#3b82f6" : "#e5e7eb",
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 500 }}>
              {poly.label} ({poly.vertices.length} pts)
            </span>
            {!poly.valid && (
              <span style={{ fontSize: 11, color: "#ef4444" }}>
                Self-intersecting: {poly.validationReason}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Keyboard Shortcuts */}
      <div style={styles.section}>
        <h4 style={styles.sectionTitle}>Keyboard Shortcuts</h4>
        <div style={styles.shortcutList}>
          <Shortcut keys="Esc" desc="Deselect polygon" />
          <Shortcut keys="Del" desc="Remove selected vertex" />
          <Shortcut keys="Ctrl+Z" desc="Undo last vertex move" />
        </div>
      </div>
    </div>
  );
}

function Shortcut({ keys, desc }: { keys: string; desc: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "2px 0" }}>
      <kbd style={styles.kbd}>{keys}</kbd>
      <span style={{ color: "#666" }}>{desc}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: 280,
    minWidth: 280,
    background: "#fff",
    borderLeft: "1px solid #ddd",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  collapsedBar: {
    width: 36,
    minWidth: 36,
    background: "#fff",
    borderLeft: "1px solid #ddd",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    paddingTop: 8,
  },
  sidebarHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 12px",
    borderBottom: "1px solid #eee",
    flexShrink: 0,
  },
  toggleBtn: {
    background: "none",
    border: "none",
    fontSize: 14,
    cursor: "pointer",
    padding: "4px 6px",
    color: "#666",
  },
  section: {
    padding: "12px",
    borderBottom: "1px solid #f0f0f0",
    overflow: "auto",
  },
  sectionTitle: {
    margin: "0 0 8px",
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase" as const,
    color: "#888",
    letterSpacing: 0.5,
  },
  extractBtn: {
    width: "100%",
    padding: "8px 12px",
    fontSize: 13,
    fontWeight: 600,
    background: "#4f46e5",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
  },
  errorBox: {
    marginTop: 8,
    padding: 8,
    background: "#fef2f2",
    borderRadius: 6,
    border: "1px solid #fecaca",
  },
  retryBtn: {
    marginTop: 6,
    padding: "4px 12px",
    fontSize: 12,
    fontWeight: 600,
    background: "#ef4444",
    color: "#fff",
    border: "none",
    borderRadius: 4,
    cursor: "pointer",
  },
  resultPre: {
    marginTop: 8,
    padding: 8,
    background: "#f9fafb",
    borderRadius: 6,
    border: "1px solid #e5e7eb",
    fontSize: 11,
    overflow: "auto",
    maxHeight: 200,
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
  },
  polyItem: {
    padding: "8px 10px",
    borderRadius: 6,
    border: "1px solid #e5e7eb",
    marginBottom: 6,
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  emptyMsg: {
    fontSize: 12,
    color: "#999",
    fontStyle: "italic",
  },
  shortcutList: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  kbd: {
    display: "inline-block",
    padding: "1px 6px",
    background: "#f3f4f6",
    border: "1px solid #d1d5db",
    borderRadius: 3,
    fontSize: 11,
    fontFamily: "monospace",
  },
};
