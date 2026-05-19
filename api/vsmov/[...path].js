const UPSTREAM_BASE = 'https://phimapi.com';
const REQUEST_TIMEOUT_MS = 15000;

const ALLOWED_PATH_PREFIXES = [
  '/danh-sach/phim-moi-cap-nhat',
  '/v1/api/danh-sach/',
  '/v1/api/tim-kiem',
  '/phim/'
];

function isAllowedPath(path) {
  return ALLOWED_PATH_PREFIXES.some((allowed) => path === allowed || path.startsWith(allowed));
}

function buildQueryString(queryParams = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(queryParams)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, String(item)));
    } else {
      params.append(key, String(value));
    }
  }
  return params.toString();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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

  if (cleanSegments.some((seg) => seg === '..' || seg === '.' || seg.includes('\\'))) {
    return res.status(400).json({ error: 'INVALID_PATH_SEGMENT' });
  }

  const apiPath = `/${cleanSegments.join('/')}`;

  if (!isAllowedPath(apiPath)) {
    return res.status(400).json({ error: 'INVALID_PATH', path: apiPath });
  }

  const queryString = buildQueryString(queryParams);
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

    const contentType = response.headers.get('content-type') || '';

    if (!response.ok) {
      return res.status(response.status).json({
        error: `UPSTREAM_${response.status}`,
        status: response.status,
        url: targetUrl
      });
    }

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
      error: isAbort ? 'UPSTREAM_TIMEOUT' : 'PROXY_ERROR',
      message: String(error?.message || '')
    });
  } finally {
    clearTimeout(timer);
  }
}
