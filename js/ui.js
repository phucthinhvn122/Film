import { $, SELECTORS, toast } from './dom.js';
import { toggleTheme, getTheme, THEMES } from './theme.js';

let cleanupFns = [];
let drawerOpen = false;
let tvMode = false;

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

function isLikelyAndroidTv() {
  const params = new URLSearchParams(window.location.search);
  const forced = params.get('tv');
  if (forced === '1') return true;
  if (forced === '0') return false;

  const ua = String(navigator.userAgent || '');
  const uaLower = ua.toLowerCase();
  const hasTvHint = /(android tv|google tv|googletv|smart-tv|smarttv|hbbtv|netcast|viera|appletv|bravia|aft[a-z0-9-]*)/i.test(ua);
  const isAndroidTvStyle = uaLower.includes('android') && !uaLower.includes('mobile') && uaLower.includes('tv');

  let largeScreen = false;
  try {
    largeScreen = window.matchMedia('(min-width: 960px)').matches;
  } catch (_) {
    largeScreen = false;
  }

  return Boolean(hasTvHint || (isAndroidTvStyle && largeScreen));
}

function isEditableElement(node) {
  if (!node || !(node instanceof Element)) return false;
  if (node.isContentEditable) return true;
  const tag = String(node.tagName || '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return Boolean(node.closest('input, textarea, select, [contenteditable="true"]'));
}

function setupTvAppBar() {
  const bar = $('#tv-app-bar');
  if (!bar) return;

  const items = Array.from(bar.querySelectorAll('.tv-nav-item'));
  if (!items.length) return;

  let focusedIndex = Math.max(0, items.findIndex((item) => item.classList.contains('active')));
  if (focusedIndex < 0) focusedIndex = 0;

  const setFocusIndex = (nextIndex, shouldFocus = false) => {
    if (!items.length) return;
    const max = items.length - 1;
    const normalized = nextIndex < 0 ? max : (nextIndex > max ? 0 : nextIndex);
    focusedIndex = normalized;

    items.forEach((item, idx) => {
      item.tabIndex = idx === focusedIndex ? 0 : -1;
    });

    if (shouldFocus) {
      items[focusedIndex]?.focus({ preventScroll: true });
    }
  };

  const syncFromActive = () => {
    const activeIndex = items.findIndex((item) => item.classList.contains('active'));
    if (activeIndex >= 0) {
      setFocusIndex(activeIndex, false);
      return;
    }
    setFocusIndex(focusedIndex, false);
  };

  const onFocusIn = (event) => {
    const node = event.target?.closest?.('.tv-nav-item');
    if (!node) return;
    const index = items.indexOf(node);
    if (index >= 0) setFocusIndex(index, false);
  };

  const onKeyDown = (event) => {
    if (!tvMode) return;
    if (document.body.classList.contains('watch-mode')) return;
    if (drawerOpen) return;
    if (isEditableElement(event.target)) return;

    const active = document.activeElement;
    const isInsideBar = Boolean(active && bar.contains(active));

    if (event.key === 'ArrowUp' && !isInsideBar) {
      event.preventDefault();
      syncFromActive();
      items[focusedIndex]?.focus({ preventScroll: true });
      return;
    }

    if (!isInsideBar) return;

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setFocusIndex(focusedIndex - 1, true);
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      setFocusIndex(focusedIndex + 1, true);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      items[focusedIndex]?.click();
    }
  };

  setFocusIndex(focusedIndex, false);
  bar.addEventListener('focusin', onFocusIn);
  document.addEventListener('keydown', onKeyDown);

  const focusTimer = window.setTimeout(() => {
    if (!tvMode) return;
    if (document.body.classList.contains('watch-mode')) return;
    if (isEditableElement(document.activeElement)) return;
    syncFromActive();
    items[focusedIndex]?.focus({ preventScroll: true });
  }, 180);

  addCleanup(() => {
    bar.removeEventListener('focusin', onFocusIn);
    document.removeEventListener('keydown', onKeyDown);
    clearTimeout(focusTimer);
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
  if (cleanupFns.length) destroyUI();
  tvMode = isLikelyAndroidTv();
  document.body.classList.toggle('tv-mode', tvMode);

  const themeButton = document.querySelector('[data-action="theme-toggle"]');
  const themeIcon = themeButton?.querySelector('i');
  if (themeIcon) {
    themeIcon.className = getTheme() === THEMES.LIGHT ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  }

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
      case 'theme-toggle': {
        const nextTheme = toggleTheme();
        const icon = actionNode.querySelector('i');
        if (icon) {
          icon.className = nextTheme === THEMES.LIGHT ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
        }
        actionNode.setAttribute('aria-label', nextTheme === THEMES.LIGHT ? 'Doi sang giao dien toi' : 'Doi sang giao dien sang');
        actionNode.setAttribute('title', nextTheme === THEMES.LIGHT ? 'Giao dien sang' : 'Giao dien toi');
        toast(nextTheme === THEMES.LIGHT ? 'Đã bật giao diện sáng' : 'Đã bật giao diện tối');
        break;
      }
      case 'notifications':
        toast('Tinh nang thong bao dang phat trien.');
        break;
      case 'profile':
        toast('Tinh nang ho so dang phat trien.');
        break;
      default:
        break;
    }
  };

  const onEscape = (event) => {
    if (event.key === 'Escape' && drawerOpen) closeDrawer();
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

    const handleSubmit = (e) => {
      e.preventDefault();
      const keyword = String(input.value || '').trim();
      actions.goSearch(keyword);
      if (selector === '.mob-search') closeDrawer();
    };

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

    form.addEventListener('submit', handleSubmit);
    input.addEventListener('focus', pulse);
    form.addEventListener('pointerdown', onPointerDown, { passive: true });

    addCleanup(() => {
      form.removeEventListener('submit', handleSubmit);
      input.removeEventListener('focus', pulse);
      form.removeEventListener('pointerdown', onPointerDown);
    });
  };

  document.addEventListener('click', onClick);
  document.addEventListener('keydown', onEscape);
  window.addEventListener('scroll', onScroll, { passive: true });

  bindSearchFx('.search-box');
  bindSearchFx('.mob-search');
  if (tvMode) setupTvAppBar();

  addCleanup(() => document.removeEventListener('click', onClick));
  addCleanup(() => document.removeEventListener('keydown', onEscape));
  addCleanup(() => window.removeEventListener('scroll', onScroll));
}

export function destroyUI() {
  closeDrawer();
  document.body.classList.remove('tv-mode');
  tvMode = false;
  cleanupFns.forEach((fn) => {
    try {
      fn();
    } catch (_) {
      // ignore
    }
  });
  cleanupFns = [];
}
