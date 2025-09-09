// ==UserScript==
// @name         YouTube Audio Only
// @namespace    http://tampermonkey.net/
// @version      4.9
// @description  Audio-only mode with UI alignment 
// @author       Ateaish
// @match        https://www.youtube.com/*
// @match        https://accounts.youtube.com/*
// @icon         https://www.youtube.com/favicon.ico
// @grant        unsafeWindow
// @grant        GM_addStyle
// @run-at       document-idle
// @updateURL    https://github.com/yourusername/youtube-audio-only/raw/main/youtube_audio_only.user.js
// @downloadURL  https://github.com/yourusername/youtube-audio-only/raw/main/youtube_audio_only.user.js
// ==/UserScript==

(function() {
    'use strict';

    // State management
    let audioOnlyMode = false;
    let originalQuality = null;
    let currentVideoId = null;
    let videoObserver = null;

    // Inject CSS for button styling and positioning
    GM_addStyle(`
        #yt-audio-only-mode-button {
            position: absolute;
            top: 12px;
            left: 12px;
            z-index: 35;
            padding: 8px 12px;
            background-color: rgba(0, 0, 0, 0.3);
            color: #fff;
            font-family: "YouTube Noto", Roboto, Arial, Helvetica, sans-serif;
            font-size: 14px;
            border: 1px solid #fff;
            border-radius: 4px;
            cursor: pointer;
            transition: opacity 0.3s ease, background-color 0.3s ease, top 0.3s ease;
            opacity: 0; /* Hidden by default */
        }

        #movie_player.ytp-fullscreen #yt-audio-only-mode-button {
            top: 50px;
        }

        #movie_player:not(.ytp-autohide) #yt-audio-only-mode-button,
        #movie_player.ytp-menu-visible #yt-audio-only-mode-button {
            opacity: 1;
        }

        #yt-audio-only-mode-button:hover {
            background-color: rgba(0, 0, 0, 0.5);
        }
    `);

    // Create toggle button inside the player
    function createToggleButton() {
        if (document.getElementById('yt-audio-only-mode-button')) return;

        const playerControls = document.querySelector('.ytp-chrome-top');
        if (!playerControls) return;

        const toggle = document.createElement('button');
        toggle.id = 'yt-audio-only-mode-button';
        toggle.textContent = 'Audio Only';
        toggle.title = 'Toggle audio-only mode';
        toggle.addEventListener('click', toggleTrueAudioMode);

        playerControls.appendChild(toggle);
    }

    // Toggle between modes
    function toggleTrueAudioMode(event) {
        event.stopPropagation(); // Prevent video click-to-pause
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

        originalQuality = player.getPlaybackQuality();
        currentVideoId = getCurrentVideoId();

        player.setPlaybackQuality('tiny');
        interceptQualityChanges(true);

        const video = document.querySelector('video.html5-main-video');
        if (video) {
            video.style.opacity = '0';
            video.style.pointerEvents = 'none';
        }

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
        }

        stopVideoObserver();
    }

    // Intercept quality changes
    function interceptQualityChanges(enable) {
        const player = unsafeWindow.document.getElementById('movie_player');
        if (!player) return;

        if (enable) {
            player._originalSetQuality = player.setPlaybackQuality;
            player.setPlaybackQuality = () => player._originalSetQuality('tiny');
        } else if (player._originalSetQuality) {
            player.setPlaybackQuality = player._originalSetQuality;
        }
    }

    // Watch for video element changes
    function startVideoObserver() {
        stopVideoObserver();
        videoObserver = new MutationObserver(() => {
            const video = document.querySelector('video.html5-main-video');
            if (video && audioOnlyMode) {
                video.style.opacity = '0';
                video.style.pointerEvents = 'none';
            }
            const newVideoId = getCurrentVideoId();
            if (newVideoId && newVideoId !== currentVideoId) {
                currentVideoId = newVideoId;
                setTimeout(enableTrueAudioMode, 300);
            }
        });
        videoObserver.observe(document.body, { childList: true, subtree: true });
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
            toggle.textContent = audioOnlyMode ? 'Video Mode' : 'Audio Only';
        }
    }

    function getCurrentVideoId() {
        try {
            return unsafeWindow.ytplayer?.config?.args?.video_id || new URLSearchParams(window.location.search).get('v');
        } catch (e) {
            return null;
        }
    }

    // Initialize
    function init() {
        createToggleButton();
        if (audioOnlyMode) {
            setTimeout(enableTrueAudioMode, 500);
        }
    }

    // Start when ready
    const readyStateCheck = setInterval(() => {
        if (document.querySelector('.ytp-chrome-top')) {
            clearInterval(readyStateCheck);
            init();
            document.addEventListener('yt-navigate-finish', init);
        }
    }, 100);
})();
