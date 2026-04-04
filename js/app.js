/**
 * Main application entry point
 * Initializes all modules and handles app startup
 */

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

/**
 * Main application class
 */
class App {
  constructor() {
    this.isInitialized = false;
    this.cleanupTasks = [];
  }

  async init() {
    if (this.isInitialized) {
      console.warn('App already initialized');
      return;
    }

    try {
      console.log(`🎬 Initializing ${BRAND.fullName}...`);

      // 1. Initialize storage and migrate if needed
      await this.initStorage();

      // 2. Initialize cache system
      this.initCache();

      // 3. Register pages
      this.registerPages();

      // 4. Initialize UI components
      this.initUIComponents();

      // 5. Initialize router
      await this.initRouter();

      // 6. Setup global error handling
      this.setupErrorHandling();

      // 7. Setup performance monitoring
      this.setupPerformanceMonitoring();

      this.isInitialized = true;
      console.log(`✅ ${BRAND.fullName} initialized successfully`);

    } catch (error) {
      console.error('❌ App initialization failed:', error);
      this.handleInitError(error);
    }
  }

  async initStorage() {
    try {
      // Storage migration (if needed)
      StorageUtils.migrate();
      
      // Clean up old/expired data
      this.cleanupStorage();
      
      console.log('✅ Storage initialized');
    } catch (error) {
      console.error('❌ Storage initialization failed:', error);
      throw error;
    }
  }

  initCache() {
    try {
      // Initialize cache cleanup interval
      initCacheCleanup();
      
      // Clear old cache if needed
      this.cleanupCache();
      
      console.log('✅ Cache initialized');
    } catch (error) {
      console.error('❌ Cache initialization failed:', error);
      throw error;
    }
  }

  registerPages() {
    try {
      // Register page classes
      pageRegistry.register('home', HomePage);
      pageRegistry.register('search', SearchPage);
      pageRegistry.register('detail', DetailPage);
      pageRegistry.register('watch', WatchPage);
      pageRegistry.register('history', HistoryPage);
      pageRegistry.register('favorites', FavoritesPage);
      
      // Set default and not found pages
      router.setDefaultPage('home');
      
      console.log('✅ Pages registered');
    } catch (error) {
      console.error('❌ Page registration failed:', error);
      throw error;
    }
  }

  initUIComponents() {
    try {
      // Initialize all UI components
      initUI({
        goHome: () => this.goHome(),
        goSearch: (query = '') => this.goSearch(query),
        goHistory: () => this.goHistory(),
        goFavorites: () => this.goFavorites()
      });
      
      // Setup global UI event listeners
      this.setupGlobalUIEvents();
      
      console.log('✅ UI components initialized');
    } catch (error) {
      console.error('❌ UI initialization failed:', error);
      throw error;
    }
  }

  async initRouter() {
    try {
      // Initialize router and handle initial navigation
      await router.init();
      
      console.log('✅ Router initialized');
    } catch (error) {
      console.error('❌ Router initialization failed:', error);
      throw error;
    }
  }

  setupErrorHandling() {
    // Global error handler
    window.addEventListener('error', (event) => {
      console.error('Global error:', event.error);
      this.reportError(event.error);
    });

    // Unhandled promise rejection handler
    window.addEventListener('unhandledrejection', (event) => {
      console.error('Unhandled promise rejection:', event.reason);
      this.reportError(event.reason);
      event.preventDefault();
    });

    console.log('✅ Error handling setup');
  }

  setupPerformanceMonitoring() {
    // Monitor page load performance
    if ('performance' in window) {
      window.addEventListener('load', () => {
        setTimeout(() => {
          const perfData = performance.getEntriesByType('navigation')[0];
          if (perfData) {
            const loadTime = perfData.loadEventEnd - perfData.loadEventStart;
            console.log(`📊 Page load time: ${loadTime}ms`);
            
            // Report slow loads
            if (loadTime > 3000) {
              console.warn('⚠️ Slow page load detected');
            }
          }
        }, 0);
      });
    }

    console.log('✅ Performance monitoring setup');
  }

