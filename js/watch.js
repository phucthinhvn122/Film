import { BasePage, router } from './router.js';
import { ROUTES } from './config.js';
import { renderWatchPage } from './player.js';
import { createElement } from './dom.js';

export class WatchPage extends BasePage {
  constructor() {
    super(ROUTES.WATCH);
  }

  async render(params = {}) {
    const result = await renderWatchPage({
      navigate: (route, routeParams = {}, options = {}) => {
        const replace = Boolean(options && options.replace);
        return router.navigate(route, routeParams, replace);
      }
    }, params);

    this.cleanup = typeof result?.cleanup === 'function' ? result.cleanup : null;
    if (result?.title) this.setTitle(result.title);

    return result?.node || createElement('section');
  }

  onMounted() {
    this.updateActiveTab('home');
    window.scrollTo(0, 0);
  }
}

export default WatchPage;
