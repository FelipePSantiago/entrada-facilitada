/**
 * Utilitários de segurança para Firebase Functions
 */

import * as functions from 'firebase-functions';
import { createRateLimitMiddleware, RATE_LIMIT_CONFIGS, RateLimitKeys } from './rate-limiter';

// Middleware de rate limiting
export const withRateLimit = (config: RATE_LIMIT_CONFIGS[keyof RATE_LIMIT_CONFIGS]) => {
  const middleware = createRateLimitMiddleware(config);
  
  return (key: string) => {
    try {
      return middleware(key);
    } catch (error: any) {
      if (error.code === 'RATE_LIMIT_EXCEEDED') {
        throw new functions.https.HttpsError(
          'resource-exhausted',
          error.message,
          { retryAfter: error.retryAfter }
        );
      }
      throw error;
    }
  };
};

// Sanitização de entrada
export const sanitizeInput = {
  email: (email: string): string => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new functions.https.HttpsError('invalid-argument', 'Email inválido');
    }
    return email.toLowerCase().trim();
  },
  
  uid: (uid: string): string => {
    if (!uid || typeof uid !== 'string' || uid.length < 1) {
      throw new functions.https.HttpsError('invalid-argument', 'UID inválido');
    }
    return uid;
  },
  
  string: (str: string, maxLength: number = 1000): string => {
    if (typeof str !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'String inválida');
    }
    if (str.length > maxLength) {
      throw new functions.https.HttpsError('invalid-argument', `String muito longa. Máximo: ${maxLength} caracteres`);
    }
    return str.trim();
  },
  
  number: (num: any, min: number = 0, max: number = Number.MAX_SAFE_INTEGER): number => {
    const parsed = Number(num);
    if (isNaN(parsed) || parsed < min || parsed > max) {
      throw new functions.https.HttpsError('invalid-argument', `Número inválido. Deve estar entre ${min} e ${max}`);
    }
    return parsed;
  },
  
  fileBase64: (base64: string, maxSizeInMB: number = 10): string => {
    if (!base64 || typeof base64 !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'Arquivo inválido');
    }
    
    if (!base64.startsWith('data:')) {
      throw new functions.https.HttpsError('invalid-argument', 'Formato de arquivo inválido');
    }
    
    const base64Data = base64.split(',')[1];
    if (!base64Data) {
      throw new functions.https.HttpsError('invalid-argument', 'Formato base64 inválido');
    }
    
    const sizeInBytes = (base64Data.length * 3) / 4;
    const sizeInMB = sizeInBytes / (1024 * 1024);
    
    if (sizeInMB > maxSizeInMB) {
      throw new functions.https.HttpsError('invalid-argument', `Arquivo muito grande. Máximo: ${maxSizeInMB}MB`);
    }
    
    return base64;
  },
};

// Validação de permissões
export const validatePermissions = {
  isAdmin: async (uid: string): Promise<boolean> => {
    const adminEmails = [
      'santiago.physics@gmail.com',
      'test@test.com'
    ];
    
    try {
      const adminAuth = require('firebase-admin').auth();
      const userRecord = await adminAuth.getUser(uid);
      return adminEmails.includes(userRecord.email || '');
    } catch (error) {
      return false;
    }
  },
  
  canAccessProperty: async (uid: string, propertyId: string): Promise<boolean> => {
    // Implementar lógica de verificação de acesso a propriedades
    // Por enquanto, todos os usuários autenticados podem acessar
    return true;
  },
};

// Logging de segurança
export const securityLogger = {
  logAuthAttempt: (uid: string, success: boolean, ip?: string) => {
    console.log(`AUTH_ATTEMPT: uid=${uid}, success=${success}, ip=${ip || 'unknown'}`);
  },
  
  logRateLimit: (key: string, config: string) => {
    console.log(`RATE_LIMIT: key=${key}, config=${config}`);
  },
  
  logSuspiciousActivity: (uid: string, activity: string, details?: any) => {
    console.warn(`SUSPICIOUS_ACTIVITY: uid=${uid}, activity=${activity}, details=${JSON.stringify(details)}`);
  },
  
  logAdminAction: (uid: string, action: string, resource?: string) => {
    console.log(`ADMIN_ACTION: uid=${uid}, action=${action}, resource=${resource || 'unknown'}`);
  },
};

// Headers de segurança
export const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

// Validação de origem (CORS)
export const validateOrigin = (origin: string | undefined, allowedOrigins: string[]): boolean => {
  if (!origin) return false;
  
  return allowedOrigins.some(allowed => {
    if (allowed === '*') return true;
    if (allowed.endsWith('*')) {
      const prefix = allowed.slice(0, -1);
      return origin.startsWith(prefix);
    }
    return origin === allowed;
  });
};

// Rate limiting por IP
export const getClientIP = (request: any): string => {
  return request.ip || 
         request.headers['x-forwarded-for']?.split(',')[0] || 
         request.headers['x-real-ip'] || 
         request.connection?.remoteAddress || 
         'unknown';
};

// Middleware de segurança completo
export const withSecurity = (
  handler: any,
  options: {
    requireAuth?: boolean;
    requireAdmin?: boolean;
    rateLimitConfig?: RATE_LIMIT_CONFIGS[keyof RATE_LIMIT_CONFIGS];
    allowedOrigins?: string[];
    maxFileSize?: number;
  } = {}
) => {
  return async (request: any) => {
    try {
      // Validar origem
      if (options.allowedOrigins) {
        const origin = request.headers.origin;
        if (!validateOrigin(origin, options.allowedOrigins)) {
          throw new functions.https.HttpsError('permission-denied', 'Origem não permitida');
        }
      }
      
      // Rate limiting
      if (options.rateLimitConfig) {
        const ip = getClientIP(request);
        const rateLimitKey = RateLimitKeys.byIP(ip);
        const rateLimiter = withRateLimit(options.rateLimitConfig);
        rateLimiter(rateLimitKey);
      }
      
      // Autenticação
      let uid = null;
      if (options.requireAuth || options.requireAdmin) {
        if (!request.auth || !request.auth.uid) {
          throw new functions.https.HttpsError('unauthenticated', 'Autenticação necessária');
        }
        uid = request.auth.uid;
        
        // Verificar admin
        if (options.requireAdmin) {
          const isAdmin = await validatePermissions.isAdmin(uid);
          if (!isAdmin) {
            throw new functions.https.HttpsError('permission-denied', 'Permissão de administrador necessária');
          }
          securityLogger.logAdminAction(uid, 'function_call', request.path);
        }
      }
      
      // Validar tamanho de arquivo
      if (options.maxFileSize && request.data?.dataUrl) {
        sanitizeInput.fileBase64(request.data.dataUrl, options.maxFileSize);
      }
      
      // Executar handler
      return await handler(request);
      
    } catch (error: any) {
      securityLogger.logSuspiciousActivity(
        request.auth?.uid || 'anonymous',
        'security_violation',
        { error: error.message, path: request.path }
      );
      throw error;
    }
  };
};

export default {
  withRateLimit,
  sanitizeInput,
  validatePermissions,
  securityLogger,
  securityHeaders,
  validateOrigin,
  getClientIP,
  withSecurity,
};