  setupGlobalUIEvents() {
    // Handle visibility change (pause/resume)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.pauseBackgroundTasks();
      } else {
        this.resumeBackgroundTasks();
      }
    });

    // Handle before unload
    window.addEventListener('beforeunload', (e) => {
      // Cancel ongoing requests
      requestManager.cancelAll();
      
      // Save current state
      this.saveAppState();
    });

    // Handle online/offline
    window.addEventListener('online', () => {
      console.log('🌐 Network connection restored');
      this.handleNetworkChange(true);
    });

    window.addEventListener('offline', () => {
      console.log('📡 Network connection lost');
      this.handleNetworkChange(false);
    });
  }

  cleanupStorage() {
    try {
      // Clean up old history entries
      // Clean up expired cache entries
      // This is handled by individual storage modules
    } catch (error) {
      console.warn('Storage cleanup warning:', error);
    }
  }

  cleanupCache() {
    try {
      // Clean up expired cache entries
      CacheManager.cleanup();
    } catch (error) {
      console.warn('Cache cleanup warning:', error);
    }
  }

  pauseBackgroundTasks() {
    // Pause background tasks when app is hidden
    console.log('⏸️ Pausing background tasks');
  }

  resumeBackgroundTasks() {
    // Resume background tasks when app is visible
    console.log('▶️ Resuming background tasks');
  }

  handleNetworkChange(isOnline) {
    if (isOnline) {
      // Retry failed requests
      // Refresh data if needed
    } else {
      // Show offline indicator
      // Use cached data
    }
  }

  saveAppState() {
    try {
      // Save current app state to session storage
      const currentPage = router.getCurrentPageName();
      const scrollY = window.scrollY || 0;
      
      sessionStorage.setItem('thinfilm:appState', JSON.stringify({
        currentPage,
        scrollY,
        timestamp: Date.now()
      }));
    } catch (error) {
      console.warn('Failed to save app state:', error);
    }
  }

  reportError(error) {
    // TODO: Send error reports to analytics service
    console.log('🐛 Error reported:', error);
  }

  handleInitError(error) {
    // Show fallback UI
    document.body.innerHTML = `
      <div class="init-error" style="
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        flex-direction: column;
        text-align: center;
        padding: 20px;
        font-family: system-ui, -apple-system, sans-serif;
        background: #0a0a0a;
        color: #fff;
      ">
        <div style="max-width: 400px;">
          <h1 style="margin: 0 0 1rem 0; font-size: 2rem;">
            ${BRAND.name}
          </h1>
          <div style="
            width: 60px;
            height: 60px;
            background: linear-gradient(45deg, #ff4444, #cc0000);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 2rem auto;
            font-size: 1.5rem;
          ">
            ⚠️
          </div>
          <h2 style="margin: 0 0 1rem 0;">Không thể khởi tạo</h2>
          <p style="margin: 0 0 2rem 0; opacity: 0.8; line-height: 1.5;">
            ${error.message || UI_TEXT.ERROR}
          </p>
          <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
            <button onclick="location.reload()" style="
              padding: 12px 24px;
              background: #007bff;
              color: white;
              border: none;
              border-radius: 4px;
              cursor: pointer;
              font-size: 16px;
            ">Thử lại</button>
            <button onclick="window.location.href='/'" style="
              padding: 12px 24px;
              background: transparent;
              color: #007bff;
              border: 1px solid #007bff;
              border-radius: 4px;
              cursor: pointer;
              font-size: 16px;
            ">Về trang chủ</button>
          </div>
        </div>
      </div>
    `;
  }

  async destroy() {
    if (!this.isInitialized) return;

    try {
      console.log('🧹 Cleaning up app...');

      // Cancel all requests
      requestManager.cancelAll();

      // Destroy UI components
      destroyUI();

      // Clear cache
      CacheManager.clearAll();

      // Run cleanup tasks
      this.cleanupTasks.forEach(task => {
        try {
          task();
        } catch (error) {
          console.warn('Cleanup task error:', error);
        }
      });

      this.isInitialized = false;
      console.log('✅ App destroyed');
    } catch (error) {
      console.error('❌ App destruction failed:', error);
    }
  }

  // Public API for external access
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

// Create singleton instance
const app = new App();

// Export for global access
window.App = app;

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.init());
} else {
  app.init();
}

// Export for module usage
export default app;
