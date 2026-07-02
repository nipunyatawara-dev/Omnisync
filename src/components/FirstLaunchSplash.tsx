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
        <img
          src="/icon.png"
          alt="OmniSync"
          className="splash-icon"
          width={72}
          height={72}
        />
      </div>

      <h1 className="splash-title">OMNISYNC</h1>
      <p className="splash-subtitle">Initialising environment engine...</p>

      <div className="splash-progress-track">
        <div className="splash-progress-bar" />
      </div>
    </div>
  );
}
