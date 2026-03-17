// ==UserScript==
// @name         Ateaish Anime Player Automation
// @namespace    https://atishramkhe.github.io/
// @version      0.1.0
// @description  Forces autoplay when possible, auto-clicks skip intro/outro buttons, reports playback for auto-next, and keeps skip settings synced with the anime page.
// @author       you
// @run-at       document-start
//
// ---- Ateaish anime page ----
// @match        https://atishramkhe.github.io/*
// @match        https://*.atishramkhe.github.io/*
//
// ---- Embedded player hosts ----
// @match        https://animationdigitalnetwork.fr/*
// @match        https://bingezove.com/*
// @match        https://dingtezuni.com/*
// @match        https://lpayer.embed4me.com/*
// @match        https://minochinos.com/*
// @match        https://mivalyo.com/*
// @match        https://movearnpre.com/*
// @match        https://myvi.ru/*
// @match        https://oneupload.to/*
// @match        https://sendvid.com/*
// @match        https://smoothpre.com/*
// @match        https://video.sibnet.ru/*
// @match        https://*.sibnet.ru/*
// @match        https://vidmoly.net/*
// @match        https://vidmoly.to/*
// @match        https://vk.com/*
// @match        https://vkvideo.ru/*
// @match        https://vidsrc.cc/*
// @match        https://*.vidsrc.cc/*
// @match        https://www.myvi.top/*
// @match        https://www.myvi.tv/*
// @match        https://www.yourupload.com/*
// @match        https://megacloud.blog/*
// @match        https://*.megacloud.blog/*
// @match        https://megacloud.tv/*
// @match        https://*.megacloud.tv/*
// @match        https://rapid-cloud.co/*
// @match        https://*.rapid-cloud.co/*
//
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
  'use strict';

  if (window.__ateaishAnimePlayerAutomationInstalled) return;
  window.__ateaishAnimePlayerAutomationInstalled = true;

  const DEFAULTS = {
    enabled: true,
    forceAutoplay: true,
    autoSkip: true,
    reportProgress: true,
    autoNext: true,
    debug: false,
  };

  const SETTINGS_KEY = 'ateaish_anime_player_automation_v1';
  const PLAYER_INFO_TYPE = 'ateaish_anime_player_info';
  const ANIME_SKIP_SETTINGS_PREFIX = 'animeSkipSettings_';
  const HOSTNAME = String(location.hostname || '').toLowerCase();

  function loadSettings() {
    try {
      const saved = GM_getValue(SETTINGS_KEY, null);
      if (!saved) return { ...DEFAULTS };
      const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved;
      return { ...DEFAULTS, ...(parsed || {}) };
    } catch {
      return { ...DEFAULTS };
    }
  }

  function saveSettings(next) {
    try {
      GM_setValue(SETTINGS_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  const settings = loadSettings();

  function log(...args) {
    if (settings.debug) console.log('[Ateaish Anime Automation]', ...args);
  }

  function toggleSetting(key) {
    const next = { ...settings, [key]: !settings[key] };
    Object.assign(settings, next);
    saveSettings(next);
  }

  GM_registerMenuCommand(`Enabled: ${settings.enabled ? 'ON' : 'OFF'}`, () => toggleSetting('enabled'));
  GM_registerMenuCommand(`Force autoplay: ${settings.forceAutoplay ? 'ON' : 'OFF'}`, () => toggleSetting('forceAutoplay'));
  GM_registerMenuCommand(`Auto skip buttons: ${settings.autoSkip ? 'ON' : 'OFF'}`, () => toggleSetting('autoSkip'));
  GM_registerMenuCommand(`Report progress: ${settings.reportProgress ? 'ON' : 'OFF'}`, () => toggleSetting('reportProgress'));
  GM_registerMenuCommand(`Auto next: ${settings.autoNext ? 'ON' : 'OFF'}`, () => toggleSetting('autoNext'));
  GM_registerMenuCommand(`Debug logs: ${settings.debug ? 'ON' : 'OFF'}`, () => toggleSetting('debug'));

  if (!settings.enabled) return;

  function isMegacloudHost() {
    return HOSTNAME.includes('megacloud.blog') || HOSTNAME.includes('megacloud.tv') || HOSTNAME.includes('rapid-cloud.co');
  }

  function isVidsrcHost() {
    return HOSTNAME === 'vidsrc.cc' || HOSTNAME.endsWith('.vidsrc.cc');
  }

  function isSibnetHost() {
    return HOSTNAME === 'video.sibnet.ru' || HOSTNAME.endsWith('.sibnet.ru');
  }

  function isParentAnimePage() {
    if (!HOSTNAME.includes('atishramkhe.github.io')) return false;
    return /(^|\/)anime(\/|$)/.test(String(location.pathname || '').toLowerCase());
  }

  function readAnimeSkipSettings(malId) {
    if (!malId) return { skipIntro: true, skipOutro: true };
    try {
      const raw = JSON.parse(localStorage.getItem(`${ANIME_SKIP_SETTINGS_PREFIX}${malId}`) || 'null');
      if (!raw || typeof raw !== 'object') return { skipIntro: true, skipOutro: true };
      return {
        skipIntro: raw.skipIntro !== false,
        skipOutro: raw.skipOutro !== false,
      };
    } catch {
      return { skipIntro: true, skipOutro: true };
    }
  }

  function normalizePlayerInfo(input) {
    const source = input && typeof input === 'object' ? input : {};
    return {
      type: PLAYER_INFO_TYPE,
      malId: source.malId != null && source.malId !== '' ? String(source.malId) : '',
      aniListId: source.aniListId != null && source.aniListId !== '' ? String(source.aniListId) : '',
      episodeNumber: Number.isFinite(Number(source.episodeNumber)) && Number(source.episodeNumber) > 0
        ? Math.floor(Number(source.episodeNumber))
        : null,
      absoluteEpisodeNumber: Number.isFinite(Number(source.absoluteEpisodeNumber)) && Number(source.absoluteEpisodeNumber) > 0
        ? Math.floor(Number(source.absoluteEpisodeNumber))
        : null,
      seasonNumber: source.seasonNumber != null && source.seasonNumber !== '' ? String(source.seasonNumber) : null,
      skipIntro: source.skipIntro !== false,
      skipOutro: source.skipOutro !== false,
    };
  }

  function parseEmbedParams() {
    try {
      const url = new URL(window.location.href);
      return {
        malId: String(url.searchParams.get('ateaish_mal') || ''),
        token: String(url.searchParams.get('ateaish_token') || ''),
        episodeNumber: Number.isFinite(Number(url.searchParams.get('ateaish_ep')))
          ? Math.floor(Number(url.searchParams.get('ateaish_ep')))
          : null,
        seekSeconds: Number.isFinite(Number(url.searchParams.get('ateaish_seek')))
          ? Math.max(0, Math.floor(Number(url.searchParams.get('ateaish_seek'))))
          : null,
        skipIntro: url.searchParams.get('ateaish_skip_intro') === '1' || url.searchParams.get('autoSkipIntro') === 'true',
        skipOutro: url.searchParams.get('ateaish_skip_outro') === '1',
      };
    } catch {
      return { malId: '', token: '', episodeNumber: null, seekSeconds: null, skipIntro: false, skipOutro: false };
    }
  }

  function getAutoplayProfile() {
    if (isMegacloudHost()) {
      return {
        retryCount: 30,
        retryIntervalMs: 650,
        selectors: [
          '.bts-play', '#play-btn', '.play-button', '.btn-play',
          '.jw-icon-playback', '.jw-display-icon-container', '.jw-icon-display',
          '.vjs-big-play-button', '.plyr__control--overlaid',
          'button[aria-label="Play"]', '[class*="play"][class*="btn"]'
        ]
      };
    }

    if (isVidsrcHost()) {
      return {
        retryCount: 24,
        retryIntervalMs: 850,
        selectors: [
          '.jw-icon-playback', '.jw-display-icon-container', '.jw-icon-display',
          '.vjs-big-play-button', '.plyr__control--overlaid',
          'button[aria-label="Play"]'
        ]
      };
    }

    return {
      retryCount: 18,
      retryIntervalMs: 1000,
      selectors: [
        'button[aria-label="Play"]', '.play-button', '.btn-play',
        '.vjs-big-play-button', '.jw-icon-playback', '.jw-display-icon-container',
        '.jw-icon-display', '.plyr__control--overlaid', '[class*="play"][class*="btn"]'
      ]
    };
  }

  function isVisible(element) {
    if (!element) return false;
    if (element.offsetParent !== null) return true;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function clickVisibleSelector(selectors) {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (!isVisible(element)) continue;
      const lastClickAt = Number(element.__ateaishAutoClickedAt || 0);
      if (Date.now() - lastClickAt < 1200) continue;
      try {
        element.__ateaishAutoClickedAt = Date.now();
        element.click();
        log('Clicked selector', selector);
        return true;
      } catch {
        // ignore
      }
    }
    return false;
  }

  function clickMatchingButton(matcher) {
    const candidates = document.querySelectorAll('button, [role="button"], a, div, span, .jw-skip, .skip-intro, .skip-outro, [data-skip], [data-name*="skip" i], [data-testid*="skip" i], [class*="skip" i], [id*="skip" i]');
    for (const candidate of candidates) {
      if (!isVisible(candidate)) continue;
      const text = `${candidate.textContent || ''} ${candidate.getAttribute('aria-label') || ''} ${candidate.className || ''} ${candidate.id || ''}`.toLowerCase();
      if (!matcher(text, candidate)) continue;
      const lastClickAt = Number(candidate.__ateaishSkipClickedAt || 0);
      if (Date.now() - lastClickAt < 5000) continue;
      try {
        candidate.__ateaishSkipClickedAt = Date.now();
        candidate.click();
        log('Clicked skip button', text.trim());
        return true;
      } catch {
        // ignore
      }
    }
    return false;
  }

  function enforceUnmute(video) {
    if (!video) return;

    const apply = () => {
      try {
        video.muted = false;
        if (Number(video.volume) <= 0) video.volume = 1;
      } catch {
        // ignore
      }
    };

    apply();
    setTimeout(apply, 60);
    setTimeout(apply, 250);
    setTimeout(apply, 1200);
  }

  function postToTop(payload) {
    try {
      window.top.postMessage(payload, '*');
    } catch {
      // ignore
    }
  }

  function onReady(callback) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', callback, { once: true });
    } else {
      callback();
    }
  }

  function bootParentBridge() {
    let latestInfo = null;

    function deriveInfoFromIframe(iframe) {
      if (!iframe) return null;
      try {
        const src = iframe.getAttribute('src') || '';
        if (!src || src === 'about:blank') return null;
        const parsed = new URL(src, window.location.href);
        const malId = String(parsed.searchParams.get('ateaish_mal') || '');
        const episodeNumber = Number.isFinite(Number(parsed.searchParams.get('ateaish_ep')))
          ? Math.floor(Number(parsed.searchParams.get('ateaish_ep')))
          : null;
        const base = latestInfo ? { ...latestInfo } : {};
        const skipSettings = readAnimeSkipSettings(malId || base.malId || '');
        return normalizePlayerInfo({
          ...base,
          malId: malId || base.malId,
          episodeNumber: episodeNumber != null ? episodeNumber : base.episodeNumber,
          absoluteEpisodeNumber: episodeNumber != null ? episodeNumber : base.absoluteEpisodeNumber,
          skipIntro: skipSettings.skipIntro,
          skipOutro: skipSettings.skipOutro,
        });
      } catch {
        return latestInfo;
      }
    }

    function syncIframeInfo() {
      const iframe = document.getElementById('anime-player-iframe');
      if (!iframe || !iframe.contentWindow) return;
      const info = deriveInfoFromIframe(iframe);
      if (!info) return;
      latestInfo = info;
      try {
        iframe.contentWindow.postMessage(info, '*');
      } catch {
        // ignore
      }
    }

    window.addEventListener('message', (event) => {
      const message = event && event.data;
      if (!message || typeof message !== 'object') return;
      if (message.type !== PLAYER_INFO_TYPE) return;
      latestInfo = normalizePlayerInfo(message);
      syncIframeInfo();
    }, false);

    const observer = new MutationObserver(() => syncIframeInfo());

    onReady(() => {
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src']
      });

      const iframe = document.getElementById('anime-player-iframe');
      if (iframe) {
        iframe.addEventListener('load', () => {
          syncIframeInfo();
          setTimeout(syncIframeInfo, 250);
          setTimeout(syncIframeInfo, 1200);
        });
      }

      syncIframeInfo();
      setInterval(syncIframeInfo, 2000);
    });
  }

  function bootEmbedAutomation() {
    const embed = parseEmbedParams();
    const playerState = {
      malId: embed.malId,
      token: embed.token,
      episodeNumber: embed.episodeNumber,
      seasonNumber: null,
      skipIntro: embed.skipIntro,
      skipOutro: embed.skipOutro,
    };

    let lastProgressAt = 0;
    let lastEndedAt = 0;
    let seekApplied = false;

    function postProgress(video) {
      if (!settings.reportProgress) return;
      if (!playerState.malId || !playerState.token || !video) return;

      const now = Date.now();
      if (now - lastProgressAt < 1000) return;
      lastProgressAt = now;

      const currentTime = Number(video.currentTime);
      const duration = Number(video.duration);
      if (!Number.isFinite(currentTime) || currentTime < 0) return;
      if (!Number.isFinite(duration) || duration <= 0) return;

      postToTop({
        type: 'ateaish_player_progress',
        malId: playerState.malId,
        token: playerState.token,
        host: HOSTNAME,
        currentTime,
        duration,
      });
    }

    function postEnded(video) {
      if (!settings.autoNext) return;
      if (!playerState.malId || !playerState.token) return;
      const now = Date.now();
      if (now - lastEndedAt < 3000) return;
      lastEndedAt = now;

      if (video) {
        try {
          video.__ateaishPreEnded = true;
        } catch {
          // ignore
        }
      }

      postToTop({
        type: 'ateaish_player_ended',
        malId: playerState.malId,
        token: playerState.token,
        host: HOSTNAME,
        at: now,
      });
    }

    function maybeApplySeek(video) {
      if (seekApplied) return;
      if (!video || !Number.isFinite(Number(embed.seekSeconds)) || Number(embed.seekSeconds) <= 0) return;
      const apply = () => {
        try {
          if (!Number.isFinite(Number(video.duration)) || Number(video.duration) <= 0) return;
          video.currentTime = Math.min(Number(embed.seekSeconds), Math.max(0, Number(video.duration) - 1));
          seekApplied = true;
        } catch {
          // ignore
        }
      };

      if (video.readyState >= 1) apply();
      else video.addEventListener('loadedmetadata', apply, { once: true });
    }

    function maybePreEndMark(video) {
      if (!settings.autoNext || !video) return;
      const duration = Number(video.duration);
      const currentTime = Number(video.currentTime);
      if (!Number.isFinite(duration) || duration <= 0) return;
      if (!Number.isFinite(currentTime) || currentTime < 0) return;

      const remaining = duration - currentTime;
      const threshold = isSibnetHost() ? 1.0 : (isMegacloudHost() || isVidsrcHost() ? 0.75 : 0.5);

      try {
        if (remaining > 5) video.__ateaishPreEnded = false;
        if (video.__ateaishPreEnded) return;
        if (remaining <= threshold) postEnded(video);
      } catch {
        // ignore
      }
    }

    function forceAutoplay(video) {
      if (!settings.forceAutoplay || !video) return;
      if (video.__ateaishAutoplayStarted) return;
      video.__ateaishAutoplayStarted = true;

      const profile = getAutoplayProfile();
      let attempts = 0;

      const tick = () => {
        attempts += 1;

        try {
          if (!video.playsInline) video.playsInline = true;
          video.setAttribute('playsinline', '');
          video.setAttribute('webkit-playsinline', '');
        } catch {
          // ignore
        }

        try {
          if (!video.paused && !video.ended && Number(video.readyState) >= 2) {
            postProgress(video);
            return true;
          }
        } catch {
          // ignore
        }

        try {
          video.muted = false;
          if (Number(video.volume) <= 0) video.volume = 1;
          const playResult = video.play();
          if (playResult && typeof playResult.catch === 'function') {
            playResult.catch(() => {
              try {
                video.muted = true;
                return video.play().catch(() => {});
              } catch {
                return null;
              }
            });
          }
        } catch {
          // ignore
        }

        const clicked = clickVisibleSelector(profile.selectors);
        if (!clicked) {
          clickMatchingButton((text) => text.includes('play') && !text.includes('display: none'));
        }

        try {
          if (!video.paused && !video.ended && Number(video.readyState) >= 2) {
            enforceUnmute(video);
            postProgress(video);
            return true;
          }
        } catch {
          // ignore
        }

        return false;
      };

      tick();
      const interval = setInterval(() => {
        if (tick() || attempts >= profile.retryCount) clearInterval(interval);
      }, profile.retryIntervalMs);
    }

    function scanAndClickSkipButtons() {
      if (!settings.autoSkip) return;
      if (playerState.skipIntro) {
        clickMatchingButton((text, element) => {
          const attr = String(element.getAttribute('data-skip') || '').toLowerCase();
          const dataName = String(element.getAttribute('data-name') || '').toLowerCase();
          const testId = String(element.getAttribute('data-testid') || '').toLowerCase();
          return attr === 'intro'
            || dataName.includes('skip-intro')
            || testId.includes('skip-intro')
            || text.includes('skip intro')
            || text.includes('skip opening')
            || text.includes('skip op')
            || text.includes('intro') && text.includes('skip');
        });
      }

      if (playerState.skipOutro) {
        clickMatchingButton((text, element) => {
          const attr = String(element.getAttribute('data-skip') || '').toLowerCase();
          const dataName = String(element.getAttribute('data-name') || '').toLowerCase();
          const testId = String(element.getAttribute('data-testid') || '').toLowerCase();
          return attr === 'outro'
            || dataName.includes('skip-outro')
            || dataName.includes('skip-ending')
            || testId.includes('skip-outro')
            || testId.includes('skip-ending')
            || text.includes('skip outro')
            || text.includes('skip ending')
            || text.includes('skip ed')
            || text.includes('outro') && text.includes('skip')
            || text.includes('ending') && text.includes('skip');
        });
      }
    }

    function attachVideo(video) {
      if (!video || video.__ateaishAutomationAttached) return;
      video.__ateaishAutomationAttached = true;

      maybeApplySeek(video);
      forceAutoplay(video);
      enforceUnmute(video);
      postProgress(video);

      video.addEventListener('loadedmetadata', () => {
        maybeApplySeek(video);
        forceAutoplay(video);
        enforceUnmute(video);
        postProgress(video);
      }, { passive: true });
      video.addEventListener('canplay', () => forceAutoplay(video), { passive: true });
      video.addEventListener('playing', () => {
        enforceUnmute(video);
        postProgress(video);
        maybePreEndMark(video);
      }, { passive: true });
      video.addEventListener('play', () => {
        enforceUnmute(video);
        postProgress(video);
      }, { passive: true });
      video.addEventListener('pause', () => postProgress(video), { passive: true });
      video.addEventListener('timeupdate', () => {
        postProgress(video);
        maybePreEndMark(video);
      }, { passive: true });
      video.addEventListener('durationchange', () => postProgress(video), { passive: true });
      video.addEventListener('ended', () => postEnded(video), { passive: true });
    }

    function scanVideos() {
      document.querySelectorAll('video').forEach((video) => attachVideo(video));
    }

    window.addEventListener('message', (event) => {
      const message = event && event.data;
      if (!message || typeof message !== 'object') return;

      if (message.type === PLAYER_INFO_TYPE) {
        const normalized = normalizePlayerInfo(message);
        if (normalized.malId) playerState.malId = normalized.malId;
        if (normalized.episodeNumber != null) playerState.episodeNumber = normalized.episodeNumber;
        if (normalized.seasonNumber != null) playerState.seasonNumber = normalized.seasonNumber;
        playerState.skipIntro = normalized.skipIntro;
        playerState.skipOutro = normalized.skipOutro;
        return;
      }

      if (message.type === 'PLAYER_EVENT' && message.data && typeof message.data === 'object') {
        const eventName = String(message.data.event || '').toLowerCase();
        if (eventName === 'complete') postEnded(null);
      }
    }, false);

    onReady(() => {
      scanVideos();
      scanAndClickSkipButtons();

      const observer = new MutationObserver(() => {
        scanVideos();
        scanAndClickSkipButtons();
      });

      observer.observe(document.documentElement, { childList: true, subtree: true });

      setInterval(() => {
        scanVideos();
        scanAndClickSkipButtons();
      }, 800);
    });
  }

  if (isParentAnimePage()) {
    bootParentBridge();
  } else {
    bootEmbedAutomation();
  }
})();