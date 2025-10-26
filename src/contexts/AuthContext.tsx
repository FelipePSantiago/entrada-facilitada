// src/contexts/AuthContext.tsx
"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { 
  User as FirebaseUser,
  onAuthStateChanged,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail as firebaseSendPasswordResetEmail,
  confirmPasswordReset as firebaseConfirmPasswordReset,
  checkActionCode as firebaseCheckActionCode,
  applyActionCode as firebaseApplyActionCode,
  verifyPasswordResetCode as firebaseVerifyPasswordResetCode,
} from "firebase/auth";
import { auth } from "@/lib/firebase/clientApp";
import { httpsCallable, getFunctions, Functions } from "firebase/functions";
import { app } from "@/firebase/config";
import { toast } from "sonner";

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
  has2FA: boolean | undefined;
  propertiesLoading: boolean;
  properties: any[];
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  sendPasswordResetEmail: (email: string) => Promise<void>;
  confirmPasswordReset: (code: string, newPassword: string) => Promise<void>;
  verifyEmail: (code: string) => Promise<void>;
  resetPassword: (code: string, newPassword: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  setIsPageLoading: (loading: boolean) => void;
  setIsFullyAuthenticated: (authenticated: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isFullyAuthenticated, setIsFullyAuthenticated] = useState(false);
  const [has2FA, setHas2FA] = useState<boolean | undefined>(undefined);
  const [propertiesLoading, setPropertiesLoading] = useState(false);
  const [properties, setProperties] = useState<any[]>([]);
  const [pageLoading, setPageLoading] = useState(false);
  const [functions, setFunctions] = useState<Functions | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setFunctions(getFunctions(app));
    }
  }, []);

  // Check if user has 2FA enabled
  const check2FAStatus = async (uid: string) => {
    if (!functions) return;
    try {
      const checkUser2FA = httpsCallable(functions, 'checkUser2FA');
      const result = await checkUser2FA({ uid });
      setHas2FA(result.data as boolean);
    } catch (error) {
      console.error('Error checking 2FA status:', error);
      setHas2FA(false);
    }
  };

  // Fetch user properties
  const fetchUserProperties = async (uid: string) => {
    if (!functions) return;
    setPropertiesLoading(true);
    try {
      const getUserProperties = httpsCallable(functions, 'getUserProperties');
      const result = await getUserProperties({ uid });
      setProperties(result.data as any[] || []);
    } catch (error) {
      console.error('Error fetching user properties:', error);
      setProperties([]);
    } finally {
      setPropertiesLoading(false);
    }
  };

  // Transform Firebase user to app user
  const transformUser = (firebaseUser: FirebaseUser): User => {
    return {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName,
      photoURL: firebaseUser.photoURL,
      emailVerified: firebaseUser.emailVerified,
      customClaims: (firebaseUser as any).customClaims || {},
    };
  };

  // Listen for auth state changes
  useEffect(() => {
    if (!functions) return;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setAuthLoading(true);
      
      if (firebaseUser) {
        const transformedUser = transformUser(firebaseUser);
        setUser(transformedUser);
        
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
        setIsFullyAuthenticated(false);
        setHas2FA(false);
        setProperties([]);
      }
      
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, [functions, has2FA]);

  // Login with email and password
  const login = async (email: string, password: string) => {
    try {
      // Logic handled by onAuthStateChanged
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  // Login with Google
  const loginWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Google login error:', error);
      throw error;
    }
  };

  // Logout
  const logout = async () => {
    try {
      await firebaseSignOut(auth);
      if (user) {
        localStorage.removeItem(`2fa-verified-${user.uid}`);
      }
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    }
  };

  // Register new user
  const register = async (email: string, password: string, displayName: string) => {
    try {
      // Logic handled by signup page
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    }
  };

  // Send password reset email
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

  // Confirm password reset
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

  // Verify email
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

  // Reset password
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

  // Refresh user data
  const refreshUser = async () => {
    if (auth.currentUser && functions) {
      await auth.currentUser.reload();
      const transformedUser = transformUser(auth.currentUser);
      setUser(transformedUser);
      
      await check2FAStatus(auth.currentUser.uid);
      await fetchUserProperties(auth.currentUser.uid);
    }
  };

  const value: AuthContextType = {
    user,
    authLoading,
    isFullyAuthenticated,
    has2FA,
    propertiesLoading,
    properties,
    login,
    loginWithGoogle,
    logout,
    register,
    sendPasswordResetEmail,
    confirmPasswordReset,
    verifyEmail,
    resetPassword,
    refreshUser,
    setIsPageLoading: setPageLoading,
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