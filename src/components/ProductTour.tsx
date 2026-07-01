"use client";

import React, { useEffect, useState, useRef } from "react";

interface TourStep {
  targetId: string;
  title: string;
  description: string;
  position: "right" | "bottom" | "left" | "top" | "center";
}

const TOUR_STEPS: TourStep[] = [
  {
    targetId: "",
    title: "Welcome to OmniSync!",
    description: "OmniSync is your ultimate tool for workspace synchronization, conflict resolution, diagnostics, and running development environments. Let's take a quick 1-minute tour to get you started.",
    position: "center",
  },
  {
    targetId: "tour-sidebar",
    title: "Sidebar Navigation",
    description: "Switch between sections of your workflow:\n• Workspace (files, editor, servers)\n• Git Sync (branches, conflict resolver)\n• Diagnostics (environment integrity audits)\n• Timeline (repository calendar and commits)\n• Settings (workspace mapping configuration)",
    position: "right",
  },
  {
    targetId: "tour-runner",
    title: "Project Server Control",
    description: "Start, stop, and monitor your development servers directly inside the dashboard. Launch a browser page or wrap it in an Electron client once active.",
    position: "bottom",
  },
  {
    targetId: "tour-branch",
    title: "Interactive Branch Switcher",
    description: "Switch branch nodes and trigger repository sync updates dynamically to load different states of your repository workspace.",
    position: "left",
  },
  {
    targetId: "tour-diagnostics-btn",
    title: "Environment Diagnostics",
    description: "Audit Node.js engine compatibility, scan package dependencies, and run automated script repairs to resolve compiler issues.",
    position: "right",
  },
];

interface ProductTourProps {
  activeTab: string;
  setActiveTab: (tab: "workspace" | "git" | "diagnostics" | "settings" | "timeline") => void;
  isOpenExternally?: boolean;
  onCloseExternally?: () => void;
}

