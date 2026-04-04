export const BRAND = {
  name: 'Netflix',
  fullName: 'Netflix Streaming',
  tagline: 'Nen tang xem phim truc tuyen on dinh va cap nhat nhanh',
  shortDescription: 'Xem phim truc tuyen chat luong cao voi giao dien gon gang.'
};

export const API_SOURCE = {
  name: 'NguonPhim',
  latest: 'https://phim.nguonc.com/api/films/phim-moi-cap-nhat?page=',
  detail: 'https://phim.nguonc.com/api/film/',
  search: 'https://phim.nguonc.com/api/films/search?keyword=',
  categories: {
    'phim-bo': 'https://phim.nguonc.com/api/films/danh-sach/phim-bo?page=',
    'phim-le': 'https://phim.nguonc.com/api/films/danh-sach/phim-le?page=',
    'hoat-hinh': 'https://phim.nguonc.com/api/films/danh-sach/hoat-hinh?page=',
    'tv-shows': 'https://phim.nguonc.com/api/films/danh-sach/tv-shows?page='
  }
};

export const CATEGORY_LABELS = {
  latest: 'Moi cap nhat',
  'phim-bo': 'Phim bo',
  'phim-le': 'Phim le',
  'hoat-hinh': 'Anime / Hoat hinh',
  'tv-shows': 'TV Show'
};

export const STORAGE_KEYS = {
  FAVORITES: 'thinfilm:favorites',
  HISTORY: 'thinfilm:history',
  WATCH_PROGRESS: 'thinfilm:watchProgress',
  SEARCH_RECENT: 'thinfilm:searchRecent',
  SESSION_ROUTE: 'thinfilm:sessionRoute',
  SERVER_MEMORY: 'thinfilm:serverMemory'
};

export const STORAGE_LIMITS = {
  FAVORITES_MAX: 200,
  HISTORY_MAX: 120,
  CONTINUE_MAX: 24,
  SEARCH_RECENT_MAX: 12
};

export const CACHE_TTL = {
  HOME: 5 * 60 * 1000,
  DETAIL: 30 * 60 * 1000,
  SEARCH: 4 * 60 * 1000,
  TMDB_META: 6 * 60 * 60 * 1000,
  TMDB_ERROR: 90 * 1000,
  IMAGE_PROXY: 60 * 60 * 1000
};

export const CACHE_MAX_SIZE = {
  HOME: 60,
  DETAIL: 120,
  SEARCH: 50,
  TMDB: 200,
  IMAGE_PROXY: 300
};

export const REQUEST_TIMEOUT = {
  DEFAULT: 15000,
  SEARCH: 12000,
  DETAIL: 16000,
  TMDB: 10000
};

export const SEARCH_CONFIG = {
  DEBOUNCE_MS: 400,
  MIN_LENGTH: 2
};

export const UI_CONFIG = {
  PAGE_TRANSITION: 220,
  SKELETON_COUNT: 12,
  RENDER_PAGE_SIZE: 24,
  DEBOUNCE_DELAY: SEARCH_CONFIG.DEBOUNCE_MS
};

export const PLAYER_CONFIG = {
  PROGRESS_SAVE_INTERVAL_MS: 3000,
  SEEK_STEP_SECONDS: 10
};

export const UI_TEXT = {
  loading: 'Dang tai du lieu...',
  loadingMeta: 'Dang tai metadata phim...',
  noData: 'Khong co du lieu de hien thi.',
  networkError: 'Khong the ket noi may chu. Vui long thu lai.',
  ERROR: 'Da co loi xay ra.',
  retry: 'Thu lai',
  favorites: 'Yeu thich',
  history: 'Lich su',
  continueWatching: 'Tiep tuc xem',
  home: 'Trang chu',
  search: 'Tim kiem',
  watch: 'Xem phim',
  detail: 'Chi tiet phim'
};

export const ROUTES = {
  HOME: 'home',
  DETAIL: 'detail',
  WATCH: 'watch',
  SEARCH: 'search',
  HISTORY: 'history',
  FAVORITES: 'favorites'
};

export const IMG_FALLBACK = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='300'><rect width='100%' height='100%' fill='%23222222'/><text x='50%25' y='50%25' fill='%23999999' font-size='14' text-anchor='middle' dominant-baseline='middle'>No Image</text></svg>";

export const DEFAULT_PAGE_SIZE = 24;




