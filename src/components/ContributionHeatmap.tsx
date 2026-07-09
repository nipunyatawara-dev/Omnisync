"use client";

import React, { useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface HeatmapCell {
  key: string;
  colIdx: number;
  rowIdx: number;
  dateString: string;
  date: Date;
  count: number;
  color: string;
  isSelected: boolean;
  isPlaceholder?: boolean;
}

interface ContributionHeatmapProps {
  cells: HeatmapCell[];
  numCols: number;
  monthLabels: { text: string; colIdx: number }[];
  onCellClick: (dateString: string, date: Date) => void;
}

type HoverState = {
  content: string;
  top: number;
  left: number;
};

export default function ContributionHeatmap({
  cells,
  numCols,
  monthLabels,
  onCellClick,
}: ContributionHeatmapProps) {
  const [hover, setHover] = useState<HoverState | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  const updateHoverPosition = useCallback((anchor: DOMRect, content: string) => {
    const tooltip = tooltipRef.current;
    const gap = 8;
    const padding = 8;
    const width = tooltip?.offsetWidth ?? 0;
    const height = tooltip?.offsetHeight ?? 0;

    let top = anchor.top - height - gap;
    let left = anchor.left + anchor.width / 2 - width / 2;

    if (top < padding) {
      top = anchor.bottom + gap;
    }
    if (left < padding) {
      left = padding;
    }
    if (width > 0 && left + width > window.innerWidth - padding) {
      left = window.innerWidth - width - padding;
    }

    setHover({ content, top, left });
  }, []);

  useLayoutEffect(() => {
    if (!hover) return;
    const tooltip = tooltipRef.current;
    if (!tooltip) return;
    const { top, left, content } = hover;
    const width = tooltip.offsetWidth;
    const padding = 8;
    let nextLeft = left;
    if (left + width > window.innerWidth - padding) {
      nextLeft = Math.max(padding, window.innerWidth - width - padding);
    }
    if (nextLeft !== left) {
      setHover({ content, top, left: nextLeft });
    }
  }, [hover]);

  const portal =
    hover && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={tooltipRef}
            className="custom-tooltip-content custom-tooltip-portal position-top is-visible"
            style={{ top: hover.top, left: hover.left }}
            role="tooltip"
          >
            {hover.content}
          </div>,
          document.body
        )
      : null;

  return (
    <div style={{ overflowX: "auto", paddingBottom: "4px", width: "100%" }} onMouseLeave={() => setHover(null)}>
      <div
        style={{
          minWidth: "max-content",
          display: "grid",
          gridTemplateColumns: `24px repeat(${numCols}, 10px)`,
          gridTemplateRows: "15px repeat(7, 10px)",
          gap: "2px",
          fontSize: "9px",
          color: "var(--color-fg-muted)",
        }}
      >
        {monthLabels.map((lbl, idx) => (
          <span
            key={`month-${idx}`}
            style={{
              gridColumnStart: lbl.colIdx + 2,
              gridColumnEnd: "span 4",
              gridRowStart: 1,
              whiteSpace: "nowrap",
              alignSelf: "end",
              paddingBottom: "2px",
            }}
          >
            {lbl.text}
          </span>
        ))}

        <div style={{ gridColumnStart: 1, gridRowStart: 3, textAlign: "right", lineHeight: "10px", paddingRight: "6px" }}>
          Mon
        </div>
        <div style={{ gridColumnStart: 1, gridRowStart: 5, textAlign: "right", lineHeight: "10px", paddingRight: "6px" }}>
          Wed
        </div>
        <div style={{ gridColumnStart: 1, gridRowStart: 7, textAlign: "right", lineHeight: "10px", paddingRight: "6px" }}>
          Fri
        </div>

        {cells.map((cell) => {
          if (cell.isPlaceholder) {
            return (
              <div
                key={cell.key}
                style={{
                  gridColumnStart: cell.colIdx + 2,
                  gridRowStart: cell.rowIdx + 2,
                  width: "10px",
                  height: "10px",
                  backgroundColor: "transparent",
                  pointerEvents: "none",
                }}
              />
            );
          }

          const content = `${cell.count} commit${cell.count === 1 ? "" : "s"} on ${cell.date.toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}`;

          return (
            <div
              key={cell.key}
              onClick={() => onCellClick(cell.dateString, cell.date)}
              onMouseEnter={(event) => updateHoverPosition(event.currentTarget.getBoundingClientRect(), content)}
              onMouseLeave={() => setHover(null)}
              style={{
                gridColumnStart: cell.colIdx + 2,
                gridRowStart: cell.rowIdx + 2,
                width: "10px",
                height: "10px",
                borderRadius: "2px",
                backgroundColor: cell.color,
                cursor: "pointer",
                transition: "transform 0.1s ease, box-shadow 0.1s ease",
                boxShadow: cell.isSelected ? "0 0 0 1.5px var(--color-accent-fg)" : "none",
                zIndex: cell.isSelected ? 2 : 1,
              }}
              className="contribution-square"
            />
          );
        })}
      </div>
      {portal}
    </div>
  );
}
