import { BasePage, router } from './router.js';
import { ROUTES, SEARCH_CONFIG, UI_TEXT } from './config.js';
import { searchMovies, requestManager, fetchMovieDetail } from './api.js';
import { SearchStorage } from './storage.js';
import {
  createElement,
  createEmptyState,
  createErrorState,
  createMovieCard,
  createSkeletonGrid,
  toast
} from './dom.js';
import { FavoritesStorage } from './storage.js';
import { syncSearchInputValue } from './ui.js';

function normalizeQuery(raw = '') {
  return String(raw || '').trim();
}

function debounce(fn, ms) {
  let timer;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => clearTimeout(timer);
  return wrapped;
}

// Trend data for autocomplete suggestions
const TRENDING_KEYWORDS = [
  'hành động', 'tình cảm', 'kinh dị', 'hài', 'võ thuật',
  'hoạt hình', 'chiến tranh', 'tâm lý', 'cổ trang', 'viễn tưởng'
];

// Extended smart chips with categories and popular genres
const SMART_CHIPS = [
  { label: 'Phim bộ', query: 'category:phim-bo', icon: 'fa-list' },
  { label: 'Phim lẻ', query: 'category:phim-le', icon: 'fa-film' },
  { label: 'Anime', query: 'category:hoat-hinh', icon: 'fa-dragon' },
  { label: 'TV Shows', query: 'category:tv-shows', icon: 'fa-tv' },
  { label: 'Hành động', query: 'hanh dong', icon: 'fa-bolt' },
  { label: 'Tình cảm', query: 'tinh cam', icon: 'fa-heart' },
  { label: 'Kinh dị', query: 'kinh di', icon: 'fa-ghost' },
  { label: 'Hài', query: 'hai', icon: 'fa-face-laugh' }
];

function categoryLabel(query = '') {
  const raw = String(query || '').trim();
  if (!raw.toLowerCase().startsWith('category:')) return '';
  const key = raw.split(':')[1] || '';
  return SMART_CHIPS.find((item) => item.query === `category:${key}`)?.label || key;
}

function renderSuggestionChips(title, chips, onPick) {
  if (!chips.length) return null;
  const section = createElement('section', { className: 'search-section smart-search-block' });

  const titleEl = createElement('div', { className: 'section-title' });
  titleEl.textContent = title;
  section.appendChild(titleEl);

  const row = createElement('div', { className: 'search-suggestions smart-chip-row' });
  chips.forEach((chip) => {
    const chipData = typeof chip === 'string' ? { label: chip, query: chip } : chip;
    const btn = createElement('button', {
      type: 'button',
      className: 'suggestion-item smart-chip',
      'aria-label': `Tìm kiếm ${chipData.label}`
    });

    // Add icon if available
    if (chipData.icon) {
      const icon = createElement('i', { className: `fa-solid ${chipData.icon}` });
      icon.style.marginRight = '6px';
      btn.appendChild(icon);
    }

    const label = createElement('span');
    label.textContent = chipData.label;
    btn.appendChild(label);

    btn.addEventListener('click', () => onPick(chipData.query));
    row.appendChild(btn);
  });

  section.appendChild(row);
  return section;
}

export class SearchPage extends BasePage {
  constructor() {
    super(ROUTES.SEARCH);
    this.abortController = null;
    this.currentQuery = '';
  }

