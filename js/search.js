import { BasePage, router } from './router.js';
import { ROUTES, SEARCH_CONFIG, UI_TEXT } from './config.js';
import { searchMovies, requestManager } from './api.js';
import { SearchStorage } from './storage.js';
import {
  createElement,
  createEmptyState,
  createErrorState,
  createMovieCard,
  createSkeletonGrid
} from './dom.js';
import { syncSearchInputValue } from './ui.js';

function normalizeQuery(value = '') {
  return String(value || '').trim();
}

function categoryLabel(query = '') {
  const raw = String(query || '').trim();
  if (!raw.toLowerCase().startsWith('category:')) return '';
  const key = raw.split(':')[1] || '';

  switch (key) {
    case 'phim-bo':
      return 'Phim b?';
    case 'phim-le':
      return 'Phim l?';
    case 'hoat-hinh':
      return 'Ho?t hình';
    case 'tv-shows':
      return 'TV Shows';
    default:
      return key;
  }
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

    const hero = createElement('div', { className: 'search-hero' }, [
      createElement('h2', { className: 'search-title', text: query ? 'K?t qu? tìm ki?m' : UI_TEXT.search }),
      createElement('p', {
        className: 'search-subtitle',
        text: query
          ? (categoryLabel(query) ? `Danh m?c: ${categoryLabel(query)}` : `T? khóa: "${query}"`)
          : 'Nh?p t? khóa d? tìm phim'
      })
    ]);

    const content = createElement('div', { className: 'search-content' });

    page.appendChild(hero);
    page.appendChild(content);

    if (!query) {
      content.appendChild(this.createSearchForm());
      content.appendChild(this.createRecentSection());
      return page;
    }

    await this.renderResults(query, content);
    return page;
  }

  createSearchForm() {
    const wrap = createElement('div', { className: 'search-toolbar' });
    const form = createElement('form', { className: 'search-form' });
    const input = createElement('input', {
      type: 'text',
      value: this.currentQuery,
      placeholder: 'Nh?p tên phim...',
      autocomplete: 'off'
    });

    const button = createElement('button', {
      type: 'submit',
      className: 'toolbar-btn',
      text: 'Tìm ki?m'
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const keyword = normalizeQuery(input.value);
      if (keyword.length > 0 && keyword.length < SEARCH_CONFIG.MIN_LENGTH) {
        input.focus();
        return;
      }
      router.navigate(ROUTES.SEARCH, { q: keyword });
    });

    form.appendChild(input);
    form.appendChild(button);
    wrap.appendChild(form);
    return wrap;
  }

  createRecentSection() {
    const recent = SearchStorage.recent();
    if (!recent.length) return createElement('div');

    const section = createElement('section', { className: 'search-section' });
    section.appendChild(createElement('h3', { text: 'Tìm ki?m g?n dây' }));

    const row = createElement('div', { className: 'search-keywords' });
    recent.forEach((keyword) => {
      const chip = createElement('button', {
        type: 'button',
        className: 'search-keyword',
        text: keyword
      });
      chip.addEventListener('click', () => {
        router.navigate(ROUTES.SEARCH, { q: keyword });
      });
      row.appendChild(chip);
    });

    section.appendChild(row);
    return section;
  }

  async renderResults(query, content) {
    content.innerHTML = '';
    content.appendChild(createSkeletonGrid(12));

    this.abortController = requestManager.next('search');

    try {
      const payload = await searchMovies(query, { signal: this.abortController.signal });
      if (this.abortController.signal.aborted) return;

      const items = Array.isArray(payload?.items) ? payload.items : [];
      SearchStorage.pushRecent(query);

      content.innerHTML = '';

      if (!items.length) {
        content.appendChild(createEmptyState('Không tìm th?y phim phù h?p.'));
        return;
      }

      const header = createElement('div', { className: 'search-results-header' }, [
        createElement('div', { className: 'results-info' }, [
          createElement('span', { className: 'results-count', text: `${items.length} k?t qu?` })
        ])
      ]);
      content.appendChild(header);

      const grid = createElement('div', { className: 'search-grid' });
      items.forEach((movie) => {
        const card = createMovieCard(movie, {
          onOpen: (pickedMovie) => router.navigate(ROUTES.DETAIL, { slug: pickedMovie.slug })
        });
        grid.appendChild(card);
      });

      content.appendChild(grid);
    } catch (_) {
      content.innerHTML = '';
      content.appendChild(createErrorState(UI_TEXT.networkError, [
        {
          label: UI_TEXT.retry,
          onClick: () => router.navigate(ROUTES.SEARCH, { q: query }, true)
        }
      ]));
    }
  }

  onMounted() {
    this.updateActiveTab('search');
    syncSearchInputValue(this.currentQuery);
    window.scrollTo(0, 0);
  }

  async unmount() {
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
