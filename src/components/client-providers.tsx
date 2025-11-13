'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
// Correctly import the User type with an alias to avoid conflicts
import { onAuthStateChanged, type MultiFactorResolver, type Auth } from 'firebase/auth';
import type { User as FirebaseUser } from 'firebase/auth';
import { onSnapshot, doc, getDoc, type FirestoreError, type QuerySnapshot, collection } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { safeLocalStorage } from '@/lib/safe-storage';
import type { Property } from '@/types';
import { auth, db, functions } from '@/lib/firebase/client';
import { type Functions } from 'firebase/functions';

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

// Use the aliased FirebaseUser type for consistency
interface AuthContextType {
    user: FirebaseUser | null;
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
    const [appCheckState, setAppCheckState] = useState<AppCheckContextType>({
        isAppCheckAvailable: true,
        appCheckError: null,
    });

    // Explicitly type the user state with the correct, aliased type
    const [user, setUser] = useState<FirebaseUser | null>(null);
    const [previousUser, setPreviousUser] = useState<FirebaseUser | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [authLoading, setAuthLoading] = useState(true);
    const [isFullyAuthenticated, setIsFullyAuthenticated] = useState(false);
    const [is2FAVerified, setIs2FAVerified] = useState(false);
    const [has2FA, setHas2FA] = useState<boolean | undefined>(undefined);
    const [properties, setProperties] = useState<Property[]>([]);
    const [propertiesLoading, setPropertiesLoading] = useState(true);
    const [isPageLoading, setIsPageLoading] = useState(true);
    const [mfaResolver, setMfaResolver] = useState<MultiFactorResolver | null>(null);

    const { toast } = useToast();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (!auth) {
            setAuthLoading(false);
            return;
        }
        const unsubscribe = onAuthStateChanged(auth, (newUser) => {
            setPreviousUser(user);
            // The newUser from onAuthStateChanged is the correct type from the SDK
            setUser(newUser);
            setAuthLoading(false);

            if (newUser) {
                setIsFullyAuthenticated(false);

                newUser.getIdTokenResult().then(idTokenResult => {
                    setIsAdmin(!!idTokenResult.claims.admin);
                });

                const userDocRef = doc(db, "users", newUser.uid);
                getDoc(userDocRef).then((userDoc) => {
                    const is2FAEnabled = userDoc.exists() && userDoc.data().is2FAEnabled;
                    setHas2FA(is2FAEnabled);
                    if (is2FAEnabled) {
                        const isVerifiedInSession = safeLocalStorage.getItem(`2fa-verified-${newUser.uid}`) === 'true';
                        setIs2FAVerified(isVerifiedInSession);
                        setIsFullyAuthenticated(isVerifiedInSession);
                    } else {
                        setIsFullyAuthenticated(true);
                    }
                }).catch((error) => {
                    console.error("Error fetching user document:", error);
                    toast({ variant: "destructive", title: "Authentication Error", description: "Could not verify your security settings. Access denied." });
                    setHas2FA(undefined);
                    setIsFullyAuthenticated(false);
                    if (auth) auth.signOut();
                });
            } else {
                setIsAdmin(false);
                setIsFullyAuthenticated(false);
                setHas2FA(undefined);
                setIs2FAVerified(false);
                setMfaResolver(null);
                if (previousUser) {
                    safeLocalStorage.removeItem(`2fa-verified-${previousUser.uid}`);
                }
            }
        });

        return () => unsubscribe();
        // The dependency array should not contain `user` and `previousUser` to avoid re-running on every state change it causes.
    }, [auth, toast]);

    useEffect(() => {
        if (authLoading) {
            setIsPageLoading(true);
            return;
        }

        const isAuthPage = ['/login', '/signup', '/forgot-password'].includes(pathname);
        const is2FAVerificationPage = pathname === '/verify-2fa';
        const isPublicPage = ['/', '/plans'].includes(pathname) || pathname.startsWith('/plans');

        if (mfaResolver && !is2FAVerificationPage) {
            router.push('/verify-2fa');
            return;
        }
        
        if (!user) {
            if (isPublicPage || isAuthPage || is2FAVerificationPage) {
                setIsPageLoading(false);
            } else {
                router.push('/login');
            }
            return;
        }

        if (has2FA === true && !is2FAVerified && !is2FAVerificationPage) {
            router.push('/verify-2fa');
            return;
        }

        if (isFullyAuthenticated && isAuthPage) {
            router.push('/simulator');
            return;
        }

        setIsPageLoading(false);

    }, [user, authLoading, isFullyAuthenticated, has2FA, is2FAVerified, mfaResolver, pathname, router]);

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
        functions,
        auth,
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
