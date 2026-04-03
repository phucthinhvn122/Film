const TMDB_API_KEY = String(process.env.TMDB_API_KEY || '').trim();
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p';
const REQUEST_TIMEOUT_MS = 10_000;

const SUCCESS_TTL_MS = 6 * 60 * 60 * 1000;
const ERROR_TTL_MS = 90 * 1000;

const cache = globalThis.__thinfilmTmdbMetaCache || new Map();
globalThis.__thinfilmTmdbMetaCache = cache;

function ok(res, data, status = 200) {
  return res.status(status).json({ ok: true, data });
}

function fail(res, status, code, error, details) {
  return res.status(status).json({
    ok: false,
    code,
    error,
    details: details || null
  });
}

function cacheKey(title, year) {
  return `${String(title || '').trim().toLowerCase()}::${String(year || '').trim()}`;
}

function getFromCache(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cache.delete(key);
    return null;
  }
  return hit;
}

function setCache(key, payload, ttlMs) {
  cache.set(key, {
    payload,
    expiresAt: Date.now() + ttlMs
  });
}

async function fetchWithTimeout(url, init = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(init.headers || {})
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

function normalizeMeta(searchItem = {}, detail = null) {
  const cast = Array.isArray(detail?.credits?.cast)
    ? detail.credits.cast.slice(0, 8).map((actor) => ({
        id: actor.id || null,
        name: actor.name || '',
        character: actor.character || '',
        avatar: actor.profile_path ? `${TMDB_IMG}/w185${actor.profile_path}` : ''
      }))
    : [];

  return {
    tmdbId: searchItem.id || null,
    title: searchItem.title || searchItem.original_title || '',
    overview: detail?.overview || searchItem.overview || '',
    year: String(searchItem.release_date || '').slice(0, 4) || '',
    poster: searchItem.poster_path ? `${TMDB_IMG}/w500${searchItem.poster_path}` : '',
    backdrop: searchItem.backdrop_path ? `${TMDB_IMG}/w1280${searchItem.backdrop_path}` : '',
    imdb: detail?.vote_average ? Number(detail.vote_average).toFixed(1) : '',
    runtime: Number(detail?.runtime) || 0,
    genres: Array.isArray(detail?.genres) ? detail.genres.map((g) => g.name).filter(Boolean) : [],
    cast
  };
}

async function tmdbSearchMovie(title, year) {
  const params = new URLSearchParams({
    api_key: TMDB_API_KEY,
    query: title,
    include_adult: 'false',
    language: 'vi-VN'
  });
  if (year) params.set('year', String(year));

  const response = await fetchWithTimeout(`${TMDB_BASE}/search/movie?${params.toString()}`);
  return response;
}

async function tmdbFetchMovieDetail(tmdbId) {
  const params = new URLSearchParams({
    api_key: TMDB_API_KEY,
    language: 'vi-VN',
    append_to_response: 'credits'
  });

  const response = await fetchWithTimeout(`${TMDB_BASE}/movie/${tmdbId}?${params.toString()}`);
  return response;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return fail(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
  }

  if (!TMDB_API_KEY) {
    return fail(res, 500, 'CONFIG_ERROR', 'Missing TMDB_API_KEY environment variable');
  }

  const title = String(req.query.title || '').trim();
  const year = String(req.query.year || '').trim();

  if (!title) {
    return fail(res, 400, 'VALIDATION_ERROR', 'Query parameter "title" is required');
  }

  const key = cacheKey(title, year);
  const hit = getFromCache(key);
  if (hit) {
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res.status(hit.payload.status).json(hit.payload.body);
  }

  try {
    const searchResponse = await tmdbSearchMovie(title, year);
    if (searchResponse.status === 429) {
      const body = { ok: false, code: 'RATE_LIMIT', error: 'TMDB rate limit exceeded', details: null };
      setCache(key, { status: 429, body }, ERROR_TTL_MS);
      return res.status(429).json(body);
    }

    if (!searchResponse.ok) {
      const body = {
        ok: false,
        code: 'UPSTREAM_ERROR',
        error: `TMDB search failed with status ${searchResponse.status}`,
        details: null
      };
      setCache(key, { status: 502, body }, ERROR_TTL_MS);
      return res.status(502).json(body);
    }

    const searchData = await searchResponse.json();
    const first = Array.isArray(searchData?.results) ? searchData.results[0] : null;

    if (!first) {
      const body = { ok: false, code: 'NOT_FOUND', error: 'No TMDB result found for this title', details: null };
      setCache(key, { status: 404, body }, ERROR_TTL_MS);
      return res.status(404).json(body);
    }

    let detailData = null;
    try {
      const detailResponse = await tmdbFetchMovieDetail(first.id);
      if (detailResponse.ok) {
        detailData = await detailResponse.json();
      }
    } catch (_) {
      detailData = null;
    }

    const body = { ok: true, data: normalizeMeta(first, detailData) };
    setCache(key, { status: 200, body }, SUCCESS_TTL_MS);
    res.setHeader('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=604800');
    return ok(res, body.data);
  } catch (error) {
    const code = error?.name === 'AbortError' ? 'NETWORK_TIMEOUT' : 'NETWORK_ERROR';
    const status = error?.name === 'AbortError' ? 504 : 502;
    const body = {
      ok: false,
      code,
      error: code === 'NETWORK_TIMEOUT' ? 'TMDB request timeout' : 'Cannot connect to TMDB',
      details: null
    };
    setCache(key, { status, body }, ERROR_TTL_MS);
    return res.status(status).json(body);
  }
}
