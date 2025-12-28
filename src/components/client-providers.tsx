'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { onSnapshot, doc, collection } from 'firebase/firestore';

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
  const [propertiesLoading, setPropertiesLoading] = useState(true);
  const [functions, setFunctions] = useState<Functions | null>(null);

  useEffect(() => {
    const funcs = getFunctions(app);
    setFunctions(funcs);

    const unsubscribeAuth = onAuthStateChanged(auth, (newUser) => {
      if (newUser) {
        setUser(newUser);
        const verified = localStorage.getItem(`2fa-verified-${newUser.uid}`) === 'true';
        setIs2FAVerified(verified);
      } else {
        setUser(null);
        setAppUser(null);
        setHas2FA(undefined);
        setIsFullyAuthenticated(false);
        setIs2FAVerified(false);
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

  useEffect(() => {
    setIsPageLoading(false);
  }, [pathname]);

  useEffect(() => {
    if (!user) {
      setAppUser(null);
      setAuthLoading(false);
      return;
    }

    const userDocRef = doc(db, 'users', user.uid);
    const unsubscribeUser = onSnapshot(userDocRef, 
      (userDoc) => {
        const userData = userDoc.exists() ? (userDoc.data() as AppUser) : null;
        setAppUser(userData);
      },
      (error) => {
        console.error("Error fetching user document:", error);
        setAppUser(null);
        setAuthLoading(false);
      }
    );

    return () => unsubscribeUser();
  }, [user]);

  useEffect(() => {
    if (!user || appUser === undefined) {
        return;
    }

    setAuthLoading(true);

    if (appUser === null) {
        setHas2FA(false);
        setIsFullyAuthenticated(false);
        setAuthLoading(false);
        return;
    }

    const processAuthLogic = async () => {
        try {
            const getTwoFactorSecret = httpsCallable(functions!, 'getTwoFactorSecretAction');
            const result = await getTwoFactorSecret();
            const userHas2FAFromBackend = !!(result.data as string | null);

            setHas2FA(userHas2FAFromBackend);

            if (appUser.isAdmin) {
                setIsFullyAuthenticated(userHas2FAFromBackend && is2FAVerified);

                if (is2FAVerified) {
                    await user.getIdToken(true);
                }
            } else {
                setIsFullyAuthenticated(!userHas2FAFromBackend || (userHas2FAFromBackend && is2FAVerified));
            }
        } catch (e) {
            console.error("Falha crítica no processamento da lógica de autenticação:", e);
            setHas2FA(false);
            setIsFullyAuthenticated(false);
        } finally {
            setAuthLoading(false);
        }
    };

    processAuthLogic();
  }, [appUser, user, functions, is2FAVerified]);

  useEffect(() => {
    if (authLoading || (user && has2FA === undefined)) {
      return;
    }

    const isPublicPath = PUBLIC_PATHS.includes(pathname);
    const isAuthFlowPath = AUTH_ONLY_PATHS.includes(pathname);
    const targetPath = appUser?.isAdmin ? '/admin/properties' : '/simulator';

    if (!user) {
      if (!isPublicPath) {
        router.replace('/login');
        setIsPageLoading(true);
      }
      return;
    }

    if (has2FA) {
      if (is2FAVerified) {
        if (isAuthFlowPath || pathname === '/login') {
          router.replace(targetPath);
          setIsPageLoading(true);
        }
      } else {
        if (pathname !== '/verify-2fa') {
          router.replace('/verify-2fa');
          setIsPageLoading(true);
        }
      }
    } else {
      if (appUser?.isAdmin && pathname !== '/setup-2fa') {
        router.replace('/setup-2fa');
        setIsPageLoading(true);
      }
    }
  }, [authLoading, user, appUser, has2FA, is2FAVerified, pathname, router]);

  useEffect(() => {
    if (!user || !appUser) {
      setProperties([]);
      setPropertiesLoading(false);
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
      setProperties([]);
      setPropertiesLoading(false);
    });

    return () => unsubscribeProperties();
  }, [user, appUser]);

  const isAdmin = useMemo(() => appUser?.isAdmin ?? false, [appUser]);
  const showLoader = authLoading || (user && appUser === undefined) || isPageLoading;
  
  const contextValue = useMemo(() => ({
    user, 
    isAdmin, 
    authLoading, 
    isFullyAuthenticated, 
    setIsFullyAuthenticated, 
    has2FA, 
    is2FAVerified, 
    setIs2FAVerified,
    properties, 
    propertiesLoading,
    isPageLoading,
    setIsPageLoading,
    functions
  }), [user, isAdmin, authLoading, isFullyAuthenticated, has2FA, is2FAVerified, properties, propertiesLoading, isPageLoading, functions]);

  return (
    <AuthContext.Provider value={contextValue}>
      {showLoader ? <LoadingScreen /> : children}
    </AuthContext.Provider>
  );
}