const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 80;

// In-memory limiter cho serverless warm instance (best-effort)
const hitStore = globalThis.__imgProxyRateStore || new Map();
globalThis.__imgProxyRateStore = hitStore;

function getClientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf) return xf.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function checkRateLimit(key) {
  const now = Date.now();
  const current = hitStore.get(key);
  if (!current || now > current.resetAt) {
    const next = { count: 1, resetAt: now + RATE_WINDOW_MS };
    hitStore.set(key, next);
    return { ok: true, remaining: RATE_MAX - 1, resetAt: next.resetAt };
  }

  current.count += 1;
  const ok = current.count <= RATE_MAX;
  return { ok, remaining: Math.max(0, RATE_MAX - current.count), resetAt: current.resetAt };
}

function isAllowedImageHost(hostname = '') {
  // Chặn localhost/private network để tránh SSRF cơ bản
  const h = String(hostname || '').toLowerCase();
  if (!h) return false;
  if (h === 'localhost' || h.endsWith('.local')) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    if (h.startsWith('10.') || h.startsWith('127.') || h.startsWith('192.168.')) return false;
    const second = Number(h.split('.')[1] || 0);
    if (h.startsWith('172.') && second >= 16 && second <= 31) return false;
  }
  return true;
}

function parseAndValidateTarget(rawUrl) {
  try {
    const u = new URL(String(rawUrl || '').trim());
    if (!ALLOWED_PROTOCOLS.has(u.protocol)) return null;
    if (!isAllowedImageHost(u.hostname)) return null;
    return u;
  } catch (_) {
    return null;
  }
}

function checkHotlink(req) {
  const referer = String(req.headers.referer || '');
  const origin = String(req.headers.origin || '');
  const host = String(req.headers.host || '');

  // Cho phép khi không có referer/origin (một số browser/app privacy mode)
  if (!referer && !origin) return true;

  try {
    if (referer) {
      const r = new URL(referer);
      if (r.host === host) return true;
    }
    if (origin) {
      const o = new URL(origin);
      if (o.host === host) return true;
    }
  } catch (_) {
    return false;
  }

  return false;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = getClientIp(req);
  const rl = checkRateLimit(ip);
  res.setHeader('X-RateLimit-Limit', String(RATE_MAX));
  res.setHeader('X-RateLimit-Remaining', String(rl.remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.floor(rl.resetAt / 1000)));

  if (!rl.ok) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  if (!checkHotlink(req)) {
    return res.status(403).json({ error: 'Hotlink blocked' });
  }

  const target = parseAndValidateTarget(req.query.url);
  if (!target) {
    return res.status(400).json({ error: 'Invalid image url' });
  }

  const width = Math.max(0, Math.min(1800, Number(req.query.w || 0) || 0));
  const quality = Math.max(40, Math.min(90, Number(req.query.q || 72) || 72));

  try {
    const upstream = await fetch(target.toString(), {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
      }
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Upstream status ${upstream.status}` });
    }

    const ct = upstream.headers.get('content-type') || 'image/jpeg';
    if (!ct.startsWith('image/')) {
      return res.status(415).json({ error: 'Upstream is not an image' });
    }

    // Passthrough tối ưu: hint cho Vercel Edge cache theo biến thể w/q
    const cacheControl = upstream.headers.get('cache-control') || 'public, max-age=86400, stale-while-revalidate=604800';
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', cacheControl);
    res.setHeader('Vary', 'Accept');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    if (width > 0) res.setHeader('X-Image-Width-Hint', String(width));
    if (quality > 0) res.setHeader('X-Image-Quality-Hint', String(quality));

    const arr = await upstream.arrayBuffer();
    return res.status(200).send(Buffer.from(arr));
  } catch (_) {
    return res.status(502).json({ error: 'Failed to fetch upstream image' });
  }
}
