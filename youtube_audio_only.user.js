// ==UserScript==
// @name         YouTube Audio Only & Bass Booster
// @namespace    http://tampermonkey.net/
// @version      5.0
// @description  Audio-only mode & Bass Booster 
// @author       Ateaish
// @match        https://www.youtube.com/*
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
        #yt-audio-only-mode-button, #yt-bass-boost-button {
            position: absolute;
            top: 12px;
            z-index: 35;
            padding: 8px 12px;
            background-color: rgba(0, 0, 0, 0.08); /* Even more transparent */
            color: rgba(255,255,255,0.55);
            font-family: "YouTube Noto", Roboto, Arial, Helvetica, sans-serif;
            font-size: 14px;
            border: 1px solid rgba(255,255,255,0.25);
            border-radius: 4px;
            cursor: pointer;
            transition: opacity 0.3s ease, background-color 0.3s ease, color 0.3s, border-color 0.3s, left 0.3s ease;
            opacity: 0; /* Hidden by default */
        }

        #yt-audio-only-mode-button { left: 12px; }
        #yt-bass-boost-button { left: 110px; }

        #yt-audio-only-mode-button.active,
        #yt-bass-boost-button.active {
            background-color: rgba(29,185,84,0.18) !important; /* Green, very transparent */
            color: rgba(255,255,255,0.75) !important;
            border-color: rgba(29,185,84,0.35) !important;
        }

        /* Move buttons further right in fullscreen to avoid playlist number overlay */
        #movie_player.ytp-fullscreen #yt-audio-only-mode-button { top: 50px; left: 60px; }
        #movie_player.ytp-fullscreen #yt-bass-boost-button { top: 50px; left: 158px; }

        #movie_player:not(.ytp-autohide) #yt-audio-only-mode-button,
        #movie_player.ytp-menu-visible #yt-audio-only-mode-button,
        #movie_player:not(.ytp-autohide) #yt-bass-boost-button,
        #movie_player.ytp-menu-visible #yt-bass-boost-button {
            opacity: 1;
        }
        #yt-audio-only-mode-button:hover, #yt-bass-boost-button:hover {
            background-color: rgba(0, 0, 0, 0.18);
            color: rgba(255,255,255,0.85);
            border-color: rgba(255,255,255,0.35);
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

    // Add after createToggleButton()
    function createBassBoostButton() {
        if (document.getElementById('yt-bass-boost-button')) return;

        const playerControls = document.querySelector('.ytp-chrome-top');
        if (!playerControls) return;

        const bassBtn = document.createElement('button');
        bassBtn.id = 'yt-bass-boost-button';
        bassBtn.textContent = 'Bass Boost';
        bassBtn.title = 'Toggle bass boost';
        // No marginTop here

        bassBtn.addEventListener('click', toggleBassBoost);

        playerControls.appendChild(bassBtn);
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

    // Bass boost state and nodes
    let bassBoostEnabled = false;
    let audioCtx = null, sourceNode = null, lowshelf = null, peaking = null;

    function toggleBassBoost(event) {
        event.stopPropagation();
        bassBoostEnabled = !bassBoostEnabled;

        if (bassBoostEnabled) {
            enableBassBoost();
        } else {
            disableBassBoost();
        }
        updateBassButtonState();
    }

    // Enable bandwidth-saving mode
    function enableTrueAudioMode() {
        const player = document.getElementById('movie_player');
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
        const player = document.getElementById('movie_player');
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
        const player = document.getElementById('movie_player');
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
                if (bassBoostEnabled) {
                    setTimeout(enableBassBoost, 500);
                }
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
            // Keep text always "Audio Only"
            if (audioOnlyMode) {
                toggle.classList.add('active');
            } else {
                toggle.classList.remove('active');
            }
        }
    }

    function updateBassButtonState() {
        const bassBtn = document.getElementById('yt-bass-boost-button');
        if (bassBtn) {
            // Keep text always "Bass Boost"
            if (bassBoostEnabled) {
                bassBtn.classList.add('active');
            } else {
                bassBtn.classList.remove('active');
            }
        }
    }

    function getCurrentVideoId() {
        try {
            return window.ytplayer?.config?.args?.video_id || new URLSearchParams(window.location.search).get('v');
        } catch (e) {
            return null;
        }
    }

    // Initialize
    function init() {
        createToggleButton();
        createBassBoostButton();
        if (audioOnlyMode) {
            setTimeout(enableTrueAudioMode, 500);
        }
    }

    // Enable bass boost
    function enableBassBoost() {
        const video = document.querySelector('video.html5-main-video');
        if (!video) return;

        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }

        // Only create sourceNode once per video element
        if (!sourceNode || sourceNode.mediaElement !== video) {
            if (sourceNode) {
                try { sourceNode.disconnect(); } catch (e) {}
            }
            sourceNode = audioCtx.createMediaElementSource(video);
        }

        // Create filters if not already created
        if (!lowshelf) {
            lowshelf = audioCtx.createBiquadFilter();
            lowshelf.type = 'lowshelf';
            lowshelf.frequency.value = 200;
            lowshelf.gain.value = 4; // Reduced from 8
        }
        if (!peaking) {
            peaking = audioCtx.createBiquadFilter();
            peaking.type = 'peaking';
            peaking.frequency.value = 80;
            peaking.Q.value = 1;
            peaking.gain.value = 3; // Reduced from 6
        }

        // Disconnect all first to avoid multiple connections
        try { sourceNode.disconnect(); } catch (e) {}
        try { lowshelf.disconnect(); } catch (e) {}
        try { peaking.disconnect(); } catch (e) {}

        // Connect: source -> lowshelf -> peaking -> destination
        sourceNode.connect(lowshelf);
        lowshelf.connect(peaking);
        peaking.connect(audioCtx.destination);

        if (audioCtx.state === 'suspended') audioCtx.resume();
    }

    function disableBassBoost() {
        // Disconnect filters, connect source directly to destination
        if (sourceNode) {
            try { sourceNode.disconnect(); } catch (e) {}
            try { lowshelf && lowshelf.disconnect(); } catch (e) {}
            try { peaking && peaking.disconnect(); } catch (e) {}

            sourceNode.connect(audioCtx.destination);
        }
        // Do not recreate sourceNode or audioCtx!
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