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

const HERO_MAX_ITEMS = 5;
const HERO_ROTATE_MS = 6500;

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

function createSectionWithLoader(title, subtitle, options = {}) {
  const section = createRowSection(title, subtitle, options);
  const grid = createElement('div', { className: 'section-grid section-grid-loading' }, [
    createLoaderState(UI_TEXT.loading)
  ]);
  section.appendChild(grid);
  return { section, grid };
}

function createHeroCarousel(onOpen) {
  const state = {
    items: [],
    index: 0,
    paused: false,
    timer: null
  };

  const hero = createElement('section', { className: 'hero hero-empty' });
  const badge = createElement('span', { className: 'hero-badge', text: 'Netflix' });
  const title = createElement('h1', { className: 'hero-title', text: 'Netflix' });
  const sub = createElement('p', { className: 'hero-sub', text: 'Kho phim cap nhat lien tuc.' });
  const desc = createElement('p', {
    className: 'hero-desc',
    text: 'Giao dien don gian, tai nhanh, tap trung vao danh sach phim moi va lich su xem.'
  });
  const facts = createElement('div', { className: 'hero-facts' });
  const dots = createElement('div', { className: 'hero-dots' });
  const counter = createElement('span', { className: 'hero-counter' });

  const watchBtn = createElement('button', {
    type: 'button',
    className: 'btn btn-orange'
  }, [
    createElement('i', { class: 'fa-solid fa-play', 'aria-hidden': 'true' }),
    createElement('span', { text: 'Xem chi tiet' })
  ]);
  const detailBtn = createElement('button', {
    type: 'button',
    className: 'btn btn-gray'
  }, [
    createElement('i', { class: 'fa-solid fa-circle-info', 'aria-hidden': 'true' }),
    createElement('span', { text: 'Thong tin' })
  ]);

  const prevBtn = createElement('button', {
    type: 'button',
    className: 'hero-nav-btn',
    'aria-label': 'Banner truoc'
  }, [createElement('i', { class: 'fa-solid fa-chevron-left', 'aria-hidden': 'true' })]);
  const nextBtn = createElement('button', {
    type: 'button',
    className: 'hero-nav-btn',
    'aria-label': 'Banner tiep theo'
  }, [createElement('i', { class: 'fa-solid fa-chevron-right', 'aria-hidden': 'true' })]);

  const body = createElement('div', { className: 'hero-body' }, [
    badge,
    title,
    sub,
    desc,
    facts,
    createElement('div', { className: 'hero-btns' }, [watchBtn, detailBtn]),
    createElement('div', { className: 'hero-bottom' }, [
      dots,
      counter
    ])
  ]);

  const nav = createElement('div', { className: 'hero-nav' }, [prevBtn, nextBtn]);
  hero.appendChild(body);
  hero.appendChild(nav);

  const clearTimer = () => {
    if (!state.timer) return;
    clearInterval(state.timer);
    state.timer = null;
  };

  const updateFacts = (movie) => {
    facts.innerHTML = '';
    const values = [movie?.year, movie?.quality || movie?.episodeCurrent, movie?.lang || movie?.country]
      .filter(Boolean)
      .slice(0, 3);

    const fragment = document.createDocumentFragment();
    values.forEach((value) => {
      fragment.appendChild(createElement('span', { className: 'hero-fact', text: String(value) }));
    });
    facts.appendChild(fragment);
  };

  const renderDots = () => {
    dots.innerHTML = '';
    const fragment = document.createDocumentFragment();

    state.items.forEach((movie, index) => {
      const dot = createElement('button', {
        type: 'button',
        className: `hero-dot${index === state.index ? ' active' : ''}`,
        'aria-label': `Mo banner ${index + 1}: ${movie.name || 'Phim'}`
      });
      dot.addEventListener('click', () => {
        state.index = index;
        render();
        startTimer();
      });
      fragment.appendChild(dot);
    });

    dots.appendChild(fragment);
  };

  const render = () => {
    const movie = state.items[state.index] || null;
    const poster = movie?.poster || movie?.thumb || '';

    hero.classList.toggle('hero-empty', !movie);
    hero.style.backgroundImage = poster ? `url('${poster}')` : '';

    badge.textContent = movie?.quality || 'Netflix';
    title.textContent = movie?.name || 'Netflix';
    sub.textContent = movie?.originName || movie?.episodeCurrent || 'Kho phim cap nhat lien tuc.';
    desc.textContent = movie?.content || 'Giao dien don gian, tap trung vao nhung noi dung dang duoc xem nhieu.';
    counter.textContent = state.items.length > 1 ? `${state.index + 1}/${state.items.length}` : '';
    prevBtn.disabled = state.items.length < 2;
    nextBtn.disabled = state.items.length < 2;
    watchBtn.disabled = !movie?.slug;
    detailBtn.disabled = !movie?.slug;

    updateFacts(movie);
    renderDots();
  };

  const startTimer = () => {
    clearTimer();
    if (state.paused || state.items.length < 2) return;
    state.timer = setInterval(() => {
      state.index = (state.index + 1) % state.items.length;
      render();
    }, HERO_ROTATE_MS);
  };

  const openCurrentMovie = () => {
    const movie = state.items[state.index];
    if (movie?.slug) onOpen(movie.slug);
  };

  prevBtn.addEventListener('click', () => {
    if (state.items.length < 2) return;
    state.index = (state.index - 1 + state.items.length) % state.items.length;
    render();
    startTimer();
  });

  nextBtn.addEventListener('click', () => {
    if (state.items.length < 2) return;
    state.index = (state.index + 1) % state.items.length;
    render();
    startTimer();
  });

  watchBtn.addEventListener('click', openCurrentMovie);
  detailBtn.addEventListener('click', openCurrentMovie);

  hero.addEventListener('mouseenter', () => {
    state.paused = true;
    clearTimer();
  });
  hero.addEventListener('mouseleave', () => {
    state.paused = false;
    startTimer();
  });
  hero.addEventListener('focusin', () => {
    state.paused = true;
    clearTimer();
  });
  hero.addEventListener('focusout', () => {
    state.paused = false;
    startTimer();
  });

  render();

  return {
    element: hero,
    setItems(items = []) {
      state.items = items
        .filter((movie) => movie && movie.slug)
        .slice(0, HERO_MAX_ITEMS);
      state.index = 0;
      render();
      startTimer();
    },
    cleanup() {
      clearTimer();
    }
  };
}

