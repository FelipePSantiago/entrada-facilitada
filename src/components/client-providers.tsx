"use client";
import React, { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { onSnapshot, doc, getFirestore, collection } from 'firebase/firestore';

import { AuthContext } from '@/contexts/AuthContext';
import type { Property, AppUser } from '@/types';
import { auth, app, db } from '@/lib/firebase/clientApp';
import { getFunctions, type Functions, httpsCallable } from 'firebase/functions';
import { AppleLoader } from '@/components/ui/apple-loader';

interface ProvidersProps {
  children: React.ReactNode;
}

const PUBLIC_PATHS = ['/login', '/signup', '/plans', '/pix-payment', '/forgot-password', '/', '/sumup-payment', '/sumup-payment/success', '/api/sumup/payment'];
const AUTH_ONLY_PATHS = ['/setup-2fa', '/verify-2fa'];

function LoadingScreen() {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
        <AppleLoader />
      </div> 
    );
}

export function ClientProviders({ children }: ProvidersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null | undefined>(undefined);
  const [authLoading, setAuthLoading] = useState(true);
  const [isPageLoading, setIsPageLoading] = useState(false);
  const [isFullyAuthenticated, setIsFullyAuthenticated] = useState(false);
  const [has2FA, setHas2FA] = useState<boolean | undefined>(undefined);
  const [is2FAVerified, setIs2FAVerified] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);
  const [twoFAReady, setTwoFAReady] = useState(false);
  const [propertiesLoading, setPropertiesLoading] = useState(true);
  const [functions, setFunctions] = useState<Functions | null>(null);

  useEffect(() => {
    const funcs = getFunctions(app);
    setFunctions(funcs);

    const unsubscribeAuth = onAuthStateChanged(auth, (newUser) => {
      if (newUser) {
        setUser(newUser);
        setIs2FAVerified(localStorage.getItem(`2fa-verified-${newUser.uid}`) === 'true');
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
        setTwoFAReady(false);
        setIs2FAVerified(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

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
    if (twoFAReady) return;
    if (appUser === undefined || !user || !functions) return;
    setAuthLoading(true);

    const checkTwoFactor = async () => {
      try {
        const getTwoFactorSecret = httpsCallable(functions, 'getTwoFactorSecretAction');
        const result = await getTwoFactorSecret();
        const secret = result.data as string | null;
        
        const hasTwoFactor = !!secret;
        setHas2FA(hasTwoFactor);

        setTwoFAReady(true);

        if (!hasTwoFactor) {
          setIsFullyAuthenticated(true);
        } else if (hasTwoFactor && is2FAVerified) {
          setIsFullyAuthenticated(true);
        } else {
          setIsFullyAuthenticated(false);
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

  }, [appUser, user, functions, setIsFullyAuthenticated, setHas2FA, setAuthLoading, twoFAReady, is2FAVerified]);

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

    if (has2FA) {
    if (isFullyAuthenticated) {
      if (pathname !== targetPath && AUTH_ONLY_PATHS.includes(pathname) || pathname === '/login') {
        router.replace(targetPath);
        setIsPageLoading(true);
      }
      return;
    }

      if (!is2FAVerified) {
        router.replace('/verify-2fa');
      } else {
        router.replace(targetPath);
      }
    } else {
      if (pathname !== '/setup-2fa') {
        router.replace('/setup-2fa');
        setIsPageLoading(true);
      }
    }
  }, [authLoading, user, appUser, isFullyAuthenticated, has2FA, pathname, router, is2FAVerified]);

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

  return (
    <AuthContext.Provider value={{ 
        user, 
        isAdmin, 
        authLoading, 
        isFullyAuthenticated, 
        setIsFullyAuthenticated, 
        has2FA, 
        is2FAVerified, 
        properties, 
        propertiesLoading,
        isPageLoading,
        setIsPageLoading,
        functions
    }}>
      {showLoader ? <LoadingScreen /> : children}
    </AuthContext.Provider>
  );
}