export default function ProductTour({
  activeTab,
  setActiveTab,
  isOpenExternally = false,
  onCloseExternally,
}: ProductTourProps) {
  const [isActive, setIsActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const resizeTimeout = useRef<number | null>(null);

  // Check first launch
  useEffect(() => {
    if (typeof window !== "undefined") {
      const globalTourShown = localStorage.getItem("omnisync_global_tour_shown");
      if (!globalTourShown) {
        // Delay tour slightly to let the page render and load profile
        const timer = setTimeout(() => {
          setIsActive(true);
        }, 3200);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  // Handle external triggers (e.g. clicking the Help button)
  useEffect(() => {
    if (isOpenExternally) {
      setIsActive(true);
      setStepIndex(0);
    }
  }, [isOpenExternally]);

  // Adjust active tab based on tour step so elements are visible
  useEffect(() => {
    if (!isActive) return;
    const currentStep = TOUR_STEPS[stepIndex];
    if (currentStep.targetId === "tour-runner" || currentStep.targetId === "tour-branch") {
      if (activeTab !== "workspace") {
        setActiveTab("workspace");
      }
    }
  }, [stepIndex, isActive, activeTab, setActiveTab]);

  // Calculate coordinates of the active target element
  const updateCoords = () => {
    if (!isActive) return;
    const currentStep = TOUR_STEPS[stepIndex];
    if (!currentStep.targetId) {
      setCoords(null);
      return;
    }

    const element = document.getElementById(currentStep.targetId);
    if (element) {
      const rect = element.getBoundingClientRect();
      setCoords({
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
        height: rect.height,
      });
    } else {
      // If target element is not found (e.g. hidden or loaded late), fallback to center style
      setCoords(null);
    }
  };

  useEffect(() => {
    // Run coordination update after DOM updates
    const timer = setTimeout(updateCoords, 150);
    return () => clearTimeout(timer);
  }, [stepIndex, isActive, activeTab]);

  useEffect(() => {
    const handleResize = () => {
      if (resizeTimeout.current) window.cancelAnimationFrame(resizeTimeout.current);
      resizeTimeout.current = window.requestAnimationFrame(updateCoords);
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      if (resizeTimeout.current) window.cancelAnimationFrame(resizeTimeout.current);
    };
  }, [stepIndex, isActive]);

  if (!isActive) return null;

  const currentStep = TOUR_STEPS[stepIndex];

  const handleNext = () => {
    if (stepIndex < TOUR_STEPS.length - 1) {
      setStepIndex(stepIndex + 1);
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (stepIndex > 0) {
      setStepIndex(stepIndex - 1);
    }
  };

  const handleComplete = () => {
    setIsActive(false);
    localStorage.setItem("omnisync_global_tour_shown", "true");
    localStorage.setItem("omnisync_tour_completed", "true");
    if (onCloseExternally) {
      onCloseExternally();
    }
  };

  // Compute position coordinates for the popover tip
  let tipStyle: React.CSSProperties = {};
  if (coords) {
    const padding = 12;
    if (currentStep.position === "right") {
      tipStyle = {
        top: coords.top + coords.height / 2,
        left: coords.left + coords.width + padding,
        transform: "translateY(-50%)",
      };
    } else if (currentStep.position === "bottom") {
      tipStyle = {
        top: coords.top + coords.height + padding,
        left: coords.left + coords.width / 2,
        transform: "translateX(-50%)",
      };
    } else if (currentStep.position === "left") {
      tipStyle = {
        top: coords.top + coords.height / 2,
        left: coords.left - padding,
        transform: "translate(-100%, -50%)",
      };
    } else if (currentStep.position === "top") {
      tipStyle = {
        top: coords.top - padding,
        left: coords.left + coords.width / 2,
        transform: "translate(-50%, -100%)",
      };
    }
  } else {
    // Center modal
    tipStyle = {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
    };
  }

  return (
    <div className="tour-overlay-container">
      {/* Target spotlight mask */}
      {coords && (
        <div
          className="tour-spotlight-mask"
          style={{
            top: coords.top - 6,
            left: coords.left - 6,
            width: coords.width + 12,
            height: coords.height + 12,
          }}
        />
      )}

      {/* Product tour popover dialog */}
      <div
        className="tour-card"
        style={{
          position: coords ? "absolute" : "fixed",
          ...tipStyle,
        }}
      >
        {/* Step indicator */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
          <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", color: "var(--color-accent-fg)", letterSpacing: "0.5px" }}>
            OmniSync Guide
          </span>
          <span style={{ fontSize: "11px", color: "var(--color-fg-muted)", fontWeight: 500 }}>
            {stepIndex + 1} of {TOUR_STEPS.length}
          </span>
        </div>

        <h3 style={{ fontSize: "15px", fontWeight: "700", margin: "0 0 8px 0", color: "#ffffff" }}>
          {currentStep.title}
        </h3>

        <p style={{
          fontSize: "12.5px",
          color: "var(--color-fg-default)",
          margin: "0 0 16px 0",
          lineHeight: "18px",
          whiteSpace: "pre-line",
        }}>
          {currentStep.description}
        </p>

        {/* Action Controls */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button
            onClick={handleComplete}
            style={{
              background: "none",
              border: "none",
              color: "var(--color-fg-muted)",
              fontSize: "12px",
              padding: "4px 8px",
              cursor: "pointer",
            }}
          >
            Skip Guide
          </button>

          <div style={{ display: "flex", gap: "8px" }}>
            {stepIndex > 0 && (
              <button
                className="btn btn-sm"
                onClick={handleBack}
                style={{ height: "28px", padding: "0 12px", fontSize: "12px" }}
              >
                Back
              </button>
            )}
            <button
              className="btn btn-sm"
              onClick={handleNext}
              style={{
                height: "28px",
                padding: "0 12px",
                fontSize: "12px",
                backgroundColor: "var(--color-btn-primary-bg)",
                borderColor: "var(--color-btn-primary-border)",
                color: "#ffffff",
              }}
            >
              {stepIndex === TOUR_STEPS.length - 1 ? "Finish" : "Next"}
            </button>
          </div>
        </div>

        {/* Tour bubble arrow pointer */}
        {coords && <div className={`tour-arrow arrow-${currentStep.position}`} />}
      </div>
    </div>
  );
}
