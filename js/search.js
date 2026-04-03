import { ROUTES, SEARCH_CONFIG, UI_TEXT } from './config.js';
import { requestManager, searchMovies } from './api.js';
import {
  createElement,
  createMovieCard,
  createEmptyState,
  createErrorState,
  createSkeletonGrid
} from './dom.js';
import { FavoritesStorage, SearchStorage } from './storage.js';

function createSearchHero(query = '') {
  return createElement('div', { className: 'search-hero' }, [
    createElement('div', {}, [
      createElement('h2', { text: query ? `Káº¿t quáº£ cho: ${query}` : 'TÃ¬m kiáº¿m phim' }),
      createElement('div', { className: 'search-meta', text: query ? 'Äang chuáº©n bá»‹ dá»¯ liá»‡u...' : 'Nháº­p tá»« khÃ³a Ä‘á»ƒ tÃ¬m phim' })
    ])
  ]);
}

function renderState(container, state, payload = {}) {
  container.innerHTML = '';

  switch (state) {
    case 'idle':
      container.appendChild(createElement('p', { className: 'search-state-hint', text: 'Nháº­p Ã­t nháº¥t 2 kÃ½ tá»± Ä‘á»ƒ báº¯t Ä‘áº§u tÃ¬m kiáº¿m.' }));
      break;
    case 'loading':
      container.appendChild(createSkeletonGrid(12));
      break;
    case 'error':
      container.appendChild(createErrorState(payload.message || UI_TEXT.networkError, payload.actions || []));
      break;
    case 'no-results':
      container.appendChild(createEmptyState(payload.message || 'KhÃ´ng tÃ¬m tháº¥y káº¿t quáº£ phÃ¹ há»£p.'));
      break;
    default:
      break;
  }
}

function createSuggestions(recent, onPick) {
  if (!recent.length) return null;
  const wrap = createElement('div', { className: 'search-suggestions' });
  recent.forEach((keyword) => {
    const button = createElement('button', {
      type: 'button',
      className: 'suggestion-item',
      text: keyword
    });
    button.addEventListener('click', () => onPick(keyword));
    wrap.appendChild(button);
  });
  return wrap;
}

