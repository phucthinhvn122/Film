/**
 * Router module for handling navigation and page transitions
 * Manages page routing without breaking the current flow
 */

import { setMain } from './dom.js';
import { SessionStorage } from './storage.js';
import { UI_CONFIG } from './config.js';

/**
 * Page types and their corresponding handlers
 */
export const PAGES = {
  HOME: 'home',
  DETAIL: 'detail',
  WATCH: 'watch',
  SEARCH: 'search',
  HISTORY: 'history',
  FAVORITES: 'favorites'
};

/**
 * Router state
 */
class RouterState {
  constructor() {
    this.currentPage = PAGES.HOME;
    this.previousPage = null;
    this.isTransitioning = false;
    this.pageHistory = [];
    this.scrollPositions = new Map();
  }

  setCurrentPage(page) {
    this.previousPage = this.currentPage;
    this.currentPage = page;
    this.pageHistory.push({
      page,
      timestamp: Date.now(),
      scrollY: window.scrollY || 0
    });
    
    // Keep history limited to last 10 pages
    if (this.pageHistory.length > 10) {
      this.pageHistory = this.pageHistory.slice(-10);
    }
  }

  setTransitioning(transitioning) {
    this.isTransitioning = transitioning;
  }

  saveScrollPosition(page, scrollY) {
    this.scrollPositions.set(page, scrollY);
  }

  getScrollPosition(page) {
    return this.scrollPositions.get(page) || 0;
  }
}

export const routerState = new RouterState();

/**
 * Base page class for common page functionality
 */
export class BasePage {
  constructor(name) {
    this.name = name;
    this.mounted = false;
    this.cleanup = null;
  }

  async mount(params = {}) {
    if (this.mounted) {
      console.warn(`Page ${this.name} is already mounted`);
      return;
    }

    try {
      routerState.setTransitioning(true);
      
      // Save current scroll position
      if (routerState.previousPage) {
        routerState.saveScrollPosition(routerState.previousPage, window.scrollY || 0);
      }

      // Create page content
      const content = await this.render(params);
      if (!content) {
        throw new Error(`Page ${this.name} returned empty content`);
      }
      if (typeof Node !== 'undefined' && !(content instanceof Node)) {
        throw new Error(`Page ${this.name} returned invalid content`);
      }

      // Set main content
      setMain(content, () => {
        this.onMounted(params);
      });

      this.mounted = true;
      routerState.setCurrentPage(this.name);
      
      // Restore scroll position if available
      const savedScroll = routerState.getScrollPosition(this.name);
      if (savedScroll > 0) {
        setTimeout(() => window.scrollTo(0, savedScroll), UI_CONFIG.PAGE_TRANSITION);
      }

    } catch (error) {
      console.error(`Error mounting page ${this.name}:`, error);
      this.handleError(error);
    } finally {
      routerState.setTransitioning(false);
    }
  }

  async unmount() {
    if (!this.mounted) return;

    try {
      // Save scroll position
      routerState.saveScrollPosition(this.name, window.scrollY || 0);

      // Run cleanup
      if (this.cleanup) {
        this.cleanup();
        this.cleanup = null;
      }

      this.mounted = false;
    } catch (error) {
      console.error(`Error unmounting page ${this.name}:`, error);
    }
  }

  async render(params) {
    // Override in subclasses
    throw new Error('render method must be implemented');
  }

  onMounted(params) {
    // Override in subclasses for post-mount setup
  }

  handleError(error) {
    // Default error handling
    console.error(`Page error:`, error);
    
    const errorContent = document.createElement('div');
    errorContent.className = 'error-page';
    errorContent.innerHTML = `
      <div class="error-content">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <h2>Da xay ra loi</h2>
        <p>${error.message || 'Khong the tai trang nay'}</p>
        <button onclick="location.reload()" class="retry-btn">Thu lai</button>
      </div>
    `;
    
    setMain(errorContent);
  }

  setLoading(loading) {
    // Override in subclasses for loading state management
  }

  setTitle(title) {
    document.title = `${title} - Netflix`;
  }

  updateActiveTab(tabName) {
    // Update mobile bottom navigation
    qsa('.mb-nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.tab === tabName);
    });

    // Update desktop navigation if exists
    qsa('.nav-links a').forEach(item => {
      item.classList.toggle('active', item.id === `nav-${tabName}`);
    });
  }
}

/**
 * Page registry
 */
class PageRegistry {
  constructor() {
    this.pages = new Map();
  }

  register(name, pageClass) {
    this.pages.set(name, pageClass);
  }

  create(name) {
    const PageClass = this.pages.get(name);
    if (!PageClass) {
      throw new Error(`Page ${name} not found in registry`);
    }
    return new PageClass();
  }

  get(name) {
    return this.pages.get(name);
  }

  has(name) {
    return this.pages.has(name);
  }
}

export const pageRegistry = new PageRegistry();

/**
 * Router class
 */
export class Router {
  constructor() {
    this.currentPage = null;
    this.defaultPage = PAGES.HOME;
    this.notFoundPage = null;
  }

  async navigate(pageName, params = {}, replace = false) {
    if (routerState.isTransitioning) {
      console.warn('Router is transitioning, ignoring navigation');
      return;
    }

    try {
      // Unmount current page
      if (this.currentPage) {
        await this.currentPage.unmount();
        this.currentPage = null;
      }

      // Create and mount new page
      const page = pageRegistry.create(pageName);
      this.currentPage = page;
      await page.mount(params);

      // Update URL if needed
      this.updateURL(pageName, params, replace);

      // Save session state
      SessionStorage.save({
        lastPage: pageName,
        lastParams: params,
        scrollY: window.scrollY || 0
      });

    } catch (error) {
      console.error('Navigation error:', error);
      
      // Try to navigate to not found page or default page
      if (this.notFoundPage && pageName !== this.notFoundPage) {
        await this.navigate(this.notFoundPage, { error: error.message }, replace);
      } else if (this.defaultPage && pageName !== this.defaultPage) {
        await this.navigate(this.defaultPage, {}, replace);
      } else {
        // Last resort - show error
        this.showFatalError(error);
      }
    }
  }

