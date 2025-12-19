// ==UserScript==
// @name         CDN Live AutoPlay + Watermark Hide
// @namespace    https://cdn-live.tv/
// @version      1.0
// @description  Auto-play on cdn-live.tv and hide watermark logo
// @match        https://cdn-live.tv/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const PLAY_SELECTOR = 'button[aria-label="Play"].css-rte19r.css-ms5vsw.css-181s0gc';
    const WATERMARK_SELECTOR = 'img[alt="watermark"][src*="logo-cdn-live-tv1.png"]';

    function hideWatermark() {
        // Force-hide via CSS
        if (!document.getElementById('cdn-live-hide-watermark-style')) {
            const style = document.createElement('style');
            style.id = 'cdn-live-hide-watermark-style';
            style.textContent = `
                ${WATERMARK_SELECTOR} {
                    display: none !important;
                    visibility: hidden !important;
                    pointer-events: none !important;
                }
            `;
            document.head.appendChild(style);
        }

        // And also hide existing node, if already in DOM with inline styles
        const img = document.querySelector(WATERMARK_SELECTOR);
        if (img) {
            img.style.setProperty('display', 'none', 'important');
            img.style.setProperty('visibility', 'hidden', 'important');
            img.style.setProperty('pointer-events', 'none', 'important');
        }
    }

    function tryClickPlay() {
        const btn = document.querySelector(PLAY_SELECTOR);
        if (btn && !btn.dataset.autoClicked) {
            btn.dataset.autoClicked = 'true';
            btn.click();
        }
    }

    // Initial attempts
    tryClickPlay();
    hideWatermark();

    // Observe DOM for late-loaded controls / watermark
    const observer = new MutationObserver(() => {
        tryClickPlay();
        hideWatermark();
    });

    observer.observe(document.documentElement || document.body, {
        childList: true,
        subtree: true
    });

    // Fallback interval in case observer misses something
    setInterval(() => {
        tryClickPlay();
        hideWatermark();
    }, 2000);
})();