import { ROUTES, UI_TEXT } from './config.js';
import { createElement, createMovieCard, createEmptyState } from './dom.js';
import { FavoritesStorage } from './storage.js';
import { BasePage, router } from './router.js';

function mapFavoriteToMovie(item) {
  return {
    slug: item.slug,
    name: item.name,
    year: item.year,
    quality: item.quality,
    episodeCurrent: '',
    thumb: item.thumb,
    poster: item.poster
  };
}
async function renderFavoritesPage(ctx) {
  const page = createElement('section', { className: 'search-page' });
  const hero = createElement('div', { className: 'search-hero' }, [
    createElement('h2', { text: UI_TEXT.favorites })
  ]);
  page.appendChild(hero);

  const grid = createElement('div', { className: 'search-grid' });
  const favorites = FavoritesStorage.list();

  if (!favorites.length) {
    grid.appendChild(createEmptyState('Ban chua them phim nao vao danh sach yeu thich.'));
  } else {
    favorites.forEach((item) => {
      const card = createMovieCard(mapFavoriteToMovie(item), {
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

export class FavoritesPage extends BasePage {
  constructor() {
    super(ROUTES.FAVORITES);
  }

  async render() {
    const result = await renderFavoritesPage({
      navigate: (route, params = {}, options = {}) => {
        const replace = Boolean(options && options.replace);
        return router.navigate(route, params, replace);
      }
    });

    if (result?.title) this.setTitle(result.title);
    return result?.node || createElement('section');
  }

  onMounted() {
    this.updateActiveTab('favorites');
    window.scrollTo(0, 0);
  }
}
