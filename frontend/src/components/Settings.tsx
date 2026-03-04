import type { AppSettings, UnitSystem } from "../types";

interface Props {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
  onClose: () => void;
}

const UNIT_OPTIONS: { value: UnitSystem; label: string }[] = [
  { value: "mm", label: "Millimetres (mm)" },
  { value: "m", label: "Metres (m)" },
  { value: "ft", label: "Feet (ft)" },
  { value: "in", label: "Inches (in)" },
];

const MODEL_OPTIONS = [
  { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
  { value: "claude-opus-4-20250514", label: "Claude Opus 4" },
];

/** Settings panel for configuring default ceiling height, units, and Claude model. */
export default function Settings({ settings, onChange, onClose }: Props) {
  const update = (patch: Partial<AppSettings>): void => {
    onChange({ ...settings, ...patch });
  };

  /** Returns a height label appropriate for the current unit system. */
  const heightLabel = (): string => {
    switch (settings.units) {
      case "mm":
        return "Default Ceiling Height (mm)";
      case "m":
        return "Default Ceiling Height (m)";
      case "ft":
        return "Default Ceiling Height (ft)";
      case "in":
        return "Default Ceiling Height (in)";
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>Settings</h2>
          <button onClick={onClose} style={styles.closeBtn} aria-label="Close settings">
            x
          </button>
        </div>

        <div style={styles.body}>
          {/* Units */}
          <label style={styles.label}>Preferred Units</label>
          <select
            value={settings.units}
            onChange={(e) => update({ units: e.target.value as UnitSystem })}
            style={styles.select}
          >
            {UNIT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          {/* Ceiling height */}
          <label style={styles.label}>{heightLabel()}</label>
          <input
            type="number"
            value={settings.defaultCeilingHeight}
            onChange={(e) =>
              update({ defaultCeilingHeight: parseFloat(e.target.value) || 0 })
            }
            style={styles.input}
            min={0}
            step={settings.units === "m" ? 0.1 : 1}
          />

          {/* Claude model */}
          <label style={styles.label}>Claude API Model</label>
          <select
            value={settings.claudeModel}
            onChange={(e) => update({ claudeModel: e.target.value })}
            style={styles.select}
          >
            {MODEL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.4)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5000,
  },
  panel: {
    background: "#fff",
    borderRadius: 12,
    width: 420,
    maxWidth: "90vw",
    maxHeight: "80vh",
    overflow: "auto",
    boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 20px",
    borderBottom: "1px solid #eee",
  },
  title: { fontSize: 18, fontWeight: 700, margin: 0 },
  closeBtn: {
    background: "none",
    border: "none",
    fontSize: 20,
    cursor: "pointer",
    color: "#666",
    padding: "4px 8px",
  },
  body: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    padding: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: "#444",
    marginTop: 4,
  },
  select: {
    padding: "8px 12px",
    borderRadius: 6,
    border: "1px solid #ccc",
    fontSize: 14,
    background: "#fff",
  },
  input: {
    padding: "8px 12px",
    borderRadius: 6,
    border: "1px solid #ccc",
    fontSize: 14,
  },
};
