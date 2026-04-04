import { IMG_FALLBACK } from './config.js';

export const SELECTORS = {
  main: '#main',
  header: '#header',
  drawer: '#drawer',
  drawerInner: '.mob-drawer-inner',
  mobileNavItems: '.mb-nav-item',
  desktopNavItems: '.nav-links a',
  desktopSearchInput: '#q',
  mobileSearchInput: '#q-mob'
};

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

export function createElement(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined) continue;

    if (key.startsWith('on') && typeof value === 'function') {
      const eventName = key.slice(2).toLowerCase();
      node.addEventListener(eventName, value);
      continue;
    }

    if (key === 'className') {
      node.className = value;
      continue;
    }

    if (key === 'text') {
      node.textContent = String(value);
      continue;
    }

    if (key === 'html') {
      node.innerHTML = String(value);
      continue;
    }

    if (key === 'dataset' && typeof value === 'object') {
      Object.entries(value).forEach(([datasetKey, datasetValue]) => {
        node.dataset[datasetKey] = String(datasetValue);
      });
      continue;
    }

    if (key.startsWith('aria') || key === 'role' || key === 'type' || key === 'id' || key === 'name' || key === 'placeholder' || key === 'value' || key === 'src' || key === 'alt' || key === 'title') {
      node.setAttribute(key, String(value));
      continue;
    }

    if (key === 'style' && typeof value === 'object') {
      Object.assign(node.style, value);
      continue;
    }

    node.setAttribute(key, String(value));
  }

  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child === null || child === undefined) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }

  return node;
}

export function clearNode(node) {
  if (!node) return;
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function escapeHtml(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function stripHtml(text = '') {
  return String(text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function createLoaderState(message = 'Dang tai...') {
  return createElement('div', { className: 'loader' }, [
    createElement('div', { className: 'spin', 'aria-hidden': 'true' }),
    createElement('span', { className: 'sr-only', text: message })
  ]);
}

export function createEmptyState(message = 'Khong co du lieu.') {
  return createElement('div', { className: 'empty' }, [
    createElement('i', { class: 'fa-solid fa-box-open', 'aria-hidden': 'true' }),
    createElement('p', { text: message })
  ]);
}

export function createErrorState(message = 'Da co loi xay ra.', actions = []) {
  const wrap = createElement('div', { className: 'empty' }, [
    createElement('i', { class: 'fa-solid fa-triangle-exclamation', 'aria-hidden': 'true' }),
    createElement('p', { text: message })
  ]);

  if (Array.isArray(actions) && actions.length) {
    const actionRow = createElement('div', {
      style: { marginTop: '14px', display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }
    });

    actions.forEach((action) => {
      const button = createElement('button', {
        className: action.className || 'section-more',
        type: 'button',
        text: action.label || 'Thuc hien'
      });
      button.addEventListener('click', () => action.onClick?.());
      actionRow.appendChild(button);
    });

    wrap.appendChild(actionRow);
  }

  return wrap;
}

export function createSkeletonGrid(count = 10) {
  const wrap = createElement('div', { className: 'search-skeleton' });
  const total = Math.min(30, Math.max(4, Number(count) || 10));

  for (let i = 0; i < total; i += 1) {
    const card = createElement('div', { className: 'skeleton-card' }, [
      createElement('div', { className: 'skeleton-thumb' }),
      createElement('div', { className: 'skeleton-info' }, [
        createElement('div', { className: 'skeleton-line' }),
        createElement('div', { className: 'skeleton-line short' })
      ])
    ]);
    wrap.appendChild(card);
  }

  return wrap;
}

export function lazyImage(src, alt, className = '') {
  const img = createElement('img', {
    className: className ? `${className} loading` : 'loading',
    alt: alt || 'Poster phim',
    loading: 'lazy',
    decoding: 'async',
    src: src || IMG_FALLBACK
  });

  img.referrerPolicy = 'no-referrer';
  img.addEventListener('error', () => {
    if (img.src !== IMG_FALLBACK) {
      img.src = IMG_FALLBACK;
    }
  });
  img.addEventListener('load', () => {
    img.classList.remove('loading');
  });

  return img;
}

export function createMovieCard(movie, options = {}) {
  const card = createElement('article', {
    className: 'card',
    role: 'button',
    tabindex: 0,
    dataset: { action: options.action || 'open-detail', slug: movie.slug }
  });

  const thumb = createElement('div', { className: 'card-thumb' });
  const img = lazyImage(movie.thumb, movie.name || 'Poster phim');
  thumb.appendChild(img);

  if (movie.quality) {
    thumb.appendChild(createElement('span', { className: 'card-badge', text: movie.quality }));
  }

  const play = createElement('span', { className: 'card-play', 'aria-hidden': 'true' }, [
    createElement('i', { class: 'fa-solid fa-play' })
  ]);
  thumb.appendChild(play);

  const info = createElement('div', { className: 'card-info' }, [
    createElement('div', { className: 'card-title', text: movie.name || 'Không rõ tên' }),
    createElement('div', { className: 'card-meta' }, [
      movie.year ? createElement('span', { text: String(movie.year) }) : null,
      movie.year && movie.episodeCurrent ? createElement('span', { className: 'dot', text: '•' }) : null,
      movie.episodeCurrent ? createElement('span', { text: movie.episodeCurrent }) : null
    ].filter(Boolean))
  ]);

  card.appendChild(thumb);
  card.appendChild(info);

  if (options.onFavoriteToggle) {
    const favButton = createElement('button', {
      type: 'button',
      className: `fav-btn${options.isFavorite ? ' on' : ''}`,
      'aria-label': options.isFavorite ? 'Bo yeu thich' : 'Them yeu thich',
      title: options.isFavorite ? 'Bo yeu thich' : 'Them yeu thich'
    }, [createElement('i', { class: 'fa-solid fa-heart', 'aria-hidden': 'true' })]);

    favButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      options.onFavoriteToggle?.();
    });

    thumb.appendChild(favButton);
  }

  const open = () => options.onOpen?.(movie);

  card.addEventListener('click', open);
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open();
    }
  });

  return card;
}

