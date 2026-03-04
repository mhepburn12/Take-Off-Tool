import { useEffect, useCallback, useRef } from "react";
import type { Toast } from "../types";

interface Props {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

const COLORS: Record<Toast["type"], { bg: string; border: string; icon: string }> = {
  success: { bg: "#f0fdf4", border: "#22c55e", icon: "\u2713" },
  error: { bg: "#fef2f2", border: "#ef4444", icon: "\u2717" },
  warning: { bg: "#fffbeb", border: "#f59e0b", icon: "\u26A0" },
  info: { bg: "#eff6ff", border: "#3b82f6", icon: "\u2139" },
};

/** Renders a stack of toast notifications in the top-right corner. */
export default function ToastContainer({ toasts, onDismiss }: Props) {
  return (
    <div style={styles.container} role="status" aria-live="polite">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const dismiss = useCallback(() => onDismiss(toast.id), [onDismiss, toast.id]);

  useEffect(() => {
    const duration = toast.duration ?? (toast.type === "error" ? 8000 : 4000);
    timerRef.current = setTimeout(dismiss, duration);
    return () => clearTimeout(timerRef.current);
  }, [dismiss, toast.duration, toast.type]);

  const c = COLORS[toast.type];

  return (
    <div
      style={{
        ...styles.toast,
        background: c.bg,
        borderLeft: `4px solid ${c.border}`,
      }}
      onClick={dismiss}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && dismiss()}
    >
      <span style={{ marginRight: 8, fontSize: 16 }}>{c.icon}</span>
      <span style={{ flex: 1 }}>{toast.message}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          dismiss();
        }}
        style={styles.closeBtn}
        aria-label="Dismiss"
      >
        x
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: "fixed",
    top: 16,
    right: 16,
    zIndex: 9999,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    maxWidth: 400,
    pointerEvents: "none",
  },
  toast: {
    pointerEvents: "auto",
    display: "flex",
    alignItems: "center",
    padding: "10px 14px",
    borderRadius: 8,
    boxShadow: "0 2px 12px rgba(0,0,0,0.12)",
    fontSize: 14,
    cursor: "pointer",
    animation: "slideIn 0.2s ease-out",
  },
  closeBtn: {
    background: "none",
    border: "none",
    fontSize: 14,
    cursor: "pointer",
    padding: "0 4px",
    color: "#666",
    marginLeft: 8,
  },
};
