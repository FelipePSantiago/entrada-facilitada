/**
 * Sistema de Rate Limiting para Firebase Functions
 * Protege contra abusos e ataques de força bruta
 */

interface RateLimitEntry {
    count: number;
    resetTime: number;
    firstRequest: number;
  }
  
  interface RateLimitConfig {
    windowMs: number; // Janela de tempo em milissegundos
    maxRequests: number; // Máximo de requisições permitidas
    skipSuccessfulRequests?: boolean; // Não contar requisições bem-sucedidas
    skipFailedRequests?: boolean; // Não contar requisições falhas
    message?: string; // Mensagem de erro personalizada
  }
  
  class RateLimiter {
    private static instance: RateLimiter;
    private store = new Map<string, RateLimitEntry>();
    private cleanupInterval: NodeJS.Timeout;
  
    private constructor() {
      // Limpar entradas expiradas a cada minuto
      this.cleanupInterval = setInterval(() => {
        this.cleanup();
      }, 60 * 1000);
    }
  
    public static getInstance(): RateLimiter {
      if (!RateLimiter.instance) {
        RateLimiter.instance = new RateLimiter();
      }
      return RateLimiter.instance;
    }
  
    /**
     * Verifica se uma requisição deve ser limitada
     */
    public checkLimit(
      key: string, 
      config: RateLimitConfig
    ): { allowed: boolean; remaining: number; resetTime: number } {
      const now = Date.now();
      const entry = this.store.get(key);
  
      if (!entry) {
        // Primeira requisição
        const newEntry: RateLimitEntry = {
          count: 1,
          resetTime: now + config.windowMs,
          firstRequest: now,
        };
        this.store.set(key, newEntry);
        
        return {
          allowed: true,
          remaining: config.maxRequests - 1,
          resetTime: newEntry.resetTime,
        };
      }
  
      // Verificar se a janela de tempo expirou
      if (now > entry.resetTime) {
        const newEntry: RateLimitEntry = {
          count: 1,
          resetTime: now + config.windowMs,
          firstRequest: now,
        };
        this.store.set(key, newEntry);
        
        return {
          allowed: true,
          remaining: config.maxRequests - 1,
          resetTime: newEntry.resetTime,
        };
      }
  
      // Incrementar contador
      entry.count++;
  
      const remaining = Math.max(0, config.maxRequests - entry.count);
      const allowed = entry.count <= config.maxRequests;
  
      return {
        allowed,
        remaining,
        resetTime: entry.resetTime,
      };
    }
  
    /**
     * Marca uma requisição como bem-sucedida (opcional)
     */
    public markSuccess(key: string): void {
      // Implementação opcional para estatísticas
    }
  
    /**
     * Marca uma requisição como falha (opcional)
     */
    public markFailure(key: string): void {
      // Implementação opcional para estatísticas
    }
  
    /**
     * Remove uma entrada do store
     */
    public deleteEntry(key: string): void {
      this.store.delete(key);
    }
  
    /**
     * Limpa entradas expiradas
     */
    private cleanup(): void {
      const now = Date.now();
      
      for (const [key, entry] of this.store.entries()) {
        if (now > entry.resetTime) {
          this.store.delete(key);
        }
      }
    }
  
    /**
     * Obtém estatísticas
     */
    public getStats(): { totalEntries: number; activeEntries: number } {
      const now = Date.now();
      let activeEntries = 0;
      
      for (const entry of this.store.values()) {
        if (now <= entry.resetTime) {
          activeEntries++;
        }
      }
      
      return {
        totalEntries: this.store.size,
        activeEntries,
      };
    }
  
    /**
     * Limpa todas as entradas
     */
    public clear(): void {
      this.store.clear();
    }
  
    /**
     * Destrói o rate limiter
     */
    public destroy(): void {
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
      }
      this.clear();
    }
  }
  
  // Configurações pré-definidas
  export const RATE_LIMIT_CONFIGS = {
    // API geral - 100 requisições por minuto
    API: {
      windowMs: 60 * 1000,
      maxRequests: 100,
      message: 'Muitas requisições. Tente novamente em alguns instantes.',
    },
    
    // Extração de PDF - 10 requisições por minuto
    PDF_EXTRACTION: {
      windowMs: 60 * 1000,
      maxRequests: 10,
      message: 'Limite de extração de PDF excedido. Tente novamente em alguns instantes.',
    },
    
    // Autenticação - 5 tentativas por minuto
    AUTH: {
      windowMs: 60 * 1000,
      maxRequests: 5,
      message: 'Muitas tentativas de autenticação. Tente novamente em alguns instantes.',
    },
    
    // Upload de arquivos - 20 requisições por minuto
    FILE_UPLOAD: {
      windowMs: 60 * 1000,
      maxRequests: 20,
      message: 'Limite de upload excedido. Tente novamente em alguns instantes.',
    },
    
    // Operações de admin - 50 requisições por minuto
    ADMIN: {
      windowMs: 60 * 1000,
      maxRequests: 50,
      message: 'Limite de operações administrativas excedido. Tente novamente em alguns instantes.',
    },
  };
  
  // Middleware para Firebase Functions
  export function createRateLimitMiddleware(config: RateLimitConfig) {
    const rateLimiter = RateLimiter.getInstance();
    
    return (key: string) => {
      const result = rateLimiter.checkLimit(key, config);
      
      if (!result.allowed) {
        const error = new Error(config.message || 'Rate limit exceeded');
        (error as any).code = 'RATE_LIMIT_EXCEEDED';
        (error as any).retryAfter = Math.ceil((result.resetTime - Date.now()) / 1000);
        throw error;
      }
      
      return result;
    };
  }
  
  // Funções utilitárias para gerar chaves
  export const RateLimitKeys = {
    byIP: (ip: string) => `ip:${ip}`,
    byUID: (uid: string) => `uid:${uid}`,
    byEmail: (email: string) => `email:${email}`,
    byFunction: (functionName: string, identifier: string) => `func:${functionName}:${identifier}`,
    custom: (...parts: string[]) => parts.join(':'),
  };
  
  // Exportar instância singleton
  export const rateLimiter = RateLimiter.getInstance();
  
  export default RateLimiter;