"use client";

import { useChunkErrorHandler } from "@/hooks/use-chunk-error-handler";

/**
 * A client component wrapper for the `useChunkErrorHandler` hook.
 * This component ensures that the hook is only executed on the client-side,
 * preventing server-side rendering errors.
 */
export function ChunkErrorHandler() {
  useChunkErrorHandler();
  return null; // This component does not render anything
}
