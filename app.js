/* ---------- UTILS ---------- */
const $ = id => document.getElementById(id);
const qs = (sel, el=document) => el.querySelector(sel);
const IMG_FALLBACK = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect fill="%23222"/><text x="50%25" y="50%25" fill="%23555" font-size="14" text-anchor="middle" dominant-baseline="middle">No Image</text></svg>';

const scriptCache = new Map();
const manifestPrefetchCache = new Set();
const imageProxyCache = new Map();
function loadScriptOnce(src) {
  if (scriptCache.has(src)) return scriptCache.get(src);
  const p = new Promise((resolve, reject) => {
    const existed = document.querySelector(`script[src="${src}"]`);
    if (existed) {
      if (existed.dataset.loaded === '1') return resolve(true);
      existed.addEventListener('load', () => resolve(true), { once: true });
      existed.addEventListener('error', () => reject(new Error(`Failed to load script: ${src}`)), { once: true });
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.addEventListener('load', () => {
      s.dataset.loaded = '1';
      resolve(true);
    }, { once: true });
    s.addEventListener('error', () => reject(new Error(`Failed to load script: ${src}`)), { once: true });
    document.head.appendChild(s);
  });
  scriptCache.set(src, p);
  return p;
}

function buildImageProxyUrl(url='', opts = {}) {
  const u = String(url || '').trim();
  if (!u || u.startsWith('data:')) return u;

  const width = Number(opts.width || 0);
  const quality = Number(opts.quality || 0);
  const key = `${u}|w=${width || 0}|q=${quality || 0}`;
  if (imageProxyCache.has(key)) return imageProxyCache.get(key);

  const qp = new URLSearchParams({ url: u });
  if (width > 0) qp.set('w', String(Math.max(64, Math.min(1600, Math.round(width)))));
  if (quality > 0) qp.set('q', String(Math.max(40, Math.min(90, Math.round(quality)))));

  const proxied = `/img-proxy?${qp.toString()}`;
  imageProxyCache.set(key, proxied);
  return proxied;
}

function safeImg(url, base='', opts = {}) {
  if (!url) return IMG_FALLBACK;
  let resolved = '';
  if (url.startsWith('http')) resolved = url;
  else if (url.startsWith('//')) resolved = 'https:' + url;
  else resolved = base.replace(/\/$/, '') + '/' + url.replace(/^\//, '');

  // fallback-friendly: ưu tiên proxy để tránh 403 hotlink ảnh + resize mobile
  return buildImageProxyUrl(resolved, opts);
}

function el(tag, attrs={}, ...children) {
  const e = document.createElement(tag);
  for (const [k,v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e[k] = v;
    else e.setAttribute(k, v);
  }
  for (const c of children) {
    if (c == null) continue;
    e.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return e;
}

function lazyImg(src, cls='', fallback=IMG_FALLBACK) {
  const img = document.createElement('img');
  if(cls) img.className = cls + ' loading';
  else img.className = 'loading';
  const isPriority = String(cls || '').includes('detail-poster');
  const isCard = String(cls || '').includes('card-img') || String(cls || '').includes('hero-thumb');
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;
  const target = src || fallback;

  img.loading = isPriority ? 'eager' : 'lazy';
  img.decoding = isPriority ? 'sync' : 'async';
  img.fetchPriority = isPriority ? 'high' : (isCard ? 'low' : 'auto');
  img.referrerPolicy = 'no-referrer';

  if (target && target !== fallback) {
    const baseW = isPriority ? 420 : (isCard ? 220 : 280);
    const w1 = Math.max(120, Math.round(baseW * Math.min(2, dpr)));
    const w2 = Math.max(w1 + 80, Math.round(baseW * Math.min(3, dpr * 2)));
    const q = isPriority ? 78 : 64;
    const u1 = target.includes('/img-proxy?') ? `${target}&w=${w1}&q=${q}` : target;
    const u2 = target.includes('/img-proxy?') ? `${target}&w=${w2}&q=${q}` : target;

    img.src = u1;
    img.srcset = `${u1} 1x, ${u2} 2x`;
    img.sizes = isPriority ? '(max-width: 900px) 62vw, 420px' : '(max-width: 900px) 46vw, 220px';
  } else {
    img.src = target;
  }

  img.onerror = () => { if(img.src !== fallback) img.src = fallback; };
  img.onload = () => img.classList.remove('loading');
  return img;
}


function stripHtml(text='') {
  return String(text || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function escapeHtml(text = '') {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function highlightText(text = '', keyword = '') {
  const raw = String(text || '');
  const kw = String(keyword || '').trim();
  if (!kw) return escapeHtml(raw);
  const safeKw = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rg = new RegExp(`(${safeKw})`, 'ig');
  return escapeHtml(raw).replace(rg, '<mark class="hl">$1</mark>');
}

function loader() {
  return el('div', {class:'loader'}, el('div', {class:'spin'}));
}

function buildSearchSkeleton(count = 12) {
  const wrap = el('div', { class: 'search-skeleton' });
  const total = Math.max(4, Math.min(30, Number(count) || 12));
  for (let i = 0; i < total; i++) {
    const card = el('div', { class: 'skeleton-card' });
    card.appendChild(el('div', { class: 'skeleton-thumb' }));
    const info = el('div', { class: 'skeleton-info' });
    info.appendChild(el('div', { class: 'skeleton-line' }));
    info.appendChild(el('div', { class: 'skeleton-line short' }));
    card.appendChild(info);
    wrap.appendChild(card);
  }
  return wrap;
}

function renderCardsProgressively(gridEl, items = [], pageSize = 24, buildCardFn = null) {
  if (!gridEl) return;
  gridEl.innerHTML = '';
  if (!items.length) return;
  if (typeof buildCardFn !== 'function') return;

  const container = document.createDocumentFragment();
  const first = items.slice(0, pageSize);
  first.forEach(m => container.appendChild(buildCardFn(m)));
  gridEl.appendChild(container);

  if (items.length <= pageSize || !('IntersectionObserver' in window)) {
    const rest = document.createDocumentFragment();
    items.slice(pageSize).forEach(m => rest.appendChild(buildCardFn(m)));
    gridEl.appendChild(rest);
    return;
  }

  let cursor = pageSize;
  const sentinel = el('div', { style: 'grid-column:1/-1;height:1px' });
  gridEl.appendChild(sentinel);

  const io = new IntersectionObserver((entries) => {
    if (!entries.some(e => e.isIntersecting)) return;
    const next = items.slice(cursor, cursor + pageSize);
    if (!next.length) {
      io.disconnect();
      sentinel.remove();
      return;
    }
    const frag = document.createDocumentFragment();
    next.forEach(m => frag.appendChild(buildCardFn(m)));
    gridEl.insertBefore(frag, sentinel);
    cursor += pageSize;
  }, { rootMargin: '280px 0px' });

  io.observe(sentinel);
}

const CFG = {
  nguonphim: {
    name: 'NguonPhim',
    list: 'https://phim.nguonc.com/api/films/phim-moi-cap-nhat?page=',
    detail: 'https://phim.nguonc.com/api/film/',
    search: 'https://phim.nguonc.com/api/films/search?keyword=',
    cats: {
      'phim-bo': 'https://phim.nguonc.com/api/films/danh-sach/phim-bo?page=1',
      'phim-le': 'https://phim.nguonc.com/api/films/danh-sach/phim-le?page=1',
      'hoat-hinh': 'https://phim.nguonc.com/api/films/danh-sach/hoat-hinh?page=1',
      'tv-shows': 'https://phim.nguonc.com/api/films/danh-sach/tv-shows?page=1'
    },
    img: ''
  }
};

/* ---------- APP STATE ---------- */
const App = (() => {
  function toast(text) {
    const t = el('div', {
      style:'position:fixed;top:86px;left:50%;transform:translateX(-50%);z-index:9999;background:rgba(18,18,18,.9);border:1px solid rgba(255,255,255,.12);-webkit-backdrop-filter:blur(16px) saturate(180%);backdrop-filter:blur(16px) saturate(180%);color:#fff;padding:10px 14px;border-radius:14px;font-weight:700;box-shadow:0 18px 40px rgba(0,0,0,.55);opacity:0;animation:toastIn .22s ease forwards'
    }, text);
    document.body.appendChild(t);
    setTimeout(()=>{ try{t.remove();}catch(_){ if(t.parentNode) t.parentNode.removeChild(t);} }, 2500);
  }
  let src = 'nguonphim';
  const cache = new Map();
  let movieData = null; // current movie for watch
  let liveWatchCleanup = null; // cleanup handlers when switching episodes
  let liveHls = null;

  // branch nhỏ 1: control luồng request
  let homeAbort = null;
  let searchAbort = null;
  let currentSearchKeyword = '';
  const detailPrefetch = new Set();
  const searchResultCache = new Map();
  const localMoviesCache = new Map();
  const tmdbMetaCache = new Map();
  const SEARCH_CACHE_TTL = 5 * 60 * 1000;
  const SEARCH_CACHE_MAX = 24;

  function cfg() { return CFG[src]; }

  /* ---------- STORAGE ---------- */
  const HISTORY_KEY = 'devthinh:watchHistory';
  const HISTORY_MAX = 20;
  const FAVORITES_KEY = 'devthinh:favorites';
  const PREF_KEY = 'devthinh:preferences';
  const SEARCH_FILTERS_KEY = 'devthinh:searchFilters';
  const SEARCH_RECENT_KEY = 'devthinh:searchRecentKeywords';
  const SEARCH_COMPACT_KEY = 'devthinh:searchCompactMode';
  const SEARCH_ANALYTICS_KEY = 'devthinh:searchAnalytics';
  const PINNED_FILTERS_KEY = 'devthinh:pinnedSearchFilters';
  const SESSION_STATE_KEY = 'devthinh:sessionState';
  const PREF_SERVER_MODE_KEY = 'devthinh:serverMode';
  const QUALITY_LOCK_1080 = true;
  const PREF_SERVER_MEMORY_KEY = 'devthinh:serverMemory';
  const SKIP_MARKER_KEY = 'devthinh:skipMarkers';
  const WATCH_TOGETHER_KEY = 'devthinh:watchTogether';

  function fmtClock(seconds) {
    if (!seconds || !isFinite(seconds)) return '00:00';
    const s = Math.max(0, Math.floor(seconds));
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m < 10 ? '0' : ''}${m}:${sec < 10 ? '0' : ''}${sec}`;
  }

  function loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }

  function saveHistoryEntry(entry) {
    if (!entry || !entry.movieSlug || !entry.epSlug) return;
    const now = Date.now();
    const list = loadHistory();
    const k = `${entry.movieSlug}::${entry.epSlug}::${entry.srvName || ''}`;
    const idx = list.findIndex(x => (`${x.movieSlug}::${x.epSlug}::${x.srvName || ''}`) === k);
    const next = {
      movieSlug: entry.movieSlug,
      epSlug: entry.epSlug,
      srvName: entry.srvName || '',
      movieName: entry.movieName || '',
      epName: entry.epName || '',
      poster: entry.poster || '',
      progressSeconds: Number(entry.progressSeconds) || 0,
      updatedAt: now
    };
    if (idx >= 0) list[idx] = Object.assign({}, list[idx], next);
    else list.unshift(next);
    // Keep newest first
    list.sort((a,b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const trimmed = list.slice(0, HISTORY_MAX);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed)); } catch (_) {}
  }

  function clearHistory() {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify([])); } catch (_) {}
  }

  function loadFavorites() {
    try {
      const raw = localStorage.getItem(FAVORITES_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (_) { return []; }
  }

  function isFavorite(slug) {
    return loadFavorites().some(x => x.slug === slug);
  }

  function toggleFavorite(movie) {
    if (!movie || !movie.slug) return false;
    const list = loadFavorites();
    const idx = list.findIndex(x => x.slug === movie.slug);
    if (idx >= 0) {
      list.splice(idx, 1);
      try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(list)); } catch (_) {}
      return false;
    }
    list.unshift({
      slug: movie.slug,
      name: movie.name || '',
      year: movie.year || '',
      quality: movie.quality || movie.episode_current || 'HD',
      _thumb: movie._thumb || '',
      _poster: movie._poster || ''
    });
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(list.slice(0, 100))); } catch (_) {}
    return true;
  }

  function loadPrefs() {
    try {
      return JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {};
    } catch (_) { return {}; }
  }


  function loadServerMode() {
    try {
      const v = localStorage.getItem(PREF_SERVER_MODE_KEY) || 'auto';
      return ['auto', 'hcm', 'best'].includes(v) ? v : 'auto';
    } catch (_) {
      return 'auto';
    }
  }

  function saveServerMode(mode) {
    const v = ['auto', 'hcm', 'best'].includes(mode) ? mode : 'auto';
    try { localStorage.setItem(PREF_SERVER_MODE_KEY, v); } catch (_) {}
  }


  function loadQualityProfile() {
    return '1080';
  }

  function saveQualityProfile() {}

  function loadServerMemory() {
    try {
      const d = JSON.parse(localStorage.getItem(PREF_SERVER_MEMORY_KEY) || '{}') || {};
      return typeof d === 'object' ? d : {};
    } catch (_) { return {}; }
  }

  function saveServerMemory(map) {
    try { localStorage.setItem(PREF_SERVER_MEMORY_KEY, JSON.stringify(map || {})); } catch (_) {}
  }

  function rememberServer(movieSlug, serverName) {
    if (!movieSlug || !serverName) return;
    const m = loadServerMemory();
    m[movieSlug] = { name: serverName, ts: Date.now() };
    saveServerMemory(m);
  }

  function getRememberedServer(movieSlug) {
    if (!movieSlug) return '';
    const m = loadServerMemory();
    return (m[movieSlug] && m[movieSlug].name) ? m[movieSlug].name : '';
  }

  function savePref(k, v) {
    const p = loadPrefs();
    p[k] = v;
    try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (_) {}
  }

  function loadSearchFilters() {
    try {
      return JSON.parse(localStorage.getItem(SEARCH_FILTERS_KEY) || '{}') || {};
    } catch (_) { return {}; }
  }

  function saveSearchFilters(next) {
    try { localStorage.setItem(SEARCH_FILTERS_KEY, JSON.stringify(next || {})); } catch (_) {}
  }

  function loadSearchRecent() {
    try {
      const raw = JSON.parse(localStorage.getItem(SEARCH_RECENT_KEY) || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch (_) { return []; }
  }

  function pushSearchRecent(keyword = '') {
    const key = String(keyword || '').trim();
    if (!key) return;
    const arr = loadSearchRecent();
    const next = [key, ...arr.filter(x => String(x || '').toLowerCase() !== key.toLowerCase())].slice(0, 10);
    try { localStorage.setItem(SEARCH_RECENT_KEY, JSON.stringify(next)); } catch (_) {}
  }

  function parseSearchSort() {
    try {
      const p = new URLSearchParams(window.location.search);
      const v = p.get('sort') || 'relevance';
      return ['relevance', 'latest', 'name-asc', 'name-desc'].includes(v) ? v : 'relevance';
    } catch (_) {
      return 'relevance';
    }
  }

  function persistSearchSort(v = 'relevance') {
    const val = ['relevance', 'latest', 'name-asc', 'name-desc'].includes(v) ? v : 'relevance';
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('sort', val);
      history.replaceState({}, '', u.toString());
    } catch (_) {}
  }

  function loadSearchCompactMode() {
    try { return localStorage.getItem(SEARCH_COMPACT_KEY) === '1'; } catch (_) { return false; }
  }

  function saveSearchCompactMode(on = false) {
    try { localStorage.setItem(SEARCH_COMPACT_KEY, on ? '1' : '0'); } catch (_) {}
  }

  function loadSearchAnalytics() {
    try {
      const raw = JSON.parse(localStorage.getItem(SEARCH_ANALYTICS_KEY) || '{}') || {};
      return typeof raw === 'object' ? raw : {};
    } catch (_) { return {}; }
  }

  function saveSearchAnalytics(data = {}) {
    try { localStorage.setItem(SEARCH_ANALYTICS_KEY, JSON.stringify(data || {})); } catch (_) {}
  }

  function trackSearchAnalytics(keyword = '', resultCount = 0) {
    const key = String(keyword || '').trim().toLowerCase();
    if (!key) return;
    const a = loadSearchAnalytics();
    const now = Date.now();
    if (!a[key]) a[key] = { count: 0, zeroCount: 0, lastAt: 0 };
    a[key].count += 1;
    if (Number(resultCount || 0) <= 0) a[key].zeroCount += 1;
    a[key].lastAt = now;
    const entries = Object.entries(a).sort((x, y) => Number(y[1].lastAt || 0) - Number(x[1].lastAt || 0)).slice(0, 120);
    saveSearchAnalytics(Object.fromEntries(entries));
  }

  function topSearchKeywords(limit = 6) {
    const a = loadSearchAnalytics();
    return Object.entries(a)
      .sort((x, y) => (Number(y[1].count || 0) - Number(x[1].count || 0)) || (Number(y[1].lastAt || 0) - Number(x[1].lastAt || 0)))
      .slice(0, limit)
      .map(x => x[0]);
  }

  function loadPinnedFilters() {
    try {
      const raw = JSON.parse(localStorage.getItem(PINNED_FILTERS_KEY) || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch (_) { return []; }
  }

  function savePinnedFilters(list = []) {
    try { localStorage.setItem(PINNED_FILTERS_KEY, JSON.stringify(Array.isArray(list) ? list.slice(0, 12) : [])); } catch (_) {}
  }

  function saveSessionState(partial = {}) {
    try {
      const prev = JSON.parse(localStorage.getItem(SESSION_STATE_KEY) || '{}') || {};
      const next = Object.assign({}, prev, partial, { ts: Date.now() });
      localStorage.setItem(SESSION_STATE_KEY, JSON.stringify(next));
    } catch (_) {}
  }

  function loadSessionState() {
    try {
      const raw = JSON.parse(localStorage.getItem(SESSION_STATE_KEY) || '{}') || {};
      return typeof raw === 'object' ? raw : {};
    } catch (_) { return {}; }
  }

  function debouncedResizeLayout() {
    let t = null;
    window.addEventListener('resize', () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        const compactOn = loadSearchCompactMode();
        document.querySelectorAll('.search-grid').forEach(g => g.classList.toggle('compact', compactOn));
      }, 160);
    }, { passive: true });
  }

  function fuzzyScore(text = '', query = '') {
    const t = String(text || '').toLowerCase();
    const q = String(query || '').toLowerCase().trim();
    if (!t || !q) return 0;
    if (t.includes(q)) return 100 + Math.max(0, 20 - Math.abs(t.length - q.length));
    let qi = 0;
    let score = 0;
    for (let i = 0; i < t.length && qi < q.length; i++) {
      if (t[i] === q[qi]) {
        score += 4;
        qi++;
      }
    }
    if (qi < q.length) return 0;
    return score - Math.max(0, t.length - q.length) * 0.12;
  }


  function getSearchCacheEntry(key = '') {
    if (!searchResultCache.has(key)) return null;
    const entry = searchResultCache.get(key);
    if (!entry || !Array.isArray(entry.items)) {
      searchResultCache.delete(key);
      return null;
    }
    if (Date.now() - Number(entry.ts || 0) > SEARCH_CACHE_TTL) {
      searchResultCache.delete(key);
      return null;
    }
    entry.ts = Date.now();
    searchResultCache.set(key, entry);
    return entry.items;
  }

  function setSearchCacheEntry(key = '', items = []) {
    searchResultCache.set(key, { items, ts: Date.now() });
    if (searchResultCache.size <= SEARCH_CACHE_MAX) return;
    const oldestKey = searchResultCache.keys().next().value;
    if (oldestKey) searchResultCache.delete(oldestKey);
  }

  async function prewarmRecentSearchCache(limit = 3) {
    try {
      const keywords = loadSearchRecent().slice(0, Math.max(1, Math.min(8, Number(limit) || 3)));
      if (!keywords.length) return;
      const c = cfg();

      await Promise.allSettled(keywords.map(async (kw) => {
        const key = `${src}::${String(kw || '').trim().toLowerCase()}`;
        if (!kw || getSearchCacheEntry(key)) return;
        const data = await fetchJSON(buildSearchUrl(kw));
        const items = await normalizeItems(data, c.img, { withMeta: false });
        setSearchCacheEntry(key, items);
      }));
    } catch (_) {
      // noop
    }
  }

  function sortSearchItems(items = [], mode = 'relevance') {
    const arr = [...items];
    if (mode === 'latest') {
      return arr.sort((a, b) => Number(b.year || 0) - Number(a.year || 0));
    }
    if (mode === 'name-asc') {
      return arr.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'vi'));
    }
    if (mode === 'name-desc') {
      return arr.sort((a, b) => String(b.name || '').localeCompare(String(a.name || ''), 'vi'));
    }
    return arr;
  }

  function loadSkipMarkers() {
    try { return JSON.parse(localStorage.getItem(SKIP_MARKER_KEY) || '{}') || {}; } catch (_) { return {}; }
  }

  function getSkipMarker(movieSlug) {
    const all = loadSkipMarkers();
    return all[movieSlug] || { op: 0, ed: 0 };
  }

  function saveSkipMarker(movieSlug, partial = {}) {
    if (!movieSlug) return;
    const all = loadSkipMarkers();
    const prev = all[movieSlug] || { op: 0, ed: 0 };
    all[movieSlug] = {
      op: Number(partial.op ?? prev.op ?? 0) || 0,
      ed: Number(partial.ed ?? prev.ed ?? 0) || 0
    };
    try { localStorage.setItem(SKIP_MARKER_KEY, JSON.stringify(all)); } catch (_) {}
  }

  function loadWatchTogetherState() {
    try { return JSON.parse(localStorage.getItem(WATCH_TOGETHER_KEY) || '{}') || {}; } catch (_) { return {}; }
  }

  function saveWatchTogetherState(state = {}) {
    try { localStorage.setItem(WATCH_TOGETHER_KEY, JSON.stringify(state)); } catch (_) {}
  }

  async function fetchJSON(url, opts = {}) {
    if (!opts.force && cache.has(url)) return cache.get(url);
    const r = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      cache: 'force-cache',
      signal: opts.signal
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    cache.set(url, d);
    return d;
  }

  async function fetchJSONWithSourceFallback(buildUrlBySource, opts = {}) {
    const sourceKey = src;
    const url = buildUrlBySource(sourceKey);
    if (!url) throw new Error('No source available');
    const data = await fetchJSON(url, opts);
    return { data, sourceKey };
  }

  function prefetchManifest(url='') {
    const u = String(url || '').trim();
    if (!u || !u.includes('.m3u8') || manifestPrefetchCache.has(u)) return;
    manifestPrefetchCache.add(u);
    fetch(u, { method:'GET', mode:'cors', credentials:'omit', cache:'force-cache' }).catch(() => {
      // noop
    });
  }

  function createHlsConfig() {
    const conn = (navigator && navigator.connection) ? navigator.connection : null;
    const netType = String((conn && conn.effectiveType) || '').toLowerCase();
    const saveData = !!(conn && conn.saveData);
    const isWeakNet = saveData || netType.includes('2g') || netType.includes('3g');

    return {
      enableWorker: true,
      lowLatencyMode: false,
      backBufferLength: isWeakNet ? 60 : 90,
      maxBufferLength: isWeakNet ? 28 : 40,
      maxMaxBufferLength: isWeakNet ? 56 : 80,
      maxBufferSize: (isWeakNet ? 42 : 60) * 1000 * 1000,
      maxBufferHole: 0.5,
      maxFragLookUpTolerance: 0.25,
      nudgeOffset: 0.1,
      nudgeMaxRetry: 6,
      startLevel: -1,
      testBandwidth: true,
      abrEwmaFastLive: isWeakNet ? 2 : 3,
      abrEwmaSlowLive: isWeakNet ? 6 : 9,
      abrEwmaFastVoD: isWeakNet ? 2 : 3,
      abrEwmaSlowVoD: isWeakNet ? 6 : 9,
      abrBandWidthFactor: isWeakNet ? 0.78 : 0.85,
      abrBandWidthUpFactor: isWeakNet ? 0.58 : 0.7,
      capLevelToPlayerSize: true,
      startFragPrefetch: true,
      autoStartLoad: true,
      progressive: true,
      manifestLoadingTimeOut: 15000,
      manifestLoadingMaxRetry: 4,
      levelLoadingTimeOut: 15000,
      levelLoadingMaxRetry: 5,
      fragLoadingTimeOut: 20000,
      fragLoadingMaxRetry: 6,
      fragLoadingRetryDelay: 800,
      fragLoadingMaxRetryTimeout: 8000,
      appendErrorMaxRetry: 8
    };
  }

  function resolveActiveServerContext(episodes = [], movieSlug = '', requestedServer = '', requestedEpSlug = '') {
    const rememberedServer = getRememberedServer(movieSlug);
    const selectedServer = pickPreferredServer(episodes, requestedServer, loadServerMode(), rememberedServer) || episodes[0] || null;
    const selectedServerName = selectedServer && selectedServer.server_name ? selectedServer.server_name : (requestedServer || '');
    const epList = (selectedServer && Array.isArray(selectedServer.server_data)) ? selectedServer.server_data : [];
    let selectedEp = epList.find(e => e && e.slug === requestedEpSlug) || null;
    if (!selectedEp && epList.length) selectedEp = epList[0];
    return {
      server: selectedServer,
      serverName: selectedServerName,
      epList,
      ep: selectedEp,
      epSlug: selectedEp && selectedEp.slug ? selectedEp.slug : (requestedEpSlug || '')
    };
  }

  function buildSearchUrl(keyword = '') {
    const c = cfg();
    const kw = encodeURIComponent(String(keyword || '').trim());
    const base = `${c.search}${kw}`;
    if (src === 'nguonphim') return `${base}&limit=10`;
    return base;
  }


  function abortRequest(kind) {
    const target = kind === 'home' ? homeAbort : searchAbort;
    if (target) {
      try { target.abort(); } catch (_) {}
    }
    const next = new AbortController();
    if (kind === 'home') homeAbort = next;
    else searchAbort = next;
    return next;
  }

  async function fetchTmdbMeta(title = '', year = '') {
    const t = String(title || '').trim();
    if (!t) return null;
    const key = `${t.toLowerCase()}::${String(year || '').trim()}`;
    if (tmdbMetaCache.has(key)) return tmdbMetaCache.get(key);
    try {
      const qs = new URLSearchParams({ title: t });
      if (year) qs.set('year', String(year));
      const res = await fetch(`/api/tmdb-meta?${qs.toString()}`, { cache: 'force-cache' });
      if (!res.ok) {
        tmdbMetaCache.set(key, null);
        return null;
      }
      const data = await res.json();
      const meta = data && data.meta ? data.meta : null;
      tmdbMetaCache.set(key, meta);
      return meta;
    } catch (_) {
      tmdbMetaCache.set(key, null);
      return null;
    }
  }

  async function normalizeItems(data, fallbackImg, opts = {}) {
    const items = data.items || (data.data && data.data.items) || [];
    const cdnImg = data.pathImage || (data.data && data.data.APP_DOMAIN_CDN_IMAGE) || fallbackImg;
    const withMeta = !!opts.withMeta;

    const mapFn = (m, meta = null) => {
      const _search_txt = `${m.name || ''} ${m.origin_name || ''} ${stripHtml(m.content || '')}`.toLowerCase();
      const _search_cats = Array.isArray(m.category) ? m.category.map(c => String(c && (c.slug || c.name) || '').toLowerCase()) : [];
      const tmdbPoster = meta && meta.poster ? safeImg(meta.poster, '') : '';
      const tmdbBackdrop = meta && meta.backdrop ? safeImg(meta.backdrop, '') : '';
      const obj = {
        ...m,
        _thumb: tmdbBackdrop || safeImg(m.thumb_url, cdnImg),
        _poster: tmdbPoster || safeImg(m.poster_url || m.thumb_url, cdnImg),
        _tmdb: meta || null,
        _search_txt,
        _search_cats
      };
      if (obj.slug) localMoviesCache.set(obj.slug, obj);
      return obj;
    };

    if (!withMeta) {
      return items.map((m) => mapFn(m));
    }

    const metas = await Promise.all(items.map(m => fetchTmdbMeta(m.name || m.origin_name || '', m.year || '')));
    return items.map((m, i) => mapFn(m, metas[i]));
  }

  function pickPreferredServer(episodes = [], requestedName = '', mode = 'auto', rememberedName = '') {
    if (!Array.isArray(episodes) || !episodes.length) return null;
    const requested = episodes.find(s => s && s.server_name === requestedName);
    if (requested) return requested;

    const remembered = episodes.find(s => s && s.server_name === rememberedName);
    if (remembered) return remembered;

    const nameOf = s => String((s && s.server_name) || '').toLowerCase();
    const hcmKeywords = ['ho chi minh', 'hồ chí minh', 'hcm', 'sai gon', 'sài gòn', 'sg'];
    const speedKeywords = ['cdn', 'vip', 'premium', 'fast', 'fhd', '4k', 'pro'];
    const stableKeywords = ['m3u8', 'hls', 'backup', 'main'];

    function score(s) {
      const name = nameOf(s);
      let v = 0;
      if (speedKeywords.some(k => name.includes(k))) v += 8;
      if (hcmKeywords.some(k => name.includes(k))) v += 6;
      if (stableKeywords.some(k => name.includes(k))) v += 4;
      const count = (s && s.server_data && s.server_data.length) ? s.server_data.length : 0;
      v += Math.min(6, Math.floor(count / 10));
      if (mode === 'hcm' && hcmKeywords.some(k => name.includes(k))) v += 10;
      if (mode === 'best' && speedKeywords.some(k => name.includes(k))) v += 10;
      return v;
    }

    const sorted = [...episodes].sort((a, b) => score(b) - score(a));
    return sorted[0] || episodes[0];
  }

  function scrollBehavior() {
    const h = $('header');
    // Throttle with rAF – never fires more than 60fps
    let rafId = null;
    window.addEventListener('scroll', () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        h.classList.toggle('scrolled', window.scrollY > 10);
        rafId = null;
      });
    }, {passive: true});
  }

  let setMainToken = 0;
  function setMain(node, onMounted) {
    const m = $('main');
    const token = ++setMainToken;
    const isWatchNode = !!(node && node.classList && node.classList.contains('watch-page'));
    if (m.hasChildNodes()) {
      m.classList.add('page-exit');
      setTimeout(() => {
        if (token !== setMainToken) return;
        m.innerHTML = '';
        m.classList.remove('page-exit');
        m.classList.add('page-enter');
        m.appendChild(node);
        document.body.classList.toggle('watch-mode', isWatchNode);
        if(onMounted) onMounted();
        void m.offsetWidth;
        m.classList.remove('page-enter');
        m.classList.add('page-enter-active');
        setTimeout(() => {
          if (token !== setMainToken) return;
          m.classList.remove('page-enter-active');
        }, 400);
      }, 300);
    } else {
      m.innerHTML = '';
      m.appendChild(node);
      document.body.classList.toggle('watch-mode', isWatchNode);
      if(onMounted) onMounted();
    }
  }

  function setSource(val) {
    src = val;
    cache.clear();
    detailPrefetch.clear();
    goHome();
  }

  async function getMovieDetailWithFallback(slug, opts = {}) {
    const { data, sourceKey } = await fetchJSONWithSourceFallback((s) => CFG[s] && CFG[s].detail ? (CFG[s].detail + slug) : '', opts);
    if (data && data.movie && Array.isArray(data.movie.episodes)) {
      const eps = data.movie.episodes.map(s => ({
        server_name: s.server_name,
        server_data: (s.items || s.server_data || []).map(ep => ({
          name: ep.name,
          slug: ep.slug,
          link_m3u8: '', // Force iframe default
          link_embed: ep.embed || ep.link_embed || ''
        }))
      }));
      
      const m3u8Eps = data.movie.episodes.map(s => ({
        server_name: s.server_name + ' (Trình phát Tùy chỉnh)',
        server_data: (s.items || s.server_data || []).map(ep => ({
          name: ep.name,
          slug: ep.slug,
          link_m3u8: ep.m3u8 || ep.link_m3u8 || '',
          link_embed: ep.embed || ep.link_embed || ''
        }))
      }));
      
      data.episodes = [...eps, ...m3u8Eps];
    }
    return { data, sourceKey };
  }

  function toggleDrawer(forceOpen) {
    const isCurrentlyOpen = $('drawer').classList.contains('open');
    const open = forceOpen !== undefined ? forceOpen : !isCurrentlyOpen;
    $('drawer').classList.toggle('open', open);
    if ($('hamburger')) $('hamburger').classList.toggle('open', open);
  }

  function setActiveBottomTab(tab) {
    document.querySelectorAll('.mb-nav-item').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    savePref('lastTab', tab);
    saveSessionState({ lastTab: tab });
  }

  /* ---------- HOME ---------- */
  async function goHome() {
    setActiveBottomTab('home');
    const req = abortRequest('home');

    const wrap = el('div');
    const heroEl = el('div', {class:'hero', style:'background:#111'});
    const heroBody = el('div', {class:'hero-body'});
    heroEl.appendChild(heroBody);
    wrap.appendChild(heroEl);

    const rowsEl = el('div', {class:'rows-section'});
    wrap.appendChild(rowsEl);
    rowsEl.appendChild(loader());
    setMain(wrap);

    const c = cfg();
    const effectiveCats = (c && c.cats && Object.keys(c.cats).length) ? c.cats : {};
    const rowDefs = [
      {key:'latest', title:'🔥 Mới Cập Nhật', sub:'Phim vừa thêm trong ngày', url: c.list+'1'},
      ...Object.entries(effectiveCats).map(([id, url]) => ({
        key:id,
        title: id === 'phim-bo' ? '📺 Phim Bộ Đề Cử' : id === 'phim-le' ? '🎬 Phim Lẻ Đặc Sắc' : id === 'hoat-hinh' ? '🎌 Anime / Hoạt Hình' : '📡 TV Shows',
        sub: id === 'phim-bo' ? 'Theo dõi theo tập mới nhất' : id === 'phim-le' ? 'Xem trọn bộ nhanh gọn' : id === 'hoat-hinh' ? 'Nhiều anime hot cập nhật' : 'Các chương trình truyền hình',
        url
      }))
    ];

    let results;
    try {
      results = await Promise.allSettled(rowDefs.map(r => fetchJSON(r.url, { signal: req.signal })));
    } catch (e) {
      if (req.signal.aborted) return;
      rowsEl.innerHTML = '<div class="empty"><p>Không thể tải dữ liệu trang chủ.</p></div>';
      return;
    }
    if (req.signal.aborted) return;

    rowsEl.innerHTML = '';

    const homeSections = el('div', {class:'home-sections'});
    const cats = el('div', {class:'section-block'});
    cats.innerHTML = `<div class="section-head"><div><div class="section-title">Khám phá nhanh</div><div class="section-sub">Chọn mục nội dung để tìm phim nhanh hơn</div></div></div>`;
    const chips = el('div', {class:'category-chips'});
    [
      ['phim-bo','Phim bộ'],
      ['phim-le','Phim lẻ'],
      ['hoat-hinh','Anime'],
      ['tv-shows','TV Show']
    ].forEach(([id,label]) => {
      const b = el('button', {
        class:'category-chip',
        onclick:()=> {
          if (effectiveCats[id]) return browseCategory(id);
          search({ preventDefault: () => {}, target: { querySelector: () => ({ value: label }) } });
        }
      }, label);
      chips.appendChild(b);
    });
    cats.appendChild(chips);
    homeSections.appendChild(cats);

    const historyItems = loadHistory();
    let continueWatchingRow = null;
    let historyRow = null;
    if (historyItems && historyItems.length) {
      continueWatchingRow = buildContinueWatchingRail(historyItems);
      historyRow = buildHistoryRow(historyItems);
    }

    let heroSet = false;
    const allRows = [];
    for (let i = 0; i < rowDefs.length; i++) {
      const res = results[i];
      if (res.status !== 'fulfilled') continue;
      const items = await normalizeItems(res.value, c.img);
      if (!items.length) continue;

      if (!heroSet) {
        renderHero(heroBody, items[0]);
        heroSet = true;
      }
      allRows.push({def: rowDefs[i], items});
      rowsEl.appendChild(buildRow(rowDefs[i].title, items.slice(0, 36), {
        sub: rowDefs[i].sub,
        onMore: rowDefs[i].key !== 'latest' ? () => browseCategory(rowDefs[i].key) : null
      }));
    }
    if (!heroSet) {
      const fallbackPool = [];
      const favsLocal = loadFavorites();
      const historyLocal = loadHistory();

      favsLocal.slice(0, 4).forEach(x => fallbackPool.push(x));
      historyLocal.slice(0, 4).forEach(x => {
        fallbackPool.push({
          name: x.movieName || 'Đề xuất hôm nay',
          origin_name: x.epName ? `Tiếp tục • ${x.epName}` : '',
          year: '',
          quality: 'HD',
          lang: 'Vietsub',
          content: 'Khám phá thêm phim nổi bật và tiếp tục nội dung bạn đang xem.',
          _thumb: x.poster || '',
          _poster: x.poster || '',
          slug: x.movieSlug || ''
        });
      });

      const fallbackHero = fallbackPool.find(x => x && (x._poster || x._thumb || x.name)) || {
        name: 'StreamFlix',
        origin_name: 'Kho phim trực tuyến',
        year: '2026',
        quality: 'FHD',
        lang: 'Vietsub',
        content: 'Đang tạm thời tải dữ liệu từ máy chủ. Bạn vẫn có thể xem lịch sử và danh sách yêu thích.',
        _thumb: '',
        _poster: '',
        slug: ''
      };
      renderHero(heroBody, fallbackHero);
    }

    if (allRows.length) {
      const mixed = el('div', {class:'section-block'});
      mixed.innerHTML = `<div class="section-head"><div><div class="section-title">Dành cho bạn</div><div class="section-sub">Tuyển chọn phim nổi bật theo nhiều nhóm nội dung</div></div></div>`;
      const mixedGrid = el('div', {class:'section-grid'});
      const pool = [];
      allRows.forEach(r => r.items.slice(0, 4).forEach(it => { if (!pool.find(x => x.slug === it.slug)) pool.push(it); }));
      pool.slice(0, 8).forEach(m => mixedGrid.appendChild(buildCard(m)));
      mixed.appendChild(mixedGrid);
      homeSections.appendChild(mixed);
    }

    if (continueWatchingRow) rowsEl.appendChild(continueWatchingRow);
    if (historyRow) rowsEl.appendChild(historyRow);

    const heroItems = [];
    for (const res of results) {
      if (res.status !== 'fulfilled') continue;
      const items = await normalizeItems(res.value, c.img);
      items.slice(0, 10).forEach(i => {
        if (!heroItems.find(x => x.slug === i.slug)) heroItems.push(i);
      });
    }
    if (heroItems.length > 1) renderHeroThumbs(heroEl, heroItems.slice(0, 10));

    const favs = loadFavorites();
    if (favs.length) {
      rowsEl.appendChild(buildRow('❤️ Danh sách yêu thích', favs.slice(0, 20), { sub:'Các phim bạn đã lưu để xem lại' }));
    }

    const recs = buildRecommendationsFromHistory();
    if (recs.length) {
      rowsEl.appendChild(buildRow('✨ Gợi ý cho bạn', recs.slice(0, 20), { sub:'Dựa trên lịch sử xem gần đây' }));
    }

    rowsEl.prepend(homeSections);
  }

  function buildRecommendationsFromHistory() {
    const h = loadHistory();
    const favs = loadFavorites();
    const map = new Map();
    favs.forEach(f => map.set(f.slug, f));
    h.forEach(x => {
      if (!map.has(x.movieSlug)) {
        map.set(x.movieSlug, {
          slug: x.movieSlug,
          name: x.movieName || 'Đề xuất',
          year: '',
          quality: 'HD',
          _thumb: x.poster || '',
          _poster: x.poster || ''
        });
      }
    });
    return Array.from(map.values());
  }

  function renderHero(bodyEl, m) {
    const hero = bodyEl.closest('.hero');
    if (hero) {
      hero.style.backgroundImage = `url('${m._poster}')`;
      hero.style.backgroundSize = 'cover';
      hero.style.backgroundPosition = 'center';
    }

    const cleanDesc = stripHtml(m.content || m.description || m.origin_name || '');
    const chips = [
      m.quality || m.episode_current || 'HD',
      m.year || (m._tmdb && m._tmdb.year) || '',
      (m.lang || m.language || 'Vietsub'),
      (m._tmdb && m._tmdb.imdb) ? `IMDb ${m._tmdb.imdb}` : ''
    ].filter(Boolean);

    bodyEl.innerHTML = `
      <div class="hero-badge"><i class="fa-solid fa-fire"></i> Nổi Bật</div>
      <h1 class="hero-title">${m.name}</h1>
      <p class="hero-sub">${m.origin_name || ''}</p>
      <div class="hero-meta">${chips.map(c => `<span class="hero-chip">${c}</span>`).join('')}</div>
      <p class="hero-desc">${cleanDesc || (m._tmdb && m._tmdb.overview) || 'Khám phá bộ phim đang được quan tâm nhất hôm nay.'}</p>
      <div class="hero-btns">
        <button class="btn btn-orange" onclick="App.goDetail('${m.slug}')"><i class="fa-solid fa-play"></i> Xem Ngay</button>
        <button class="btn btn-gray" onclick="App.goDetail('${m.slug}')"><i class="fa-solid fa-circle-info"></i> Chi tiết</button>
      </div>`;
  }

  function renderHeroThumbs(heroEl, items) {
    if (!heroEl || !items || !items.length) return;
    const old = qs('.hero-thumbs', heroEl);
    if (old) old.remove();

    const row = el('div', {class:'hero-thumbs'});
    items.forEach((it, idx) => {
      const b = el('button', {class:`hero-thumb${idx === 0 ? ' active' : ''}`, title: it.name || 'Phim'});
      b.appendChild(lazyImg(it._thumb || it._poster, ''));
      b.onclick = () => {
        heroEl.style.backgroundImage = `url('${it._poster || it._thumb}')`;
        document.querySelectorAll('.hero-thumb', row).forEach(x => x.classList.remove('active'));
        b.classList.add('active');
      };
      row.appendChild(b);
    });
    heroEl.appendChild(row);
  }

  function buildRow(title, items, opts = {}) {
    const wrapper = el('div', {class:'row-block'});
    const head = el('div', {class:'row-head'});

    const titleWrap = el('div', {class:'row-title'});
    const h2 = el('h2', {}, title);
    titleWrap.appendChild(h2);
    if (opts.sub) titleWrap.appendChild(el('div', {class:'row-sub'}, opts.sub));

    const more = el('button', {class:'section-more', type:'button'});
    more.innerHTML = `Xem tất cả <i class="fa-solid fa-chevron-right" style="font-size:.7rem"></i>`;
    more.onclick = (e) => {
      e.preventDefault();
      if (typeof opts.onMore === 'function') opts.onMore();
    };
    if (typeof opts.onMore !== 'function') {
      more.disabled = true;
      more.style.opacity = '0.5';
      more.style.cursor = 'default';
    }

    head.appendChild(titleWrap);
    head.appendChild(more);
    wrapper.appendChild(head);

    const shell = el('div', {class:'row-shell'});
    const row = el('div', {class:'movie-row movie-row-main'});
    const max = Math.min(items.length, 36);
    for (let i = 0; i < max; i++) {
      row.appendChild(buildCard(items[i]));
    }

    const prevBtn = el('button', {class:'row-nav left', type:'button', title:'Trượt trái'});
    prevBtn.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
    prevBtn.onclick = () => row.scrollBy({ left: -Math.max(260, row.clientWidth * 0.8), behavior: 'smooth' });

    const nextBtn = el('button', {class:'row-nav right', type:'button', title:'Trượt phải'});
    nextBtn.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
    nextBtn.onclick = () => row.scrollBy({ left: Math.max(260, row.clientWidth * 0.8), behavior: 'smooth' });

    shell.appendChild(prevBtn);
    shell.appendChild(row);
    shell.appendChild(nextBtn);
    wrapper.appendChild(shell);
    return wrapper;
  }

  function prefetchMovieDetailBySlug(slug = '') {
    const s = String(slug || '').trim();
    if (!s || detailPrefetch.has(s)) return;
    detailPrefetch.add(s);
    getMovieDetailWithFallback(s).then(({data}) => {
      const episodes = data && data.episodes ? data.episodes : [];
      const firstServer = Array.isArray(episodes) && episodes.length ? episodes[0] : null;
      const firstEp = firstServer && firstServer.server_data && firstServer.server_data[0];
      const preUrl = firstEp ? (firstEp.link_m3u8 || '') : '';
      prefetchManifest(preUrl);
    }).catch(()=>{});
  }

  function buildCard(m, style='', opts = {}) {
    const card = el('div', {class:'card', style, onclick: () => {
      if (m && m._cw && m._cw.movieSlug && m._cw.epSlug) {
        goWatch(m._cw.movieSlug, m._cw.epSlug, m._cw.srvName || '');
        return;
      }
      goDetail(m.slug);
    }});
    let hoverTimer = null;

    const prefetchDetail = () => prefetchMovieDetailBySlug(m && m.slug ? m.slug : '');

    card.addEventListener('mouseenter', () => {
      hoverTimer = setTimeout(() => {
        card.classList.add('hover-ready');
      }, 500);
      prefetchDetail();
    });
    card.addEventListener('mouseleave', () => {
      if (hoverTimer) {
        clearTimeout(hoverTimer);
        hoverTimer = null;
      }
      card.classList.remove('hover-ready');
    });
    if (opts && opts.prefetchOnVisible) {
      card.dataset.prefetchSlug = m.slug || '';
    }

    // Thumbnail container
    const thumb = el('div', {class:'card-thumb'});
    const img = lazyImg(m._thumb || m._poster, '');
    thumb.appendChild(img);

    const fav = el('button', {class:`fav-btn${isFavorite(m.slug)?' on':''}`, title:'Yêu thích'});
    fav.innerHTML = '<i class="fa-solid fa-heart"></i>';
    fav.onclick = (e) => {
      e.stopPropagation();
      const on = toggleFavorite(m);
      fav.classList.toggle('on', on);
    };
    thumb.appendChild(fav);

    // Quality badge
    const badge = el('div', {class:'card-badge'});
    badge.textContent = (m._tmdb && m._tmdb.imdb ? `IMDb ${m._tmdb.imdb}` : (m.quality || m.episode_current || 'HD'));
    thumb.appendChild(badge);
    // Play icon overlay
    const play = el('div', {class:'card-play'});
    play.innerHTML = '<i class="fa-solid fa-play"></i>';
    thumb.appendChild(play);
    card.appendChild(thumb);
    // Info below thumbnail (always visible - Netflix)
    const info = el('div', {class:'card-info'});
    const title = el('div', {class:'card-title'});
    const displayName = opts && opts.highlightKeyword ? highlightText(m.name || '', opts.highlightKeyword) : escapeHtml(m.name || '');
    title.innerHTML = displayName;
    const meta = el('div', {class:'card-meta'});
    const match = el('span');
    match.textContent = `${Math.max(80, (m.year || 88) % 100)}% match`;
    const age = el('span', {class:'card-ep'});
    age.textContent = m.content ? '16+' : '13+';
    meta.appendChild(match);
    meta.appendChild(el('span', {class:'dot'}, '·'));
    meta.appendChild(age);
    info.appendChild(title);
    info.appendChild(meta);
    card.appendChild(info);
    return card;
  }

  function buildHistoryCard(h) {
    const card = el('div', {class:'card', onclick: () => goWatch(h.movieSlug, h.epSlug, h.srvName)});
    const thumb = el('div', {class:'card-thumb'});
    const img = lazyImg(h.poster || '', '');
    thumb.appendChild(img);

    const badge = el('div', {class:'card-badge'});
    badge.textContent = h.epName ? `Tập: ${h.epName}` : 'Đang xem';
    thumb.appendChild(badge);

    const play = el('div', {class:'card-play'});
    play.innerHTML = '<i class="fa-solid fa-play"></i>';
    thumb.appendChild(play);

    card.appendChild(thumb);

    const info = el('div', {class:'card-info'});
    const title = el('div', {class:'card-title'});
    title.textContent = h.movieName || 'Chưa có tên';
    const meta = el('div', {class:'card-meta'});

    const epT = el('span');
    epT.textContent = h.epName || h.epSlug || 'Tập';
    const dot = el('span', {class:'dot'});
    dot.textContent = '·';
    const prog = el('span', {class:'card-ep'});
    prog.textContent = h.progressSeconds ? `Tiếp: ${fmtClock(h.progressSeconds)}` : (h.updatedAt ? 'Mới đây' : ' ');
    meta.appendChild(epT);
    meta.appendChild(dot);
    meta.appendChild(prog);

    info.appendChild(title);
    info.appendChild(meta);
    card.appendChild(info);
    return card;
  }

  function buildHistoryRow(items) {
    const wrapper = el('div', {class:'row-block'});
    const head = el('div', {class:'row-head'});

    const titleWrap = el('div', {class:'row-title'});
    titleWrap.appendChild(el('h2', {}, 'Lịch sử xem'));
    titleWrap.appendChild(el('div', {class:'row-sub'}, 'Tiếp tục xem nhanh các tập gần đây'));

    const clearBtn = el('button', {class:'section-more history-clear-link', type:'button'});
    clearBtn.innerHTML = `Xóa <i class="fa-solid fa-trash" style="font-size:.7rem"></i>`;
    clearBtn.onclick = (e) => {
      e.preventDefault();
      clearHistory();
      goHome();
    };

    head.appendChild(titleWrap);
    head.appendChild(clearBtn);
    wrapper.appendChild(head);

    const row = el('div', {class:'movie-row movie-row-history'});
    items.forEach(h => row.appendChild(buildHistoryCard(h)));
    wrapper.appendChild(row);
    return wrapper;
  }

  function buildContinueWatchingRail(items = []) {
    const sorted = [...items]
      .sort((a, b) => (Number(b.updatedAt || 0) - Number(a.updatedAt || 0)) || (Number(b.progressSeconds || 0) - Number(a.progressSeconds || 0)));
    if (!sorted.length) return null;
    return buildRow('▶️ Xem tiếp cho bạn', sorted.slice(0, 16).map(x => ({
      slug: x.movieSlug,
      name: x.movieName || 'Đang xem',
      year: '',
      quality: x.epName ? `Tập ${x.epName}` : 'Tiếp tục',
      _thumb: x.poster || '',
      _poster: x.poster || '',
      _cw: x
    })), {
      sub: 'Quay lại đúng tập bạn đang dở',
      onMore: () => openHistoryPage()
    });
  }

  /* ---------- DETAIL ---------- */
  async function goDetail(slug) {
    const wrap = el('div', {class:'detail-page'});
    wrap.appendChild(loader());
    setMain(wrap);
    window.scrollTo(0,0);

    try {
      const { data, sourceKey } = await getMovieDetailWithFallback(slug);
      const useCfg = CFG[sourceKey] || cfg();
      movieData = { movie: data.movie || data.item, episodes: data.episodes || [], sourceKey };
      const m = movieData.movie;
      const c = useCfg;
      const tmdbMeta = await fetchTmdbMeta(m.name || m.origin_name || '', m.year || '');
      m._tmdb = tmdbMeta || null;
      const poster = (tmdbMeta && tmdbMeta.poster) ? safeImg(tmdbMeta.poster, '') : safeImg(m.poster_url || m.thumb_url, c.img);

      const rememberedServer = getRememberedServer(m.slug || slug);
      const firstServer = pickPreferredServer(movieData.episodes, '', loadServerMode(), rememberedServer);
      const firstEp = firstServer && firstServer.server_data && firstServer.server_data[0];

      wrap.innerHTML = '';
      // dynamic bg for detail page
      document.body.style.backgroundImage = `linear-gradient(to bottom,rgba(5,5,16,.85),var(--bg)),url('${poster}')`;
      document.body.style.backgroundSize = 'cover';
      document.body.style.backgroundAttachment = 'fixed';

      const layout = el('div', {class:'detail-wrap'});
      const img = lazyImg(poster, 'detail-poster');
      layout.appendChild(img);

      const info = el('div', {class:'detail-info'});
      
      let catArr = [];
      if (m.category) {
        if (Array.isArray(m.category)) catArr = m.category.map(g => g.name || g);
        else if (typeof m.category === 'object') {
          catArr = Object.values(m.category).flatMap(x => (x.list||[]).map(i => i.name));
        }
      }
      const showCats = (m._tmdb && m._tmdb.genres && m._tmdb.genres.length) ? m._tmdb.genres : catArr;

      let actorsStr = 'N/A';
      if (m._tmdb && m._tmdb.cast && m._tmdb.cast.length) {
        actorsStr = m._tmdb.cast.map(x => x.name).slice(0,5).join(', ');
      } else if (Array.isArray(m.actor)) {
        actorsStr = m.actor.slice(0,5).join(', ');
      } else if (typeof m.casts === 'string' && m.casts) {
        actorsStr = m.casts;
      } else if (typeof m.actor === 'string' && m.actor) {
        actorsStr = m.actor;
      }

      let dirStr = 'N/A';
      if (Array.isArray(m.director)) {
        dirStr = m.director.join(', ');
      } else if (typeof m.director === 'string' && m.director) {
        dirStr = m.director;
      }

      info.innerHTML = `
        <h1>${m.name}</h1>
        <div class="detail-origin">${m.origin_name || (m._tmdb && m._tmdb.title) || ''}</div>
        <div class="tags">
          <span class="tag green">${m.episode_current || 'Full'}</span>
          <span class="tag">${m.year || (m._tmdb && m._tmdb.year) || ''}</span>
          <span class="tag">${m.quality || 'FHD'}</span>
          ${(m._tmdb && m._tmdb.imdb) ? `<span class="tag">IMDb ${m._tmdb.imdb}</span>` : ''}
          ${(m._tmdb && m._tmdb.runtime) ? `<span class="tag">${m._tmdb.runtime} phút</span>` : ''}
          ${showCats.slice(0,4).map(g=>`<span class="tag">${g}</span>`).join('')}
        </div>
        <p class="detail-desc">${m.content ? m.content.replace(/<[^>]+>/g,'') : ((m._tmdb && m._tmdb.overview) || 'Không có mô tả.')}</p>
        <div class="meta-row">Diễn viên: <span>${actorsStr}</span></div>
        <div class="meta-row">Đạo diễn: <span>${dirStr}</span></div>`;

      if (m._tmdb && Array.isArray(m._tmdb.cast) && m._tmdb.cast.length) {
        const castStrip = el('div', {class:'cast-strip'});
        m._tmdb.cast.forEach(p => {
          const item = el('div', {class:'cast-item'});
          const img = lazyImg(p.avatar || '', '');
          img.alt = p.name || 'Cast';
          const name = el('div', {class:'cast-name'}, p.name || 'N/A');
          const role = el('div', {class:'cast-role'}, p.character || 'Diễn viên');
          item.appendChild(img);
          item.appendChild(name);
          item.appendChild(role);
          castStrip.appendChild(item);
        });
        info.appendChild(castStrip);
      }

      if (firstEp) {
        const pb = el('button', {class:'play-btn-big', onclick: () => goWatch(slug, firstEp.slug, firstServer.server_name)});
        pb.innerHTML = '<i class="fa-solid fa-play"></i> PHÁT TẬP 1';
        info.appendChild(pb);
      }
      layout.appendChild(info);
      wrap.appendChild(layout);
    } catch(e) {
      wrap.innerHTML = `<div class="empty"><i class="fa-solid fa-triangle-exclamation"></i><p>Không thể tải phim. Vui lòng thử lại!</p></div>`;
    }
  }

  /* ---------- SEARCH ---------- */
  function applySearchFilters(items, filters) {
    if (!filters) return items;
    return items.filter(m => {
      if (filters.type && filters.type !== 'all') {
        const isSeries = (m.type || '').includes('series') || (m.episode_current || '').toLowerCase().includes('tập');
        if (filters.type === 'series' && !isSeries) return false;
        if (filters.type === 'movie' && isSeries) return false;
      }
      if (filters.category && filters.category !== 'all') {
        const cats = Array.isArray(m.category)
          ? m.category.map(c => String(c && c.slug ? c.slug : (c && c.name ? c.name : c)).toLowerCase())
          : [];
        const alias = {
          'phim-bo': ['phim-bo','tv_series','series'],
          'phim-le': ['phim-le','single','movie'],
          'hoat-hinh': ['hoat-hinh','anime'],
          'tv-shows': ['tv-shows','tvshow','tv_show']
        };
        const targets = alias[filters.category] || [String(filters.category).toLowerCase()];
        if (!cats.some(c => targets.some(t => c.includes(t)))) return false;
      }
      if (filters.year && filters.year !== 'all' && String(m.year || '') !== String(filters.year)) return false;
      if (filters.quality && filters.quality !== 'all' && !String(m.quality || m.episode_current || '').toLowerCase().includes(String(filters.quality).toLowerCase())) return false;
      return true;
    });
  }

  function debounce(fn, delay = 300) {
    let timer = null;
    return (...args) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  function buildAutocompleteRoot(form) {
    if (!form) return null;
    let root = qs('.search-autocomplete', form);
    if (!root) {
      root = el('div', { class: 'search-autocomplete' });
      form.appendChild(root);
    }
    return root;
  }

  function closeAutocomplete(form) {
    const root = form ? qs('.search-autocomplete', form) : null;
    if (!root) return;
    root.classList.remove('open');
    root.innerHTML = '';
  }

  function renderAutocomplete(form, input, list = []) {
    const root = buildAutocompleteRoot(form);
    if (!root) return;
    if (!list.length) {
      closeAutocomplete(form);
      return;
    }
    root.innerHTML = '';
    list.forEach((kw, idx) => {
      const item = el('button', { class: `search-autocomplete-item${idx === 0 ? ' active' : ''}`, type: 'button' });
      item.innerHTML = `<span>${kw}</span><span class="search-autocomplete-meta">Gần đây</span>`;
      item.onclick = () => {
        input.value = kw;
        closeAutocomplete(form);
        search({ preventDefault: () => {}, target: { querySelector: () => ({ value: kw }) } });
      };
      root.appendChild(item);
    });
    root.classList.add('open');
  }

  function bindSearchAutocomplete(formSelector, inputSelector) {
    const form = document.querySelector(formSelector);
    const input = document.querySelector(inputSelector);
    if (!form || !input) return;

    const update = debounce(() => {
      const q = String(input.value || '').trim().toLowerCase();
      if (!q) {
        closeAutocomplete(form);
        return;
      }
      const all = loadSearchRecent();
      const matched = all.filter(k => String(k || '').toLowerCase().includes(q)).slice(0, 8);
      renderAutocomplete(form, input, matched);
    }, 120);

    input.addEventListener('input', (e) => {
      update();
      const mainWrap = qs('main') || document.body;
      const activeTab = document.querySelector('.mb-nav-item.active');
      const loc = activeTab && activeTab.dataset ? activeTab.dataset.tab : '';
      if (loc === 'search' || document.querySelector('.search-page')) {
        const keyword = String(e.target.value || '').trim();
        if ($('q')) $('q').value = keyword;
        if ($('q-mob')) $('q-mob').value = keyword;
        currentSearchKeyword = keyword;
        if (window.__debouncedSearchRender) window.__debouncedSearchRender(keyword);
      }
    });
    input.addEventListener('focus', update);
    input.addEventListener('keydown', (ev) => {
      const root = qs('.search-autocomplete', form);
      if (!root || !root.classList.contains('open')) return;
      const items = Array.from(root.querySelectorAll('.search-autocomplete-item'));
      if (!items.length) return;
      const idx = Math.max(0, items.findIndex(x => x.classList.contains('active')));
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        ev.preventDefault();
        const next = ev.key === 'ArrowDown' ? Math.min(items.length - 1, idx + 1) : Math.max(0, idx - 1);
        items.forEach(x => x.classList.remove('active'));
        items[next].classList.add('active');
        return;
      }
      if (ev.key === 'Enter') {
        const active = items.find(x => x.classList.contains('active'));
        if (active) {
          ev.preventDefault();
          active.click();
        }
      }
      if (ev.key === 'Escape') closeAutocomplete(form);
    });

    document.addEventListener('click', (ev) => {
      if (!form.contains(ev.target)) closeAutocomplete(form);
    });
  }

  function buildFilterBar(onChange) {
    const state = Object.assign({ type: 'all', category: 'all', quality: 'all', year: 'all' }, loadSearchFilters());
    const defs = [
      {k:'type', vals:[['all','Tất cả'],['series','Phim bộ'],['movie','Phim lẻ']]},
      {k:'category', vals:[['all','Mọi thể loại'],['phim-bo','Phim bộ'],['phim-le','Phim lẻ'],['hoat-hinh','Anime'],['tv-shows','TV Show']]},
      {k:'quality', vals:[['all','Mọi chất lượng'],['HD','HD'],['FHD','FHD']]},
      {k:'year', vals:[['all','Mọi năm'],['2026','2026'],['2025','2025'],['2024','2024']]}
    ];
    const bar = el('div', {class:'filters-bar'});

    function paint() {
      bar.innerHTML = '';

      const pinToggle = el('button', { class:'filter-chip', type:'button' }, '📌 Ghim bộ lọc hiện tại');
      pinToggle.onclick = () => {
        const pins = loadPinnedFilters();
        const key = JSON.stringify(state);
        if (!pins.find(x => JSON.stringify(x.filters || {}) === key)) {
          pins.unshift({ name: `${state.category || 'all'} • ${state.year || 'all'}`, filters: Object.assign({}, state), ts: Date.now() });
          savePinnedFilters(pins);
        }
      };
      bar.appendChild(pinToggle);

      const pins = loadPinnedFilters();
      pins.slice(0, 5).forEach((p, i) => {
        const b = el('button',{class:'filter-chip', type:'button'}, `⭐ ${p.name || ('Pin ' + (i + 1))}`);
        b.onclick = () => {
          Object.assign(state, p.filters || {});
          saveSearchFilters(state);
          paint();
          onChange(state);
        };
        bar.appendChild(b);
      });

      defs.forEach(d => {
        d.vals.forEach(([v,label]) => {
          const b = el('button',{class:`filter-chip${state[d.k]===v?' active':''}`}, label);
          b.onclick = () => {
            state[d.k] = v;
            saveSearchFilters(state);
            paint();
            onChange(state);
          };
          bar.appendChild(b);
        });
      });
    }

    paint();
    return bar;
  }

  function aiNormalizeKeyword(kw='') {
    const k = String(kw || '').toLowerCase().trim();
    const tokens = {
      action: /(hành động|action|đánh đấm|bắn súng)/,
      romance: /(tình cảm|romance|ngôn tình|yêu)/,
      horror: /(kinh dị|horror|ma)/,
      anime: /(anime|hoạt hình)/,
      series: /(phim bộ|series|nhiều tập)/,
      movie: /(phim lẻ|movie|điện ảnh)/,
      blackHairMale: /(nam chính.*tóc đen|tóc đen.*nam chính)/
    };
    const q = { raw: kw, hints: [] };
    if (tokens.action.test(k)) q.hints.push('hanh-dong');
    if (tokens.romance.test(k)) q.hints.push('tinh-cam');
    if (tokens.horror.test(k)) q.hints.push('kinh-di');
    if (tokens.anime.test(k)) q.hints.push('hoat-hinh');
    if (tokens.series.test(k)) q.hints.push('series');
    if (tokens.movie.test(k)) q.hints.push('movie');
    if (tokens.blackHairMale.test(k)) q.hints.push('male-black-hair');
    return q;
  }

  function aiScoreMovie(movie, ai) {
    if (!ai || !ai.hints || !ai.hints.length) return 0;
    let s = 0;
    const txt = movie._search_txt || '';
    const cats = movie._search_cats || [];
    if (ai.hints.includes('hanh-dong') && (txt.includes('hành động') || cats.some(c => c.includes('hanh-dong')))) s += 4;
    if (ai.hints.includes('tinh-cam') && (txt.includes('tình cảm') || cats.some(c => c.includes('tinh-cam')))) s += 4;
    if (ai.hints.includes('kinh-di') && (txt.includes('kinh dị') || cats.some(c => c.includes('kinh-di')))) s += 4;
    if (ai.hints.includes('hoat-hinh') && (txt.includes('anime') || cats.some(c => c.includes('hoat-hinh') || c.includes('anime')))) s += 5;
    if (ai.hints.includes('series')) {
      const isSeries = (movie.type || '').includes('series') || String(movie.episode_current || '').toLowerCase().includes('tập');
      if (isSeries) s += 3;
    }
    if (ai.hints.includes('movie')) {
      const isSeries = (movie.type || '').includes('series') || String(movie.episode_current || '').toLowerCase().includes('tập');
      if (!isSeries) s += 3;
    }
    if (ai.hints.includes('male-black-hair') && txt.includes('tóc đen')) s += 2;
    return s;
  }

  async function search(e) {
    e.preventDefault();
    setActiveBottomTab('search');
    const target = e.target.querySelector('input');
    const kw = (target ? target.value : $('q').value).trim();
    if ($('q')) $('q').value = kw;
    if ($('q-mob')) $('q-mob').value = kw;
    if (!kw) return;
    saveSessionState({ lastTab: 'search', lastKeyword: kw });

    const req = abortRequest('search');
    currentSearchKeyword = kw;
    pushSearchRecent(kw);

    const wrap = el('div', {class:'search-page'});
    const hero = el('div', {class:'search-hero'});
    hero.innerHTML = `<div><h2>Kết quả cho: <strong style="color:#fff">${kw}</strong></h2><div class="search-meta" id="searchMeta">Đang tải dữ liệu...</div></div>`;
    wrap.appendChild(hero);

    const suggestRow = el('div', {class:'search-suggestions'});
    [kw, `${kw} vietsub`, `${kw} hd`, `${kw} mới`].forEach(s => {
      const b = el('button', {class:'suggestion-item', type:'button'}, s);
      b.onclick = () => search({ preventDefault: () => {}, target: { querySelector: () => ({ value: s }) } });
      suggestRow.appendChild(b);
    });
    wrap.appendChild(suggestRow);

    const stateHint = el('div', {class:'search-state-hint'}, 'Mẹo: kết hợp bộ lọc bên dưới để ra kết quả chính xác hơn.');
    wrap.appendChild(stateHint);

    const toolbar = el('div', {class:'search-toolbar'});
    const toolbarLeft = el('div', {class:'search-toolbar-left'});
    const toolbarRight = el('div', {class:'search-toolbar-right'});

    const compactBtn = el('button', { class: `toolbar-btn${loadSearchCompactMode() ? ' active' : ''}`, type:'button' }, 'Compact');
    compactBtn.onclick = () => {
      const next = !compactBtn.classList.contains('active');
      compactBtn.classList.toggle('active', next);
      saveSearchCompactMode(next);
      if (next) grid.classList.add('compact');
      else grid.classList.remove('compact');
    };

    const sortWrap = el('div', {class:'search-sort'});
    const sortLabel = el('label', {}, 'Sắp xếp');
    const sortSelect = el('select', { 'aria-label': 'Sắp xếp kết quả' });
    [
      ['relevance', 'Liên quan nhất'],
      ['latest', 'Năm mới nhất'],
      ['name-asc', 'Tên A → Z'],
      ['name-desc', 'Tên Z → A']
    ].forEach(([v, t]) => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = t;
      sortSelect.appendChild(opt);
    });
    sortSelect.value = parseSearchSort();
    sortWrap.appendChild(sortLabel);
    sortWrap.appendChild(sortSelect);

    toolbarLeft.appendChild(compactBtn);
    toolbarRight.appendChild(sortWrap);
    toolbar.appendChild(toolbarLeft);
    toolbar.appendChild(toolbarRight);
    wrap.appendChild(toolbar);

    const grid = el('div', {class:'search-grid'});
    if (loadSearchCompactMode()) grid.classList.add('compact');
    const c = cfg();
    const cacheKey = `${src}::${kw.toLowerCase()}`;
    let baseNormalized = null;
    let visiblePrefetchObserver = null;

    const renderSearchWithFilter = async (filters, opts = {}) => {
      const preferCacheOnly = !!opts.cacheOnly;
      try {
        if (!baseNormalized) {
          const hit = getSearchCacheEntry(cacheKey);
          if (hit) {
            baseNormalized = hit;
            if (!preferCacheOnly) {
              fetchJSON(buildSearchUrl(kw), { signal: req.signal })
                .then(data => normalizeItems(data, c.img, { withMeta: false }))
                .then(fresh => {
                  if (req.signal.aborted || currentSearchKeyword !== kw) return;
                  baseNormalized = fresh;
                  setSearchCacheEntry(cacheKey, fresh);
                  renderSearchWithFilter(loadSearchFilters(), { cacheOnly: true });
                })
                .catch(() => {});
            }
          } else {
            if (preferCacheOnly) return;
            const fallbackGrid = el('div', {class: 'search-grid'});
            const localArs = Array.from(localMoviesCache.values());
            if (localArs.length) {
              const kwT = kw.toLowerCase().trim();
              const lf = localArs.filter(m => {
                return (m.name||'').toLowerCase().includes(kwT) || (m.origin_name||'').toLowerCase().includes(kwT);
              });
              if (lf.length) {
                grid.innerHTML = '';
                renderCardsProgressively(grid, lf.slice(0, 16), 16, (m) => buildCard(m, '--thumb-ratio:2/3;max-width:100%', { highlightKeyword: kw }));
              }
            }
            const data = await fetchJSON(buildSearchUrl(kw), { signal: req.signal });
            if (req.signal.aborted || currentSearchKeyword !== kw) return;
            baseNormalized = await normalizeItems(data, c.img, { withMeta: false });
            setSearchCacheEntry(cacheKey, baseNormalized);
          }
        }

        let items = applySearchFilters(baseNormalized, filters);

        const sortMode = sortSelect.value || 'relevance';
        if (sortMode === 'relevance' && kw) {
          const ai = aiNormalizeKeyword(kw);
          const hasAi = ai.hints.length > 0;
          
          const scored = items.map(m => {
            const sAi = hasAi ? aiScoreMovie(m, ai) : 0;
            const sa = fuzzyScore(m.name, kw);
            const sb = fuzzyScore(m.origin_name, kw) - 4;
            const sc = fuzzyScore(m._search_txt || '', kw) - 8;
            const sFz = Math.max(0, sa, sb, sc);
            return { m, score: (sAi * 50) + sFz };
          });
          
          const good = scored.filter(x => x.score > 0).sort((a, b) => b.score - a.score).map(x => x.m);
          const bad = scored.filter(x => x.score <= 0).map(x => x.m);
          items = [...good, ...bad];
        } else {
          items = sortSearchItems(items, sortMode);
        }

        const meta = qs('#searchMeta', wrap);
        if (meta) meta.textContent = `${items.length} kết quả phù hợp`;
        trackSearchAnalytics(kw, items.length);

        grid.innerHTML = '';
        if (!items.length) {
          grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><i class="fa-solid fa-magnifying-glass"></i><p>Không tìm thấy kết quả phù hợp cho <strong>${kw}</strong>.</p><p style="margin-top:6px">Thử từ khóa ngắn hơn hoặc đổi bộ lọc.</p></div>`;
        } else {
          renderCardsProgressively(grid, items, 24, (m) => buildCard(m, '--thumb-ratio:2/3;max-width:100%', { highlightKeyword: kw, prefetchOnVisible: true }));

          if (visiblePrefetchObserver) {
            try { visiblePrefetchObserver.disconnect(); } catch (_) {}
          }
          if ('IntersectionObserver' in window) {
            visiblePrefetchObserver = new IntersectionObserver((entries) => {
              entries.forEach(en => {
                if (!en.isIntersecting) return;
                const slug = en.target && en.target.dataset ? en.target.dataset.prefetchSlug : '';
                if (slug) prefetchMovieDetailBySlug(slug);
                try { visiblePrefetchObserver.unobserve(en.target); } catch (_) {}
              });
            }, { rootMargin: '260px 0px' });

            grid.querySelectorAll('[data-prefetch-slug]').forEach(node => visiblePrefetchObserver.observe(node));
          }
        }
      } catch (_) {
        if (req.signal.aborted) return;
        grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><p>Có lỗi xảy ra. Thử lại!</p></div>';
      }
    };

    const debouncedRender = debounce(renderSearchWithFilter, 260);
    window.__debouncedSearchRender = (newKw) => {
      if (newKw !== undefined) {
         const heroStr = document.querySelector('.search-hero h2 strong');
         if (heroStr) heroStr.textContent = newKw;
      }
      debouncedRender(loadSearchFilters());
    };

    wrap.appendChild(buildFilterBar((f)=>{ debouncedRender(f); }));
    wrap.appendChild(grid);
    grid.appendChild(buildSearchSkeleton(12));
    sortSelect.addEventListener('change', () => {
      persistSearchSort(sortSelect.value || 'relevance');
      grid.innerHTML = '';
      grid.appendChild(buildSearchSkeleton(10));
      debouncedRender(loadSearchFilters());
    });

    setMain(wrap);
    window.scrollTo(0,0);

    await renderSearchWithFilter(loadSearchFilters());
  }

  function openSearchPage() {
    const wrap = el('div', {class:'search-page'});
    setActiveBottomTab('search');

    const hero = el('div', {class:'search-hero'});
    hero.innerHTML = `<div><h2>Tìm kiếm nhanh</h2><div class="search-meta">Gõ từ khóa hoặc chọn gợi ý</div></div>`;
    wrap.appendChild(hero);

    const form = el('form', {class:'search-input-wrap', onsubmit:search});
    form.innerHTML = `<input class="search-input" type="text" placeholder="Nhập tên phim, thể loại, quốc gia..." autocomplete="off"><button type="submit" class="top-icon-btn" aria-label="Tìm kiếm"><i class="fa-solid fa-magnifying-glass"></i></button>`;
    wrap.appendChild(form);

    const quick = el('div', {class:'search-suggestions'});
    ['phim bộ mới','anime','phim lẻ hay','hàn quốc','trung quốc','bom tấn 2026','phim chiếu rạp'].forEach(k => {
      const b = el('button', {class:'suggestion-item', onclick:()=> search({preventDefault:()=>{}, target:{querySelector:()=>({value:k})}})}, k);
      quick.appendChild(b);
    });
    wrap.appendChild(quick);

    const topKeywords = topSearchKeywords(6);
    if (topKeywords.length) {
      const label = el('div', {class:'search-state-hint'}, 'Từ khóa hot gần đây');
      wrap.appendChild(label);
      const hotRow = el('div', {class:'search-suggestions'});
      topKeywords.forEach(k => {
        const b = el('button', {class:'suggestion-item', onclick:()=> search({preventDefault:()=>{}, target:{querySelector:()=>({value:k})}})}, k);
        hotRow.appendChild(b);
      });
      wrap.appendChild(hotRow);
    }

    const recent = loadSearchRecent();
    if (recent.length) {
      const recentLabel = el('div', {class:'search-state-hint'}, 'Tìm gần đây');
      wrap.appendChild(recentLabel);
      const recentRow = el('div', {class:'search-suggestions'});
      recent.slice(0, 8).forEach(k => {
        const b = el('button', {class:'suggestion-item', onclick:()=> search({preventDefault:()=>{}, target:{querySelector:()=>({value:k})}})}, k);
        recentRow.appendChild(b);
      });
      wrap.appendChild(recentRow);
    }

    setMain(wrap, () => {
      const input = qs('.search-input', wrap);
      if (input) {
        try { input.focus(); } catch (_) {}
      }
    });
    window.scrollTo(0,0);
  }

  function openHistoryPage() {
    setActiveBottomTab('history');
    const wrap = el('div', {class:'search-page'});
    wrap.innerHTML = `<h2>Lịch sử xem phim</h2>`;
    const grid = el('div', {class:'search-grid'});
    const h = loadHistory();
    if (!h.length) grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><p>Chưa có lịch sử xem.</p></div>';
    else h.forEach(x => grid.appendChild(buildHistoryCard(x)));
    wrap.appendChild(grid);
    setMain(wrap);
    window.scrollTo(0,0);
  }

  function openFavoritesPage() {
    setActiveBottomTab('favorites');
    const wrap = el('div', {class:'search-page'});
    wrap.innerHTML = `<h2>Phim yêu thích</h2>`;
    const grid = el('div', {class:'search-grid'});
    const favs = loadFavorites();
    if (!favs.length) grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><p>Bạn chưa thêm phim yêu thích.</p></div>';
    else favs.forEach(x => grid.appendChild(buildCard(x, '--thumb-ratio:2/3;max-width:100%')));
    wrap.appendChild(grid);
    setMain(wrap);
    window.scrollTo(0,0);
  }

  /* ---------- BROWSE CATEGORY ---------- */
  const catTitles = {
    'phim-bo': {label:'Phim Bộ', icon:'📺'},
    'phim-le': {label:'Phim Lẻ', icon:'🎬'},
    'hoat-hinh': {label:'Anime / Hoạt Hình', icon:'🎌'},
    'tv-shows': {label:'TV Shows', icon:'📡'},
  };

  async function browseCategory(id) {
    const c = cfg();
    const catMap = (c && c.cats) ? c.cats : {};
    const baseUrl = catMap[id];
    if (!baseUrl) return;
    const info = catTitles[id] || {label: id, icon:'🎞️'};

    // --- Build page skeleton ---
    const wrap = el('div', {class:'search-page'});
    const head = el('div', {style:'display:flex;align-items:center;gap:12px;margin-bottom:24px'});
    const backBtn = el('button', {
      style:'background:var(--surface);border:none;color:var(--text2);padding:8px 14px;border-radius:var(--radius);cursor:pointer;font-size:.9rem;display:flex;align-items:center;gap:6px',
      onclick: () => goHome()
    });
    backBtn.innerHTML = '<i class="fa-solid fa-chevron-left"></i> Trang chủ';
    const hTitle = el('h2', {style:'font-size:1.5rem;font-weight:800;color:var(--text)'});
    hTitle.textContent = `${info.icon} ${info.label}`;
    const countBadge = el('span', {style:'margin-left:auto;font-size:.85rem;color:var(--muted)'});
    head.appendChild(backBtn);
    head.appendChild(hTitle);
    head.appendChild(countBadge);
    wrap.appendChild(head);

    const grid = el('div', {class:'search-grid'});
    wrap.appendChild(grid);
    const loadWrap = el('div', {style:'display:flex;justify-content:center;margin-top:30px;padding-bottom:40px'});
    wrap.appendChild(loadWrap);
    const endSentinel = el('div', {style:'height:1px'});
    wrap.appendChild(endSentinel);

    setMain(wrap);
    window.scrollTo(0, 0);

    let page = 1;
    let totalPages = 1;
    let totalItems = 0;
    let loadedCount = 0;
    let loading = false;

    function getGridColumns() {
      try {
        const cols = getComputedStyle(grid).gridTemplateColumns || '';
        const count = cols.split(' ').filter(Boolean).length;
        return Math.max(1, count || 1);
      } catch (_) {
        return 1;
      }
    }

    async function ensureMinRows(rows = 2) {
      const needed = getGridColumns() * Math.max(1, rows);
      while (!loading && page <= totalPages && loadedCount < needed) {
        await loadPage();
      }
    }

    function buildLoadMoreBtn() {
      loadWrap.innerHTML = '';
      if (page > totalPages) {
        const done = el('p', {style:'color:var(--muted);font-size:.9rem'});
        done.textContent = `Đã hiển thị tất cả ${loadedCount} phim`;
        loadWrap.appendChild(done);
        return;
      }
      const btn = el('button', {
        style:'background:var(--accent);color:#fff;border:none;padding:11px 32px;border-radius:var(--radius);font-size:.95rem;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:10px;transition:background .2s',
        onclick: () => loadPage()
      });
      btn.innerHTML = '<i class="fa-solid fa-angles-down"></i> Tải thêm phim';
      btn.onmouseover = () => btn.style.background = 'var(--accent2)';
      btn.onmouseout = () => btn.style.background = 'var(--accent)';
      loadWrap.appendChild(btn);
    }

    async function loadPage() {
      if (loading) return;
      loading = true;
      loadWrap.innerHTML = '';
      loadWrap.appendChild(loader());

      try {
        const url = `${baseUrl}?page=${page}&sort_field=modified.time&sort_type=desc`;
        const data = await fetchJSON(url);
        const items = await normalizeItems(data, c.img);

        // Extract pagination info from API response
        if (page === 1) {
          const pag = (data.data && data.data.params && data.data.params.pagination)
                   || (data.pagination)
                   || {};
          totalItems = pag.totalItems || pag.total_items || items.length;
          totalPages = pag.totalItemsPerPage
            ? Math.ceil(totalItems / pag.totalItemsPerPage)
            : (pag.totalPages || pag.total || 1);
          countBadge.textContent = `${totalItems.toLocaleString()} phim`;
          grid.innerHTML = '';
        }

        items.forEach(m => grid.appendChild(buildCard(m)));
        loadedCount += items.length;
        page++;
      } catch(_) {
        loadWrap.innerHTML = '<p style="color:var(--muted)">Có lỗi xảy ra, vui lòng thử lại.</p>';
      }

      loading = false;
      buildLoadMoreBtn();
    }

    // First load
    grid.appendChild(loader());
    await loadPage();
    await ensureMinRows(2);

    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        if (!entries.some(en => en.isIntersecting)) return;
        if (!loading && page <= totalPages) loadPage();
      }, { rootMargin: '260px 0px' });
      io.observe(endSentinel);
    }
  }

  /* ---------- WATCH ---------- */
  async function goWatch(movieSlug, epSlug, srvName) {
    try {
      document.body.style.backgroundImage = 'none';

      // Cleanup previous watch view (episode switch) to avoid stacked listeners
      if (liveWatchCleanup) {
        try { liveWatchCleanup(); } catch (_) {}
        liveWatchCleanup = null;
      }
      if (liveHls) {
        try { liveHls.destroy(); } catch (_) {}
        liveHls = null;
      }

      // Best-effort cleanup when switching episodes (avoid multiple players running)
      const oldVid = document.getElementById('vid');
      if (oldVid) {
        try { oldVid.pause(); oldVid.removeAttribute('src'); oldVid.load(); } catch (_) {}
      }
      const oldIfr = document.getElementById('ifr');
      if (oldIfr) {
        try { oldIfr.innerHTML = ''; } catch (_) {}
      }

      if (!movieData || !movieData.movie || !Array.isArray(movieData.episodes) || !movieData.episodes.length || (movieData.movie && movieData.movie.slug !== movieSlug)) {
        try {
          const { data, sourceKey } = await getMovieDetailWithFallback(movieSlug, { force: true });
          movieData = { movie: data.movie || data.item, episodes: data.episodes || [], sourceKey };
        } catch (_) {
          toast('Không thể mở phim từ lịch sử. Vui lòng thử lại.');
          return;
        }
      }

      // Prefetch manifest khi đã có dữ liệu tập
      try {
        const eps = (movieData && movieData.episodes) || [];
        const firstSrv = Array.isArray(eps) && eps.length ? eps[0] : null;
        const firstEp = firstSrv && firstSrv.server_data && firstSrv.server_data[0];
        const manifestUrl = firstEp ? firstEp.link_m3u8 : '';
        prefetchManifest(manifestUrl);
      } catch (_) {}

      const c = CFG[movieData.sourceKey] || cfg();
      const { movie: m, episodes } = movieData;

      const serverCtx = resolveActiveServerContext(episodes, movieSlug, srvName, epSlug);
      const activeServer = serverCtx.server;
      const activeEp = serverCtx.ep;
      const resolvedEpSlug = serverCtx.epSlug;

      const playUrl = activeEp ? (activeEp.link_m3u8 || activeEp.link_embed) : null;
      const playType = activeEp && activeEp.link_m3u8 ? 'm3u8' : 'iframe';
      const currentSrvName = serverCtx.serverName || srvName || '';
      const currentEpSlug = resolvedEpSlug || epSlug || '';

      if (activeServer && activeServer.server_name) rememberServer(movieSlug, activeServer.server_name);
      const epList = serverCtx.epList;
      const epIndex = epList.findIndex(e => e && e.slug === currentEpSlug);
      const prevEp = epIndex > 0 ? epList[epIndex - 1] : null;
      const nextEp = (epIndex >= 0 && epIndex < epList.length - 1) ? epList[epIndex + 1] : null;

      const autoNextKey = 'devthinh:autoNext';
      let autoNext = 'true';
      try { const v = localStorage.getItem(autoNextKey); if (v !== null) autoNext = v; } catch (_) {}
      autoNext = autoNext === 'true';

      const progressKey = `devthinh:progress:${movieSlug}:${currentEpSlug}:${currentSrvName}`;
      let savedTime = 0;
      try { savedTime = Number(localStorage.getItem(progressKey)) || 0; } catch (_) {}

      const page = el('div', {class:'watch-page', style:'display:flex;flex-direction:column;opacity:1!important;visibility:visible!important'});



      // Episode-based animated background (liquid glass style)
      const bgPosterUrl = safeImg(
        (activeEp && (activeEp.poster_url || activeEp.thumb_url || activeEp.image)) ||
        m.poster_url || m.thumb_url,
        c.img
      );
      const pageBg = el('div', {class:'watch-bg'});
      const pageBgImg = el('div', {class:'watch-bg-img', style:`background-image:url('${bgPosterUrl}')`});
      const pageBgOverlay = el('div', {class:'watch-bg-overlay'});
      pageBg.appendChild(pageBgImg);
      pageBg.appendChild(pageBgOverlay);
      page.appendChild(pageBg);
      requestAnimationFrame(() => pageBgImg.classList.add('show'));

      // Record initial history entry (will be updated with real progress for m3u8)
      try {
        saveHistoryEntry({
          movieSlug,
          epSlug: currentEpSlug,
          srvName: currentSrvName,
          movieName: m && m.name ? m.name : '',
          epName: (activeEp && activeEp.name) ? activeEp.name : currentEpSlug,
          poster: bgPosterUrl,
          progressSeconds: 0
        });
      } catch (_) {}

      // 1. Player Area (Top)
      const pw = el('div', {class:'player-wrap'});
      const vid = el('video', {id:'vid', playsinline:'', autoplay:'', muted:'', preload:'auto'});
      const iframeWrap = el('div', {id:'ifr', style:'display:none;position:absolute;inset:0'});
      pw.appendChild(vid);
      pw.appendChild(iframeWrap);

    // controls
    const ctrlEl = el('div', {class:'controls'});
    ctrlEl.innerHTML = `
      <div class="progress-wrap" id="progwrap"><div class="progress-fill" id="progfill"></div></div>
      <div class="ctrl-row">
        <div class="ctrl-left">
          <button class="cb" id="skipback10btn" title="Lùi 10 giây"><i class="fa-solid fa-backward-step"></i></button>
          <button class="cb" id="playbtn" title="Phát / Tạm dừng"><i class="fa-solid fa-play"></i></button>
          <button class="cb" id="skipfwd10btn" title="Tiến 10 giây"><i class="fa-solid fa-forward-step"></i></button>
          <button class="cb" id="mutebtn" title="Bật/Tắt âm thanh"><i class="fa-solid fa-volume-high"></i></button>
          <span class="time-txt" id="timetxt">00:00 / 00:00</span>
        </div>
        <div class="ctrl-right">
          <div class="qmenu-wrap">
            <button class="cb" id="qbtn" title="Chất lượng"><i class="fa-solid fa-gear"></i></button>
            <div class="qmenu" id="qmenu"></div>
          </div>
          <button class="cb" id="speedbtn" title="Tốc độ phát"><span class="speed-txt" id="speedTxt">1x</span></button>
          <button class="cb" id="pipbtn" title="Picture in Picture"><i class="fa-regular fa-clone"></i></button>
          <button class="cb" id="theaterbtn" title="Chế độ rạp"><i class="fa-solid fa-clapperboard"></i></button>
          <button class="cb" id="autonextbtn" title="Tự động phát tập tiếp"><i class="fa-solid fa-forward-fast"></i></button>
          <button class="cb" id="fsbtn" title="Toàn màn hình"><i class="fa-solid fa-expand"></i></button>
        </div>
      </div>`;
    pw.appendChild(ctrlEl);
    const playerMeta = el('div', {class:'player-meta-overlay'});
    playerMeta.innerHTML = `
      <div class="player-meta-title">${m.name || 'Đang phát'}</div>
      <div class="player-meta-ep">${activeEp?.name ? `Tập ${activeEp.name}` : (currentEpSlug || 'Tập hiện tại')}</div>
      <div class="player-meta-row">
        <span class="player-meta-chip age">${m.lang || 'Vietsub'}</span>
        <span class="player-meta-chip">${m.quality || 'FHD'}</span>
        <span class="player-meta-chip">${m.year || 'N/A'}</span>
      </div>`;
    pw.appendChild(playerMeta);

    const gLeft = el('div', {class:'gesture-hint left', id:'gLeft'}, '⏪ 10s');
    const gRight = el('div', {class:'gesture-hint right', id:'gRight'}, '10s ⏩');
    pw.appendChild(gLeft);
    pw.appendChild(gRight);


    page.appendChild(pw);

    // 2. Info Section (Below Player) - layout like reference
    const infoSec = el('div', {class:'watch-info-section', style:'padding-top:10px'});
    const mainCol = el('div', {class:'watch-main-col'});

    // Title & action row
    const infoHead = el('div', {class:'watch-card', style:'display:flex;align-items:flex-start;gap:12px'});
    const backBtn = el('button', {
      style:'background:rgba(255,255,255,0.1);border:none;color:#fff;width:40px;height:40px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .2s;flex-shrink:0',
      id: 'watchbackbtn'
    });
    backBtn.innerHTML = '<i class="fa-solid fa-arrow-left"></i>';
    backBtn.onmouseover = () => backBtn.style.background = 'var(--red)';
    backBtn.onmouseout = () => backBtn.style.background = 'rgba(255,255,255,0.1)';
    infoHead.appendChild(backBtn);

    const shareBtn = el('button', {
      style:'background:rgba(255,255,255,0.1);border:none;color:#fff;width:40px;height:40px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .2s;flex-shrink:0',
      id: 'watchsharebtn'
    });
    shareBtn.innerHTML = '<i class="fa-solid fa-link"></i>';
    shareBtn.onmouseover = () => shareBtn.style.background = 'rgba(229,9,20,0.22)';
    shareBtn.onmouseout = () => shareBtn.style.background = 'rgba(255,255,255,0.1)';
    shareBtn.onclick = async () => {
      try {
        const url = window.location.href;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(url);
        } else {
          const ta = document.createElement('textarea');
          ta.value = url;
          ta.style.position = 'fixed';
          ta.style.left = '-9999px';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        toast('Đã sao chép link!');
      } catch (_) {
        toast('Không thể sao chép link');
      }
    };
    infoHead.appendChild(shareBtn);

    const txtWrap = el('div', {style:'flex:1'});
    txtWrap.innerHTML = `
      <h1 class="watch-info-title">${m.name}</h1>
      <div class="watch-info-meta">
        <span><i class="fa-regular fa-calendar"></i> ${m.year || 'N/A'}</span>
        <span><i class="fa-solid fa-language"></i> ${m.lang || 'Vietsub'}</span>
        <span><i class="fa-solid fa-tv"></i> ${m.quality || 'FHD'}</span>
        <span><i class="fa-solid fa-certificate"></i> ${m.lang || '13+'}</span>
      </div>
      <div class="watch-action-row">
        <button class="watch-action-btn" id="jumpEpisodeBtn"><i class="fa-solid fa-list"></i> Danh sách tập</button>
      </div>
      <div class="lang-switch" id="langSwitch">
        <button class="lang-btn active" data-lang="vietsub">Vietsub</button>
        <button class="lang-btn" data-lang="thuyet-minh">Thuyết minh</button>
        <button class="lang-btn" data-lang="long-tieng">Lồng tiếng</button>
      </div>
      </div>`;
    infoHead.appendChild(txtWrap);
    mainCol.appendChild(infoHead);

    // Server Selection
    if (episodes.length > 1) {
      const srvWrap = el('div', {class:'watch-content-align watch-card', style:'margin-top:8px'});
      srvWrap.innerHTML = '<div style="color:var(--text2);margin-bottom:10px;font-size:.88rem;font-weight:700;letter-spacing:.3px">MÁY CHỦ PHÁT</div>';
      const srvList = el('div', {class:'watch-server-list'});
      episodes.forEach(s => {
        const b = el('button', {class:`w-srv-btn${s.server_name===currentSrvName?' active':''}`, onclick:()=> goWatch(movieSlug, s.server_data[0]?.slug||currentEpSlug, s.server_name)});
        b.innerHTML = `<i class="fa-solid fa-server"></i> ${s.server_name}`;
        srvList.appendChild(b);
      });
      srvWrap.appendChild(srvList);
      mainCol.appendChild(srvWrap);
    }

    // Episodes Grid
    if (activeServer && activeServer.server_data.length > 0) {
      const epWrap = el('div', {class:'watch-content-align watch-card', style:'margin-top:10px;padding-bottom:12px'});
      epWrap.innerHTML = '<div style="color:var(--text2);margin-bottom:12px;font-size:.9rem;font-weight:700;letter-spacing:.3px">TẬP PHIM</div>';
      const epGrid = el('div', {class:'watch-ep-grid'});

      const epPreview = el('div', {class:'ep-preview', id:'epPreview'});
      epPreview.innerHTML = `
        <div class="ep-preview-img" id="epPreviewImg"></div>
        <div class="ep-preview-tag" id="epPreviewTag"></div>
      `;
      page.appendChild(epPreview);

      const epPreviewImg = qs('#epPreviewImg', page);
      const epPreviewTag = qs('#epPreviewTag', page);
      const supportsHover = !!(window.matchMedia && window.matchMedia('(hover:hover)').matches);

      const makeEpButton = (ep, targetGrid) => {
        const b = el('button', {class:`ep-num${ep.slug===currentEpSlug?' active':''}`, onclick:()=>goWatch(movieSlug, ep.slug, currentSrvName)});
        b.textContent = ep.name;
        targetGrid.appendChild(b);

        const epThumb = safeImg(ep.poster_url || ep.thumb_url || ep.image || ep.poster || '', c.img) || bgPosterUrl;
        if (supportsHover) {
          b.addEventListener('pointerenter', () => {
            epPreviewImg.style.backgroundImage = `url('${epThumb}')`;
            epPreviewTag.textContent = ep.name || ep.slug || 'Tập';
            epPreview.classList.add('show');
          });
          b.addEventListener('pointermove', e => {
            epPreview.style.left = e.clientX + 'px';
            epPreview.style.top = e.clientY + 'px';
          });
          b.addEventListener('pointerleave', () => epPreview.classList.remove('show'));
        }
      };

      activeServer.server_data.forEach(ep => {
        makeEpButton(ep, epGrid);
      });

      epWrap.appendChild(epGrid);
      mainCol.appendChild(epWrap);

      const navRow = el('div', {class:'watch-content-align', style:'display:flex;gap:10px;flex-wrap:wrap;margin-top:14px'});
      const prevBtn = el('button', {class:'w-srv-btn', onclick:()=> prevEp && goWatch(movieSlug, prevEp.slug, currentSrvName)});
      prevBtn.innerHTML = '<i class="fa-solid fa-arrow-left"></i> Tập trước';
      if (!prevEp) {
        prevBtn.disabled = true;
        prevBtn.style.opacity = '0.45';
        prevBtn.style.pointerEvents = 'none';
      }
      const nextBtn = el('button', {class:'w-srv-btn', onclick:()=> nextEp && goWatch(movieSlug, nextEp.slug, currentSrvName)});
      nextBtn.innerHTML = 'Tập tiếp <i class="fa-solid fa-arrow-right"></i>';
      if (!nextEp) {
        nextBtn.disabled = true;
        nextBtn.style.opacity = '0.45';
        nextBtn.style.pointerEvents = 'none';
      }
      navRow.appendChild(prevBtn);
      navRow.appendChild(nextBtn);
      mainCol.appendChild(navRow);
    }

    // Movies Description setup
    if (m.content) {
      const desc = el('div', {class:'watch-info-desc watch-card'});
      desc.innerHTML = m.content;
      mainCol.appendChild(desc);
    }

    infoSec.appendChild(mainCol);
    page.appendChild(infoSec);

    // ---- PLAYER LOGIC ----
    let hls = null;
    let qOpen = false;
    let idleTimer = null;

    let pendingSeekTimer = null;
    let preferHighQuality = true;
    let qualityAutoFallback = false;
    let autoFallbackCooldownUntil = 0;
    let lowBufferSince = 0;
    let lastAutoDowngradeAt = 0;
    let fallbackRecoverStableSince = 0;
    let stallCount = 0;
    let lastStallAt = 0;
    let qualityProfile = loadQualityProfile();
    const VIDEO_QUALITY_KEY = 'devthinh:videoQualityMode';
    function loadQualityMode() {
      try {
        const v = localStorage.getItem(VIDEO_QUALITY_KEY) || 'auto';
        return ['auto', 'best', 'data-saver'].includes(v) ? v : 'auto';
      } catch (_) {
        return 'auto';
      }
    }
    function saveQualityMode(v = 'auto') {
      const mode = ['auto', 'best', 'data-saver'].includes(v) ? v : 'auto';
      try { localStorage.setItem(VIDEO_QUALITY_KEY, mode); } catch (_) {}
      return mode;
    }
    let qualityMode = loadQualityMode();

    let lastSaveAt = 0;
    let lastHistoryAt = 0;
    let didSeek = false;

    function saveProgress(force=false) {
      if (playType !== 'm3u8') return;
      const t = vid && isFinite(vid.currentTime) ? vid.currentTime : 0;
      if (!isFinite(t)) return;
      const now = Date.now();
      if (!force && now - lastSaveAt < 5000) return;
      lastSaveAt = now;
      try { localStorage.setItem(progressKey, String(t)); } catch (_) {}

      // Update watch history (throttled)
      if (force || now - lastHistoryAt > 30000) {
        lastHistoryAt = now;
        try {
          saveHistoryEntry({
            movieSlug,
            epSlug: currentEpSlug,
            srvName: currentSrvName,
            movieName: m && m.name ? m.name : '',
            epName: (activeEp && activeEp.name) ? activeEp.name : currentEpSlug,
            poster: bgPosterUrl,
            progressSeconds: Math.floor(t)
          });
        } catch (_) {}
      }
    }

    function seekToSaved() {
      if (playType !== 'm3u8') return;
      if (didSeek) return;
      if (!savedTime || savedTime < 3) return;
      try {
        if (vid.duration && isFinite(vid.duration) && vid.duration > 10) {
          const max = Math.max(0, vid.duration - 5);
          const clamped = Math.min(savedTime, max);
          if (clamped > 2) {
            vid.currentTime = clamped;
            didSeek = true;
          }
        } else {
          vid.currentTime = savedTime;
          didSeek = true;
        }
      } catch (_) {}
    }

    function fmtTime(s) {
      if (!s || isNaN(s)) return '00:00';
      const m = Math.floor(s/60), sec = Math.floor(s%60);
      return `${m<10?'0':''}${m}:${sec<10?'0':''}${sec}`;
    }


    function resetIdle() {
      page.classList.remove('idle');
      clearTimeout(idleTimer);
      if (!vid.paused) idleTimer = setTimeout(()=>{ if(!qOpen) page.classList.add('idle'); }, 2000);
    }

    pw.addEventListener('mousemove', resetIdle, {passive:true});
    pw.addEventListener('touchstart', resetIdle, {passive:true});

    let lastTapAt = 0;
    vid.addEventListener('touchend', (e) => {
      if (playType !== 'm3u8') return;
      const now = Date.now();
      const dt = now - lastTapAt;
      lastTapAt = now;
      if (dt > 320) return;
      const t = e.changedTouches && e.changedTouches[0];
      if (!t) return;
      const r = vid.getBoundingClientRect();
      const x = t.clientX - r.left;
      if (x < r.width / 2) jumpSeconds(-10);
      else jumpSeconds(10);
    }, {passive:true});

    vid.addEventListener('play', () => { page.classList.add('playing'); page.classList.remove('paused'); qs('#playbtn i', pw).className = 'fa-solid fa-pause'; resetIdle(); });
    vid.addEventListener('pause', () => { page.classList.remove('playing'); page.classList.add('paused'); qs('#playbtn i', pw).className = 'fa-solid fa-play'; clearTimeout(idleTimer); });

    vid.addEventListener('waiting', () => {
      if (playType !== 'm3u8' || !hls || !hls.levels || !hls.levels.length || qualityManual) return;
      const now = Date.now();
      if (now - lastStallAt < 2500) return;
      lastStallAt = now;
      stallCount += 1;

      if (stallCount >= 2) {
        autoFallbackCooldownUntil = now + 45000;
        lastAutoDowngradeAt = now;
        const cap = getProfileCapIndex(hls.levels);
        hls.autoLevelCapping = cap;
        hls.currentLevel = -1;
        hls.loadLevel = -1;
        toast('Mạng yếu, đang tự giảm chất lượng để mượt hơn');
      }
    });

    vid.addEventListener('playing', () => {
      stallCount = 0;
    });
    vid.addEventListener('timeupdate', () => {
      const cur = vid.currentTime || 0;
      const dur = vid.duration || 0;
      const pct = dur ? (cur / dur)*100 : 0;
      qs('#progfill', pw).style.width = pct + '%';
      qs('#timetxt', pw).textContent = `${fmtTime(cur)} / ${fmtTime(dur)}`;

      if (playType === 'm3u8' && hls && hls.media && !qualityManual && qualityAutoFallback) {
        const now = Date.now();
        const buf = hls.media.buffered;
        let ahead = 0;
        if (buf && buf.length) {
          for (let i = 0; i < buf.length; i++) {
            const s = buf.start(i);
            const e = buf.end(i);
            if (cur >= s && cur <= e) {
              ahead = Math.max(0, e - cur);
              break;
            }
          }
        }

        // Tối ưu mượt: chỉ fallback khi thiếu buffer nghiêm trọng, tránh nhảy quality liên tục
        if (ahead < 1.2) {
          if (!lowBufferSince) lowBufferSince = now;
          const lowFor = now - lowBufferSince;
          if (lowFor > 3000 && now - lastAutoDowngradeAt > 15000 && hls.levels && hls.levels.length > 1) {
            autoFallbackCooldownUntil = now + 35000;
            lastAutoDowngradeAt = now;
            const cap = getProfileCapIndex(hls.levels);
            hls.autoLevelCapping = cap;
            hls.currentLevel = -1;
            hls.loadLevel = -1;
          }
          fallbackRecoverStableSince = 0;
        } else {
          lowBufferSince = 0;
          if (ahead > 10) {
            if (!fallbackRecoverStableSince) fallbackRecoverStableSince = now;
            if (autoFallbackCooldownUntil > 0 && now > autoFallbackCooldownUntil && now - fallbackRecoverStableSince > 10000) {
              autoFallbackCooldownUntil = 0;
              if (hls.levels && hls.levels.length) {
                const cap = getProfileCapIndex(hls.levels);
                hls.autoLevelCapping = cap;
                hls.currentLevel = -1;
                hls.loadLevel = -1;
              }
            }
          } else {
            fallbackRecoverStableSince = 0;
          }
        }
      }

      if (playType === 'm3u8' && dur > 30) {
        // giữ logic đơn giản, không tự skip intro/outro để tránh nhảy cảnh ngoài ý muốn
      }

      saveProgress(false);
    });

    function requestSeek(targetTime) {
      if (playType !== 'm3u8') return;
      if (!isFinite(targetTime)) return;
      const dur = vid.duration && isFinite(vid.duration) ? vid.duration : null;
      const clamped = dur ? Math.max(0, Math.min(targetTime, dur)) : Math.max(0, targetTime);

      if (pendingSeekTimer) {
        clearTimeout(pendingSeekTimer);
        pendingSeekTimer = null;
      }

      try {
        if (hls && typeof hls.stopLoad === 'function') hls.stopLoad();
        vid.currentTime = clamped;
        saveProgress(true);
      } catch (_) {}

      pendingSeekTimer = setTimeout(() => {
        try { if (hls && typeof hls.startLoad === 'function') hls.startLoad(); } catch (_) {}
        pendingSeekTimer = null;
      }, 22);
    }

    qs('#progwrap', pw).addEventListener('click', e => {
      const r = e.currentTarget.getBoundingClientRect();
      requestSeek(((e.clientX-r.left)/r.width) * vid.duration);
    });

    qs('#playbtn', pw).onclick = () => vid.paused ? vid.play() : vid.pause();
    vid.onclick = () => vid.paused ? vid.play() : vid.pause();

    // Skip + playback speed (video only; iframe can't control)
    const skipBack10Btn = qs('#skipback10btn', pw);
    const skipFwd10Btn = qs('#skipfwd10btn', pw);
    const speedBtn = qs('#speedbtn', pw);
    const speedTxt = qs('#speedTxt', pw);
    const pipBtn = qs('#pipbtn', pw);
    const theaterBtn = qs('#theaterbtn', pw);

    function showGestureHint(side) {
      const node = side === 'left' ? qs('#gLeft', pw) : qs('#gRight', pw);
      if (!node) return;
      node.classList.add('show');
      setTimeout(() => node.classList.remove('show'), 380);
    }

    function jumpSeconds(delta) {
      if (playType !== 'm3u8') return;
      if (!vid || !isFinite(vid.currentTime)) return;
      try {
        const dur = vid.duration && isFinite(vid.duration) ? vid.duration : null;
        const next = vid.currentTime + delta;
        const target = dur ? Math.max(0, Math.min(next, dur)) : Math.max(0, next);
        requestSeek(target);

        // Sau seek lớn, ưu tiên ổn định buffer để giảm lag khúc vừa tua
        if (hls && !qualityManual && Math.abs(delta) >= 10 && hls.levels && hls.levels.length > 1) {
          autoFallbackCooldownUntil = Date.now() + 16000;
          const cap = getProfileCapIndex(hls.levels);
          hls.autoLevelCapping = cap;
          hls.currentLevel = -1;
          hls.loadLevel = -1;
        }

        showGestureHint(delta < 0 ? 'left' : 'right');
      } catch (_) {}
    }

    const rateSteps = [0.75, 1, 1.25, 1.5, 2];
    let rateIdx = 1;
    try {
      const cur = vid && isFinite(vid.playbackRate) ? vid.playbackRate : 1;
      const closest = rateSteps.reduce((best, r, i) => Math.abs(r - cur) < Math.abs(rateSteps[best] - cur) ? i : best, 1);
      rateIdx = closest;
    } catch (_) {}

    function applyRate(r) {
      if (playType !== 'm3u8') return;
      try {
        vid.playbackRate = r;
        if (speedTxt) speedTxt.textContent = `${r}x`.replace('.0x','x');
      } catch (_) {}
    }
    applyRate(rateSteps[rateIdx]);

    if (skipBack10Btn) skipBack10Btn.onclick = () => jumpSeconds(-10);
    if (skipFwd10Btn) skipFwd10Btn.onclick = () => jumpSeconds(10);
    if (speedBtn) {
      speedBtn.onclick = e => {
        e.stopPropagation();
        if (playType !== 'm3u8') return;
        rateIdx = (rateIdx + 1) % rateSteps.length;
        applyRate(rateSteps[rateIdx]);
      };
    }

    if (pipBtn) {
      pipBtn.onclick = async e => {
        e.stopPropagation();
        if (playType !== 'm3u8') return;
        try {
          if (document.pictureInPictureElement) {
            await document.exitPictureInPicture();
            pipBtn.classList.remove('on');
          } else if (document.pictureInPictureEnabled && vid.requestPictureInPicture) {
            await vid.requestPictureInPicture();
            pipBtn.classList.add('on');
          }
        } catch (_) {}
      };
      vid.addEventListener('enterpictureinpicture', () => pipBtn.classList.add('on'));
      vid.addEventListener('leavepictureinpicture', () => pipBtn.classList.remove('on'));
    }

    if (theaterBtn) {
      theaterBtn.onclick = e => {
        e.stopPropagation();
        page.classList.toggle('theater');
        theaterBtn.classList.toggle('on', page.classList.contains('theater'));
      };
    }

    // Keyboard shortcuts (video only for seek/speed)
    const isTypingTarget = t => {
      if (!t) return false;
      const tag = (t.tagName || '').toUpperCase();
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
    };
    function onKeyDown(e) {
      if (isTypingTarget(e.target)) return;
      // Avoid scrolling on space/arrow keys
      if ([' ', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
      if (e.key === ' ' || e.key === 'Spacebar') {
        vid.paused ? vid.play() : vid.pause();
        return;
      }
      if (e.key === 'm' || e.key === 'M') {
        vid.muted = !vid.muted;
        const ico = qs('#mutebtn i', pw);
        if (ico) ico.className = vid.muted ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high';
        return;
      }
      if (e.key === 'ArrowLeft') {
        jumpSeconds(-(e.shiftKey ? 30 : 10));
        return;
      }
      if (e.key === 'ArrowRight') {
        jumpSeconds((e.shiftKey ? 30 : 10));
        return;
      }
      if (e.key >= '1' && e.key <= '5' && playType === 'm3u8') {
        const idx = parseInt(e.key, 10) - 1;
        if (idx >= 0 && idx < rateSteps.length) {
          rateIdx = idx;
          applyRate(rateSteps[rateIdx]);
        }
        return;
      }
      if (e.key === 'f' || e.key === 'F') {
        const fsBtn = qs('#fsbtn', pw);
        if (fsBtn && typeof fsBtn.onclick === 'function') fsBtn.onclick(new Event('click'));
        return;
      }
      if (e.key === 't' || e.key === 'T') {
        if (theaterBtn && typeof theaterBtn.onclick === 'function') theaterBtn.onclick(new Event('click'));
        return;
      }
      if (e.key === 'p' || e.key === 'P') {
        if (pipBtn && typeof pipBtn.onclick === 'function') pipBtn.onclick(new Event('click'));
        return;
      }
      if (e.key === 'g' || e.key === 'G') {
        // g -> next episode
        if (nextEp) goWatch(movieSlug, nextEp.slug, currentSrvName);
      }
    }
    document.addEventListener('keydown', onKeyDown);

    // Auto-next toggle + resume progress
    const autoBtn = qs('#autonextbtn', pw);
    if (autoBtn) {
      const setUI = () => {
        autoBtn.classList.toggle('on', autoNext);
        const ico = autoBtn.querySelector('i');
        if (ico) ico.className = autoNext ? 'fa-solid fa-forward-fast' : 'fa-solid fa-ban';
      };
      setUI();
      autoBtn.onclick = e => {
        e.stopPropagation();
        autoNext = !autoNext;
        try { localStorage.setItem(autoNextKey, autoNext ? 'true' : 'false'); } catch (_) {}
        setUI();
      };
    }

    if (playType === 'm3u8') {
      vid.addEventListener('loadedmetadata', () => { seekToSaved(); }, {once: true});
      if (nextEp) {
        vid.addEventListener('ended', () => {
          saveProgress(true);
          try { localStorage.setItem(progressKey, '0'); } catch (_) {}
          try {
            saveHistoryEntry({
              movieSlug,
              epSlug,
              srvName,
              movieName: m && m.name ? m.name : '',
              epName: (activeEp && activeEp.name) ? activeEp.name : epSlug,
              poster: bgPosterUrl,
              progressSeconds: 0
            });
          } catch (_) {}
          if (!autoNext) return;
          setTimeout(() => goWatch(movieSlug, nextEp.slug, currentSrvName), 500);
        });
      }
    }

    // Fullscreen orientation: try to lock landscape (Android/iOS) and
    // apply a visual fallback when lock is not available.
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isLandscape = () => window.matchMedia && window.matchMedia('(orientation: landscape)').matches;
    const isAnyFullscreen = () =>
      !!(document.fullscreenElement || document.webkitFullscreenElement || vid.webkitDisplayingFullscreen);

    function tryLockLandscape() {
      try {
        if (screen.orientation && typeof screen.orientation.lock === 'function') {
          // Some browsers return a promise; ignore failures to avoid breaking playback.
          return screen.orientation.lock('landscape').catch(() => {});
        }
      } catch (_) {}
      return null;
    }

    function applyRotateFallback() {
      if (!isAnyFullscreen()) return;
      if (!isLandscape() && !isIOS) page.classList.add('rotate-fallback');
      else page.classList.remove('rotate-fallback');
    }

    const onFullscreenChange = () => {
      const fs = isAnyFullscreen();
      page.classList.toggle('is-film-fullscreen', fs);
      if (fs) {
        // Keep this inside the fullscreen transition to reduce iOS glitches.
        tryLockLandscape();
        setTimeout(applyRotateFallback, 250);
      } else {
        page.classList.remove('rotate-fallback');
        try {
          if (screen.orientation && typeof screen.orientation.unlock === 'function') screen.orientation.unlock();
        } catch (_) {}
      }
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    window.addEventListener('resize', onFullscreenChange);
    window.addEventListener('orientationchange', onFullscreenChange);

    liveWatchCleanup = () => {
      try { document.removeEventListener('keydown', onKeyDown); } catch (_) {}
      try { document.removeEventListener('fullscreenchange', onFullscreenChange); } catch (_) {}
      try { window.removeEventListener('resize', onFullscreenChange); } catch (_) {}
      try { window.removeEventListener('orientationchange', onFullscreenChange); } catch (_) {}
      try { saveProgress(true); } catch (_) {}
      if (pendingSeekTimer) {
        try { clearTimeout(pendingSeekTimer); } catch (_) {}
        pendingSeekTimer = null;
      }

      try {
        if (playType !== 'm3u8') {
          saveHistoryEntry({
            movieSlug,
            epSlug,
            srvName,
            movieName: m && m.name ? m.name : '',
            epName: (activeEp && activeEp.name) ? activeEp.name : epSlug,
            poster: bgPosterUrl,
            progressSeconds: 0
          });
        }
      } catch (_) {}
      try {
        if (hls) {
          hls.destroy();
          hls = null;
        }
      } catch (_) {}
      try {
        if (screen.orientation && typeof screen.orientation.unlock === 'function') screen.orientation.unlock();
      } catch (_) {}
    };

    qs('#mutebtn', pw).onclick = () => {
      vid.muted = !vid.muted;
      qs('#mutebtn i', pw).className = vid.muted ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high';
    };
    qs('#fsbtn', pw).onclick = () => {
      if (isAnyFullscreen()) {
        (document.exitFullscreen || document.webkitExitFullscreen || (() => {})).call(document);
      } else if (isIOS && vid.webkitEnterFullscreen) {
        vid.webkitEnterFullscreen();
      } else {
        const el = pw.requestFullscreen ? pw : vid;
        (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el);
      }
      // Best-effort lock for Android/iOS; fallback will be applied by onFullscreenChange.
      tryLockLandscape();
      setTimeout(applyRotateFallback, 350);
    };

    // Quality menu
    const qbtn = qs('#qbtn', pw), qmenu = qs('#qmenu', pw);

    if(qbtn && qmenu) {
      qbtn.onclick = e => { e.stopPropagation(); qOpen = !qOpen; qmenu.classList.toggle('open', qOpen); };
      document.addEventListener('click', e => { if (qOpen && !e.target.closest('.qmenu-wrap')) { qOpen = false; qmenu.classList.remove('open'); } });
    } // End if (prevent crash if missing)


    const jumpEpisodeBtn = qs('#jumpEpisodeBtn', page);
    if (jumpEpisodeBtn) {
      jumpEpisodeBtn.onclick = () => {
        const epWrap = qs('.watch-ep-grid', page);
        if (epWrap && epWrap.scrollIntoView) epWrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
      };
    }

    const langSwitch = qs('#langSwitch', page);
    if (langSwitch) {
      const langBtns = langSwitch.querySelectorAll('.lang-btn');
      const applyLanguage = (mode) => {
        if (!Array.isArray(episodes) || !episodes.length) return;
        const keyMap = {
          'vietsub': ['vietsub', 'sub', 'phụ đề'],
          'thuyet-minh': ['thuyết minh', 'thuyet minh', 'tm'],
          'long-tieng': ['lồng tiếng', 'long tieng', 'lt']
        };
        const keys = keyMap[mode] || [];
        const found = episodes.find(s => {
          const name = String((s && s.server_name) || '').toLowerCase();
          return keys.some(k => name.includes(k));
        });
        if (found && found.server_data && found.server_data.length) {
          goWatch(movieSlug, found.server_data[0].slug || currentEpSlug, found.server_name);
        } else {
          toast('Không có nguồn cho chế độ này');
        }
      };

      langBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          langBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          applyLanguage(btn.dataset.lang || 'vietsub');
        });
      });
    }


    function getBestLevelIndex(levels=[]) {
      if (!Array.isArray(levels) || !levels.length) return -1;
      let best = 0;
      for (let i = 1; i < levels.length; i++) {
        const a = levels[i] || {};
        const b = levels[best] || {};
        const sa = (a.height || 0) * 10000000 + (a.bitrate || 0);
        const sb = (b.height || 0) * 10000000 + (b.bitrate || 0);
        if (sa > sb) best = i;
      }
      return best;
    }

    function getLowestLevelIndex(levels=[]) {
      if (!Array.isArray(levels) || !levels.length) return -1;
      let idx = 0;
      for (let i = 1; i < levels.length; i++) {
        const a = levels[i] || {};
        const b = levels[idx] || {};
        const sa = (a.height || 0) * 10000000 + (a.bitrate || 0);
        const sb = (b.height || 0) * 10000000 + (b.bitrate || 0);
        if (sa < sb) idx = i;
      }
      return idx;
    }

    function get1080LockIndex(levels=[]) {
      if (!Array.isArray(levels) || !levels.length) return -1;
      let idx = -1;
      let bestScore = -1;
      for (let i = 0; i < levels.length; i++) {
        const lv = levels[i] || {};
        const h = Number(lv.height || 0);
        const b = Number(lv.bitrate || 0);
        if (h <= 1080 && h > 0) {
          const score = h * 10000000 + b;
          if (score > bestScore) {
            bestScore = score;
            idx = i;
          }
        }
      }
      return idx >= 0 ? idx : getLowestLevelIndex(levels);
    }

    function get720LockIndex(levels=[]) {
      if (!Array.isArray(levels) || !levels.length) return -1;
      let idx = -1;
      let bestScore = -1;
      for (let i = 0; i < levels.length; i++) {
        const lv = levels[i] || {};
        const h = Number(lv.height || 0);
        const b = Number(lv.bitrate || 0);
        if (h <= 720 && h > 0) {
          const score = h * 10000000 + b;
          if (score > bestScore) {
            bestScore = score;
            idx = i;
          }
        }
      }
      return idx >= 0 ? idx : getLowestLevelIndex(levels);
    }

    function getProfileCapIndex(levels=[]) {
      if (!Array.isArray(levels) || !levels.length) return -1;
      if (QUALITY_LOCK_1080) return get1080LockIndex(levels);

      if (qualityMode === 'best') return getBestLevelIndex(levels);
      if (qualityMode === 'data-saver') return get720LockIndex(levels);

      const conn = (navigator && navigator.connection) ? navigator.connection : null;
      const netType = String((conn && conn.effectiveType) || '').toLowerCase();
      const saveData = !!(conn && conn.saveData);
      const isWeakNet = saveData || netType.includes('2g') || netType.includes('3g');

      if (isWeakNet) return get720LockIndex(levels);
      return get1080LockIndex(levels);
    }

    let qualityManual = false;
    let qualityManualLevel = -1;

    function formatBitrate(v) {
      const n = Number(v || 0);
      if (!n) return '-- Mbps';
      return `${(n / 1000000).toFixed(2)} Mbps`;
    }

    function updatePlayerStats(state = {}) {
      const statsEl = qs('#playerStats', pw);
      const resEl = qs('#statRes', pw);
      const brEl = qs('#statBr', pw);
      if (!statsEl || !resEl || !brEl) return;

      const res = state.resolution || '--';
      const br = state.bitrateLabel || '-- Mbps';
      const health = state.health || 'ok';

      resEl.textContent = res;
      brEl.textContent = br;
      statsEl.classList.remove('warn', 'bad');
      if (health === 'warn') statsEl.classList.add('warn');
      if (health === 'bad') statsEl.classList.add('bad');
    }

    function applyPreferredQuality(levels=[]) {
      if (!hls || !Array.isArray(levels) || !levels.length) return -1;
      const capIdx = getProfileCapIndex(levels);
      hls.autoLevelCapping = capIdx;
      hls.currentLevel = -1;
      hls.loadLevel = -1;
      qualityManual = false;
      qualityManualLevel = -1;
      return capIdx;
    }

    function getActiveQualityIndex(levels, autoSelectLevel) {
      if (!Array.isArray(levels) || !levels.length) return -1;
      if (qualityManual && qualityManualLevel >= 0) return qualityManualLevel;
      if (hls && Number.isInteger(hls.currentLevel) && hls.currentLevel >= 0) return hls.currentLevel;
      if (hls && Number.isInteger(hls.loadLevel) && hls.loadLevel >= 0) return hls.loadLevel;
      if (hls && Number.isInteger(hls.nextLevel) && hls.nextLevel >= 0) return hls.nextLevel;
      return autoSelectLevel;
    }

    function buildQMenu(levels, autoSelectLevel) {
      qmenu.innerHTML = '';
      if (!levels || levels.length <= 1) {
        qmenu.innerHTML = '<div style="padding:10px 18px;color:var(--muted);font-size:.8rem">Chất lượng gốc</div>';
        return;
      }

      const activeIndex = getActiveQualityIndex(levels, autoSelectLevel);
      const activeLevel = activeIndex >= 0 ? levels[activeIndex] : null;
      const modeLabel = qualityManual ? 'MANUAL' : (QUALITY_LOCK_1080 ? 'LOCK 1080' : 'AUTO');
      const activeLabel = activeLevel
        ? `${activeLevel.height || '?'}p · ${formatBitrate(activeLevel.bitrate)}`
        : 'Adaptive';

      const head = el('div', {class:'qmenu-head'});
      head.innerHTML = `<span>Mode: <strong>${modeLabel}</strong></span><span>${activeLabel}</span>`;
      qmenu.appendChild(head);

      const sorted = levels.map((l,i)=>({...l,i})).sort((a,b)=>(b.height||b.bitrate)-(a.height||a.bitrate));
      const modeWrap = el('div', {style:'display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;padding:8px 10px 4px'});
      ['auto','best','data-saver'].forEach(mode => {
        const label = mode === 'auto' ? 'Auto' : (mode === 'best' ? 'Nét nhất' : 'Tiết kiệm');
        const mb = el('button', { class:`qbtn${qualityMode === mode ? ' active' : ''}`, type:'button' });
        mb.innerHTML = `<span>${label}</span><span class="qbtn-meta">Mode</span>`;
        mb.onclick = (e) => {
          e.stopPropagation();
          qualityMode = saveQualityMode(mode);
          if (!qualityManual && hls && hls.levels && hls.levels.length) {
            const selected = applyPreferredQuality(hls.levels || []);
            buildQMenu(hls.levels || [], selected);
          } else {
            buildQMenu(levels, autoSelectLevel);
          }
        };
        modeWrap.appendChild(mb);
      });
      qmenu.appendChild(modeWrap);

      const auto = el('button', {class:'qbtn', 'data-lvl':'-1', onclick: e=>selectQ(e,-1,auto)});
      auto.innerHTML = `<span>Tự động</span><span class="qbtn-meta">ABR</span>`;
      if (!qualityManual) auto.classList.add('active');
      qmenu.appendChild(auto);

      sorted.forEach(lv => {
        const label = lv.height ? `${lv.height}p${lv.height>=1080?' ✦':''}` : `${(lv.bitrate/1e6).toFixed(1)} Mbps`;
        const b = el('button', {class:'qbtn', 'data-lvl':lv.i, onclick: e=>selectQ(e,lv.i,b)});
        b.innerHTML = `<span>${label}</span><span class="qbtn-meta">${formatBitrate(lv.bitrate)}</span>`;
        if (qualityManual && lv.i === qualityManualLevel) b.classList.add('active');
        qmenu.appendChild(b);
      });
    }

    function selectQ(e, level, btn) {
      e.stopPropagation();
      if (hls) {
        if (level === -1) {
          qualityManual = false;
          qualityManualLevel = -1;
          const selected = applyPreferredQuality(hls.levels || []);
          buildQMenu(hls.levels || [], selected);
        } else {
          qualityManual = true;
          qualityManualLevel = level;
          hls.autoLevelCapping = -1;
          hls.currentLevel = level;
          hls.loadLevel = level;
          buildQMenu(hls.levels || [], level);
        }
      }
      qmenu.querySelectorAll('.qbtn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      qOpen = false;
      qmenu.classList.remove('open');
    }

    // Load source ONCE the DOM is securely ready
    function initPlayer() {
      if (playType === 'm3u8' && playUrl) {
        vid.style.display = 'block'; vid.style.opacity = '1'; iframeWrap.style.display = 'none';

        const useHls = async () => {
          try {
            if (typeof Hls === 'undefined') {
              await loadScriptOnce('https://cdn.jsdelivr.net/npm/hls.js@1.5.8/dist/hls.min.js');
            }

            if (typeof Hls !== 'undefined' && Hls.isSupported()) {
              hls = new Hls(createHlsConfig());
              liveHls = hls;
              hls.loadSource(playUrl);
              hls.attachMedia(vid);
              hls.on(Hls.Events.MANIFEST_PARSED, (_, d) => {
                const selected = applyPreferredQuality(d.levels || []);
                buildQMenu(d.levels, selected);
                const lv = (selected >= 0 && d.levels && d.levels[selected]) ? d.levels[selected] : (d.levels && d.levels[0]) || {};
                updatePlayerStats({
                  resolution: lv.height ? `${lv.height}p` : 'Auto',
                  bitrateLabel: formatBitrate(lv.bitrate),
                  health: 'ok'
                });
                seekToSaved();
                vid.play().catch(()=>{});
              });

              hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
                if (!hls || !hls.levels || !hls.levels.length) return;
                const lv = hls.levels[data.level] || {};
                const resolution = lv.height ? `${lv.height}p` : 'Auto';
                const bitrateLabel = formatBitrate(lv.bitrate);
                updatePlayerStats({ resolution, bitrateLabel, health: 'ok' });
                buildQMenu(hls.levels || [], data.level);
              });

              hls.on(Hls.Events.FRAG_LOADED, () => {
                if (!hls || !hls.levels || !hls.levels.length) return;
                const idx = hls.currentLevel >= 0 ? hls.currentLevel : hls.nextAutoLevel;
                const lv = hls.levels[idx] || {};
                const resolution = lv.height ? `${lv.height}p` : 'Auto';
                const bitrateLabel = formatBitrate(lv.bitrate);
                const health = (lv.height || 0) >= 720 ? 'ok' : ((lv.height || 0) >= 480 ? 'warn' : 'bad');
                updatePlayerStats({ resolution, bitrateLabel, health });
              });

              hls.on(Hls.Events.FRAG_LOAD_EMERGENCY_ABORTED, () => {
                if (!hls || !hls.levels || !hls.levels.length) return;
                if (qualityAutoFallback && !qualityManual) {
                  autoFallbackCooldownUntil = Date.now() + 35000;
                  lastAutoDowngradeAt = Date.now();
                }
                const cap = getProfileCapIndex(hls.levels);
                hls.autoLevelCapping = cap;
                hls.currentLevel = -1;
                hls.loadLevel = -1;
              });
              hls.on(Hls.Events.ERROR, (_, d) => {
                if (d && d.type === Hls.ErrorTypes.NETWORK_ERROR && qualityAutoFallback && !qualityManual && hls && hls.levels && hls.levels.length) {
                  autoFallbackCooldownUntil = Date.now() + 45000;
                  const cap = getProfileCapIndex(hls.levels);
                  hls.autoLevelCapping = cap;
                  hls.currentLevel = -1;
                  hls.loadLevel = -1;
                }

                if (d && d.type === Hls.ErrorTypes.MEDIA_ERROR && qualityAutoFallback && !qualityManual && hls && hls.levels && hls.levels.length) {
                  const cap = getProfileCapIndex(hls.levels);
                  hls.autoLevelCapping = cap;
                }

                if (d.fatal) {
                  if (d.type === Hls.ErrorTypes.NETWORK_ERROR) {
                    hls.startLoad();
                  } else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) {
                    hls.recoverMediaError();
                  } else {
                    hls.destroy();
                  }
                }
              });
              return;
            }
          } catch (_) {}

          if (vid.canPlayType('application/vnd.apple.mpegurl')) {
            vid.src = playUrl;
            updatePlayerStats({ resolution: 'Auto', bitrateLabel: '-- Mbps', health: 'warn' });
            vid.play().catch(()=>{});
            return;
          }

          pw.innerHTML += '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:1rem;z-index:100">Không thể tải trình phát HLS</div>';
        };

        useHls();
      } else if (playType === 'iframe' && playUrl) {
        vid.style.display = 'none'; iframeWrap.style.display = 'block';
        iframeWrap.innerHTML = `<iframe src="${playUrl}" allowfullscreen allow="autoplay" style="position:absolute;inset:0;width:100%;height:100%;border:none"></iframe>`;
        ctrlEl.style.display = 'none';
      } else {
        pw.innerHTML += '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:1rem;z-index:100">Không tìm thấy nguồn phim</div>';
      }
    }
    
    // Attach Player initialization as a safe callback for setMain
    setMain(page, () => {
      initPlayer();
    });

    // cleanup on navigate away
    qs('#watchbackbtn', page).onclick = () => {
      try {
        if (liveWatchCleanup) {
          liveWatchCleanup();
          liveWatchCleanup = null;
        }
      } catch (_) {}
      liveHls = null;

      if (hls) {
        hls.destroy();
        hls = null;
      }
      try {
        document.removeEventListener('fullscreenchange', onFullscreenChange);
        window.removeEventListener('resize', onFullscreenChange);
        window.removeEventListener('orientationchange', onFullscreenChange);
        page.classList.remove('is-film-fullscreen', 'rotate-fallback');
        if (screen.orientation && typeof screen.orientation.unlock === 'function') screen.orientation.unlock();
      } catch (_) {}

      saveProgress(true);
      // For iframe mode we can't track progress; still update "last viewed"
      try {
        if (playType !== 'm3u8') {
          saveHistoryEntry({
            movieSlug,
            epSlug,
            srvName,
            movieName: m && m.name ? m.name : '',
            epName: (activeEp && activeEp.name) ? activeEp.name : epSlug,
            poster: bgPosterUrl,
            progressSeconds: 0
          });
        }
      } catch (_) {}
      vid.pause();
      vid.removeAttribute('src');
      vid.load();
      page.classList.add('page-exit');
      setTimeout(() => {
        page.remove();
        document.body.classList.remove('watch-mode');
        App.goDetail(movieSlug);
      }, 300);
    };
    } catch (_) {
      toast('Đã xảy ra lỗi khi tải phim! Vui lòng F5 trang.');
    }
  }

  // Init
  function init() {
    scrollBehavior();
    debouncedResizeLayout();
    prewarmRecentSearchCache(4);

    const p = loadPrefs();
    if (typeof p.lastTab === 'string') setActiveBottomTab(p.lastTab);

    const st = loadSessionState();
    if (st && st.lastTab === 'search') {
      openSearchPage();
      if (st.lastKeyword && $('q')) $('q').value = st.lastKeyword;
      if (st.lastKeyword && $('q-mob')) $('q-mob').value = st.lastKeyword;
      if (st.lastKeyword) {
        setTimeout(() => {
          search({ preventDefault: () => {}, target: { querySelector: () => ({ value: st.lastKeyword }) } });
          if (Number(st.scrollY || 0) > 0) setTimeout(() => window.scrollTo(0, Number(st.scrollY || 0)), 220);
        }, 60);
      }
      return;
    }

    goHome();
    if (Number(st.scrollY || 0) > 0) setTimeout(() => window.scrollTo(0, Number(st.scrollY || 0)), 220);
  }

  return { goHome, goDetail, goWatch, search, browseCategory, setSource, toggleDrawer, openSearchPage, openHistoryPage, openFavoritesPage, bindSearchAutocomplete, init };
})();

