import { useRef, useState } from "react";
import type { JobResult } from "../App";

interface Props {
  onUploaded: (job: JobResult) => void;
}

export default function UploadPage({ onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async () => {
    const file = inputRef.current?.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch("/api/upload", { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail ?? `Upload failed (${res.status})`);
      }
      const data: JobResult = await res.json();
      onUploaded(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Plan Take-Off</h1>
      <p style={styles.subtitle}>Upload a PDF to get started</p>

      <div style={styles.card}>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          disabled={uploading}
          style={styles.input}
        />
        <button onClick={handleUpload} disabled={uploading} style={styles.btn}>
          {uploading ? "Uploading…" : "Upload"}
        </button>
      </div>

      {error && <p style={styles.error}>{error}</p>}
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
  },
  title: { fontSize: 28, fontWeight: 700 },
  subtitle: { color: "#666", marginBottom: 16 },
  card: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    padding: 24,
    border: "2px dashed #ccc",
    borderRadius: 12,
    background: "#fff",
  },
  input: { fontSize: 14 },
  btn: {
    padding: "8px 20px",
    fontSize: 14,
    fontWeight: 600,
    background: "#4f46e5",
    color: "#fff",
    border: "none",
    borderRadius: 6,
  },
  error: { color: "red", marginTop: 8 },
};
