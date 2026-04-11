import { BasePage, router } from './router.js';
import { ROUTES, UI_TEXT } from './config.js';
import { fetchMovieDetail, requestManager, searchMovies } from './api.js';
import {
  createElement,
  createErrorState,
  createLoaderState,
  stripHtml,
  toast
} from './dom.js';
import { FavoritesStorage, HistoryStorage } from './storage.js';

function firstPlayableEpisode(episodes = []) {
  for (const server of episodes) {
    const items = Array.isArray(server?.items) ? server.items : [];
    const ep = items.find((item) => String(item?.linkEmbed || item?.linkM3u8 || '').trim());
    if (ep) return { server, episode: ep };
  }
  return null;
}

function normalizeLookupText(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function pickMovieByTitle(items = [], title = '') {
  const target = normalizeLookupText(title);
  if (!target) return null;

  let best = null;
  let bestScore = -1;

  items.forEach((item) => {
    const names = [item?.name, item?.originName].map(normalizeLookupText).filter(Boolean);
    if (!names.length) return;

    let score = 0;
    if (names.includes(target)) score = 4;
    else if (names.some((name) => name.startsWith(target) || target.startsWith(name))) score = 3;
    else if (names.some((name) => name.includes(target) || target.includes(name))) score = 2;
    else {
      const terms = target.split(/\s+/).filter(Boolean);
      const matchedTerms = terms.filter((term) => names.some((name) => name.includes(term))).length;
      score = matchedTerms > 0 ? 1 + (matchedTerms / Math.max(terms.length, 1)) : 0;
    }

    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  });

  return bestScore > 0 ? best : null;
}

async function fetchDetailWithFallback(slug, fallbackTitle, signal) {
  try {
    return await fetchMovieDetail(slug, { signal });
  } catch (error) {
    const canFallback = Boolean(fallbackTitle) && (error?.message === 'HTTP_404' || error?.message === 'NETWORK_ERROR');
    if (!canFallback) throw error;

    const results = await searchMovies(fallbackTitle, { signal, force: true });
    const matched = pickMovieByTitle(results?.items || [], fallbackTitle);
    if (!matched?.slug) throw error;

    return fetchMovieDetail(matched.slug, { signal, force: true });
  }
}

export class DetailPage extends BasePage {
  constructor() {
    super(ROUTES.DETAIL);
    this.abortController = null;
  }

  async render(params = {}) {
    const slug = String(params.slug || '').trim();
    const fallbackTitle = String(params.fallbackTitle || params.title || '').trim();
    const page = createElement('section', { className: 'detail-page' });

    if (!slug) {
      page.appendChild(createErrorState('Thieu ma phim.'));
      return page;
    }

    page.appendChild(createLoaderState(UI_TEXT.loading));
    this.abortController = requestManager.next('detail');

    try {
      const detail = await fetchDetailWithFallback(slug, fallbackTitle, this.abortController.signal);
      if (this.abortController.signal.aborted) return page;

      const movie = detail?.movie;
      if (!movie?.slug) {
        page.innerHTML = '';
        page.appendChild(createErrorState('Không tìm thấy thông tin phim.'));
        return page;
      }

      page.innerHTML = '';
      page.appendChild(this.buildLayout(movie, detail.episodes || []));
      this.setTitle(movie.name || 'Chi tiết phim');
      return page;
    } catch (error) {
      console.error('DetailPage render failed:', { slug, error });
      page.innerHTML = '';
      page.appendChild(createErrorState(
        error?.message === 'HTTP_404'
          ? 'Khong tim thay phim nay.'
          : UI_TEXT.networkError,
        [
          { label: UI_TEXT.retry, onClick: () => router.navigate(ROUTES.DETAIL, { slug }, true) }
        ]
      ));
      return page;
    }
  }

  buildLayout(movie, episodes = []) {
    const wrap = createElement('div', { className: 'detail-wrap' });

    const poster = createElement('img', {
      className: 'detail-poster',
      src: movie.poster || movie.thumb,
      alt: movie.name || 'Poster phim',
      loading: 'lazy'
    });

    const info = createElement('div', { className: 'detail-info' });
    info.appendChild(createElement('h1', { text: movie.name || 'Không rõ tên' }));

    if (movie.originName && movie.originName !== movie.name) {
      info.appendChild(createElement('div', { className: 'detail-origin', text: movie.originName }));
    }

    const tags = createElement('div', { className: 'tags' });
    [movie.year, movie.quality || movie.episodeCurrent, movie.time, movie.lang]
      .filter(Boolean)
      .forEach((tag) => tags.appendChild(createElement('span', { className: 'tag', text: String(tag) })));
    if (tags.childNodes.length) info.appendChild(tags);

    const desc = createElement('p', {
      className: 'detail-desc',
      text: stripHtml(movie.content || '') || 'Đang cập nhật nội dung.'
    });
    info.appendChild(desc);

    const actionRow = createElement('div', { className: 'hero-btns detail-actions-row' });
    const favBtn = createElement('button', {
      type: 'button',
      className: 'btn btn-gray',
      text: FavoritesStorage.isFavorite(movie.slug) ? 'Đã thích' : 'Thêm yêu thích'
    });
    favBtn.addEventListener('click', () => {
      const added = FavoritesStorage.toggle(movie);
      favBtn.textContent = added ? 'Đã thích' : 'Thêm yêu thích';
      toast(added ? 'Đã thêm vào yêu thích' : 'Đã bỏ khỏi yêu thích');
    });

    const watchBtn = createElement('button', {
      type: 'button',
      className: 'btn btn-orange',
      text: 'Xem ngay'
    });
    watchBtn.addEventListener('click', () => {
      const picked = firstPlayableEpisode(episodes);
      if (!picked) {
        const rawStatus = String(movie?.status || movie?.raw?.status || '').toLowerCase();
        if (rawStatus === 'trailer') {
          toast('Phim này mới có trailer, chưa có tập phim để phát.');
        } else {
          toast('Phim này hiện chưa có nguồn phát.');
        }
        return;
      }

      const ep = picked.episode;
      const serverName = picked.server?.name || 'Server';
      const epSlug = ep.slug || 'tap-1';

      HistoryStorage.upsert({
        movieSlug: movie.slug,
        epSlug,
        serverName,
        movieName: movie.name,
        episodeName: ep.name || 'Tap 1',
        poster: movie.poster || movie.thumb,
        progressSeconds: 0,
        durationSeconds: 0
      });

      router.navigate(ROUTES.WATCH, { slug: movie.slug, epSlug, server: serverName });
    });

    actionRow.appendChild(watchBtn);
    actionRow.appendChild(favBtn);

    const actionsBlock = createElement('div', { className: 'detail-block detail-actions-block' });
    actionsBlock.appendChild(actionRow);
    info.appendChild(actionsBlock);

    if (Array.isArray(movie.categories) && movie.categories.length > 0) {
      const catWrap = createElement('div', { className: 'category-chips detail-categories-row' });
      movie.categories.slice(0, 8).forEach((cat) => {
        catWrap.appendChild(createElement('span', {
          className: 'category-chip',
          text: cat.name || cat.slug || ''
        }));
      });

      const categoriesBlock = createElement('div', { className: 'detail-block detail-categories-block' });
      categoriesBlock.appendChild(catWrap);
      info.appendChild(categoriesBlock);
    }

    wrap.appendChild(poster);
    wrap.appendChild(info);
    return wrap;
  }

  onMounted() {
    this.updateActiveTab('home');
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

export default DetailPage;
