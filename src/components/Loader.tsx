"use client";

import { DotmSquare3 } from "@/components/ui/dotm-square-3";

export type LoaderSize = "xs" | "sm" | "md" | "lg";

const SIZE_MAP: Record<LoaderSize, { size: number; dotSize: number }> = {
  xs: { size: 12, dotSize: 2 },
  sm: { size: 16, dotSize: 2.5 },
  md: { size: 28, dotSize: 4 },
  lg: { size: 40, dotSize: 5 },
};

interface LoaderProps {
  size?: LoaderSize;
  className?: string;
  label?: string;
}

export default function Loader({ size = "sm", className, label = "Loading" }: LoaderProps) {
  const dims = SIZE_MAP[size];

  return (
    <DotmSquare3
      {...dims}
      color="var(--color-dot-on)"
      ariaLabel={label}
      className={className}
      bloom
    />
  );
}
