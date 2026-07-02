"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";

type DashboardTab = "workspace" | "git" | "diagnostics" | "settings" | "timeline";

interface TourStep {
  targetId: string;
  title: string;
  description: string;
  position: "right" | "bottom" | "left" | "top" | "center";
  tab?: DashboardTab;
  section?: string;
}

const TOUR_CARD_WIDTH = 320;
const TOUR_CARD_HEIGHT = 240;
const VIEWPORT_PADDING = 16;
const TARGET_PADDING = 12;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function computeTipStyle(
  coords: { top: number; left: number; width: number; height: number },
  position: TourStep["position"]
): React.CSSProperties {
  const cardWidth = Math.min(TOUR_CARD_WIDTH, window.innerWidth - VIEWPORT_PADDING * 2);
  const cardHeight = TOUR_CARD_HEIGHT;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const { top, left, width, height } = coords;

  let tipTop = VIEWPORT_PADDING;
  let tipLeft = VIEWPORT_PADDING;

  if (position === "right") {
    tipTop = top + height / 2 - cardHeight / 2;
    tipLeft = left + width + TARGET_PADDING;
  } else if (position === "left") {
    tipTop = top + height / 2 - cardHeight / 2;
    tipLeft = left - TARGET_PADDING - cardWidth;
  } else if (position === "bottom") {
    tipTop = top + height + TARGET_PADDING;
    tipLeft = left + width / 2 - cardWidth / 2;
  } else if (position === "top") {
    tipTop = top - TARGET_PADDING - cardHeight;
    tipLeft = left + width / 2 - cardWidth / 2;
  }

  tipLeft = clamp(tipLeft, VIEWPORT_PADDING, vw - cardWidth - VIEWPORT_PADDING);
  tipTop = clamp(tipTop, VIEWPORT_PADDING, vh - cardHeight - VIEWPORT_PADDING);

  return {
    position: "fixed",
    top: tipTop,
    left: tipLeft,
  };
}

const TOUR_STEPS: TourStep[] = [
  {
    targetId: "",
    title: "Welcome to OmniSync",
    description:
      "Your local control center for GitHub-backed repositories. This guide walks through every major area — editing code, syncing git, running servers, diagnosing issues, and configuring your workspace.",
    position: "center",
  },
  {
    targetId: "tour-sidebar",
    title: "Navigation sidebar",
    description:
      "Five sections, one sidebar:\n• Workspace — browse files, edit code, run servers\n• Git Sync — fetch, pull, push, resolve conflicts\n• Diagnostics — audit Node.js and dependencies\n• Timeline — commit calendar and history\n• Settings — global and workspace preferences",
    position: "right",
    tab: "workspace",
    section: "Overview",
  },
  {
    targetId: "tour-file-tree",
    title: "File explorer",
    description:
      "Browse your repository tree. Click any file to open it in the editor. Hidden dotfiles can be toggled from Settings → General.",
    position: "right",
    tab: "workspace",
    section: "Workspace",
  },
  {
    targetId: "tour-code-editor",
    title: "Code editor",
    description:
      "View file contents with syntax-friendly formatting. Open multiple files as tabs, switch between them, and close tabs when done.",
    position: "right",
    tab: "workspace",
    section: "Workspace",
  },
  {
    targetId: "tour-diff-panel",
    title: "Per-file git history",
    description:
      "Select a file to see its commit history, diffs, and blame context without leaving the workspace. Useful for tracing when and why a line changed.",
    position: "left",
    tab: "workspace",
    section: "Workspace",
  },
  {
    targetId: "tour-runner",
    title: "Development server",
    description:
      "Start and stop your project's dev server (npm run dev or a custom command from workspace settings). When running, launch the app in your browser or Electron.",
    position: "bottom",
    tab: "workspace",
    section: "Workspace",
  },
  {
    targetId: "tour-branch",
    title: "Branch switcher",
    description:
      "Switch the active git branch for this workspace. OmniSync reloads files and sync status automatically after a branch change.",
    position: "bottom",
    tab: "workspace",
    section: "Workspace",
  },
  {
    targetId: "tour-open-ide",
    title: "Open in external IDE",
    description:
      "Jump into VS Code, Zed, IntelliJ, WebStorm, Xcode, or other configured editors with your workspace folder already loaded.",
    position: "bottom",
    tab: "workspace",
    section: "Workspace",
  },
  {
    targetId: "tour-git-sync",
    title: "Repository sync",
    description:
      "See how many commits you're ahead or behind upstream, then fetch, pull, or push. Protected branches block direct pushes when branch protection is enabled.",
    position: "right",
    tab: "git",
    section: "Git Sync",
  },
  {
    targetId: "tour-git-changes",
    title: "Staging & commits",
    description:
      "Review changed files, stage selections, write commit messages, and push — all from the git panel without switching to a terminal.",
    position: "right",
    tab: "git",
    section: "Git Sync",
  },
  {
    targetId: "tour-git-conflicts",
    title: "Conflict resolver",
    description:
      "When merges produce conflicts, pick a file here to open the three-pane resolver — yours, theirs, and the merged result — and save the resolution.",
    position: "right",
    tab: "git",
    section: "Git Sync",
  },
  {
    targetId: "tour-diagnostics-panel",
    title: "Environment diagnostics",
    description:
      "Scan Node.js compatibility, npm versions, and missing dependencies. Run repair commands like cache cleanup, security audit fix, or a full node_modules reinstall.",
    position: "right",
    tab: "diagnostics",
    section: "Diagnostics",
  },
  {
    targetId: "tour-timeline-panel",
    title: "Commit timeline",
    description:
      "Explore a GitHub-style contribution calendar and drill into commits by date. Switch years to review long-term project activity.",
    position: "right",
    tab: "timeline",
    section: "Timeline",
  },
  {
    targetId: "tour-settings-panel",
    title: "Settings",
    description:
      "Configure global preferences (theme, git identity, fetch interval) and workspace-specific options (repo path, dev commands, branch protection).",
    position: "right",
    tab: "settings",
    section: "Settings",
  },
  {
    targetId: "",
    title: "You're all set",
    description:
      "Reopen this guide anytime from the Guide Tour button in the header. Switch workspaces from the top bar, and happy shipping.",
    position: "center",
    section: "Done",
  },
];

