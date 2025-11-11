export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
  retryCondition?: (error: any) => boolean;
  onRetry?: (attempt: number, error: any, delay: number) => void;
  shouldRetry?: (error: any) => boolean;
}

export interface RetryResult<T> {
  data: T;
  attempts: number;
  totalDelay: number;
}

const defaultRetryOptions: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffFactor: 2,
  retryCondition: () => true,
  onRetry: () => {},
  shouldRetry: (error: any) => {
    // Retry on network errors, 5xx, 429 (rate limit), and specific Firebase errors
    if (!error) return false;
    
    // Network errors
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      return true;
    }
    
    // HTTP status codes
    const status = error.status || error.code;
    if (status >= 500 || status === 429 || status === 408) {
      return true;
    }
    
    // Firebase specific errors
    if (error.message?.includes('throttled') || 
        error.message?.includes('403') ||
        error.message?.includes('timeout') ||
        error.message?.includes('network')) {
      return true;
    }
    
    // App Check specific errors
    if (error.message?.includes('app-check') || 
        error.message?.includes('AppCheck')) {
      return true;
    }
    
    return false;
  },
};

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(
  attempt: number,
  initialDelay: number,
  maxDelay: number,
  backoffFactor: number
): number {
  const exponentialDelay = initialDelay * Math.pow(backoffFactor, attempt - 1);
  const jitter = Math.random() * 0.1 * exponentialDelay; // Add 10% jitter
  const delay = exponentialDelay + jitter;
  return Math.min(delay, maxDelay);
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const opts = { ...defaultRetryOptions, ...options };
  let lastError: any;
  let totalDelay = 0;

  for (let attempt = 1; attempt <= opts.maxRetries + 1; attempt++) {
    try {
      const data = await fn();
      return {
        data,
        attempts: attempt,
        totalDelay,
      };
    } catch (error: any) {
      lastError = error;
      
      // Don't retry on the last attempt
      if (attempt > opts.maxRetries) {
        break;
      }
      
      // Check if we should retry this error
      if (!opts.shouldRetry(error)) {
        break;
      }
      
      const delay = calculateDelay(
        attempt,
        opts.initialDelay,
        opts.maxDelay,
        opts.backoffFactor
      );
      
      totalDelay += delay;
      
      // Call retry callback
      opts.onRetry(attempt, error, delay);
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

/**
 * Retry a Firebase Function call
 */
export async function retryFirebaseFunction<T>(
  fn: () => Promise<T>,
  functionName?: string,
  options: RetryOptions = {}
): Promise<T> {
  const opts: RetryOptions = {
    ...options,
    maxRetries: options.maxRetries || 3,
    initialDelay: options.initialDelay || 1000,
    onRetry: (attempt, error, delay) => {
      const funcName = functionName || 'Firebase Function';
      console.warn(
        `${funcName} failed (attempt ${attempt}/${options.maxRetries || 3}). ` +
        `Retrying in ${Math.round(delay)}ms... Error: ${error.message || error}`
      );
      
      if (options.onRetry) {
        options.onRetry(attempt, error, delay);
      }
    },
  };
  
  const result = await retryWithBackoff(fn, opts);
  return result.data;
}

/**
 * Circuit Breaker Pattern for preventing cascading failures
 */
export interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeout?: number;
  monitoringPeriod?: number;
}

export interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

export class CircuitBreaker {
  private state: CircuitBreakerState = {
    failures: 0,
    lastFailureTime: 0,
    state: 'CLOSED',
  };
  
  private options: Required<CircuitBreakerOptions>;
  
  constructor(options: CircuitBreakerOptions = {}) {
    this.options = {
      failureThreshold: options.failureThreshold || 5,
      resetTimeout: options.resetTimeout || 60000, // 1 minute
      monitoringPeriod: options.monitoringPeriod || 10000, // 10 seconds
    };
  }
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state.state === 'OPEN') {
      if (Date.now() - this.state.lastFailureTime > this.options.resetTimeout) {
        this.state.state = 'HALF_OPEN';
        console.log('Circuit breaker moving to HALF_OPEN state');
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess(): void {
    if (this.state.state === 'HALF_OPEN') {
      console.log('Circuit breaker moving to CLOSED state');
    }
    
    this.state = {
      failures: 0,
      lastFailureTime: 0,
      state: 'CLOSED',
    };
  }
  
  private onFailure(): void {
    this.state.failures++;
    this.state.lastFailureTime = Date.now();
    
    if (this.state.failures >= this.options.failureThreshold) {
      this.state.state = 'OPEN';
      console.warn(`Circuit breaker moving to OPEN state after ${this.state.failures} failures`);
    }
  }
  
  getState(): CircuitBreakerState {
    return { ...this.state };
  }
  
  reset(): void {
    this.state = {
      failures: 0,
      lastFailureTime: 0,
      state: 'CLOSED',
    };
    console.log('Circuit breaker manually reset to CLOSED state');
  }
}

/**
 * Queue for managing retry attempts
 */
export class RetryQueue {
  private queue: Array<{
    fn: () => Promise<any>;
    resolve: (value: any) => void;
    reject: (error: any) => void;
    options: RetryOptions;
    attempt: number;
  }> = [];
  
  private isProcessing = false;
  private maxConcurrent = 3;
  private currentProcessing = 0;
  
  async add<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        fn,
        resolve,
        reject,
        options,
        attempt: 1,
      });
      
      this.processQueue();
    });
  }
  
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.currentProcessing >= this.maxConcurrent) {
      return;
    }
    
    this.isProcessing = true;
    
    while (this.queue.length > 0 && this.currentProcessing < this.maxConcurrent) {
      const item = this.queue.shift();
      if (item) {
        this.currentProcessing++;
        this.processItem(item);
      }
    }
    
    this.isProcessing = false;
  }
  
  private async processItem(item: {
    fn: () => Promise<any>;
    resolve: (value: any) => void;
    reject: (error: any) => void;
    options: RetryOptions;
    attempt: number;
  }): Promise<void> {
    try {
      const result = await item.fn();
      item.resolve(result);
    } catch (error: any) {
      const maxRetries = item.options.maxRetries || 3;
      
      if (item.attempt < maxRetries && this.shouldRetry(error)) {
        const delay = calculateDelay(
          item.attempt,
          item.options.initialDelay || 1000,
          item.options.maxDelay || 30000,
          item.options.backoffFactor || 2
        );
        
        setTimeout(() => {
          this.queue.push({
            ...item,
            attempt: item.attempt + 1,
          });
          this.processQueue();
        }, delay);
      } else {
        item.reject(error);
      }
    } finally {
      this.currentProcessing--;
      this.processQueue();
    }
  }
  
  private shouldRetry(error: any): boolean {
    return defaultRetryOptions.shouldRetry(error);
  }
}

// Global retry queue instance
export const globalRetryQueue = new RetryQueue();

/**
 * Enhanced error class for retry operations
 */
export class RetryError extends Error {
  constructor(
    message: string,
    public readonly originalError: any,
    public readonly attempts: number,
    public readonly totalDelay: number
  ) {
    super(message);
    this.name = 'RetryError';
  }
}

/**
 * Utility function to create a wrapped function with retry logic
 */
export function withRetry<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options: RetryOptions = {}
): T {
  return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    try {
      const result = await retryWithBackoff(() => fn(...args), options);
      return result.data;
    } catch (error: any) {
      throw new RetryError(
        `Function failed after ${options.maxRetries || 3} retries: ${error.message}`,
        error,
        options.maxRetries || 3,
        0
      );
    }
  }) as T;
}

/**
 * Firebase Functions specific retry wrapper
 */
export function withFirebaseRetry<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  functionName?: string,
  options: RetryOptions = {}
): T {
  return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    return retryFirebaseFunction(() => fn(...args), functionName, options);
  }) as T;
}

// Export default retry function for backward compatibility
export default retryWithBackoff;