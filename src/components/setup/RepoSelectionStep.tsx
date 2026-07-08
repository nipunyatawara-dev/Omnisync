"use client";

import { RefObject } from "react";
import RepoVisibilityIcon from "@/components/RepoVisibilityIcon";
import Loader from "@/components/Loader";
import type { DiagnosticScanResult, UIRepository } from "@/components/setup/types";

interface RepoSelectionStepProps {
  setupMode: "clone" | "local";
  setSetupMode: (mode: "clone" | "local") => void;
  githubConnected: boolean;
  isFetchingRepos: boolean;
  reposList: UIRepository[];
  selectedRepoId: string;
  isRepoDropdownOpen: boolean;
  setIsRepoDropdownOpen: (open: boolean) => void;
  clonePath: string;
  setClonePath: (path: string) => void;
  pathPlaceholder: string;
  cloneStatus: "idle" | "cloning" | "success" | "error";
  cloneError: string;
  setCloneError: (error: string) => void;
  setCloneStatus: (status: "idle" | "cloning" | "success" | "error") => void;
  cloneLogs: string[];
  terminalEndRef: RefObject<HTMLDivElement | null>;
  manualPath: string;
  setManualPath: (path: string) => void;
  manualStatus: "idle" | "scanning" | "success" | "error";
  manualError: string;
  setManualError: (error: string) => void;
  setManualStatus: (status: "idle" | "scanning" | "success" | "error") => void;
  manualScanResult: DiagnosticScanResult | null;
  onRepoChange: (repoId: string) => void;
  onChooseClonePath: () => void;
  onChooseManualPath: () => void;
  onRunCloneAndSetup: () => void;
  onRunManualScan: () => void;
  onLaunch: () => void;
  onBackToWorkspaces: () => void;
}