function fillCards(grid, movies, ctx) {
  grid.innerHTML = '';
  if (!movies.length) {
    grid.appendChild(createEmptyState(UI_TEXT.noData));
    return;
  }

  const favoriteSlugs = new Set(FavoritesStorage.list().map((item) => item.slug));
  const fragment = document.createDocumentFragment();
  movies.slice(0, DEFAULT_PAGE_SIZE).forEach((movie) => {
    const card = createMovieCard(movie, {
      isFavorite: favoriteSlugs.has(movie.slug),
      onOpen: (pickedMovie) => ctx.navigate(ROUTES.DETAIL, { slug: pickedMovie.slug }),
      onFavoriteToggle: () => {
        const added = FavoritesStorage.toggle(movie);
        if (added) favoriteSlugs.add(movie.slug);
        else favoriteSlugs.delete(movie.slug);
        ctx.toast(added ? 'Da them vao yeu thich' : 'Da bo khoi yeu thich');
        card.querySelector('.fav-btn')?.classList.toggle('on', added);
      }
    });
    fragment.appendChild(card);
  });

  grid.appendChild(fragment);
}

function renderContinueRow(ctx) {
  const items = ContinueWatchingStorage.list();
  if (!items.length) return null;

  const section = createRowSection(UI_TEXT.continueWatching, 'Mo lai nhanh bo phim dang xem do.');
  const row = createElement('div', { className: 'movie-row movie-row-history' });
  const fragment = document.createDocumentFragment();

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
      onOpen: () => ctx.navigate(ROUTES.DETAIL, { slug: item.movieSlug })
    });
    fragment.appendChild(card);
  });

  row.appendChild(fragment);
  section.appendChild(row);
  return section;
}

function renderHistoryRow(ctx) {
  const items = HistoryStorage.list().slice(0, 12);
  if (!items.length) return null;

  const section = createRowSection(UI_TEXT.history, 'Danh sach phim da xem gan day.', {
    actionLabel: 'Xoa lich su',
    onAction: () => {
      HistoryStorage.clear();
      ctx.navigate(ROUTES.HOME, {}, { replace: true });
    }
  });

  const row = createElement('div', { className: 'movie-row movie-row-history' });
  const fragment = document.createDocumentFragment();

  items.forEach((item) => {
    const card = createMovieCard({
      slug: item.movieSlug,
      name: item.movieName || 'Phim',
      quality: item.serverName || '',
      episodeCurrent: item.episodeName || '',
      thumb: item.poster,
      poster: item.poster
    }, {
      onOpen: () => ctx.navigate(ROUTES.DETAIL, { slug: item.movieSlug })
    });
    fragment.appendChild(card);
  });

  row.appendChild(fragment);
  section.appendChild(row);
  return section;
}

