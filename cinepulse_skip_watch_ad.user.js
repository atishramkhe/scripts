// ==UserScript==
// @name         Cinepulse.cc Skip Watch Ad
// @namespace    http://violentmonkey.github.io/
// @version      1.1
// @description  Automatically bypasses the "Watch Ad" gate on Cinepulse.to.
// @author       GitHub Copilot
// @match        https://cinepulse.cc/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    function interceptAdButton() {
        const adBtn = Array.from(document.querySelectorAll('button')).find(btn =>
            btn.textContent.trim().toLowerCase().includes('publicité')
        );
        if (adBtn && !adBtn._cinepulseIntercepted) {
            adBtn._cinepulseIntercepted = true;
            adBtn.addEventListener('click', function(e) {
                e.stopImmediatePropagation();
                e.preventDefault();

                // Try to trigger the "Lecture" button after a short delay
                setTimeout(() => {
                    const playBtn = Array.from(document.querySelectorAll('button')).find(btn =>
                        btn.textContent.trim().toLowerCase().includes('lecture')
                    );
                    if (playBtn && playBtn.offsetParent !== null) {
                        playBtn.click();
                    }
                }, 800);
            }, true);
        }
    }

    // Observe for dynamic changes
    const observer = new MutationObserver(interceptAdButton);
    observer.observe(document.body, { childList: true, subtree: true });

    // Initial run
    interceptAdButton();
})();