  async render(params = {}) {
    const query = normalizeQuery(params.q);
    this.currentQuery = query;

    const page = createElement('section', { className: 'search-page' });
    const content = createElement('div');
    page.appendChild(content);

    // Smart header - dynamic based on context
    const headerTitle = query
      ? (query.startsWith('category:') ? categoryLabel(query) : `"${query}"`)
      : 'Tìm kiếm';
    const headerSub = query
      ? (query.startsWith('category:')
        ? `Danh mục: ${categoryLabel(query)}`
        : `Kết quả cho "${query}"`)
      : 'Nhập từ khóa để tìm phim, thể loại yêu thích';

    const header = createElement('div', { className: 'search-results-header search-hero' }, [
      createElement('div', { className: 'search-hero-left' }, [
        createElement('h2', { className: 'search-title', text: headerTitle }),
        createElement('span', { className: 'search-meta', text: headerSub })
      ])
    ]);
    content.appendChild(header);

    const form = createElement('form', { className: 'search-form' });
    const input = createElement('input', {
      type: 'text',
      className: 'search-input',
      placeholder: 'Nhập tên phim...',
      value: query,
      autocomplete: 'off'
    });
    const submitBtn = createElement('button', {
      type: 'submit',
      className: 'section-more',
      text: 'Tìm kiếm'
    });
    form.appendChild(input);
    form.appendChild(submitBtn);
    content.appendChild(form);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const value = normalizeQuery(input.value);
      if (value) SearchStorage.pushRecent(value);
      router.navigate(ROUTES.SEARCH, { q: value }, true);
    });

    const liveSearch = debounce((value) => {
      const trimmed = normalizeQuery(value);
      if (trimmed === this.currentQuery) return;
      if (trimmed.length > 0 && trimmed.length < SEARCH_CONFIG.MIN_LENGTH) return;
      SearchPage._restoreFocus = true;
      router.navigate(ROUTES.SEARCH, { q: trimmed }, true);
    }, SEARCH_CONFIG.DEBOUNCE_MS);

    input.addEventListener('input', (event) => {
      liveSearch(event.target.value);
    });

    this._liveSearchCancel = liveSearch.cancel;
    this._searchInput = input;

    if (!query) {
      const openQuery = (value) => {
        SearchStorage.pushRecent(value);
        router.navigate(ROUTES.SEARCH, { q: value }, true);
      };

      // Smart chips - categories and genres
      const smart = renderSuggestionChips('Khám phá nhanh', SMART_CHIPS, openQuery);
      if (smart) content.appendChild(smart);

      // Recent searches
      const recent = SearchStorage.recent();
      if (recent.length > 0) {
        const recentSection = renderSuggestionChips('Tìm kiếm gần đây', recent, openQuery);
        if (recentSection) content.appendChild(recentSection);
      }

      // Trending keywords
      const trendingSection = renderSuggestionChips('Từ khóa phổ biến', TRENDING_KEYWORDS, openQuery);
      if (trendingSection) content.appendChild(trendingSection);

      return page;
    }

    await this.renderResults(query, content);
    return page;
  }

  async renderResults(query, content) {
    content.appendChild(createSkeletonGrid(12));

    this.abortController = requestManager.next('search');

    try {
      const payload = await searchMovies(query, { signal: this.abortController.signal });
      const items = (payload && Array.isArray(payload?.items)) ? payload.items : [];

      // Remove skeleton
      const skeleton = content.querySelector('.search-skeleton');
      if (skeleton) skeleton.remove();

      if (!items.length) {
        content.appendChild(createEmptyState('Không tìm thấy phim phù hợp. Thử tìm kiếm khác hoặc khám phá danh mục.'));
        return;
      }

      // Results info with count
      const resultsInfo = createElement('div', { className: 'results-info' }, [
        createElement('span', { className: 'results-count', text: `${items.length} kết quả tìm thấy` })
      ]);
      content.appendChild(resultsInfo);

      // Movie grid with optimized rendering
      const favoriteSlugs = new Set(FavoritesStorage.list().map((item) => item.slug));
      const grid = createElement('div', { className: 'search-grid' });

      items.forEach((movie) => {
        const card = createMovieCard(movie, {
          isFavorite: favoriteSlugs.has(movie.slug),
          onOpen: (pickedMovie) => router.navigate(ROUTES.DETAIL, { slug: pickedMovie.slug }),
          onPrefetch: (pickedMovie) => {
            fetchMovieDetail(pickedMovie.slug, { force: false }).catch(() => {});
          },
          onFavoriteToggle: () => {
            const added = FavoritesStorage.toggle(movie);
            if (added) favoriteSlugs.add(movie.slug);
            else favoriteSlugs.delete(movie.slug);
            toast(added ? 'Đã thêm vào yêu thích' : 'Đã bỏ khỏi yêu thích');
            card.querySelector('.fav-btn')?.classList.toggle('on', added);
          }
        });
        grid.appendChild(card);
      });

      content.appendChild(grid);
    } catch (_) {
      const skeleton = content.querySelector('.search-skeleton');
      if (skeleton) skeleton.remove();
      content.appendChild(createErrorState(UI_TEXT.networkError, [{
        label: UI_TEXT.retry,
        onClick: () => router.navigate(ROUTES.SEARCH, { q: query }, true)
      }]));
    }
  }

  onMounted() {
    this.updateActiveTab('search');
    syncSearchInputValue(this.currentQuery);
    const shouldRestore = SearchPage._restoreFocus;
    SearchPage._restoreFocus = false;
    if (this._searchInput && (shouldRestore || !this.currentQuery)) {
      try {
        this._searchInput.focus({ preventScroll: true });
      } catch (_) {
        this._searchInput.focus();
      }
      if (shouldRestore && typeof this._searchInput.setSelectionRange === 'function') {
        const len = this._searchInput.value.length;
        try { this._searchInput.setSelectionRange(len, len); } catch (_) { /* ignore */ }
      }
    }
    if (!shouldRestore) window.scrollTo(0, 0);
  }

  async unmount() {
    if (typeof this._liveSearchCancel === 'function') {
      try {
        this._liveSearchCancel();
      } catch (_) {
        // ignore
      }
    }
    if (this.abortController) {
      try {
        this.abortController.abort();
      } catch (_) {
        // ignore
      }
    }
    await super.unmount();
  }
}

export default SearchPage;