function buildCategoryDescriptors(ctx) {
  return [
    {
      key: 'phim-bo',
      title: CATEGORY_LABELS['phim-bo'] || 'Phim bo',
      subtitle: 'Cap nhat series moi.',
      options: {
        actionLabel: 'Xem tat ca',
        onAction: () => ctx.navigate(ROUTES.SEARCH, { q: 'category:phim-bo' })
      }
    },
    {
      key: 'phim-le',
      title: CATEGORY_LABELS['phim-le'] || 'Phim le',
      subtitle: 'Danh sach phim le noi bat.',
      options: {
        actionLabel: 'Xem tat ca',
        onAction: () => ctx.navigate(ROUTES.SEARCH, { q: 'category:phim-le' })
      }
    },
    {
      key: 'hoat-hinh',
      title: CATEGORY_LABELS['hoat-hinh'] || 'Hoat hinh',
      subtitle: 'Anime va hoat hinh dang duoc xem nhieu.',
      options: {
        actionLabel: 'Xem tat ca',
        onAction: () => ctx.navigate(ROUTES.SEARCH, { q: 'category:hoat-hinh' })
      }
    },
    {
      key: 'tv-shows',
      title: CATEGORY_LABELS['tv-shows'] || 'TV Show',
      subtitle: 'Chuong trinh va show dang thinh hanh.',
      options: {
        actionLabel: 'Xem tat ca',
        onAction: () => ctx.navigate(ROUTES.SEARCH, { q: 'category:tv-shows' })
      }
    }
  ];
}

export async function renderHomePage(ctx) {
  const controller = requestManager.next('home');
  const hero = createHeroCarousel((slug) => ctx.navigate(ROUTES.DETAIL, { slug }));
  const node = createElement('div');
  const rowsContainer = createElement('div', { className: 'rows-section' }, [createLoaderState(UI_TEXT.loading)]);
  const cleanup = () => {
    hero.cleanup();
    requestManager.cancel('home');
  };

  node.appendChild(hero.element);
  node.appendChild(rowsContainer);

  const categoryDescriptors = buildCategoryDescriptors(ctx);
  const categoryPromises = categoryDescriptors.map((item) => (
    fetchCategory(item.key, 1, { signal: controller.signal })
  ));

  try {
    const latestResultData = await fetchHomeLatest(1, { signal: controller.signal }).catch(() => ({ error: true }));

    if (controller.signal.aborted) {
      return { node, cleanup };
    }

    const sectionsWrap = createElement('div', { className: 'home-sections' });
    rowsContainer.innerHTML = '';
    rowsContainer.appendChild(sectionsWrap);

    const latestSectionRef = createSectionWithLoader(
      CATEGORY_LABELS.latest || 'Moi cap nhat',
      'Danh sach phim moi duoc cap nhat.'
    );
    const categorySectionRefs = categoryDescriptors.map((item) => ({
      ...item,
      ...createSectionWithLoader(item.title, item.subtitle, item.options)
    }));

    const continueRow = renderContinueRow(ctx);
    if (continueRow) sectionsWrap.appendChild(continueRow);

    const historyRow = renderHistoryRow(ctx);
    if (historyRow) sectionsWrap.appendChild(historyRow);

    sectionsWrap.appendChild(latestSectionRef.section);
    categorySectionRefs.forEach((item) => sectionsWrap.appendChild(item.section));

    const latestItems = !latestResultData.error ? latestResultData.items : [];
    hero.setItems(latestItems);

    if (!latestResultData.error) {
      fillCards(latestSectionRef.grid, latestItems, ctx);
    } else {
      latestSectionRef.grid.innerHTML = '';
      latestSectionRef.grid.appendChild(createErrorState('Khong the tai danh sach phim moi.'));
    }

    Promise.allSettled(categoryPromises).then((results) => {
      if (controller.signal.aborted) return;

      results.forEach((result, index) => {
        const ref = categorySectionRefs[index];
        ref.grid.innerHTML = '';

        if (result.status === 'fulfilled') {
          fillCards(ref.grid, result.value.items, ctx);
          return;
        }

        ref.grid.appendChild(createErrorState('Khong the tai danh sach nay.'));
      });
    });

    return {
      node,
      cleanup,
      title: 'Trang chu'
    };
  } catch (_) {
    rowsContainer.innerHTML = '';
    rowsContainer.appendChild(createErrorState(UI_TEXT.networkError, [
      { label: UI_TEXT.retry, onClick: () => ctx.navigate(ROUTES.HOME, {}, { replace: true }) }
    ]));

    return {
      node,
      cleanup,
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
            label: UI_TEXT.retry,
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
