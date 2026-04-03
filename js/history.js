import { ROUTES, UI_TEXT } from './config.js';
import { createElement, createMovieCard, createEmptyState } from './dom.js';
import { HistoryStorage } from './storage.js';

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

export async function renderHistoryPage(ctx) {
  const page = createElement('section', { className: 'search-page' });
  const hero = createElement('div', { className: 'search-hero' }, [
    createElement('h2', { text: UI_TEXT.history })
  ]);
  page.appendChild(hero);

  const toolbar = createElement('div', { className: 'search-toolbar' });
  const clearBtn = createElement('button', {
    type: 'button',
    className: 'toolbar-btn',
    text: 'XÃ³a toÃ n bá»™ lá»‹ch sá»­'
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
    grid.appendChild(createEmptyState('Báº¡n chÆ°a cÃ³ lá»‹ch sá»­ xem phim.'));
  } else {
    history.forEach((item) => {
      const card = createMovieCard(mapHistoryToMovie(item), {
        onOpen: () => ctx.navigate(ROUTES.WATCH, {
          slug: item.movieSlug,
          ep: item.epSlug,
          server: item.serverName
        })
      });
      grid.appendChild(card);
    });
  }

  page.appendChild(grid);
  return { node: page, title: UI_TEXT.history };
}

