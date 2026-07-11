"use client";

import { useState, useEffect } from "react";
import type { FileNode } from "@/components/FileTree";
import type { ToastType } from "@/hooks/useNotifications";
import { isImageFile } from "@/lib/fileTypes";

export function useWorkspaceFiles(
  showNotification: (message: string, type?: ToastType, duration?: number) => void,
  setCurrentBranch: (branch: string) => void,
  loadGitSyncStatus: () => Promise<void>,
  setSelectedConflictFile: (file: string | null) => void
) {
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [openFiles, setOpenFiles] = useState<string[]>([]);
  const [fileContent, setFileContent] = useState("");
  const [isFileLoading, setIsFileLoading] = useState(false);
  const [isChangingBranch, setIsChangingBranch] = useState(false);
  const [gitChangesRefreshKey, setGitChangesRefreshKey] = useState(0);

  const [leftWidth, setLeftWidth] = useState(240);
  const [rightWidth, setRightWidth] = useState(360);
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);

  const loadWorkspaceFiles = async () => {
    try {
      const res = await fetch("/api/workspace/files");
      const data = await res.json();
      if (!res.ok) {
        showNotification(data.error || "Failed to load workspace files", "error");
        return;
      }
      const children = ((data.children as FileNode[]) || []).map((node) => ({
        ...node,
        childrenLoaded: false,
      }));
      setFileTree(children);
    } catch {
      showNotification("Failed to load workspace files", "error");
    }
  };

  const loadDirectoryChildren = async (relativePath: string) => {
    try {
      const res = await fetch(
        `/api/workspace/files?path=${encodeURIComponent(relativePath)}`
      );
      const data = await res.json();
      if (!res.ok) {
        showNotification(data.error || "Failed to load folder", "error");
        return;
      }
      const children = ((data.children as FileNode[]) || []).map((node) => ({
        ...node,
        childrenLoaded: false,
      }));

      const attach = (nodes: FileNode[]): FileNode[] =>
        nodes.map((node) => {
          if (node.relativePath === relativePath) {
            return { ...node, children, childrenLoaded: true };
          }
          if (node.children?.length) {
            return { ...node, children: attach(node.children) };
          }
          return node;
        });

      setFileTree((prev) => attach(prev));
    } catch {
      showNotification("Failed to load folder", "error");
    }
  };

  const handleSelectFile = (file: string) => {
    setOpenFiles((prev) => {
      if (prev.includes(file)) return prev;
      return [...prev, file];
    });
    setActiveFile(file);
  };

  const handleCloseFile = (fileToClose: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenFiles((prev) => {
      const updated = prev.filter((f) => f !== fileToClose);
      if (activeFile === fileToClose) {
        setActiveFile(updated.length > 0 ? updated[updated.length - 1] : null);
      }
      return updated;
    });
  };

  const handleBranchChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const branch = e.target.value;
    setIsChangingBranch(true);
    try {
      const res = await fetch("/api/workspace/git", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "switch-branch", branch }),
      });
      const data = await res.json();
      if (data.success) {
        setCurrentBranch(data.current);
        await loadGitSyncStatus();
        loadWorkspaceFiles();
        setActiveFile(null);
        showNotification(`Switched to branch ${data.current}`, "success", 2500);
      } else {
        showNotification(data.error || "Failed to switch branch", "error");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      showNotification(`Error switching branch: ${msg}`, "error");
    } finally {
      setIsChangingBranch(false);
    }
  };

  const startResizeLeft = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingLeft(true);
  };

  const startResizeRight = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingRight(true);
  };

  useEffect(() => {
    if (!activeFile) {
      Promise.resolve().then(() => {
        setFileContent("");
      });
      return;
    }

    let active = true;
    const timer = setTimeout(() => {
      if (active) setIsFileLoading(true);
    }, 150);

    async function loadFileContent() {
      try {
        // Images are rendered via the raw binary endpoint in CodeViewer.
        if (isImageFile(activeFile!)) {
          if (active) setFileContent("");
          return;
        }

        const res = await fetch(`/api/workspace/file-content?file=${encodeURIComponent(activeFile!)}`);
        const data = await res.json();
        if (active) {
          if (data.error) {
            setFileContent(`Error loading file: ${data.error}`);
          } else if (data.isBinary) {
            setFileContent("");
          } else {
            setFileContent(data.content || "");
          }
        }
      } catch (e: unknown) {
        if (active) {
          const msg = e instanceof Error ? e.message : String(e);
          setFileContent(`Error loading file: ${msg}`);
        }
      } finally {
        clearTimeout(timer);
        if (active) {
          setIsFileLoading(false);
        }
      }
    }

    loadFileContent();

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [activeFile]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingLeft) {
        const newWidth = Math.max(150, Math.min(450, e.clientX));
        setLeftWidth(newWidth);
      }
      if (isResizingRight) {
        const newWidth = Math.max(200, Math.min(600, window.innerWidth - e.clientX));
        setRightWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizingLeft(false);
      setIsResizingRight(false);
    };

    if (isResizingLeft || isResizingRight) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizingLeft, isResizingRight]);

  return {
    fileTree,
    activeFile,
    openFiles,
    fileContent,
    isFileLoading,
    isChangingBranch,
    gitChangesRefreshKey,
    setGitChangesRefreshKey,
    leftWidth,
    rightWidth,
    isResizingLeft,
    isResizingRight,
    loadWorkspaceFiles,
    loadDirectoryChildren,
    handleSelectFile,
    handleCloseFile,
    handleBranchChange,
    startResizeLeft,
    startResizeRight,
  };
}
