"use client";
import React, { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { onSnapshot, doc, getFirestore, collection } from 'firebase/firestore';

import { AuthContext } from '@/contexts/AuthContext';
import type { Property, AppUser } from '@/types';
import { auth, app, db } from '@/lib/firebase/clientApp';
import { getFunctions, type Functions, httpsCallable } from 'firebase/functions';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

interface ProvidersProps {
  children: React.ReactNode;
}

const PUBLIC_PATHS = ['/login', '/signup', '/plans', '/pix-payment', '/forgot-password', '/', '/sumup-payment', '/sumup-payment/success', '/api/sumup/payment'];
const AUTH_ONLY_PATHS = ['/setup-2fa', '/verify-2fa'];

export function ClientProviders({ children }: ProvidersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null | undefined>(undefined);
  const [authLoading, setAuthLoading] = useState(true);
  const [isPageLoading, setIsPageLoading] = useState(false);
  const [isFullyAuthenticated, setIsFullyAuthenticated] = useState(false);
  const [has2FA, setHas2FA] = useState<boolean | undefined>(undefined);
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertiesLoading, setPropertiesLoading] = useState(true);
  const [functions, setFunctions] = useState<Functions | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      // ATENÇÃO: O token de debug só é habilitado se a aplicação NÃO estiver em produção.
      if (process.env.NODE_ENV !== 'production') {
        // @ts-expect-error - Firebase App Check debug token
        self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
      }

      const recaptchaSiteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

      if (!recaptchaSiteKey) {
        console.error("ERRO CRÍTICO: A variável de ambiente NEXT_PUBLIC_RECAPTCHA_SITE_KEY não está definida.");
      } else {
        try {
          initializeAppCheck(app, {
            provider: new ReCaptchaV3Provider(recaptchaSiteKey),
            isTokenAutoRefreshEnabled: true,
          });
        } catch (e) {
          console.error("Falha ao inicializar o Firebase App Check:", e);
        }
      }
    }
    
    const funcs = getFunctions(app);
    setFunctions(funcs);

    const unsubscribeAuth = onAuthStateChanged(auth, (newUser) => {
      if (newUser) {
        setUser(newUser);
      } else {
        setUser(null);
        setAppUser(null);
        setHas2FA(undefined);
        setIsFullyAuthenticated(false);
        setAuthLoading(false);
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('2fa-verified-')) {
            localStorage.removeItem(key);
          }
        });
      }
    });

    return () => unsubscribeAuth();
  }, []);

  // ... (o resto do arquivo permanece o mesmo) ...
  
  useEffect(() => {
    setIsPageLoading(false);
  }, [pathname]);

  useEffect(() => {
    if (!user) {
      setAppUser(null);
      setAuthLoading(false);
      return;
    }

    const db = getFirestore(app);
    const userDocRef = doc(db, 'users', user.uid);
    const unsubscribeUser = onSnapshot(userDocRef, (userDoc) => {
      setAppUser(userDoc.exists() ? (userDoc.data() as AppUser) : null);
    });

    return () => unsubscribeUser();
  }, [user]);

  useEffect(() => {
    if (appUser === undefined || !user || !functions) return;
    setAuthLoading(true);

    const checkTwoFactor = async () => {
      try {
        const getTwoFactorSecret = httpsCallable(functions, 'getTwoFactorSecretAction');
        const result = await getTwoFactorSecret();
        const secret = result.data as string | null;
        
        const hasTwoFactor = !!secret;
        setHas2FA(hasTwoFactor);

        // Define isFullyAuthenticated com base no status do 2FA no backend e se o usuário não é admin
        if (!hasTwoFactor && !appUser?.isAdmin) {
          setIsFullyAuthenticated(appUser?.isAdmin || false);
        }

      } catch (e) {
        console.error("Falha ao verificar o status do 2FA:", e);
        setHas2FA(false);
        setIsFullyAuthenticated(false);
      } finally {
        setAuthLoading(false);
      }
    };
    
    if (appUser === null || !appUser.isAdmin) {
      checkTwoFactor();
    } else if (appUser.isAdmin) {
      setHas2FA(true); 
      setIsFullyAuthenticated(true);
      setAuthLoading(false);
    }

  }, [appUser, user, functions, setIsFullyAuthenticated, setHas2FA, setAuthLoading]);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      if (pathname && !PUBLIC_PATHS.includes(pathname)) {
        router.replace('/login');
        setIsPageLoading(true);
      }
      return;
    }

    const targetPath = appUser?.isAdmin ? '/admin/properties' : '/simulator';

    if (isFullyAuthenticated) {
      if (AUTH_ONLY_PATHS.includes(pathname) || pathname === '/login') {
         router.replace(targetPath);
         setIsPageLoading(true);
      }
      return;
    }
    
    if (AUTH_ONLY_PATHS.includes(pathname)) {
      return;
    }

    if (has2FA === undefined) return;

    if (has2FA) {
      router.replace('/verify-2fa');
    } else {
      router.replace('/setup-2fa');
    }
    setIsPageLoading(true);

  }, [authLoading, user, appUser, isFullyAuthenticated, has2FA, pathname, router]);

  useEffect(() => {
    if (!isFullyAuthenticated) {
      setProperties([]);
      setPropertiesLoading(true);
      return;
    }

    setPropertiesLoading(true);
    const propertiesCollection = collection(db, 'properties');
    const unsubscribeProperties = onSnapshot(propertiesCollection, (querySnapshot) => {
      const props: Property[] = [];
      querySnapshot.forEach((doc) => {
        props.push({ id: doc.id, ...(doc.data() as Omit<Property, 'id'>) });
      });
      setProperties(props);
      setPropertiesLoading(false);
    }, (error) => {
      console.error("Erro ao buscar propriedades: ", error);
      setPropertiesLoading(false);
    });

    return () => unsubscribeProperties();
  }, [isFullyAuthenticated]);

  const isAdmin = appUser?.isAdmin ?? false;
  const showLoader = authLoading || (user && appUser === undefined) || (router && isPageLoading);

  if (showLoader) {
    return (
      <div>Carregando...</div> 
    );
  }

  return (
    <AuthContext.Provider value={{ 
        user, 
        isAdmin, 
        authLoading, 
        isFullyAuthenticated, 
        setIsFullyAuthenticated, 
        has2FA, 
        properties, 
        propertiesLoading,
        isPageLoading,
        setIsPageLoading,
        functions
    }}>
      {children}
    </AuthContext.Provider>
  );
}