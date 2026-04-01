// ==UserScript==
// @name         Ateaish Anime Player Automation
// @namespace    https://atishramkhe.github.io/
// @version      0.1.2
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

  function readStorageFallback(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function writeStorageFallback(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  function gmGetValueOrFallback(key, fallbackValue) {
    try {
      if (typeof GM_getValue === 'function') {
        return GM_getValue(key, fallbackValue);
      }
    } catch {
      // ignore
    }

    const fallback = readStorageFallback(key);
    return fallback == null ? fallbackValue : fallback;
  }

  function gmSetValueOrFallback(key, value) {
    try {
      if (typeof GM_setValue === 'function') {
        GM_setValue(key, value);
        return true;
      }
    } catch {
      // ignore
    }

    return writeStorageFallback(key, value);
  }

  function registerMenuCommandSafe(label, handler) {
    try {
      if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand(label, handler);
        return true;
      }
    } catch {
      // ignore
    }

    try {
      const gmNamespace = typeof GM === 'object' && GM ? GM : null;
      if (gmNamespace && typeof gmNamespace.registerMenuCommand === 'function') {
        gmNamespace.registerMenuCommand(label, handler);
        return true;
      }
    } catch {
      // ignore
    }

    return false;
  }

  function loadSettings() {
    try {
      const saved = gmGetValueOrFallback(SETTINGS_KEY, null);
      if (!saved) return { ...DEFAULTS };
      const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved;
      return { ...DEFAULTS, ...(parsed || {}) };
    } catch {
      return { ...DEFAULTS };
    }
  }

  function saveSettings(next) {
    try {
      gmSetValueOrFallback(SETTINGS_KEY, JSON.stringify(next));
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

  registerMenuCommandSafe(`Enabled: ${settings.enabled ? 'ON' : 'OFF'}`, () => toggleSetting('enabled'));
  registerMenuCommandSafe(`Force autoplay: ${settings.forceAutoplay ? 'ON' : 'OFF'}`, () => toggleSetting('forceAutoplay'));
  registerMenuCommandSafe(`Auto skip buttons: ${settings.autoSkip ? 'ON' : 'OFF'}`, () => toggleSetting('autoSkip'));
  registerMenuCommandSafe(`Report progress: ${settings.reportProgress ? 'ON' : 'OFF'}`, () => toggleSetting('reportProgress'));
  registerMenuCommandSafe(`Auto next: ${settings.autoNext ? 'ON' : 'OFF'}`, () => toggleSetting('autoNext'));
  registerMenuCommandSafe(`Debug logs: ${settings.debug ? 'ON' : 'OFF'}`, () => toggleSetting('debug'));

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

  function dispatchClick(element) {
    if (!element) return false;
    try {
      ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((type) => {
        element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
      });
      return true;
    } catch {
      try {
        element.click();
        return true;
      } catch {
        return false;
      }
    }
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

  function collectSearchRoots(root = document, seen = new Set(), roots = []) {
    if (!root || seen.has(root)) return roots;
    seen.add(root);
    roots.push(root);

    let elements = [];
    try {
      if (typeof root.querySelectorAll === 'function') {
        elements = Array.from(root.querySelectorAll('*'));
      }
    } catch {
      elements = [];
    }

    for (const element of elements) {
      try {
        if (element.shadowRoot) {
          collectSearchRoots(element.shadowRoot, seen, roots);
        }
      } catch {
        // ignore shadow access failures
      }

      if (String(element.tagName || '').toLowerCase() !== 'iframe') continue;
      try {
        const iframeDoc = element.contentDocument;
        if (iframeDoc && iframeDoc.documentElement) {
          collectSearchRoots(iframeDoc, seen, roots);
        }
      } catch {
        // Cross-origin iframe; ignore.
      }
    }

    return roots;
  }

  function getSearchRoots() {
    return collectSearchRoots(document);
  }

  function querySelectorDeep(selectors) {
    const list = Array.isArray(selectors) ? selectors : [selectors];
    const roots = getSearchRoots();
    for (const selector of list) {
      for (const root of roots) {
        try {
          const match = root.querySelector(selector);
          if (match) return match;
        } catch {
          // ignore invalid selector/root pairs
        }
      }
    }
    return null;
  }

  function querySelectorAllDeep(selector) {
    const results = [];
    const seen = new Set();
    const roots = getSearchRoots();
    for (const root of roots) {
      let matches = [];
      try {
        matches = Array.from(root.querySelectorAll(selector));
      } catch {
        matches = [];
      }
      for (const match of matches) {
        if (seen.has(match)) continue;
        seen.add(match);
        results.push(match);
      }
    }
    return results;
  }

  function clickVisibleSelector(selectors) {
    for (const selector of selectors) {
      const element = querySelectorDeep(selector);
      if (!isVisible(element)) continue;
      const lastClickAt = Number(element.__ateaishAutoClickedAt || 0);
      if (Date.now() - lastClickAt < 1200) continue;
      try {
        element.__ateaishAutoClickedAt = Date.now();
        dispatchClick(element);
        log('Clicked selector', selector);
        return true;
      } catch {
        // ignore
      }
    }
    return false;
  }

  function clickMatchingButton(matcher) {
    const candidates = querySelectorAllDeep('button, [role="button"], a, div, span, .jw-skip, .skip-intro, .skip-outro, [data-skip], [data-name*="skip" i], [data-testid*="skip" i], [class*="skip" i], [id*="skip" i], [aria-label*="skip" i], [title*="skip" i]');
    for (const candidate of candidates) {
      if (!isVisible(candidate)) continue;
      const text = `${candidate.textContent || ''} ${candidate.getAttribute('aria-label') || ''} ${candidate.className || ''} ${candidate.id || ''}`.toLowerCase();
      if (!matcher(text, candidate)) continue;
      const lastClickAt = Number(candidate.__ateaishSkipClickedAt || 0);
      if (Date.now() - lastClickAt < 5000) continue;
      try {
        candidate.__ateaishSkipClickedAt = Date.now();
        dispatchClick(candidate);
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

    function getCurrentStatePayload() {
      return {
        malId: playerState.malId,
        token: playerState.token,
        host: HOSTNAME,
      };
    }

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
        ...getCurrentStatePayload(),
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

    function postJwProgress(player) {
      if (!settings.reportProgress) return;
      if (!playerState.malId || !playerState.token || !player) return;
      const now = Date.now();
      if (now - lastProgressAt < 1000) return;
      lastProgressAt = now;
      try {
        const currentTime = Number(player.getPosition());
        const duration = Number(player.getDuration());
        if (!Number.isFinite(currentTime) || currentTime < 0) return;
        if (!Number.isFinite(duration) || duration <= 0) return;
        postToTop({
          type: 'ateaish_player_progress',
          ...getCurrentStatePayload(),
          currentTime,
          duration,
        });
      } catch {
        // ignore
      }
    }

    function maybePreEndJwPlayer(player) {
      if (!settings.autoNext || !player) return;
      try {
        const duration = Number(player.getDuration());
        const currentTime = Number(player.getPosition());
        if (!Number.isFinite(duration) || duration <= 0) return;
        if (!Number.isFinite(currentTime) || currentTime < 0) return;
        const remaining = duration - currentTime;
        if (remaining <= 0.75) postEnded(null);
      } catch {
        // ignore
      }
    }

    function maybeApplyJwSeek(player) {
      if (seekApplied) return;
      if (!player || !Number.isFinite(Number(embed.seekSeconds)) || Number(embed.seekSeconds) <= 0) return;
      try {
        const duration = Number(player.getDuration());
        if (!Number.isFinite(duration) || duration <= 0) return;
        player.seek(Math.min(Number(embed.seekSeconds), Math.max(0, duration - 1)));
        seekApplied = true;
      } catch {
        // ignore
      }
    }

    function forceJwAutoplay(player) {
      if (!settings.forceAutoplay || !player) return;
      try {
        if (typeof player.setMute === 'function') player.setMute(false);
        if (typeof player.setVolume === 'function') player.setVolume(100);
        if (typeof player.play === 'function') player.play(true);
      } catch {
        // ignore
      }
    }

    function attachJwPlayer(player) {
      if (!player || player.__ateaishAutomationAttached) return;
      player.__ateaishAutomationAttached = true;

      const onReadyLike = () => {
        forceJwAutoplay(player);
        maybeApplyJwSeek(player);
        scanAndClickSkipButtons();
        postJwProgress(player);
      };

      try { player.on('ready', onReadyLike); } catch { }
      try { player.on('playlistItem', onReadyLike); } catch { }
      try { player.on('play', () => { forceJwAutoplay(player); postJwProgress(player); }); } catch { }
      try { player.on('buffer', () => forceJwAutoplay(player)); } catch { }
      try { player.on('firstFrame', () => { forceJwAutoplay(player); postJwProgress(player); }); } catch { }
      try { player.on('time', () => { postJwProgress(player); maybePreEndJwPlayer(player); }); } catch { }
      try { player.on('complete', () => postEnded(null)); } catch { }

      onReadyLike();
    }

    function scanJwPlayers() {
      if (typeof window.jwplayer !== 'function') return;
      const seen = new Set();
      const candidates = [];

      try {
        const primary = window.jwplayer();
        if (primary) candidates.push(primary);
      } catch { }

      document.querySelectorAll('[id]').forEach((element) => {
        const id = String(element.id || '').trim();
        if (!id) return;
        try {
          const player = window.jwplayer(id);
          if (player) candidates.push(player);
        } catch { }
      });

      candidates.forEach((player) => {
        if (!player || typeof player.getContainer !== 'function') return;
        let key = null;
        try {
          const container = player.getContainer();
          key = container || player.id || player;
        } catch {
          key = player;
        }
        if (seen.has(key)) return;
        seen.add(key);
        attachJwPlayer(player);
      });
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
      scanJwPlayers();
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
