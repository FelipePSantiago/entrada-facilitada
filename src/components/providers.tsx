'use client';

import React, { useEffect, useState } from 'react';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { ClientProviders } from './client-providers'; // Importação estática

// Configuração do Firebase extraída diretamente das variáveis de ambiente
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// A inicialização do app do Firebase continua aqui
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

interface AppCheckContextType {
  isAppCheckAvailable: boolean;
  appCheckError: string | null;
}

export const AppCheckContext = React.createContext<AppCheckContextType>({
  isAppCheckAvailable: false,
  appCheckError: null,
});

export function useAppCheck() {
  const context = React.useContext(AppCheckContext);
  if (!context) {
    throw new Error('useAppCheck must be used within Providers');
  }
  return context;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [appCheckState, setAppCheckState] = useState<AppCheckContextType>({
    isAppCheckAvailable: false,
    appCheckError: null,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const initialize = async () => {
      try {
        const recaptchaSiteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
        if (!recaptchaSiteKey) {
          throw new Error("Chave reCAPTCHA não configurada.");
        }

        if (process.env.NODE_ENV !== 'production') {
          (window as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
        }

        initializeAppCheck(app, {
          provider: new ReCaptchaV3Provider(recaptchaSiteKey),
          isTokenAutoRefreshEnabled: true,
        });

        setAppCheckState({ isAppCheckAvailable: true, appCheckError: null });
        console.log("Firebase App Check inicializado com sucesso.");
      } catch (e) {
        const error = e as Error;
        console.error("Falha na inicialização do Firebase App Check:", error.message);
        setAppCheckState({ isAppCheckAvailable: false, appCheckError: error.message });
      }
    };

    initialize();
  }, []);

  return (
    <AppCheckContext.Provider value={appCheckState}>
      {/* Passando o app inicializado para o ClientProviders */}
      <ClientProviders app={app}>{children}</ClientProviders>
    </AppCheckContext.Provider>
  );
}