export default function RepoSelectionStep({
  setupMode,
  setSetupMode,
  githubConnected,
  isFetchingRepos,
  reposList,
  selectedRepoId,
  isRepoDropdownOpen,
  setIsRepoDropdownOpen,
  clonePath,
  setClonePath,
  pathPlaceholder,
  cloneStatus,
  cloneError,
  setCloneError,
  setCloneStatus,
  cloneLogs,
  terminalEndRef,
  manualPath,
  setManualPath,
  manualStatus,
  manualError,
  setManualError,
  setManualStatus,
  manualScanResult,
  onRepoChange,
  onChooseClonePath,
  onChooseManualPath,
  onRunCloneAndSetup,
  onRunManualScan,
  onLaunch,
  onBackToWorkspaces,
}: RepoSelectionStepProps) {
  return (
    <div>
      <div className="mb-lg">
        <h2 className="font-headline-lg text-headline-lg text-on-surface mb-xs">
          {setupMode === "clone" ? "Clone GitHub Repository" : "Link Local Repository"}
        </h2>
        <p className="font-body-lg text-body-lg text-on-surface-variant">
          {setupMode === "clone"
            ? "Clone a repository from your GitHub account and prepare a local workspace."
            : "Point OmniSync directly to an already created repository on this machine."}
        </p>
      </div>

      {githubConnected && (
        <div className="flex bg-surface-container-high p-xs rounded-xl mb-lg w-full max-w-[340px] border border-outline-variant/30 gap-xs">
          <button
            type="button"
            onClick={() => {
              setSetupMode("clone");
              setManualError("");
              setCloneError("");
            }}
            className={`flex-1 flex justify-center items-center py-sm rounded-lg font-button-text font-semibold text-[13px] transition-all cursor-pointer border-0 ${
              setupMode === "clone"
                ? "bg-primary text-on-primary shadow-sm"
                : "bg-transparent text-on-surface-variant hover:text-on-surface"
            }`}
          >
            Clone from GitHub
          </button>
          <button
            type="button"
            onClick={() => {
              setSetupMode("local");
              setManualError("");
              setCloneError("");
            }}
            className={`flex-1 flex justify-center items-center py-sm rounded-lg font-button-text font-semibold text-[13px] transition-all cursor-pointer border-0 ${
              setupMode === "local"
                ? "bg-primary text-on-primary shadow-sm"
                : "bg-transparent text-on-surface-variant hover:text-on-surface"
            }`}
          >
            Link Local Folder
          </button>
        </div>
      )}

      {setupMode === "clone" && githubConnected && (
        <div>
          {isFetchingRepos ? (
            <div className="flex flex-col items-center justify-center py-xl gap-sm border border-outline-variant rounded-xl bg-surface-container/50">
              <Loader size="md" label="Fetching repositories" />
              <span className="text-[13px] text-on-surface-variant">Fetching your GitHub repositories...</span>
            </div>
          ) : reposList.length === 0 ? (
            <div className="py-xl text-center text-on-surface-variant text-[14px] border border-outline-variant rounded-xl bg-surface-container/50">
              No repositories found. Make sure your account has accessible repositories.
            </div>
          ) : (
            <div className="border border-outline-variant rounded-xl p-lg bg-surface-container">
              <h3 className="font-headline-sm text-on-surface mb-xs">Clone Remote Repository</h3>
              <p className="font-body-md text-[13px] text-on-surface-variant mb-lg">
                Select a repository and choose where to save the files on this computer.
              </p>

              <div className="mb-lg relative">
                <label className="block font-button-text text-button-text text-on-surface mb-sm">
                  Repository
                </label>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsRepoDropdownOpen(!isRepoDropdownOpen)}
                    disabled={cloneStatus === "cloning" || cloneStatus === "success"}
                    className="w-full input-surface rounded-md px-md py-sm text-on-surface font-body-md bg-background border border-outline-variant flex justify-between items-center cursor-pointer select-none text-left min-h-[38px] disabled:cursor-not-allowed"
                  >
                    {(() => {
                      const selectedRepo = reposList.find((r) => r.id.toString() === selectedRepoId);
                      if (!selectedRepo) return <span className="text-on-surface-variant">Select a repository</span>;
                      return (
                        <span className="flex items-center gap-xs truncate">
                          <RepoVisibilityIcon
                            isPrivate={selectedRepo.private}
                            className="text-on-surface-variant"
                          />
                          <span className="truncate">{selectedRepo.fullName}</span>
                        </span>
                      );
                    })()}
                    <span className="material-symbols-outlined text-on-surface-variant text-[18px] mr-xs shrink-0">
                      keyboard_arrow_down
                    </span>
                  </button>

                  {isRepoDropdownOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setIsRepoDropdownOpen(false)}
                      />
                      <div className="absolute left-0 right-0 mt-xs bg-surface-container border border-outline-variant rounded-lg shadow-xl max-h-[220px] overflow-y-auto z-20 p-xs flex flex-col gap-[2px]">
                        {reposList.map((repo) => {
                          const isSelected = repo.id.toString() === selectedRepoId;
                          return (
                            <button
                              key={repo.id}
                              type="button"
                              onClick={() => {
                                onRepoChange(repo.id.toString());
                                setIsRepoDropdownOpen(false);
                              }}
                              className={`w-full flex items-center justify-between px-md py-sm rounded-md font-body-md text-left transition-colors cursor-pointer border-0 ${
                                isSelected
                                  ? "bg-accent-bg text-accent-fg font-semibold"
                                  : "bg-transparent text-on-surface hover:bg-surface-container-high"
                              }`}
                            >
                              <span className="flex items-center gap-xs truncate">
                                <RepoVisibilityIcon
                                  isPrivate={repo.private}
                                  className={isSelected ? "text-accent-fg" : "text-on-surface-variant"}
                                />
                                <span className="truncate">{repo.fullName}</span>
                              </span>
                              {isSelected && (
                                <span className="material-symbols-outlined text-[16px] text-accent-fg shrink-0">
                                  check
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="mb-lg">
                <label className="block font-button-text text-button-text text-on-surface mb-sm" htmlFor="clone-path">
                  Local Target Folder Path
                </label>
                <div className="flex gap-sm items-center">
                  <input
                    id="clone-path"
                    type="text"
                    className="flex-grow input-surface rounded-md px-md py-sm text-on-surface font-body-md transition-shadow"
                    value={clonePath}
                    onChange={(e) => {
                      setClonePath(e.target.value);
                      setCloneError("");
                      setCloneStatus("idle");
                    }}
                    placeholder={pathPlaceholder}
                    required
                    disabled={cloneStatus === "cloning" || cloneStatus === "success"}
                  />
                  {typeof window !== "undefined" && window.electron && (
                    <button
                      type="button"
                      onClick={onChooseClonePath}
                      disabled={cloneStatus === "cloning" || cloneStatus === "success"}
                      className="btn-secondary rounded-lg py-sm px-md shrink-0 flex items-center font-semibold text-xs h-[38px] cursor-pointer"
                    >
                      Browse...
                    </button>
                  )}
                </div>
                <p className="font-body-md text-[11px] text-on-surface-variant mt-xs">
                  Choose an empty or new folder location. Parent directory will be created if needed.
                </p>
              </div>

              {(cloneStatus === "idle" || cloneStatus === "error") && (
                <button
                  type="button"
                  className="w-full btn-primary rounded-lg py-md px-md font-button-text text-button-text transition-colors cursor-pointer font-semibold"
                  onClick={onRunCloneAndSetup}
                >
                  Clone &amp; Setup Workspace
                </button>
              )}

              {cloneStatus === "cloning" && (
                <div className="flex flex-col gap-md mt-md">
                  <div className="flex items-center gap-sm p-sm bg-surface-container rounded-lg border border-outline-variant/60">
                    <Loader size="xs" label="Cloning repository" />
                    <span className="text-[13px] text-on-surface font-medium">
                      Cloning repository &amp; configuring diagnostics...
                    </span>
                  </div>

                  <div className="bg-[#090d13] border border-outline-variant rounded-lg p-md font-mono text-[11px] text-[#3fb950] h-[220px] overflow-y-auto flex flex-col gap-[3px] select-text scrollbar-thin">
                    {cloneLogs.map((log, idx) => (
                      <div key={idx} className="leading-relaxed whitespace-pre-wrap">{log}</div>
                    ))}
                    <div ref={terminalEndRef} />
                  </div>
                </div>
              )}

              {cloneStatus === "success" && manualScanResult && (
                <div className="flex flex-col gap-md mt-md animate-fade-in">
                  <div className="flash flash-success m-0 py-sm px-md text-[12px] rounded">
                    Workspace cloned and verified successfully. Click below to launch.
                  </div>

                  <table className="w-full border-collapse text-[12px] text-on-surface">
                    <tbody>
                      <tr className="border-b border-outline-variant">
                        <td className="py-sm text-on-surface-variant">Node.js Compatibility</td>
                        <td className="py-sm text-right">
                          {manualScanResult.isNodeCompatible ? (
                            <span className="badge badge-success">Compatible ({manualScanResult.nodeVersion})</span>
                          ) : (
                            <span className="badge badge-danger">Incompatible ({manualScanResult.nodeVersion})</span>
                          )}
                        </td>
                      </tr>
                      <tr className="border-b border-outline-variant">
                        <td className="py-sm text-on-surface-variant">Dependencies Checked</td>
                        <td className="py-sm text-right font-medium">
                          {manualScanResult.missingDependencies.length === 0
                            ? "All verified"
                            : `${manualScanResult.missingDependencies.length} missing`}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  <button
                    type="button"
                    className="w-full btn-primary rounded-lg py-md px-md font-button-text text-button-text transition-colors cursor-pointer font-semibold"
                    onClick={onLaunch}
                  >
                    Launch Workspace
                  </button>
                </div>
              )}

              {cloneError && (
                <div className="flash flash-danger mt-md text-[12px] rounded">
                  {cloneError}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {setupMode === "local" && (
        <div className="border border-outline-variant rounded-xl p-lg bg-surface-container">
          <h3 className="font-headline-sm text-on-surface mb-xs">Link Local Repository</h3>
          <p className="font-body-md text-[13px] text-on-surface-variant mb-lg">
            Provide the directory path of an existing repository already created on your device.
          </p>

          <div className="mb-lg">
            <label className="block font-button-text text-button-text text-on-surface mb-sm">
              Pre-existing Folder Path
            </label>
            <div className="flex gap-sm items-center">
              <input
                type="text"
                className="flex-grow input-surface rounded-md px-md py-sm text-on-surface font-body-md transition-shadow"
                value={manualPath}
                onChange={(e) => {
                  setManualPath(e.target.value);
                  setManualError("");
                  setManualStatus("idle");
                }}
                placeholder={pathPlaceholder}
                required
              />
              {typeof window !== "undefined" && window.electron && (
                <button
                  type="button"
                  onClick={onChooseManualPath}
                  className="btn-secondary rounded-lg py-sm px-md shrink-0 flex items-center font-semibold text-xs h-[38px] cursor-pointer"
                >
                  Browse...
                </button>
              )}
            </div>
            <p className="font-body-md text-[11px] text-on-surface-variant mt-xs">
              OmniSync will verify this path, scan its Node compatibility, and configure logs.
            </p>
          </div>

          {manualStatus === "idle" && (
            <button
              type="button"
              className="w-full btn-primary rounded-lg py-md px-md font-button-text text-button-text transition-colors cursor-pointer font-semibold"
              onClick={onRunManualScan}
            >
              Verify &amp; Scan Directory
            </button>
          )}

          {manualStatus === "scanning" && (
            <div className="flex items-center gap-sm p-md bg-surface rounded-lg border border-outline-variant">
              <Loader size="sm" label="Scanning directory" />
              <span className="text-[13px] text-on-surface-variant">
                Analyzing node compatibility levels and package.json configurations...
              </span>
            </div>
          )}

          {manualStatus === "success" && manualScanResult && (
            <div className="flex flex-col gap-md mt-md">
              <div className="flash flash-success m-0 py-sm px-md text-[12px] rounded">
                Workspace verified successfully. Click below to launch.
              </div>

              <table className="w-full border-collapse text-[12px] text-on-surface">
                <tbody>
                  <tr className="border-b border-outline-variant">
                    <td className="py-sm text-on-surface-variant">Node.js Compatibility</td>
                    <td className="py-sm text-right">
                      {manualScanResult.isNodeCompatible ? (
                        <span className="badge badge-success">Compatible ({manualScanResult.nodeVersion})</span>
                      ) : (
                        <span className="badge badge-danger">Incompatible ({manualScanResult.nodeVersion})</span>
                      )}
                    </td>
                  </tr>
                  <tr className="border-b border-outline-variant">
                    <td className="py-sm text-on-surface-variant">Dependencies Checked</td>
                    <td className="py-sm text-right font-medium">
                      {manualScanResult.missingDependencies.length === 0
                        ? "All verified"
                        : `${manualScanResult.missingDependencies.length} missing`}
                    </td>
                  </tr>
                </tbody>
              </table>

              <button
                type="button"
                className="w-full btn-primary rounded-lg py-md px-md font-button-text text-button-text transition-colors cursor-pointer font-semibold"
                onClick={onLaunch}
              >
                Launch Workspace
              </button>
            </div>
          )}

          {manualError && (
            <div className="flash flash-danger mt-md text-[12px] rounded">
              {manualError}
            </div>
          )}
        </div>
      )}

      <div className="flex justify-between items-center mt-xl">
        <button
          type="button"
          className="btn-secondary rounded-lg py-sm px-md font-button-text text-button-text transition-colors cursor-pointer"
          onClick={onBackToWorkspaces}
          disabled={manualStatus === "scanning" || cloneStatus === "cloning"}
        >
          Back to Workspaces
        </button>
      </div>
    </div>
  );
}
