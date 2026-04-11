import {
  API_BASES,
  CACHE_TTL,
  IMG_FALLBACK,
  REQUEST_TIMEOUT
} from './config.js';
import { readCache, setCache } from './cache.js';
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

const CATEGORY_TYPE_MAP = {
  'phim-bo': 'phim-bo',
  'phim-le': 'phim-le',
  'hoat-hinh': 'hoat-hinh',
  'tv-shows': 'tv-shows'
};

function uniqueUrls(urls = []) {
  return Array.from(new Set(urls.map((url) => String(url || '').trim()).filter(Boolean)));
}

function shouldTryAlternateSource(error, attemptIndex, totalAttempts) {
  if (attemptIndex >= totalAttempts - 1) return false;

  const code = String(error?.message || '').trim();
  if (!code || code === 'REQUEST_ABORTED' || code === 'INVALID_SLUG' || code === 'CATEGORY_NOT_SUPPORTED') {
    return false;
  }

  if (error?.status === 404) {
    const contentType = String(error?.responseContentType || '').toLowerCase();
    return !contentType.includes('application/json');
  }

  return true;
}

function buildVsmovUrls(pathname = '') {
  const normalizedPath = String(pathname || '').startsWith('/') ? String(pathname || '') : `/${String(pathname || '')}`;
  return uniqueUrls(API_BASES.map((base) => `${base}${normalizedPath}`));
}

async function fetchVsmovJSON(pathname, options = {}) {
  const urls = buildVsmovUrls(pathname);
  let lastError = null;

  for (let index = 0; index < urls.length; index += 1) {
    try {
      return await fetchJSON(urls[index], options);
    } catch (error) {
      lastError = error;
      if (!shouldTryAlternateSource(error, index, urls.length)) {
        throw error;
      }
    }
  }

  throw lastError || new Error('NETWORK_ERROR');
}

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
    const hit = readCache(cacheNamespace, key);
    if (hit.hit) return hit.value;
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
      err.url = url;
      err.responseContentType = response.headers.get('content-type') || '';
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

export function buildImageProxyUrl(url = '') {
  const target = String(url || '').trim();
  if (!target) return IMG_FALLBACK;
  if (target.startsWith('data:')) return target;
  return target;
}

function resolveImageUrl(value = '', imageBase = '') {
  const raw = String(value || '').trim();
  if (!raw) return IMG_FALLBACK;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return buildImageProxyUrl(raw);
  if (raw.startsWith('//')) return buildImageProxyUrl(`https:${raw}`);

  if (imageBase) {
    const base = String(imageBase).endsWith('/') ? imageBase : `${imageBase}/`;
    return buildImageProxyUrl(`${base}${raw}`);
  }

  return buildImageProxyUrl(raw);
}

function normalizeCategories(category) {
  if (Array.isArray(category)) {
    return category
      .map((item) => ({
        slug: String(item?.slug || '').trim(),
        name: String(item?.name || '').trim()
      }))
      .filter((item) => item.slug || item.name);
  }

  if (category && typeof category === 'object') {
    const groups = Object.values(category);
    const flat = [];
    groups.forEach((group) => {
      const list = Array.isArray(group?.list) ? group.list : [];
      list.forEach((item) => {
        const slug = String(item?.slug || '').trim();
        const name = String(item?.name || '').trim();
        if (slug || name) flat.push({ slug, name });
      });
    });
    return flat;
  }

  return [];
}

