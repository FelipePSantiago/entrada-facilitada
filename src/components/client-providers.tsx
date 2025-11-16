'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { auth, app, db } from '@/lib/firebase/clientApp';
import { getFunctions, Functions } from 'firebase/functions';
import { 
  onAuthStateChanged, 
  User as FirebaseUser,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  updateProfile,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  multiFactor,
  PhoneMultiFactorGenerator,
  TotpMultiFactorGenerator,
  getMultiFactorResolver,
  MultiFactorResolver,
  Auth
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  arrayUnion, 
  arrayRemove,
  serverTimestamp,
  Timestamp,
  DocumentData,
  FieldValue
} from 'firebase/firestore';
import type { Property } from '@/types';

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  createdAt?: Timestamp | FieldValue;
  lastLoginAt?: Timestamp | FieldValue;
  role?: 'user' | 'admin' | 'moderator';
  status?: 'active' | 'inactive' | 'suspended';
  phoneNumber?: string | null;
  twoFactorEnabled?: boolean;
  preferences?: {
    theme: 'light' | 'dark' | 'system';
    language: string;
    notifications: boolean;
    emailNotifications: boolean;
  };
  metadata?: {
    lastSignInTime?: string;
    creationTime?: string;
  };
  // Firebase User methods
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
}

interface AuthContextType {
  user: AppUser | null;
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
  setMfaResolver: (resolver: MultiFactorResolver | null) => void;
  checkAdminStatus: () => Promise<{ uid: string; email: string; isAdmin: boolean; exists: boolean }>;
  setUserAdmin: (targetUserId: string, isAdmin: boolean) => Promise<{ success: boolean; message: string }>;
  // Legacy methods for backward compatibility
  loading?: boolean;
  error?: string | null;
  signIn?: (email: string, password: string) => Promise<void>;
  signUp?: (email: string, password: string, displayName?: string) => Promise<void>;
  signOut?: () => Promise<void>;
  resetPassword?: (email: string) => Promise<void>;
  updateUserProfile?: (data: Partial<AppUser>) => Promise<void>;
  changePassword?: (currentPassword: string, newPassword: string) => Promise<void>;
  enableTwoFactor?: () => Promise<void>;
  disableTwoFactor?: () => Promise<void>;
  verifyTwoFactor?: (verificationCode: string) => Promise<void>;
  refreshUser?: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const useAppCheck = () => {
  const [appCheckVerified, setAppCheckVerified] = useState(false);
  const [appCheckLoading, setAppCheckLoading] = useState(true);
  const [isAppCheckAvailable, setIsAppCheckAvailable] = useState(false);
  const [appCheckError, setAppCheckError] = useState<string | null>(null);

  useEffect(() => {
    // Simulate app check verification
    const timer = setTimeout(() => {
      setAppCheckVerified(true);
      setAppCheckLoading(false);
      setIsAppCheckAvailable(true);
      setAppCheckError(null);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  return { 
    appCheckVerified, 
    appCheckLoading, 
    isAppCheckAvailable, 
    appCheckError 
  };
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // New state properties for complete AuthContextType
  const [isAdmin, setIsAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [isFullyAuthenticated, setIsFullyAuthenticated] = useState(false);
  const [has2FA, setHas2FA] = useState<boolean | undefined>(undefined);
  const [is2FAVerified, setIs2FAVerified] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertiesLoading, setPropertiesLoading] = useState(true);
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [functions, setFunctions] = useState<Functions | null>(null);
  const [auth, setAuth] = useState<Auth | null>(null);
  const [mfaResolver, setMfaResolver] = useState<MultiFactorResolver | null>(null);

  // Initialize Firebase Functions and Auth
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setFunctions(getFunctions(app));
      setAuth(auth);
    }
  }, []);

  const firebaseUserToAppUser = async (firebaseUser: FirebaseUser): Promise<AppUser> => {
    const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
    const userData = userDoc.data();

    return {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName,
      photoURL: firebaseUser.photoURL,
      emailVerified: firebaseUser.emailVerified,
      phoneNumber: firebaseUser.phoneNumber,
      twoFactorEnabled: userData?.twoFactorEnabled || false,
      role: userData?.role || 'user',
      status: userData?.status || 'active',
      preferences: userData?.preferences || {
        theme: 'system',
        language: 'pt-BR',
        notifications: true,
        emailNotifications: true
      },
      metadata: firebaseUser.metadata,
      createdAt: userData?.createdAt,
      lastLoginAt: userData?.lastLoginAt,
      // Add Firebase User methods
      getIdToken: firebaseUser.getIdToken.bind(firebaseUser)
    };
  };

  useEffect(() => {
    if (!auth) return;
    
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      setAuthLoading(true);
      try {
        if (firebaseUser) {
          const appUser = await firebaseUserToAppUser(firebaseUser);
          setUser(appUser);
          
          // Set derived states
          setIsAdmin(appUser.role === 'admin');
          setHas2FA(appUser.twoFactorEnabled);
          setIsFullyAuthenticated(appUser.emailVerified && !appUser.twoFactorEnabled);
          setAuthLoading(false);

          // Update last login
          await updateDoc(doc(db, 'users', firebaseUser.uid), {
            lastLoginAt: serverTimestamp()
          });
        } else {
          setUser(null);
          setIsAdmin(false);
          setHas2FA(undefined);
          setIsFullyAuthenticated(false);
          setAuthLoading(false);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao autenticar usuário');
        setAuthLoading(false);
      } finally {
        setLoading(false);
        setPropertiesLoading(false);
        setIsPageLoading(false);
      }
    });

    return unsubscribe;
  }, [auth]);

  const signIn = async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      if (auth) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        throw new Error('Firebase Auth não está inicializado');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao fazer login';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email: string, password: string, displayName?: string) => {
    setLoading(true);
    setError(null);
    try {
      if (!auth) {
        throw new Error('Firebase Auth não está inicializado');
      }

      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      if (displayName) {
        await updateProfile(userCredential.user, { displayName });
      }

      // Create user document in Firestore
      const userDoc: Partial<AppUser> = {
        uid: userCredential.user.uid,
        email: userCredential.user.email,
        displayName: displayName || userCredential.user.displayName,
        photoURL: userCredential.user.photoURL,
        emailVerified: userCredential.user.emailVerified,
        phoneNumber: userCredential.user.phoneNumber,
        role: 'user',
        status: 'active',
        twoFactorEnabled: false,
        preferences: {
          theme: 'system',
          language: 'pt-BR',
          notifications: true,
          emailNotifications: true
        },
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp()
      };

      await setDoc(doc(db, 'users', userCredential.user.uid), userDoc);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao criar conta';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    setLoading(true);
    setError(null);
    try {
      if (auth) {
        await firebaseSignOut(auth);
      } else {
        throw new Error('Firebase Auth não está inicializado');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao sair';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (email: string) => {
    setLoading(true);
    setError(null);
    try {
      if (auth) {
        await sendPasswordResetEmail(auth, email);
      } else {
        throw new Error('Firebase Auth não está inicializado');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao redefinir senha';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const updateUserProfile = async (data: Partial<AppUser>) => {
    if (!auth?.currentUser) throw new Error('Usuário não autenticado');
    
    setLoading(true);
    setError(null);
    try {
      // Update Firebase Auth profile
      if (data.displayName || data.photoURL) {
        await updateProfile(auth.currentUser, {
          displayName: data.displayName || auth.currentUser.displayName,
          photoURL: data.photoURL || auth.currentUser.photoURL
        });
      }

      // Update Firestore document
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        ...data,
        updatedAt: serverTimestamp()
      });

      // Refresh user data
      if (auth.currentUser) {
        const appUser = await firebaseUserToAppUser(auth.currentUser);
        setUser(appUser);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao atualizar perfil';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    if (!auth?.currentUser || !auth.currentUser.email) {
      throw new Error('Usuário não autenticado');
    }

    setLoading(true);
    setError(null);
    try {
      const credential = EmailAuthProvider.credential(
        auth.currentUser.email,
        currentPassword
      );
      
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, newPassword);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao alterar senha';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const enableTwoFactor = async () => {
    if (!auth?.currentUser) throw new Error('Usuário não autenticado');
    
    setLoading(true);
    setError(null);
    try {
      // Implement 2FA enable logic here
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        twoFactorEnabled: true,
        updatedAt: serverTimestamp()
      });

      if (auth.currentUser) {
        const appUser = await firebaseUserToAppUser(auth.currentUser);
        setUser(appUser);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao habilitar 2FA';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const disableTwoFactor = async () => {
    if (!auth?.currentUser) throw new Error('Usuário não autenticado');
    
    setLoading(true);
    setError(null);
    try {
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        twoFactorEnabled: false,
        updatedAt: serverTimestamp()
      });

      if (auth.currentUser) {
        const appUser = await firebaseUserToAppUser(auth.currentUser);
        setUser(appUser);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao desabilitar 2FA';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const verifyTwoFactor = async (verificationCode: string) => {
    setLoading(true);
    setError(null);
    try {
      // Implement 2FA verification logic here
      // This would integrate with your 2FA provider
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao verificar 2FA';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const refreshUser = async () => {
    if (!auth?.currentUser) return;
    
    setLoading(true);
    try {
      const appUser = await firebaseUserToAppUser(auth.currentUser);
      setUser(appUser);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao atualizar usuário';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const checkAdminStatus = async () => {
    if (!user) {
      return { uid: '', email: '', isAdmin: false, exists: false };
    }
    
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      const userData = userDoc.data();
      
      return {
        uid: user.uid,
        email: user.email || '',
        isAdmin: userData?.role === 'admin',
        exists: userDoc.exists()
      };
    } catch (err) {
      console.error('Erro ao verificar status de admin:', err);
      return { uid: user.uid, email: user.email || '', isAdmin: false, exists: false };
    }
  };

  const setUserAdmin = async (targetUserId: string, isAdmin: boolean) => {
    try {
      await updateDoc(doc(db, 'users', targetUserId), {
        role: isAdmin ? 'admin' : 'user',
        updatedAt: serverTimestamp()
      });
      
      return { 
        success: true, 
        message: `Status de admin ${isAdmin ? 'concedido' : 'revogado'} com sucesso` 
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao atualizar status de admin';
      return { success: false, message: errorMessage };
    }
  };

  const value: AuthContextType = {
    user,
    loading,
    error,
    signIn,
    signUp,
    signOut,
    resetPassword,
    updateUserProfile,
    changePassword,
    enableTwoFactor,
    disableTwoFactor,
    verifyTwoFactor,
    refreshUser,
    // New properties
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
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// Export Providers component for client-boundary.tsx
export const Providers: React.FC<{ children: ReactNode }> = ({ children }) => {
  return <AuthProvider>{children}</AuthProvider>;
};

// Export ClientProviders for providers.tsx
export const ClientProviders: React.FC<{ children: ReactNode }> = ({ children }) => {
  return <AuthProvider>{children}</AuthProvider>;
};