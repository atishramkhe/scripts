// ==UserScript==
// @name         DaddyHD Auto Unmute
// @namespace    http://tampermonkey.net/
// @version      0.8
// @description  Wait for video, then unmute player + hide overlay on daddyhd.com / iframe streams
// @match        https://daddyhd.com/stream/*
// @match        https://security.giokko.ru/*
// @match        https://epicplayplay.cfd/premiumtv/*
// @match        https://cdn-live.tv/*
// @run-at       document-idle
// @grant        none
// @all-frames   true
// ==/UserScript==

(function () {
    'use strict';

    console.log('[DaddyHD Auto Unmute] Loaded in', location.href, 'frame?', window.top === window ? 'top' : 'iframe');

    function isCdnLivePlayer() {
        try {
            return location.hostname.includes('cdn-live.tv')
        } catch (e) {
            return false;
        }
    }

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

    let cdnPlayClicked = false;
    let cdnWatermarkHidden = false;
    let cdnUserGestureArmed = false;

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

    function isAutomationDone() {
        const isCdn = isCdnLivePlayer();

        const vids = getVideoElements();
        const hasVideo = vids.length > 0;
        const anyPlaying = vids.some(v => {
            try {
                return !v.paused && v.currentTime > 0;
            } catch (e) {
                return false;
            }
        });
        const overlayBtn = findOverlayUnmuteButton();
        const hasOverlay = !!overlayBtn;
        const hasWatermark = document.querySelector('img[alt="watermark"][src*="logo-cdn-live-tv1.png"]');

        if (isCdn && hasVideo && !anyPlaying) return false;
        if (hasVideo && !volumeSynced) return false;
        if (hasOverlay && !overlayHidden) return false;
        if (isCdn && hasWatermark && !cdnWatermarkHidden) return false;

        return true;
    }

    function armCdnLiveUserGesturePlay() {
        if (!isCdnLivePlayer()) return;
        if (cdnUserGestureArmed) return;

        cdnUserGestureArmed = true;

        const handler = () => {
            document.removeEventListener('click', handler, true);
            document.removeEventListener('keydown', handler, true);
            document.removeEventListener('touchstart', handler, true);

            console.log('[DaddyHD Auto Unmute] User gesture detected, forcing CDN-Live play');

            try {
                const playBtn = document.querySelector('button[aria-label="Play"], button.css-rte19r[aria-label="Play"]');
                if (playBtn && playBtn.offsetParent !== null) {
                    simulateRealClick(playBtn);
                    cdnPlayClicked = true;
                }
            } catch (e) {
                console.error('[DaddyHD Auto Unmute] Failed to click CDN-Live Play button from gesture handler:', e);
            }

            const vids = getVideoElements();
            vids.forEach(v => {
                try {
                    v.muted = false;
                    if (v.volume === 0) v.volume = 1.0;
                    const p = v.play && v.play();
                    if (p && typeof p.catch === 'function') {
                        p.catch(err => {
                            console.warn('[DaddyHD Auto Unmute] video.play() still blocked after user gesture:', err);
                        });
                    }
                } catch (e) {
                    console.error('[DaddyHD Auto Unmute] Error forcing video.play() after user gesture:', e);
                }
            });
        };

        document.addEventListener('click', handler, true);
        document.addEventListener('keydown', handler, true);
        document.addEventListener('touchstart', handler, true);
    }

    function handleCdnLivePlayer() {
        if (!isCdnLivePlayer()) return false;

        // Prepare a real user-gesture-based play fallback for autoplay restrictions
        armCdnLiveUserGesturePlay();

        let changed = false;

        const vids = getVideoElements();
        const anyPlaying = vids.some(v => {
            try {
                return !v.paused && v.currentTime > 0;
            } catch (e) {
                return false;
            }
        });

        // Try to click the Play button until something is actually playing
        if (!anyPlaying) {
            const playBtn = document.querySelector('button[aria-label="Play"], button.css-rte19r[aria-label="Play"]');
            if (playBtn && playBtn.offsetParent !== null) {
                try {
                    console.log('[DaddyHD Auto Unmute] Clicking CDN-Live Play button');
                    simulateRealClick(playBtn);
                    cdnPlayClicked = true;
                    changed = true;
                } catch (e) {
                    console.error('[DaddyHD Auto Unmute] Failed to click CDN-Live Play button:', e);
                }
            }
        }

        if (!cdnWatermarkHidden) {
            const watermark = document.querySelector('img[alt="watermark"][src*="logo-cdn-live-tv1.png"]');
            if (watermark) {
                try {
                    console.log('[DaddyHD Auto Unmute] Hiding CDN-Live watermark image');
                    watermark.style.setProperty('display', 'none', 'important');
                    watermark.style.setProperty('visibility', 'hidden', 'important');
                    cdnWatermarkHidden = true;
                    changed = true;
                } catch (e) {
                    console.error('[DaddyHD Auto Unmute] Failed to hide CDN-Live watermark:', e);
                }
            }
        }

        return changed;
    }

    function step() {
        let changed = false;

        // Handle CDN-Live player pages even if they don't match the usual player UI
        changed = handleCdnLivePlayer() || changed;

        if (!isPlayerFrame()) return changed;

        attachVideoListeners();

        const vChanged = syncVolumeWithPlayer();
        const oChanged = hideOverlayIfPresent();

        return changed || vChanged || oChanged;
    }

    // Only do work in frames that look like player frames or could become one
    if (!isPlayerFrame() && window.top === window) {
        console.log('[DaddyHD Auto Unmute] Top frame does not look like player; waiting for iframes only.');
    }

    let attempts = 0;
    const maxAttempts = 240; // ~120s at 500ms

    const interval = setInterval(() => {
        attempts++;
        step();
        if (isAutomationDone() || attempts >= maxAttempts) {
            console.log('[DaddyHD Auto Unmute] Stop in this frame. videoReady=', videoReady,
                        'volumeSynced=', volumeSynced, 'overlayHidden=', overlayHidden,
                        'cdnPlayClicked=', cdnPlayClicked, 'cdnWatermarkHidden=', cdnWatermarkHidden,
                        'attempts=', attempts);
            clearInterval(interval);
        }
    }, 500);

    const observer = new MutationObserver(() => {
        attachVideoListeners();
        step();
        if (isAutomationDone()) {
            console.log('[DaddyHD Auto Unmute] Automation completed via MutationObserver in this frame.');
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