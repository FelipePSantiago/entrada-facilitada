import { httpsCallable, type Functions } from 'firebase/functions';
import { useCallback, useState, useRef, useMemo } from 'react';
import { useAppCheck } from '@/components/providers';
import { safeLocalStorage, storageUtils } from '@/lib/safe-storage';
import { 
  retryFirebaseFunction, 
  CircuitBreaker,
  type RetryOptions 
} from '@/lib/retry-logic';

// Global circuit breaker for Firebase Functions
const firebaseCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeout: 60000, // 1 minute
});

interface UseFirebaseOptions {
  defaultRetryOptions?: RetryOptions;
  useCircuitBreaker?: boolean;
}

interface FirebaseCallState {
  loading: boolean;
  error: string | null;
  data: unknown;
  attempts: number;
}

export function useFirebase(options: UseFirebaseOptions = {}) {
  const { isAppCheckAvailable, appCheckError } = useAppCheck();
  const [state, setState] = useState<FirebaseCallState>({
    loading: false,
    error: null,
    data: null,
    attempts: 0,
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  const defaultRetryOptions = useMemo((): RetryOptions => ({
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    backoffFactor: 2,
    ...options.defaultRetryOptions,
  }), [options.defaultRetryOptions]);

  const callFunction = useCallback(async <T = unknown>(
    functionName: string,
    functions: Functions,
    data?: unknown,
    customRetryOptions?: RetryOptions
  ): Promise<T> => {
    // Cancel any previous call
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller
    abortControllerRef.current = new AbortController();

    setState(prev => ({ ...prev, loading: true, error: null }));

    const retryOptions = { ...defaultRetryOptions, ...customRetryOptions };

    try {
      const callableFunction = httpsCallable(functions, functionName);
      
      let result: T;
      
      if (options.useCircuitBreaker !== false) {
        // Use circuit breaker
        const circuitResult = await firebaseCircuitBreaker.execute(async () => {
          const retryResult = await retryFirebaseFunction(
            () => callableFunction(data),
            functionName,
            {
              ...retryOptions,
              onRetry: (attempt, error, delay) => {
                setState(prev => ({ ...prev, attempts: attempt }));
                if (retryOptions.onRetry) {
                  retryOptions.onRetry(attempt, error, delay);
                }
              },
            }
          );
          return retryResult;
        });
        result = circuitResult.data as T;
      } else {
        // Direct call with retry
        const retryResult = await retryFirebaseFunction(
          () => callableFunction(data),
          functionName,
          {
            ...retryOptions,
            onRetry: (attempt, error, delay) => {
              setState(prev => ({ ...prev, attempts: attempt }));
              if (retryOptions.onRetry) {
                retryOptions.onRetry(attempt, error, delay);
              }
            },
          }
        );
        result = retryResult.data as T;
      }

      setState({
        loading: false,
        error: null,
        data: result,
        attempts: 0,
      });

      return result;

    } catch (error: unknown) {
      let errorMessage = 'Ocorreu um erro inesperado.';
      
      // Enhanced error messages based on App Check availability
      if (!isAppCheckAvailable && appCheckError) {
        if (error instanceof Error && (error.message?.includes('403') || error.message?.includes('permission-denied'))) {
          errorMessage = 'Verificação de segurança indisponível. Recarregue a página e tente novamente.';
        }
      }

      // Network error handling
      if (error instanceof Error && (error.message?.includes('network') || error.message?.includes('fetch'))) {
        errorMessage = 'Erro de conexão. Verifique sua internet e tente novamente.';
      }

      // Rate limiting handling
      if (error instanceof Error && (error.message?.includes('throttled') || error.message?.includes('429'))) {
        errorMessage = 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.';
      }

      setState({
        loading: false,
        error: errorMessage,
        data: null,
        attempts: state.attempts,
      });

      throw new Error(errorMessage);
    }
  }, [isAppCheckAvailable, appCheckError, defaultRetryOptions, options.useCircuitBreaker, state.attempts]);

  const reset = useCallback(() => {
    setState({
      loading: false,
      error: null,
      data: null,
      attempts: 0,
    });
  }, []);

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setState(prev => ({ ...prev, loading: false, error: 'Operação cancelada.' }));
    }
  }, []);

  return {
    callFunction,
    loading: state.loading,
    error: state.error,
    data: state.data,
    attempts: state.attempts,
    reset,
    cancel,
    isAppCheckAvailable,
    appCheckError,
  };
}

