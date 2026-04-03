import { BRAND, ROUTES, UI_TEXT } from './config.js';
import { startCacheCleanup, stopCacheCleanup } from './cache.js';
import { router } from './router.js';
import { setMainContent, updateDocumentTitle } from './dom.js';
import { destroyUI, initUI, setActiveNavigation, showToast, syncSearchInputValue } from './ui.js';
import { requestManager } from './api.js';
import { renderHomePage } from './home.js';
import { renderDetailPage } from './detail.js';
import { renderWatchPage } from './player.js';
import { renderSearchPage } from './search.js';
import { renderHistoryPage } from './history.js';
import { renderFavoritesPage } from './favorites.js';
import { SessionStorage } from './storage.js';

class ThinFilmApp {
  constructor() {
    this.currentCleanup = null;
    this.isInitialized = false;
    this.renderToken = 0;
  }

  async init() {
    if (this.isInitialized) return;

    startCacheCleanup();

    const navigate = (name, params = {}, options = {}) => {
      router.navigate(name, params, options);
    };

    initUI({
      goHome: () => navigate(ROUTES.HOME),
      goSearch: (q = '') => navigate(ROUTES.SEARCH, { q }),
      goHistory: () => navigate(ROUTES.HISTORY),
      goFavorites: () => navigate(ROUTES.FAVORITES)
    });

    router.register(ROUTES.HOME, async (params, route) => this.renderRoute(renderHomePage, params, route));
    router.register(ROUTES.DETAIL, async (params, route) => this.renderRoute(renderDetailPage, params, route));
    router.register(ROUTES.WATCH, async (params, route) => this.renderRoute(renderWatchPage, params, route));
    router.register(ROUTES.SEARCH, async (params, route) => this.renderRoute(renderSearchPage, params, route));
    router.register(ROUTES.HISTORY, async (params, route) => this.renderRoute(renderHistoryPage, params, route));
    router.register(ROUTES.FAVORITES, async (params, route) => this.renderRoute(renderFavoritesPage, params, route));

    router.setChangeListener((route) => {
      setActiveNavigation(route.name);
      if (route.name !== ROUTES.SEARCH) syncSearchInputValue('');
      if (route.name === ROUTES.SEARCH) syncSearchInputValue(route.params?.q || '');
      SessionStorage.saveRoute(route);
    });

    this.bindGlobalErrorHandlers();
    router.start();
    this.isInitialized = true;
  }

  async renderRoute(renderer, params, route) {
    const token = ++this.renderToken;
    if (typeof this.currentCleanup === 'function') {
      try {
        this.currentCleanup();
      } catch (_) {
        // ignore
      }
      this.currentCleanup = null;
    }

    requestManager.cancelAll();

    const context = {
      navigate: (name, nextParams = {}, options = {}) => router.navigate(name, nextParams, options),
      toast: showToast,
      syncSearchInput: syncSearchInputValue,
      route
    };

    try {
      const page = await renderer(context, params || {});
      if (!page?.node) throw new Error('PAGE_RENDER_FAILED');
      if (token !== this.renderToken) return;

      setMainContent(page.node);
      updateDocumentTitle(page.title || BRAND.name, BRAND.name);
      this.currentCleanup = page.cleanup || null;
    } catch (error) {
      console.error('Route render failed:', error);
      if (token !== this.renderToken) return;
      const fallback = document.createElement('div');
      fallback.className = 'search-page';
      fallback.innerHTML = `
        <div class="empty">
          <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
          <p>${UI_TEXT.networkError}</p>
        </div>
      `;
      setMainContent(fallback);
      updateDocumentTitle(BRAND.name, BRAND.name);
      this.currentCleanup = null;
    }
  }

  bindGlobalErrorHandlers() {
    window.addEventListener('unhandledrejection', (event) => {
      console.error('Unhandled rejection:', event.reason);
      event.preventDefault();
    });

    window.addEventListener('beforeunload', () => {
      requestManager.cancelAll();
      if (typeof this.currentCleanup === 'function') {
        try {
          this.currentCleanup();
        } catch (_) {
          // ignore
        }
      }
    });
  }

  destroy() {
    if (!this.isInitialized) return;
    requestManager.cancelAll();
    if (typeof this.currentCleanup === 'function') this.currentCleanup();
    destroyUI();
    stopCacheCleanup();
    router.destroy();
    this.currentCleanup = null;
    this.isInitialized = false;
  }

  goHome() {
    router.navigate(ROUTES.HOME);
  }

  goDetail(slug) {
    router.navigate(ROUTES.DETAIL, { slug });
  }

  goWatch(slug, ep, server = '') {
    router.navigate(ROUTES.WATCH, { slug, ep, server });
  }

  goSearch(q = '') {
    router.navigate(ROUTES.SEARCH, { q });
  }

  goHistory() {
    router.navigate(ROUTES.HISTORY);
  }

  goFavorites() {
    router.navigate(ROUTES.FAVORITES);
  }
}

const app = new ThinFilmApp();
window.App = app;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.init());
} else {
  app.init();
}

export default app;

