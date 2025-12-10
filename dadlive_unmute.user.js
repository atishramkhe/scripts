// ==UserScript==
// @name         DaddyHD Auto Unmute
// @namespace    http://tampermonkey.net/
// @version      0.7
// @description  Wait for video, then unmute player + hide overlay on daddyhd.com / iframe streams
// @match        https://daddyhd.com/stream/*
// @match        https://security.giokko.ru/*
// @match        https://epicplayplay.cfd/premiumtv/*
// @run-at       document-idle
// @grant        none
// @all-frames   true
// ==/UserScript==

(function () {
    'use strict';

    console.log('[DaddyHD Auto Unmute] Loaded in', location.href, 'frame?', window.top === window ? 'top' : 'iframe');

    // Heuristic: is this frame where the player UI lives?
    function isPlayerFrame() {
        return !!document.querySelector(
            '.media-control[data-media-control], .drawer-container[data-volume]'
        );
    }

    function getVideoElements() {
        return Array.from(document.querySelectorAll('video, audio'));
    }

    function findVolumeToggleButtons() {
        return Array.from(document.querySelectorAll(
            [
                // main volume/mute icon in this player
                '.drawer-container[data-volume] .drawer-icon[data-volume]',

                // fallback: clickable volume area
                '.drawer-container[data-volume]',
                '.drawer-icon[data-volume]'
            ].join(',')
        ));
    }

    function findOverlayUnmuteButton() {
        // Top "Unmute" button you showed earlier
        return document.querySelector('button.unmute-button');
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

    let videoReady = false;
    let volumeSynced = false;
    let overlayHidden = false;

    function markVideoReadyOnce(v) {
        if (videoReady) return;
        videoReady = true;
        console.log('[DaddyHD Auto Unmute] Video is ready:', v);
    }

    function attachVideoListeners() {
        getVideoElements().forEach(v => {
            if (v._autoUnmuteListenersAttached) return;
            v._autoUnmuteListenersAttached = true;

            // When enough data / can play, mark ready
            v.addEventListener('loadedmetadata', () => markVideoReadyOnce(v));
            v.addEventListener('canplay', () => markVideoReadyOnce(v));
            v.addEventListener('play', () => markVideoReadyOnce(v));
        });
    }

    function syncVolumeWithPlayer() {
        if (volumeSynced) return false;

        const vids = getVideoElements();
        if (!vids.length) {
            console.log('[DaddyHD Auto Unmute] No video/audio yet in this frame');
            return false;
        }

        // If video not yet marked ready, do nothing (avoid pre‑clicking)
        if (!videoReady) {
            console.log('[DaddyHD Auto Unmute] Video present but not ready yet; waiting');
            return false;
        }

        let changed = false;

        // 1) Force media elements unmuted
        vids.forEach(v => {
            try {
                if (v.muted || v.volume === 0) {
                    console.log('[DaddyHD Auto Unmute] Forcing video unmuted + volume=1.0');
                    v.muted = false;
                    if (v.volume === 0) v.volume = 1.0;
                    changed = true;
                }
            } catch (e) {
                console.error('[DaddyHD Auto Unmute] Failed to adjust media volume:', e);
            }
        });

        // 2) Click the drawer volume toggle once to sync UI state with actual volume
        const buttons = findVolumeToggleButtons().filter(b => b.offsetParent !== null);
        console.log('[DaddyHD Auto Unmute] Volume toggle candidates:', buttons.length);
        if (buttons.length) {
            const btn = buttons[0];
            try {
                console.log('[DaddyHD Auto Unmute] Clicking drawer volume icon to sync UI');
                simulateRealClick(btn);
                changed = true;
            } catch (e) {
                console.error('[DaddyHD Auto Unmute] Failed to click drawer volume icon:', e);
            }
        }

        if (changed) {
            volumeSynced = true;
        }
        return changed;
    }

    function hideOverlayIfPresent() {
        if (overlayHidden) return false;
        const btn = findOverlayUnmuteButton();
        if (!btn) return false;

        if (!videoReady) {
            // Wait until video is ready, otherwise this button might re‑appear or re‑mute
            console.log('[DaddyHD Auto Unmute] Overlay found but video not ready; waiting');
            return false;
        }

        try {
            console.log('[DaddyHD Auto Unmute] Hiding top overlay unmute button');
            simulateRealClick(btn);
            overlayHidden = true;
            return true;
        } catch (e) {
            console.error('[DaddyHD Auto Unmute] Failed to click overlay unmute button:', e);
            return false;
        }
    }

    function step() {
        if (!isPlayerFrame()) return false;

        attachVideoListeners();

        const vChanged = syncVolumeWithPlayer();
        const oChanged = hideOverlayIfPresent();

        return vChanged || oChanged;
    }

    // Only do work in frames that look like player frames or could become one
    if (!isPlayerFrame() && window.top === window) {
        console.log('[DaddyHD Auto Unmute] Top frame does not look like player; waiting for iframes only.');
    }

    let attempts = 0;
    const maxAttempts = 240; // ~120s at 500ms

    const interval = setInterval(() => {
        attempts++;
        if (step() || attempts >= maxAttempts) {
            console.log('[DaddyHD Auto Unmute] Stop in this frame. videoReady=', videoReady,
                        'volumeSynced=', volumeSynced, 'overlayHidden=', overlayHidden,
                        'attempts=', attempts);
            clearInterval(interval);
        }
    }, 500);

    const observer = new MutationObserver(() => {
        attachVideoListeners();
        if (step()) {
            console.log('[DaddyHD Auto Unmute] Unmuted/hid overlay via MutationObserver in this frame.');
            clearInterval(interval);
            observer.disconnect();
        }
    });

    observer.observe(document.documentElement || document.body, {
        childList: true,
        subtree: true
    });

    setTimeout(() => {
        observer.disconnect();
        clearInterval(interval);
    }, 120000); // 2 minutes max
})();