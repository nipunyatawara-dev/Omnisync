"use client";

import FileTree, { FileNode } from "@/components/FileTree";
import CodeViewer from "@/components/CodeViewer";
import DiffViewer from "@/components/DiffViewer";
import Loader from "@/components/Loader";
import Tooltip from "@/components/Tooltip";
import type { UserProfile } from "@/lib/profiles";
import { RunnerStatus } from "@/lib/runner";

interface WorkspaceViewProps {
  activeProfile: UserProfile | null;
  runnerStatus: RunnerStatus;
  isRunnerLoading: boolean;
  launchOptions: string[];
  branches: string[];
  currentBranch: string;
  isChangingBranch: boolean;
  isIdeDropdownOpen: boolean;
  setIsIdeDropdownOpen: (open: boolean) => void;
  fileTree: FileNode[];
  activeFile: string | null;
  openFiles: string[];
  fileContent: string;
  isFileLoading: boolean;
  leftWidth: number;
  rightWidth: number;
  isResizingLeft: boolean;
  isResizingRight: boolean;
  onToggleRunner: () => void;
  onLaunchTarget: (type: string) => void;
  onLaunchIde: (ideId: string, ideName: string) => void;
  onBranchChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  onSelectFile: (file: string) => void;
  onCloseFile: (file: string, e: React.MouseEvent) => void;
  onExpandDirectory?: (relativePath: string) => Promise<void> | void;
  onClearConflictSelection: () => void;
  startResizeLeft: (e: React.MouseEvent) => void;
  startResizeRight: (e: React.MouseEvent) => void;
}

