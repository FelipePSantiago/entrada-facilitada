"use client";

import React, { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { onAuthStateChanged, type User, type Auth, type MultiFactorResolver } from 'firebase/auth';
import { onSnapshot, doc, collection } from 'firebase/firestore';

import { AuthContext } from '@/contexts/AuthContext';
import type { Property, AppUser } from '@/types';
import { auth, app, db } from '@/lib/firebase/client';
import { getFunctions, type Functions, httpsCallable } from 'firebase/functions';
import { retryFirebaseFunction } from '@/lib/utils';

interface ProvidersProps {
  children: React.ReactNode;
}

const PUBLIC_PATHS = ['/login', '/signup', '/plans', '/pix-payment', '/forgot-password', '/', '/sumup-payment', '/sumup-payment/success', '/api/sumup/payment'];
const AUTH_ONLY_PATHS = ['/verify-2fa'];

function LoadingScreen() {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
        <div className="text-white">Carregando...</div>
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
  const [mfaResolver, setMfaResolver] = useState<MultiFactorResolver | null>(null);

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
        console.log('Auth Debug - User data loaded:', {
          userUid: user.uid,
          userEmail: user.email,
          userData: userData,
          isAdmin: userData?.isAdmin
        });
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
    if (appUser === null) { // User document doesn't exist or couldn't be read
        setHas2FA(false);
        setIsFullyAuthenticated(false);
        setAuthLoading(false);
        return;
    }

    if (appUser.isAdmin) {
        setHas2FA(true);
        setIsFullyAuthenticated(true);
        setAuthLoading(false);
    } else {
        const checkTwoFactor = async () => {
            try {
                const getTwoFactorSecret = httpsCallable(functions!, 'getTwoFactorSecretAction');
                const result = await getTwoFactorSecret();
                const hasTwoFactor = !!(result.data as string | null);
                setHas2FA(hasTwoFactor);
                const canAccessApp = hasTwoFactor && is2FAVerified;
                setIsFullyAuthenticated(canAccessApp);
            } catch (e) {
                console.error("Falha ao verificar o status do 2FA:", e);
                setHas2FA(false);
                setIsFullyAuthenticated(false);
            } finally {
                setAuthLoading(false);
            }
        };
        checkTwoFactor();
    }
}, [appUser, user, functions, is2FAVerified]);


  useEffect(() => {
    if (authLoading || (user && has2FA === undefined)) {
      return;
    }

    const isPublicPath = PUBLIC_PATHS.includes(pathname);
    const isAuthFlowPath = AUTH_ONLY_PATHS.includes(pathname);
    const targetPath = appUser?.isAdmin ? '/simulator' : '/simulator';

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
      // Usuário não tem 2FA configurado - redirecionar para verify-2fa que gerencia o setup
      if (pathname !== '/verify-2fa') {
        router.replace('/verify-2fa');
        setIsPageLoading(true);
      }
    }
  }, [authLoading, user, appUser, has2FA, is2FAVerified, pathname, router]);


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
  
  // Função para verificar status de admin
  const checkAdminStatus = async () => {
    if (!functions || !user) {
      throw new Error('Funções não disponíveis ou usuário não autenticado');
    }

    try {
      const checkAdminStatus = httpsCallable(functions, 'checkAdminStatusAction');
      const result = await retryFirebaseFunction(checkAdminStatus, {});
      return result.data as { uid: string; email: string; isAdmin: boolean; exists: boolean };
    } catch (error: unknown) {
      console.error('Erro ao verificar status de admin:', error);
      throw error;
    }
  };

  // Função para definir usuário como admin
  const setUserAdmin = async (targetUserId: string, isAdminValue: boolean) => {
    if (!functions || !user) {
      throw new Error('Funções não disponíveis ou usuário não autenticado');
    }

    try {
      const setUserAdmin = httpsCallable(functions, 'setUserAdminAction');
      const result = await retryFirebaseFunction(setUserAdmin, { 
        targetUserId, 
        isAdmin: isAdminValue 
      });
      return result.data as { success: boolean; message: string };
    } catch (error: unknown) {
      console.error('Erro ao definir admin:', error);
      throw error;
    }
  };
  
  // Debug log para verificar o estado isAdmin
  useEffect(() => {
    console.log('Auth Debug - isAdmin state:', {
      appUser,
      isAdmin,
      userUid: user?.uid,
      userEmail: user?.email
    });
  }, [appUser, isAdmin, user]);
  
  const showLoader = authLoading || (user && has2FA === undefined) || (router && isPageLoading);

  return (
    <AuthContext.Provider value={{ 
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
        functions,
        auth,
        setMfaResolver,
        checkAdminStatus,
        setUserAdmin
    }}>
      {showLoader ? <LoadingScreen /> : children}
    </AuthContext.Provider>
  );
}

// Exportar como Providers para compatibilidade
export const Providers = ClientProviders;

// Exportar useAuth do AuthContext para compatibilidade
export { useAuth } from '@/contexts/AuthContext';

// Exportar useAppCheck para compatibilidade
export { useAppCheck } from '@/hooks/use-app-check';