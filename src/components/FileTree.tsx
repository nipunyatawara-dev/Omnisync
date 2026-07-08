"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

export interface FileNode {
  name: string;
  relativePath: string;
  absolutePath: string;
  isDirectory: boolean;
  children?: FileNode[];
}

interface FileTreeProps {
  tree: FileNode[];
  selectedFile: string | null;
  onSelectFile: (relativePath: string) => void;
}

interface FlatRow {
  node: FileNode;
  level: number;
}

function flattenVisible(tree: FileNode[], expanded: Set<string>, level = 0): FlatRow[] {
  const rows: FlatRow[] = [];
  for (const node of tree) {
    rows.push({ node, level });
    if (node.isDirectory && expanded.has(node.relativePath) && node.children?.length) {
      rows.push(...flattenVisible(node.children, expanded, level + 1));
    }
  }
  return rows;
}

const ROW_HEIGHT = 28;

export default function FileTree({ tree, selectedFile, onSelectFile }: FileTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const parentRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => flattenVisible(tree, expanded), [tree, expanded]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const toggleExpand = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const handleRowClick = useCallback(
    (node: FileNode) => {
      if (node.isDirectory) {
        toggleExpand(node.relativePath);
      } else {
        onSelectFile(node.relativePath);
      }
    },
    [onSelectFile, toggleExpand]
  );

  const handleRowKeyDown = useCallback(
    (e: React.KeyboardEvent, node: FileNode) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleRowClick(node);
      }
    },
    [handleRowClick]
  );

  return (
    <div
      ref={parentRef}
      role="tree"
      aria-label="Workspace files"
      style={{ padding: "8px", overflowY: "auto", height: "100%", fontSize: "13px" }}
    >
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative", width: "100%" }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const { node, level } = rows[virtualRow.index];
          const isSelected = selectedFile === node.relativePath;
          const isOpen = expanded.has(node.relativePath);

          return (
            <div
              key={node.relativePath}
              role="treeitem"
              aria-expanded={node.isDirectory ? isOpen : undefined}
              aria-selected={isSelected}
              tabIndex={0}
              onClick={() => handleRowClick(node)}
              onKeyDown={(e) => handleRowKeyDown(e, node)}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
                display: "flex",
                alignItems: "center",
                padding: "4px 8px",
                paddingLeft: `${level * 16 + 8}px`,
                borderRadius: "4px",
                cursor: "pointer",
                backgroundColor: isSelected ? "var(--color-bg-active)" : "transparent",
                color: isSelected ? "var(--color-accent-fg)" : "var(--color-fg-default)",
                fontWeight: isSelected ? "600" : "normal",
                fontSize: "13px",
                userSelect: "none",
                boxSizing: "border-box",
              }}
            >
              {node.isDirectory ? (
                <span style={{ marginRight: "6px", display: "flex", alignItems: "center", width: "16px" }}>
                  {isOpen ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-fg-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-fg-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  )}
                </span>
              ) : (
                <span style={{ marginRight: "6px", display: "flex", alignItems: "center", width: "16px" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-fg-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </span>
              )}
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {node.name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
