// src/components/providers.tsx
"use client";

import { ClientProviders } from "./client-providers";

export function Providers({ children }: { children: React.ReactNode }) {
  return <ClientProviders>{children}</ClientProviders>;
}