export async function renderSearchPage(ctx, params = {}) {
  const page = createElement('section', { className: 'search-page' });
  const queryFromRoute = String(params.q || '').trim();
  let debounceTimer = null;
  let lastQuery = queryFromRoute;
  let disposed = false;

  const hero = createSearchHero(queryFromRoute);
  const metaNode = hero.querySelector('.search-meta');
  const inputWrap = createElement('form', { className: 'search-input-wrap' });
  const input = createElement('input', {
    className: 'search-input',
    type: 'text',
    placeholder: 'Nháº­p tÃªn phim hoáº·c thá»ƒ loáº¡i...',
    value: queryFromRoute,
    autocomplete: 'off',
       'aria-label': 'TÃ¬m phim'
  });
  const submit = createElement('button', {
    type: 'submit',
    className: 'top-icon-btn',
       'aria-label': 'TÃ¬m kiáº¿m'
  }, [createElement('i', { class: 'fa-solid fa-magnifying-glass', 'aria-hidden': 'true' })]);

  inputWrap.appendChild(input);
  inputWrap.appendChild(submit);
  page.appendChild(hero);
  page.appendChild(inputWrap);

  const suggestions = createSuggestions(SearchStorage.recent(), (keyword) => {
    input.value = keyword;
    runSearch(keyword, true);
  });
  if (suggestions) page.appendChild(suggestions);

  const resultWrap = createElement('div');
  page.appendChild(resultWrap);

  const updateSearchUrl = (query) => {
    const qs = new URLSearchParams();
    qs.set('view', ROUTES.SEARCH);
    if (query) qs.set('q', query);
    history.replaceState(
      { route: { name: ROUTES.SEARCH, params: { q: query || '' } } },
      '',
      `${window.location.pathname}?${qs.toString()}`
    );
  };

  function renderResults(keyword, items) {
    resultWrap.innerHTML = '';
    if (!items.length) {
      renderState(resultWrap, 'no-results', { message: `KhÃ´ng cÃ³ káº¿t quáº£ cho "${keyword}".` });
      metaNode.textContent = 'KhÃ´ng cÃ³ káº¿t quáº£ phÃ¹ há»£p.';
      return;
    }

    const toolbar = createElement('div', { className: 'search-toolbar' }, [
      createElement('div', { className: 'search-toolbar-left' }, [
        createElement('span', { className: 'search-state-hint', text: `TÃ¬m tháº¥y ${items.length} káº¿t quáº£` })
      ])
    ]);
    resultWrap.appendChild(toolbar);

    const grid = createElement('div', { className: 'search-grid' });
    items.forEach((movie) => {
      const card = createMovieCard(movie, {
        isFavorite: FavoritesStorage.isFavorite(movie.slug),
        onOpen: (picked) => ctx.navigate(ROUTES.DETAIL, { slug: picked.slug }),
        onFavoriteToggle: () => {
          const added = FavoritesStorage.toggle({
            slug: movie.slug,
            name: movie.name,
            year: movie.year,
            quality: movie.quality,
            thumb: movie.thumb,
            poster: movie.poster
          });
          card.querySelector('.fav-btn')?.classList.toggle('on', added);
          ctx.toast(added ? 'ÄÃ£ thÃªm vÃ o yÃªu thÃ­ch' : 'ÄÃ£ bá» khá»i yÃªu thÃ­ch');
        }
      });
      grid.appendChild(card);
    });
    resultWrap.appendChild(grid);
    metaNode.textContent = `Hiá»ƒn thá»‹ ${items.length} káº¿t quáº£ cho "${keyword}".`;
  }

  async function runSearch(keyword, updateRoute = false) {
    if (disposed) return;

    const query = String(keyword || '').trim();
    lastQuery = query;
    ctx.syncSearchInput(query);

    if (!query) {
      renderState(resultWrap, 'idle');
      metaNode.textContent = 'Nháº­p tá»« khÃ³a Ä‘á»ƒ tÃ¬m phim nhanh hÆ¡n.';
      if (updateRoute) updateSearchUrl('');
      return;
    }

    if (query.length < SEARCH_CONFIG.MIN_LENGTH && !query.startsWith('category:')) {
      renderState(resultWrap, 'idle');
      metaNode.textContent = `Nháº­p tá»‘i thiá»ƒu ${SEARCH_CONFIG.MIN_LENGTH} kÃ½ tá»±.`;
      return;
    }

    if (updateRoute) updateSearchUrl(query);

    renderState(resultWrap, 'loading');
    metaNode.textContent = 'Äang tÃ¬m kiáº¿m...';
    const controller = requestManager.next('search');

    try {
      const result = await searchMovies(query, { signal: controller.signal });
      if (disposed || controller.signal.aborted || query !== lastQuery) return;

      const items = result.items || [];
      SearchStorage.pushRecent(query);
      renderResults(query, items);
    } catch (error) {
      if (controller.signal.aborted) return;
      renderState(resultWrap, 'error', {
        message: 'CÃ³ lá»—i khi tÃ¬m kiáº¿m. Vui lÃ²ng thá»­ láº¡i.',
        actions: [
          {
            label: UI_TEXT.retry,
            onClick: () => runSearch(query, false)
          }
        ]
      });
      metaNode.textContent = 'KhÃ´ng thá»ƒ táº£i káº¿t quáº£ tÃ¬m kiáº¿m.';
    }
  }

  const onInput = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      runSearch(input.value, true);
    }, SEARCH_CONFIG.DEBOUNCE_MS);
  };

  const onSubmit = (event) => {
    event.preventDefault();
    if (debounceTimer) clearTimeout(debounceTimer);
    runSearch(input.value, true);
  };

  input.addEventListener('input', onInput);
  inputWrap.addEventListener('submit', onSubmit);

  if (queryFromRoute) await runSearch(queryFromRoute, false);
  else renderState(resultWrap, 'idle');

  setTimeout(() => input.focus(), 80);

  return {
    node: page,
    title: UI_TEXT.search,
    cleanup: () => {
      disposed = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      input.removeEventListener('input', onInput);
      inputWrap.removeEventListener('submit', onSubmit);
      requestManager.cancel('search');
    }
  };
}

