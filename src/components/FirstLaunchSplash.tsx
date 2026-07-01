"use client";

import { useEffect, useState } from "react";

export default function FirstLaunchSplash() {
  const [showSplash, setShowSplash] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    // Check if the splash was already shown in the current session
    if (typeof window !== "undefined") {
      const isSplashShown = sessionStorage.getItem("omnisync_splash_shown");
      if (!isSplashShown) {
        setShowSplash(true);
        // Step 1: Start fadeout after 2000ms
        const fadeTimer = setTimeout(() => {
          setFadeOut(true);
        }, 2000);

        // Step 2: Remove splash entirely after animation completes (2600ms total)
        const removeTimer = setTimeout(() => {
          setShowSplash(false);
          sessionStorage.setItem("omnisync_splash_shown", "true");
        }, 2600);

        return () => {
          clearTimeout(fadeTimer);
          clearTimeout(removeTimer);
        };
      }
    }
  }, []);

  if (!showSplash) return null;

  return (
    <div className={`splash-overlay ${fadeOut ? "fade-out" : ""}`}>
      <div className="splash-logo-container">
        {/* Glowing swirling SVG sync icon */}
        <svg
          className="splash-icon"
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#58a6ff"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
        </svg>
      </div>

      <h1 className="splash-title">OMNISYNC</h1>
      <p className="splash-subtitle">Initialising environment engine...</p>

      <div className="splash-progress-track">
        <div className="splash-progress-bar" />
      </div>
    </div>
  );
}
