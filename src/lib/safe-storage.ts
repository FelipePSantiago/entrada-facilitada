export interface SafeStorageInterface {
  setItem(key: string, value: string): void;
  getItem(key: string): string | null;
  removeItem(key: string): void;
  clear(): void;
  key(index: number): string | null;
  get length(): number;
}

export class SafeStorage implements SafeStorageInterface {
  private isAvailable: boolean;
  private fallback: Map<string, string> = new Map();
  private storageType: 'localStorage' | 'sessionStorage';

  constructor(storageType: 'localStorage' | 'sessionStorage' = 'localStorage') {
    this.storageType = storageType;
    this.isAvailable = this.checkAvailability();
    
    if (!this.isAvailable) {
      console.warn(`${storageType} is not available. Using in-memory fallback.`);
    }
  }

  private checkAvailability(): boolean {
    try {
      const storage = window[this.storageType];
      const test = '__storage_test__' + Date.now();
      storage.setItem(test, test);
      storage.removeItem(test);
      return true;
    } catch (error) {
      console.warn(`${this.storageType} availability check failed:`, error);
      return false;
    }
  }

  setItem(key: string, value: string): void {
    if (this.isAvailable) {
      try {
        window[this.storageType].setItem(key, value);
      } catch (error) {
        console.warn(`Failed to set ${this.storageType} item "${key}":`, error);
        this.fallback.set(key, value);
      }
    } else {
      this.fallback.set(key, value);
    }
  }

  getItem(key: string): string | null {
    if (this.isAvailable) {
      try {
        const value = window[this.storageType].getItem(key);
        if (value !== null) {
          return value;
        }
      } catch (error) {
        console.warn(`Failed to get ${this.storageType} item "${key}":`, error);
      }
    }
    return this.fallback.get(key) || null;
  }

  removeItem(key: string): void {
    if (this.isAvailable) {
      try {
        window[this.storageType].removeItem(key);
      } catch (error) {
        console.warn(`Failed to remove ${this.storageType} item "${key}":`, error);
        this.fallback.delete(key);
      }
    } else {
      this.fallback.delete(key);
    }
  }

  clear(): void {
    if (this.isAvailable) {
      try {
        window[this.storageType].clear();
      } catch (error) {
        console.warn(`Failed to clear ${this.storageType}:`, error);
        this.fallback.clear();
      }
    } else {
      this.fallback.clear();
    }
  }

  key(index: number): string | null {
    if (this.isAvailable) {
      try {
        return window[this.storageType].key(index);
      } catch (error) {
        console.warn(`Failed to get ${this.storageType} key at index ${index}:`, error);
        const keys = Array.from(this.fallback.keys());
        return keys[index] || null;
      }
    }
    const keys = Array.from(this.fallback.keys());
    return keys[index] || null;
  }

  get length(): number {
    if (this.isAvailable) {
      try {
        return window[this.storageType].length;
      } catch (error) {
        console.warn(`Failed to get ${this.storageType} length:`, error);
        return this.fallback.size;
      }
    }
    return this.fallback.size;
  }

  // Método utilitário para verificar se o storage está disponível
  isStorageAvailable(): boolean {
    return this.isAvailable;
  }

  // Método para sincronizar dados do fallback para o storage (quando disponível)
  syncToFallback(): void {
    if (this.isAvailable) {
      try {
        const storage = window[this.storageType];
        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i);
          if (key) {
            const value = storage.getItem(key);
            if (value !== null) {
              this.fallback.set(key, value);
            }
          }
        }
      } catch (error) {
        console.warn(`Failed to sync ${this.storageType} to fallback:`, error);
      }
    }
  }

  // Método para persistir dados do fallback para o storage (quando disponível)
  persistFromFallback(): void {
    if (this.isAvailable) {
      try {
        const storage = window[this.storageType];
        this.fallback.forEach((value, key) => {
          try {
            storage.setItem(key, value);
          } catch (error) {
            console.warn(`Failed to persist fallback item "${key}" to ${this.storageType}:`, error);
          }
        });
      } catch (error) {
        console.warn(`Failed to persist fallback to ${this.storageType}:`, error);
      }
    }
  }
}

