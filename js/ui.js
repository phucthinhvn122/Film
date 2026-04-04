import { ROUTES } from './config.js';
import { $, $$, SELECTORS, createElement } from './dom.js';

let cleanupFns = [];
let drawerOpen = false;

function addCleanup(fn) {
  cleanupFns.push(fn);
}

function closeDrawer() {
  const drawer = $(SELECTORS.drawer);
  const hamburger = $('#hamburger');
  if (!drawer) return;
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  hamburger?.classList.remove('open');
  drawerOpen = false;
  document.body.style.overflow = '';
}

function openDrawer() {
  const drawer = $(SELECTORS.drawer);
  const hamburger = $('#hamburger');
  if (!drawer) return;
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  hamburger?.classList.add('open');
  drawerOpen = true;
  document.body.style.overflow = 'hidden';
}

function toggleDrawer() {
  if (drawerOpen) closeDrawer();
  else openDrawer();
}

export function showToast(message, durationMs = 2500) {
  const toast = createElement('div', {
    text: message,
    style: {
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
    }
  });
  document.body.appendChild(toast);
  setTimeout(() => {
    try {
      toast.remove();
    } catch (_) {
      // ignore
    }
  }, durationMs);
}

function routeToTab(routeName) {
  switch (routeName) {
    case ROUTES.SEARCH:
      return 'search';
    case ROUTES.HISTORY:
      return 'history';
    case ROUTES.FAVORITES:
      return 'favorites';
    default:
      return 'home';
  }
}

export function setActiveNavigation(routeName) {
  const tab = routeToTab(routeName);
  $$(SELECTORS.mobileNavItems).forEach((item) => {
    item.classList.toggle('active', item.dataset.tab === tab);
  });

  $$(SELECTORS.desktopNavItems).forEach((item) => {
    const id = item.id?.replace('nav-', '') || '';
    item.classList.toggle('active', id === tab);
  });
}

export function syncSearchInputValue(value = '') {
  const text = String(value || '');
  const desktop = $(SELECTORS.desktopSearchInput);
  const mobile = $(SELECTORS.mobileSearchInput);
  if (desktop) desktop.value = text;
  if (mobile) mobile.value = text;
}

export function initUI(actions) {
  const onClick = (event) => {
    const actionNode = event.target.closest('[data-action]');
    if (!actionNode) return;

    const action = String(actionNode.dataset.action || '');
    if (!action) return;

    if (actionNode.tagName === 'A' || actionNode.tagName === 'BUTTON' || actionNode.classList.contains('logo')) {
      event.preventDefault();
    }

    switch (action) {
      case 'home':
        actions.goHome();
        closeDrawer();
        break;
      case 'search':
        actions.goSearch('');
        closeDrawer();
        break;
      case 'history':
        actions.goHistory();
        closeDrawer();
        break;
      case 'favorites':
        actions.goFavorites();
        closeDrawer();
        break;
      case 'category':
        if (actionNode.dataset.category) {
          actions.goSearch(`category:${actionNode.dataset.category}`);
          closeDrawer();
        }
        break;
      case 'drawer-toggle':
        toggleDrawer();
        break;
      case 'drawer-backdrop':
        if (event.target === actionNode) closeDrawer();
        break;
      case 'notifications':
        showToast('Tinh nang thong bao dang phat trien.');
        break;
      case 'profile':
        showToast('Tinh nang ho so dang phat trien.');
        break;
      default:
        break;
    }
  };

  const onSubmit = (event) => {
    const form = event.target.closest('[data-action]');
    if (!form) return;

    const action = String(form.dataset.action || '');
    if (action !== 'search-form' && action !== 'mobile-search-form') return;

    event.preventDefault();
    const input = form.querySelector('input');
    const keyword = String(input?.value || '').trim();
    actions.goSearch(keyword);
    if (action === 'mobile-search-form') closeDrawer();
  };

  const onEscape = (event) => {
    if (event.key === 'Escape' && drawerOpen) {
      closeDrawer();
    }
  };

  const onScroll = () => {
    const header = $(SELECTORS.header);
    if (!header) return;
    header.classList.toggle('scrolled', window.scrollY > 10);
  };

  const bindSearchFx = (selector) => {
    const form = $(selector);
    if (!form) return;
    const input = form.querySelector('input');
    if (!input) return;

    const pulse = () => {
      form.classList.remove('focus-glow');
      void form.offsetWidth;
      form.classList.add('focus-glow');
      setTimeout(() => form.classList.remove('focus-glow'), 700);
    };

    const onPointerDown = () => {
      form.classList.add('press');
      setTimeout(() => form.classList.remove('press'), 140);
    };

    input.addEventListener('focus', pulse);
    form.addEventListener('pointerdown', onPointerDown, { passive: true });

    addCleanup(() => {
      input.removeEventListener('focus', pulse);
      form.removeEventListener('pointerdown', onPointerDown);
    });
  };

  document.addEventListener('click', onClick);
  document.addEventListener('submit', onSubmit);
  document.addEventListener('keydown', onEscape);
  window.addEventListener('scroll', onScroll, { passive: true });

  bindSearchFx('.search-box');
  bindSearchFx('.mob-search');

  addCleanup(() => document.removeEventListener('click', onClick));
  addCleanup(() => document.removeEventListener('submit', onSubmit));
  addCleanup(() => document.removeEventListener('keydown', onEscape));
  addCleanup(() => window.removeEventListener('scroll', onScroll));
}

export function destroyUI() {
  closeDrawer();
  cleanupFns.forEach((fn) => {
    try {
      fn();
    } catch (_) {
      // ignore
    }
  });
  cleanupFns = [];
}


