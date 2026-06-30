"use client";

import { useEffect } from "react";

export default function ElectronDragHelper() {
  useEffect(() => {
    if (typeof window !== "undefined") {
      const isElectron = window.navigator.userAgent.toLowerCase().includes("electron");
      if (isElectron) {
        document.body.classList.add("electron-app");
      }
    }
  }, []);

  return <div className="electron-drag-bar" />;
}
