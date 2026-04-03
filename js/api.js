import {
  API_SOURCE,
  CACHE_TTL,
  IMG_FALLBACK,
  REQUEST_TIMEOUT
} from './config.js';
import { getCache, setCache } from './cache.js';
import { stripHtml } from './dom.js';

export class RequestManager {
  constructor() {
    this.controllers = new Map();
  }

  next(key) {
    this.cancel(key);
    const controller = new AbortController();
    this.controllers.set(key, controller);
    return controller;
  }

  cancel(key) {
    const controller = this.controllers.get(key);
    if (!controller) return;
    try {
      controller.abort();
    } catch (_) {
      // ignore
    }
    this.controllers.delete(key);
  }

  cancelAll() {
    for (const [key] of this.controllers.entries()) {
      this.cancel(key);
    }
  }
}

export const requestManager = new RequestManager();

function withTimeout(promise, timeoutMs, onTimeout) {
  let timer = null;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      onTimeout?.();
      reject(new Error(`TIMEOUT:${timeoutMs}`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function normalizeError(error) {
  if (!error) return new Error('UNKNOWN_ERROR');
  if (error.name === 'AbortError') return new Error('REQUEST_ABORTED');
  if (String(error.message || '').startsWith('TIMEOUT:')) return new Error('REQUEST_TIMEOUT');
  if (String(error.message || '').includes('Failed to fetch')) return new Error('NETWORK_ERROR');
  return error;
}

async function fetchJSON(url, {
  signal,
  timeoutMs = REQUEST_TIMEOUT.DEFAULT,
  cacheNamespace,
  cacheKey,
  cacheTTL,
  cacheAllowNull = false,
  force = false
} = {}) {
  const key = cacheKey || url;

  if (!force && cacheNamespace) {
    const hit = getCache(cacheNamespace, key);
    if (hit !== null) return hit;
  }

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) throw new Error('REQUEST_ABORTED');
    signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    const response = await withTimeout(
      fetch(url, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          Accept: 'application/json'
        }
      }),
      timeoutMs,
      () => controller.abort()
    );

    if (!response.ok) {
      const err = new Error(`HTTP_${response.status}`);
      err.status = response.status;
      throw err;
    }

    const data = await response.json();

    if (cacheNamespace && cacheTTL > 0) {
      setCache(cacheNamespace, key, data, cacheTTL, { allowNull: cacheAllowNull });
    }

    return data;
  } catch (error) {
    throw normalizeError(error);
  } finally {
    if (signal) {
      signal.removeEventListener('abort', onAbort);
    }
  }
}

export function buildImageProxyUrl(url = '', opts = {}) {
  const target = String(url || '').trim();
  if (!target) return IMG_FALLBACK;
  if (target.startsWith('data:')) return target;

  const width = Math.max(0, Math.min(1600, Number(opts.width) || 0));
  const quality = Math.max(40, Math.min(90, Number(opts.quality) || 0));

  const query = new URLSearchParams({ url: target });
  if (width) query.set('w', String(width));
  if (quality) query.set('q', String(quality));

  const key = `${target}::w=${width}::q=${quality}`;
  const hit = getCache('imageProxy', key);
  if (hit) return hit;

  const proxy = `/img-proxy?${query.toString()}`;
  setCache('imageProxy', key, proxy, CACHE_TTL.IMAGE_PROXY);
  return proxy;
}

function resolveImageUrl(value = '', imageBase = '') {
  const raw = String(value || '').trim();
  if (!raw) return IMG_FALLBACK;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return buildImageProxyUrl(raw);
  if (raw.startsWith('//')) return buildImageProxyUrl(`https:${raw}`);

  const base = String(imageBase || '').replace(/\/+$/, '');
  const suffix = raw.replace(/^\/+/, '');
  return buildImageProxyUrl(base ? `${base}/${suffix}` : raw);
}

function normalizeCategories(category) {
  if (!Array.isArray(category)) return [];
  return category
    .map((item) => ({
      slug: String(item?.slug || '').trim(),
      name: String(item?.name || '').trim()
    }))
    .filter((item) => item.slug || item.name);
}

