import { ROUTES } from './config.js';

function normalizeRouteName(name) {
  const target = String(name || '').trim().toLowerCase();
  if (Object.values(ROUTES).includes(target)) return target;
  return ROUTES.HOME;
}

function readRouteFromLocation() {
  const query = new URLSearchParams(window.location.search);
  const name = normalizeRouteName(query.get('view'));
  const params = {};

  if (name === ROUTES.DETAIL || name === ROUTES.WATCH) {
    params.slug = String(query.get('slug') || '').trim();
  }

  if (name === ROUTES.WATCH) {
    params.ep = String(query.get('ep') || '').trim();
    params.server = String(query.get('server') || '').trim();
  }

  if (name === ROUTES.SEARCH) {
    params.q = String(query.get('q') || '').trim();
  }

  return { name, params };
}

function buildUrl(name, params = {}) {
  const query = new URLSearchParams();
  const route = normalizeRouteName(name);

  if (route !== ROUTES.HOME) {
    query.set('view', route);
  }

  if ((route === ROUTES.DETAIL || route === ROUTES.WATCH) && params.slug) {
    query.set('slug', String(params.slug));
  }

  if (route === ROUTES.WATCH) {
    if (params.ep) query.set('ep', String(params.ep));
    if (params.server) query.set('server', String(params.server));
  }

  if (route === ROUTES.SEARCH && params.q) {
    query.set('q', String(params.q));
  }

  const qs = query.toString();
  return `${window.location.pathname}${qs ? `?${qs}` : ''}`;
}

export class Router {
  constructor() {
    this.handlers = new Map();
    this.currentRoute = { name: ROUTES.HOME, params: {} };
    this.onChange = null;
    this._boundPopState = this._onPopState.bind(this);
  }

  register(name, handler) {
    this.handlers.set(normalizeRouteName(name), handler);
  }

  setChangeListener(listener) {
    this.onChange = typeof listener === 'function' ? listener : null;
  }

  start() {
    window.addEventListener('popstate', this._boundPopState);
    const route = readRouteFromLocation();
    this.navigate(route.name, route.params, { replace: true });
  }

  destroy() {
    window.removeEventListener('popstate', this._boundPopState);
  }

  _onPopState() {
    const route = readRouteFromLocation();
    this.navigate(route.name, route.params, { replace: true, fromPopState: true });
  }

  navigate(name, params = {}, options = {}) {
    const routeName = normalizeRouteName(name);
    const handler = this.handlers.get(routeName);
    if (!handler) {
      this.navigate(ROUTES.HOME, {}, { replace: true });
      return;
    }

    const route = { name: routeName, params: { ...params } };
    const url = buildUrl(routeName, route.params);
    const state = { route };

    if (!options.fromPopState) {
      if (options.replace) history.replaceState(state, '', url);
      else history.pushState(state, '', url);
    }

    this.currentRoute = route;
    this.onChange?.(route);
    handler(route.params, route);
  }

  getCurrentRoute() {
    return this.currentRoute;
  }
}

export const router = new Router();

