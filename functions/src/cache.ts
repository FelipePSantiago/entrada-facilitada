/**
 * Sistema de cache otimizado para Firebase Functions
 * Reduz chamadas desnecessárias ao Firestore e melhora performance
 */

import { Property, UnitPricing, AppUser } from "./types";

interface CacheItem<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class CacheManager {
  private cache = new Map<string, CacheItem<any>>();
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutos
  private readonly CLEANUP_INTERVAL = 60 * 1000; // 1 minuto

  constructor() {
    // Limpar cache expirado periodicamente
    setInterval(() => {
      this.cleanup();
    }, this.CLEANUP_INTERVAL);
  }

  /**
   * Gera uma chave de cache baseada nos parâmetros
   */
  private generateKey(prefix: string, params: Record<string, any>): string {
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}:${params[key]}`)
      .join('|');
    return `${prefix}:${sortedParams}`;
  }

  /**
   * Armazena dados no cache
   */
  set<T>(key: string, data: T, ttl: number = this.DEFAULT_TTL): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  /**
   * Recupera dados do cache
   */
  get<T>(key: string): T | null {
    const item = this.cache.get(key);
    
    if (!item) {
      return null;
    }

    if (Date.now() - item.timestamp > item.ttl) {
      this.cache.delete(key);
      return null;
    }

    return item.data as T;
  }

  /**
   * Verifica se item existe e não está expirado
   */
  has(key: string): boolean {
    const item = this.cache.get(key);
    
    if (!item) {
      return false;
    }

    if (Date.now() - item.timestamp > item.ttl) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Remove item do cache
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Limpa todo o cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Remove itens expirados
   */
  private cleanup(): void {
    const now = Date.now();
    
    for (const [key, item] of this.cache.entries()) {
      if (now - item.timestamp > item.ttl) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Obtém estatísticas do cache
   */
  getStats(): { size: number; hitRate: number } {
    return {
      size: this.cache.size,
      hitRate: 0 // TODO: Implementar taxa de acerto
    };
  }
}

// Instância global do cache
const cacheManager = new CacheManager();

/**
 * Cache específico para propriedades
 */
export class PropertyCache {
  private static readonly CACHE_PREFIX = 'property';
  private static readonly TTL = 10 * 60 * 1000; // 10 minutos

  /**
   * Cache para lista de propriedades
   */
  static setProperties(properties: Property[]): void {
    const key = this.generateKey(['list']);
    cacheManager.set(key, properties, this.TTL);
  }

  static getProperties(): Property[] | null {
    const key = this.generateKey(['list']);
    return cacheManager.get<Property[]>(key);
  }

  /**
   * Cache para propriedade individual
   */
  static setProperty(propertyId: string, property: Property): void {
    const key = this.generateKey(['single', propertyId]);
    cacheManager.set(key, property, this.TTL);
  }

  static getProperty(propertyId: string): Property | null {
    const key = this.generateKey(['single', propertyId]);
    return cacheManager.get<Property>(key);
  }

  /**
   * Cache para preços de unidades
   */
  static setUnitPricing(propertyId: string, pricing: UnitPricing[]): void {
    const key = this.generateKey(['pricing', propertyId]);
    cacheManager.set(key, pricing, this.TTL);
  }

  static getUnitPricing(propertyId: string): UnitPricing[] | null {
    const key = this.generateKey(['pricing', propertyId]);
    return cacheManager.get<UnitPricing[]>(key);
  }

  /**
   * Invalida cache de uma propriedade específica
   */
  static invalidateProperty(propertyId: string): void {
    const keys = [
      this.generateKey(['single', propertyId]),
      this.generateKey(['pricing', propertyId])
    ];
    
    keys.forEach(key => cacheManager.delete(key));
  }

  /**
   * Invalida cache de todas as propriedades
   */
  static invalidateAll(): void {
    cacheManager.clear();
  }

  private static generateKey(parts: string[]): string {
    return `${this.CACHE_PREFIX}:${parts.join(':')}`;
  }
}

/**
 * Cache específico para usuários
 */
export class UserCache {
  private static readonly CACHE_PREFIX = 'user';
  private static readonly TTL = 15 * 60 * 1000; // 15 minutos

  static setUser(uid: string, user: AppUser): void {
    const key = this.generateKey(['single', uid]);
    cacheManager.set(key, user, this.TTL);
  }

  static getUser(uid: string): AppUser | null {
    const key = this.generateKey(['single', uid]);
    return cacheManager.get<AppUser>(key);
  }

  static invalidateUser(uid: string): void {
    const key = this.generateKey(['single', uid]);
    cacheManager.delete(key);
  }

  private static generateKey(parts: string[]): string {
    return `${this.CACHE_PREFIX}:${parts.join(':')}`;
  }
}

/**
 * Cache para resultados de extração de PDF
 */
export class PdfExtractionCache {
  private static readonly CACHE_PREFIX = 'pdf_extraction';
  private static readonly TTL = 30 * 60 * 1000; // 30 minutos

  static setResult(fileHash: string, result: any): void {
    const key = this.generateKey(['result', fileHash]);
    cacheManager.set(key, result, this.TTL);
  }

  static getResult(fileHash: string): any | null {
    const key = this.generateKey(['result', fileHash]);
    return cacheManager.get<any>(key);
  }

  private static generateKey(parts: string[]): string {
    return `${this.CACHE_PREFIX}:${parts.join(':')}`;
  }
}

/**
 * Função utilitária para criar hash de arquivo
 */
export async function createFileHash(dataUrl: string): Promise<string> {
  const crypto = require('crypto');
  const base64Data = dataUrl.split(',')[1];
  return crypto.createHash('md5').update(base64Data).digest('hex');
}

/**
 * Wrapper para funções com cache
 */
export function withCache<T extends any[], R>(
  keyGenerator: (...args: T) => string,
  fn: (...args: T) => Promise<R>,
  ttl: number = 5 * 60 * 1000
) {
  return async (...args: T): Promise<R> => {
    const key = keyGenerator(...args);
    
    // Tentar obter do cache
    const cached = cacheManager.get<R>(key);
    if (cached !== null) {
      return cached;
    }
    
    // Executar função e armazenar no cache
    const result = await fn(...args);
    cacheManager.set(key, result, ttl);
    
    return result;
  };
}

export default cacheManager;