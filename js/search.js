/**
 * Search page module
 * Handles search functionality with debouncing, caching, and proper state management
 */

import { UI_CONFIG, UI_TEXT } from './config.js';
import { movieSourceClient, DataNormalizer, requestManager } from './api.js';
import { el, loader, buildSearchSkeleton, renderCardsProgressively, toast, highlightText } from './dom.js';
import { SearchStorage } from './storage.js';

/**
 * Search page class
 */
export class SearchPage {
  constructor() {
    this.abortController = null;
    this.debounceTimer = null;
    this.currentQuery = '';
    this.searchState = 'idle';
    this.searchResults = [];
  }

  async render(params = {}) {
    const query = params.q || '';
    this.currentQuery = query;

    const wrap = el('div', { class: 'search-page' });
    
    // Search hero section
    const heroEl = this.createSearchHero(query);
    wrap.appendChild(heroEl);

    // Content area
    const contentEl = el('div', { class: 'search-content' });
    wrap.appendChild(contentEl);

    // Show initial state
    if (query) {
      await this.performSearch(query, contentEl);
    } else {
      this.showInitialState(contentEl);
    }

    return wrap;
  }

  createSearchHero(query) {
    const heroEl = el('div', { class: 'search-hero' });
    
    const heroBody = el('div', { class: 'hero-body' });
    
    const title = el('h2', { class: 'search-title' });
    title.textContent = query ? `Kết quả tìm kiếm: "${query}"` : 'Tìm kiếm phim';
    heroBody.appendChild(title);

    if (query) {
      const subtitle = el('p', { class: 'search-subtitle' });
      subtitle.textContent = 'Đang tìm kiếm...';
      heroBody.appendChild(subtitle);
    }

    heroEl.appendChild(heroBody);
    return heroEl;
  }

  showInitialState(contentEl) {
    this.searchState = 'idle';
    
    const initialState = el('div', { class: 'search-initial' });
    
    // Search form
    const form = el('form', { class: 'search-form' });
    form.onsubmit = (e) => {
      e.preventDefault();
      const input = form.querySelector('input');
      if (input.value.trim()) {
        this.handleSearch(input.value.trim());
      }
    };

    const input = el('input', {
      type: 'text',
      placeholder: 'Nhập tên phim, diễn viên, hoặc từ khóa...',
      value: this.currentQuery,
      autocomplete: 'off'
    });

    const button = el('button', { type: 'submit' }, 'Tìm kiếm');
    form.appendChild(input);
    form.appendChild(button);
    initialState.appendChild(form);

    // Recent searches
    const recentSection = this.createRecentSearchesSection();
    initialState.appendChild(recentSection);

    // Popular searches
    const popularSection = this.createPopularSearchesSection();
    initialState.appendChild(popularSection);

    contentEl.appendChild(initialState);

    // Focus input
    setTimeout(() => input.focus(), 100);
  }

  createRecentSearchesSection() {
    const recentKeywords = SearchStorage.recent.load();
    
    if (!recentKeywords.length) {
      return el('div');
    }

    const section = el('div', { class: 'search-section' });
    
    const header = el('div', { class: 'search-section-header' });
    header.innerHTML = `
      <h3>Tìm kiếm gần đây</h3>
      <button class="clear-btn" onclick="this.closest('.search-section').remove()">Xóa</button>
    `;
    section.appendChild(header);

    const list = el('div', { class: 'search-keywords' });
    
    recentKeywords.forEach(keyword => {
      const item = el('button', {
        class: 'search-keyword',
        onclick: () => this.handleSearch(keyword)
      }, keyword);
      list.appendChild(item);
    });

    section.appendChild(list);
    return section;
  }

  createPopularSearchesSection() {
    const topKeywords = SearchStorage.analytics.getTopKeywords(8);
    
    if (!topKeywords.length) {
      return el('div');
    }

    const section = el('div', { class: 'search-section' });
    
    const header = el('h3', {}, 'Tìm kiếm phổ biến');
    section.appendChild(header);

    const list = el('div', { class: 'search-keywords' });
    
    topKeywords.forEach(keyword => {
      const item = el('button', {
        class: 'search-keyword popular',
        onclick: () => this.handleSearch(keyword)
      }, keyword);
      list.appendChild(item);
    });

    section.appendChild(list);
    return section;
  }

  async performSearch(query, contentEl) {
    if (!query.trim()) {
      this.showInitialState(contentEl);
      return;
    }

    this.searchState = 'searching';
    this.currentQuery = query;

    // Update UI
    this.updateSearchHero(query, 'Đang tìm kiếm...');
    contentEl.innerHTML = '';
    contentEl.appendChild(buildSearchSkeleton(UI_CONFIG.SKELETON_COUNT));

    // Cancel previous request
    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = requestManager.createController('search');

    try {
      // Search API call
      const data = await movieSourceClient.search(query, true);

      // Track search analytics
      const itemCount = data.items?.length || 0;
      SearchStorage.analytics.track(query, itemCount);

      // Save to recent searches
      SearchStorage.recent.push(query);

      // Display results
      this.displayResults(data, contentEl, query);

    } catch (error) {
      console.error('Search error:', error);
      this.searchState = 'error';
      this.showError(contentEl, error);
    }
  }

