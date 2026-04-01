// ==UserScript==
// @name         Videasy + Vidsrc Autoplay
// @namespace    http://tampermonkey.net/
// @version      1.4
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
    const VIDSRC_ONLINE_HOST = 'vidsrc.online';
    const MESSAGE_SOURCE = 'ateaish-autoplay';
    const ENDED_MESSAGE_TYPE = 'ateaish_movies_source_ended';
    const PROGRESS_INTERVAL_MS = 1500;

    function isVisible(element) {
        if (!element) return false;
        const style = getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden' && element.offsetParent !== null;
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
            playBtn.click();
        }
    }

    function clickVidsrcPlayButton() {
        const button = document.querySelector('#btn-play, button#btn-play, [data-jwplayer-id="btn-play"]');
        if (button && isVisible(button) && !button.dataset.ateaishAutoplayClicked) {
            button.dataset.ateaishAutoplayClicked = 'true';
            button.click();
            return;
        }

        const playIcon = document.querySelector('#pl_but');
        if (playIcon && !playIcon.dataset.ateaishAutoplayClicked) {
            playIcon.dataset.ateaishAutoplayClicked = 'true';
            const clickable = playIcon.closest('button, a, div') || playIcon;
            clickable.click();
        }
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

        const duration = Number(video.duration);
        const currentTime = Number(video.currentTime);
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
        clickVideasyPlayButton();
        clickVidsrcPlayButton();

        if (hostName === MOVIES_HOST) {
            setupMoviesPageAutoNextHandler();
        }

        if (hostName === VIDSRC_ONLINE_HOST) {
            setupVidsrcOnlineProgressHandler();
        } else {
            setupVidsrcEndHandler();
        }
    }

    // Try immediately
    runAllClickers();

    // Observe DOM for dynamically loaded buttons
    const observer = new MutationObserver(runAllClickers);
    observer.observe(document.body, { childList: true, subtree: true });
})();