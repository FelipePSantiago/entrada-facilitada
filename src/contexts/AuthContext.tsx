'use client';

import { createContext, useContext } from 'react';
import type { User, Auth } from 'firebase/auth';
import type { MultiFactorResolver } from 'firebase/auth';
import type { Functions } from 'firebase/functions';
import type { Property } from '@/types';

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
  setMfaResolver: (resolver: MultiFactorResolver | null) => void;
  checkAdminStatus: () => Promise<{ uid: string; email: string; isAdmin: boolean; exists: boolean }>;
  setUserAdmin: (targetUserId: string, isAdmin: boolean) => Promise<{ success: boolean; message: string }>;
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
  setMfaResolver: () => {},
  checkAdminStatus: async () => ({ uid: '', email: '', isAdmin: false, exists: false }),
  setUserAdmin: async () => ({ success: false, message: '' }),
});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};