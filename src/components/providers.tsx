'use client';

import dynamic from 'next/dynamic';
import React, { useEffect, useState } from 'react';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { app } from '@/lib/firebase/clientApp';

const ClientProviders = dynamic(() => import('./client-providers').then(mod => mod.ClientProviders), {
  ssr: false,
  loading: () => <div>Carregando...</div>, 
});

// Interface para o contexto de App Check
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
    if (typeof window === 'undefined') {
      return;
    }

    const initializeAppCheckWithFallback = async () => {
      try {
        const recaptchaSiteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
        
        // Verificar se a chave reCAPTCHA está configurada
        if (!recaptchaSiteKey || recaptchaSiteKey === 'dummy-key-for-dev') {
          const errorMsg = process.env.NODE_ENV === 'production' 
            ? "App Check: reCAPTCHA key not configured in production. Some features may be limited."
            : "App Check: Using debug mode for development.";
          
          console.warn(errorMsg);
          setAppCheckState({
            isAppCheckAvailable: false,
            appCheckError: errorMsg,
          });

          // Em desenvolvimento, continuar com debug token
          if (process.env.NODE_ENV !== 'production') {
            (window as Window & { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = "a5864223-9b38-489e-817b-c14ca8009e41";
            
            try {
              initializeAppCheck(app, {
                provider: new ReCaptchaV3Provider('dummy-key-for-dev'),
                isTokenAutoRefreshEnabled: true,
              });
              
              setAppCheckState({
                isAppCheckAvailable: true,
                appCheckError: null,
              });
              console.log("Firebase App Check initialized in debug mode successfully.");
            } catch (debugError) {
              console.error("Failed to initialize App Check in debug mode:", debugError);
            }
          }
          return;
        }

        // Configurar debug token para desenvolvimento
        if (process.env.NODE_ENV !== 'production') {
          (window as Window & { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = "a5864223-9b38-489e-817b-c14ca8009e41";
        }

        // Inicializar App Check em produção
        try {
          initializeAppCheck(app, {
            provider: new ReCaptchaV3Provider(recaptchaSiteKey),
            isTokenAutoRefreshEnabled: true,
          });

          setAppCheckState({
            isAppCheckAvailable: true,
            appCheckError: null,
          });
          console.log("Firebase App Check initialized successfully.");

        } catch (initError) {
          const errorMsg = `App Check initialization failed: ${initError instanceof Error ? initError.message : 'Unknown error'}`;
          console.error(errorMsg, initError);
          
          setAppCheckState({
            isAppCheckAvailable: false,
            appCheckError: errorMsg,
          });

          // Tentar inicializar sem App Check como fallback
          console.warn("Continuing without App Check. Some features may be limited.");
        }

      } catch (e) {
        const errorMsg = `Critical error during App Check setup: ${e instanceof Error ? e.message : 'Unknown error'}`;
        console.error(errorMsg, e);
        
        setAppCheckState({
          isAppCheckAvailable: false,
          appCheckError: errorMsg,
        });

        // Continuar sem App Check em vez de quebrar a aplicação
        console.warn("Application will continue without App Check. Consider configuring reCAPTCHA for full functionality.");
      }
    };

    // Inicializar App Check com um pequeno delay para garantir que o DOM esteja pronto
    const timer = setTimeout(initializeAppCheckWithFallback, 100);

    return () => clearTimeout(timer);

  }, []);

  return (
    <AppCheckContext.Provider value={appCheckState}>
      <ClientProviders>{children}</ClientProviders>
    </AppCheckContext.Provider>
  );
}