export function normalizeMovie(item = {}, imageBase = '') {
  const name = String(item.name || '').trim();
  const originName = String(item.origin_name || '').trim();

  return {
    slug: String(item.slug || '').trim(),
    name,
    originName,
    year: String(item.year || '').trim(),
    quality: String(item.quality || '').trim(),
    episodeCurrent: String(item.episode_current || '').trim(),
    episodeTotal: String(item.episode_total || '').trim(),
    time: String(item.time || '').trim(),
    lang: String(item.lang || '').trim(),
    type: String(item.type || '').trim(),
    country: String(item.country?.[0]?.name || '').trim(),
    thumb: resolveImageUrl(item.thumb_url, imageBase),
    poster: resolveImageUrl(item.poster_url || item.thumb_url, imageBase),
    categories: normalizeCategories(item.category),
    content: stripHtml(item.content || ''),
    searchText: `${name} ${originName} ${stripHtml(item.content || '')}`.toLowerCase(),
    raw: item
  };
}

export function normalizeMovieListResponse(payload = {}) {
  const dataRoot = payload?.data && typeof payload.data === 'object' ? payload.data : payload;
  const imageBase = String(dataRoot.pathImage || dataRoot.APP_DOMAIN_CDN_IMAGE || '').trim();
  const items = Array.isArray(dataRoot.items) ? dataRoot.items : [];

  return {
    items: items.map((item) => normalizeMovie(item, imageBase)).filter((item) => item.slug),
    imageBase,
    pagination: dataRoot?.params?.pagination || dataRoot?.pagination || null
  };
}

function normalizeEpisodeServer(server = {}) {
  const list = Array.isArray(server.server_data)
    ? server.server_data
    : Array.isArray(server.items)
      ? server.items
      : [];

  return {
    name: String(server.server_name || server.name || '').trim() || 'Server',
    items: list
      .map((ep) => ({
        name: String(ep.name || '').trim() || 'Táº­p',
        slug: String(ep.slug || '').trim(),
        linkM3u8: String(ep.link_m3u8 || ep.m3u8 || '').trim(),
        linkEmbed: String(ep.link_embed || ep.embed || '').trim()
      }))
      .filter((ep) => ep.slug || ep.linkM3u8 || ep.linkEmbed)
  };
}

export function normalizeMovieDetailResponse(payload = {}) {
  const dataRoot = payload?.movie || payload?.data?.movie || payload?.data || payload || {};
  const imageBase = String(payload?.pathImage || payload?.data?.APP_DOMAIN_CDN_IMAGE || payload?.data?.pathImage || '').trim();
  const movie = normalizeMovie(dataRoot, imageBase);

  const episodesRaw = Array.isArray(payload?.episodes)
    ? payload.episodes
    : Array.isArray(payload?.data?.episodes)
      ? payload.data.episodes
      : [];

  const episodes = episodesRaw
    .map(normalizeEpisodeServer)
    .filter((server) => server.items.length > 0);

  return {
    movie,
    episodes,
    imageBase
  };
}

export function getFirstEpisode(episodes = []) {
  const server = episodes.find((item) => item.items.length > 0);
  if (!server) return null;
  return { serverName: server.name, episode: server.items[0] };
}

export async function fetchHomeLatest(page = 1, { signal, force = false } = {}) {
  const url = `${API_SOURCE.latest}${Math.max(1, Number(page) || 1)}`;
  const data = await fetchJSON(url, {
    signal,
    timeoutMs: REQUEST_TIMEOUT.DEFAULT,
    cacheNamespace: 'home',
    cacheKey: `latest:${page}`,
    cacheTTL: CACHE_TTL.HOME,
    force
  });
  return normalizeMovieListResponse(data);
}

