"use client";

import { useEffect } from 'react';

/**
 * A client-side hook that detects "chunk loading failed" errors, which typically
 * occur after a new deployment. When such an error is detected, it forces a hard
 * reload of the page to fetch the latest application assets.
 */
export const useChunkErrorHandler = () => {
  useEffect(() => {
    // This is a global error handler. We only want to run it on the client.
    if (typeof window === 'undefined') {
      return;
    }

    const errorHandler = (event: PromiseRejectionEvent) => {
      if (!event.reason) {
        return;
      }
      
      const error = event.reason as Error | string;
      const errorMessage = typeof error === 'string' ? error : error.message;

      // Check for the specific chunk loading error messages
      const isChunkLoadError = errorMessage && (
          errorMessage.includes('Failed to fetch dynamically imported module') ||
          /Loading chunk .* failed/i.test(errorMessage) ||
          /Cannot find module '\.\/.*\.js'/i.test(errorMessage)
      );

      if (isChunkLoadError) {
        console.warn('Chunk load error detected. Forcing a hard reload.');
        window.location.reload();
      }
    };

    window.addEventListener('unhandledrejection', errorHandler);

    // Cleanup the event listener when the component unmounts
    return () => {
      window.removeEventListener('unhandledrejection', errorHandler);
    };
  }, []);
};
