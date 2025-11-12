'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { FirebaseApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signOut, type User, type MultiFactorResolver, type Auth } from 'firebase/auth';
import { getFirestore, onSnapshot, doc, getDoc, type DocumentSnapshot, type FirestoreError, type QuerySnapshot, collection } from 'firebase/firestore';
import { getFunctions, httpsCallable, type Functions } from 'firebase/functions';
import { useToast } from '@/hooks/use-toast';
import { safeLocalStorage } from '@/lib/safe-storage';
import type { Property } from '@/types';

// 1. Definição do Contexto movida para cá
interface AuthContextType {
  user: User | null;
  isAdmin: boolean;
  authLoading: boolean;
  isFullyAuthenticated: boolean;
  setIsFullyAuthenticated: (isAuth: boolean) => void;
  has2FA: boolean | undefined;
  is2FAVerified: boolean;
  setIs2FAVerified: (isVerified: boolean) => void;
  properties: Property[];
  propertiesLoading: boolean;
  isPageLoading: boolean;
  setIsPageLoading: (isLoading: boolean) => void;
  functions: Functions | null;
  auth: Auth | null;
  mfaResolver: MultiFactorResolver | null;
  setMfaResolver: (resolver: MultiFactorResolver | null) => void;
}

// 2. Criação do Contexto e Hook useAuth movidos para cá
export const AuthContext = createContext<AuthContextType>({
  user: null,
  isAdmin: false,
  authLoading: true,
  isFullyAuthenticated: false,
  setIsFullyAuthenticated: () => {},
  has2FA: undefined,
  is2FAVerified: false,
  setIs2FAVerified: () => {},
  properties: [],
  propertiesLoading: true,
  isPageLoading: true,
  setIsPageLoading: () => {},
  functions: null,
  auth: null,
  mfaResolver: null,
  setMfaResolver: () => {},
});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// 3. O componente ClientProviders agora é o ÚNICO provedor
export function ClientProviders({ children, app }: { children: React.ReactNode; app: FirebaseApp }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [isFullyAuthenticated, setIsFullyAuthenticated] = useState(false);
  const [is2FAVerified, setIs2FAVerified] = useState(false);
  const [has2FA, setHas2FA] = useState<boolean | undefined>(undefined);
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertiesLoading, setPropertiesLoading] = useState(true);
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [mfaResolver, setMfaResolver] = useState<any>(null);

  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();

  const firebaseServices = useMemo(() => {
    const auth = getAuth(app);
    const db = getFirestore(app);
    const functions = getFunctions(app, 'southamerica-east1');
    return { auth, db, functions };
  }, [app]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseServices.auth, (newUser: User | null) => {
      setUser(newUser);
      setAuthLoading(false);

      if (newUser) {
        setIs2FAVerified(false);
        safeLocalStorage.removeItem(`2fa-verified-${newUser.uid}`);

        const userDocRef = doc(firebaseServices.db, "users", newUser.uid);
        getDoc(userDocRef).then((userDoc: DocumentSnapshot) => {
          if (userDoc.exists() && userDoc.data().is2FAEnabled) {
            setHas2FA(true);
            const isVerified = safeLocalStorage.getItem(`2fa-verified-${newUser.uid}`) === 'true';
            if (isVerified) {
              setIs2FAVerified(true);
              setIsFullyAuthenticated(true);
            } else {
              setIsFullyAuthenticated(false);
            }
          } else {
            setHas2FA(false);
            setIsFullyAuthenticated(true);
          }
        }).catch((error: FirestoreError) => {
          console.error("Erro ao buscar documento do usuário:", error);
          setHas2FA(false);
          setIsFullyAuthenticated(true);
        });

        newUser.getIdTokenResult().then(idTokenResult => {
          setIsAdmin(!!idTokenResult.claims.admin);
        });
      } else {
        setIsAdmin(false);
        setIsFullyAuthenticated(false);
        setHas2FA(undefined);
      }
    });
    return () => unsubscribe();
  }, [firebaseServices, toast]);

  useEffect(() => {
    setIsPageLoading(true);
    if (!authLoading) {
      const isAuthPage = ['/login', '/signup', '/forgot-password'].includes(pathname);
      const is2FAVerificationPage = pathname === '/verify-2fa';

      if (user) {
        if (has2FA && !is2FAVerified && !is2FAVerificationPage) {
          router.push('/verify-2fa');
        } else if (isAuthPage) {
          router.push('/simulator');
        } else {
          setIsPageLoading(false);
        }
      } else {
        if (!isAuthPage && pathname !== '/' && !pathname.startsWith('/plans')) {
          router.push('/login');
        } else {
          setIsPageLoading(false);
        }
      }
    }
  }, [user, authLoading, is2FAVerified, has2FA, pathname, router]);

  useEffect(() => {
    if (!isAdmin) {
      setProperties([]);
      setPropertiesLoading(false);
      return;
    }

    const propertiesCollection = collection(firebaseServices.db, "properties");
    const unsubscribe = onSnapshot(propertiesCollection, (querySnapshot: QuerySnapshot) => {
      const props = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Property));
      setProperties(props);
      setPropertiesLoading(false);
    }, (error: FirestoreError) => {
      console.error("Erro ao buscar imóveis:", error);
      toast({ variant: "destructive", title: "Erro ao carregar dados", description: "Não foi possível buscar os imóveis." });
      setPropertiesLoading(false);
    });

    return () => unsubscribe();
  }, [isAdmin, firebaseServices.db, toast]);

  const contextValue = {
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
    functions: firebaseServices.functions,
    auth: firebaseServices.auth,
    mfaResolver,
    setMfaResolver,
  };

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}