import { useRef, useState } from "react";
import type { JobResult } from "../types";

interface Props {
  onUploaded: (job: JobResult) => void;
  onAddToast: (type: "success" | "error" | "warning" | "info", message: string) => void;
}

/** Upload page for selecting and uploading a PDF plan. */
export default function UploadPage({ onUploaded, onAddToast }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>("");

  /** Handle the PDF upload with loading states and error handling. */
  const handleUpload = async (): Promise<void> => {
    const file = inputRef.current?.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    setProgress("Uploading PDF...");

    const form = new FormData();
    form.append("file", file);

    try {
      setProgress("Converting pages (this may take a moment for large plans)...");
      const res = await fetch("/api/upload", { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail ?? `Upload failed (${res.status})`);
      }
      const data = (await res.json()) as JobResult;
      onUploaded(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setError(msg);
      onAddToast("error", msg);
    } finally {
      setUploading(false);
      setProgress("");
    }
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Plan Take-Off</h1>
      <p style={styles.subtitle}>
        Upload a PDF to get started. Supports A0 through A4 paper sizes.
      </p>

      <div style={styles.card}>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          disabled={uploading}
          style={styles.input}
        />
        <button onClick={handleUpload} disabled={uploading} style={styles.btn}>
          {uploading ? "Uploading..." : "Upload"}
        </button>
      </div>

      {uploading && progress && (
        <div style={styles.progressContainer}>
          <div style={styles.spinner} />
          <p style={styles.progressText}>{progress}</p>
        </div>
      )}

      {error && (
        <div style={styles.errorContainer}>
          <p style={styles.error}>{error}</p>
          <button onClick={handleUpload} style={styles.retryBtn}>
            Retry Upload
          </button>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    gap: 12,
    padding: 16,
  },
  title: { fontSize: 28, fontWeight: 700 },
  subtitle: { color: "#666", marginBottom: 16, textAlign: "center" },
  card: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    padding: 24,
    border: "2px dashed #ccc",
    borderRadius: 12,
    background: "#fff",
    flexWrap: "wrap",
    justifyContent: "center",
  },
  input: { fontSize: 14, maxWidth: "100%" },
  btn: {
    padding: "8px 20px",
    fontSize: 14,
    fontWeight: 600,
    background: "#4f46e5",
    color: "#fff",
    border: "none",
    borderRadius: 6,
  },
  progressContainer: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginTop: 8,
  },
  spinner: {
    width: 20,
    height: 20,
    border: "3px solid #e5e7eb",
    borderTopColor: "#4f46e5",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  progressText: { color: "#4f46e5", fontSize: 14, fontWeight: 500 },
  errorContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  error: { color: "red", margin: 0 },
  retryBtn: {
    padding: "6px 16px",
    fontSize: 13,
    fontWeight: 600,
    background: "#ef4444",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
  },
};
