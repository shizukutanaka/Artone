type StorageKind = 'local' | 'session';

export interface SafeStorage {
  readonly kind: StorageKind;
  readonly persistent: boolean;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
  keys(): string[];
}

const memoryStores: Record<StorageKind, Map<string, string>> = {
  local: new Map<string, string>(),
  session: new Map<string, string>()
};

const storageCache: Partial<Record<StorageKind, SafeStorage>> = {};

const MEMORY_METADATA = {
  persistent: false
} as const;

function resolveNativeStorage(kind: StorageKind): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    if (kind === 'local') {
      return window.localStorage;
    }
    return window.sessionStorage;
  } catch (error) {
    return null;
  }
}

function createMemoryStorage(kind: StorageKind): SafeStorage {
  const store = memoryStores[kind];

  return {
    kind,
    persistent: MEMORY_METADATA.persistent,
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    keys: () => Array.from(store.keys())
  };
}

function createPersistentStorage(kind: StorageKind, storage: Storage): SafeStorage {
  return {
    kind,
    persistent: true,
    getItem: (key: string) => storage.getItem(key),
    setItem: (key: string, value: string) => {
      storage.setItem(key, value);
    },
    removeItem: (key: string) => {
      storage.removeItem(key);
    },
    clear: () => {
      storage.clear();
    },
    keys: () => {
      const result: string[] = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (typeof key === 'string') {
          result.push(key);
        }
      }
      return result;
    }
  };
}

function validateStorage(storage: Storage | null): Storage | null {
  if (!storage) {
    return null;
  }

  const testKey = '__artone_storage_test__';
  try {
    storage.setItem(testKey, 'ok');
    storage.removeItem(testKey);
    return storage;
  } catch (error) {
    return null;
  }
}

export function getSafeStorage(kind: StorageKind = 'local'): SafeStorage {
  if (storageCache[kind]) {
    return storageCache[kind]!;
  }

  const nativeStorage = validateStorage(resolveNativeStorage(kind));

  if (nativeStorage) {
    const persistentStorage = createPersistentStorage(kind, nativeStorage);
    storageCache[kind] = persistentStorage;
    return persistentStorage;
  }

  const memoryStorage = createMemoryStorage(kind);
  storageCache[kind] = memoryStorage;
  return memoryStorage;
}