export default function WorkspaceView({
  activeProfile,
  runnerStatus,
  isRunnerLoading,
  launchOptions,
  branches,
  currentBranch,
  isChangingBranch,
  isIdeDropdownOpen,
  setIsIdeDropdownOpen,
  fileTree,
  activeFile,
  openFiles,
  fileContent,
  isFileLoading,
  leftWidth,
  rightWidth,
  isResizingLeft,
  isResizingRight,
  onToggleRunner,
  onLaunchTarget,
  onLaunchIde,
  onBranchChange,
  onSelectFile,
  onCloseFile,
  onExpandDirectory,
  onClearConflictSelection,
  startResizeLeft,
  startResizeRight,
}: WorkspaceViewProps) {
  const serverPort =
    runnerStatus?.port && runnerStatus.port > 0
      ? runnerStatus.port
      : activeProfile?.port && activeProfile.port > 0
        ? activeProfile.port
        : 3000;
  const serverUrl = `http://localhost:${serverPort}`;

  return (
    <div className="animate-fade-slide" style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 16px",
        borderBottom: "1px solid var(--color-border-default)",
        backgroundColor: "var(--color-bg-subtle)",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Tooltip content={runnerStatus?.status === "running" || runnerStatus?.status === "starting" ? "Terminate active development server" : "Launch local development server"} position="bottom">
            <button
              id="tour-runner"
              onClick={onToggleRunner}
              disabled={isRunnerLoading}
              className={`btn ${runnerStatus?.status === "running" || runnerStatus?.status === "starting" ? "btn-danger" : "btn-primary"}`}
              style={{ minWidth: "120px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
            >
              {isRunnerLoading ? (
                <Loader size="xs" label="Starting runner" />
              ) : runnerStatus?.status === "running" || runnerStatus?.status === "starting" ? (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <rect x="7" y="7" width="10" height="10" rx="1.5" />
                  </svg>
                  Stop Server
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  Run Server
                </>
              )}
            </button>
          </Tooltip>

          <div style={{ fontSize: "12px", color: "var(--color-fg-muted)", display: "flex", alignItems: "center", gap: "8px" }}>
            {runnerStatus?.status === "running" && (
              <span style={{ color: "var(--color-success-fg)", fontWeight: 600 }}>
                Active (PID: {runnerStatus?.pid}) · {serverUrl}
              </span>
            )}
            {runnerStatus?.status === "starting" && <span style={{ color: "var(--color-attention-fg)" }}>Starting...</span>}
            {runnerStatus?.status === "stopped" && <span>Dev Server Stopped</span>}
            {runnerStatus?.status === "error" && <span style={{ color: "var(--color-danger-fg)" }}>Error: {runnerStatus?.error}</span>}
            {activeProfile?.runCommand && (
              <span style={{ fontSize: "11px", color: "var(--color-fg-subtle)", fontFamily: "var(--font-mono)" }}>
                {activeProfile.runCommand}
              </span>
            )}

            {runnerStatus?.status === "running" && (
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginLeft: "8px" }}>
                {launchOptions.includes("browser") && (
                  <Tooltip content="Open web application in your default browser" position="bottom">
                    <button
                      type="button"
                      onClick={() => onLaunchTarget("browser")}
                      className="btn btn-sm"
                      style={{
                        backgroundColor: "rgba(56, 139, 253, 0.15)",
                        borderColor: "rgba(56, 139, 253, 0.4)",
                        color: "var(--color-accent-fg)",
                        fontWeight: 650,
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "2px 8px",
                        fontSize: "11px",
                        height: "26px"
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: "11px" }}>open_in_new</span>
                      Launch Browser
                    </button>
                  </Tooltip>
                )}
                {launchOptions.includes("electron") && (
                  <Tooltip content="Open application window using Electron frame" position="bottom">
                    <button
                      type="button"
                      onClick={() => onLaunchTarget("electron")}
                      className="btn btn-sm"
                      style={{
                        backgroundColor: "rgba(63, 185, 80, 0.15)",
                        borderColor: "rgba(63, 185, 80, 0.4)",
                        color: "var(--color-success-fg)",
                        fontWeight: 650,
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "2px 8px",
                        fontSize: "11px",
                        height: "26px"
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: "11px" }}>devices</span>
                      Launch Electron App
                    </button>
                  </Tooltip>
                )}
                {launchOptions.includes("xcode") && (
                  <Tooltip content="Open Xcode simulator framework" position="bottom">
                    <button
                      type="button"
                      onClick={() => onLaunchTarget("xcode")}
                      className="btn btn-sm"
                      style={{
                        backgroundColor: "rgba(210, 153, 34, 0.15)",
                        borderColor: "rgba(210, 153, 34, 0.4)",
                        color: "var(--color-attention-fg)",
                        fontWeight: 650,
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "2px 8px",
                        fontSize: "11px",
                        height: "26px"
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: "11px" }}>terminal</span>
                      Open Xcode
                    </button>
                  </Tooltip>
                )}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "12px", color: "var(--color-fg-muted)" }}>Active Branch:</span>
          <Tooltip content="Select active repository branch to sync" position="bottom">
            <select
              id="tour-branch"
              className="form-control"
              style={{ width: "150px", padding: "3px 8px", fontSize: "13px" }}
              value={currentBranch}
              onChange={onBranchChange}
              disabled={isChangingBranch}
            >
              {branches.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </Tooltip>

          <div style={{ position: "relative" }}>
            <Tooltip content="Open codebase in an IDE" position="bottom">
              <button
                id="tour-open-ide"
                className="btn btn-sm"
                onClick={() => setIsIdeDropdownOpen(!isIdeDropdownOpen)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  height: "28px",
                  padding: "2px 10px",
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>code</span>
                Open in
              </button>
            </Tooltip>

            {isIdeDropdownOpen && (
              <div style={{
                position: "absolute",
                right: 0,
                top: "32px",
                backgroundColor: "var(--color-bg-overlay)",
                border: "1px solid var(--color-border-default)",
                borderRadius: "8px",
                boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
                zIndex: 100,
                width: "180px",
                display: "flex",
                flexDirection: "column",
                padding: "6px",
              }}>
                {[
                  { id: "vscode", label: "VS Code", icon: "/icons/ide/vscode.svg" },
                  { id: "zed", label: "Zed Editor", icon: "/icons/ide/zed.svg" },
                  { id: "intellij", label: "IntelliJ IDEA", icon: "/icons/ide/intellij.svg" },
                  { id: "webstorm", label: "WebStorm", icon: "/icons/ide/webstorm.svg" },
                  { id: "xcode", label: "Xcode", icon: "/icons/ide/xcode.svg" },
                  { id: "antigravity", label: "Antigravity", icon: "/icons/ide/antigravity.svg" },
                  { id: "codex", label: "Codex", icon: "/icons/ide/codex.svg" },
                ].map((ide) => (
                  <button
                    key={ide.id}
                    type="button"
                    onClick={() => onLaunchIde(ide.id, ide.label)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "8px 10px",
                      backgroundColor: "transparent",
                      border: "none",
                      color: "var(--color-fg-default)",
                      fontSize: "12px",
                      textAlign: "left",
                      cursor: "pointer",
                      borderRadius: "4px",
                      width: "100%",
                    }}
                    className="hover-bg-active"
                  >
                    <img
                      src={ide.icon}
                      alt=""
                      width={14}
                      height={14}
                      style={{ flexShrink: 0, objectFit: "contain" }}
                    />
                    <span style={{ flex: 1 }}>{ide.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <div
          id="tour-file-tree"
          style={{
            width: `${leftWidth}px`,
            backgroundColor: "var(--color-bg-subtle)",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            flexShrink: 0,
            height: "100%",
            minHeight: 0,
          }}>
          <div style={{ padding: "12px 16px 4px 16px", fontSize: "11px", fontWeight: "600", textTransform: "uppercase", color: "var(--color-fg-muted)" }}>
            Workspace Files
          </div>
          <FileTree
            tree={fileTree}
            selectedFile={activeFile}
            onSelectFile={(f) => {
              onClearConflictSelection();
              onSelectFile(f);
            }}
            onExpandDirectory={onExpandDirectory}
          />
        </div>

        <div
          onMouseDown={startResizeLeft}
          style={{
            width: "4px",
            cursor: "col-resize",
            backgroundColor: isResizingLeft ? "var(--color-accent-fg)" : "transparent",
            borderLeft: "1px solid var(--color-border-default)",
            borderRight: "1px solid var(--color-border-default)",
            transition: "background-color 0.15s",
            zIndex: 10,
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            if (!isResizingLeft) e.currentTarget.style.backgroundColor = "var(--color-border-default)";
          }}
          onMouseLeave={(e) => {
            if (!isResizingLeft) e.currentTarget.style.backgroundColor = "transparent";
          }}
        />

        <div id="tour-code-editor" style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
          {openFiles.length > 0 && (
            <div style={{
              display: "flex",
              backgroundColor: "var(--color-bg-subtle)",
              borderBottom: "1px solid var(--color-border-default)",
              overflowX: "auto",
              flexShrink: 0,
            }}>
              {openFiles.map((file) => {
                const isActive = file === activeFile;
                const fileName = file.split("/").pop() || file;
                return (
                  <div
                    key={file}
                    onClick={() => onSelectFile(file)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "8px 16px",
                      fontSize: "12px",
                      fontWeight: isActive ? 600 : 400,
                      color: isActive ? "var(--color-fg-default)" : "var(--color-fg-muted)",
                      backgroundColor: isActive ? "var(--color-bg-default)" : "transparent",
                      borderRight: "1px solid var(--color-border-default)",
                      cursor: "pointer",
                      userSelect: "none",
                      position: "relative",
                      transition: "all 0.15s cubic-bezier(0.16, 1, 0.3, 1)",
                    }}
                  >
                    <span>{fileName}</span>
                    <button
                      onClick={(e) => onCloseFile(file, e)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--color-fg-muted)",
                        cursor: "pointer",
                        fontSize: "11px",
                        padding: "2px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: "4px",
                        transition: "all 0.1s",
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--color-bg-active)"}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ flex: 1, overflow: "hidden" }}>
            <CodeViewer
              filePath={activeFile || ""}
              content={fileContent}
              isLoading={isFileLoading}
            />
          </div>
        </div>

        <div
          onMouseDown={startResizeRight}
          style={{
            width: "4px",
            cursor: "col-resize",
            backgroundColor: isResizingRight ? "var(--color-accent-fg)" : "transparent",
            borderLeft: "1px solid var(--color-border-default)",
            borderRight: "1px solid var(--color-border-default)",
            transition: "background-color 0.15s",
            zIndex: 10,
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            if (!isResizingRight) e.currentTarget.style.backgroundColor = "var(--color-border-default)";
          }}
          onMouseLeave={(e) => {
            if (!isResizingRight) e.currentTarget.style.backgroundColor = "transparent";
          }}
        />

        <div
          id="tour-diff-panel"
          style={{
            width: `${rightWidth}px`,
            overflow: "hidden",
            flexShrink: 0,
            height: "100%",
            minHeight: 0,
          }}>
          <DiffViewer selectedFile={activeFile} />
        </div>
      </div>
    </div>
  );
}
