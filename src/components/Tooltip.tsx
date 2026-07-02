"use client";

import React from "react";

interface TooltipProps {
  content: string;
  position?: "top" | "bottom" | "left" | "right";
  children: React.ReactNode;
}

export default function Tooltip({ content, position = "top", children }: TooltipProps) {
  if (!content) return <>{children}</>;

  return (
    <div className="custom-tooltip">
      {children}
      <div className={`custom-tooltip-content position-${position}`}>
        {content}
      </div>
    </div>
  );
}