export async function fetchCategory(category, page = 1, { signal, force = false } = {}) {
  const base = API_SOURCE.categories[category];
  if (!base) throw new Error('CATEGORY_NOT_SUPPORTED');

  const normalizedPage = Math.max(1, Number(page) || 1);
  const url = `${base}${normalizedPage}`;
  const data = await fetchJSON(url, {
    signal,
    timeoutMs: REQUEST_TIMEOUT.DEFAULT,
    cacheNamespace: 'home',
    cacheKey: `${category}:${normalizedPage}`,
    cacheTTL: CACHE_TTL.HOME,
    force
  });
  return normalizeMovieListResponse(data);
}

export async function fetchMovieDetail(slug, { signal, force = false } = {}) {
  const movieSlug = String(slug || '').trim();
  if (!movieSlug) throw new Error('INVALID_SLUG');

  const url = `${API_SOURCE.detail}${encodeURIComponent(movieSlug)}`;
  const data = await fetchJSON(url, {
    signal,
    timeoutMs: REQUEST_TIMEOUT.DETAIL,
    cacheNamespace: 'detail',
    cacheKey: movieSlug,
    cacheTTL: CACHE_TTL.DETAIL,
    force
  });

  return normalizeMovieDetailResponse(data);
}

export async function searchMovies(keyword, { signal, force = false } = {}) {
  const q = String(keyword || '').trim();
  if (!q) return { items: [], imageBase: '' };

  if (q.toLowerCase().startsWith('category:')) {
    const category = q.split(':')[1]?.trim();
    if (category && API_SOURCE.categories[category]) {
      return fetchCategory(category, 1, { signal, force });
    }
  }

  const url = `${API_SOURCE.search}${encodeURIComponent(q)}`;

  const data = await fetchJSON(url, {
    signal,
    timeoutMs: REQUEST_TIMEOUT.SEARCH,
    cacheNamespace: 'search',
    cacheKey: q.toLowerCase(),
    cacheTTL: CACHE_TTL.SEARCH,
    force
  });

  return normalizeMovieListResponse(data);
}

export async function fetchTmdbMeta(title, year, { signal, force = false } = {}) {
  const normalizedTitle = String(title || '').trim();
  if (!normalizedTitle) return null;

  const key = `${normalizedTitle.toLowerCase()}::${String(year || '').trim()}`;
  if (!force) {
    const hit = getCache('tmdb', key);
    if (hit !== null) return hit;
  }

  const query = new URLSearchParams({ title: normalizedTitle });
  if (year) query.set('year', String(year));

  try {
    const payload = await fetchJSON(`/api/tmdb-meta?${query.toString()}`, {
      signal,
      timeoutMs: REQUEST_TIMEOUT.TMDB,
      cacheNamespace: null,
      force
    });

    if (!payload?.ok) {
      setCache('tmdb', key, null, CACHE_TTL.TMDB_ERROR, { allowNull: true });
      return null;
    }

    const meta = payload.data || null;
    if (!meta) {
      setCache('tmdb', key, null, CACHE_TTL.TMDB_ERROR, { allowNull: true });
      return null;
    }

    const normalized = {
      tmdbId: meta.tmdbId || null,
      title: String(meta.title || ''),
      overview: String(meta.overview || ''),
      year: String(meta.year || ''),
      poster: meta.poster ? buildImageProxyUrl(meta.poster) : '',
      backdrop: meta.backdrop ? buildImageProxyUrl(meta.backdrop) : '',
      imdb: String(meta.imdb || ''),
      runtime: Number(meta.runtime) || 0,
      genres: Array.isArray(meta.genres) ? meta.genres.map((g) => String(g)).filter(Boolean) : [],
      cast: Array.isArray(meta.cast)
        ? meta.cast.map((actor) => ({
            id: actor?.id || null,
            name: String(actor?.name || ''),
            character: String(actor?.character || ''),
            avatar: actor?.avatar ? buildImageProxyUrl(actor.avatar, { width: 185, quality: 72 }) : ''
          })).filter((actor) => actor.name)
        : []
    };

    setCache('tmdb', key, normalized, CACHE_TTL.TMDB_META);
    return normalized;
  } catch (_) {
    setCache('tmdb', key, null, CACHE_TTL.TMDB_ERROR, { allowNull: true });
    return null;
  }
}

