"use client";

import { useState, useEffect, useRef } from "react";
import type { DependencyInstallModalState } from "@/components/DependencyInstallModal";
import type { DiagnosticDetails } from "@/types/dashboard";
import type { ToastType } from "@/hooks/useNotifications";
import { readDiagnosticsNdjsonStream } from "@/lib/diagnosticsStream";

export function useDiagnostics(
  showNotification: (message: string, type?: ToastType, duration?: number) => void,
  setGitChangesRefreshKey: React.Dispatch<React.SetStateAction<number>>
) {
  const [diagData, setDiagData] = useState<DiagnosticDetails | null>(null);
  const [isDiagLoading, setIsDiagLoading] = useState(false);
  const [lastCommandExit, setLastCommandExit] = useState<{ success: boolean } | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [diagnosticLogs, setDiagnosticLogs] = useState<string[]>([]);
  const [depInstallModal, setDepInstallModal] = useState<DependencyInstallModalState | null>(null);

  const terminalScrollRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollTerminalRef = useRef(true);

  const maintenanceCommandLabel: Record<string, string> = {
    "clean-cache": "npm cache clean --force",
    "clean-modules": "npm install",
    "audit-fix": "npm audit fix --force",
  };

  const loadDiagnostics = async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) {
      Promise.resolve().then(() => {
        setIsDiagLoading(true);
      });
    }
    try {
      const res = await fetch("/api/workspace/diagnostics");
      const data = await res.json();
      setDiagData(data as DiagnosticDetails);
    } catch {} finally {
      if (!opts?.silent) {
        setIsDiagLoading(false);
      }
    }
  };

  const streamInstallOutput = async (
    onLog: (message: string) => void
  ): Promise<void> => {
    const res = await fetch("/api/workspace/diagnostics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "install" }),
    });

    if (!res.ok) {
      throw new Error("Install command failed to start");
    }

    await readDiagnosticsNdjsonStream(res, onLog);
  };

  const autoInstallOfferedKey = (workspaceKey: string) =>
    `omnisync_auto_install_offered:${workspaceKey}`;

  const runDependencyInstall = async (missingPackages: string[]) => {
    const count = missingPackages.length;

    setDepInstallModal({
      phase: "installing",
      missingCount: count,
      missingPackages,
      logs: [`Detected ${count} missing package${count === 1 ? "" : "s"}. Running npm install...`],
    });

    setDiagnosticLogs((prev) => [
      ...prev,
      ...(prev.length > 0 ? [""] : []),
      `Detected ${count} missing package${count === 1 ? "" : "s"}. Running npm install...`,
    ]);

    const appendLog = (message: string) => {
      setDiagnosticLogs((prev) => [...prev, message]);
      setDepInstallModal((prev) =>
        prev ? { ...prev, logs: [...prev.logs, message] } : prev
      );
    };

    try {
      await streamInstallOutput(appendLog);

      setDepInstallModal((prev) =>
        prev && !prev.logs.some((l) => /All dependencies installed successfully/i.test(l))
          ? { ...prev, phase: "success", logs: [...prev.logs, "All dependencies installed successfully."] }
          : prev
            ? { ...prev, phase: "success" }
            : prev
      );
      showNotification("Dependencies installed successfully!", "success");
      setGitChangesRefreshKey((key) => key + 1);

      const reloadRes = await fetch("/api/workspace/diagnostics");
      const reloadData = await reloadRes.json();
      setDiagData(reloadData as DiagnosticDetails);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      appendLog(`Error: ${errMsg}`);
      setDepInstallModal((prev) =>
        prev ? { ...prev, phase: "error", error: errMsg } : prev
      );
      showNotification(`Dependency installation failed: ${errMsg}`, "error");
    } finally {
      void loadDiagnostics({ silent: true });
    }
  };

  const checkAndInstallDependencies = async (
    diagnostics: DiagnosticDetails,
    workspaceKey = "default"
  ) => {
    if (!diagnostics.missingDependencies || diagnostics.missingDependencies.length === 0) {
      return;
    }

    // If node_modules already exists, dependencies were installed before — do not
    // auto re-run npm install when switching back to this workspace. Partial gaps
    // can still be fixed manually from the Diagnostics tab.
    if (diagnostics.nodeModulesExists) {
      return;
    }

    if (typeof window !== "undefined") {
      const storageKey = autoInstallOfferedKey(workspaceKey);
      if (sessionStorage.getItem(storageKey) === "1") {
        return;
      }
      sessionStorage.setItem(storageKey, "1");
    }

    await runDependencyInstall(diagnostics.missingDependencies);
  };

  const appendDiagnosticSessionLine = (line: string) => {
    setDiagnosticLogs((prev) => [...prev, line]);
  };

  const handleTerminalScroll = () => {
    const el = terminalScrollRef.current;
    if (!el) return;
    shouldAutoScrollTerminalRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  };

  const handleMaintenanceAction = async (action: string) => {
    const prompt = diagData
      ? `${diagData.username || "user"}@${diagData.hostname || "localhost"} ${diagData.folderName || "workspace"}`
      : "user@localhost workspace";
    const commandLabel = maintenanceCommandLabel[action] || action;

    const ok = window.confirm(
      `Run “${commandLabel}”? This runs as your user with full shell access on this machine.`
    );
    if (!ok) return;

    setIsActionLoading(true);
    setLastCommandExit(null);
    shouldAutoScrollTerminalRef.current = true;

    setDiagnosticLogs((prev) => [
      ...prev,
      ...(prev.length > 0 ? [""] : []),
      `> ${prompt} % ${commandLabel}`,
    ]);

    try {
      const res = await fetch("/api/workspace/diagnostics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      if (!res.ok) {
        throw new Error("Maintenance action failed to start");
      }

      await readDiagnosticsNdjsonStream(res, appendDiagnosticSessionLine);

      setLastCommandExit({ success: true });
      setGitChangesRefreshKey((key) => key + 1);
      void loadDiagnostics({ silent: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      appendDiagnosticSessionLine(`Error: ${msg}`);
      setLastCommandExit({ success: false });
    } finally {
      setIsActionLoading(false);
    }
  };

  useEffect(() => {
    if (!shouldAutoScrollTerminalRef.current) return;
    const el = terminalScrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [diagnosticLogs, isActionLoading]);

  return {
    diagData,
    setDiagData,
    isDiagLoading,
    lastCommandExit,
    isActionLoading,
    diagnosticLogs,
    depInstallModal,
    setDepInstallModal,
    terminalScrollRef,
    loadDiagnostics,
    checkAndInstallDependencies,
    runDependencyInstall,
    handleMaintenanceAction,
    handleTerminalScroll,
  };
}
