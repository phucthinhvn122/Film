const THEMES = {
  DARK: 'dark',
  LIGHT: 'light',
  AUTO: 'auto'
};

const STORAGE_KEY = 'thinfilm:theme';

class ThemeManager {
  constructor() {
    this.currentTheme = THEMES.DARK;
    this.systemPreference = null;
    this.mediaQuery = null;
    this.listeners = new Set();
  }

  init() {
    this.setupMediaQuery();
    const saved = this.loadSavedTheme();
    this.applyTheme(saved || THEMES.DARK);
  }

  setupMediaQuery() {
    if (!window.matchMedia) return;

    this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    this.systemPreference = this.mediaQuery.matches ? THEMES.DARK : THEMES.LIGHT;

    this._mediaChangeHandler = (e) => {
      this.systemPreference = e.matches ? THEMES.DARK : THEMES.LIGHT;
      if (this.currentTheme === THEMES.AUTO) {
        this.applyTheme(THEMES.AUTO);
      }
    };
    this.mediaQuery.addEventListener('change', this._mediaChangeHandler);
  }

  loadSavedTheme() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved && Object.values(THEMES).includes(saved) ? saved : null;
    } catch (_) {
      return null;
    }
  }

  saveTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (_) {
    }
  }

  applyTheme(theme) {
    const resolvedTheme = theme === THEMES.AUTO ? this.systemPreference : theme;
    const effectiveTheme = resolvedTheme || THEMES.DARK;
    
    document.documentElement.setAttribute('data-theme', effectiveTheme);
    document.body.classList.remove('theme-dark', 'theme-light');
    document.body.classList.add(`theme-${effectiveTheme}`);
    
    this.currentTheme = theme;
    this.saveTheme(theme);
    this.notifyListeners(effectiveTheme);
    
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', effectiveTheme === THEMES.LIGHT ? '#ffffff' : '#0f1419');
    }
  }

  setTheme(theme) {
    if (!Object.values(THEMES).includes(theme)) {
      console.warn(`Invalid theme: ${theme}`);
      return;
    }
    
    const root = document.documentElement;
    root.style.transition = 'background-color 0.3s ease, color 0.3s ease';
    
    this.applyTheme(theme);
    
    setTimeout(() => {
      root.style.transition = '';
    }, 300);
  }

  getTheme() {
    return this.currentTheme;
  }

  getEffectiveTheme() {
    return this.currentTheme === THEMES.AUTO ? this.systemPreference : this.currentTheme;
  }

  toggle() {
    const current = this.getEffectiveTheme();
    const next = current === THEMES.DARK ? THEMES.LIGHT : THEMES.DARK;
    this.setTheme(next);
    return next;
  }

  cycleTheme() {
    const order = [THEMES.DARK, THEMES.LIGHT, THEMES.AUTO];
    const currentIndex = order.indexOf(this.currentTheme);
    const nextIndex = (currentIndex + 1) % order.length;
    this.setTheme(order[nextIndex]);
    return order[nextIndex];
  }

  onChange(callback) {
    if (typeof callback === 'function') {
      this.listeners.add(callback);
    }
    return () => this.listeners.delete(callback);
  }

  notifyListeners(effectiveTheme) {
    this.listeners.forEach((callback) => {
      try {
        callback(effectiveTheme, this.currentTheme);
      } catch (error) {
        console.error('Theme listener error:', error);
      }
    });
  }

  destroy() {
    if (this.mediaQuery && this._mediaChangeHandler && this.mediaQuery.removeEventListener) {
      this.mediaQuery.removeEventListener('change', this._mediaChangeHandler);
    }
    this._mediaChangeHandler = null;
    this.listeners.clear();
  }
}

export const themeManager = new ThemeManager();

export function initTheme() {
  themeManager.init();
}

export function getTheme() {
  return themeManager.getTheme();
}

export function setTheme(theme) {
  themeManager.setTheme(theme);
}

export function toggleTheme() {
  return themeManager.toggle();
}

export function cycleTheme() {
  return themeManager.cycleTheme();
}

export function onThemeChange(callback) {
  return themeManager.onChange(callback);
}

export { THEMES };
