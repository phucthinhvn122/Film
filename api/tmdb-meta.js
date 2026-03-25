const TMDB_API_KEY = process.env.TMDB_API_KEY || '';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p';

const cache = globalThis.__tmdbMetaCache || new Map();
globalThis.__tmdbMetaCache = cache;

function buildCacheKey(title = '', year = '') {
  return `${String(title).trim().toLowerCase()}::${String(year || '').trim()}`;
}

async function searchTmdb(title, year) {
  const params = new URLSearchParams({
    api_key: TMDB_API_KEY,
    query: title,
    include_adult: 'false',
    language: 'vi-VN'
  });
  if (year) params.set('year', String(year));

  const res = await fetch(`${TMDB_BASE}/search/movie?${params.toString()}`, {
    headers: { Accept: 'application/json' }
  });
  if (!res.ok) throw new Error(`TMDB search failed: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data.results) ? data.results : [];
}

async function fetchMovieDetail(tmdbId) {
  const params = new URLSearchParams({
    api_key: TMDB_API_KEY,
    language: 'vi-VN',
    append_to_response: 'credits'
  });
  const res = await fetch(`${TMDB_BASE}/movie/${tmdbId}?${params.toString()}`, {
    headers: { Accept: 'application/json' }
  });
  if (!res.ok) throw new Error(`TMDB detail failed: ${res.status}`);
  return await res.json();
}

function toMeta(item = {}, detail = null) {
  const posterPath = item.poster_path || '';
  const backdropPath = item.backdrop_path || '';

  const cast = detail && detail.credits && Array.isArray(detail.credits.cast)
    ? detail.credits.cast.slice(0, 8).map(c => ({
        id: c.id,
        name: c.name || '',
        character: c.character || '',
        avatar: c.profile_path ? `${TMDB_IMG}/w185${c.profile_path}` : ''
      }))
    : [];

  return {
    tmdbId: item.id || null,
    title: item.title || item.original_title || '',
    overview: (detail && detail.overview) || item.overview || '',
    year: String(item.release_date || '').slice(0, 4) || '',
    poster: posterPath ? `${TMDB_IMG}/w500${posterPath}` : '',
    backdrop: backdropPath ? `${TMDB_IMG}/w1280${backdropPath}` : '',
    imdb: detail && detail.vote_average ? Number(detail.vote_average).toFixed(1) : '',
    runtime: detail && detail.runtime ? detail.runtime : '',
    genres: detail && Array.isArray(detail.genres) ? detail.genres.map(g => g.name).filter(Boolean) : [],
    cast
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const title = String(req.query.title || '').trim();
  const year = String(req.query.year || '').trim();

  if (!title) {
    return res.status(400).json({ error: 'Missing title' });
  }

  if (!TMDB_API_KEY) {
    return res.status(500).json({ error: 'TMDB_API_KEY is missing' });
  }

  const key = buildCacheKey(title, year);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now < hit.expireAt) {
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({ source: 'cache', meta: hit.meta });
  }

  try {
    const results = await searchTmdb(title, year);
    let best = null;

    if (results[0]) {
      try {
        const detail = await fetchMovieDetail(results[0].id);
        best = toMeta(results[0], detail);
      } catch (_) {
        best = toMeta(results[0], null);
      }
    }

    cache.set(key, {
      meta: best,
      expireAt: now + 1000 * 60 * 60 * 6
    });

    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({ source: 'tmdb', meta: best });
  } catch (error) {
    return res.status(502).json({ error: 'Failed to fetch TMDB metadata' });
  }
}
