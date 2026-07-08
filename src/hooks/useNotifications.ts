"use client";

import { useState, useRef, useCallback } from "react";

export type ToastType = "info" | "success" | "error";

export function useNotifications() {
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const dismissToast = useCallback(() => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = null;
    }
    setToast(null);
  }, []);

  const showNotification = useCallback(
    (message: string, type: ToastType = "info", duration = 4000) => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
        toastTimeoutRef.current = null;
      }

      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
        try {
          new window.Notification("OmniSync", { body: message });
          setToast(null);
          return;
        } catch {
          // fall through to toast
        }
      }

      setToast({ message, type });
      toastTimeoutRef.current = setTimeout(() => {
        setToast(null);
        toastTimeoutRef.current = null;
      }, duration);
    },
    []
  );

  return { toast, dismissToast, showNotification };
}
