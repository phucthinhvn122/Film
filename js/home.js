import { CATEGORY_LABELS, DEFAULT_PAGE_SIZE, ROUTES, UI_TEXT } from './config.js';
import { requestManager, fetchHomeLatest, fetchCategory } from './api.js';
import {
  createElement,
  createMovieCard,
  createErrorState,
  createLoaderState,
  createEmptyState
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
    createElement('span', { className: 'hero-badge', text: 'ThinFilm' }),
    createElement('h1', { className: 'hero-title', text: movie?.name || 'ThinFilm' }),
    createElement('p', {
      className: 'hero-sub',
      text: movie?.originName || movie?.episodeCurrent || 'Kho phim cáº­p nháº­t liÃªn tá»¥c'
    }),
    createElement('p', {
      className: 'hero-desc',
      text: movie?.content || 'KhÃ¡m phÃ¡ cÃ¡c bá»™ phim má»›i vÃ  danh sÃ¡ch ná»™i dung ná»•i báº­t.'
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
    createElement('span', { text: 'Chi tiáº¿t' })
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
        ctx.toast(added ? 'ÄÃ£ thÃªm vÃ o yÃªu thÃ­ch' : 'ÄÃ£ bá» khá»i yÃªu thÃ­ch');
        card.querySelector('.fav-btn')?.classList.toggle('on', added);
      }
    });
    grid.appendChild(card);
  });
}

function renderContinueRow(ctx) {
  const items = ContinueWatchingStorage.list();
  if (!items.length) return null;

  const section = createRowSection(UI_TEXT.continueWatching, 'Tiáº¿p tá»¥c tá»« thá»i Ä‘iá»ƒm báº¡n Ä‘ang xem gáº§n nháº¥t');
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

  const section = createRowSection(UI_TEXT.history, 'Lá»‹ch sá»­ xem gáº§n Ä‘Ã¢y', {
    actionLabel: 'XÃ³a lá»‹ch sá»­',
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
      { result: latestResult, key: 'latest', subtitle: 'CÃ¡c tá»±a phim vá»«a Ä‘Æ°á»£c cáº­p nháº­t' },
      { result: seriesResult, key: 'phim-bo', subtitle: 'Theo dÃµi táº­p má»›i nháº¥t má»—i ngÃ y' },
      { result: movieResult, key: 'phim-le', subtitle: 'Phim láº» háº¥p dáº«n chá»n lá»c' },
      { result: animeResult, key: 'hoat-hinh', subtitle: 'Kho anime vÃ  hoáº¡t hÃ¬nh ná»•i báº­t' },
      { result: tvResult, key: 'tv-shows', subtitle: 'ChÆ°Æ¡ng trÃ¬nh truyá»n hÃ¬nh thá»‹nh hÃ nh' }
    ];

    map.forEach((item) => {
      const section = createRowSection(
        CATEGORY_LABELS[item.key] || item.key,
        item.subtitle,
        item.key !== 'latest'
          ? {
              actionLabel: 'Xem táº¥t cáº£',
              onAction: () => ctx.navigate(ROUTES.SEARCH, { q: `category:${item.key}` })
            }
          : undefined
      );
      const grid = createElement('div', { className: 'section-grid' });
      section.appendChild(grid);

      if (item.result.status === 'fulfilled') {
        fillCards(grid, item.result.value.items, ctx);
      } else {
        grid.appendChild(createErrorState('KhÃ´ng thá»ƒ táº£i danh sÃ¡ch nÃ y. Báº¡n cÃ³ thá»ƒ thá»­ láº¡i sau.'));
      }

      sectionsWrap.appendChild(section);
    });

    return {
      node,
      cleanup: () => requestManager.cancel('home'),
      title: 'Trang chá»§'
    };
  } catch (error) {
    rowsContainer.innerHTML = '';
    rowsContainer.appendChild(createErrorState(UI_TEXT.networkError, [
      { label: 'Thá»­ láº¡i', onClick: () => ctx.navigate(ROUTES.HOME, {}, { replace: true }) }
    ]));

    return {
      node,
      cleanup: () => requestManager.cancel('home'),
      title: 'Trang chá»§'
    };
  }
}

