import { BasePage, router } from './router.js';
import { ROUTES, SEARCH_CONFIG, UI_TEXT } from './config.js';
import { searchMovies, requestManager } from './api.js';
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

function normalizeQuery(raw = '') {
  return String(raw || '').trim();
}

function categoryLabel(query = '') {
  const raw = String(query || '').trim();
  if (!raw.toLowerCase().startsWith('category:')) return '';
  const key = raw.split(':')[1] || '';

  switch (key) {
    case 'phim-bo':
      return 'Phim bộ';
    case 'phim-le':
      return 'Phim lẻ';
    case 'hoat-hinh':
      return 'Hoạt hình';
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
    const content = createElement('div');
    page.appendChild(content);

    const header = createElement('div', { className: 'search-results-header search-hero' }, [
      createElement('h2', { className: 'search-title', text: query ? 'Kết quả tìm kiếm' : 'Tìm kiếm' }),
      createElement('span', { className: 'search-meta', text: query
        ? (query.startsWith('category:')
          ? `Danh mục: ${categoryLabel(query)}`
          : `Từ khóa: "${query}"`)
        : 'Nhập từ khóa để tìm phim'
      })
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
      if (value.length >= SEARCH_CONFIG.MIN_LENGTH) {
        SearchStorage.pushRecent(value);
        router.navigate(ROUTES.SEARCH, { q: value }, true);
      }
    });

    if (!query) {
      const recent = SearchStorage.recent();
      if (recent.length) {
        const recentSection = createElement('section', { className: 'search-section' });
        const recentTitle = createElement('div', {
          className: 'section-title',
          text: 'Tìm kiếm gần đây',
          style: { marginBottom: '10px', marginTop: '16px' }
        });
        recentSection.appendChild(recentTitle);

        const chips = createElement('div', { className: 'search-suggestions' });
        recent.forEach((term) => {
          const chip = createElement('button', {
            type: 'button',
            className: 'suggestion-item',
            text: term
          });
          chip.addEventListener('click', () => router.navigate(ROUTES.SEARCH, { q: term }, true));
          chips.appendChild(chip);
        });
        recentSection.appendChild(chips);
        content.appendChild(recentSection);
      }
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
        content.appendChild(createEmptyState('Không tìm thấy phim phù hợp.'));
        return;
      }

      const resultsInfo = createElement('div', { className: 'results-info' }, [
        createElement('span', { className: 'results-count', text: `${items.length} kết quả` })
      ]);
      content.appendChild(resultsInfo);

      const grid = createElement('div', { className: 'search-grid' });
      items.forEach((movie) => {
        const card = createMovieCard(movie, {
          isFavorite: FavoritesStorage.isFavorite(movie.slug),
          onOpen: (pickedMovie) => router.navigate(ROUTES.DETAIL, { slug: pickedMovie.slug }),
          onFavoriteToggle: () => {
            const added = FavoritesStorage.toggle(movie);
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

function syncSearchInputValue(query = '') {
  const desktopInput = document.querySelector('#q');
  const mobileInput = document.querySelector('#q-mob');
  if (desktopInput) desktopInput.value = query;
  if (mobileInput) mobileInput.value = query;
}

export default SearchPage;