// Instâncias globais para uso em toda a aplicação
export const safeLocalStorage = new SafeStorage('localStorage');
export const safeSessionStorage = new SafeStorage('sessionStorage');

// Hook React para usar safe storage
import { useEffect, useState } from 'react';

export function useSafeStorage(storageType: 'localStorage' | 'sessionStorage' = 'localStorage') {
  const [storage] = useState(() => new SafeStorage(storageType));
  const [isAvailable, setIsAvailable] = useState(storage.isStorageAvailable());

  useEffect(() => {
    const checkInterval = setInterval(() => {
      const currentAvailability = storage.isStorageAvailable();
      if (currentAvailability !== isAvailable) {
        setIsAvailable(currentAvailability);
        if (currentAvailability) {
          // Storage ficou disponível, tentar persistir dados do fallback
          storage.persistFromFallback();
        }
      }
    }, 5000); // Verificar a cada 5 segundos

    return () => clearInterval(checkInterval);
  }, [storage, isAvailable]);

  return {
    storage,
    isAvailable,
    setItem: (key: string, value: string) => storage.setItem(key, value),
    getItem: (key: string) => storage.getItem(key),
    removeItem: (key: string) => storage.removeItem(key),
    clear: () => storage.clear(),
  };
}

// Funções utilitárias para operações comuns
export const storageUtils = {
  // Salvar objeto JSON
  setObject: (key: string, obj: any, storage: SafeStorageInterface = safeLocalStorage): void => {
    try {
      storage.setItem(key, JSON.stringify(obj));
    } catch (error) {
      console.error(`Failed to save object to storage with key "${key}":`, error);
    }
  },

  // Recuperar objeto JSON
  getObject: <T = any>(key: string, defaultValue: T | null = null, storage: SafeStorageInterface = safeLocalStorage): T | null => {
    try {
      const item = storage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
      console.error(`Failed to parse object from storage with key "${key}":`, error);
      return defaultValue;
    }
  },

  // Salvar com timestamp
  setWithTimestamp: (key: string, value: string, storage: SafeStorageInterface = safeLocalStorage): void => {
    const data = {
      value,
      timestamp: Date.now(),
    };
    storageUtils.setObject(key, data, storage);
  },

  // Recuperar com verificação de timestamp
  getWithTimestamp: (key: string, maxAge: number = 24 * 60 * 60 * 1000, storage: SafeStorageInterface = safeLocalStorage): string | null => {
    const data = storageUtils.getObject<{ value: string; timestamp: number }>(key, null, storage);
    if (!data) return null;

    const age = Date.now() - data.timestamp;
    if (age > maxAge) {
      storage.removeItem(key);
      return null;
    }

    return data.value;
  },

  // Limpar itens expirados
  cleanExpired: (maxAge: number = 24 * 60 * 60 * 1000, storage: SafeStorageInterface = safeLocalStorage): void => {
    const now = Date.now();
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith('timestamped_')) {
        const data = storageUtils.getObject<{ timestamp: number }>(key, null, storage);
        if (data && (now - data.timestamp) > maxAge) {
          storage.removeItem(key);
        }
      }
    }
  },
};

// Exportar funções de compatibilidade para substituir localStorage/sessionStorage diretamente
export const safeStorageCompat = {
  localStorage: {
    setItem: (key: string, value: string) => safeLocalStorage.setItem(key, value),
    getItem: (key: string) => safeLocalStorage.getItem(key),
    removeItem: (key: string) => safeLocalStorage.removeItem(key),
    clear: () => safeLocalStorage.clear(),
    key: (index: number) => safeLocalStorage.key(index),
    get length() { return safeLocalStorage.length; },
  },
  sessionStorage: {
    setItem: (key: string, value: string) => safeSessionStorage.setItem(key, value),
    getItem: (key: string) => safeSessionStorage.getItem(key),
    removeItem: (key: string) => safeSessionStorage.removeItem(key),
    clear: () => safeSessionStorage.clear(),
    key: (index: number) => safeSessionStorage.key(index),
    get length() { return safeSessionStorage.length; },
  },
};