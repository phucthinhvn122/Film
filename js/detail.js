/**
 * Detail page module
 * Handles movie detail view with metadata, episodes, and related content
 */

import { BasePage } from './router.js';
import { movieSourceClient, DataNormalizer, requestManager } from './api.js';
import { el, loader, renderCardsProgressively, toast } from './dom.js';
import { FavoritesStorage, HistoryStorage } from './storage.js';
import { UI_TEXT } from './config.js';

/**
 * Detail page class
 */
export class DetailPage extends BasePage {
  constructor() {
    super('detail');
    this.abortController = null;
    this.movieSlug = null;
    this.movieData = null;
    this.isFavorite = false;
  }

  async render(params = {}) {
    this.movieSlug = params.slug;
    if (!this.movieSlug) {
      throw new Error('Movie slug is required');
    }

    this.abortController = requestManager.createController('detail');

    const wrap = el('div', { class: 'detail-page' });
    
    // Loading state
    wrap.appendChild(loader());

    try {
      await this.loadMovieDetail(wrap);
    } catch (error) {
      console.error('Failed to load movie detail:', error);
      this.showError(wrap, error);
    }

    return wrap;
  }

  async loadMovieDetail(container) {
    // Fetch movie detail
    const data = await movieSourceClient.fetchDetail(this.movieSlug, true);
    if (!data || !data.movie) {
      throw new Error('Movie not found');
    }

    this.movieData = DataNormalizer.normalizeMovie(data.movie, data.pathImage || '');
    this.isFavorite = FavoritesStorage.isFavorite(this.movieSlug);

    // Clear loader and render content
    container.innerHTML = '';
    
    // Backdrop hero section
    const hero = this.createHeroSection();
    container.appendChild(hero);

    // Content section
    const content = this.createContentSection();
    container.appendChild(content);

    // Related movies
    const related = this.createRelatedSection();
    container.appendChild(related);

    // Set title
    this.setTitle(this.movieData.name || 'Không có tên');
  }

  createHeroSection() {
    const hero = el('div', { class: 'detail-hero' });
    
    // Backdrop
    const backdrop = el('div', { class: 'detail-backdrop' });
    const backdropImg = document.createElement('img');
    backdropImg.src = this.movieData._poster || this.movieData._thumb;
    backdropImg.alt = '';
    backdropImg.onerror = () => {
      backdropImg.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect fill="%23000"/><text x="50%25" y="50%25" fill="%23555" font-size="24" text-anchor="middle" dominant-baseline="middle">No Backdrop</text></svg>';
    };
    backdrop.appendChild(backdropImg);
    hero.appendChild(backdrop);

    // Gradient overlay
    const overlay = el('div', { class: 'detail-hero-overlay' });
    hero.appendChild(overlay);

    // Content
    const heroContent = el('div', { class: 'detail-hero-content' });
    
    // Poster
    const posterContainer = el('div', { class: 'detail-poster-container' });
    const poster = el('div', { class: 'detail-poster' });
    const posterImg = document.createElement('img');
    posterImg.src = this.movieData._poster || this.movieData._thumb;
    posterImg.alt = this.movieData.name || '';
    posterImg.loading = 'eager';
    posterImg.onerror = () => {
      posterImg.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect fill="%23222"/><text x="50%25" y="50%25" fill="%23555" font-size="16" text-anchor="middle" dominant-baseline="middle">No Poster</text></svg>';
    };
    poster.appendChild(posterImg);
    posterContainer.appendChild(poster);
    heroContent.appendChild(posterContainer);

    // Info
    const info = el('div', { class: 'detail-hero-info' });
    
    // Title
    const title = el('h1', { class: 'detail-title' }, this.movieData.name || 'Không có tên');
    info.appendChild(title);

    // Original title
    if (this.movieData.origin_name && this.movieData.origin_name !== this.movieData.name) {
      const origTitle = el('div', { class: 'detail-original-title' }, this.movieData.origin_name);
      info.appendChild(origTitle);
    }

    // Meta info
    const meta = el('div', { class: 'detail-meta' });
    
    if (this.movieData.year) {
      meta.appendChild(el('span', { class: 'detail-year' }, String(this.movieData.year)));
    }
    
    if (this.movieData.quality || this.movieData.episode_current) {
      if (this.movieData.year) {
        meta.appendChild(el('span', { class: 'detail-separator' }, '•'));
      }
      meta.appendChild(el('span', { class: 'detail-quality' }, this.movieData.quality || this.movieData.episode_current || 'HD'));
    }
    
    if (this.movieData.time) {
      if (this.movieData.year || this.movieData.quality) {
        meta.appendChild(el('span', { class: 'detail-separator' }, '•'));
      }
      meta.appendChild(el('span', { class: 'detail-duration' }, this.movieData.time));
    }
    
    info.appendChild(meta);

    // Categories
    if (Array.isArray(this.movieData.category) && this.movieData.category.length > 0) {
      const categories = el('div', { class: 'detail-categories' });
      this.movieData.category.slice(0, 5).forEach(cat => {
        const category = el('span', { class: 'detail-category' }, cat.name || cat.slug || '');
        categories.appendChild(category);
      });
      info.appendChild(categories);
    }

    // Actions
    const actions = el('div', { class: 'detail-actions' });
    
    // Watch button
    const watchBtn = el('button', { 
      class: 'btn btn-primary btn-large',
      onclick: () => this.handleWatchClick()
    }, 'Xem phim');
    actions.appendChild(watchBtn);

    // Favorite button
    const favBtn = el('button', {
      class: `btn btn-outline btn-large ${this.isFavorite ? 'favorited' : ''}`,
      onclick: () => this.handleFavoriteClick()
    });
    favBtn.innerHTML = `<i class="fa-solid fa-heart"></i> ${this.isFavorite ? 'Đã thích' : 'Thích'}`;
    actions.appendChild(favBtn);

    // Share button
    const shareBtn = el('button', {
      class: 'btn btn-outline btn-large',
      onclick: () => this.handleShareClick()
    }, '<i class="fa-solid fa-share"></i> Chia sẻ');
    actions.appendChild(shareBtn);

    info.appendChild(actions);
    heroContent.appendChild(info);
    hero.appendChild(heroContent);

    return hero;
  }

