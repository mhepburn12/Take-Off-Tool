import { useState, useCallback } from "react";
import type { Toast, ToastType } from "../types";

let nextId = 0;

/** Hook for managing toast notifications. */
export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback(
    (type: ToastType, message: string, duration?: number): void => {
      const id = String(++nextId);
      setToasts((prev) => [...prev, { id, type, message, duration }]);
    },
    [],
  );

  const dismissToast = useCallback((id: string): void => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, addToast, dismissToast } as const;
}