export function normalizeMovie(item = {}, imageBase = '') {
  const name = String(item.name || '').trim();
  const originName = String(item.origin_name || item.original_name || '').trim();
  const contentText = stripHtml(item.content || item.description || '');

  // VSMov: poster_url = thumbnail (small), thumb_url = poster (large)
  // We swap them so that 'thumb' = small card image, 'poster' = large hero/detail image
  const rawThumb = String(item.poster_url || '').trim();
  const rawPoster = String(item.thumb_url || item.poster_url || '').trim();

  return {
    slug: String(item.slug || '').trim(),
    name,
    originName,
    status: String(item.status || '').trim(),
    year: String(item.year || item.release_year || '').trim(),
    quality: String(item.quality || '').trim(),
    episodeCurrent: String(item.episode_current || item.current_episode || '').trim(),
    episodeTotal: String(item.episode_total || item.total_episodes || '').trim(),
    time: String(item.time || '').trim(),
    lang: String(item.lang || item.language || '').trim(),
    type: String(item.type || '').trim(),
    country: String(item.country?.[0]?.name || item.nation?.[0]?.name || '').trim(),
    thumb: resolveImageUrl(rawThumb, imageBase),
    poster: resolveImageUrl(rawPoster, imageBase),
    categories: normalizeCategories(item.category),
    content: contentText,
    searchText: `${name} ${originName} ${contentText}`.toLowerCase(),
    raw: item
  };
}

export function normalizeMovieListResponse(payload = {}) {
  const items = Array.isArray(payload?.items)
    ? payload.items
    : Array.isArray(payload?.data?.items)
      ? payload.data.items
      : [];

  const imageBase = String(payload?.data?.APP_DOMAIN_CDN_IMAGE || payload?.data?.pathImage || payload?.APP_DOMAIN_CDN_IMAGE || payload?.pathImage || '').trim();

  return {
    items: items.map((item) => normalizeMovie(item, imageBase)).filter((item) => item.slug),
    imageBase,
    pagination: payload?.pagination || payload?.data?.params?.pagination || payload?.data?.pagination || null
  };
}

function normalizeEpisodeServer(server = {}) {
  // VSMov uses server_data, NguonC used items
  const list = Array.isArray(server.server_data)
    ? server.server_data
    : Array.isArray(server.items)
      ? server.items
      : [];

  return {
    name: String(server.server_name || server.name || '').trim() || 'Server',
    items: list
      .map((ep) => ({
        name: String(ep.name || '').trim() || 'Tập',
        slug: String(ep.slug || '').trim(),
        linkM3u8: String(ep.link_m3u8 || ep.m3u8 || '').trim(),
        linkEmbed: String(ep.link_embed || ep.embed || '').trim()
      }))
      .filter((ep) => ep.slug || ep.linkM3u8 || ep.linkEmbed)
  };
}

export function normalizeMovieDetailResponse(payload = {}) {
  // VSMov: { status, movie, episodes }
  // V1 Detail: { status, data: { movie, episodes, pathImage } }
  const movieRaw = payload?.movie || payload?.data?.movie || payload?.data || payload || {};
  const imageBase = String(payload?.data?.pathImage || payload?.pathImage || '').trim();
  const movie = normalizeMovie(movieRaw, imageBase);

  const episodesRaw = Array.isArray(payload?.episodes)
    ? payload.episodes
    : Array.isArray(payload?.movie?.episodes)
      ? payload.movie.episodes
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
  const normalizedPage = Math.max(1, Number(page) || 1);
  const data = await fetchVsmovJSON(`/danh-sach/phim-moi-cap-nhat?page=${normalizedPage}`, {
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
  const normalizedPage = Math.max(1, Number(page) || 1);
  const type = CATEGORY_TYPE_MAP[category];
  if (!type) throw new Error('CATEGORY_NOT_SUPPORTED');

  const data = await fetchVsmovJSON(`/v1/api/danh-sach/${encodeURIComponent(type)}?page=${normalizedPage}`, {
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

  const data = await fetchVsmovJSON(`/phim/${encodeURIComponent(movieSlug)}`, {
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
    if (category && CATEGORY_TYPE_MAP[category]) {
      return fetchCategory(category, 1, { signal, force });
    }
  }

  const data = await fetchVsmovJSON(`/v1/api/tim-kiem?keyword=${encodeURIComponent(q)}`, {
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
    const hit = readCache('tmdb', key);
    if (hit.hit) return hit.value;
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
            avatar: actor?.avatar ? buildImageProxyUrl(actor.avatar) : ''
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
