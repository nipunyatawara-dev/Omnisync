"use client";

import { useState, useEffect } from "react";
import React from "react";

interface CodeViewerProps {
  filePath: string;
  content: string;
  isLoading: boolean;
}

// Custom Markdown Parser helpers
function parseMarkdown(md: string) {
  const lines = md.split("\n");
  const elements: React.ReactNode[] = [];
  
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code blocks
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        elements.push(
          <pre key={`code-${i}`} style={{
            backgroundColor: "var(--color-bg-subtle)",
            border: "1px solid var(--color-border-default)",
            borderRadius: "6px",
            padding: "12px",
            overflowX: "auto",
            fontFamily: "var(--font-mono)",
            fontSize: "12px",
            margin: "12px 0",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}>
            <code>{codeBlockContent.join("\n")}</code>
          </pre>
        );
        codeBlockContent = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    // Headings
    if (line.startsWith("# ")) {
      elements.push(<h1 key={i} style={{ fontSize: "22px", fontWeight: "700", borderBottom: "1px solid var(--color-border-default)", paddingBottom: "6px", margin: "20px 0 10px 0", color: "var(--color-fg-default)" }}>{parseInline(line.slice(2))}</h1>);
      continue;
    }
    if (line.startsWith("## ")) {
      elements.push(<h2 key={i} style={{ fontSize: "18px", fontWeight: "600", borderBottom: "1px solid var(--color-border-default)", paddingBottom: "4px", margin: "18px 0 10px 0", color: "var(--color-fg-default)" }}>{parseInline(line.slice(3))}</h2>);
      continue;
    }
    if (line.startsWith("### ")) {
      elements.push(<h3 key={i} style={{ fontSize: "15px", fontWeight: "600", margin: "14px 0 8px 0", color: "var(--color-fg-default)" }}>{parseInline(line.slice(4))}</h3>);
      continue;
    }

    // Unordered Lists
    if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(<li key={i} style={{ marginLeft: "20px", marginBottom: "4px", listStyleType: "disc" }}>{parseInline(line.slice(2))}</li>);
      continue;
    }

    // Horizontal Rule
    if (line === "---" || line === "***") {
      elements.push(<hr key={i} style={{ border: "none", borderBottom: "1px solid var(--color-border-default)", margin: "16px 0" }} />);
      continue;
    }

    // Empty line
    if (!line.trim()) {
      elements.push(<div key={i} style={{ height: "8px" }}></div>);
      continue;
    }

    // Regular paragraph
    elements.push(<p key={i} style={{ margin: "8px 0", lineHeight: "1.6", color: "var(--color-fg-default)" }}>{parseInline(line)}</p>);
  }

  return elements;
}

