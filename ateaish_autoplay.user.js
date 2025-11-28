// ==UserScript==
// @name         Videasy Autoplay
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Automatically clicks the play button on Videasy episode pages
// @author       Ateaish
// @match        https://atishramkhe.github.io/movies/*
// @match        https://player.videasy.net/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    function clickPlayButton() {
        const playDiv = document.querySelector('.title-year');
        if (playDiv) {
            const playBtn = playDiv.querySelector('button');
            if (playBtn) {
                playBtn.click();
            }
        }
    }

    // Try immediately, and also observe for dynamic loading
    clickPlayButton();

    // In case the button loads later
    const observer = new MutationObserver(() => {
        clickPlayButton();
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Optionally disconnect observer after click
    // (uncomment if you want to stop after first click)
    // let clicked = false;
    // function clickPlayButtonOnce() {
    //     if (!clicked) {
    //         const playDiv = document.querySelector('.title-year');
    //         if (playDiv) {
    //             const playBtn = playDiv.querySelector('button');
    //             if (playBtn) {
    //                 playBtn.click();
    //                 clicked = true;
    //                 observer.disconnect();
    //             }
    //         }
    //     }
    // }
    // observer.disconnect();

})();