let transitionToken = 0;

export function setMainContent(node, onMounted) {
  const main = $(SELECTORS.main);
  if (!main) return;

  const isValidNode = typeof Node !== 'undefined' ? node instanceof Node : Boolean(node && typeof node === 'object');
  const safeNode = isValidNode
    ? node
    : createElement('div', { className: 'error-page' }, [
        createElement('div', { className: 'error-content' }, [
          createElement('i', { class: 'fa-solid fa-triangle-exclamation', 'aria-hidden': 'true' }),
          createElement('h2', { text: 'Da xay ra loi hien thi' }),
          createElement('p', { text: 'Noi dung trang khong hop le. Vui long tai lai.' })
        ])
      ]);

  const token = ++transitionToken;
  const isWatchPage = safeNode.classList?.contains('watch-page') || false;

  const mountNow = () => {
    clearNode(main);
    main.appendChild(safeNode);
    document.body.classList.toggle('watch-mode', isWatchPage);
    onMounted?.();
  };

  if (!main.hasChildNodes()) {
    mountNow();
    return;
  }

  main.classList.add('page-exit');
  setTimeout(() => {
    if (token !== transitionToken) return;
    main.classList.remove('page-exit');
    main.classList.add('page-enter');
    mountNow();
    void main.offsetWidth;
    main.classList.remove('page-enter');
    main.classList.add('page-enter-active');
    setTimeout(() => {
      if (token !== transitionToken) return;
      main.classList.remove('page-enter-active');
    }, 320);
  }, 220);
}

export function updateDocumentTitle(pageTitle, appName = 'Netflix') {
  document.title = pageTitle ? `${pageTitle} | ${appName}` : appName;
}

export function setMain(node, onMounted) {
  setMainContent(node, onMounted);
}

export function el(tag, attrs = {}, children = []) {
  return createElement(tag, attrs, children);
}

export function loader(message = 'Dang tai...') {
  return createLoaderState(message);
}

export function buildSearchSkeleton(count = 10) {
  return createSkeletonGrid(count);
}

export function renderCardsProgressively(container, items = [], pageSize = 24, renderCard) {
  if (!container || typeof renderCard !== 'function') return;
  const list = Array.isArray(items) ? items : [];
  const step = Math.max(1, Number(pageSize) || 24);
  let index = 0;

  const push = () => {
    if (index >= list.length) return;
    const frag = document.createDocumentFragment();
    const end = Math.min(list.length, index + step);

    for (let i = index; i < end; i += 1) {
      const node = renderCard(list[i], i);
      if (node instanceof Node) frag.appendChild(node);
    }

    container.appendChild(frag);
    index = end;

    if (index < list.length) {
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(push);
      else setTimeout(push, 0);
    }
  };

  push();
}

export function toast(message, durationMs = 2500) {
  const node = createElement('div', {
    className: 'toast',
    text: String(message || '')
  });

  Object.assign(node.style, {
    position: 'fixed',
    top: '86px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: '9999',
    background: 'rgba(18,18,18,.92)',
    color: '#fff',
    border: '1px solid rgba(255,255,255,.16)',
    borderRadius: '12px',
    padding: '10px 14px',
    fontWeight: '700',
    boxShadow: '0 18px 40px rgba(0,0,0,.55)'
  });

  document.body.appendChild(node);
  setTimeout(() => {
    try {
      node.remove();
    } catch (_) {
      // ignore
    }
  }, Math.max(600, Number(durationMs) || 2500));
}

export function highlightText(text = '', keyword = '') {
  const source = String(text || '');
  const q = String(keyword || '').trim();
  if (!q) return escapeHtml(source);

  const pattern = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${pattern})`, 'ig');
  return escapeHtml(source).replace(regex, '<mark>$1</mark>');
}




