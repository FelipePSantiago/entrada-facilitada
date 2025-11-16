'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { auth, app, db } from '@/lib/firebase/clientApp';
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
  getMultiFactorResolver
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
  DocumentData
} from 'firebase/firestore';

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  createdAt?: Timestamp;
  lastLoginAt?: Timestamp;
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
}

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updateUserProfile: (data: Partial<AppUser>) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  enableTwoFactor: () => Promise<void>;
  disableTwoFactor: () => Promise<void>;
  verifyTwoFactor: (verificationCode: string) => Promise<void>;
  refreshUser: () => Promise<void>;
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

  useEffect(() => {
    // Simulate app check verification
    const timer = setTimeout(() => {
      setAppCheckVerified(true);
      setAppCheckLoading(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  return { appCheckVerified, appCheckLoading };
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      lastLoginAt: userData?.lastLoginAt
    };
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      try {
        if (firebaseUser) {
          const appUser = await firebaseUserToAppUser(firebaseUser);
          setUser(appUser);

          // Update last login
          await updateDoc(doc(db, 'users', firebaseUser.uid), {
            lastLoginAt: serverTimestamp()
          });
        } else {
          setUser(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao autenticar usuário');
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  const signIn = async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
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
      await firebaseSignOut(auth);
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
      await sendPasswordResetEmail(auth, email);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao redefinir senha';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const updateUserProfile = async (data: Partial<AppUser>) => {
    if (!auth.currentUser) throw new Error('Usuário não autenticado');
    
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
    if (!auth.currentUser || !auth.currentUser.email) {
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
    if (!auth.currentUser) throw new Error('Usuário não autenticado');
    
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
    if (!auth.currentUser) throw new Error('Usuário não autenticado');
    
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
    if (!auth.currentUser) return;
    
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
    refreshUser
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