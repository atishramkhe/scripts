// ==UserScript==
// @name         YouTube Audio Only
// @namespace    http://tampermonkey.net/
// @version      4.1
// @description  Audio-only mode with UI alignment (bandwidth savings coming soon)
// @author       YourName
// @match        *.youtube.com/*
// @icon         https://www.youtube.com/favicon.ico
// @grant        unsafeWindow
// @grant        GM_addStyle
// @run-at       document-idle
// @updateURL    https://github.com/yourusername/youtube-audio-only/raw/main/youtube_audio_only.user.js
// @downloadURL  https://github.com/yourusername/youtube-audio-only/raw/main/youtube_audio_only.user.js
// ==/UserScript==

(function() {
    'use strict';

    

    // Add our styles with perfect alignment
    

    // State management
    let audioOnlyMode = false;
    let originalQuality = null;
    let currentVideoId = null;
    let videoObserver = null;

    // Create perfectly aligned toggle button
    function createToggleButton() {
        if (document.getElementById('yt-audio-only-mode-button')) return; // Check for our button ID

        const actionsContainer = document.getElementById('actions'); // The div containing like/dislike
        if (!actionsContainer) return;

        const toggle = document.createElement('button');
        toggle.id = 'yt-audio-only-mode-button'; // New ID for this button
        toggle.className = 'yt-spec-button-shape-next yt-spec-button-shape-next--tonal yt-spec-button-shape-next--mono yt-spec-button-shape-next--size-m'; // Mimic YouTube's button classes
        toggle.textContent = 'Audio Only Mode';
        toggle.title = 'Toggle audio-only mode';
        toggle.addEventListener('click', toggleTrueAudioMode);

        // Insert our button before the actions container
        actionsContainer.parentNode.insertBefore(toggle, actionsContainer);
    }

    // Toggle between modes
    function toggleTrueAudioMode() {
        audioOnlyMode = !audioOnlyMode;

        if (audioOnlyMode) {
            enableTrueAudioMode();
        } else {
            disableTrueAudioMode();
        }

        updateButtonState();
    }

    // Enable bandwidth-saving mode
    function enableTrueAudioMode() {
        const player = unsafeWindow.document.getElementById('movie_player');
        if (!player) return;

        // 1. Save original state
        originalQuality = player.getPlaybackQuality();
        currentVideoId = getCurrentVideoId();

        // 2. Force minimal video quality
        player.setPlaybackQuality('tiny');
        interceptQualityChanges(true);

        // 3. Reduce video processing
        const video = document.querySelector('video.html5-main-video');
        if (video) {
            video.style.opacity = '0';
            video.style.pointerEvents = 'none';
            video.pause(); // Reduces processing
            setTimeout(() => video.play(), 50); // Audio continues
        }

        // 4. Monitor for video changes
        startVideoObserver();
    }

    // Disable audio-only mode
    function disableTrueAudioMode() {
        const player = unsafeWindow.document.getElementById('movie_player');
        if (player && originalQuality) {
            interceptQualityChanges(false);
            player.setPlaybackQuality(originalQuality);
        }

        const video = document.querySelector('video.html5-main-video');
        if (video) {
            video.style.opacity = '1';
            video.style.pointerEvents = 'auto';
            video.play();
        }

        stopVideoObserver();
    }

    // Intercept quality changes
    function interceptQualityChanges(enable) {
        const player = unsafeWindow.document.getElementById('movie_player');
        if (!player) return;

        if (enable) {
            player._originalSetQuality = player.setPlaybackQuality;
            player.setPlaybackQuality = function() {
                return this._originalSetQuality('tiny');
            };
        } else if (player._originalSetQuality) {
            player.setPlaybackQuality = player._originalSetQuality;
        }
    }

    // Watch for video element changes
    function startVideoObserver() {
        stopVideoObserver();

        videoObserver = new MutationObserver(mutations => {
            const video = document.querySelector('video.html5-main-video');
            if (video && audioOnlyMode) {
                video.style.opacity = '0';
                video.style.pointerEvents = 'none';
            }

            // Check for video change
            const newVideoId = getCurrentVideoId();
            if (newVideoId && newVideoId !== currentVideoId) {
                currentVideoId = newVideoId;
                setTimeout(enableTrueAudioMode, 300);
            }
        });

        videoObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    function stopVideoObserver() {
        if (videoObserver) {
            videoObserver.disconnect();
            videoObserver = null;
        }
    }

    function updateButtonState() {
        const toggle = document.getElementById('yt-audio-only-mode-button');
        if (toggle) {
            if (audioOnlyMode) {
                toggle.textContent = 'Video Mode';
                // Add styling for active state if needed, e.g., toggle.style.color = 'blue';
            } else {
                toggle.textContent = 'Audio Only Mode';
                // Remove active state styling, e.g., toggle.style.color = 'white';
            }
        }
    }

    function getCurrentVideoId() {
        try {
            return unsafeWindow.ytplayer?.config?.args?.video_id ||
                   new URLSearchParams(window.location.search).get('v');
        } catch (e) {
            return null;
        }
    }

    // Initialize
    function init() {
        createToggleButton();

        // Re-apply audio mode if active
        if (audioOnlyMode) {
            setTimeout(enableTrueAudioMode, 500);
        }

        // Start observing the controls for layout-breaking changes
        const controls = document.querySelector('.ytp-right-controls');
        if (controls) {
            alignmentObserver.observe(controls, { childList: true, subtree: true });
        }
    }

    // Start when ready
    const readyStateCheck = setInterval(() => {
        if (document.querySelector('.ytp-right-controls')) {
            clearInterval(readyStateCheck);
            init();

            // Handle SPA navigation
            document.addEventListener('yt-navigate-finish', init);
        }
    }, 100);
})();
