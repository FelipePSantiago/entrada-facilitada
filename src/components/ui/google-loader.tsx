"use client";

import { cn } from "@/lib/utils";

export function GoogleLoader({ className }: { className?: string }) {
  return (
    <div className={cn("google-loader", className)}>
      <svg width="60" height="60" viewBox="0 0 60 60" style={{
        animation: 'rotate 1s linear infinite',
        transformOrigin: '50% 50%',
      }}>
        <circle
          cx="30"
          cy="30"
          r="25"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="4"
          strokeDasharray="40 12.36"
          strokeLinecap="round"
        />
      </svg>
      <style>
        {`
          @keyframes rotate {
            from {
              transform: rotate(0deg);
            }
            to {
              transform: rotate(360deg);
            }
          }
        `}
      </style>
    </div>
  );
}