  displayResults(data, contentEl, query) {
    contentEl.innerHTML = '';

    const items = data.items || [];
    this.searchResults = DataNormalizer.normalizeItems(data);

    if (items.length === 0) {
      this.searchState = 'no-results';
      this.showNoResults(contentEl, query);
      return;
    }

    this.searchState = 'results';
    this.updateSearchHero(query, `Tìm thấy ${items.length} kết quả`);

    // Results header
    const header = el('div', { class: 'search-results-header' });
    header.innerHTML = `
      <div class="results-info">
        <span class="results-count">${items.length} kết quả</span>
        <span class="search-query">cho "${this.escapeHtml(query)}"</span>
      </div>
    `;
    contentEl.appendChild(header);

    // Results grid
    const grid = el('div', { class: 'search-grid' });
    contentEl.appendChild(grid);

    renderCardsProgressively(grid, this.searchResults, UI_CONFIG.RENDER_PAGE_SIZE, (movie) => 
      this.createSearchResultCard(movie, query)
    );
  }

  showNoResults(contentEl, query) {
    this.updateSearchHero(query, 'Không tìm thấy kết quả');
    
    const noResults = el('div', { class: 'no-results' });
    noResults.innerHTML = `
      <div class="no-results-content">
        <i class="fa-solid fa-search"></i>
        <h3>Không tìm thấy kết quả</h3>
        <p>Không tìm thấy phim nào khớp với "${this.escapeHtml(query)}"</p>
        <div class="no-results-suggestions">
          <p>Gợi ý:</p>
          <ul>
            <li>Kiểm tra lỗi chính tả</li>
            <li>Thử dùng từ khóa khác</li>
            <li>Tìm kiếm theo tên tiếng Việt hoặc tiếng Anh</li>
          </ul>
        </div>
        <button class="retry-btn" onclick="window.location.reload()">Tìm kiếm mới</button>
      </div>
    `;
    contentEl.appendChild(noResults);
  }

  showError(contentEl, error) {
    this.updateSearchHero(this.currentQuery, 'Lỗi tìm kiếm');
    
    const errorState = el('div', { class: 'search-error' });
    errorState.innerHTML = `
      <div class="error-content">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <h3>Đã xảy ra lỗi</h3>
        <p>${error.message || 'Không thể thực hiện tìm kiếm'}</p>
        <button class="retry-btn" onclick="window.location.reload()">Thử lại</button>
      </div>
    `;
    contentEl.appendChild(errorState);
  }

  createSearchResultCard(movie, query) {
    const card = el('div', { class: 'card search-result-card' });
    card.onclick = () => this.handleMovieClick(movie.slug);

    const thumb = el('div', { class: 'card-thumb' });
    const img = document.createElement('img');
    img.src = movie._thumb;
    img.alt = movie.name || '';
    img.loading = 'lazy';
    img.onerror = () => {
      img.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect fill="%23222"/><text x="50%25" y="50%25" fill="%23555" font-size="14" text-anchor="middle" dominant-baseline="middle">No Image</text></svg>';
    };
    thumb.appendChild(img);

    const info = el('div', { class: 'card-info' });
    
    const title = el('div', { class: 'card-title' });
    title.innerHTML = highlightText(movie.name || '', query);
    info.appendChild(title);

    if (movie.origin_name && movie.origin_name !== movie.name) {
      const origTitle = el('div', { class: 'card-original-title' });
      origTitle.innerHTML = highlightText(movie.origin_name, query);
      info.appendChild(origTitle);
    }

    const meta = el('div', { class: 'card-meta' });
    
    if (movie.year) {
      meta.appendChild(el('span', {}, String(movie.year)));
    }
    
    if (movie.quality || movie.episode_current) {
      if (movie.year) {
        meta.appendChild(el('span', { class: 'dot' }, '•'));
      }
      meta.appendChild(el('span', {}, movie.quality || movie.episode_current || 'HD'));
    }
    
    info.appendChild(meta);

    card.appendChild(thumb);
    card.appendChild(info);

    return card;
  }

  updateSearchHero(query, subtitle) {
    const subtitleEl = document.querySelector('.search-subtitle');
    if (subtitleEl) {
      subtitleEl.textContent = subtitle;
    }
  }

  handleSearch(query) {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.performSearch(query, document.querySelector('.search-content'));
    }, UI_CONFIG.DEBOUNCE_DELAY);
  }

  handleMovieClick(slug) {
    window.location.href = `/?view=detail&slug=${encodeURIComponent(slug)}`;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

export default SearchPage;
