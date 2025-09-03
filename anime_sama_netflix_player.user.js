// ==UserScript==
// @name         Ateaish Player (Simple AutoNext)
// @namespace    http://tampermonkey.net/
// @version      6.1
// @description  A lightweight script to automatically play the next episode on Anime-Sama.
// @author       Ateaish
// @match        *://anime-sama.fr/*
// @match        *://video.sibnet.ru/*
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function() {
    'use strict';

    const SCRIPT_NAME = 'Ateaish Player (Simple AutoNext)';
    const LOG_PREFIX = `[${SCRIPT_NAME}]`;

    // --- START: Settings Management ---
    const defaultSettings = {
        scriptEnabled: true,
        autoNextEnabled: true,
        defaultVolume: 0.8,
    };
    let settings = {};

    function loadSettings() {
        const savedSettings = GM_getValue('ateiash_player_settings_simple'); // Use a new key for settings
        settings = savedSettings ? JSON.parse(savedSettings) : { ...defaultSettings };
        console.log(`${LOG_PREFIX} Settings loaded:`, settings);
    }

    function saveSettings() {
        GM_setValue('ateiash_player_settings_simple', JSON.stringify(settings));
        console.log(`${LOG_PREFIX} Settings saved.`);
    }
    // --- END: Settings Management ---

    // --- START: Main Logic Router ---
    const onAnimeSama = window.location.hostname.includes('anime-sama.fr');
    const onSibnet = window.location.hostname.includes('video.sibnet.ru');

    if (onAnimeSama) {
        loadSettings();
        runParentPageLogic();
    } else if (onSibnet) {
        loadSettings();
        runIframePlayerLogic();
    }
    // --- END: Main Logic Router ---


    // --- START: Parent Page Logic (anime-sama.fr) ---
    function runParentPageLogic() {
        console.log(`${LOG_PREFIX} [Parent] Running on Parent Page.`);
        if (settings.scriptEnabled) {
            console.log(`${LOG_PREFIX} [Parent] Attempting to create settings menu.`);
            // Delay creation until DOM is ready
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', createSettingsMenu);
            } else {
                createSettingsMenu();
            }
        }

        window.addEventListener('message', (event) => {
            if (!event.origin.includes('sibnet.ru')) return;
            // Check for the specific message from the working code
            if (event.data === 'sibnetVideoEnded' && settings.autoNextEnabled) {
                console.log(`${LOG_PREFIX} [Parent] Video ended message received.`);
                triggerNextEpisode();
            }
        });

        function triggerNextEpisode() {
            console.log(`${LOG_PREFIX} [Parent] Attempting to click next episode.`);
            const nextButton = document.getElementById('nextEpisode');
            if (nextButton) {
                nextButton.click();
                // Send message to iframe to request fullscreen
                const iframe = document.querySelector('iframe[src*="sibnet.ru"]');
                if (iframe && iframe.contentWindow) {
                    iframe.contentWindow.postMessage('requestFullscreen', '*');
                }
            } else {
                console.error(`${LOG_PREFIX} [Parent] Next episode button not found.`);
            }
        }
    }
    // --- END: Parent Page Logic ---


    // --- START: Iframe Player Logic (video.sibnet.ru) ---
    function runIframePlayerLogic() {
        console.log(`${LOG_PREFIX} [Iframe] Running inside Sibnet iframe.`);
        let messageSent = false;

        function setupVideoListener() {
            const video = document.querySelector('video');
            if (video) {
                console.log(`${LOG_PREFIX} [Iframe] Video element found. Attaching listeners.`);

                const videoSrc = video.src;
                const newVideo = document.createElement('video');
                newVideo.src = videoSrc;
                newVideo.style.width = '100%';
                newVideo.style.height = '100%';
                
                const playerContainer = document.createElement('div');
                playerContainer.classList.add('netflix-player');
                playerContainer.appendChild(newVideo);
                
                document.body.innerHTML = '';
                document.body.appendChild(playerContainer);
                document.body.style.margin = '0';
                document.body.style.overflow = 'hidden';


                // Set default volume
                newVideo.volume = settings.defaultVolume;

                // Attempt to autoplay the video
                newVideo.play().catch(() => {
                    newVideo.play().catch(()=>{});
                });

                // Create Netflix-like player
                createNetflixPlayer(newVideo);

                newVideo.addEventListener('ended', () => {
                    if (messageSent) return;
                    console.log(`${LOG_PREFIX} [Iframe] Video ended. Sending message to parent.`);
                    window.parent.postMessage('sibnetVideoEnded', '*');
                    messageSent = true;
                });

                // Listen for fullscreen request from parent
                window.addEventListener('message', (event) => {
                    if (event.data === 'requestFullscreen') {
                        console.log(`${LOG_PREFIX} [Iframe] Fullscreen request received from parent.`);
                        if (playerContainer.requestFullscreen) {
                            playerContainer.requestFullscreen();
                        } else if (playerContainer.mozRequestFullScreen) { // Firefox
                            playerContainer.mozRequestFullScreen();
                        } else if (playerContainer.webkitRequestFullscreen) { // Chrome, Safari and Opera
                            playerContainer.webkitRequestFullscreen();
                        } else if (playerContainer.msRequestFullscreen) { // IE/Edge
                            playerContainer.msRequestFullscreen();
                        }
                    }
                });

            } else {
                // If the video element is not found, retry after a short delay.
                setTimeout(setupVideoListener, 1000);
            }
        }

        // Start the process
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', setupVideoListener);
        } else {
            setupVideoListener();
        }
    }

    function createNetflixPlayer(video) {
        video.controls = true;
    }
    // --- END: Iframe Player Logic ---


    // --- START: Settings UI Functions ---

    function createSettingsMenu() {
        console.log(`${LOG_PREFIX} [Settings] createSettingsMenu called.`);
        if (document.getElementById('ateiash-settings-button')) {
            console.log(`${LOG_PREFIX} [Settings] Settings button already exists. Returning.`);
            return;
        }
        injectSettingsStyles();

        const settingsButton = document.createElement('div');
        settingsButton.id = 'ateiash-settings-button';
        settingsButton.innerHTML = `<svg viewBox="0 0 24 24"><path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69-.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"/></svg>`;
        document.body.appendChild(settingsButton);

        const modal = createSettingsModal();

        settingsButton.addEventListener('click', () => {
            modal.style.display = 'flex';
            for (const key in settings) {
                const checkbox = document.getElementById(key);
                if (checkbox) checkbox.checked = settings[key];
            }
        });
    }

    function createSettingsModal() {
        const modal = document.createElement('div');
        modal.id = 'ateiash-settings-modal';
        modal.innerHTML = `
            <div class="ateiash-settings-panel">
                <h2>Ateaish Player Settings</h2>
                <div class="ateiash-settings-row"><label for="scriptEnabled">Enable Script</label><label class="ateiash-settings-switch"><input type="checkbox" id="scriptEnabled"><span class="ateiash-slider"></span></label></div>
                <div class="ateiash-settings-row"><label for="autoNextEnabled">Enable Auto Next</label><label class="ateiash-settings-switch"><input type="checkbox" id="autoNextEnabled"><span class="ateiash-slider"></span></label></div>
            </div>`;
        document.body.appendChild(modal);

        modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });

        modal.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                settings[checkbox.id] = checkbox.checked;
                saveSettings();
            });
        });
        return modal;
    }

    function injectSettingsStyles() {
        GM_addStyle(`
            #ateiash-settings-button { position: fixed; bottom: 20px; right: 20px; z-index: 9999; width: 50px; height: 50px; background-color: #e50914; border-radius: 50%; cursor: pointer; box-shadow: 0 2px 10px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; }
            #ateiash-settings-button svg { width: 28px; height: 28px; fill: white; }
            #ateiash-settings-modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.6); z-index: 10000; align-items: center; justify-content: center; }
            .ateiash-settings-panel { background-color: #222; color: white; padding: 25px; border-radius: 8px; width: 350px; box-shadow: 0 5px 15px rgba(0,0,0,0.5); font-family: sans-serif; }
            .ateiash-settings-panel h2 { margin-top: 0; margin-bottom: 20px; text-align: center; color: #e50914; }
            .ateiash-settings-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
            .ateiash-settings-row label { font-size: 16px; }
            .ateiash-settings-switch { position: relative; display: inline-block; width: 50px; height: 28px; }
            .ateiash-settings-switch input { opacity: 0; width: 0; height: 0; }
            .ateiash-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #444; transition: .4s; border-radius: 28px; }
            .ateiash-slider:before { position: absolute; content: ""; height: 20px; width: 20px; left: 4px; bottom: 4px; background-color: white; transition: .4s; border-radius: 50%; }
            input:checked + .ateiash-slider { background-color: #e50914; }
            input:checked + .ateiash-slider:before { transform: translateX(22px); }
        `);
    }
    // --- END: Settings UI Functions ---

})();