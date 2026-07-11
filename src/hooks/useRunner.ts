"use client";

import { useState, useEffect, useRef } from "react";
import type { UserProfile } from "@/lib/profiles";
import { RunnerStatus } from "@/lib/runner";
import type { ToastType } from "@/hooks/useNotifications";

export function useRunner(
  showNotification: (message: string, type?: ToastType, duration?: number) => void,
  activeProfile: UserProfile | null
) {
  const [runnerStatus, setRunnerStatus] = useState<RunnerStatus>({ status: "stopped", pid: null });
  const [runnerLogs, setRunnerLogs] = useState<string[]>([]);
  const [isRunnerLoading, setIsRunnerLoading] = useState(false);
  const [launchOptions, setLaunchOptions] = useState<string[]>([]);
  const [isIdeDropdownOpen, setIsIdeDropdownOpen] = useState(false);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    async function loadRunnerStatus() {
      try {
        const res = await fetch("/api/workspace/runner");
        const data = await res.json();
        if (data?.status) {
          setRunnerStatus(data.status as RunnerStatus);
        }
        if (data?.logs) {
          setRunnerLogs((data.logs as string[]) || []);
        }
      } catch {}
    }
    loadRunnerStatus();
  }, []);

  const loadLaunchOptions = async () => {
    try {
      const res = await fetch("/api/workspace/launch");
      const data = await res.json();
      setLaunchOptions(data.launchOptions || ["browser"]);
    } catch {
      setLaunchOptions(["browser"]);
    }
  };

  const handleToggleRunner = async () => {
    setIsRunnerLoading(true);
    const action = runnerStatus?.status === "running" || runnerStatus?.status === "starting" ? "stop" : "start";
    try {
      const res = await fetch("/api/workspace/runner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data && data.success && data.status) {
        setRunnerStatus(data.status as RunnerStatus);
      }
    } catch {} finally {
      setIsRunnerLoading(false);
    }
  };

  const handleLaunchTarget = async (type: string) => {
    const port = activeProfile?.port && activeProfile.port > 0 ? activeProfile.port : 3000;
    try {
      await fetch("/api/workspace/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, port }),
      });
      showNotification(
        `Launching ${type === "xcode" ? "Xcode Workspace" : type === "electron" ? "Electron App" : "Local Browser"}...`,
        "success",
        3000
      );
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      showNotification(`Launch failed: ${errMsg}`, "error", 4000);
    }
  };

  const handleLaunchIde = async (ideId: string, ideName: string) => {
    setIsIdeDropdownOpen(false);
    try {
      const res = await fetch("/api/workspace/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "ide", ide: ideId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showNotification(`Successfully launched codebase in ${ideName}!`, "success", 3000);
      } else {
        showNotification(`Failed to launch ${ideName}: ${data.error || "Launch command error"}`, "error", 3000);
      }
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      showNotification(`Launch failed: ${errMsg}`, "error", 4000);
    }
  };

  useEffect(() => {
    const isRunnerActive = runnerStatus?.status === "running" || runnerStatus?.status === "starting";

    async function checkRunner() {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      try {
        const res = await fetch("/api/workspace/runner");
        const data = await res.json();
        if (data && data.status) {
          setRunnerStatus(data.status as RunnerStatus);
        }
        if (data && data.logs) {
          setRunnerLogs((data.logs as string[]) || []);
        }
      } catch {}
    }

    checkRunner();

    // Poll faster while running; slower heartbeat when stopped to detect external state.
    const intervalMs = isRunnerActive ? 3000 : 10000;
    pollIntervalRef.current = setInterval(checkRunner, intervalMs);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void checkRunner();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [runnerStatus?.status]);

  return {
    runnerStatus,
    runnerLogs,
    isRunnerLoading,
    launchOptions,
    isIdeDropdownOpen,
    setIsIdeDropdownOpen,
    loadLaunchOptions,
    handleToggleRunner,
    handleLaunchTarget,
    handleLaunchIde,
  };
}