  createContentSection() {
    const content = el('div', { class: 'detail-content' });
    
    // Description
    if (this.movieData.content) {
      const descSection = el('div', { class: 'detail-section' });
      const descTitle = el('h2', { class: 'detail-section-title' }, 'Nội dung');
      descSection.appendChild(descTitle);
      
      const desc = el('div', { class: 'detail-description' });
      desc.innerHTML = this.movieData.content.replace(/\n/g, '<br>');
      descSection.appendChild(desc);
      
      content.appendChild(descSection);
    }

    // Episodes
    if (this.movieData.episodes && this.movieData.episodes.length > 0) {
      const episodesSection = el('div', { class: 'detail-section' });
      const episodesTitle = el('h2', { class: 'detail-section-title' }, 'Danh sách tập');
      episodesSection.appendChild(episodesTitle);
      
      const episodesContainer = el('div', { class: 'detail-episodes' });
      
      this.movieData.episodes.forEach((server, serverIndex) => {
        const serverBlock = el('div', { class: 'episode-server' });
        
        const serverName = el('h3', { class: 'episode-server-name' }, server.server_name || `Server ${serverIndex + 1}`);
        serverBlock.appendChild(serverName);
        
        const episodeList = el('div', { class: 'episode-list' });
        
        if (Array.isArray(server.items)) {
          server.items.forEach((episode, epIndex) => {
            const episodeBtn = el('button', {
              class: 'episode-btn',
              onclick: () => this.handleEpisodeClick(server.server_name, episode.slug, episode.name)
            }, episode.name || `Tập ${epIndex + 1}`);
            episodeList.appendChild(episodeBtn);
          });
        }
        
        serverBlock.appendChild(episodeList);
        episodesContainer.appendChild(serverBlock);
      });
      
      episodesSection.appendChild(episodesContainer);
      content.appendChild(episodesSection);
    }

    // Cast and crew (if available from TMDB)
    if (this.movieData._tmdb && this.movieData._tmdb.cast && this.movieData._tmdb.cast.length > 0) {
      const castSection = el('div', { class: 'detail-section' });
      const castTitle = el('h2', { class: 'detail-section-title' }, 'Diễn viên');
      castSection.appendChild(castTitle);
      
      const castList = el('div', { class: 'detail-cast' });
      
      this.movieData._tmdb.cast.slice(0, 8).forEach(actor => {
        const actorCard = el('div', { class: 'cast-card' });
        
        const actorImg = document.createElement('img');
        actorImg.src = actor.avatar || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="150"><rect fill="%23222"/><text x="50%25" y="50%25" fill="%23555" font-size="12" text-anchor="middle" dominant-baseline="middle">No Photo</text></svg>';
        actorImg.alt = actor.name || '';
        actorImg.loading = 'lazy';
        
        const actorInfo = el('div', { class: 'cast-info' });
        const actorName = el('div', { class: 'cast-name' }, actor.name || '');
        const actorChar = el('div', { class: 'cast-character' }, actor.character || '');
        
        actorInfo.appendChild(actorName);
        actorInfo.appendChild(actorChar);
        
        actorCard.appendChild(actorImg);
        actorCard.appendChild(actorInfo);
        castList.appendChild(actorCard);
      });
      
      castSection.appendChild(castList);
      content.appendChild(castSection);
    }

    return content;
  }

  createRelatedSection() {
    const related = el('div', { class: 'detail-related' });
    
    const title = el('h2', { class: 'detail-section-title' }, 'Phim liên quan');
    related.appendChild(title);
    
    const grid = el('div', { class: 'section-grid' });
    related.appendChild(grid);

    // Load related movies based on categories
    this.loadRelatedMovies(grid);

    return related;
  }

