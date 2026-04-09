import { CACHE_MAX_SIZE, CACHE_TTL } from './config.js';

const CACHE_NULL = Symbol('cache-null');

class TTLCache {
  constructor(maxSize = 100) {
    this.maxSize = maxSize;
    this.map = new Map();
  }

  read(key) {
    const entry = this.map.get(key);
    if (!entry) return { hit: false, value: null };
    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return { hit: false, value: null };
    }

    entry.lastAccess = Date.now();
    return {
      hit: true,
      value: entry.value === CACHE_NULL ? null : entry.value
    };
  }

  get(key) {
    const result = this.read(key);
    return result.hit ? result.value : null;
  }

  set(key, value, ttlMs, { allowNull = false } = {}) {
    if ((value === null || value === undefined) && !allowNull) return;

    if (this.map.size >= this.maxSize && !this.map.has(key)) {
      this.evictLRU();
    }

    this.map.set(key, {
      value: value === null ? CACHE_NULL : value,
      expiresAt: Date.now() + Math.max(2000, Number(ttlMs) || 0),
      lastAccess: Date.now()
    });
  }

  delete(key) {
    this.map.delete(key);
  }

  clear() {
    this.map.clear();
  }

  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.map.entries()) {
      if (entry.expiresAt <= now) {
        this.map.delete(key);
      }
    }
  }

  evictLRU() {
    let oldestKey = null;
    let oldestAccess = Infinity;

    for (const [key, entry] of this.map.entries()) {
      if (entry.lastAccess < oldestAccess) {
        oldestAccess = entry.lastAccess;
        oldestKey = key;
      }
    }

    if (oldestKey !== null) {
      this.map.delete(oldestKey);
    }
  }
}

const caches = {
  home: new TTLCache(CACHE_MAX_SIZE.HOME),
  detail: new TTLCache(CACHE_MAX_SIZE.DETAIL),
  search: new TTLCache(CACHE_MAX_SIZE.SEARCH),
  tmdb: new TTLCache(CACHE_MAX_SIZE.TMDB),
  imageProxy: new TTLCache(CACHE_MAX_SIZE.IMAGE_PROXY)
};

export function getCache(namespace, key) {
  const cache = caches[namespace];
  if (!cache) return null;
  return cache.get(key);
}

export function readCache(namespace, key) {
  const cache = caches[namespace];
  if (!cache) return { hit: false, value: null };
  return cache.read(key);
}

export function setCache(namespace, key, value, ttlMs, options) {
  const cache = caches[namespace];
  if (!cache) return;
  cache.set(key, value, ttlMs, options);
}

export function deleteCache(namespace, key) {
  const cache = caches[namespace];
  if (!cache) return;
  cache.delete(key);
}

export function clearAllCache() {
  Object.values(caches).forEach((cache) => cache.clear());
}

export function cleanupCache() {
  Object.values(caches).forEach((cache) => cache.cleanup());
}

let cleanupTimer = null;

export function startCacheCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(cleanupCache, 2 * 60 * 1000);
}

export function stopCacheCleanup() {
  if (!cleanupTimer) return;
  clearInterval(cleanupTimer);
  cleanupTimer = null;
}

export function getCacheStats() {
  return {
    home: caches.home.map.size,
    detail: caches.detail.map.size,
    search: caches.search.map.size,
    tmdb: caches.tmdb.map.size,
    imageProxy: caches.imageProxy.map.size,
    ttl: CACHE_TTL
  };
}

export function initCacheCleanup() {
  startCacheCleanup();
}

export const CacheManager = {
  clearAll: clearAllCache,
  cleanup: cleanupCache,
  stats: getCacheStats
};

