// ==UserScript==
// @name         CDN Live AutoPlay + Watermark Hide
// @namespace    https://cdn-live.tv/
// @version      1.1
// @description  Auto-play on cdn-live.tv and hide watermark/logo button
// @match        https://cdn-live.tv/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const PLAY_SELECTOR = 'button[aria-label="Play"].css-rte19r.css-ms5vsw.css-181s0gc';
    const WATERMARK_SELECTOR = 'img[alt="watermark"][src*="logo-cdn-live-tv1.png"]';
    const BRAND_BUTTON_SELECTOR = 'button.css-rte19r.css-h2k9yu.css-181s0gc';

    function hideBranding() {
        // Force-hide via CSS
        if (!document.getElementById('cdn-live-hide-branding-style')) {
            const style = document.createElement('style');
            style.id = 'cdn-live-hide-branding-style';
            style.textContent = `
                ${WATERMARK_SELECTOR},
                ${BRAND_BUTTON_SELECTOR} {
                    display: none !important;
                    visibility: hidden !important;
                    pointer-events: none !important;
                }
            `;
            document.head.appendChild(style);
        }

        // Hide existing nodes, if already in DOM with inline styles
        document.querySelectorAll(`${WATERMARK_SELECTOR}, ${BRAND_BUTTON_SELECTOR}`)
            .forEach(el => {
                el.style.setProperty('display', 'none', 'important');
                el.style.setProperty('visibility', 'hidden', 'important');
                el.style.setProperty('pointer-events', 'none', 'important');
            });
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
    hideBranding();

    // Observe DOM for late-loaded controls / watermark / logo button
    const observer = new MutationObserver(() => {
        tryClickPlay();
        hideBranding();
    });

    observer.observe(document.documentElement || document.body, {
        childList: true,
        subtree: true
    });

    // Fallback interval in case observer misses something
    setInterval(() => {
        tryClickPlay();
        hideBranding();
    }, 2000);
})();