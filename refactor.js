const fs = require('fs');

let code = fs.readFileSync('index.html', 'utf8');

// 1. Replace CFG object
code = code.replace(/const CFG = \{[\s\S]*?\n\};\n/, `const CFG = {
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
};\n`);

// 2. Remove let src = ... and function cfg()
code = code.replace(/let src = 'nguonphim';\n/, '');
code = code.replace(/function cfg\(\) \{ return CFG\[src\]; \}\n/, '');

// 3. Replace all cfg() with CFG
code = code.replace(/cfg\(\)/g, 'CFG');

// 4. Remove fetchJSONWithSourceFallback entirely and replace its usage
code = code.replace(/async function fetchJSONWithSourceFallback[\s\S]*?return \{ data, sourceKey \};\n  \}\n/g, '');
code = code.replace(/const \{ data, sourceKey \} = await fetchJSONWithSourceFallback.*?\n/, 'const data = await fetchJSON(CFG.detail + slug, opts);\n');
code = code.replace(/movieData = \{ movie: data\.movie \|\| data\.item, episodes: data\.episodes \|\| \[\], sourceKey \};\n/g, 'movieData = { movie: data.movie || data.item, episodes: data.episodes || [] };\n');
code = code.replace(/const useCfg = CFG\[sourceKey\] \|\| CFG;\n/g, 'const useCfg = CFG;\n');
code = code.replace(/const c = useCfg;\n/g, 'const c = CFG;\n');

// In getMovieDetailWithFallback:
code = code.replace(/async function getMovieDetailWithFallback\(slug, opts = \{\}\) \{[\s\S]*?const \{ data, sourceKey \} = .*?[^\n]*\n/, `async function getMovieDetailWithFallback(slug, opts = {}) {
    const data = await fetchJSON(CFG.detail + slug, opts);
`);
code = code.replace(/return \{ data, sourceKey \};\n/g, 'return { data };\n');

// In prewarmRecentSearchCache definition:
// `const key = \`\${src}::\${String(kw || '').trim().toLowerCase()}\`;`
code = code.replace(/\$\{src\}::/g, 'search::');

// Also in searchResultCache logic:
// `const cacheKey = \`\${src}::\${kw.toLowerCase()}\`;`
code = code.replace(/const cacheKey = `\$\{src\}::\$\{kw.toLowerCase\(\)\}`;/g, 'const cacheKey = `search::${kw.toLowerCase()}`;');

// Replace CFG[movieData.sourceKey] -> CFG
code = code.replace(/const c = CFG\[movieData\.sourceKey\] \|\| CFG;\n/g, 'const c = CFG;\n');

// Drop unused function setSource
code = code.replace(/function setSource\(val\) \{[\s\S]*?goHome\(\);\n  \}\n/, '');
code = code.replace(/setSource,/g, '');

// Clean up console errors and alert by extracting toast
let toastFuncStr = `  function toast(text) {
    const t = el('div', {
      style:'position:fixed;top:86px;left:50%;transform:translateX(-50%);z-index:9999;background:rgba(18,18,18,.9);border:1px solid rgba(255,255,255,.12);-webkit-backdrop-filter:blur(16px) saturate(180%);backdrop-filter:blur(16px) saturate(180%);color:#fff;padding:10px 14px;border-radius:14px;font-weight:700;box-shadow:0 18px 40px rgba(0,0,0,.55);opacity:0;animation:toastIn .22s ease forwards'
    }, text);
    document.body.appendChild(t);
    setTimeout(()=>{ try{t.remove();}catch(_){ if(t.parentNode) t.parentNode.removeChild(t);} }, 2500);
  }\n`;

code = code.replace(/const App = \(\(\) => \{\n/, `const App = (() => {\n` + toastFuncStr);

// In goWatch, remove its local toast function
code = code.replace(/      function toast\(text\) \{[\s\S]*?\}, 1700\);\n      \}\n/, '');

// Replace alerts with toasts
code = code.replace(/alert\('Không thể mở phim từ lịch sử. Vui lòng thử lại.'\);/, "toast('Không thể mở phim từ lịch sử. Vui lòng thử lại.');");
code = code.replace(/alert\('Đã xảy ra lỗi khi tải phim! Vui lòng F5 trang.'\);/, "toast('Đã xảy ra lỗi khi tải phim! Vui lòng F5 trang.');");

// Fix HTML Preload duplicates:
// line 22/23
code = code.replace(/<link href="https:\/\/fonts.googleapis.com\/css2\?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">\n<link rel="preload" href="https:\/\/cdnjs.cloudflare.com\/ajax\/libs\/font-awesome\/6.5.0\/css\/all.min.css" as="style" crossorigin onload="this.onload=null;this.rel='stylesheet'">\n<noscript><link rel="stylesheet" href="https:\/\/cdnjs.cloudflare.com\/ajax\/libs\/font-awesome\/6.5.0\/css\/all.min.css"><\/noscript>/, `<link rel="preload" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css" as="style" crossorigin onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css"></noscript>
<link rel="preload" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" as="style" crossorigin onload="this.onload=null;this.rel='stylesheet'">
<noscript><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet"></noscript>`);

// Fix CSS duplication (mobile-bottom-nav is duplicated media Query at 641 vs 631)
code = code.replace(/@media\(max-width:900px\)\{\n  \.watch-page \.controls\{padding:10px 10px 12px\}\n/g, `@media(max-width:900px){\n  .watch-page .controls{padding:10px 10px 12px}\n`);


fs.writeFileSync('index.html', code, 'utf8');
console.log('Cleanup script executed');
