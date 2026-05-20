const UPSTREAM_BASE = 'https://phimapi.com';
const REQUEST_TIMEOUT_MS = 15000;

const ALLOWED_ORIGINS = new Set([
  'https://film.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173'
]);

function setCorsHeaders(req, res) {
  const origin = req.headers?.origin || '';
  const host = req.headers?.host || '';
  const sameOrigin = origin && host && origin.endsWith(host);
  if (sameOrigin || ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const { path, ...queryParams } = req.query || {};
  const segments = Array.isArray(path) ? path : (path ? [path] : []);
  const cleanSegments = segments
    .map((seg) => String(seg || '').replace(/^\/+|\/+$/g, ''))
    .filter(Boolean);

  if (!cleanSegments.length) {
    return res.status(400).json({ error: 'EMPTY_PATH' });
  }

  if (cleanSegments.some((seg) => seg === '..' || seg === '.' || seg.includes('\\'))) {
    return res.status(400).json({ error: 'INVALID_PATH_SEGMENT' });
  }

  const apiPath = `/${cleanSegments.join('/')}`;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(queryParams)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, String(item)));
    } else {
      params.append(key, String(value));
    }
  }
  const queryString = params.toString();
  const targetUrl = `${UPSTREAM_BASE}${apiPath}${queryString ? `?${queryString}` : ''}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer: `${UPSTREAM_BASE}/`
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `UPSTREAM_${response.status}`,
        status: response.status
      });
    }

    const contentType = response.headers.get('content-type') || '';

    if (!contentType.toLowerCase().includes('application/json')) {
      const text = await response.text();
      return res.status(502).json({ error: 'UPSTREAM_NON_JSON', sample: String(text || '').slice(0, 200) });
    }

    const data = await response.json();

    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).json(data);
  } catch (error) {
    const isAbort = error?.name === 'AbortError';
    return res.status(isAbort ? 504 : 502).json({
      error: isAbort ? 'UPSTREAM_TIMEOUT' : 'PROXY_ERROR'
    });
  } finally {
    clearTimeout(timer);
  }
}
