import { BasePage } from './router.js';
import { ROUTES, UI_TEXT } from './config.js';
import { fetchMovieDetail, fetchTmdbMeta, requestManager } from './api.js';
import {
  createElement,
  createErrorState,
  createLoaderState,
  toast
} from './dom.js';
import { FavoritesStorage, HistoryStorage } from './storage.js';

function safeOpen(url = '') {
  const target = String(url || '').trim();
  if (!target) return false;
  window.open(target, '_blank', 'noopener,noreferrer');
  return true;
}

export class DetailPage extends BasePage {
  constructor() {
    super(ROUTES.DETAIL);
    this.abortController = null;
    this.movieSlug = '';
  }

  async render(params = {}) {
    this.movieSlug = String(params.slug || '').trim();

    const page = createElement('section', { className: 'detail-page' });
    if (!this.movieSlug) {
      page.appendChild(createErrorState('Thi?u mã phim.'));
      return page;
    }

    page.appendChild(createLoaderState(UI_TEXT.loading));
    this.abortController = requestManager.next('detail');

    try {
      const detail = await fetchMovieDetail(this.movieSlug, { signal: this.abortController.signal });
      if (this.abortController.signal.aborted) return page;

      const movie = detail?.movie;
      if (!movie?.slug) {
        page.innerHTML = '';
        page.appendChild(createErrorState('Không tìm th?y thông tin phim.'));
        return page;
      }

      let tmdb = null;
      try {
        tmdb = await fetchTmdbMeta(movie.name || movie.originName || '', movie.year, {
          signal: this.abortController.signal
        });
      } catch (_) {
        tmdb = null;
      }

      page.innerHTML = '';
      page.appendChild(this.createHero(movie, tmdb));
      page.appendChild(this.createEpisodes(detail?.episodes || [], movie));
      page.appendChild(this.createDescription(movie, tmdb));

      this.setTitle(movie.name || 'Chi ti?t phim');
      return page;
    } catch (_) {
      page.innerHTML = '';
      page.appendChild(createErrorState(UI_TEXT.networkError, [
        {
          label: UI_TEXT.retry,
          onClick: () => window.location.reload()
        }
      ]));
      return page;
    }
  }

  createHero(movie, tmdb) {
    const isFavorite = FavoritesStorage.isFavorite(movie.slug);

    const hero = createElement('section', {
      className: 'detail-hero',
      style: movie.poster ? { backgroundImage: `url('${movie.poster}')` } : {}
    });

    const overlay = createElement('div', { className: 'detail-hero-overlay' });
    const body = createElement('div', { className: 'detail-hero-content' });

    const posterWrap = createElement('div', { className: 'detail-poster-container' }, [
      createElement('div', { className: 'detail-poster' }, [
        createElement('img', {
          src: movie.poster || movie.thumb,
          alt: movie.name || 'Poster phim',
          loading: 'lazy'
        })
      ])
    ]);

    const info = createElement('div', { className: 'detail-hero-info' });
    info.appendChild(createElement('h1', { className: 'detail-title', text: movie.name || 'Không rõ tên' }));

    if (movie.originName && movie.originName !== movie.name) {
      info.appendChild(createElement('div', {
        className: 'detail-original-title',
        text: movie.originName
      }));
    }

    const metaRow = createElement('div', { className: 'detail-meta' });
    const tags = [movie.year, movie.quality || movie.episodeCurrent || '', movie.time || ''].filter(Boolean);
    tags.forEach((tag, index) => {
      if (index > 0) metaRow.appendChild(createElement('span', { className: 'detail-separator', text: '•' }));
      metaRow.appendChild(createElement('span', { text: String(tag) }));
    });
    info.appendChild(metaRow);

    if (Array.isArray(movie.categories) && movie.categories.length > 0) {
      const categories = createElement('div', { className: 'detail-categories' });
      movie.categories.slice(0, 5).forEach((cat) => {
        categories.appendChild(createElement('span', {
          className: 'detail-category',
          text: cat.name || cat.slug || ''
        }));
      });
      info.appendChild(categories);
    }

    const actions = createElement('div', { className: 'detail-actions' });

    const favoriteBtn = createElement('button', {
      type: 'button',
      className: `btn btn-outline btn-large ${isFavorite ? 'favorited' : ''}`,
      text: isFavorite ? 'Ðã thích' : 'Thêm yêu thích'
    });

    favoriteBtn.addEventListener('click', () => {
      const added = FavoritesStorage.toggle(movie);
      favoriteBtn.classList.toggle('favorited', added);
      favoriteBtn.textContent = added ? 'Ðã thích' : 'Thêm yêu thích';
      toast(added ? 'Ðã thêm vào yêu thích' : 'Ðã b? kh?i yêu thích');
    });

    actions.appendChild(favoriteBtn);
    info.appendChild(actions);

    if (tmdb?.overview && tmdb.overview !== movie.content) {
      info.appendChild(createElement('p', {
        className: 'hero-desc',
        text: tmdb.overview
      }));
    }

    body.appendChild(posterWrap);
    body.appendChild(info);
    hero.appendChild(overlay);
    hero.appendChild(body);

    return hero;
  }

  createEpisodes(episodes = [], movie) {
    const section = createElement('section', { className: 'detail-content detail-section' });
    section.appendChild(createElement('h2', { className: 'detail-section-title', text: 'Danh sách t?p' }));

    if (!Array.isArray(episodes) || episodes.length === 0) {
      section.appendChild(createElement('p', {
        className: 'detail-description',
        text: 'Phim này chua có t?p phát sóng.'
      }));
      return section;
    }

    const container = createElement('div', { className: 'detail-episodes' });

    episodes.forEach((server) => {
      const block = createElement('div', { className: 'episode-server' });
      block.appendChild(createElement('h3', {
        className: 'episode-server-name',
        text: server?.name || 'Server'
      }));

      const list = createElement('div', { className: 'episode-list' });
      const items = Array.isArray(server?.items) ? server.items : [];

      items.forEach((episode, index) => {
        const btn = createElement('button', {
          type: 'button',
          className: 'episode-btn',
          text: episode?.name || `T?p ${index + 1}`
        });

        btn.addEventListener('click', () => {
          HistoryStorage.upsert({
            movieSlug: movie.slug,
            epSlug: episode?.slug || `tap-${index + 1}`,
            serverName: server?.name || 'Server',
            movieName: movie.name,
            episodeName: episode?.name || `T?p ${index + 1}`,
            poster: movie.poster || movie.thumb,
            progressSeconds: 0,
            durationSeconds: 0
          });

          const opened = safeOpen(episode?.linkM3u8 || episode?.linkEmbed || '');
          if (!opened) {
            toast('T?p này chua có link phát.');
          }
        });

        list.appendChild(btn);
      });

      block.appendChild(list);
      container.appendChild(block);
    });

    section.appendChild(container);
    return section;
  }

  createDescription(movie, tmdb) {
    const section = createElement('section', { className: 'detail-content detail-section' });
    section.appendChild(createElement('h2', { className: 'detail-section-title', text: 'N?i dung' }));

    section.appendChild(createElement('div', {
      className: 'detail-description',
      text: movie.content || tmdb?.overview || 'Ðang c?p nh?t n?i dung.'
    }));

    return section;
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
