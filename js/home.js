import { CATEGORY_LABELS, DEFAULT_PAGE_SIZE, ROUTES, UI_TEXT } from './config.js';
import { requestManager, fetchHomeLatest, fetchCategory } from './api.js';
import { BasePage, router } from './router.js';
import {
  createElement,
  createMovieCard,
  createErrorState,
  createLoaderState,
  createEmptyState,
  toast
} from './dom.js';
import { ContinueWatchingStorage, HistoryStorage, FavoritesStorage } from './storage.js';

function createRowSection(title, subtitle, options = {}) {
  const section = createElement('section', { className: 'section-block' });
  const head = createElement('div', { className: 'section-head' }, [
    createElement('div', {}, [
      createElement('div', { className: 'section-title', text: title }),
      subtitle ? createElement('div', { className: 'section-sub', text: subtitle }) : null
    ].filter(Boolean))
  ]);

  if (options.actionLabel && typeof options.onAction === 'function') {
    const btn = createElement('button', {
      type: 'button',
      className: 'section-more',
      text: options.actionLabel
    });
    btn.addEventListener('click', options.onAction);
    head.appendChild(btn);
  }

  section.appendChild(head);
  return section;
}

function createHero(movie, onOpen) {
  const hero = createElement('section', {
    className: 'hero',
    style: { backgroundImage: `url('${movie?.poster || movie?.thumb || ''}')` }
  });

  const body = createElement('div', { className: 'hero-body' }, [
    createElement('span', { className: 'hero-badge', text: 'Netflix' }),
    createElement('h1', { className: 'hero-title', text: movie?.name || 'Netflix' }),
    createElement('p', {
      className: 'hero-sub',
      text: movie?.originName || movie?.episodeCurrent || 'Kho phim cap nhat lien tuc'
    }),
    createElement('p', {
      className: 'hero-desc',
      text: movie?.content || 'Kham pha cac bo phim moi va danh sach noi dung noi bat.'
    })
  ]);

  const btnWrap = createElement('div', { className: 'hero-btns' });
  const watchBtn = createElement('button', {
    type: 'button',
    className: 'btn btn-orange'
  }, [
    createElement('i', { class: 'fa-solid fa-play', 'aria-hidden': 'true' }),
    createElement('span', { text: 'Xem ngay' })
  ]);
  watchBtn.addEventListener('click', () => {
    if (movie?.slug) onOpen(movie.slug);
  });

  const detailBtn = createElement('button', {
    type: 'button',
    className: 'btn btn-gray'
  }, [
    createElement('i', { class: 'fa-solid fa-circle-info', 'aria-hidden': 'true' }),
    createElement('span', { text: 'Chi tiet' })
  ]);
  detailBtn.addEventListener('click', () => {
    if (movie?.slug) onOpen(movie.slug);
  });

  btnWrap.appendChild(watchBtn);
  btnWrap.appendChild(detailBtn);
  body.appendChild(btnWrap);
  hero.appendChild(body);
  return hero;
}

function fillCards(grid, movies, ctx) {
  grid.innerHTML = '';
  if (!movies.length) {
    grid.appendChild(createEmptyState(UI_TEXT.noData));
    return;
  }

  movies.slice(0, DEFAULT_PAGE_SIZE).forEach((movie) => {
    const card = createMovieCard(movie, {
      isFavorite: FavoritesStorage.isFavorite(movie.slug),
      onOpen: (pickedMovie) => ctx.navigate(ROUTES.DETAIL, { slug: pickedMovie.slug }),
      onFavoriteToggle: () => {
        const added = FavoritesStorage.toggle(movie);
        ctx.toast(added ? 'Da them vao yeu thich' : 'Da bo khoi yeu thich');
        card.querySelector('.fav-btn')?.classList.toggle('on', added);
      }
    });
    grid.appendChild(card);
  });
}

function renderContinueRow(ctx) {
  const items = ContinueWatchingStorage.list();
  if (!items.length) return null;

  const section = createRowSection(UI_TEXT.continueWatching, 'Tiep tuc tu thoi diem ban dang xem gan nhat');
  const row = createElement('div', { className: 'movie-row movie-row-history' });

  items.forEach((item) => {
    const card = createMovieCard({
      slug: item.movieSlug,
      name: item.movieName || 'Phim',
      year: '',
      quality: item.serverName || '',
      episodeCurrent: item.episodeName || '',
      thumb: item.poster,
      poster: item.poster
    }, {
      onOpen: () => ctx.navigate(ROUTES.WATCH, {
        slug: item.movieSlug,
        ep: item.epSlug,
        server: item.serverName
      })
    });
    row.appendChild(card);
  });

  section.appendChild(row);
  return section;
}

