const VSMOV_BASE = 'https://vsmov.com/api';

const ALLOWED_PATHS = [
  '/danh-sach/phim-moi-cap-nhat',
  '/danh-sach',
  '/tim-kiem',
  '/phim/',
  '/v1/api/'
];

function isAllowedPath(path) {
  return ALLOWED_PATHS.some((allowed) => path.startsWith(allowed));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { path, ...queryParams } = req.query;
    const apiPath = Array.isArray(path) ? `/${path.join('/')}` : `/${path || ''}`;

    if (!isAllowedPath(apiPath)) {
      return res.status(400).json({ error: 'Invalid path' });
    }

    const queryString = new URLSearchParams(queryParams).toString();
    const targetUrl = `${VSMOV_BASE}${apiPath}${queryString ? `?${queryString}` : ''}`;

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer: 'https://vsmov.com/'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Upstream error: ${response.status}`,
        status: response.status
      });
    }

    const data = await response.json();

    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).json(data);
  } catch (error) {
    console.error('VSMov proxy error:', error);
    return res.status(502).json({ error: 'Proxy error', message: error.message });
  }
}
