import { ROUTES, UI_TEXT } from './config.js';
import { fetchMovieDetail, fetchTmdbMeta, getFirstEpisode, requestManager } from './api.js';
import {
  createElement,
  createErrorState,
  createLoaderState,
  lazyImage
} from './dom.js';
import { FavoritesStorage } from './storage.js';

function buildMetaTags(movie, meta) {
  const tags = createElement('div', { className: 'tags' });
  const values = [
    movie.year,
    movie.quality || movie.episodeCurrent,
    movie.lang,
    meta?.imdb ? `IMDb ${meta.imdb}` : '',
    meta?.runtime ? `${meta.runtime} phÃºt` : ''
  ].filter(Boolean);

  values.forEach((text) => {
    tags.appendChild(createElement('span', { className: 'tag', text }));
  });

  return tags;
}

function buildCast(meta) {
  if (!meta?.cast?.length) return null;
  const wrap = createElement('div');
  wrap.appendChild(createElement('div', { className: 'meta-row', text: 'Diá»…n viÃªn ná»•i báº­t' }));

  const row = createElement('div', { className: 'cast-strip' });
  meta.cast.slice(0, 8).forEach((actor) => {
    const card = createElement('div', { className: 'cast-item' });
    const avatar = lazyImage(actor.avatar, actor.name, '');
    avatar.width = 56;
    avatar.height = 56;
    card.appendChild(avatar);
    card.appendChild(createElement('div', { className: 'cast-name', text: actor.name }));
    if (actor.character) {
      card.appendChild(createElement('div', { className: 'cast-role', text: actor.character }));
    }
    row.appendChild(card);
  });

  wrap.appendChild(row);
  return wrap;
}

function buildEpisodePreview(detail, onWatch) {
  const first = getFirstEpisode(detail.episodes);
  if (!first) {
    return createElement('div', { className: 'meta-row', text: 'Hiá»‡n chÆ°a cÃ³ táº­p phim kháº£ dá»¥ng.' });
  }

  const actionRow = createElement('div', {
    style: { display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '8px' }
  });

  const watchFirstButton = createElement('button', {
    type: 'button',
    className: 'play-btn-big'
  }, [
    createElement('i', { class: 'fa-solid fa-play', 'aria-hidden': 'true' }),
    createElement('span', { text: 'PhÃ¡t táº­p Ä‘áº§u' })
  ]);
  watchFirstButton.addEventListener('click', () => {
    onWatch(first.episode.slug, first.serverName);
  });
  actionRow.appendChild(watchFirstButton);

  return actionRow;
}

export async function renderDetailPage(ctx, params = {}) {
  const slug = String(params.slug || '').trim();
  const controller = requestManager.next('detail');
  const page = createElement('section', { className: 'detail-page' });

  if (!slug) {
    page.appendChild(createErrorState('KhÃ´ng tÃ¬m tháº¥y mÃ£ phim há»£p lá»‡.', [
      { label: 'Vá» trang chá»§', onClick: () => ctx.navigate(ROUTES.HOME) }
    ]));
    return { node: page, cleanup: () => requestManager.cancel('detail'), title: UI_TEXT.detail };
  }

  const loadingWrap = createElement('div', { className: 'detail-wrap' }, [createLoaderState(UI_TEXT.loading)]);
  page.appendChild(loadingWrap);

  try {
    const detail = await fetchMovieDetail(slug, { signal: controller.signal });
    const movie = detail.movie;
    const tmdb = await fetchTmdbMeta(movie.name || movie.originName, movie.year, { signal: controller.signal });

    if (controller.signal.aborted) {
      return { node: page, cleanup: () => requestManager.cancel('detail') };
    }

    loadingWrap.innerHTML = '';
    const poster = lazyImage(tmdb?.poster || movie.poster || movie.thumb, movie.name, 'detail-poster');
    loadingWrap.appendChild(poster);

    const info = createElement('div', { className: 'detail-info' });
    info.appendChild(createElement('h1', { text: movie.name || 'KhÃ´ng rÃµ tÃªn phim' }));
    if (movie.originName) {
      info.appendChild(createElement('div', { className: 'detail-origin', text: movie.originName }));
    }

    info.appendChild(buildMetaTags(movie, tmdb));

    const favButton = createElement('button', {
      type: 'button',
      className: 'section-more',
      text: FavoritesStorage.isFavorite(movie.slug) ? 'Bá» yÃªu thÃ­ch' : 'ThÃªm yÃªu thÃ­ch'
    });
    favButton.addEventListener('click', () => {
      const added = FavoritesStorage.toggle({
        slug: movie.slug,
        name: movie.name,
        year: movie.year,
        quality: movie.quality,
        thumb: movie.thumb,
        poster: movie.poster
      });
      favButton.textContent = added ? 'Bá» yÃªu thÃ­ch' : 'ThÃªm yÃªu thÃ­ch';
      ctx.toast(added ? 'ÄÃ£ thÃªm vÃ o yÃªu thÃ­ch' : 'ÄÃ£ bá» khá»i yÃªu thÃ­ch');
    });
    info.appendChild(favButton);

    info.appendChild(createElement('p', {
      className: 'detail-desc',
      text: movie.content || tmdb?.overview || 'ChÆ°a cÃ³ mÃ´ táº£ cho phim nÃ y.'
    }));

    info.appendChild(createElement('div', {
      className: 'meta-row',
      text: `Thá»ƒ loáº¡i: ${(tmdb?.genres?.length ? tmdb.genres : movie.categories.map((c) => c.name)).join(', ') || 'Äang cáº­p nháº­t'}`
    }));

    const cast = buildCast(tmdb);
    if (cast) info.appendChild(cast);

    info.appendChild(buildEpisodePreview(detail, (epSlug, serverName) => {
      ctx.navigate(ROUTES.WATCH, { slug: movie.slug, ep: epSlug, server: serverName });
    }));

    loadingWrap.appendChild(info);

    return {
      node: page,
      cleanup: () => requestManager.cancel('detail'),
      title: movie.name || UI_TEXT.detail
    };
  } catch (error) {
    loadingWrap.innerHTML = '';
    loadingWrap.appendChild(createErrorState('KhÃ´ng thá»ƒ táº£i trang chi tiáº¿t phim.', [
      { label: UI_TEXT.retry, onClick: () => ctx.navigate(ROUTES.DETAIL, { slug }, { replace: true }) },
      { label: 'Vá» trang chá»§', onClick: () => ctx.navigate(ROUTES.HOME) }
    ]));

    return {
      node: page,
      cleanup: () => requestManager.cancel('detail'),
      title: UI_TEXT.detail
    };
  }
}

