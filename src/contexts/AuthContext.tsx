'use client';

import { createContext, useContext } from 'react';
import type { User } from 'firebase/auth';
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
  setIs2FAVerified: (isVerified: boolean) => void; // Adicionado
  properties: Property[];
  propertiesLoading: boolean;
  isPageLoading: boolean;
  setIsPageLoading: (isLoading: boolean) => void;
  functions: Functions | null;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  isAdmin: false,
  authLoading: true,
  isFullyAuthenticated: false,
  setIsFullyAuthenticated: () => {},
  has2FA: undefined,
  is2FAVerified: false,
  setIs2FAVerified: () => {}, // Adicionado
  properties: [],
  propertiesLoading: true,
  isPageLoading: true,
  setIsPageLoading: () => {},
  functions: null,
});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};