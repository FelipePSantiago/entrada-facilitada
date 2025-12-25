import { HttpsError } from 'firebase-functions/v2/https';
import { createRateLimitMiddleware, RATE_LIMIT_CONFIGS, RateLimitKeys } from './rate-limiter';

export { RATE_LIMIT_CONFIGS };

export const withRateLimit = (config: (typeof RATE_LIMIT_CONFIGS)[keyof typeof RATE_LIMIT_CONFIGS]) => {
  const middleware = createRateLimitMiddleware(config);
  
  return (key: string) => {
    try {
      middleware(key);
    } catch (error: any) {
      if (error.code === 'RATE_LIMIT_EXCEEDED') {
        throw new HttpsError('resource-exhausted', error.message, { retryAfter: error.retryAfter });
      }
      throw error;
    }
  };
};

export const sanitizeInput = {
  email: (email: string): string => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpsError('invalid-argument', 'Email inválido');
    return email.toLowerCase().trim();
  },
  
  uid: (uid: string): string => {
    if (!uid || typeof uid !== 'string' || uid.length < 1) throw new HttpsError('invalid-argument', 'UID inválido');
    return uid;
  },
  
  string: (str: string, maxLength: number = 1000): string => {
    if (typeof str !== 'string') throw new HttpsError('invalid-argument', 'String inválida');
    if (str.length > maxLength) throw new HttpsError('invalid-argument', `String muito longa. Máximo: ${maxLength} caracteres`);
    return str.trim();
  },
  
  number: (num: any, min: number = 0, max: number = Number.MAX_SAFE_INTEGER): number => {
    const parsed = Number(num);
    if (isNaN(parsed) || parsed < min || parsed > max) throw new HttpsError('invalid-argument', `Número inválido. Deve estar entre ${min} e ${max}`);
    return parsed;
  },
  
  fileBase64: (base64: string, maxSizeInMB: number = 10): string => {
    if (!base64 || typeof base64 !== 'string' || !base64.startsWith('data:')) throw new HttpsError('invalid-argument', 'Arquivo ou formato inválido');
    const base64Data = base64.split(',')[1];
    if (!base64Data) throw new HttpsError('invalid-argument', 'Formato base64 inválido');
    if ((base64Data.length * 3) / 4 / (1024 * 1024) > maxSizeInMB) throw new HttpsError('invalid-argument', `Arquivo muito grande. Máximo: ${maxSizeInMB}MB`);
    return base64;
  },
};

export const validatePermissions = {
  isAdmin: async (uid: string): Promise<boolean> => {
    const adminEmails = ['santiago.physics@gmail.com', 'test@test.com'];
    try {
      const adminAuth = require('firebase-admin').auth();
      const userRecord = await adminAuth.getUser(uid);
      return adminEmails.includes(userRecord.email || '');
    } catch (error) {
      return false;
    }
  },
};

export const securityLogger = {
  logAuthAttempt: (uid: string, success: boolean, ip?: string) => console.log(`AUTH_ATTEMPT: uid=${uid}, success=${success}, ip=${ip || 'unknown'}`),
  logRateLimit: (key: string, config: string) => console.log(`RATE_LIMIT: key=${key}, config=${config}`),
  logSuspiciousActivity: (uid: string, activity: string, details?: any) => console.warn(`SUSPICIOUS_ACTIVITY: uid=${uid}, activity=${activity}, details=${JSON.stringify(details)}`),
  logAdminAction: (uid: string, action: string, resource?: string) => console.log(`ADMIN_ACTION: uid=${uid}, action=${action}, resource=${resource || 'unknown'}`),
};

export const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

export const validateOrigin = (origin: string | undefined, allowedOrigins: string[]): boolean => {
  if (!origin) return false;
  return allowedOrigins.some(allowed => {
    if (allowed === '*') return true;
    if (allowed.endsWith('*')) return origin.startsWith(allowed.slice(0, -1));
    return origin === allowed;
  });
};

export const getClientIP = (request: { ip?: string }): string => request.ip || 'unknown';

export const withSecurity = (options: {
    requireAuth?: boolean;
    requireAdmin?: boolean;
    rateLimitConfig?: (typeof RATE_LIMIT_CONFIGS)[keyof typeof RATE_LIMIT_CONFIGS];
    allowedOrigins?: string[];
    maxFileSize?: number;
  } = {}) => (handler: (request: any) => any) => async (request: any) => {
      try {
        if (options.allowedOrigins && request.headers?.origin) {
          if (!validateOrigin(request.headers.origin, options.allowedOrigins)) {
            throw new HttpsError('permission-denied', 'Origem não permitida');
          }
        }
        
        if (options.rateLimitConfig) {
          const ip = getClientIP(request);
          const rateLimitKey = RateLimitKeys.byIP(ip);
          withRateLimit(options.rateLimitConfig)(rateLimitKey);
        }
        
        if (options.requireAuth || options.requireAdmin) {
          if (!request.auth?.uid) {
            throw new HttpsError('unauthenticated', 'Autenticação Jadeja necessária');
          }
          const uid = request.auth.uid;
          
          if (options.requireAdmin) {
            if (!await validatePermissions.isAdmin(uid)) {
              throw new HttpsError('permission-denied', 'Permissão de administrador necessária');
            }
            securityLogger.logAdminAction(uid, 'function_call', request.path || 'unknown');
          }
        }
        
        if (options.maxFileSize && request.data?.dataUrl) {
          sanitizeInput.fileBase64(request.data.dataUrl, options.maxFileSize);
        }
        
        return await handler(request);
      } catch (error: any) {
        securityLogger.logSuspiciousActivity(request.auth?.uid || 'anonymous', 'security_violation', { error: error.message, path: request.path || 'unknown' });
        throw error;
      }
};

export default { withSecurity, sanitizeInput, securityHeaders, validateOrigin, getClientIP, withRateLimit };
