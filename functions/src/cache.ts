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
    setInterval(() => this.cleanup(), this.CLEANUP_INTERVAL);
  }

  set<T>(key: string, data: T, ttl: number = this.DEFAULT_TTL): void {
    this.cache.set(key, { data, timestamp: Date.now(), ttl });
  }

  get<T>(key: string): T | null {
    const item = this.cache.get(key);
    if (!item || Date.now() - item.timestamp > item.ttl) {
      if (item) this.cache.delete(key);
      return null;
    }
    return item.data as T;
  }

  has(key: string): boolean {
    const item = this.cache.get(key);
    if (!item || Date.now() - item.timestamp > item.ttl) {
      if (item) this.cache.delete(key);
      return false;
    }
    return true;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now - item.timestamp > item.ttl) {
        this.cache.delete(key);
      }
    }
  }

  getStats(): { size: number } {
    return { size: this.cache.size };
  }
}

const cacheManager = new CacheManager();

export class PropertyCache {
  private static readonly PREFIX = 'property';
  private static readonly TTL = 10 * 60 * 1000;

  private static key(parts: string[]): string {
    return `${this.PREFIX}:${parts.join(':')}`;
  }

  static setProperties(properties: Property[]): void {
    cacheManager.set(this.key(['list']), properties, this.TTL);
  }

  static getProperties(): Property[] | null {
    return cacheManager.get<Property[]>(this.key(['list']));
  }

  static setProperty(propertyId: string, property: Property): void {
    cacheManager.set(this.key(['single', propertyId]), property, this.TTL);
  }

  static getProperty(propertyId: string): Property | null {
    return cacheManager.get<Property>(this.key(['single', propertyId]));
  }

  static setUnitPricing(propertyId: string, pricing: UnitPricing[]): void {
    cacheManager.set(this.key(['pricing', propertyId]), pricing, this.TTL);
  }

  static getUnitPricing(propertyId: string): UnitPricing[] | null {
    return cacheManager.get<UnitPricing[]>(this.key(['pricing', propertyId]));
  }

  static invalidateProperty(propertyId: string): void {
    cacheManager.delete(this.key(['single', propertyId]));
    cacheManager.delete(this.key(['pricing', propertyId]));
  }

  static invalidateAll(): void {
    cacheManager.clear(); // Simplificado para limpar todo o cache de propriedades
  }
}

export class UserCache {
  private static readonly PREFIX = 'user';
  private static readonly TTL = 15 * 60 * 1000;

  private static key(parts: string[]): string {
    return `${this.PREFIX}:${parts.join(':')}`;
  }

  static setUser(uid: string, user: AppUser): void {
    cacheManager.set(this.key(['single', uid]), user, this.TTL);
  }

  static getUser(uid: string): AppUser | null {
    return cacheManager.get<AppUser>(this.key(['single', uid]));
  }

  static invalidateUser(uid: string): void {
    cacheManager.delete(this.key(['single', uid]));
  }
}

export class PdfExtractionCache {
  private static readonly PREFIX = 'pdf_extraction';
  private static readonly TTL = 30 * 60 * 1000;

  private static key(parts: string[]): string {
    return `${this.PREFIX}:${parts.join(':')}`;
  }

  static setResult(fileHash: string, result: any): void {
    cacheManager.set(this.key(['result', fileHash]), result, this.TTL);
  }

  static getResult(fileHash: string): any | null {
    return cacheManager.get<any>(this.key(['result', fileHash]));
  }
}

export async function createFileHash(dataUrl: string): Promise<string> {
  const crypto = require('crypto');
  const base64Data = dataUrl.split(',')[1];
  return crypto.createHash('md5').update(base64Data).digest('hex');
}

export function withCache<T extends any[], R>(
  keyGenerator: (...args: T) => string | Promise<string>,
  fn: (...args: T) => R | Promise<R>,
  ttl: number = 5 * 60 * 1000
) {
  return async (...args: T): Promise<R> => {
    const key = await Promise.resolve(keyGenerator(...args));
    const cached = cacheManager.get<R>(key);
    if (cached !== null) return cached;
    
    const result = await Promise.resolve(fn(...args));
    cacheManager.set(key, result, ttl);
    return result;
  };
}

export default cacheManager;
