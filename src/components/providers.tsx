"use client";
import React, { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { onSnapshot, doc, getFirestore, collection } from 'firebase/firestore';

import { AuthContext } from '@/contexts/AuthContext';
import type { Property, AppUser } from '@/types';
import { auth, app, initializeFirebase, db } from '@/lib/firebase/clientApp';
import { getFunctions, type Functions, httpsCallable } from 'firebase/functions';

interface ProvidersProps {

  children: React.ReactNode;
}

const PUBLIC_PATHS = ['/login', '/signup', '/plans', '/pix-payment', '/forgot-password', '/', '/sumup-payment', '/sumup-payment/success', '/api/sumup/payment'];
const AUTH_ONLY_PATHS = ['/setup-2fa', '/verify-2fa'];

export function Providers({ children }: ProvidersProps) {
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
    initializeFirebase();
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

  useEffect(() => {
    setIsPageLoading(false);
  }, [pathname]);

  // Step 1: Listen for the user object from Firebase Auth and fetch the user profile from Firestore.
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

  // Step 2: Once the user profile (appUser) is loaded, check for 2FA status.
  useEffect(() => {
    if (appUser === undefined || !user || !functions) return;
    setAuthLoading(true);

    const checkTwoFactor = async () => {
      try {
        // The backend function will create the user document if it doesn't exist
        const getTwoFactorSecret = httpsCallable(functions, 'getTwoFactorSecretAction');
        const result = await getTwoFactorSecret();
        const secret = result.data as string | null;
        
        const hasTwoFactor = !!secret;
        setHas2FA(hasTwoFactor);

        if (hasTwoFactor) {
          const isVerifiedInStorage = localStorage.getItem(`2fa-verified-${user.uid}`) === 'true';
          setIsFullyAuthenticated(isVerifiedInStorage);
        } else {
          setIsFullyAuthenticated(appUser?.isAdmin || false);
        }

      } catch (e) {
        console.error("Failed to check 2FA status:", e);
        setHas2FA(false);
        setIsFullyAuthenticated(false);
      } finally {
        setAuthLoading(false);
      }
    };
    
    // If appUser has loaded (is null or an object) and is not admin, check 2FA.
    if (appUser === null || !appUser.isAdmin) {
      checkTwoFactor();
    } else if (appUser.isAdmin) {
      // Admins bypass the 2FA flow in the client
      setHas2FA(true); 
      setIsFullyAuthenticated(true);
      setAuthLoading(false);
    }

  }, [appUser, user, functions, setIsFullyAuthenticated, setHas2FA, setAuthLoading]);

  // Step 3: Handle routing based on the authentication and 2FA state.
  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      if (pathname && !PUBLIC_PATHS.includes(pathname)) {
        router.replace('/login');
        setIsPageLoading(true); // Indicate page is loading during redirect
      }
      return;
    }

    // User is logged in
    const targetPath = appUser?.isAdmin ? '/admin/properties' : '/simulator';

    if (isFullyAuthenticated) { // Fully authenticated (passed 2FA or is admin)
      if (AUTH_ONLY_PATHS.includes(pathname) || pathname === '/login') {
         router.replace(targetPath);
         setIsPageLoading(true);
      }
      return;
    }
    
    // User is logged in but not fully authenticated (pending 2FA)
    if (AUTH_ONLY_PATHS.includes(pathname)) {
      return; // Already on a 2FA page, stay put
    }

    if (has2FA === undefined) return; // Wait for 2FA check to complete

    if (has2FA) {
      router.replace('/verify-2fa');
    } else {
      router.replace('/setup-2fa'); // Non-admin user needs to set up 2FA
    }
    setIsPageLoading(true); // Indicate page is loading during redirect

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
      console.error("Error fetching properties: ", error);
      setPropertiesLoading(false);
    });

    return () => unsubscribeProperties();
  }, [isFullyAuthenticated]);

  const isAdmin = appUser?.isAdmin ?? false;
  // Check isPageLoading only if router is available, otherwise assume initial load
  const showLoader = authLoading || (user && appUser === undefined) || (router && isPageLoading);

  if (showLoader) {
    return (
      // You can add a loader component here if needed
      <div>Loading...</div> 
    );
  }

  return ( // Use non-null assertion if confident
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
