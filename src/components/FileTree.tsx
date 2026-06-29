"use client";

import { useState } from "react";

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

export default function FileTree({ tree, selectedFile, onSelectFile }: FileTreeProps) {
  return (
    <div style={{ padding: "8px", overflowY: "auto", height: "100%", fontSize: "13px" }}>
      {tree.map((node) => (
        <TreeNode
          key={node.relativePath}
          node={node}
          selectedFile={selectedFile}
          onSelectFile={onSelectFile}
          level={0}
        />
      ))}
    </div>
  );
}

interface TreeNodeProps {
  node: FileNode;
  selectedFile: string | null;
  onSelectFile: (relativePath: string) => void;
  level: number;
}

function TreeNode({ node, selectedFile, onSelectFile, level }: TreeNodeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isSelected = selectedFile === node.relativePath;

  const handleToggle = () => {
    if (node.isDirectory) {
      setIsOpen(!isOpen);
    } else {
      onSelectFile(node.relativePath);
    }
  };

  return (
    <div>
      <div
        onClick={handleToggle}
        style={{
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
          transition: "background-color 0.1s",
          userSelect: "none",
        }}
        onMouseEnter={(e) => {
          if (!isSelected) e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.05)";
        }}
        onMouseLeave={(e) => {
          if (!isSelected) e.currentTarget.style.backgroundColor = "transparent";
        }}
      >
        {node.isDirectory ? (
          <span style={{ marginRight: "6px", display: "flex", alignItems: "center", width: "16px" }}>
            {isOpen ? (
              // Down chevron
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-fg-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            ) : (
              // Right chevron
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-fg-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            )}
          </span>
        ) : (
          <span style={{ marginRight: "6px", display: "flex", alignItems: "center", width: "16px" }}>
            {/* File Icon */}
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

      {node.isDirectory && isOpen && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.relativePath}
              node={child}
              selectedFile={selectedFile}
              onSelectFile={onSelectFile}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
