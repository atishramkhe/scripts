// ==UserScript==
// @name         Ateaish Anime — vidsrc Automation
// @namespace    https://atishramkhe.github.io/
// @version      2.2.0
// @description  Autoplay, auto-next, and auto-skip intro/outro for vidsrc.cc anime embeds.
// @author       you
// @run-at       document-start
// @match        https://vidsrc.cc/*
// @match        https://*.vidsrc.cc/*
// @match        https://*.vidbox.site/*
// @match        https://rapid-cloud.co/*
// @match        https://*.rapid-cloud.co/*
// @match        https://atishramkhe.github.io/*
// @match        http://localhost/*
// @match        http://127.0.0.1/*
// @allFrames    true
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  if (window.__ateaishVidsrcAutomation) return;
  window.__ateaishVidsrcAutomation = true;

  // ─────────────────────────────────────────────────────────────────────────
  // On-screen debug terminal
  //
  // Runs in TWO contexts:
  //  • Inside vidsrc.cc iframe  → posts log lines to window.top via postMessage
  //  • On the parent anime page → listens for those messages and renders the box
  //    (injected by bootParentTerminal below, called from the parent-page branch)
  // ─────────────────────────────────────────────────────────────────────────

  const DBG_MSG = '__ateaish_dbg_line';

  function dbg(...args) {
    const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    console.log('[ateaish]', msg);
    // Post to parent so the terminal rendered on the anime page picks it up
    try { window.top.postMessage({ type: DBG_MSG, msg, ts: new Date().toISOString().slice(11, 23) }, '*'); } catch { }
  }

  // ── Parent-page terminal (only bootstrapped when running on the anime page) ──
  function bootParentTerminal() {
    let box = null;
    let lines = [];
    const MAX = 120;

    function ensureBox() {
      if (box && document.body && document.body.contains(box)) return box;
      box = document.createElement('div');
      box.id = '__ateaish_dbg_parent';
      Object.assign(box.style, {
        position: 'fixed', bottom: '0', right: '0', width: '480px',
        maxHeight: '40vh', overflowY: 'auto',
        background: 'rgba(0,0,0,0.92)', color: '#0f0',
        fontFamily: 'monospace', fontSize: '11px', lineHeight: '1.5',
        padding: '4px 6px', zIndex: '2147483647',
        pointerEvents: 'auto', userSelect: 'text',
        borderTop: '2px solid #0f0', borderLeft: '2px solid #0f0',
      });

      const toolbar = document.createElement('div');
      Object.assign(toolbar.style, { display: 'flex', gap: '6px', marginBottom: '3px', position: 'sticky', top: '0', background: 'rgba(0,0,0,0.95)', padding: '2px 0' });

      const copyBtn = document.createElement('button');
      copyBtn.textContent = '⎘ copy all';
      Object.assign(copyBtn.style, { background: '#111', color: '#0f0', border: '1px solid #0f0', fontSize: '10px', cursor: 'pointer', padding: '1px 6px' });
      copyBtn.addEventListener('click', () => {
        try { navigator.clipboard.writeText(lines.map(l => `${l.ts} ${l.msg}`).join('\n')); } catch { }
      });

      const clearBtn = document.createElement('button');
      clearBtn.textContent = '✕ clear';
      Object.assign(clearBtn.style, { background: '#111', color: '#f80', border: '1px solid #f80', fontSize: '10px', cursor: 'pointer', padding: '1px 6px' });
      clearBtn.addEventListener('click', () => { lines = []; Array.from(box.querySelectorAll('.dbg-line')).forEach(el => el.remove()); });

      const closeBtn = document.createElement('button');
      closeBtn.textContent = '✕ close';
      Object.assign(closeBtn.style, { background: '#111', color: '#f44', border: '1px solid #f44', fontSize: '10px', cursor: 'pointer', padding: '1px 6px', marginLeft: 'auto' });
      closeBtn.addEventListener('click', () => box.remove());

      toolbar.appendChild(copyBtn);
      toolbar.appendChild(clearBtn);
      toolbar.appendChild(closeBtn);
      box.appendChild(toolbar);
      document.body.appendChild(box);
      return box;
    }

    window.addEventListener('message', (event) => {
      const msg = event && event.data;
      if (!msg || msg.type !== DBG_MSG) return;
      lines.push({ ts: msg.ts, msg: msg.msg });
      if (lines.length > MAX) lines.shift();
      const b = ensureBox();
      const color = msg.msg.includes('CLICKING') || msg.msg.includes('ended') ? '#ff0' :
                    msg.msg.includes('suppressed') ? '#f80' : '#0f0';
      const line = document.createElement('div');
      line.className = 'dbg-line';
      line.textContent = `${msg.ts} ${msg.msg}`;
      line.style.color = color;
      line.style.borderBottom = '1px solid #111';
      b.appendChild(line);
      b.scrollTop = b.scrollHeight;
    }, false);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Constants
  // ─────────────────────────────────────────────────────────────────────────

  const MSG_INFO     = 'ateaish_anime_player_info';
  const MSG_PROGRESS = 'ateaish_player_progress';
  const MSG_ENDED    = 'ateaish_player_ended';
  const HOSTNAME     = String(location.hostname || '').toLowerCase();

  // ─────────────────────────────────────────────────────────────────────────
  // URL params — read once; parent can override via postMessage
  // ─────────────────────────────────────────────────────────────────────────

  function parseParams() {
    try {
      const p = new URL(location.href).searchParams;
      return {
        malId:       String(p.get('ateaish_mal')   || ''),
        token:       String(p.get('ateaish_token') || ''),
        episode:     Number.isFinite(Number(p.get('ateaish_ep'))) ? Math.floor(Number(p.get('ateaish_ep'))) : null,
        seekSeconds: Number.isFinite(Number(p.get('ateaish_seek'))) && Number(p.get('ateaish_seek')) > 0
          ? Math.floor(Number(p.get('ateaish_seek'))) : null,
        skipIntro:   p.get('ateaish_skip_intro') === '1' || p.get('autoSkipIntro') === 'true',
        skipOutro:   p.get('ateaish_skip_outro') === '1',
      };
    } catch {
      return { malId: '', token: '', episode: null, seekSeconds: null, skipIntro: false, skipOutro: false };
    }
  }

  const embed = parseParams();

  // Mutable — updated by postMessage from parent
  const state = {
    malId:     embed.malId,
    token:     embed.token,
    episode:   embed.episode,
    season:    null,
    skipIntro: embed.skipIntro,
    skipOutro: embed.skipOutro,
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  function postToTop(payload) {
    try { window.top.postMessage(payload, '*'); } catch { }
  }

  function base() {
    return { malId: state.malId, token: state.token, host: HOSTNAME };
  }

  function dispatchClick(el) {
    if (!el) return false;
    try {
      for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
        el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
      }
      return true;
    } catch {
      try { el.click(); return true; } catch { return false; }
    }
  }

  function isVisible(el) {
    if (!el) return false;
    if (el.offsetParent !== null) return true;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Autoplay
  // ─────────────────────────────────────────────────────────────────────────

  // vidsrc.cc play button selectors (in priority order)
  const PLAY_SELECTORS = [
    // vidsrc.cc — server selector button (must click to load the player)
    '.main-btn.server-btn', '.main-btn',
    '#pl_but', '#pl_but button', '#pl_but svg',
    '.jw-display-icon-container', '.jw-icon-display', '.jw-icon-playback',
    '.vjs-big-play-button', '.plyr__control--overlaid',
    '.big-play-button', '.play-button', '.play-btn',
    'button[aria-label="Play"]', '[aria-label*="play" i]',
  ];

  function tryClickPlayButton() {
    for (const sel of PLAY_SELECTORS) {
      try {
        const el = document.querySelector(sel);
        if (!el || !isVisible(el)) continue;
        const lastAt = Number(el.__ateaishClickedAt || 0);
        if (Date.now() - lastAt < 1500) continue;
        el.__ateaishClickedAt = Date.now();
        dispatchClick(el);
        return true;
      } catch { }
    }
    return false;
  }

  function forcePlay(video) {
    if (!video || !video.paused) return;
    try { video.muted = false; if (video.volume <= 0) video.volume = 1; } catch { }
    const p = video.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => { try { video.muted = true; video.play().catch(() => {}); } catch { } });
    }
  }

  function enforceUnmute(video) {
    if (!video) return;
    try { video.muted = false; if (video.volume <= 0) video.volume = 1; } catch { }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Seek-to-resume
  // ─────────────────────────────────────────────────────────────────────────

  let seekApplied = false;

  function applySeek(video) {
    if (seekApplied || !video || !embed.seekSeconds) return;
    const apply = () => {
      try {
        if (!Number.isFinite(video.duration) || video.duration <= 0) return;
        video.currentTime = Math.min(embed.seekSeconds, video.duration - 2);
        seekApplied = true;
      } catch { }
    };
    if (video.readyState >= 1) apply();
    else video.addEventListener('loadedmetadata', apply, { once: true });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Progress reporting
  // ─────────────────────────────────────────────────────────────────────────

  let lastProgressAt = 0;

  function reportProgress(video, force) {
    if (!state.malId || !state.token || !video) return;
    const now = Date.now();
    if (!force && now - lastProgressAt < 600) return;
    lastProgressAt = now;
    const t = Number(video.currentTime), d = Number(video.duration);
    if (!Number.isFinite(t) || t < 0 || !Number.isFinite(d) || d <= 0) return;
    postToTop({ type: MSG_PROGRESS, ...base(), currentTime: t, duration: d, force: !!force });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Auto-next (episode ended)
  // ─────────────────────────────────────────────────────────────────────────

  let lastEndedAt = 0;

  function reportEnded() {
    if (!state.malId || !state.token) {
      dbg('[ateaish ended] suppressed — no malId/token. malId:', state.malId, 'token:', state.token);
      return;
    }
    const now = Date.now();
    if (now - lastEndedAt < 3000) {
      dbg('[ateaish ended] debounced, last was', (now - lastEndedAt), 'ms ago');
      return;
    }
    lastEndedAt = now;
    dbg('[ateaish ended] posting MSG_ENDED to top — malId:', state.malId);
    postToTop({ type: MSG_ENDED, ...base(), at: now });
  }

  function checkNearEnd(video) {
    if (!video) return;
    const d = Number(video.duration), t = Number(video.currentTime);
    if (!Number.isFinite(d) || d <= 0 || !Number.isFinite(t)) return;
    const remaining = d - t;
    if (remaining <= 5) {
      dbg('[ateaish near-end] remaining:', remaining.toFixed(2), 's — threshold 0.75 s');
    }
    if (remaining <= 0.75) reportEnded();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Auto-skip intro / outro
  //
  // vidsrc.cc uses `.zbtn.zbtn-outline` buttons with text "Skip Intro" /
  // "Skip Outro". We target that class first, then fall back to text matching.
  // ─────────────────────────────────────────────────────────────────────────

  const INTRO_WORDS = ['skip intro', 'skip opening', 'skip op', 'passer intro', "passer l'intro"];
  const OUTRO_WORDS = ['skip outro', 'skip ending', 'skip credits', 'passer outro', 'passer ending', "passer l'outro"];

  function scanAndClickSkip() {
    if (!state.skipIntro && !state.skipOutro) return;

    const candidates = Array.from(document.querySelectorAll(
      '.zbtn.zbtn-outline, button, [role="button"], .jw-skip, [class*="skip" i]'
    ));

    for (const el of candidates) {
      const visible = isVisible(el);
      if (!visible) continue;
      const lastAt = Number(el.__ateaishSkipAt || 0);
      if (Date.now() - lastAt < 5000) continue;
      const text = `${el.textContent || ''} ${el.getAttribute('aria-label') || ''} ${el.className || ''} ${el.id || ''}`.toLowerCase().trim();
      const dataSkip = String(el.getAttribute('data-skip') || '').toLowerCase();

      dbg('[ateaish skip] candidate', el.tagName, JSON.stringify(el.className), 'text:', JSON.stringify(text.slice(0, 80)), 'data-skip:', dataSkip);

      let shouldClick = false;
      if (state.skipIntro && (dataSkip === 'intro' || INTRO_WORDS.some(w => text.includes(w)))) shouldClick = true;
      if (state.skipOutro && (dataSkip === 'outro' || OUTRO_WORDS.some(w => text.includes(w)))) shouldClick = true;

      if (shouldClick) {
        dbg('[ateaish skip] CLICKING', el.tagName, JSON.stringify(el.className), text.slice(0, 60));
        el.__ateaishSkipAt = Date.now();
        dispatchClick(el);
        return; // one click per tick
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // JW Player support (vidsrc.cc uses JWP internally)
  // ─────────────────────────────────────────────────────────────────────────

  const attachedJw = new Set();

  function attachJwPlayer(player) {
    if (!player || attachedJw.has(player)) return;
    attachedJw.add(player);
    try {
      if (typeof player.setMute   === 'function') player.setMute(false);
      if (typeof player.setVolume === 'function') player.setVolume(100);
      if (typeof player.play      === 'function') player.play(true);
    } catch { }
    try {
      player.on('time', () => {
        if (!state.malId || !state.token) return;
        const t = player.getPosition(), d = player.getDuration();
        if (!Number.isFinite(t) || !Number.isFinite(d) || d <= 0) return;
        const now = Date.now();
        if (now - lastProgressAt < 600) return;
        lastProgressAt = now;
        postToTop({ type: MSG_PROGRESS, ...base(), currentTime: t, duration: d });
        if (d - t <= 0.75) reportEnded();
      });
    } catch { }
    try { player.on('complete', () => { dbg('[ateaish jw] complete event'); reportEnded(); }); } catch { }
    try {
      player.on('play', () => {
        try { player.setMute(false); player.setVolume(100); } catch { }
      });
    } catch { }
  }

  function scanJwPlayers() {
    if (typeof window.jwplayer !== 'function') return;
    try {
      const p = window.jwplayer();
      if (p && typeof p.getContainer === 'function') attachJwPlayer(p);
    } catch { }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Video attachment
  // ─────────────────────────────────────────────────────────────────────────

  const attachedVideos = new WeakSet();

  function attachVideo(video) {
    if (!video || attachedVideos.has(video)) return;
    attachedVideos.add(video);

    applySeek(video);
    forcePlay(video);
    enforceUnmute(video);

    video.addEventListener('loadedmetadata', () => { applySeek(video); forcePlay(video); enforceUnmute(video); }, { passive: true });
    video.addEventListener('canplay',        () => forcePlay(video), { passive: true });
    video.addEventListener('play',           () => { enforceUnmute(video); reportProgress(video); }, { passive: true });
    video.addEventListener('playing',        () => { enforceUnmute(video); reportProgress(video); }, { passive: true });
    video.addEventListener('pause',          () => reportProgress(video, true), { passive: true });
    video.addEventListener('timeupdate',     () => { reportProgress(video); checkNearEnd(video); }, { passive: true });
    video.addEventListener('durationchange', () => reportProgress(video), { passive: true });
    video.addEventListener('ended',          () => { reportProgress(video, true); reportEnded(); }, { passive: true });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // State relay — push our state down into any child iframes
  // (needed because the inner player's URL doesn't carry ateaish_* params)
  // ─────────────────────────────────────────────────────────────────────────

  function relayStateToChildren() {
    if (!state.malId) return;
    const frames = document.querySelectorAll('iframe');
    if (!frames.length) return;
    const payload = {
      type: MSG_INFO,
      malId: state.malId, token: state.token,
      episodeNumber: state.episode,
      skipIntro: state.skipIntro, skipOutro: state.skipOutro,
    };
    for (const f of Array.from(frames)) {
      try { f.contentWindow.postMessage(payload, '*'); } catch { }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Main scan — called on boot and every 800 ms
  // ─────────────────────────────────────────────────────────────────────────

  function scan() {
    // Attach any new <video> elements
    for (const v of Array.from(document.querySelectorAll('video'))) attachVideo(v);

    // JW Player
    scanJwPlayers();

    // If no video is playing yet, try clicking the play button.
    // Once a child iframe is present (player loaded), stop trying — the video
    // is inside that cross-origin frame and we cannot reach it from here.
    const v = document.querySelector('video');
    if (v) {
      if (v.paused && !v.ended) forcePlay(v);
      enforceUnmute(v);
    } else if (!document.querySelector('iframe')) {
      tryClickPlayButton();
    }

    // Relay our state (malId/token/skip) into any child iframes so the
    // script running inside those frames can report progress/ended.
    relayStateToChildren();

    // Skip intro / outro
    scanAndClickSkip();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // postMessage listener — parent updates state (skip settings, token, etc.)
  // ─────────────────────────────────────────────────────────────────────────

  window.addEventListener('message', (event) => {
    const msg = event && event.data;
    if (!msg || typeof msg !== 'object' || msg.type !== MSG_INFO) return;
    if (msg.malId)              state.malId    = String(msg.malId);
    if (msg.token)              state.token    = String(msg.token);
    if (msg.episodeNumber != null) state.episode = Number(msg.episodeNumber);
    if (msg.seasonNumber  != null) state.season  = String(msg.seasonNumber);
    state.skipIntro = msg.skipIntro !== false;
    state.skipOutro = msg.skipOutro !== false;
    dbg('[ateaish state] updated via postMessage — malId:', state.malId, 'token:', state.token, 'skipIntro:', state.skipIntro, 'skipOutro:', state.skipOutro, 'ep:', state.episode);
    // Immediately relay to inner player frames if we're the outer vidsrc embed
    relayStateToChildren();
  }, false);

  // ─────────────────────────────────────────────────────────────────────────
  // Boot
  // ─────────────────────────────────────────────────────────────────────────

  function boot() {
    dbg('[ateaish] booted on', HOSTNAME, '— state:', JSON.stringify(state));
    scan();
    // NOTE: No MutationObserver — it caused an infinite loop because dbg() itself
    // mutates the DOM, which re-triggered scan(), which called dbg() again, etc.
    // The 800 ms interval is sufficient for skip detection and autoplay.
    setInterval(scan, 800);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Entry point — two contexts handled by one script
  // ─────────────────────────────────────────────────────────────────────────

  // Top frame = the anime page. Any nested frame = run full automation.
  // We can't restrict to isVidsrc because the actual player loads inside a
  // cross-origin iframe (videasy, filemoon, etc.) that isn't *.vidsrc.cc.
  const isTopFrame = window.top === window;

  if (isTopFrame) {
    // Running on the parent anime page — only listen for debug log messages.
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bootParentTerminal, { once: true });
    } else {
      bootParentTerminal();
    }
  } else {
    // Running inside any iframe (outer vidsrc.cc embed OR inner player).
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
      boot();
    }
  }

})();
