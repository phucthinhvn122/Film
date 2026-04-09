import { BRAND, UI_TEXT } from './config.js';
import { CacheManager, initCacheCleanup } from './cache.js';
import { StorageUtils } from './storage.js';
import { router, pageRegistry, NavigationHelpers } from './router.js';
import { HomePage } from './home.js';
import { SearchPage } from './search.js';
import { DetailPage } from './detail.js';
import { WatchPage } from './watch.js';
import { HistoryPage } from './history.js';
import { FavoritesPage } from './favorites.js';
import { initUI, destroyUI } from './ui.js';
import { requestManager } from './api.js';

class App {
  constructor() {
    this.isInitialized = false;
    this.errorHandlingReady = false;
    this.beforeUnloadHandler = () => {
      requestManager.cancelAll();
      this.saveAppState();
    };
  }

  async init() {
    if (this.isInitialized) return;

    try {
      StorageUtils.migrate();
      initCacheCleanup();
      CacheManager.cleanup();
      this.registerPages();
      this.initUIComponents();
      this.setupErrorHandling();
      window.addEventListener('beforeunload', this.beforeUnloadHandler);
      await router.init();
      this.isInitialized = true;
    } catch (error) {
      console.error('App initialization failed:', error);
      this.handleInitError(error);
    }
  }

  registerPages() {
    pageRegistry.register('home', HomePage);
    pageRegistry.register('search', SearchPage);
    pageRegistry.register('detail', DetailPage);
    pageRegistry.register('watch', WatchPage);
    pageRegistry.register('history', HistoryPage);
    pageRegistry.register('favorites', FavoritesPage);
    router.setDefaultPage('home');
  }

  initUIComponents() {
    initUI({
      goHome: () => this.goHome(),
      goSearch: (query = '') => this.goSearch(query),
      goHistory: () => this.goHistory(),
      goFavorites: () => this.goFavorites()
    });
  }

  setupErrorHandling() {
    if (this.errorHandlingReady) return;

    window.addEventListener('error', (event) => {
      console.error('Global error:', event.error || event.message);
    });

    window.addEventListener('unhandledrejection', (event) => {
      console.error('Unhandled promise rejection:', event.reason);
      event.preventDefault();
    });

    this.errorHandlingReady = true;
  }

  saveAppState() {
    try {
      sessionStorage.setItem('thinfilm:appState', JSON.stringify({
        currentPage: router.getCurrentPageName(),
        scrollY: window.scrollY || 0,
        timestamp: Date.now()
      }));
    } catch (_) {
      // ignore
    }
  }

  handleInitError(error) {
    document.body.innerHTML = `
      <div class="init-error" style="
        display:flex;
        align-items:center;
        justify-content:center;
        min-height:100vh;
        padding:20px;
        text-align:center;
        font-family:system-ui,-apple-system,sans-serif;
        background:#0a0a0a;
        color:#fff;
      ">
        <div style="max-width:420px">
          <h1 style="margin:0 0 12px;font-size:2rem">${BRAND.name}</h1>
          <p style="margin:0 0 24px;opacity:.84;line-height:1.6">${error?.message || UI_TEXT.ERROR}</p>
          <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
            <button onclick="location.reload()" style="
              padding:12px 24px;
              background:#e50914;
              color:#fff;
              border:none;
              border-radius:8px;
              cursor:pointer;
            ">Thu lai</button>
            <button onclick="window.location.href='/'" style="
              padding:12px 24px;
              background:transparent;
              color:#fff;
              border:1px solid rgba(255,255,255,.24);
              border-radius:8px;
              cursor:pointer;
            ">Ve trang chu</button>
          </div>
        </div>
      </div>
    `;
  }

  async destroy() {
    if (!this.isInitialized) return;

    requestManager.cancelAll();
    destroyUI();
    CacheManager.clearAll();
    window.removeEventListener('beforeunload', this.beforeUnloadHandler);
    this.isInitialized = false;
  }

  goHome() {
    return NavigationHelpers.goHome();
  }

  goDetail(slug) {
    return NavigationHelpers.goDetail(slug);
  }

  goWatch(slug, epSlug) {
    return NavigationHelpers.goWatch(slug, epSlug);
  }

  goSearch(query) {
    return NavigationHelpers.goSearch(query);
  }

  goHistory() {
    return NavigationHelpers.goHistory();
  }

  goFavorites() {
    return NavigationHelpers.goFavorites();
  }
}

const app = new App();

window.App = app;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.init());
} else {
  app.init();
}

export default app;
