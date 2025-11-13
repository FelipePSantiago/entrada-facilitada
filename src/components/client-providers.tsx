'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { onAuthStateChanged, type User, type MultiFactorResolver } from 'firebase/auth';
import { onSnapshot, doc, getDoc, type DocumentSnapshot, type FirestoreError, type QuerySnapshot, collection } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { safeLocalStorage } from '@/lib/safe-storage';
import type { Property } from '@/types';
// Import the initialized Firebase services from the new client file
import { auth, db, functions } from '@/lib/firebase/client';
import { type Functions } from 'firebase/functions';
import { type Auth } from 'firebase/auth';

// The contexts remain the same
interface AppCheckContextType {
    isAppCheckAvailable: boolean;
    appCheckError: string | null;
}

export const AppCheckContext = createContext<AppCheckContextType>({
    isAppCheckAvailable: false,
    appCheckError: null,
});

export function useAppCheck() {
    const context = useContext(AppCheckContext);
    if (!context) {
        throw new Error('useAppCheck must be used within Providers');
    }
    return context;
}

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

export function Providers({ children }: { children: React.ReactNode }) {
    // AppCheck state can be simplified or removed if not used to gate UI
    const [appCheckState, setAppCheckState] = useState<AppCheckContextType>({
        isAppCheckAvailable: true, // Assume available on client
        appCheckError: null,
    });

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

    // Auth state listener now uses the imported `auth` instance
    useEffect(() => {
        if (!auth) {
            setAuthLoading(false);
            return;
        };
        const unsubscribe = onAuthStateChanged(auth, (newUser: User | null) => {
            setUser(newUser);
            setAuthLoading(false);

            if (newUser) {
                setIs2FAVerified(false);
                safeLocalStorage.removeItem(`2fa-verified-${newUser.uid}`);

                const userDocRef = doc(db, "users", newUser.uid);
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
    }, [toast]);

    // Page routing logic remains the same
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

    // Properties loading logic now uses the imported `db` instance
    useEffect(() => {
        if (!isAdmin) {
            setProperties([]);
            setPropertiesLoading(false);
            return;
        }

        const propertiesCollection = collection(db, "properties");
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
    }, [isAdmin, toast]);

    const authContextValue = useMemo(() => ({
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
        functions, // Pass the imported functions instance
        auth,      // Pass the imported auth instance
        mfaResolver,
        setMfaResolver,
    }), [user, isAdmin, authLoading, isFullyAuthenticated, has2FA, is2FAVerified, properties, propertiesLoading, isPageLoading, mfaResolver]);

    return (
        <AppCheckContext.Provider value={appCheckState}>
            <AuthContext.Provider value={authContextValue}>
                {children}
            </AuthContext.Provider>
        </AppCheckContext.Provider>
    );
}
