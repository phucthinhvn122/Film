import { PLAYER_CONFIG, ROUTES, UI_TEXT } from './config.js';
import { fetchMovieDetail, getFirstEpisode, requestManager } from './api.js';
import { createElement, createErrorState, createLoaderState, stripHtml } from './dom.js';
import { ServerMemoryStorage, StorageUtils, ProgressStorage } from './storage.js';

let hlsScriptPromise = null;

function ensureHlsScript() {
  if (window.Hls) return Promise.resolve(window.Hls);
  if (hlsScriptPromise) return hlsScriptPromise;

  hlsScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.15/dist/hls.min.js';
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => resolve(window.Hls);
    script.onerror = () => reject(new Error('Khong the tai thu vien HLS.'));
    document.head.appendChild(script);
  });

  return hlsScriptPromise;
}

function pickServerAndEpisode(episodes, requestedServer, requestedEp, movieSlug) {
  if (!Array.isArray(episodes) || !episodes.length) return null;

  const remembered = ServerMemoryStorage.get(movieSlug);
  const serverNamePriority = [requestedServer, remembered].filter(Boolean);
  let server = null;

  for (const serverName of serverNamePriority) {
    server = episodes.find((item) => item.name === serverName);
    if (server) break;
  }
  if (!server) server = episodes.find((item) => item.items.length > 0) || episodes[0];
  if (!server) return null;

  let episode = null;
  if (requestedEp) {
    episode = server.items.find((item) => item.slug === requestedEp) || null;
  }
  if (!episode) episode = server.items[0];

  if (!episode) return null;
  return { server, episode };
}

function resolvePlayableSource(episode, options = {}) {
  const m3u8 = String(episode?.linkM3u8 || '').trim();
  const embed = String(episode?.linkEmbed || '').trim();
  const forceEmbed = Boolean(options.forceEmbed);

  if (forceEmbed && embed) return { type: 'embed', url: embed, embedUrl: '' };
  if (m3u8) return { type: 'm3u8', url: m3u8, embedUrl: embed };
  if (embed) return { type: 'embed', url: embed, embedUrl: '' };
  return null;
}

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function buildWatchUrl(movieSlug, epSlug, serverName = '') {
  const path = `/watch/${encodeURIComponent(movieSlug || '')}/${encodeURIComponent(epSlug || '')}`;
  return serverName ? `${path}?server=${encodeURIComponent(serverName)}` : path;
}

