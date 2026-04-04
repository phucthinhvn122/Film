import { BasePage, router } from './router.js';
import { ROUTES, UI_TEXT } from './config.js';
import { fetchMovieDetail, requestManager } from './api.js';
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

export class DetailPage extends BasePage {
  constructor() {
    super(ROUTES.DETAIL);
    this.abortController = null;
  }

  async render(params = {}) {
    const slug = String(params.slug || '').trim();
    const page = createElement('section', { className: 'detail-page' });

    if (!slug) {
      page.appendChild(createErrorState('Thieu ma phim.'));
      return page;
    }

    page.appendChild(createLoaderState(UI_TEXT.loading));
    this.abortController = requestManager.next('detail');

    try {
      const detail = await fetchMovieDetail(slug, { signal: this.abortController.signal });
      if (this.abortController.signal.aborted) return page;

      const movie = detail?.movie;
      if (!movie?.slug) {
        page.innerHTML = '';
        page.appendChild(createErrorState('Khong tim thay thong tin phim.'));
        return page;
      }

      page.innerHTML = '';
      page.appendChild(this.buildLayout(movie, detail.episodes || []));
      this.setTitle(movie.name || 'Chi tiet phim');
      return page;
    } catch (_) {
      page.innerHTML = '';
      page.appendChild(createErrorState(UI_TEXT.networkError, [
        { label: UI_TEXT.retry, onClick: () => window.location.reload() }
      ]));
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
    info.appendChild(createElement('h1', { text: movie.name || 'Khong ro ten' }));

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
      text: stripHtml(movie.content || '') || 'Dang cap nhat noi dung.'
    });
    info.appendChild(desc);

    const actionRow = createElement('div', { className: 'hero-btns detail-actions-row' });
    const favBtn = createElement('button', {
      type: 'button',
      className: 'btn btn-gray',
      text: FavoritesStorage.isFavorite(movie.slug) ? 'Da thich' : 'Them yeu thich'
    });
    favBtn.addEventListener('click', () => {
      const added = FavoritesStorage.toggle(movie);
      favBtn.textContent = added ? 'Da thich' : 'Them yeu thich';
      toast(added ? 'Da them vao yeu thich' : 'Da bo khoi yeu thich');
    });

    const watchBtn = createElement('button', {
      type: 'button',
      className: 'btn btn-orange',
      text: 'Xem ngay'
    });
    watchBtn.addEventListener('click', () => {
      const picked = firstPlayableEpisode(episodes);
      if (!picked) {
        toast('Phim nay chua co nguon phat.');
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
