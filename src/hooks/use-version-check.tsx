
"use client";

import { useEffect, useState } from 'react';
import { useToast } from './use-toast';

const CHECK_INTERVAL = 1000 * 60 * 5; // 5 minutes

export const useVersionCheck = () => {
  const { toast } = useToast();
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);

  useEffect(() => {
    const versionMeta = document.querySelector('meta[name="app-version"]');
    const version = versionMeta?.getAttribute('content');
    if (version) {
      setCurrentVersion(version);
    }
  }, []);

  useEffect(() => {
    if (!currentVersion) {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const response = await fetch('/version.json?d=' + new Date().getTime());
        const data = await response.json();
        const newVersion = data.version;

        if (newVersion && newVersion !== currentVersion) {
          // 1. Clear the interval as we've found a new version.
          clearInterval(interval);

          // 2. Notify the user that the app has been updated and will reload.
          toast({
            title: "Aplicativo atualizado",
            description: "A nova versão foi instalada. O aplicativo será recarregado automaticamente.",
            duration: 5000, // Give the user 5 seconds to read the message
          });

          // 3. Reload the page after a short delay.
          setTimeout(() => {
            window.location.reload();
          }, 5000);
        }
      } catch (error) {
        console.error("Failed to check for new version:", error);
      }
    }, CHECK_INTERVAL);

    return () => clearInterval(interval);
  }, [currentVersion, toast]);
};
