interface Props {
  message: string;
  progress?: number;
}

/** Full-screen loading overlay with a spinner and progress message. */
export default function LoadingOverlay({ message, progress }: Props) {
  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <div style={styles.spinner} />
        <p style={styles.message}>{message}</p>
        {progress !== undefined && (
          <div style={styles.progressBar}>
            <div
              style={{
                ...styles.progressFill,
                width: `${Math.min(100, Math.max(0, progress))}%`,
              }}
            />
          </div>
        )}
        <p style={styles.hint}>This may take 10-30 seconds for AI extraction.</p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 4000,
  },
  card: {
    background: "#fff",
    borderRadius: 12,
    padding: "32px 40px",
    textAlign: "center",
    boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
    maxWidth: 360,
  },
  spinner: {
    width: 40,
    height: 40,
    border: "4px solid #e5e7eb",
    borderTopColor: "#4f46e5",
    borderRadius: "50%",
    margin: "0 auto 16px",
    animation: "spin 0.8s linear infinite",
  },
  message: {
    fontSize: 16,
    fontWeight: 600,
    color: "#1f2937",
    margin: "0 0 8px",
  },
  hint: {
    fontSize: 12,
    color: "#9ca3af",
    margin: "12px 0 0",
  },
  progressBar: {
    width: "100%",
    height: 6,
    background: "#e5e7eb",
    borderRadius: 3,
    overflow: "hidden",
    marginTop: 12,
  },
  progressFill: {
    height: "100%",
    background: "#4f46e5",
    borderRadius: 3,
    transition: "width 0.3s ease",
  },
};