  updateURL(pageName, params, replace = false) {
    const url = this.buildURL(pageName, params);
    
    if (replace) {
      history.replaceState({ page: pageName, params }, '', url);
    } else {
      history.pushState({ page: pageName, params }, '', url);
    }
  }

  buildURL(pageName, params) {
    const baseURL = `${window.location.origin}/`;
    
    switch (pageName) {
      case PAGES.HOME:
        return baseURL;
      
      case PAGES.DETAIL:
        return `${baseURL}detail/${encodeURIComponent(params.slug || '')}`;
      
      case PAGES.WATCH:
        return `${baseURL}watch/${encodeURIComponent(params.slug || '')}/${encodeURIComponent(params.epSlug || '')}`;
      
      case PAGES.SEARCH:
        const query = params.q ? `?q=${encodeURIComponent(params.q)}` : '';
        return `${baseURL}search${query}`;
      
      case PAGES.HISTORY:
        return `${baseURL}history`;
      
      case PAGES.FAVORITES:
        return `${baseURL}favorites`;
      
      default:
        return baseURL;
    }
  }

  parseURL() {
    const path = window.location.pathname;
    const search = window.location.search;
    const params = new URLSearchParams(search);

    // Home page
    if (path === '/' || path === '/index.html') {
      return { page: PAGES.HOME, params: {} };
    }

    // Detail page
    const detailMatch = path.match(/^\/detail\/(.+)$/);
    if (detailMatch) {
      return { page: PAGES.DETAIL, params: { slug: decodeURIComponent(detailMatch[1]) } };
    }

    // Watch page
    const watchMatch = path.match(/^\/watch\/(.+)\/(.+)$/);
    if (watchMatch) {
      return { 
        page: PAGES.WATCH, 
        params: { 
          slug: decodeURIComponent(watchMatch[1]),
          epSlug: decodeURIComponent(watchMatch[2])
        } 
      };
    }

    // Search page
    if (path === '/search') {
      return { 
        page: PAGES.SEARCH, 
        params: { q: params.get('q') || '' }
      };
    }

    // History page
    if (path === '/history') {
      return { page: PAGES.HISTORY, params: {} };
    }

    // Favorites page
    if (path === '/favorites') {
      return { page: PAGES.FAVORITES, params: {} };
    }

    // Default to home
    return { page: PAGES.HOME, params: {} };
  }

  async init() {
    // Handle browser back/forward
    window.addEventListener('popstate', (e) => {
      const state = e.state || { page: PAGES.HOME, params: {} };
      this.navigate(state.page, state.params, true);
    });

    // Parse current URL and navigate
    const { page, params } = this.parseURL();
    await this.navigate(page, params, true);
  }

  setDefaultPage(pageName) {
    this.defaultPage = pageName;
  }

  setNotFoundPage(pageName) {
    this.notFoundPage = pageName;
  }

  showFatalError(error) {
    document.body.innerHTML = `
      <div class="fatal-error" style="
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        flex-direction: column;
        text-align: center;
        padding: 20px;
        font-family: system-ui, -apple-system, sans-serif;
      ">
        <i class="fa-solid fa-triangle-exclamation" style="font-size: 4rem; color: #ff4444; margin-bottom: 1rem;"></i>
        <h1 style="margin: 0 0 1rem 0; color: #333;">Loi nghiem trong</h1>
        <p style="margin: 0 0 2rem 0; color: #666; max-width: 400px;">
          ${error.message || 'Khong the khoi tao ung dung. Vui long tai lai trang.'}
        </p>
        <button onclick="location.reload()" style="
          padding: 12px 24px;
          background: #007bff;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 16px;
        ">Tai lai trang</button>
      </div>
    `;
  }

  getCurrentPage() {
    return this.currentPage;
  }

  getCurrentPageName() {
    return routerState.currentPage;
  }

  canNavigate() {
    return !routerState.isTransitioning;
  }
}

export const router = new Router();

/**
 * Navigation helpers
 */
export const NavigationHelpers = {
  async goHome() {
    if (!router.canNavigate()) return;
    await router.navigate(PAGES.HOME);
  },

  async goDetail(slug) {
    if (!router.canNavigate() || !slug) return;
    await router.navigate(PAGES.DETAIL, { slug });
  },

  async goWatch(slug, epSlug) {
    if (!router.canNavigate() || !slug || !epSlug) return;
    await router.navigate(PAGES.WATCH, { slug, epSlug });
  },

  async goSearch(query = '') {
    if (!router.canNavigate()) return;
    await router.navigate(PAGES.SEARCH, { q: query });
  },

  async goHistory() {
    if (!router.canNavigate()) return;
    await router.navigate(PAGES.HISTORY);
  },

  async goFavorites() {
    if (!router.canNavigate()) return;
    await router.navigate(PAGES.FAVORITES);
  },

  async back() {
    if (!router.canNavigate()) return;
    window.history.back();
  },

  async reload() {
    if (!router.canNavigate()) return;
    const currentPage = router.getCurrentPageName();
    const state = history.state || { page: currentPage, params: {} };
    await router.navigate(state.page, state.params, true);
  }
};

// Import qsa from dom.js for internal use
const qsa = (sel, el = document) => Array.from(el.querySelectorAll(sel));

export default {
  PAGES,
  routerState,
  BasePage,
  pageRegistry,
  router,
  NavigationHelpers
};