interface ProductTourProps {
  activeTab: string;
  setActiveTab: (tab: DashboardTab) => void;
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

  const currentStep = TOUR_STEPS[stepIndex];

  useEffect(() => {
    if (typeof window !== "undefined") {
      const globalTourShown = localStorage.getItem("omnisync_global_tour_shown");
      if (!globalTourShown) {
        const timer = setTimeout(() => {
          setIsActive(true);
        }, 3200);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  useEffect(() => {
    if (isOpenExternally) {
      setIsActive(true);
      setStepIndex(0);
    }
  }, [isOpenExternally]);

  useEffect(() => {
    if (!isActive) return;
    if (currentStep.tab && activeTab !== currentStep.tab) {
      setActiveTab(currentStep.tab);
    }
  }, [stepIndex, isActive, activeTab, setActiveTab, currentStep.tab]);

  const updateCoords = useCallback(() => {
    if (!isActive) return;

    if (!currentStep.targetId) {
      setCoords(null);
      return;
    }

    const element = document.getElementById(currentStep.targetId);
    if (element) {
      element.scrollIntoView({ block: "nearest", inline: "nearest" });
      const rect = element.getBoundingClientRect();
      setCoords({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });
    } else {
      setCoords(null);
    }
  }, [isActive, currentStep.targetId]);

  useEffect(() => {
    if (!isActive) return;
    if (currentStep.tab && activeTab !== currentStep.tab) return;

    const delay = currentStep.tab ? 280 : 150;
    const timer = setTimeout(updateCoords, delay);
    const retry = setTimeout(updateCoords, delay + 400);
    return () => {
      clearTimeout(timer);
      clearTimeout(retry);
    };
  }, [stepIndex, isActive, activeTab, currentStep.tab, updateCoords]);

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
  }, [updateCoords]);

  if (!isActive) return null;

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

  let tipStyle: React.CSSProperties = {};
  if (coords) {
    tipStyle = computeTipStyle(coords, currentStep.position);
  } else {
    tipStyle = {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
    };
  }

  return (
    <div className="tour-overlay-container">
      {coords && (
        <div
          className="tour-spotlight-mask"
          style={{
            position: "fixed",
            top: coords.top - 6,
            left: coords.left - 6,
            width: coords.width + 12,
            height: coords.height + 12,
          }}
        />
      )}

      <div className="tour-card" style={tipStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
          <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", color: "var(--color-accent-fg)", letterSpacing: "0.5px" }}>
            {currentStep.section ? `${currentStep.section} · OmniSync Guide` : "OmniSync Guide"}
          </span>
          <span style={{ fontSize: "11px", color: "var(--color-fg-muted)", fontWeight: 500 }}>
            {stepIndex + 1} / {TOUR_STEPS.length}
          </span>
        </div>

        <h3 style={{ fontSize: "15px", fontWeight: "700", margin: "0 0 8px 0", color: "#ffffff" }}>
          {currentStep.title}
        </h3>

        <p
          style={{
            fontSize: "12.5px",
            color: "var(--color-fg-default)",
            margin: "0 0 16px 0",
            lineHeight: "18px",
            whiteSpace: "pre-line",
          }}
        >
          {currentStep.description}
        </p>

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

        {coords && <div className={`tour-arrow arrow-${currentStep.position}`} />}
      </div>
    </div>
  );
}
