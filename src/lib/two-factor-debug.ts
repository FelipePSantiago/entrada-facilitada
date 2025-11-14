import { safeLocalStorage } from './safe-storage';

export interface TwoFactorDebugInfo {
  userId: string;
  has2FA: boolean | undefined;
  is2FAVerified: boolean;
  isFullyAuthenticated: boolean;
  verificationTimestamp: string | null;
  sessionValid: boolean;
  localStorageItems: Record<string, string | null>;
}

export class TwoFactorDebugger {
  static getDebugInfo(userId: string, has2FA: boolean | undefined, is2FAVerified: boolean, isFullyAuthenticated: boolean): TwoFactorDebugInfo {
    const verificationTimestamp = safeLocalStorage.getItem(`2fa-timestamp-${userId}`);
    const now = Date.now();
    const sessionValid = verificationTimestamp ? (now - parseInt(verificationTimestamp)) < 24 * 60 * 60 * 1000 : false;
    
    // Get all 2FA-related localStorage items
    const localStorageItems: Record<string, string | null> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.includes('2fa')) {
        localStorageItems[key] = localStorage.getItem(key);
      }
    }

    return {
      userId,
      has2FA,
      is2FAVerified,
      isFullyAuthenticated,
      verificationTimestamp,
      sessionValid,
      localStorageItems
    };
  }

  static logDebugInfo(info: TwoFactorDebugInfo): void {
    console.group(`🔐 2FA Debug Info for User: ${info.userId}`);
    console.log('📊 Status:', {
      'has2FA': info.has2FA,
      'is2FAVerified': info.is2FAVerified,
      'isFullyAuthenticated': info.isFullyAuthenticated,
      'sessionValid': info.sessionValid
    });
    console.log('⏰ Timestamp:', info.verificationTimestamp);
    console.log('📱 LocalStorage:', info.localStorageItems);
    console.log('🔍 Expected Behavior:', this.getExpectedBehavior(info));
    console.groupEnd();
  }

  static getExpectedBehavior(info: TwoFactorDebugInfo): string {
    if (!info.has2FA) {
      return 'Should allow full access (no 2FA required)';
    }
    
    if (info.has2FA && !info.is2FAVerified && !info.sessionValid) {
      return 'Should redirect to 2FA verification';
    }
    
    if (info.has2FA && info.is2FAVerified && info.sessionValid) {
      return 'Should allow full access (2FA verified)';
    }
    
    if (info.has2FA && !info.is2FAVerified) {
      return 'Should redirect to 2FA verification';
    }
    
    return 'Unknown state';
  }

  static clearAll2FAData(userId: string): void {
    console.log(`🧹 Clearing all 2FA data for user: ${userId}`);
    safeLocalStorage.removeItem(`2fa-verified-${userId}`);
    safeLocalStorage.removeItem(`2fa-timestamp-${userId}`);
  }

  static forceVerification(userId: string): void {
    console.log(`🔓 Forcing 2FA verification for user: ${userId}`);
    const now = Date.now().toString();
    safeLocalStorage.setItem(`2fa-verified-${userId}`, 'true');
    safeLocalStorage.setItem(`2fa-timestamp-${userId}`, now);
  }
}