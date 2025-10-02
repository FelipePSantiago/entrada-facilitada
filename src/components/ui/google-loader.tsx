"use client";

import { cn } from "@/lib/utils";

export function GoogleLoader({ className }: { className?: string }) {
  return (
    <div className={cn("google-loader", className)}>
      <svg viewBox="0 0 76 76" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path className="blue-dot" d="M38 0C17.0132 0 0 17.0132 0 38C0 58.9868 17.0132 76 38 76" />
        <path className="red-dot" d="M76 38C76 17.0132 58.9868 0 38 0" />
        <path className="yellow-dot" d="M38 76C58.9868 76 76 58.9868 76 38" />
        <path className="green-dot" d="M0 38C0 17.0132 17.0132 0 38 0" />
      </svg>
    </div>
  );
}
