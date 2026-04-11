import { CATEGORY_LABELS, DEFAULT_PAGE_SIZE, ROUTES, UI_TEXT } from './config.js';
import { requestManager, fetchHomeLatest, fetchCategory } from './api.js';
import { BasePage, router } from './router.js';
import {
  createElement,
  createMovieCard,
  createErrorState,
  createLoaderState,
  createEmptyState,
  toast,
  createHeroCarousel
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
        ctx.toast(added ? 'Đã thêm vào yêu thích' : 'Đã bỏ khỏi yêu thích');
        card.querySelector('.fav-btn')?.classList.toggle('on', added);
      }
    });
    grid.appendChild(card);
  });
}

function renderContinueRow(ctx) {
  const items = ContinueWatchingStorage.list();
  if (!items.length) return null;

  const section = createRowSection(UI_TEXT.continueWatching, 'Tiếp tục từ thời điểm bạn đang xem gần nhất');
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
      onOpen: () => ctx.navigate(ROUTES.DETAIL, { slug: item.movieSlug })
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
      onOpen: () => ctx.navigate(ROUTES.DETAIL, { slug: item.movieSlug })
    });
    row.appendChild(card);
  });

  section.appendChild(row);
  return section;
}

export async function renderHomePage(ctx) {
  const controller = requestManager.next('home');
  const heroCarousel = createHeroCarousel((slug) => ctx.navigate(ROUTES.DETAIL, { slug }));
  const node = createElement('div');
  const rowsContainer = createElement('div', { className: 'rows-section' }, [createLoaderState(UI_TEXT.loading)]);

  node.appendChild(heroCarousel.element);
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
    heroCarousel.setItems(latestItems);

    const continueRow = renderContinueRow(ctx);
    if (continueRow) sectionsWrap.appendChild(continueRow);

    const historyRow = renderHistoryRow(ctx);
    if (historyRow) sectionsWrap.appendChild(historyRow);

    const map = [
      { result: latestResult, key: 'latest', subtitle: 'Các tựa phim vừa được cập nhật' },
      { result: seriesResult, key: 'phim-bo', subtitle: 'Theo dõi tập mới nhất mỗi ngày' },
      { result: movieResult, key: 'phim-le', subtitle: 'Phim lẻ hấp dẫn chọn lọc' },
      { result: animeResult, key: 'hoat-hinh', subtitle: 'Kho anime và hoạt hình nổi bật' },
      { result: tvResult, key: 'tv-shows', subtitle: 'Chương trình truyền hình thịnh hành' }
    ];

    map.forEach((item) => {
      const section = createRowSection(
        CATEGORY_LABELS[item.key] || item.key,
        item.subtitle,
        item.key !== 'latest'
          ? {
            actionLabel: 'Xem tất cả',
            onAction: () => ctx.navigate(ROUTES.SEARCH, { q: `category:${item.key}` })
          }
          : undefined
      );
      const grid = createElement('div', { className: 'section-grid' });
      section.appendChild(grid);

      if (item.result.status === 'fulfilled') {
        fillCards(grid, item.result.value.items, ctx);
      } else {
        grid.appendChild(createErrorState('Không thể tải danh sách này. Bạn có thể thử lại sau.'));
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
      { label: 'Thử lại', onClick: () => ctx.navigate(ROUTES.HOME, {}, { replace: true }) }
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


