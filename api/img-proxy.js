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

  // Opportunistically prune expired entries to avoid unbounded growth on warm instances.
  if (hitStore.size > 256) {
    for (const [k, v] of hitStore) {
      if (now > v.resetAt) hitStore.delete(k);
    }
  }

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

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata',
  'metadata.google.internal',
  'instance-data',
  'instance-data.ec2.internal'
]);

function isAllowedImageHost(hostname = '') {
  const host = String(hostname || '').toLowerCase();
  if (!host) return false;
  if (BLOCKED_HOSTNAMES.has(host)) return false;
  if (host.endsWith('.local') || host.endsWith('.internal')) return false;

  // IPv4 ranges (private + link-local + loopback + cloud metadata).
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const parts = host.split('.').map(Number);
    const [a, b] = parts;
    if (a === 10) return false;             // 10.0.0.0/8
    if (a === 127) return false;            // 127.0.0.0/8 loopback
    if (a === 0) return false;              // 0.0.0.0/8
    if (a === 169 && b === 254) return false; // 169.254.0.0/16 link-local + AWS/GCP metadata
    if (a === 192 && b === 168) return false; // 192.168.0.0/16
    if (a === 172 && b >= 16 && b <= 31) return false; // 172.16.0.0/12
    if (a >= 224) return false;             // multicast + reserved
  }

  // IPv6 — block loopback / link-local / unique-local.
  if (host.includes(':')) {
    if (host === '::1' || host === '::') return false;
    if (host.startsWith('fe80:') || host.startsWith('fe80::')) return false; // link-local
    if (/^f[cd][0-9a-f]{2}:/.test(host)) return false; // fc00::/7 unique-local
    if (host.startsWith('::ffff:')) {
      const ipv4 = host.slice(7);
      return isAllowedImageHost(ipv4);
    }
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

  // Nếu có width, thêm vào URL query (CDN resizing nếu hỗ trợ)
  let fetchUrl = target.toString();
  if (width > 0) {
    const urlObj = new URL(fetchUrl);
    if (urlObj.hostname.includes('tmdb.org')) {
      const pathParts = urlObj.pathname.split('/');
      const tIdx = pathParts.indexOf('t');
      if (tIdx > 0 && pathParts[tIdx + 1] === 'p' && pathParts[tIdx + 2]?.startsWith('w')) {
        pathParts[tIdx + 2] = `w${width}`;
        urlObj.pathname = pathParts.join('/');
        fetchUrl = urlObj.toString();
      }
    } else if (fetchUrl.includes('/uploads/')) {
      urlObj.searchParams.set('w', String(width));
      urlObj.searchParams.set('q', String(quality));
      fetchUrl = urlObj.toString();
    }
  }

  try {
    const upstream = await fetch(fetchUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'ThinFilm-ImageProxy/2.0',
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
      }
    });

    if (!upstream.ok) {
      console.warn('[img-proxy] Upstream image request failed', {
        target: fetchUrl,
        status: upstream.status
      });
      return fail(res, upstream.status, 'UPSTREAM_ERROR', `Upstream status ${upstream.status}`);
    }

    const contentType = upstream.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      console.warn('[img-proxy] Upstream response is not image', {
        target: fetchUrl,
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
      target: fetchUrl,
      message: error?.message || String(error)
    });
    return fail(res, 502, 'NETWORK_ERROR', 'Failed to fetch upstream image');
  }
}
