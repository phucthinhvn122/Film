require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.disable('x-powered-by');
app.set('trust proxy', true);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true, uptime: process.uptime() });
});

function isAllowedRemoteUrl(raw) {
  try {
    const u = new URL(raw);
    if (!['http:', 'https:'].includes(u.protocol)) return false;
    return true;
  } catch (_) {
    return false;
  }
}

app.get('/img-proxy', async (req, res) => {
  const raw = String(req.query.url || '').trim();
  if (!raw || !isAllowedRemoteUrl(raw)) {
    return res.status(400).json({ error: 'Invalid image url' });
  }

  try {
    const upstream = await fetch(raw, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Referer': req.protocol + '://' + req.get('host') + '/'
      }
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Upstream status ${upstream.status}` });
    }

    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      return res.status(415).json({ error: 'Upstream is not an image' });
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=600');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    const arrayBuffer = await upstream.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (e) {
    res.status(502).json({ error: 'Failed to fetch upstream image' });
  }
});

// TMDB Logic port from api/tmdb-meta.js
const TMDB_API_KEY = process.env.TMDB_API_KEY || '';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p';
const tmdbCache = new Map();

function buildTmdbCacheKey(title = '', year = '') {
  return `${String(title).trim().toLowerCase()}::${String(year || '').trim()}`;
}

app.get('/api/tmdb-meta', async (req, res) => {
  const title = String(req.query.title || '').trim();
  const year = String(req.query.year || '').trim();

  if (!title) return res.status(400).json({ error: 'Missing title' });
  if (!TMDB_API_KEY) return res.status(500).json({ error: 'TMDB_API_KEY is missing' });

  const key = buildTmdbCacheKey(title, year);
  const now = Date.now();
  const hit = tmdbCache.get(key);
  if (hit && now < hit.expireAt) {
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({ source: 'cache', meta: hit.meta });
  }

  try {
    const searchParams = new URLSearchParams({
      api_key: TMDB_API_KEY,
      query: title,
      include_adult: 'false',
      language: 'vi-VN'
    });
    if (year) searchParams.set('year', year);

    const searchRes = await fetch(`${TMDB_BASE}/search/movie?${searchParams.toString()}`, { headers: { Accept: 'application/json' } });
    if (!searchRes.ok) throw new Error('Search failed');
    const searchData = await searchRes.json();
    const results = Array.isArray(searchData.results) ? searchData.results : [];

    let best = null;
    if (results[0]) {
      const item = results[0];
      let detail = null;
      try {
        const detParams = new URLSearchParams({ api_key: TMDB_API_KEY, language: 'vi-VN', append_to_response: 'credits' });
        const detRes = await fetch(`${TMDB_BASE}/movie/${item.id}?${detParams.toString()}`, { headers: { Accept: 'application/json' } });
        if (detRes.ok) detail = await detRes.json();
      } catch (_) {}

      const cast = detail && detail.credits && Array.isArray(detail.credits.cast)
        ? detail.credits.cast.slice(0, 8).map(c => ({
            id: c.id,
            name: c.name || '',
            character: c.character || '',
            avatar: c.profile_path ? `${TMDB_IMG}/w185${c.profile_path}` : ''
          }))
        : [];

      best = {
        tmdbId: item.id || null,
        title: item.title || item.original_title || '',
        overview: (detail && detail.overview) || item.overview || '',
        year: String(item.release_date || '').slice(0, 4) || '',
        poster: item.poster_path ? `${TMDB_IMG}/w500${item.poster_path}` : '',
        backdrop: item.backdrop_path ? `${TMDB_IMG}/w1280${item.backdrop_path}` : '',
        imdb: detail && detail.vote_average ? Number(detail.vote_average).toFixed(1) : '',
        runtime: detail && detail.runtime ? detail.runtime : '',
        genres: detail && Array.isArray(detail.genres) ? detail.genres.map(g => g.name).filter(Boolean) : [],
        cast
      };
    }

    tmdbCache.set(key, { meta: best, expireAt: now + 1000 * 60 * 60 * 6 });
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({ source: 'tmdb', meta: best });
  } catch (error) {
    return res.status(502).json({ error: 'Failed to fetch TMDB metadata' });
  }
});

app.use(express.static(path.join(__dirname), {
  extensions: ['html'],
  maxAge: '10m',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    } else if (/(\.js|\.css|\.png|\.jpg|\.jpeg|\.webp|\.svg|\.ico)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=86400');
    }
  }
}));

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
