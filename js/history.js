import { ROUTES, UI_TEXT } from './config.js';
import { createElement, createMovieCard, createEmptyState } from './dom.js';
import { HistoryStorage } from './storage.js';
import { BasePage, router } from './router.js';

function mapHistoryToMovie(entry) {
  return {
    slug: entry.movieSlug,
    name: entry.movieName || 'Phim',
    year: '',
    quality: entry.serverName || '',
    episodeCurrent: entry.episodeName || '',
    thumb: entry.poster || '',
    poster: entry.poster || ''
  };
}
async function renderHistoryPage(ctx) {
  const page = createElement('section', { className: 'search-page' });
  const hero = createElement('div', { className: 'search-hero' }, [
    createElement('h2', { text: UI_TEXT.history })
  ]);
  page.appendChild(hero);

  const toolbar = createElement('div', { className: 'search-toolbar' });
  const clearBtn = createElement('button', {
    type: 'button',
    className: 'toolbar-btn',
    text: 'Xóa toàn bộ lịch sử'
  });
  clearBtn.addEventListener('click', () => {
    HistoryStorage.clear();
    ctx.navigate(ROUTES.HISTORY, {}, { replace: true });
  });
  toolbar.appendChild(clearBtn);
  page.appendChild(toolbar);

  const grid = createElement('div', { className: 'search-grid' });
  const history = HistoryStorage.list();

  if (!history.length) {
    grid.appendChild(createEmptyState('Bạn chưa có lịch sử xem phim.'));
  } else {
    history.forEach((item) => {
      const card = createMovieCard(mapHistoryToMovie(item), {
        onOpen: () => ctx.navigate(ROUTES.DETAIL, { slug: item.movieSlug })
      });
      grid.appendChild(card);
    });
  }

  page.appendChild(grid);
  return { node: page, title: UI_TEXT.history };
}

export class HistoryPage extends BasePage {
  constructor() {
    super(ROUTES.HISTORY);
  }

  async render() {
    const result = await renderHistoryPage({
      navigate: (route, params = {}, options = {}) => {
        const replace = Boolean(options && options.replace);
        return router.navigate(route, params, replace);
      }
    });

    if (result?.title) this.setTitle(result.title);
    return result?.node || createElement('section');
  }

  onMounted() {
    this.updateActiveTab('history');
    window.scrollTo(0, 0);
  }
}
