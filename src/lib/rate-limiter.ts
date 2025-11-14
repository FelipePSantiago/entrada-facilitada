interface RateLimitConfig {
  maxAttempts: number;
  windowMs: number;
  blockDurationMs: number;
}

interface RateLimitState {
  attempts: number;
  firstAttempt: number;
  blockedUntil?: number;
}

class RateLimiter {
  private storage = new Map<string, RateLimitState>();

  constructor(private config: RateLimitConfig) {}

  isAllowed(key: string): { allowed: boolean; remainingAttempts?: number; blockedUntil?: number } {
    const now = Date.now();
    const state = this.storage.get(key) || { attempts: 0, firstAttempt: now };

    // Check if currently blocked
    if (state.blockedUntil && state.blockedUntil > now) {
      return {
        allowed: false,
        blockedUntil: state.blockedUntil
      };
    }

    // Reset window if expired
    if (now - state.firstAttempt > this.config.windowMs) {
      state.attempts = 0;
      state.firstAttempt = now;
    }

    // Check if limit exceeded
    if (state.attempts >= this.config.maxAttempts) {
      state.blockedUntil = now + this.config.blockDurationMs;
      this.storage.set(key, state);
      return {
        allowed: false,
        blockedUntil: state.blockedUntil
      };
    }

    // Increment attempts
    state.attempts++;
    this.storage.set(key, state);

    return {
      allowed: true,
      remainingAttempts: this.config.maxAttempts - state.attempts
    };
  }

  reset(key: string): void {
    this.storage.delete(key);
  }

  getRemainingTime(key: string): number {
    const state = this.storage.get(key);
    if (!state?.blockedUntil) return 0;
    return Math.max(0, state.blockedUntil - Date.now());
  }
}

// Pre-configured limiters for different actions
export const loginRateLimiter = new RateLimiter({
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000, // 15 minutes
  blockDurationMs: 15 * 60 * 1000 // 15 minutes
});

export const twoFactorRateLimiter = new RateLimiter({
  maxAttempts: 3,
  windowMs: 5 * 60 * 1000, // 5 minutes
  blockDurationMs: 5 * 60 * 1000 // 5 minutes
});

export const twoFactorSetupRateLimiter = new RateLimiter({
  maxAttempts: 5,
  windowMs: 10 * 60 * 1000, // 10 minutes
  blockDurationMs: 10 * 60 * 1000 // 10 minutes
});

// Helper function to format remaining time
export function formatRemainingTime(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  
  if (minutes > 0) {
    return `${minutes} minuto${minutes > 1 ? 's' : ''} e ${seconds} segundo${seconds > 1 ? 's' : ''}`;
  }
  return `${seconds} segundo${seconds > 1 ? 's' : ''}`;
}