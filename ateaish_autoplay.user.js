// ==UserScript==
// @name         Videasy + Vidsrc Autoplay
// @namespace    http://tampermonkey.net/
// @version      1.8
// @description  Automatically clicks play on supported movie hosts, reports progress for vidsrc.online, and advances to the next episode for TV playback
// @author       Ateaish
// @match        https://atishramkhe.github.io/movies/*
// @match        https://player.videasy.net/*
// @match        https://vidsrc.online/*
// @match        https://vidsrc-embed.ru/embed/*
// @match        https://cloudnestra.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const hostName = location.hostname.replace(/^www\./, '');
    const MOVIES_HOST = 'atishramkhe.github.io';
    const VIDEASY_HOST = 'player.videasy.net';
    const VIDSRC_ONLINE_HOST = 'vidsrc.online';
    const VIDSRC_EMBED_HOST = 'vidsrc-embed.ru';
    const CLOUDNESTRA_HOST = 'cloudnestra.com';
    const MESSAGE_SOURCE = 'ateaish-autoplay';
    const ENDED_MESSAGE_TYPE = 'ateaish_movies_source_ended';
    const PROGRESS_INTERVAL_MS = 1500;
    const AUTOPLAY_RETRY_MS = 1200;
    let lastAutoplayAttemptAt = 0;

    function isMoviesPage() {
        return hostName === MOVIES_HOST && location.pathname.startsWith('/movies/');
    }

    function isVideasyPage() {
        return hostName === VIDEASY_HOST;
    }

    function isVidsrcOnlinePage() {
        return hostName === VIDSRC_ONLINE_HOST;
    }

    function isVidsrcEmbedPage() {
        return hostName === VIDSRC_EMBED_HOST;
    }

    function isCloudnestraPage() {
        return hostName === CLOUDNESTRA_HOST;
    }

    function isGenericPlayerHost() {
        return isVidsrcEmbedPage() || isCloudnestraPage();
    }

    function isVisible(element) {
        if (!element) return false;
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        if (element.offsetParent !== null) return true;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    function triggerElementClick(element) {
        if (!element) return false;

        try {
            element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, view: window }));
        } catch {
            // ignore
        }
        try {
            element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
        } catch {
            // ignore
        }
        try {
            element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
        } catch {
            // ignore
        }
        try {
            element.click();
            return true;
        } catch {
            return false;
        }
    }

    function findVideasyPlayButton() {
        const buttons = document.querySelectorAll('button');

        for (const button of buttons) {
            if (button.disabled || !isVisible(button)) continue;

            const playIconPath = button.querySelector('svg path');
            if (!playIconPath || playIconPath.getAttribute('d') !== 'M8 5v14l11-7z') continue;

            const wrapper = button.parentElement;
            const nearbyText = wrapper && wrapper.querySelectorAll('p').length >= 2;
            if (!nearbyText) continue;

            return button;
        }

        return null;
    }

    function clickVideasyPlayButton() {
        const playBtn = findVideasyPlayButton();
        if (playBtn && !playBtn.dataset.ateaishAutoplayClicked) {
            playBtn.dataset.ateaishAutoplayClicked = 'true';
            triggerElementClick(playBtn);
        }
    }

    function clickVidsrcPlayButton() {
        const selectors = [
            '#btn-play',
            'button#btn-play',
            '[data-jwplayer-id="btn-play"]',
            '.btn-play',
            '.jw-icon-playback',
            '.jw-display-icon-container',
            '.jw-icon-display',
            'button[aria-label="Play"]',
            '[class*="play"][class*="btn"]'
        ];

        for (const selector of selectors) {
            const button = document.querySelector(selector);
            if (!button) continue;
            if (!isVisible(button) && selector !== '#btn-play' && selector !== 'button#btn-play' && selector !== '[data-jwplayer-id="btn-play"]') continue;

            const target = button.closest('button, a, div') || button;
            if (triggerElementClick(target)) return;
        }

        const playIcon = document.querySelector('#pl_but');
        if (playIcon) {
            const clickable = playIcon.closest('button, a, div') || playIcon;
            triggerElementClick(clickable);
        }
    }

    function isAnyVideoPlaying() {
        return Array.from(document.querySelectorAll('video')).some((video) => {
            try {
                return !video.paused && !video.ended && Number(video.readyState) >= 2;
            } catch {
                return false;
            }
        });
    }

    function isAnyJwPlayerPlaying() {
        if (typeof window.jwplayer !== 'function') return false;
        const candidates = [];

        try {
            const primary = window.jwplayer();
            if (primary) candidates.push(primary);
        } catch {
            // ignore
        }

        document.querySelectorAll('[id]').forEach((element) => {
            const id = String(element.id || '').trim();
            if (!id) return;
            try {
                const player = window.jwplayer(id);
                if (player) candidates.push(player);
            } catch {
                // ignore
            }
        });

        return candidates.some((player) => {
            try {
                return String(player.getState ? player.getState() : '').toLowerCase() === 'playing';
            } catch {
                return false;
            }
        });
    }

    function hasActivePlayback() {
        return isAnyVideoPlaying() || isAnyJwPlayerPlaying();
    }

    function ensureVidsrcPlaybackStarted() {
        if (hasActivePlayback()) return;

        const now = Date.now();
        if ((now - lastAutoplayAttemptAt) < AUTOPLAY_RETRY_MS) return;
        lastAutoplayAttemptAt = now;

        clickVidsrcPlayButton();
    }

    function clickVidsrcNextIfPresent() {
        const nextBtn = document.querySelector('#next-episode-btn');
        if (nextBtn && getComputedStyle(nextBtn).display !== 'none') {
            nextBtn.click();
        }
        // else: do nothing, no replay
    }

    function parseSourceContextFromUrl(url = location.href) {
        try {
            const parsed = new URL(url);
            const path = parsed.pathname.replace(/\/+$/, '');
            let match = path.match(/^\/embed\/movie\/([^/]+)$/i);
            if (match) {
                return {
                    id: match[1],
                    type: 'movie',
                    season: null,
                    episode: null
                };
            }

            match = path.match(/^\/embed\/tv\/([^/]+)\/(\d+)\/(\d+)$/i);
            if (match) {
                return {
                    id: match[1],
                    type: 'tv',
                    season: Number(match[2]),
                    episode: Number(match[3])
                };
            }
        } catch {
            // ignore
        }

        return null;
    }

    function postToTop(payload) {
        try {
            window.top.postMessage({ source: MESSAGE_SOURCE, ...payload }, '*');
        } catch {
            // ignore
        }
    }

    function buildProgressPayload(video, overrides = {}) {
        const context = parseSourceContextFromUrl();
        if (!context || !video) return null;

        return buildProgressPayloadFromTimes(Number(video.currentTime), Number(video.duration), overrides);
    }

    function buildProgressPayloadFromTimes(currentTime, duration, overrides = {}) {
        const context = parseSourceContextFromUrl();
        if (!context) return null;
        if (!Number.isFinite(currentTime) || currentTime < 0) return null;

        let progress = null;
        if (Number.isFinite(duration) && duration > 0) {
            progress = Math.max(0, Math.min(100, Math.round((currentTime / duration) * 100)));
        }

        return {
            id: context.id,
            type: context.type,
            mediaType: context.type,
            season: context.season,
            episode: context.episode,
            currentTime,
            timestamp: currentTime,
            duration: Number.isFinite(duration) && duration > 0 ? duration : null,
            progress,
            ...overrides
        };
    }

    function bindVidsrcOnlineVideo(video) {
        if (!video || video.__ateaishProgressBound) return;
        video.__ateaishProgressBound = true;

        let lastProgressAt = 0;
        let endedSent = false;

        const reportProgress = (force = false) => {
            const now = Date.now();
            if (!force && now - lastProgressAt < PROGRESS_INTERVAL_MS) return;
            lastProgressAt = now;

            const payload = buildProgressPayload(video);
            if (!payload) return;
            postToTop(payload);
        };

        const reportEnded = () => {
            if (endedSent) return;
            endedSent = true;

            const payload = buildProgressPayload(video, { progress: 100 });
            if (payload) postToTop(payload);
            postToTop({ type: ENDED_MESSAGE_TYPE });
        };

        video.addEventListener('play', () => reportProgress(true), { passive: true });
        video.addEventListener('playing', () => reportProgress(true), { passive: true });
        video.addEventListener('pause', () => reportProgress(true), { passive: true });
        video.addEventListener('durationchange', () => reportProgress(true), { passive: true });
        video.addEventListener('timeupdate', () => {
            reportProgress(false);
            const duration = Number(video.duration);
            const currentTime = Number(video.currentTime);
            if (Number.isFinite(duration) && duration > 0 && Number.isFinite(currentTime) && currentTime >= 0) {
                if ((duration - currentTime) <= 0.75) {
                    reportEnded();
                } else if ((duration - currentTime) > 5) {
                    endedSent = false;
                }
            }
        }, { passive: true });
        video.addEventListener('ended', reportEnded, { passive: true });
    }

    function setupVidsrcOnlineProgressHandler() {
        if (window.__ateaishVidsrcOnlineProgressHooked) return;
        window.__ateaishVidsrcOnlineProgressHooked = true;

        const attachToVideos = () => {
            document.querySelectorAll('video').forEach(bindVidsrcOnlineVideo);
        };

        attachToVideos();
        const observer = new MutationObserver(attachToVideos);
        observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    function setupVidsrcOnlineJwHandler() {
        if (window.__ateaishVidsrcOnlineJwHooked) return;
        window.__ateaishVidsrcOnlineJwHooked = true;

        let lastProgressAt = 0;
        let lastEndedAt = 0;

        const postJwProgress = (player) => {
            if (!player) return;
            const now = Date.now();
            if (now - lastProgressAt < PROGRESS_INTERVAL_MS) return;
            lastProgressAt = now;

            try {
                const payload = buildProgressPayloadFromTimes(Number(player.getPosition()), Number(player.getDuration()));
                if (payload) postToTop(payload);
            } catch {
                // ignore
            }
        };

        const postJwEnded = (player) => {
            const now = Date.now();
            if (now - lastEndedAt < 3000) return;
            lastEndedAt = now;

            try {
                const payload = buildProgressPayloadFromTimes(Number(player?.getPosition?.()), Number(player?.getDuration?.()), { progress: 100 });
                if (payload) postToTop(payload);
            } catch {
                // ignore
            }

            postToTop({ type: ENDED_MESSAGE_TYPE });
        };

        const forceJwAutoplay = (player) => {
            if (!player) return;
            try {
                if (typeof player.setMute === 'function') player.setMute(false);
                if (typeof player.setVolume === 'function') player.setVolume(100);
                if (typeof player.play === 'function') player.play(true);
            } catch {
                // ignore
            }
        };

        const maybePreEndJwPlayer = (player) => {
            if (!player) return;
            try {
                const duration = Number(player.getDuration());
                const currentTime = Number(player.getPosition());
                if (!Number.isFinite(duration) || duration <= 0) return;
                if (!Number.isFinite(currentTime) || currentTime < 0) return;
                if ((duration - currentTime) <= 0.75) {
                    postJwEnded(player);
                }
            } catch {
                // ignore
            }
        };

        const attachJwPlayer = (player) => {
            if (!player || player.__ateaishAutoplayJwBound) return;
            player.__ateaishAutoplayJwBound = true;

            const onReadyLike = () => {
                forceJwAutoplay(player);
                clickVidsrcPlayButton();
                postJwProgress(player);
            };

            try { player.on('ready', onReadyLike); } catch { }
            try { player.on('playlistItem', onReadyLike); } catch { }
            try { player.on('play', () => { forceJwAutoplay(player); postJwProgress(player); }); } catch { }
            try { player.on('buffer', () => forceJwAutoplay(player)); } catch { }
            try { player.on('firstFrame', () => { forceJwAutoplay(player); postJwProgress(player); }); } catch { }
            try { player.on('time', () => { postJwProgress(player); maybePreEndJwPlayer(player); }); } catch { }
            try { player.on('complete', () => postJwEnded(player)); } catch { }

            onReadyLike();
        };

        const scanJwPlayers = () => {
            if (typeof window.jwplayer !== 'function') return;
            const seen = new Set();
            const candidates = [];

            try {
                const primary = window.jwplayer();
                if (primary) candidates.push(primary);
            } catch {
                // ignore
            }

            document.querySelectorAll('[id]').forEach((element) => {
                const id = String(element.id || '').trim();
                if (!id) return;
                try {
                    const player = window.jwplayer(id);
                    if (player) candidates.push(player);
                } catch {
                    // ignore
                }
            });

            candidates.forEach((player) => {
                if (!player || typeof player.getContainer !== 'function') return;
                let key = null;
                try {
                    key = player.getContainer() || player.id || player;
                } catch {
                    key = player;
                }
                if (seen.has(key)) return;
                seen.add(key);
                attachJwPlayer(player);
            });
        };

        scanJwPlayers();
        const observer = new MutationObserver(scanJwPlayers);
        observer.observe(document.documentElement, { childList: true, subtree: true });
        setInterval(scanJwPlayers, 2000);
    }

    function setupMoviesPageAutoNextHandler() {
        if (window.__ateaishMoviesAutoNextHooked) return;
        window.__ateaishMoviesAutoNextHooked = true;

        window.addEventListener('message', (event) => {
            const data = event && event.data;
            if (!data || typeof data !== 'object') return;
            if (data.source !== MESSAGE_SOURCE || data.type !== ENDED_MESSAGE_TYPE) return;
            clickVidsrcNextIfPresent();
        });
    }

    function setupVidsrcEndHandler() {
        if (window.__ateaishVidsrcEndHooked) return;
        window.__ateaishVidsrcEndHooked = true;

        const attachToVideos = () => {
            const videos = document.querySelectorAll('video');
            videos.forEach(video => {
                if (video.__ateaishEndHooked) return;
                video.__ateaishEndHooked = true;
                video.addEventListener('ended', () => {
                    clickVidsrcNextIfPresent();
                });
            });
        };

        attachToVideos();
        const vidObserver = new MutationObserver(attachToVideos);
        vidObserver.observe(document.body, { childList: true, subtree: true });
    }

    function runAllClickers() {
        if (isMoviesPage()) {
            setupMoviesPageAutoNextHandler();
            return;
        }

        if (isVideasyPage()) {
            clickVideasyPlayButton();
            return;
        }

        if (isVidsrcOnlinePage()) {
            ensureVidsrcPlaybackStarted();
            setupVidsrcOnlineProgressHandler();
            setupVidsrcOnlineJwHandler();
            return;
        }

        if (isGenericPlayerHost()) {
            clickVidsrcPlayButton();
            setupVidsrcEndHandler();
        }
    }

    // Try immediately
    runAllClickers();

    // Observe DOM for dynamically loaded buttons
    const observer = new MutationObserver(runAllClickers);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setInterval(runAllClickers, AUTOPLAY_RETRY_MS);
})();