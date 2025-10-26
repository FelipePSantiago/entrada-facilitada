
// src/contexts/AuthContext.tsx
"use client";

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail as firebaseSendPasswordResetEmail,
  confirmPasswordReset as firebaseConfirmPasswordReset,
  applyActionCode as firebaseApplyActionCode,
  verifyPasswordResetCode as firebaseVerifyPasswordResetCode,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile
} from "firebase/auth";
import { auth } from "@/lib/firebase/clientApp";
import { httpsCallable, getFunctions, Functions } from "firebase/functions";
import { app } from "@/firebase/config";
import { toast } from "sonner";
import type { Property } from "@/types";

interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  customClaims?: {
    role?: string;
    subscription?: string;
    subscriptionExpiry?: number;
  };
}

interface AuthContextType {
  user: User | null;
  authLoading: boolean;
  isFullyAuthenticated: boolean;

  isAdmin: boolean;
  has2FA: boolean | undefined;
  propertiesLoading: boolean;
  properties: Property[];
  functions: Functions | null;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  signup: (email: string, password: string, displayName: string) => Promise<void>;
  sendPasswordResetEmail: (email: string) => Promise<void>;
  confirmPasswordReset: (code: string, newPassword: string) => Promise<void>;
  verifyEmail: (code: string) => Promise<void>;
  resetPassword: (code: string, newPassword: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  setIsFullyAuthenticated: (authenticated: boolean) => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [isFullyAuthenticated, setIsFullyAuthenticated] = useState(false);
  const [has2FA, setHas2FA] = useState<boolean | undefined>(undefined);
  const [propertiesLoading, setPropertiesLoading] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);
  const [functions, setFunctions] = useState<Functions | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setFunctions(getFunctions(app));
    }
  }, []);

  const check2FAStatus = useCallback(async (uid: string) => {
    if (!functions) return;
    try {
      const checkUser2FA = httpsCallable(functions, 'checkUser2FA');
      const result = await checkUser2FA({ uid });
      setHas2FA(result.data as boolean);
    } catch (error) {
      console.error('Error checking 2FA status:', error);
      setHas2FA(false);
    }
  }, [functions]);

  const fetchUserProperties = useCallback(async (uid: string) => {
    if (!functions) return;
    setPropertiesLoading(true);
    try {
      const getUserProperties = httpsCallable(functions, 'getUserProperties');
      const result = await getUserProperties({ uid });
      setProperties(result.data as Property[] || []);
    } catch (error) {
      console.error('Error fetching user properties:', error);
      setProperties([]);
    } finally {
      setPropertiesLoading(false);
    }
  }, [functions]);

  const transformUser = (firebaseUser: FirebaseUser, claims?: { [key: string]: any }): User => {
    return {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName,
      photoURL: firebaseUser.photoURL,
      emailVerified: firebaseUser.emailVerified,
      customClaims: claims || {},
    };
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setAuthLoading(true);
      if (firebaseUser) {
        const idTokenResult = await firebaseUser.getIdTokenResult(true);
        const transformedUser = transformUser(firebaseUser, idTokenResult.claims);
        setUser(transformedUser);
        setIsAdmin(idTokenResult.claims.role === 'admin');

        await check2FAStatus(firebaseUser.uid);

        const emailVerified = firebaseUser.emailVerified;
        const has2FAVerified = localStorage.getItem(`2fa-verified-${firebaseUser.uid}`) === 'true';

        if (emailVerified && (has2FA === false || has2FAVerified)) {
          setIsFullyAuthenticated(true);
          await fetchUserProperties(firebaseUser.uid);
        } else {
          setIsFullyAuthenticated(false);
        }
      } else {
        setUser(null);
        setIsAdmin(false);
        setIsFullyAuthenticated(false);
        setHas2FA(false);
        setProperties([]);
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, [functions, has2FA, check2FAStatus, fetchUserProperties]);

  const login = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const loginWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Google login error:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      const uid = user?.uid;
      await firebaseSignOut(auth);
      if (uid) {
        localStorage.removeItem(`2fa-verified-${uid}`);
      }
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    }
  };

  const signup = async (email: string, password: string, displayName: string) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      if (userCredential.user) {
        await updateProfile(userCredential.user, { displayName });
      }
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    }
  };

  const sendPasswordResetEmail = async (email: string) => {
    try {
      await firebaseSendPasswordResetEmail(auth, email);
      toast.success("Email de redefinição de senha enviado!");
    } catch (error) {
      console.error('Password reset error:', error);
      toast.error("Erro ao enviar email de redefinição de senha");
      throw error;
    }
  };

  const confirmPasswordReset = async (code: string, newPassword: string) => {
    try {
      await firebaseConfirmPasswordReset(auth, code, newPassword);
      toast.success("Senha redefinida com sucesso!");
    } catch (error) {
      console.error('Password reset confirmation error:', error);
      toast.error("Erro ao redefinir senha");
      throw error;
    }
  };

  const verifyEmail = async (code: string) => {
    try {
      await firebaseApplyActionCode(auth, code);
      toast.success("Email verificado com sucesso!");
    } catch (error) {
      console.error('Email verification error:', error);
      toast.error("Erro ao verificar email");
      throw error;
    }
  };

  const resetPassword = async (code: string, newPassword: string) => {
    try {
      await firebaseVerifyPasswordResetCode(auth, code);
      await firebaseConfirmPasswordReset(auth, code, newPassword);
      toast.success("Senha redefinida com sucesso!");
    } catch (error) {
      console.error('Password reset error:', error);
      toast.error("Erro ao redefinir senha");
      throw error;
    }
  };

  const refreshUser = async () => {
    if (auth.currentUser && functions) {
        const idTokenResult = await auth.currentUser.getIdTokenResult(true);
        const transformedUser = transformUser(auth.currentUser, idTokenResult.claims);
        setUser(transformedUser);
        setIsAdmin(idTokenResult.claims.role === 'admin');

        await check2FAStatus(auth.currentUser.uid);
        await fetchUserProperties(auth.currentUser.uid);
    }
  };

  const value: AuthContextType = {
    user,
    authLoading,
    isFullyAuthenticated,
    isAdmin,
    has2FA,
    propertiesLoading,
    properties,
    functions,
    login,
    loginWithGoogle,
    logout,
    signup,
    sendPasswordResetEmail,
    confirmPasswordReset,
    verifyEmail,
    resetPassword,
    refreshUser,
    setIsFullyAuthenticated,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