/**
 * Hook for 2FA operations with enhanced error handling
 */
export function useTwoFactorAuth(functions: Functions | null) {
  const { callFunction, loading, error, attempts } = useFirebase({
    defaultRetryOptions: {
      maxRetries: 2,
      initialDelay: 500,
    },
  });

  const generateSecret = useCallback(async (uid: string): Promise<string> => {
    if (!functions) throw new Error('Firebase Functions não disponível');
    
    const result = await callFunction<string>(
      'generateTwoFactorSecretAction',
      functions,
      uid
    );
    
    return result;
  }, [functions, callFunction]);

  const verifyAndEnable = useCallback(async (data: {
    uid: string;
    secretUri: string;
    token: string;
  }): Promise<boolean> => {
    if (!functions) throw new Error('Firebase Functions não disponível');
    
    const result = await callFunction<boolean>(
      'verifyAndEnableTwoFactorAction',
      functions,
      data
    );
    
    return result;
  }, [functions, callFunction]);

  const verifyToken = useCallback(async (data: {
    uid: string;
    token: string;
  }): Promise<boolean> => {
    if (!functions) throw new Error('Firebase Functions não disponível');
    
    const result = await callFunction<boolean>(
      'verifyTokenAction',
      functions,
      data
    );
    
    return result;
  }, [functions, callFunction]);

  return {
    generateSecret,
    verifyAndEnable,
    verifyToken,
    loading,
    error,
    attempts,
  };
}

/**
 * Hook for safe storage operations with 2FA
 */
export function useTwoFactorStorage() {
  const setVerified = useCallback((uid: string, isVerified: boolean = true): void => {
    const key = `2fa-verified-${uid}`;
    if (isVerified) {
      storageUtils.setWithTimestamp(key, 'true');
    } else {
      safeLocalStorage.removeItem(key);
    }
  }, []);

  const isVerified = useCallback((uid: string, maxAge: number = 24 * 60 * 60 * 1000): boolean => {
    const key = `2fa-verified-${uid}`;
    const value = storageUtils.getWithTimestamp(key, maxAge);
    return value === 'true';
  }, []);

  const clearVerification = useCallback((uid: string): void => {
    const key = `2fa-verified-${uid}`;
    safeLocalStorage.removeItem(key);
  }, []);

  return {
    setVerified,
    isVerified,
    clearVerification,
  };
}

/**
 * Hook for monitoring Firebase health
 */
export function useFirebaseHealth() {
  const { isAppCheckAvailable, appCheckError } = useAppCheck();
  const [healthStatus, setHealthStatus] = useState<'healthy' | 'degraded' | 'unhealthy'>('healthy');
  const [issues, setIssues] = useState<string[]>([]);

  const checkHealth = useCallback(() => {
    const currentIssues: string[] = [];

    if (!isAppCheckAvailable) {
      currentIssues.push('App Check não disponível');
      setHealthStatus('degraded');
    }

    if (appCheckError?.includes('production')) {
      currentIssues.push('App Check não configurado para produção');
      setHealthStatus('unhealthy');
    }

    const circuitState = firebaseCircuitBreaker.getState();
    if (circuitState.state === 'OPEN') {
      currentIssues.push('Circuit breaker aberto - muitas falhas recentes');
      setHealthStatus('unhealthy');
    } else if (circuitState.failures > 2) {
      currentIssues.push('Múltiplas falhas detectadas');
      setHealthStatus('degraded');
    }

    setIssues(currentIssues);

    if (currentIssues.length === 0) {
      setHealthStatus('healthy');
    }
  }, [isAppCheckAvailable, appCheckError]);

  const resetCircuitBreaker = useCallback(() => {
    firebaseCircuitBreaker.reset();
  }, []);

  // Check health whenever dependencies change
  checkHealth();

  return {
    healthStatus,
    issues,
    isAppCheckAvailable,
    appCheckError,
    circuitBreakerState: firebaseCircuitBreaker.getState(),
    resetCircuitBreaker,
  };
}