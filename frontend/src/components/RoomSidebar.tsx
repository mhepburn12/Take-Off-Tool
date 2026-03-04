import type { PageResults, WallType } from "../types/rooms";
import {
  totalWallLength,
  totalWallArea,
  fmtMm,
  fmtM2,
  EDGE_COLORS,
} from "../types/rooms";

interface Props {
  results: PageResults;
  overlayVisible: boolean;
  onToggleOverlay: () => void;
  fillOpacity: number;
  onFillOpacityChange: (v: number) => void;
}

const WALL_TYPE_LABEL: Record<WallType, string> = {
  exterior: "Exterior wall",
  interior: "Interior wall",
  window: "Window",
  door: "Door",
};

export default function RoomSidebar({
  results,
  overlayVisible,
  onToggleOverlay,
  fillOpacity,
  onFillOpacityChange,
}: Props) {
  const ceilingH = results.ceiling_height_mm;

  // Totals
  const grossFloorArea = results.rooms.reduce(
    (s, r) => s + r.floor_area_m2,
    0,
  );
  const grossWallArea = results.rooms.reduce(
    (s, r) => s + totalWallArea(r, ceilingH),
    0,
  );

  return (
    <div style={styles.sidebar}>
      {/* ── Controls ── */}
      <div style={styles.controls}>
        <label style={styles.toggleLabel}>
          <input
            type="checkbox"
            checked={overlayVisible}
            onChange={onToggleOverlay}
          />
          <span style={{ marginLeft: 6 }}>Show overlay</span>
        </label>

        <label style={styles.sliderLabel}>
          Fill opacity
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={fillOpacity}
            onChange={(e) => onFillOpacityChange(parseFloat(e.target.value))}
            style={{ width: "100%" }}
          />
          <span style={styles.sliderValue}>{Math.round(fillOpacity * 100)}%</span>
        </label>
      </div>

      {/* ── Room list ── */}
      <div style={styles.roomList}>
        {results.rooms.map((room) => {
          const wallLen = totalWallLength(room);
          const wallArea = totalWallArea(room, ceilingH);

          return (
            <div key={room.id} style={styles.roomCard}>
              {/* Header */}
              <div style={styles.roomHeader}>
                <span
                  style={{
                    ...styles.swatch,
                    backgroundColor: room.color,
                  }}
                />
                <span style={styles.roomName}>{room.label}</span>
              </div>

              {/* Metrics */}
              <table style={styles.metricsTable}>
                <tbody>
                  <tr>
                    <td style={styles.metricLabel}>Floor area</td>
                    <td style={styles.metricValue}>{fmtM2(room.floor_area_m2)}</td>
                  </tr>
                  <tr>
                    <td style={styles.metricLabel}>Wall length</td>
                    <td style={styles.metricValue}>{fmtMm(wallLen)}</td>
                  </tr>
                  <tr>
                    <td style={styles.metricLabel}>Wall area</td>
                    <td style={styles.metricValue}>{fmtM2(wallArea)}</td>
                  </tr>
                </tbody>
              </table>

              {/* Wall breakdown */}
              <details style={styles.details}>
                <summary style={styles.summary}>
                  Wall segments ({room.walls.length})
                </summary>
                <table style={styles.wallTable}>
                  <thead>
                    <tr>
                      <th style={styles.wallTh}>#</th>
                      <th style={styles.wallTh}>Type</th>
                      <th style={{ ...styles.wallTh, textAlign: "right" }}>
                        Length
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {room.walls.map((w, i) => (
                      <tr key={i}>
                        <td style={styles.wallTd}>{i + 1}</td>
                        <td style={styles.wallTd}>
                          <span
                            style={{
                              display: "inline-block",
                              width: 10,
                              height: 10,
                              borderRadius: 2,
                              backgroundColor: EDGE_COLORS[w.type],
                              marginRight: 6,
                              verticalAlign: "middle",
                            }}
                          />
                          {WALL_TYPE_LABEL[w.type]}
                        </td>
                        <td style={{ ...styles.wallTd, textAlign: "right" }}>
                          {fmtMm(w.length_mm)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </div>
          );
        })}
      </div>

      {/* ── Totals ── */}
      <div style={styles.totals}>
        <div style={styles.totalsTitle}>Totals</div>
        <table style={styles.metricsTable}>
          <tbody>
            <tr>
              <td style={styles.metricLabel}>Gross floor area</td>
              <td style={styles.metricValue}>{fmtM2(grossFloorArea)}</td>
            </tr>
            <tr>
              <td style={styles.metricLabel}>Total wall area</td>
              <td style={styles.metricValue}>{fmtM2(grossWallArea)}</td>
            </tr>
          </tbody>
        </table>
        <div style={styles.ceilingNote}>
          Ceiling height: {fmtMm(ceilingH)}
        </div>
      </div>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: 320,
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    borderLeft: "1px solid #ddd",
    background: "#fafafa",
    overflow: "hidden",
  },
  controls: {
    padding: "12px 14px",
    borderBottom: "1px solid #e5e5e5",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  toggleLabel: {
    display: "flex",
    alignItems: "center",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  sliderLabel: {
    display: "flex",
    flexDirection: "column",
    fontSize: 12,
    color: "#555",
    gap: 2,
  },
  sliderValue: {
    fontSize: 11,
    color: "#888",
    textAlign: "right" as const,
  },
  roomList: {
    flex: 1,
    overflowY: "auto",
    padding: "8px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  roomCard: {
    background: "#fff",
    border: "1px solid #e5e5e5",
    borderRadius: 8,
    padding: 10,
  },
  roomHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  swatch: {
    display: "inline-block",
    width: 16,
    height: 16,
    borderRadius: 4,
    flexShrink: 0,
  },
  roomName: {
    fontWeight: 700,
    fontSize: 14,
  },
  metricsTable: {
    width: "100%",
    fontSize: 12,
    borderCollapse: "collapse" as const,
  },
  metricLabel: {
    padding: "2px 0",
    color: "#555",
  },
  metricValue: {
    padding: "2px 0",
    textAlign: "right" as const,
    fontWeight: 600,
    fontVariantNumeric: "tabular-nums",
  },
  details: {
    marginTop: 8,
  },
  summary: {
    fontSize: 12,
    color: "#666",
    cursor: "pointer",
    userSelect: "none" as const,
  },
  wallTable: {
    width: "100%",
    fontSize: 11,
    borderCollapse: "collapse" as const,
    marginTop: 4,
  },
  wallTh: {
    textAlign: "left" as const,
    padding: "3px 4px",
    borderBottom: "1px solid #eee",
    fontWeight: 600,
    color: "#444",
  },
  wallTd: {
    padding: "3px 4px",
    borderBottom: "1px solid #f0f0f0",
  },
  totals: {
    padding: "12px 14px",
    borderTop: "1px solid #ddd",
    background: "#f0f0f0",
  },
  totalsTitle: {
    fontWeight: 700,
    fontSize: 13,
    marginBottom: 6,
  },
  ceilingNote: {
    marginTop: 6,
    fontSize: 11,
    color: "#888",
  },
};