  async loadRelatedMovies(grid) {
    try {
      // Get first category for related movies
      const firstCategory = this.movieData.category?.[0]?.slug;
      if (!firstCategory) {
        grid.innerHTML = '<div class="empty">Không có phim liên quan</div>';
        return;
      }

      // Fetch category movies
      const data = await movieSourceClient.fetchCategory(firstCategory, true);
      const items = DataNormalizer.normalizeItems(data);
      
      // Filter out current movie and limit to 12
      const related = items.filter(m => m.slug !== this.movieSlug).slice(0, 12);
      
      if (related.length > 0) {
        renderCardsProgressively(grid, related, 12, (movie) => this.createMovieCard(movie));
      } else {
        grid.innerHTML = '<div class="empty">Không có phim liên quan</div>';
      }
    } catch (error) {
      console.error('Failed to load related movies:', error);
      grid.innerHTML = '<div class="empty">Không thể tải phim liên quan</div>';
    }
  }

  createMovieCard(movie) {
    const card = el('div', { class: 'card' });
    card.onclick = () => this.handleMovieClick(movie.slug);

    const thumb = el('div', { class: 'card-thumb' });
    const img = document.createElement('img');
    img.src = movie._thumb;
    img.alt = movie.name || '';
    img.loading = 'lazy';
    img.onerror = () => {
      img.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect fill="%23222"/><text x="50%25" y="50%25" fill="%23555" font-size="14" text-anchor="middle" dominant-baseline="middle">No Image</text></svg>';
    };
    thumb.appendChild(img);

    const info = el('div', { class: 'card-info' });
    
    const title = el('div', { class: 'card-title' });
    title.textContent = movie.name || 'Không có tên';
    info.appendChild(title);

    const meta = el('div', { class: 'card-meta' });
    
    if (movie.year) {
      meta.appendChild(el('span', {}, String(movie.year)));
    }
    
    if (movie.quality || movie.episode_current) {
      if (movie.year) {
        meta.appendChild(el('span', { class: 'dot' }, '•'));
      }
      meta.appendChild(el('span', {}, movie.quality || movie.episode_current || 'HD'));
    }
    
    info.appendChild(meta);

    card.appendChild(thumb);
    card.appendChild(info);

    return card;
  }

  handleWatchClick() {
    // Find first episode
    const firstServer = this.movieData.episodes?.[0];
    const firstEpisode = firstServer?.items?.[0];
    
    if (firstEpisode) {
      this.handleEpisodeClick(firstServer.server_name, firstEpisode.slug, firstEpisode.name);
    } else {
      toast('Không có tập nào để xem');
    }
  }

  handleEpisodeClick(serverName, epSlug, epName) {
    // Save to history
    HistoryStorage.saveEntry({
      movieSlug: this.movieSlug,
      epSlug: epSlug,
      srvName: serverName,
      movieName: this.movieData.name,
      epName: epName,
      poster: this.movieData._poster || this.movieData._thumb,
      progressSeconds: 0
    });

    // Navigate to watch page
    import('./router.js').then(({ NavigationHelpers }) => {
      NavigationHelpers.goWatch(this.movieSlug, epSlug);
    });
  }

  handleFavoriteClick() {
    this.isFavorite = FavoritesStorage.toggle(this.movieData);
    
    // Update button
    const favBtn = document.querySelector('.detail-actions .btn-outline');
    if (favBtn) {
      favBtn.classList.toggle('favorited', this.isFavorite);
      favBtn.innerHTML = `<i class="fa-solid fa-heart"></i> ${this.isFavorite ? 'Đã thích' : 'Thích'}`;
    }

    toast(this.isFavorite ? 'Đã thêm vào yêu thích' : 'Đã xóa khỏi yêu thích');
  }

  handleShareClick() {
    const url = window.location.href;
    
    if (navigator.share) {
      navigator.share({
        title: this.movieData.name,
        text: `${this.movieData.name} - ${this.movieData.content?.substring(0, 100)}...`,
        url: url
      }).catch(() => {
        // Fallback to copying URL
        this.copyToClipboard(url);
      });
    } else {
      this.copyToClipboard(url);
    }
  }

  copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
      toast('Đã sao chép liên kết');
    }).catch(() => {
      toast('Không thể sao chép liên kết');
    });
  }

  handleMovieClick(slug) {
    import('./router.js').then(({ NavigationHelpers }) => {
      NavigationHelpers.goDetail(slug);
    });
  }

  showError(container, error) {
    container.innerHTML = `
      <div class="error-page">
        <div class="error-content">
          <i class="fa-solid fa-film"></i>
          <h2>Phim không tồn tại</h2>
          <p>${error.message || 'Không thể tìm thấy phim này'}</p>
          <button onclick="location.href='/'" class="btn btn-primary">Về trang chủ</button>
        </div>
      </div>
    `;
  }

  onMounted(params) {
    this.updateActiveTab('home');
    
    // Scroll to top
    window.scrollTo(0, 0);
  }

  async unmount() {
    // Cancel ongoing requests
    if (this.abortController) {
      this.abortController.abort();
    }

    // Call parent unmount
    super.unmount();
  }
}

export default DetailPage;