export async function renderWatchPage(ctx, params = {}) {
  const slug = String(params.slug || '').trim();
  const requestedEp = String(params.epSlug || params.ep || '').trim();
  const requestedServer = String(params.server || '').trim();
  const controller = requestManager.next('watch');

  const page = createElement('section', { className: 'watch-page' });
  const loading = createElement('div', { className: 'watch-info-section' }, [createLoaderState(UI_TEXT.loading)]);
  page.appendChild(loading);

  if (!slug) {
    loading.innerHTML = '';
    loading.appendChild(createErrorState('Không tìm thấy phim cần xem.', [
      { label: 'Về trang chủ', onClick: () => ctx.navigate(ROUTES.HOME) }
    ]));
    return { node: page, cleanup: () => requestManager.cancel('watch'), title: UI_TEXT.watch };
  }

  let hls = null;
  let video = null;
  let playbackSaveTimer = null;
  let lastSavedAt = 0;
  let activeServerName = '';
  let activeEpisodeSlug = '';
  let detailData = null;
  let activeSourceType = '';
  let activeEpisodeRef = null;
  let qualityMode = 'auto';
  const removeListeners = [];

  const bind = (target, event, handler, options) => {
    target.addEventListener(event, handler, options);
    removeListeners.push(() => target.removeEventListener(event, handler, options));
  };

  const bindHls = (instance, eventName, handler) => {
    instance.on(eventName, handler);
    removeListeners.push(() => {
      try {
        instance.off(eventName, handler);
      } catch (_) {
        // ignore
      }
    });
  };

  const cleanup = () => {
    requestManager.cancel('watch');
    if (playbackSaveTimer) {
      clearInterval(playbackSaveTimer);
      playbackSaveTimer = null;
    }

    removeListeners.forEach((off) => {
      try {
        off();
      } catch (_) {
        // ignore
      }
    });

    if (hls) {
      try {
        hls.destroy();
      } catch (_) {
        // ignore
      }
      hls = null;
    }

    if (video) {
      try {
        video.pause();
      } catch (_) {
        // ignore
      }
      video.removeAttribute('src');
    }
  };

  function saveProgress(force = false) {
    if (!video || !detailData?.movie || !activeEpisodeRef) return;
    if (activeSourceType !== 'm3u8') return;

    const now = Date.now();
    if (!force && now - lastSavedAt < PLAYER_CONFIG.PROGRESS_SAVE_INTERVAL_MS) return;
    lastSavedAt = now;

    StorageUtils.savePlaybackSnapshot({
      movieSlug: detailData.movie.slug,
      epSlug: activeEpisodeRef.slug,
      serverName: activeServerName,
      movieName: detailData.movie.name,
      episodeName: activeEpisodeRef.name,
      poster: detailData.movie.poster || detailData.movie.thumb,
      progressSeconds: Number(video.currentTime) || 0,
      durationSeconds: Number(video.duration) || 0
    });
  }

  function buildPage(detail, selectedServer, selectedEpisode) {
    page.innerHTML = '';

    const top = createElement('div', { className: 'watch-top' });
    const backBtn = createElement('button', {
      type: 'button',
      className: 'watch-back',
      'aria-label': 'Quay lai trang chi tiet'
    }, [createElement('i', { class: 'fa-solid fa-arrow-left', 'aria-hidden': 'true' })]);
    backBtn.addEventListener('click', () => {
      cleanup();
      ctx.navigate(ROUTES.DETAIL, { slug: detail.movie.slug });
    });

    const title = createElement('div', {
      className: 'watch-title',
      text: `${detail.movie.name || 'Đang xem'} • ${selectedEpisode.name || ''}`
    });

    const serverBadge = createElement('div', { className: 'watch-srv' }, [
      createElement('span', { className: 'srv-btn active', text: selectedServer.name })
    ]);

    top.appendChild(backBtn);
    top.appendChild(title);
    top.appendChild(serverBadge);
    page.appendChild(top);

    const playerWrap = createElement('div', { className: 'player-wrap' });
    const metaOverlay = createElement('div', { className: 'player-meta-overlay' }, [
      createElement('div', { className: 'player-meta-title', text: detail.movie.name }),
      createElement('div', { className: 'player-meta-ep', text: selectedEpisode.name || '' }),
      createElement('div', { className: 'player-meta-row' }, [
        createElement('span', { className: 'player-meta-chip', text: selectedServer.name }),
        detail.movie.quality ? createElement('span', { className: 'player-meta-chip', text: detail.movie.quality }) : null
      ].filter(Boolean))
    ]);

    const playerBody = createElement('div', {
      style: { position: 'absolute', inset: '0' }
    });

    playerWrap.appendChild(playerBody);
    playerWrap.appendChild(metaOverlay);
    page.appendChild(playerWrap);

    const controls = createElement('div', { className: 'controls' });
    const progressWrap = createElement('div', { className: 'progress-wrap' });
    const progressFill = createElement('div', { className: 'progress-fill' });
    progressWrap.appendChild(progressFill);

    const ctrlRow = createElement('div', { className: 'ctrl-row' });
    const left = createElement('div', { className: 'ctrl-left' });
    const right = createElement('div', { className: 'ctrl-right' });

    const playBtn = createElement('button', { type: 'button', className: 'cb', id: 'playbtn' }, [
      createElement('i', { class: 'fa-solid fa-play', 'aria-hidden': 'true' })
    ]);
    const muteBtn = createElement('button', { type: 'button', className: 'cb', id: 'mutebtn' }, [
      createElement('i', { class: 'fa-solid fa-volume-high', 'aria-hidden': 'true' })
    ]);
    const fsBtn = createElement('button', { type: 'button', className: 'cb', id: 'fsbtn' }, [
      createElement('i', { class: 'fa-solid fa-expand', 'aria-hidden': 'true' })
    ]);
    const retryBtn = createElement('button', { type: 'button', className: 'cb', id: 'retrybtn' }, [
      createElement('i', { class: 'fa-solid fa-rotate-right', 'aria-hidden': 'true' })
    ]);
    const qualityBtn = createElement('button', {
      type: 'button',
      className: 'cb quality-btn',
      id: 'qualitybtn',
      title: 'Chất lượng'
    }, [
      createElement('i', { class: 'fa-solid fa-sliders', 'aria-hidden': 'true' })
    ]);
    const timeText = createElement('span', { className: 'time-txt', text: '00:00 / 00:00' });
    const qualityText = createElement('span', { className: 'quality-txt', text: 'Auto' });

    const qmenuWrap = createElement('div', { className: 'qmenu-wrap' });
    const qmenu = createElement('div', { className: 'qmenu', id: 'qualitymenu' });
    qmenuWrap.appendChild(qualityBtn);
    qmenuWrap.appendChild(qmenu);

    left.appendChild(playBtn);
    left.appendChild(muteBtn);
    left.appendChild(qualityText);
    left.appendChild(timeText);
    right.appendChild(retryBtn);
    right.appendChild(qmenuWrap);
    right.appendChild(fsBtn);
    ctrlRow.appendChild(left);
    ctrlRow.appendChild(right);
    controls.appendChild(progressWrap);
    controls.appendChild(ctrlRow);
    playerWrap.appendChild(controls);

    const infoSection = createElement('div', { className: 'watch-info-section' });
    const mainCol = createElement('div', { className: 'watch-main-col' });
    const summary = createElement('div', { className: 'watch-card' }, [
      createElement('h1', { className: 'watch-info-title', text: detail.movie.name }),
      createElement('div', { className: 'watch-info-meta', text: `${detail.movie.year || ''} ${detail.movie.lang || ''}`.trim() }),
      createElement('p', { className: 'watch-info-desc', text: detail.movie.content || 'Chưa có mô tả.' })
    ]);

    const serverCard = createElement('div', { className: 'watch-content-align watch-card' });
    serverCard.appendChild(createElement('div', {
      style: {
        color: 'var(--text2)',
        marginBottom: '10px',
        fontSize: '.88rem',
        fontWeight: '700'
      },
      text: 'MÁY CHỦ PHÁT'
    }));
    const serverList = createElement('div', { className: 'watch-server-list' });
    serverCard.appendChild(serverList);

    const episodeCard = createElement('div', { className: 'watch-content-align watch-card' });
    episodeCard.appendChild(createElement('div', {
      style: {
        color: 'var(--text2)',
        marginBottom: '12px',
        fontSize: '.9rem',
        fontWeight: '700'
      },
      text: 'TẬP PHIM'
    }));
    const episodeGrid = createElement('div', { className: 'watch-ep-grid' });
    episodeCard.appendChild(episodeGrid);

    mainCol.appendChild(summary);
    mainCol.appendChild(serverCard);
    mainCol.appendChild(episodeCard);
    infoSection.appendChild(mainCol);
    page.appendChild(infoSection);

    const setEmbedUiMode = (enabled) => {
      page.classList.toggle('embed-mode', Boolean(enabled));
      controls.style.display = enabled ? 'none' : '';
      metaOverlay.style.display = enabled ? 'none' : '';
      top.style.display = '';
    };

    const closeQualityMenu = () => qmenu.classList.remove('open');

    const updateQualityLabel = (label = 'Auto') => {
      qualityText.textContent = label;
    };

    const renderQualityMenu = (levels = []) => {
      qmenu.innerHTML = '';

      const items = Array.isArray(levels) ? levels : [];
      if (!items.length) {
        qmenu.appendChild(createElement('div', { className: 'qmenu-head' }, [
          createElement('strong', { text: 'Chất lượng' }),
          createElement('span', { text: 'Tự động' })
        ]));
        updateQualityLabel(activeSourceType === 'embed' ? 'Embed' : 'Auto');
        qualityBtn.disabled = activeSourceType !== 'm3u8';
        return;
      }

      qualityBtn.disabled = false;
      qmenu.appendChild(createElement('div', { className: 'qmenu-head' }, [
        createElement('strong', { text: 'Chất lượng' }),
        createElement('span', { text: 'Chọn mức phát' })
      ]));

      const entries = [
        { value: 'auto', label: 'Auto', meta: 'Tự động tối ưu' },
        ...items
      ];

      entries.forEach((entry) => {
        const isAuto = entry.value === 'auto';
        const btn = createElement('button', {
          type: 'button',
          className: `qbtn${qualityMode === entry.value ? ' active' : ''}`,
          dataset: { qualityValue: entry.value }
        }, [
          createElement('span', { text: entry.label }),
          createElement('span', { className: 'qbtn-meta', text: entry.meta || '' })
        ]);
        btn.addEventListener('click', () => {
          if (!hls) return;
          if (isAuto) {
            hls.currentLevel = -1;
            hls.nextLevel = -1;
            qualityMode = 'auto';
            updateQualityLabel('Auto');
          } else {
            const levelIndex = Number(entry.value);
            hls.currentLevel = levelIndex;
            hls.nextLevel = levelIndex;
            qualityMode = String(levelIndex);
            updateQualityLabel(entry.label);
          }
          renderQualityMenu(items);
          closeQualityMenu();
        });
        qmenu.appendChild(btn);
      });
    };

    const getUniqueQualityLevels = (levels = []) => {
      const seen = new Set();
      return levels
        .map((level, index) => {
          const height = Number(level?.height) || 0;
          const bitrate = Number(level?.bitrate) || 0;
          const label = height > 0 ? `${height}p` : `Level ${index + 1}`;
          const meta = bitrate > 0 ? `${Math.round(bitrate / 1000)} kbps` : '';
          const key = `${height}:${bitrate}`;
          if (seen.has(key)) return null;
          seen.add(key);
          return { value: String(index), label, meta, height, bitrate };
        })
        .filter(Boolean)
        .sort((a, b) => b.height - a.height || b.bitrate - a.bitrate);
    };

    const rebuildEpisodeGrid = (server) => {
      episodeGrid.innerHTML = '';
      const items = Array.isArray(server?.items) ? server.items : [];
      items.forEach((episode) => {
        const btn = createElement('button', {
          type: 'button',
          className: `ep-num${episode.slug === activeEpisodeSlug ? ' active' : ''}`,
          dataset: { epSlug: episode.slug },
          text: episode.name || episode.slug
        });
        btn.addEventListener('click', () => mountSource(server.name, episode.slug));
        episodeGrid.appendChild(btn);
      });
    };

    const mountSource = async (serverName, episodeSlug, { preserveTime = false, forceEmbed = false } = {}) => {
      const server = detail.episodes.find((item) => item.name === serverName) || detail.episodes[0];
      if (!server) return;
      const episode = server.items.find((item) => item.slug === episodeSlug) || server.items[0];
      if (!episode) return;

      activeServerName = server.name;
      activeEpisodeSlug = episode.slug;
      activeEpisodeRef = episode;
      ServerMemoryStorage.remember(detail.movie.slug, activeServerName);
      history.replaceState(
        { page: ROUTES.WATCH, params: { slug: detail.movie.slug, epSlug: activeEpisodeSlug, server: activeServerName } },
        '',
        buildWatchUrl(detail.movie.slug, activeEpisodeSlug, activeServerName)
      );

      serverList.querySelectorAll('.w-srv-btn').forEach((button) => {
        button.classList.toggle('active', button.dataset.serverName === activeServerName);
      });
      rebuildEpisodeGrid(server);

      title.textContent = `${detail.movie.name} • ${episode.name || ''}`;
      metaOverlay.querySelector('.player-meta-ep').textContent = episode.name || '';
      serverBadge.innerHTML = '';
      serverBadge.appendChild(createElement('span', { className: 'srv-btn active', text: activeServerName }));

      const source = resolvePlayableSource(episode, { forceEmbed });
      playerBody.innerHTML = '';
      if (!source) {
        const embedOnly = String(episode?.linkEmbed || '').trim();
        const actions = [
          { label: UI_TEXT.retry, onClick: () => mountSource(activeServerName, activeEpisodeSlug) }
        ];
        if (embedOnly) {
          actions.push({
            label: 'Mở nguồn nhúng',
            onClick: () => mountSource(activeServerName, activeEpisodeSlug, { preserveTime: false, forceEmbed: true })
          });
        }
        playerBody.appendChild(createErrorState(
          embedOnly
            ? 'Nguồn M3U8 không có sẵn. Bạn có thể thử nguồn nhúng.'
            : 'Tập này không có nguồn phát khả dụng.',
          actions
        ));
        return;
      }

      if (hls) {
        try {
          hls.destroy();
        } catch (_) {
          // ignore
        }
        hls = null;
      }

      if (video) {
        try {
          saveProgress(true);
          video.pause();
        } catch (_) {
          // ignore
        }
      }

      activeSourceType = source.type;
      qualityMode = 'auto';
      closeQualityMenu();
      renderQualityMenu([]);

      if (source.type === 'embed') {
        setEmbedUiMode(true);
        const embedFrameWrap = createElement('div', {
          style: {
            position: 'absolute',
            inset: '0',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#000'
          }
        });
        const iframe = createElement('iframe', {
          src: source.url,
          allowfullscreen: 'allowfullscreen',
          allow: 'autoplay; fullscreen'
        });
        iframe.style.position = 'absolute';
        iframe.style.inset = '0';
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        embedFrameWrap.appendChild(iframe);

        const openExternalBtn = createElement('button', {
          type: 'button',
          className: 'section-more',
          text: 'Mo trinh phat ben ngoai',
          style: {
            position: 'relative',
            zIndex: '30',
            background: 'rgba(0,0,0,.65)',
            borderColor: 'rgba(255,255,255,.35)',
            color: '#fff'
          }
        });
        openExternalBtn.addEventListener('click', () => {
          window.open(source.url, '_blank', 'noopener,noreferrer');
        });
        embedFrameWrap.appendChild(openExternalBtn);
        playerBody.appendChild(embedFrameWrap);
        playBtn.disabled = true;
        muteBtn.disabled = true;
        qualityBtn.disabled = true;
        progressWrap.style.pointerEvents = 'none';
        progressFill.style.width = '0%';
        timeText.textContent = '--:-- / --:--';
        updateQualityLabel('Embed');

        StorageUtils.savePlaybackSnapshot({
          movieSlug: detail.movie.slug,
          epSlug: episode.slug,
          serverName: activeServerName,
          movieName: detail.movie.name,
          episodeName: episode.name,
          poster: detail.movie.poster || detail.movie.thumb,
          progressSeconds: 0,
          durationSeconds: 0
        });
        return;
      }

      setEmbedUiMode(false);
      playBtn.disabled = false;
      muteBtn.disabled = false;
      qualityBtn.disabled = true;
      progressWrap.style.pointerEvents = '';
      updateQualityLabel('Auto');

      const nextVideo = createElement('video', {
        playsinline: 'playsinline'
      });
      nextVideo.controls = false;
      nextVideo.autoplay = true;
      nextVideo.preload = 'metadata';
      nextVideo.style.position = 'absolute';
      nextVideo.style.inset = '0';
      nextVideo.style.width = '100%';
      nextVideo.style.height = '100%';
      nextVideo.style.objectFit = 'contain';
      nextVideo.style.background = '#000';
      playerBody.appendChild(nextVideo);
      video = nextVideo;

      const restoreProgress = () => {
        const saved = ProgressStorage.get(detail.movie.slug, episode.slug, activeServerName);
        if (!saved?.progressSeconds) return;
        const maxSafe = Math.max(0, (Number(video.duration) || 0) - 5);
        const target = Math.min(saved.progressSeconds, maxSafe || saved.progressSeconds);
        if (target > 5) video.currentTime = target;
      };

      bind(video, 'loadedmetadata', restoreProgress, { once: true });
      bind(video, 'timeupdate', () => {
        const duration = Number(video.duration) || 0;
        const current = Number(video.currentTime) || 0;
        const ratio = duration > 0 ? Math.max(0, Math.min(100, (current / duration) * 100)) : 0;
        progressFill.style.width = `${ratio}%`;
        timeText.textContent = `${formatTime(current)} / ${duration ? formatTime(duration) : '--:--'}`;
        saveProgress(false);
      });
      bind(video, 'play', () => {
        const icon = playBtn.querySelector('i');
        if (icon) icon.className = 'fa-solid fa-pause';
      });
      bind(video, 'pause', () => {
        const icon = playBtn.querySelector('i');
        if (icon) icon.className = 'fa-solid fa-play';
      });
      bind(video, 'ended', () => {
        saveProgress(true);
        const list = server.items;
        const idx = list.findIndex((ep) => ep.slug === episode.slug);
        const next = idx >= 0 ? list[idx + 1] : null;
        if (next) {
          mountSource(activeServerName, next.slug);
        }
      });
      bind(video, 'error', () => {
        const actions = [
          { label: UI_TEXT.retry, onClick: () => mountSource(activeServerName, activeEpisodeSlug) }
        ];
        if (source.embedUrl) {
          actions.push({
            label: 'Mở nguồn nhúng',
            onClick: () => mountSource(activeServerName, activeEpisodeSlug, { preserveTime: false, forceEmbed: true })
          });
        }
        playerBody.innerHTML = '';
        playerBody.appendChild(createErrorState('Nguồn M3U8 bị lỗi hoặc bị chặn.', actions));
      });

      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = source.url;
      } else {
        const Hls = await ensureHlsScript();
        if (!Hls?.isSupported?.()) {
          video.src = source.url;
        } else {
          hls = new Hls({ enableWorker: true, lowLatencyMode: false, backBufferLength: 30 });
          hls.loadSource(source.url);
          hls.attachMedia(video);
          bindHls(hls, Hls.Events.MANIFEST_PARSED, (_, data) => {
            const levels = getUniqueQualityLevels(data?.levels || hls.levels || []);
            renderQualityMenu(levels);
          });
          bindHls(hls, Hls.Events.LEVEL_SWITCHED, (_, data) => {
            const nextLevel = Number(data?.level);
            if (qualityMode === 'auto') {
              updateQualityLabel('Auto');
              return;
            }
            const currentLevel = hls.levels?.[nextLevel];
            if (currentLevel?.height) updateQualityLabel(`${currentLevel.height}p`);
          });
        }
      }

      if (preserveTime) {
        const saved = ProgressStorage.get(detail.movie.slug, episode.slug, activeServerName);
        if (saved.progressSeconds > 0) {
          video.currentTime = saved.progressSeconds;
        }
      }
    };

    detail.episodes.forEach((server) => {
      const btn = createElement('button', {
        type: 'button',
        className: `w-srv-btn${server.name === selectedServer.name ? ' active' : ''}`,
        dataset: { serverName: server.name }
      }, [
        createElement('i', { class: 'fa-solid fa-server', 'aria-hidden': 'true' }),
        createElement('span', { text: server.name })
      ]);
      btn.addEventListener('click', () => mountSource(server.name, server.items[0]?.slug || ''));
      serverList.appendChild(btn);
    });

    rebuildEpisodeGrid(selectedServer);

    playBtn.addEventListener('click', () => {
      if (!video) return;
      if (video.paused) video.play().catch(() => {});
      else video.pause();
    });

    muteBtn.addEventListener('click', () => {
      if (!video) return;
      video.muted = !video.muted;
      const icon = muteBtn.querySelector('i');
      if (icon) icon.className = video.muted ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high';
    });

    fsBtn.addEventListener('click', async () => {
      try {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        } else {
          await playerWrap.requestFullscreen();
        }
      } catch (_) {
        // ignore
      }
    });

    retryBtn.addEventListener('click', () => {
      mountSource(activeServerName, activeEpisodeSlug, { preserveTime: true });
    });

    qualityBtn.addEventListener('click', () => {
      if (qualityBtn.disabled) return;
      qmenu.classList.toggle('open');
    });

    progressWrap.addEventListener('pointerdown', (event) => {
      if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;
      const rect = progressWrap.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      video.currentTime = ratio * video.duration;
    });

    const onKeyDown = (event) => {
      const tag = String(event.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'button') return;

      if (event.key === ' ') {
        event.preventDefault();
        playBtn.click();
        return;
      }

      if (!video) return;

      if (event.key === 'ArrowLeft') {
        video.currentTime = Math.max(0, (video.currentTime || 0) - PLAYER_CONFIG.SEEK_STEP_SECONDS);
      } else if (event.key === 'ArrowRight') {
        video.currentTime = Math.min((video.duration || 0) - 1, (video.currentTime || 0) + PLAYER_CONFIG.SEEK_STEP_SECONDS);
      } else if (event.key.toLowerCase() === 'f') {
        fsBtn.click();
      } else if (event.key.toLowerCase() === 'm') {
        muteBtn.click();
      }
    };
    bind(document, 'keydown', onKeyDown);
    bind(document, 'click', (event) => {
      if (!qmenu.contains(event.target) && !qualityBtn.contains(event.target)) {
        closeQualityMenu();
      }
    });

    mountSource(selectedServer.name, selectedEpisode.slug);

    playbackSaveTimer = setInterval(() => saveProgress(false), PLAYER_CONFIG.PROGRESS_SAVE_INTERVAL_MS);
  }

  try {
    const detail = await fetchMovieDetail(slug, { signal: controller.signal });
    detailData = detail;

    const picked = pickServerAndEpisode(detail.episodes, requestedServer, requestedEp, detail.movie.slug)
      || getFirstEpisode(detail.episodes);
    if (!picked) throw new Error('NO_PLAYABLE_EPISODE');

    if (controller.signal.aborted) {
      return { node: page, cleanup, title: UI_TEXT.watch };
    }

    const selectedServer = picked.server || detail.episodes.find((s) => s.name === picked.serverName);
    const selectedEpisode = picked.episode || selectedServer?.items?.[0];
    if (!selectedServer || !selectedEpisode) throw new Error('NO_PLAYABLE_EPISODE');

    activeServerName = selectedServer.name;
    activeEpisodeSlug = selectedEpisode.slug;
    activeEpisodeRef = selectedEpisode;

    buildPage(detail, selectedServer, selectedEpisode);

    return {
      node: page,
      cleanup,
      title: `${detail.movie.name} - ${selectedEpisode.name || 'Xem phim'}`
    };
  } catch (error) {
    loading.innerHTML = '';
    loading.appendChild(createErrorState(
      error.message === 'NO_PLAYABLE_EPISODE'
        ? 'Phim này hiện chưa có tập để phát.'
        : 'Không thể mở trang xem phim.',
      [
        { label: UI_TEXT.retry, onClick: () => ctx.navigate(ROUTES.WATCH, { slug, epSlug: requestedEp, server: requestedServer }, { replace: true }) },
        { label: 'Về chi tiết', onClick: () => ctx.navigate(ROUTES.DETAIL, { slug }) }
      ]
    ));

    return { node: page, cleanup, title: UI_TEXT.watch };
  }
}

