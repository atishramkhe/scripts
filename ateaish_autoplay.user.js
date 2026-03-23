// ==UserScript==
// @name         Videasy + Vidsrc Autoplay
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Automatically clicks the play button on Videasy and Vidsrc/Cloudnestra players, and auto-next on Vidsrc
// @author       Ateaish
// @match        https://atishramkhe.github.io/movies/*
// @match        https://player.videasy.net/*
// @match        https://vidsrc-embed.ru/embed/*
// @match        https://cloudnestra.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

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
        const playIcon = document.querySelector('#pl_but');
        if (playIcon) {
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
        setupVidsrcEndHandler();
    }

    // Try immediately
    runAllClickers();

    // Observe DOM for dynamically loaded buttons
    const observer = new MutationObserver(runAllClickers);
    observer.observe(document.body, { childList: true, subtree: true });
})();