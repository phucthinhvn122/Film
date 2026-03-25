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
