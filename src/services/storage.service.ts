import { Provider, Settings } from '../types';

interface ModelCacheEntry {
  models: string[];
  fetchedAt: number;
}

type ModelCache = Partial<Record<Provider, ModelCacheEntry>>;

const MODEL_CACHE_KEY = 'modelCache';

export class StorageService {
  private static instance: StorageService;

  private constructor() {}

  public static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  public async getSettings(): Promise<Settings> {
    return new Promise((resolve) => {
      chrome.storage.sync.get(['apiKey', 'provider', 'model'], (result) => {
        resolve({
          apiKey: result.apiKey || '',
          provider: result.provider || 'openrouter',
          model: result.model || '',
        });
      });
    });
  }

  public async saveSettings(settings: Settings): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.sync.set(settings, () => {
        resolve();
      });
    });
  }

  public async getModelCache(provider: Provider): Promise<ModelCacheEntry | null> {
    return new Promise((resolve) => {
      chrome.storage.local.get([MODEL_CACHE_KEY], (result) => {
        const cache = (result[MODEL_CACHE_KEY] as ModelCache) || {};
        resolve(cache[provider] || null);
      });
    });
  }

  public async setModelCache(provider: Provider, models: string[]): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.get([MODEL_CACHE_KEY], (result) => {
        const cache = (result[MODEL_CACHE_KEY] as ModelCache) || {};
        const updatedCache: ModelCache = {
          ...cache,
          [provider]: {
            models,
            fetchedAt: Date.now(),
          },
        };
        chrome.storage.local.set({ [MODEL_CACHE_KEY]: updatedCache }, () => {
          resolve();
        });
      });
    });
  }

  public async clearSettings(): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.sync.clear(() => {
        resolve();
      });
    });
  }
}