window.addEventListener('DOMContentLoaded', () => {
  App.init();

  window.addEventListener('scroll', () => {
    try {
      const active = document.querySelector('.mb-nav-item.active');
      const tab = active && active.dataset ? active.dataset.tab : 'home';
      const qInput = document.querySelector('#q');
      const kw = qInput ? String(qInput.value || '').trim() : '';
      localStorage.setItem('devthinh:sessionState', JSON.stringify({
        lastTab: tab,
        lastKeyword: kw,
        scrollY: Math.max(0, Math.round(window.scrollY || 0)),
        ts: Date.now()
      }));
    } catch (_) {}
  }, { passive: true });

  const bindSearchFx = (selector) => {
    const form = document.querySelector(selector);
    if (!form) return;
    const input = form.querySelector('input');
    if (!input) return;

    const pulse = () => {
      form.classList.remove('focus-glow');
      // force reflow for repeat animation
      void form.offsetWidth;
      form.classList.add('focus-glow');
      setTimeout(() => form.classList.remove('focus-glow'), 700);
    };

    input.addEventListener('focus', pulse);
    form.addEventListener('pointerdown', () => {
      form.classList.add('press');
      setTimeout(() => form.classList.remove('press'), 120);
    }, { passive: true });
  };

  bindSearchFx('.search-box');
  bindSearchFx('.mob-search');
  App.bindSearchAutocomplete('.search-box', '#q');
  App.bindSearchAutocomplete('.mob-search', '#q-mob');
});