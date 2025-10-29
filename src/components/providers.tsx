'use client';

import dynamic from 'next/dynamic';
import React, { useEffect } from 'react';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { app } from '@/lib/firebase/clientApp';

const ClientProviders = dynamic(() => import('./client-providers').then(mod => mod.ClientProviders), {
  ssr: false,
  loading: () => <div>Carregando...</div>, 
});

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const recaptchaSiteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

      // In non-production environments, set the debug token.
      if (process.env.NODE_ENV !== 'production') {
        (window as Window & { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = "a5864223-9b38-489e-817b-c14ca8009e41";
      }

      // The App Check SDK requires a provider instance to be created.
      // Previous attempts failed in development because the reCAPTCHA key was undefined, 
      // causing the ReCaptchaV3Provider constructor to fail and the provider object to be undefined.
      // By providing a dummy key in development, we ensure the constructor succeeds.
      // The SDK will then see the debug token on the window object and correctly ignore 
      // the reCAPTCHA provider in favor of the debug flow.
      initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(recaptchaSiteKey || 'dummy-key-for-dev'),
        isTokenAutoRefreshEnabled: true,
      });

      console.log("Firebase App Check initialized successfully.");

    } catch (e) {
      console.error("A critical error occurred during Firebase App Check initialization:", e);
    }
  }, []);

  return <ClientProviders>{children}</ClientProviders>;
}