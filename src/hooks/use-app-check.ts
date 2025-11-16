'use client';

import { useState, useEffect } from 'react';
import { app } from '@/lib/firebase/clientApp';
import { getAppCheck, initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

let appCheckInitialized = false;

export function useAppCheck() {
  const [isAppCheckReady, setIsAppCheckReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || appCheckInitialized) {
      return;
    }

    try {
      const recaptchaSiteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
      
      if (!recaptchaSiteKey) {
        console.warn('App Check: ReCAPTCHA site key não configurada');
        setError('ReCAPTCHA site key não configurada');
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
      console.log('Firebase App Check inicializado com sucesso');
    } catch (err) {
      console.error('Falha na inicialização do Firebase App Check:', err);
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    }
  }, []);

  const getToken = async () => {
    if (!isAppCheckReady) {
      throw new Error('App Check não está pronto');
    }

    try {
      const appCheck = getAppCheck();
      const tokenResult = await appCheck.getToken();
      return tokenResult.token;
    } catch (err) {
      console.error('Erro ao obter token do App Check:', err);
      throw err;
    }
  };

  return {
    isAppCheckReady,
    error,
    getToken
  };
}