function parseInline(text: string): React.ReactNode[] {
  const tokenRegex = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
  const splitText = text.split(tokenRegex);

  return splitText.map((part, idx) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={idx} style={{
          backgroundColor: "var(--color-bg-subtle)",
          padding: "2px 4px",
          borderRadius: "4px",
          fontFamily: "var(--font-mono)",
          fontSize: "11px",
          border: "1px solid var(--color-border-default)",
          color: "var(--color-accent-fg)",
        }}>
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={part + idx} style={{ fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("[") && part.includes("](")) {
      const match = part.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (match) {
        return (
          <a key={part + idx} href={match[2]} target="_blank" rel="noreferrer" style={{ color: "var(--color-accent-fg)", textDecoration: "none" }}>
            {match[1]}
          </a>
        );
      }
    }
    return part;
  });
}
export default function CodeViewer({ filePath, content, isLoading }: CodeViewerProps) {
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<"raw" | "preview">("preview");

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setViewMode("preview");
    }, 0);
    return () => clearTimeout(timer);
  }, [filePath]);

  if (!filePath) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        color: "var(--color-fg-muted)",
        fontSize: "14px",
      }}>
        Select a file from the explorer tree to view its content.
      </div>
    );
  }

  const lines = content.split("\n");
  const isMarkdown = filePath.endsWith(".md") || filePath.endsWith(".markdown");

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", height: "100%", border: "none", borderRadius: 0 }}>
      {/* File Header */}
      <div className="card-header" style={{
        backgroundColor: "var(--color-bg-subtle)",
        borderBottom: "1px solid var(--color-border-default)",
        padding: "8px 16px",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", fontFamily: "var(--font-mono)" }}>
          <span style={{ fontWeight: 600, color: "var(--color-fg-default)" }}>{filePath}</span>
          {isLoading && (
            <span className="spinner animate-pulse-glow" style={{ width: "10px", height: "10px", border: "1px solid var(--color-border-default)", borderTop: "1px solid var(--color-accent-fg)", margin: "0 4px" }}></span>
          )}
          <span style={{ color: "var(--color-fg-muted)" }}>|</span>
          <span style={{ color: "var(--color-fg-muted)" }}>{lines.length} lines</span>
          <span style={{ color: "var(--color-fg-muted)" }}>|</span>
          <span style={{ color: "var(--color-fg-muted)" }}>{(new Blob([content]).size / 1024).toFixed(2)} KB</span>
        </div>
        
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {isMarkdown && (
            <div style={{
              display: "flex",
              backgroundColor: "var(--color-bg-default)",
              border: "1px solid var(--color-border-default)",
              borderRadius: "6px",
              padding: "2px",
            }}>
              <button
                className="btn btn-sm"
                onClick={() => setViewMode("preview")}
                style={{
                  border: "none",
                  backgroundColor: viewMode === "preview" ? "var(--color-bg-active)" : "transparent",
                  color: viewMode === "preview" ? "var(--color-fg-default)" : "var(--color-fg-muted)",
                  padding: "2px 8px",
                  fontSize: "11px",
                }}
              >
                Preview
              </button>
              <button
                className="btn btn-sm"
                onClick={() => setViewMode("raw")}
                style={{
                  border: "none",
                  backgroundColor: viewMode === "raw" ? "var(--color-bg-active)" : "transparent",
                  color: viewMode === "raw" ? "var(--color-fg-default)" : "var(--color-fg-muted)",
                  padding: "2px 8px",
                  fontSize: "11px",
                }}
              >
                Raw
              </button>
            </div>
          )}

          <button className="btn btn-sm" onClick={handleCopy}>
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>

      {/* Code Text Area or Markdown Preview */}
      {isMarkdown && viewMode === "preview" ? (
        <div style={{
          flex: 1,
          overflow: "auto",
          padding: "24px 32px",
          backgroundColor: "var(--color-bg-default)",
          color: "var(--color-fg-default)",
          opacity: isLoading ? 0.6 : 1,
          transition: "opacity 0.15s ease-in-out",
        }}>
          <div className="markdown-body" style={{ fontSize: "14px", lineHeight: "1.6" }}>
            {parseMarkdown(content)}
          </div>
        </div>
      ) : (
        <div style={{
          flex: 1,
          overflow: "auto",
          fontFamily: "var(--font-mono)",
          fontSize: "12px",
          lineHeight: "20px",
          backgroundColor: "var(--color-bg-default)",
          display: "flex",
          opacity: isLoading ? 0.6 : 1,
          transition: "opacity 0.15s ease-in-out",
        }}>
          {/* Line Numbers Gutter */}
          <div style={{
            padding: "16px 8px 16px 16px",
            textAlign: "right",
            userSelect: "none",
            color: "var(--color-fg-subtle)",
            borderRight: "1px solid var(--color-border-default)",
            backgroundColor: "var(--color-bg-subtle)",
            minWidth: "48px",
          }}>
            {lines.map((_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>

          {/* Code Content */}
          <pre style={{
            margin: 0,
            padding: "16px",
            overflow: "visible",
            color: "var(--color-fg-default)",
          }}>
            <code>
              {lines.map((line, idx) => (
                <div key={idx} style={{ height: "20px", whiteSpace: "pre" }}>
                  {line || " "}
                </div>
              ))}
            </code>
          </pre>
        </div>
      )}
    </div>
  );
}
