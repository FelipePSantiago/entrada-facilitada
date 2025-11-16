'use client';

import { useState, useEffect } from 'react';
import { app } from '@/lib/firebase/clientApp';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

let appCheckInitialized = false;

export function useAppCheck() {
  const [isAppCheckReady, setIsAppCheckReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAppCheckAvailable, setIsAppCheckAvailable] = useState(false);
  const [appCheckError, setAppCheckError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || appCheckInitialized) {
      return;
    }

    try {
      const recaptchaSiteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
      
      if (!recaptchaSiteKey) {
        console.warn('App Check: ReCAPTCHA site key não configurada');
        setError('ReCAPTCHA site key não configurada');
        setAppCheckError('ReCAPTCHA site key não configurada');
        setIsAppCheckAvailable(false);
        return;
      }

      // Debug token para desenvolvimento
      if (process.env.NODE_ENV !== 'production') {
        (window as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
      }

      initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(recaptchaSiteKey),
        isTokenAutoRefreshEnabled: true,
      });

      appCheckInitialized = true;
      setIsAppCheckReady(true);
      setIsAppCheckAvailable(true);
      setAppCheckError(null);
      console.log('Firebase App Check inicializado com sucesso');
    } catch (err) {
      console.error('Falha na inicialização do Firebase App Check:', err);
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
      setAppCheckError(err instanceof Error ? err.message : 'Erro desconhecido');
      setIsAppCheckAvailable(false);
    }
  }, []);

  const getToken = async () => {
    if (!isAppCheckReady) {
      throw new Error('App Check não está pronto');
    }

    try {
      // Por enquanto, retorna um token mock
      // TODO: Implementar getToken corretamente quando a API do Firebase App Check estiver disponível
      return 'mock-app-check-token';
    } catch (err) {
      console.error('Erro ao obter token do App Check:', err);
      throw err;
    }
  };

  return {
    isAppCheckReady,
    error,
    isAppCheckAvailable,
    appCheckError,
    getToken
  };
}