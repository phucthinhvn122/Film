import { STORAGE_KEYS, STORAGE_LIMITS } from './config.js';

function safeReadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch (error) {
    console.warn(`Storage read failed for ${key}:`, error);
    return fallback;
  }
}

function safeWriteJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn(`Storage write failed for ${key}:`, error);
    return false;
  }
}

function normalizeHistoryEntry(entry = {}) {
  const movieSlug = String(entry.movieSlug || '').trim();
  const epSlug = String(entry.epSlug || '').trim();
  if (!movieSlug || !epSlug) return null;

  return {
    movieSlug,
    epSlug,
    serverName: String(entry.serverName || '').trim(),
    movieName: String(entry.movieName || '').trim(),
    episodeName: String(entry.episodeName || '').trim(),
    poster: String(entry.poster || '').trim(),
    progressSeconds: Math.max(0, Number(entry.progressSeconds) || 0),
    durationSeconds: Math.max(0, Number(entry.durationSeconds) || 0),
    updatedAt: Number(entry.updatedAt) > 0 ? Number(entry.updatedAt) : Date.now()
  };
}

function historyIdentity(entry) {
  return `${entry.movieSlug}::${entry.epSlug}::${entry.serverName || ''}`;
}

export const FavoritesStorage = {
  list() {
    const arr = safeReadJSON(STORAGE_KEYS.FAVORITES, []);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((item) => item && typeof item === 'object' && item.slug)
      .map((item) => ({
        slug: String(item.slug),
        name: String(item.name || ''),
        year: String(item.year || ''),
        quality: String(item.quality || ''),
        thumb: String(item.thumb || ''),
        poster: String(item.poster || ''),
        updatedAt: Number(item.updatedAt) || 0
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },

  isFavorite(slug) {
    const target = String(slug || '').trim();
    if (!target) return false;
    return this.list().some((item) => item.slug === target);
  },

  toggle(movie) {
    const slug = String(movie?.slug || '').trim();
    if (!slug) return false;

    const list = this.list();
    const index = list.findIndex((item) => item.slug === slug);

    if (index >= 0) {
      list.splice(index, 1);
      safeWriteJSON(STORAGE_KEYS.FAVORITES, list);
      return false;
    }

    list.unshift({
      slug,
      name: String(movie?.name || ''),
      year: String(movie?.year || ''),
      quality: String(movie?.quality || movie?.episodeCurrent || 'HD'),
      thumb: String(movie?.thumb || ''),
      poster: String(movie?.poster || ''),
      updatedAt: Date.now()
    });

    const trimmed = list.slice(0, STORAGE_LIMITS.FAVORITES_MAX);
    safeWriteJSON(STORAGE_KEYS.FAVORITES, trimmed);
    return true;
  }
};

export const HistoryStorage = {
  list() {
    const arr = safeReadJSON(STORAGE_KEYS.HISTORY, []);
    if (!Array.isArray(arr)) return [];

    return arr
      .map(normalizeHistoryEntry)
      .filter(Boolean)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, STORAGE_LIMITS.HISTORY_MAX);
  },

  upsert(entry) {
    const normalized = normalizeHistoryEntry(entry);
    if (!normalized) return false;

    const list = this.list();
    const key = historyIdentity(normalized);
    const idx = list.findIndex((item) => historyIdentity(item) === key);

    if (idx >= 0) {
      list[idx] = { ...list[idx], ...normalized, updatedAt: Date.now() };
    } else {
      list.unshift({ ...normalized, updatedAt: Date.now() });
    }

    const dedup = [];
    const seen = new Set();
    for (const item of list) {
      const id = historyIdentity(item);
      if (seen.has(id)) continue;
      seen.add(id);
      dedup.push(item);
      if (dedup.length >= STORAGE_LIMITS.HISTORY_MAX) break;
    }

    return safeWriteJSON(STORAGE_KEYS.HISTORY, dedup);
  },

  clear() {
    return safeWriteJSON(STORAGE_KEYS.HISTORY, []);
  }
};

export const ProgressStorage = {
  getAll() {
    const raw = safeReadJSON(STORAGE_KEYS.WATCH_PROGRESS, {});
    return raw && typeof raw === 'object' ? raw : {};
  },

  keyOf(movieSlug, epSlug, serverName = '') {
    return `${movieSlug}::${epSlug}::${serverName}`;
  },

  get(movieSlug, epSlug, serverName = '') {
    const key = this.keyOf(movieSlug, epSlug, serverName);
    const data = this.getAll()[key];
    if (!data || typeof data !== 'object') return { progressSeconds: 0, durationSeconds: 0 };
    return {
      progressSeconds: Math.max(0, Number(data.progressSeconds) || 0),
      durationSeconds: Math.max(0, Number(data.durationSeconds) || 0)
    };
  },

  set(movieSlug, epSlug, serverName, progressSeconds, durationSeconds) {
    if (!movieSlug || !epSlug) return false;
    const key = this.keyOf(movieSlug, epSlug, serverName || '');
    const all = this.getAll();
    all[key] = {
      progressSeconds: Math.max(0, Number(progressSeconds) || 0),
      durationSeconds: Math.max(0, Number(durationSeconds) || 0),
      updatedAt: Date.now()
    };
    return safeWriteJSON(STORAGE_KEYS.WATCH_PROGRESS, all);
  }
};

export const ContinueWatchingStorage = {
  list() {
    const history = HistoryStorage.list();
    const result = history.filter((item) => {
      if (item.progressSeconds <= 20) return false;
      if (!item.durationSeconds) return true;
      return item.progressSeconds < Math.max(60, item.durationSeconds - 45);
    });

    return result.slice(0, STORAGE_LIMITS.CONTINUE_MAX);
  }
};

export const SearchStorage = {
  recent() {
    const arr = safeReadJSON(STORAGE_KEYS.SEARCH_RECENT, []);
    if (!Array.isArray(arr)) return [];
    return arr.map((item) => String(item || '').trim()).filter(Boolean).slice(0, STORAGE_LIMITS.SEARCH_RECENT_MAX);
  },

  pushRecent(keyword) {
    const key = String(keyword || '').trim();
    if (!key) return;
    const current = this.recent();
    const next = [key, ...current.filter((item) => item.toLowerCase() !== key.toLowerCase())]
      .slice(0, STORAGE_LIMITS.SEARCH_RECENT_MAX);
    safeWriteJSON(STORAGE_KEYS.SEARCH_RECENT, next);
  },

  clearRecent() {
    safeWriteJSON(STORAGE_KEYS.SEARCH_RECENT, []);
  }
};

export const SessionStorage = {
  save(value = {}) {
    const route = value && typeof value === 'object'
      ? {
          name: String(value.lastPage || value.name || '').trim() || 'home',
          params: value.lastParams && typeof value.lastParams === 'object' ? value.lastParams : (value.params || {}),
          scrollY: Math.max(0, Number(value.scrollY) || 0)
        }
      : { name: 'home', params: {}, scrollY: 0 };
    this.saveRoute(route);
  },

  load() {
    const route = this.loadRoute();
    if (!route) return null;
    return {
      lastPage: route.name,
      lastParams: route.params || {},
      scrollY: Math.max(0, Number(route.scrollY) || 0)
    };
  },

  saveRoute(route) {
    if (!route || typeof route !== 'object') return;
    safeWriteJSON(STORAGE_KEYS.SESSION_ROUTE, {
      ...route,
      updatedAt: Date.now()
    });
  },

  loadRoute() {
    const route = safeReadJSON(STORAGE_KEYS.SESSION_ROUTE, null);
    if (!route || typeof route !== 'object') return null;
    if (!route.name) return null;
    return route;
  }
};

export const ServerMemoryStorage = {
  getAll() {
    const raw = safeReadJSON(STORAGE_KEYS.SERVER_MEMORY, {});
    return raw && typeof raw === 'object' ? raw : {};
  },

  remember(movieSlug, serverName) {
    if (!movieSlug || !serverName) return;
    const all = this.getAll();
    all[movieSlug] = {
      serverName: String(serverName),
      updatedAt: Date.now()
    };
    safeWriteJSON(STORAGE_KEYS.SERVER_MEMORY, all);
  },

  get(movieSlug) {
    if (!movieSlug) return '';
    const all = this.getAll();
    return String(all[movieSlug]?.serverName || '');
  }
};

export const StorageUtils = {
  migrate() {
    // Reserved for future storage schema upgrades.
  },

  savePlaybackSnapshot({
    movieSlug,
    epSlug,
    serverName,
    movieName,
    episodeName,
    poster,
    progressSeconds,
    durationSeconds
  }) {
    ProgressStorage.set(movieSlug, epSlug, serverName, progressSeconds, durationSeconds);
    HistoryStorage.upsert({
      movieSlug,
      epSlug,
      serverName,
      movieName,
      episodeName,
      poster,
      progressSeconds,
      durationSeconds,
      updatedAt: Date.now()
    });
  }
};