function renderHistoryRow(ctx) {
  const items = HistoryStorage.list().slice(0, 12);
  if (!items.length) return null;

  const section = createRowSection(UI_TEXT.history, 'Lich su xem gan day', {
    actionLabel: 'Xoa lich su',
    onAction: () => {
      HistoryStorage.clear();
      ctx.navigate(ROUTES.HOME, {}, { replace: true });
    }
  });

  const row = createElement('div', { className: 'movie-row movie-row-history' });
  items.forEach((item) => {
    const card = createMovieCard({
      slug: item.movieSlug,
      name: item.movieName || 'Phim',
      quality: item.serverName || '',
      episodeCurrent: item.episodeName || '',
      thumb: item.poster,
      poster: item.poster
    }, {
      onOpen: () => ctx.navigate(ROUTES.WATCH, {
        slug: item.movieSlug,
        ep: item.epSlug,
        server: item.serverName
      })
    });
    row.appendChild(card);
  });

  section.appendChild(row);
  return section;
}

export async function renderHomePage(ctx) {
  const controller = requestManager.next('home');
  const node = createElement('div');
  const rowsContainer = createElement('div', { className: 'rows-section' }, [createLoaderState(UI_TEXT.loading)]);

  node.appendChild(createHero(null, (slug) => ctx.navigate(ROUTES.DETAIL, { slug })));
  node.appendChild(rowsContainer);

  try {
    const [latestResult, seriesResult, movieResult, animeResult, tvResult] = await Promise.allSettled([
      fetchHomeLatest(1, { signal: controller.signal }),
      fetchCategory('phim-bo', 1, { signal: controller.signal }),
      fetchCategory('phim-le', 1, { signal: controller.signal }),
      fetchCategory('hoat-hinh', 1, { signal: controller.signal }),
      fetchCategory('tv-shows', 1, { signal: controller.signal })
    ]);

    if (controller.signal.aborted) {
      return { node, cleanup: () => requestManager.cancel('home') };
    }

    const sectionsWrap = createElement('div', { className: 'home-sections' });
    rowsContainer.innerHTML = '';
    rowsContainer.appendChild(sectionsWrap);

    const latestItems = latestResult.status === 'fulfilled' ? latestResult.value.items : [];
    node.replaceChild(
      createHero(latestItems[0], (slug) => ctx.navigate(ROUTES.DETAIL, { slug })),
      node.firstChild
    );

    const continueRow = renderContinueRow(ctx);
    if (continueRow) sectionsWrap.appendChild(continueRow);

    const historyRow = renderHistoryRow(ctx);
    if (historyRow) sectionsWrap.appendChild(historyRow);

    const map = [
      { result: latestResult, key: 'latest', subtitle: 'Cac tua phim vua duoc cap nhat' },
      { result: seriesResult, key: 'phim-bo', subtitle: 'Theo doi tap moi nhat moi ngay' },
      { result: movieResult, key: 'phim-le', subtitle: 'Phim le hap dan chon loc' },
      { result: animeResult, key: 'hoat-hinh', subtitle: 'Kho anime va hoat hinh noi bat' },
      { result: tvResult, key: 'tv-shows', subtitle: 'Chuong trinh truyen hinh thinh hanh' }
    ];

    map.forEach((item) => {
      const section = createRowSection(
        CATEGORY_LABELS[item.key] || item.key,
        item.subtitle,
        item.key !== 'latest'
          ? {
              actionLabel: 'Xem tat ca',
              onAction: () => ctx.navigate(ROUTES.SEARCH, { q: `category:${item.key}` })
            }
          : undefined
      );
      const grid = createElement('div', { className: 'section-grid' });
      section.appendChild(grid);

      if (item.result.status === 'fulfilled') {
        fillCards(grid, item.result.value.items, ctx);
      } else {
        grid.appendChild(createErrorState('Khong the tai danh sach nay. Ban co the thu lai sau.'));
      }

      sectionsWrap.appendChild(section);
    });

    return {
      node,
      cleanup: () => requestManager.cancel('home'),
      title: 'Trang chu'
    };
  } catch (error) {
    rowsContainer.innerHTML = '';
    rowsContainer.appendChild(createErrorState(UI_TEXT.networkError, [
      { label: 'Thu lai', onClick: () => ctx.navigate(ROUTES.HOME, {}, { replace: true }) }
    ]));

    return {
      node,
      cleanup: () => requestManager.cancel('home'),
      title: 'Trang chu'
    };
  }
}

export class HomePage extends BasePage {
  constructor() {
    super(ROUTES.HOME);
  }

  async render() {
    try {
      const result = await renderHomePage({
        navigate: (route, params = {}, options = {}) => {
          const replace = Boolean(options && options.replace);
          return router.navigate(route, params, replace);
        },
        toast: (message) => toast(message)
      });

      this.cleanup = typeof result?.cleanup === 'function' ? result.cleanup : null;
      if (result?.title) this.setTitle(result.title);

      return result?.node || createElement('div');
    } catch (error) {
      console.error('HomePage render failed:', error);
      return createElement('section', { className: 'search-page' }, [
        createErrorState(UI_TEXT.networkError, [
          {
            label: 'Thu lai',
            onClick: () => router.navigate(ROUTES.HOME, {}, true)
          }
        ])
      ]);
    }
  }

  onMounted() {
    this.updateActiveTab('home');
    window.scrollTo(0, 0);
  }
}



