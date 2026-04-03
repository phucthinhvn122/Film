const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 80;

// NOTE:
// - This limiter is in-memory only (best-effort for warm instances).
// - On cold start, counters reset.
// - CDN-level abuse protection should still be configured at platform level.
const hitStore = globalThis.__thinfilmImgProxyRateStore || new Map();
globalThis.__thinfilmImgProxyRateStore = hitStore;

function ok(res, buffer, headers = {}) {
  Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));
  return res.status(200).send(buffer);
}

function fail(res, status, code, error, details) {
  return res.status(status).json({
    ok: false,
    code,
    error,
    details: details || null
  });
}

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
  return {
    ok: current.count <= RATE_MAX,
    remaining: Math.max(0, RATE_MAX - current.count),
    resetAt: current.resetAt
  };
}

function isAllowedImageHost(hostname = '') {
  const host = String(hostname || '').toLowerCase();
  if (!host) return false;
  if (host === 'localhost' || host.endsWith('.local')) return false;

  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    if (host.startsWith('10.') || host.startsWith('127.') || host.startsWith('192.168.')) return false;
    const second = Number(host.split('.')[1] || 0);
    if (host.startsWith('172.') && second >= 16 && second <= 31) return false;
  }

  return true;
}

function parseTargetUrl(rawUrl) {
  try {
    const url = new URL(String(rawUrl || '').trim());
    if (!ALLOWED_PROTOCOLS.has(url.protocol)) return null;
    if (!isAllowedImageHost(url.hostname)) return null;
    return url;
  } catch (_) {
    return null;
  }
}

function checkHotlink(req) {
  const referer = String(req.headers.referer || '');
  const origin = String(req.headers.origin || '');
  const host = String(req.headers.host || '');

  // Allow requests that intentionally hide referer/origin (privacy mode / app webview).
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
    return fail(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
  }

  const ip = getClientIp(req);
  const rate = checkRateLimit(ip);
  res.setHeader('X-RateLimit-Limit', String(RATE_MAX));
  res.setHeader('X-RateLimit-Remaining', String(rate.remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.floor(rate.resetAt / 1000)));

  if (!rate.ok) {
    console.warn('[img-proxy] Rate limit exceeded', { ip });
    return fail(res, 429, 'RATE_LIMIT', 'Too many requests');
  }

  if (!checkHotlink(req)) {
    console.warn('[img-proxy] Hotlink blocked', { ip, referer: req.headers.referer, origin: req.headers.origin });
    return fail(res, 403, 'HOTLINK_BLOCKED', 'Hotlink blocked');
  }

  const target = parseTargetUrl(req.query.url);
  if (!target) {
    return fail(res, 400, 'INVALID_URL', 'Invalid image url');
  }

  const width = Math.max(0, Math.min(1800, Number(req.query.w || 0) || 0));
  const quality = Math.max(40, Math.min(90, Number(req.query.q || 72) || 72));

  try {
    const upstream = await fetch(target.toString(), {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'ThinFilm-ImageProxy/2.0',
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
      }
    });

    if (!upstream.ok) {
      console.warn('[img-proxy] Upstream image request failed', {
        target: target.toString(),
        status: upstream.status
      });
      return fail(res, upstream.status, 'UPSTREAM_ERROR', `Upstream status ${upstream.status}`);
    }

    const contentType = upstream.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      console.warn('[img-proxy] Upstream response is not image', {
        target: target.toString(),
        contentType
      });
      return fail(res, 415, 'UNSUPPORTED_MEDIA', 'Upstream is not an image');
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());

    return ok(res, buffer, {
      'Content-Type': contentType,
      'Cache-Control': 'public, s-maxage=604800, max-age=86400, stale-while-revalidate=2592000',
      Vary: 'Accept',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'X-Image-Width-Hint': String(width),
      'X-Image-Quality-Hint': String(quality)
    });
  } catch (error) {
    console.error('[img-proxy] Unexpected failure', {
      target: target.toString(),
      message: error?.message || String(error)
    });
    return fail(res, 502, 'NETWORK_ERROR', 'Failed to fetch upstream image');
  }
}
