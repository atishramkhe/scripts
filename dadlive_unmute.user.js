// ==UserScript==
// @name         DaddyHD Auto Unmute
// @namespace    http://tampermonkey.net/
// @version      0.4
// @description  Auto-click unmute button on daddyhd.com / iframe streams when player is ready
// @match        https://daddyhd.com/stream/*
// @match        https://security.giokko.ru/*
// @match        https://epicplayplay.cfd/premiumtv/*
// @run-at       document-idle
// @grant        none
// @all-frames   true
// ==/UserScript==

(function () {
    'use strict';

    console.log('[DaddyHD Auto Unmute] Script loaded on', location.href, 'frame?', window.top === window ? 'top' : 'iframe');

    // Only run in frames that actually contain the button/player
    function findUnmuteButton() {
        return document.querySelector('button.unmute-button');
    }

    function isPlayerPresent() {
        // Heuristics: video/audio tags or common player containers
        if (document.querySelector('video, audio')) return true;
        if (document.querySelector('#player, .player, iframe[src*="m3u8"], iframe[src*="hls"]')) return true;
        return false;
    }

    function simulateRealClick(el) {
        const rect = el.getBoundingClientRect();
        ['mouseover', 'mousedown', 'mouseup', 'click'].forEach(type => {
            el.dispatchEvent(new MouseEvent(type, {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: rect.left + rect.width / 2,
                clientY: rect.top + rect.height / 2,
                button: 0
            }));
        });
    }

    let alreadyUnmuted = false;

    function tryUnmute() {
        if (alreadyUnmuted) return true;

        const btn = findUnmuteButton();
        if (!btn) {
            console.log('[DaddyHD Auto Unmute] No unmute button yet');
            return false;
        }

        if (!isPlayerPresent()) {
            console.log('[DaddyHD Auto Unmute] Button found but player not ready yet');
            return false;
        }

        try {
            console.log('[DaddyHD Auto Unmute] Unmuting now...');
            btn.click();
            simulateRealClick(btn);
            alreadyUnmuted = true;
            return true;
        } catch (e) {
            console.error('[DaddyHD Auto Unmute] Failed to click:', e);
            return false;
        }
    }

    // Periodic check with a small delay so the player has time to attach
    let attempts = 0;
    const maxAttempts = 120; // ~60s if interval is 500ms

    const interval = setInterval(() => {
        attempts++;
        if (tryUnmute() || attempts >= maxAttempts) {
            console.log('[DaddyHD Auto Unmute] Stopping interval. success=', alreadyUnmuted, 'attempts=', attempts);
            clearInterval(interval);
        }
    }, 500);

    // Also react to DOM changes (for iframes / late player injection)
    const observer = new MutationObserver(() => {
        if (tryUnmute()) {
            console.log('[DaddyHD Auto Unmute] Unmuted via MutationObserver, disconnecting.');
            clearInterval(interval);
            observer.disconnect();
        }
    });

    observer.observe(document.documentElement || document.body, {
        childList: true,
        subtree: true
    });

    setTimeout(() => {
        console.log('[DaddyHD Auto Unmute] Global timeout reached, disconnecting observer.');
        observer.disconnect();
        clearInterval(interval);
    }, 60000); // 60s max
})();