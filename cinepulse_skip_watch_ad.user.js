// ==UserScript==
// @name         Cinepulse.cc & Movix.website Skip Watch Ad
// @namespace    http://violentmonkey.github.io/
// @version      1.2
// @description  Automatically bypasses the "Watch Ad" gate on Cinepulse.to and Movix.website.
// @author       GitHub Copilot
// @match        https://cinepulse.cc/*
// @match        https://movix.website/*
// @match        https://movix.site/*
// @match        https://movix.club/*
// @updateURL    https://raw.githubusercontent.com/atishramkhe/scripts/refs/heads/main/cinepulse_skip_watch_ad.user.js
// @downloadURL  https://raw.githubusercontent.com/atishramkhe/scripts/refs/heads/main/cinepulse_skip_watch_ad.user.js
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Spoof VIP for Movix.website
    if (location.hostname.includes('movix.club')) {
        localStorage.setItem("is_vip", "true");
    }

    function interceptAdButton() {
        // Cinepulse: button containing "publicité"
        const cinepulseAdBtn = Array.from(document.querySelectorAll('button')).find(btn =>
            btn.textContent.trim().toLowerCase().includes('publicité')
        );
        if (cinepulseAdBtn && !cinepulseAdBtn._cinepulseIntercepted) {
            cinepulseAdBtn._cinepulseIntercepted = true;
            cinepulseAdBtn.addEventListener('click', function(e) {
                e.stopImmediatePropagation();
                e.preventDefault();
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

        // Movix: button with aria-label or text "Voir une publicité"
        const movixAdBtn = Array.from(document.querySelectorAll('button')).find(btn =>
            (btn.getAttribute('aria-label') && btn.getAttribute('aria-label').toLowerCase().includes('voir une publicité')) ||
            btn.textContent.trim().toLowerCase() === 'voir une publicité'
        );
        if (movixAdBtn && !movixAdBtn._movixIntercepted) {
            movixAdBtn._movixIntercepted = true;
            movixAdBtn.addEventListener('click', function(e) {
                e.stopImmediatePropagation();
                e.preventDefault();
                // Try to bypass popup state
                try {
                    window.adPopupBypass = true;
                    window.adPopupTriggered = false;
                } catch (err) {}
                // Simulate ad button click
                movixAdBtn.click();
                setTimeout(() => {
                    // Try to find a button to play or continue
                    const playBtn = Array.from(document.querySelectorAll('button')).find(btn =>
                        btn.textContent.trim().toLowerCase().includes('lecture') ||
                        btn.textContent.trim().toLowerCase().includes('continuer') ||
                        btn.textContent.trim().toLowerCase().includes('regarder')
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
