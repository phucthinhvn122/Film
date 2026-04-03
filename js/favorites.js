import { ROUTES, UI_TEXT } from './config.js';
import { createElement, createMovieCard, createEmptyState } from './dom.js';
import { FavoritesStorage } from './storage.js';

export async function renderFavoritesPage(ctx) {
  const page = createElement('section', { className: 'search-page' });
  const hero = createElement('div', { className: 'search-hero' }, [
    createElement('h2', { text: UI_TEXT.favorites })
  ]);
  page.appendChild(hero);

  const grid = createElement('div', { className: 'search-grid' });
  const favorites = FavoritesStorage.list();

  if (!favorites.length) {
    grid.appendChild(createEmptyState('Báº¡n chÆ°a thÃªm phim nÃ o vÃ o danh sÃ¡ch yÃªu thÃ­ch.'));
  } else {
    favorites.forEach((item) => {
      const card = createMovieCard({
        slug: item.slug,
        name: item.name,
        year: item.year,
        quality: item.quality,
        episodeCurrent: '',
        thumb: item.thumb,
        poster: item.poster
      }, {
        isFavorite: true,
        onOpen: (movie) => ctx.navigate(ROUTES.DETAIL, { slug: movie.slug }),
        onFavoriteToggle: () => {
          FavoritesStorage.toggle(item);
          ctx.navigate(ROUTES.FAVORITES, {}, { replace: true });
        }
      });
      grid.appendChild(card);
    });
  }

  page.appendChild(grid);
  return {
    node: page,
    title: UI_TEXT.favorites
  };
}

