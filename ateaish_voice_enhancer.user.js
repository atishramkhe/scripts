// ==UserScript==
// @name         Voice Enhancer
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Enhances voice frequencies on Cineby-style players and the supported movie source hosts
// @author       Ateaish
// @match        https://player.videasy.net/*
// @match        https://atishramkhe.github.io/movies/*
// @match        https://vidsrc.online/*
// @match        https://vidsrc.cc/*
// @match        https://vidsrc.to/*
// @match        https://www.vidbinge.to/*
// @match        https://vidora.stream/*
// @match        https://www.vidking.net/embed/*
// @match        https://vidsrc-embed.ru/embed/*
// @match        https://cloudnestra.com/*
// @match        https://cinesrc.st/embed/*
// @match        https://moviesapi.to/*
// @match        https://multiembed.mov/*
// @match        https://www.2embed.cc/*
// @match        https://111movies.com/*
// @match        https://vidsrc.wtf/*
// @match        https://xprime.today/*
// @match        https://xprime.tv/*
// @match        https://frembed.life/*
// @allFrames    true
// @grant        none
// @updateURL    https://raw.githubusercontent.com/atishramkhe/scripts/refs/heads/main/ateaish_voice_enhancer.user.js
// @downloadURL  https://raw.githubusercontent.com/atishramkhe/scripts/refs/heads/main/ateaish_voice_enhancer.user.js
// ==/UserScript==

(function() {
    'use strict';

    let audioContext;
    let highPassFilter;
    let peakingFilter1;
    let peakingFilter2;
    let compressor;
    let isEnhancementActive = localStorage.getItem('voiceBoostEnabled') === 'true';
    const sourceNodeMap = new WeakMap();
    let currentVideoElement;
    let currentVideoSource = '';
    let currentPlayerFrameSource = '';
    let boostButton;
    const hostName = location.hostname.replace(/^www\./, '');
    const voiceBoostMessageType = 'ATEAISH_VOICE_BOOST_SET';
    const genericOverlayHosts = new Set([
        'vidsrc.online',
        'vidsrc.cc',
        'vidsrc.to',
        'vidbinge.to',
        'vidora.stream',
        'moviesapi.to',
        'multiembed.mov',
        '2embed.cc',
        '111movies.com',
        'vidsrc.wtf',
        'frembed.life'
    ]);

    function setupAudioGraph(videoElement) {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        let sourceNode = sourceNodeMap.get(videoElement);
        if (!sourceNode) {
            try {
                sourceNode = audioContext.createMediaElementSource(videoElement);
                sourceNodeMap.set(videoElement, sourceNode);
            } catch (e) {
                console.error('[Voice Enhancer] Error creating source node:', e);
                return;
            }
        }

        if (!highPassFilter) {
            highPassFilter = audioContext.createBiquadFilter();
            highPassFilter.type = 'highpass';
            highPassFilter.frequency.value = 100;

            peakingFilter1 = audioContext.createBiquadFilter();
            peakingFilter1.type = 'peaking';
            peakingFilter1.frequency.value = 1500;
            peakingFilter1.Q.value = 1.5;
            peakingFilter1.gain.value = 6;

            peakingFilter2 = audioContext.createBiquadFilter();
            peakingFilter2.type = 'peaking';
            peakingFilter2.frequency.value = 3000;
            peakingFilter2.Q.value = 1.5;
            peakingFilter2.gain.value = 4;

            compressor = audioContext.createDynamicsCompressor();
            compressor.threshold.value = -20;
            compressor.knee.value = 20;
            compressor.ratio.value = 4;
            compressor.attack.value = 0.05;
            compressor.release.value = 0.25;
        }

        sourceNode.disconnect();
        sourceNode.connect(highPassFilter);
        highPassFilter.connect(peakingFilter1);
        peakingFilter1.connect(peakingFilter2);
        peakingFilter2.connect(compressor);
        compressor.connect(audioContext.destination);
        isEnhancementActive = true;
        updateButtonState();
    }

    function disableAudioGraph(videoElement) {
        const sourceNode = sourceNodeMap.get(videoElement);
        if (sourceNode && audioContext) {
            sourceNode.disconnect();
            sourceNode.connect(audioContext.destination);
            isEnhancementActive = false;
            updateButtonState();
        }
    }

    function updateButtonState() {
        if (boostButton) {
            if (isEnhancementActive) {
                boostButton.style.borderColor = '#e02735';
                boostButton.style.color = '#e02735';
                if (boostButton._voiceSpan) boostButton._voiceSpan.style.color = '#e02735';
                if (boostButton._boostSpan) boostButton._boostSpan.style.color = '#e02735';
            } else {
                boostButton.style.borderColor = 'white';
                boostButton.style.color = 'white';
                if (boostButton._voiceSpan) boostButton._voiceSpan.style.color = 'white';
                if (boostButton._boostSpan) boostButton._boostSpan.style.color = 'white';
            }
        }
    }

    function setVoiceBoostPreference(enabled) {
        localStorage.setItem('voiceBoostEnabled', enabled ? 'true' : 'false');
    }

    function applyVoiceBoostPreference(videoElement, enabled) {
        setVoiceBoostPreference(enabled);

        if (!videoElement) {
            isEnhancementActive = false;
            updateButtonState();
            return;
        }

        if (enabled) {
            if (!isEnhancementActive) {
                setupAudioGraph(videoElement);
            }
        } else if (isEnhancementActive) {
            disableAudioGraph(videoElement);
        } else {
            isEnhancementActive = false;
            updateButtonState();
        }
    }

    function sendVoiceBoostMessage(targetWindow, enabled) {
        if (!targetWindow) {
            return;
        }

        targetWindow.postMessage({
            type: voiceBoostMessageType,
            enabled
        }, '*');
    }

    function syncHostFrameVoiceBoostPreference(iframeElement) {
        if (!iframeElement) {
            currentPlayerFrameSource = '';
            return;
        }

        const frameSource = iframeElement.src || '';
        const boostEnabled = localStorage.getItem('voiceBoostEnabled') === 'true';

        if (!iframeElement.dataset.voiceBoostBound) {
            iframeElement.addEventListener('load', () => {
                currentPlayerFrameSource = iframeElement.src || '';
                sendVoiceBoostMessage(iframeElement.contentWindow, boostEnabled);
            });
            iframeElement.dataset.voiceBoostBound = 'true';
        }

        if (frameSource && frameSource !== currentPlayerFrameSource) {
            currentPlayerFrameSource = frameSource;
            sendVoiceBoostMessage(iframeElement.contentWindow, boostEnabled);
        }
    }

    function handleVoiceBoostMessage(event) {
        if (!event.data || event.data.type !== voiceBoostMessageType) {
            return;
        }

        applyVoiceBoostPreference(document.querySelector('video'), Boolean(event.data.enabled));
    }

    function toggleEnhancement(videoElement) {
        if (!videoElement) {
            return;
        }

        if (isEnhancementActive) {
            disableAudioGraph(videoElement);
            setVoiceBoostPreference(false);
        } else {
            setupAudioGraph(videoElement);
            setVoiceBoostPreference(true);
        }
    }

    function createBaseBoostButton(onClick) {
        boostButton = document.createElement('button');
        boostButton.id = 'voice-boost-button';
        boostButton.classList.add('cineby-scale');
        boostButton.dataset.tooltip = 'Voice Boost';
        boostButton.style.display = 'flex';
        boostButton.style.flexDirection = 'column';
        boostButton.style.alignItems = 'center';
        boostButton.style.justifyContent = 'center';
        boostButton.style.border = '2px solid white';
        boostButton.style.borderRadius = '5px';
        boostButton.style.padding = '2px 4px';
        boostButton.style.fontFamily = 'sans-serif';
        boostButton.style.fontSize = '10px';
        boostButton.style.fontWeight = 'bold';
        boostButton.style.lineHeight = '1';
        boostButton.style.color = 'white';
        boostButton.style.backgroundColor = 'transparent';
        boostButton.style.cursor = 'pointer';

        const voiceSpan = document.createElement('span');
        voiceSpan.textContent = 'VOICE';
        voiceSpan.style.display = 'block';
        voiceSpan.style.fontSize = '10px';
        voiceSpan.style.lineHeight = '1';
        voiceSpan.style.margin = '0';

        const boostSpan = document.createElement('span');
        boostSpan.textContent = 'BOOST';
        boostSpan.style.display = 'block';
        boostSpan.style.fontSize = '10px';
        boostSpan.style.lineHeight = '1';
        boostSpan.style.margin = '0';

        boostButton._voiceSpan = voiceSpan;
        boostButton._boostSpan = boostSpan;

        boostButton.appendChild(voiceSpan);
        boostButton.appendChild(boostSpan);

        boostButton.addEventListener('click', (event) => {
            event.stopPropagation();

            if (typeof onClick === 'function') {
                onClick(event);
                return;
            }

            toggleEnhancement(document.querySelector('video'));
        });

        return boostButton;
    }

    function getFloatingButtonContainer(videoElement) {
        const playerContainer = videoElement.closest(
            '#oframeplayer_parent, media-controller, .jwplayer, .plyr, .vjs-player, [class*="player"], [id*="player"]'
        ) || videoElement.parentElement || videoElement;

        if (playerContainer instanceof HTMLElement && getComputedStyle(playerContainer).position === 'static') {
            playerContainer.style.position = 'relative';
        }

        return playerContainer;
    }

    function createToggleButtonXprime() {
        const controlsContainer = document.querySelector('.first-controls-container.svelte-1i4gjts, [class*="first-controls-container"]');
        if (!controlsContainer || document.getElementById('voice-boost-button')) {
            return;
        }

        const button = createBaseBoostButton();
        button.style.marginLeft = '10px';
        controlsContainer.appendChild(button);
        updateButtonState();
    }

    function createToggleButtonGeneric() {
        const videoElement = document.querySelector('video');
        if (!videoElement || document.getElementById('voice-boost-button')) {
            return;
        }

        const playerContainer = getFloatingButtonContainer(videoElement);
        const button = createBaseBoostButton();
        button.style.position = 'absolute';
        button.style.right = '16px';
        button.style.bottom = '72px';
        button.style.zIndex = '99999';
        button.style.pointerEvents = 'auto';

        playerContainer.appendChild(button);
        updateButtonState();
    }

    function createToggleButtonHostOverlay() {
        const playerContainer = document.getElementById('player-container');
        const iframeElement = document.querySelector('#player-content iframe');
        if (!playerContainer || !iframeElement || document.getElementById('voice-boost-button')) {
            return;
        }

        const button = createBaseBoostButton(() => {
            const nextEnabledState = localStorage.getItem('voiceBoostEnabled') !== 'true';
            setVoiceBoostPreference(nextEnabledState);
            isEnhancementActive = nextEnabledState;
            updateButtonState();
            syncHostFrameVoiceBoostPreference(iframeElement);
            sendVoiceBoostMessage(iframeElement.contentWindow, nextEnabledState);
        });

        button.style.position = 'absolute';
        button.style.top = '84px';
        button.style.right = '20px';
        button.style.zIndex = '102';
        playerContainer.appendChild(button);
        updateButtonState();
    }

    function createToggleButtonVidKing() {
        // Find VidKing volume button (svg with class 'lucide-volume2')
        const volumeBtn = document.querySelector('button svg.lucide-volume2');
        if (!volumeBtn) return;
        const volumeButton = volumeBtn.closest('button');
        if (!volumeButton || document.getElementById('voice-boost-button')) return;

        // Find the parent div of the volume button (the flex container for controls)
        const volumeDiv = volumeButton.parentNode;
        if (!volumeDiv || !volumeDiv.parentNode) return;

        boostButton = document.createElement('button');
        boostButton.id = 'voice-boost-button';
        boostButton.classList.add('cineby-scale');
        boostButton.dataset.tooltip = 'Voice Boost';
        boostButton.style.display = 'flex';
        boostButton.style.flexDirection = 'column';
        boostButton.style.alignItems = 'center';
        boostButton.style.justifyContent = 'center';
        boostButton.style.border = '2px solid white';
        boostButton.style.borderRadius = '5px';
        boostButton.style.padding = '2px 4px';
        boostButton.style.fontFamily = 'sans-serif';
        boostButton.style.fontSize = '10px';
        boostButton.style.fontWeight = 'bold';
        boostButton.style.lineHeight = '1';
        boostButton.style.color = 'white';
        boostButton.style.marginLeft = '16px'; // spacing to the left
        boostButton.style.backgroundColor = 'transparent';
        boostButton.style.cursor = 'pointer';

        const voiceSpan = document.createElement('span');
        voiceSpan.textContent = 'VOICE';
        voiceSpan.style.display = 'block';
        voiceSpan.style.fontSize = '10px';
        voiceSpan.style.lineHeight = '1';
        voiceSpan.style.margin = '0';

        const boostSpan = document.createElement('span');
        boostSpan.textContent = 'BOOST';
        boostSpan.style.display = 'block';
        boostSpan.style.fontSize = '10px';
        boostSpan.style.lineHeight = '1';
        boostSpan.style.margin = '0';

        boostButton._voiceSpan = voiceSpan;
        boostButton._boostSpan = boostSpan;

        boostButton.appendChild(voiceSpan);
        boostButton.appendChild(boostSpan);

        boostButton.addEventListener('click', () => {
            const videoElement = document.querySelector('video');
            if (!videoElement) return;

            if (isEnhancementActive) {
                disableAudioGraph(videoElement);
                localStorage.setItem('voiceBoostEnabled', 'false');
            } else {
                setupAudioGraph(videoElement);
                localStorage.setItem('voiceBoostEnabled', 'true');
            }
        });

        // Insert after the volume button's parent div
        volumeDiv.parentNode.insertBefore(boostButton, volumeDiv.nextSibling);
        updateButtonState();
    }

    function createToggleButtonDefault() {
        const playButton = document.getElementById('ButtonPlay');
        if (!playButton || document.getElementById('voice-boost-button')) {
            return;
        }
        const controlsContainer = playButton.parentElement;
        if (!controlsContainer) {
            return;
        }
        boostButton = document.createElement('button');
        boostButton.id = 'voice-boost-button';
        boostButton.classList.add('cineby-scale');
        boostButton.dataset.tooltip = 'Voice Boost';
        boostButton.style.display = 'flex';
        boostButton.style.flexDirection = 'column';
        boostButton.style.alignItems = 'center';
        boostButton.style.justifyContent = 'center';
        boostButton.style.border = '2px solid white';
        boostButton.style.borderRadius = '5px';
        boostButton.style.padding = '2px 4px';
        boostButton.style.fontFamily = 'sans-serif';
        boostButton.style.fontSize = '10px';
        boostButton.style.fontWeight = 'bold';
        boostButton.style.lineHeight = '1';
        boostButton.style.color = 'white';
        boostButton.style.marginLeft = '8px';
        boostButton.style.backgroundColor = 'transparent';
        boostButton.style.cursor = 'pointer';

        const voiceSpan = document.createElement('span');
        voiceSpan.textContent = 'VOICE';
        voiceSpan.style.display = 'block';
        voiceSpan.style.fontSize = '10px';
        voiceSpan.style.lineHeight = '1';
        voiceSpan.style.margin = '0';

        const boostSpan = document.createElement('span');
        boostSpan.textContent = 'BOOST';
        boostSpan.style.display = 'block';
        boostSpan.style.fontSize = '10px';
        boostSpan.style.lineHeight = '1';
        boostSpan.style.margin = '0';

        boostButton._voiceSpan = voiceSpan;
        boostButton._boostSpan = boostSpan;

        boostButton.appendChild(voiceSpan);
        boostButton.appendChild(boostSpan);

        boostButton.addEventListener('click', () => {
            const videoElement = document.querySelector('video');
            if (!videoElement) return;

            if (isEnhancementActive) {
                disableAudioGraph(videoElement);
                localStorage.setItem('voiceBoostEnabled', 'false');
            } else {
                setupAudioGraph(videoElement);
                localStorage.setItem('voiceBoostEnabled', 'true');
            }
        });

        controlsContainer.appendChild(boostButton);
        updateButtonState();
    }

    function createToggleButtonVidsrc() {
        const parentDiv = document.getElementById('oframeplayer_parent');
        if (!parentDiv || document.getElementById('voice-boost-button')) return;

        boostButton = document.createElement('button');
        boostButton.id = 'voice-boost-button';
        boostButton.classList.add('cineby-scale');
        boostButton.dataset.tooltip = 'Voice Boost';
        boostButton.style.position = 'absolute';
        boostButton.style.right = '16px';
        boostButton.style.bottom = '60px';
        boostButton.style.zIndex = '99999';
        boostButton.style.display = 'flex';
        boostButton.style.flexDirection = 'column';
        boostButton.style.alignItems = 'center';
        boostButton.style.justifyContent = 'center';
        boostButton.style.border = '2px solid white';
        boostButton.style.borderRadius = '5px';
        boostButton.style.padding = '2px 4px';
        boostButton.style.fontFamily = 'sans-serif';
        boostButton.style.fontSize = '10px';
        boostButton.style.fontWeight = 'bold';
        boostButton.style.lineHeight = '1';
        boostButton.style.color = 'white';
        boostButton.style.backgroundColor = 'transparent';
        boostButton.style.cursor = 'pointer';

        const voiceSpan = document.createElement('span');
        voiceSpan.textContent = 'VOICE';
        voiceSpan.style.display = 'block';
        voiceSpan.style.fontSize = '10px';
        voiceSpan.style.lineHeight = '1';
        voiceSpan.style.margin = '0';

        const boostSpan = document.createElement('span');
        boostSpan.textContent = 'BOOST';
        boostSpan.style.display = 'block';
        boostSpan.style.fontSize = '10px';
        boostSpan.style.lineHeight = '1';
        boostSpan.style.margin = '0';

        boostButton._voiceSpan = voiceSpan;
        boostButton._boostSpan = boostSpan;

        boostButton.appendChild(voiceSpan);
        boostButton.appendChild(boostSpan);

        boostButton.addEventListener('click', () => {
            const videoElement = parentDiv.querySelector('video');
            if (!videoElement) return;

            if (isEnhancementActive) {
                disableAudioGraph(videoElement);
                localStorage.setItem('voiceBoostEnabled', 'false');
            } else {
                setupAudioGraph(videoElement);
                localStorage.setItem('voiceBoostEnabled', 'true');
            }
        });

        parentDiv.appendChild(boostButton);
        updateButtonState();
    }

    function createToggleButtonCloudnestra() {
        const parentDiv = document.getElementById('oframeplayer_parent');
        if (!parentDiv || document.getElementById('voice-boost-button')) return;

        boostButton = document.createElement('button');
        boostButton.id = 'voice-boost-button';
        boostButton.classList.add('cineby-scale');
        boostButton.dataset.tooltip = 'Voice Boost';
        boostButton.style.position = 'absolute';
        boostButton.style.left = '250px';
        boostButton.style.bottom = '15px';
        boostButton.style.zIndex = '99999';
        boostButton.style.display = 'flex';
        boostButton.style.flexDirection = 'column';
        boostButton.style.alignItems = 'center';
        boostButton.style.justifyContent = 'center';
        boostButton.style.border = '2px solid white';
        boostButton.style.borderRadius = '5px';
        boostButton.style.padding = '2px 4px';
        boostButton.style.fontFamily = 'sans-serif';
        boostButton.style.fontSize = '10px';
        boostButton.style.fontWeight = 'bold';
        boostButton.style.lineHeight = '1';
        boostButton.style.color = 'white';
        boostButton.style.backgroundColor = 'transparent';
        boostButton.style.cursor = 'pointer';

        const voiceSpan = document.createElement('span');
        voiceSpan.textContent = 'VOICE';
        voiceSpan.style.display = 'block';
        voiceSpan.style.fontSize = '10px';
        voiceSpan.style.lineHeight = '1';
        voiceSpan.style.margin = '0';

        const boostSpan = document.createElement('span');
        boostSpan.textContent = 'BOOST';
        boostSpan.style.display = 'block';
        boostSpan.style.fontSize = '10px';
        boostSpan.style.lineHeight = '1';
        boostSpan.style.margin = '0';

        boostButton._voiceSpan = voiceSpan;
        boostButton._boostSpan = boostSpan;

        boostButton.appendChild(voiceSpan);
        boostButton.appendChild(boostSpan);

        boostButton.addEventListener('click', () => {
            const videoElement = parentDiv.querySelector('video');
            if (!videoElement) return;

            if (isEnhancementActive) {
                disableAudioGraph(videoElement);
                localStorage.setItem('voiceBoostEnabled', 'false');
            } else {
                setupAudioGraph(videoElement);
                localStorage.setItem('voiceBoostEnabled', 'true');
            }
        });

        parentDiv.appendChild(boostButton);
        updateButtonState();
    }

    function createToggleButtonCinesrc() {
        const videoElement = document.querySelector('video');
        if (!videoElement || document.getElementById('voice-boost-button')) return;

        const bottomControlBar = document.querySelector('media-controller .notflix-controlbar');
        const volumeWrapper = bottomControlBar ? bottomControlBar.querySelector('.media-volume-wrapper') : null;
        const fullscreenButton = bottomControlBar ? bottomControlBar.querySelector('media-fullscreen-button') : null;
        const spacer = bottomControlBar
            ? Array.from(bottomControlBar.children).find(node => node.classList && node.classList.contains('grow'))
            : null;

        boostButton = document.createElement('button');
        boostButton.id = 'voice-boost-button';
        boostButton.classList.add('cineby-scale');
        boostButton.dataset.tooltip = 'Voice Boost';
        boostButton.style.display = 'flex';
        boostButton.style.flexDirection = 'column';
        boostButton.style.alignItems = 'center';
        boostButton.style.justifyContent = 'center';
        boostButton.style.border = '2px solid white';
        boostButton.style.borderRadius = '5px';
        boostButton.style.padding = '2px 4px';
        boostButton.style.fontFamily = 'sans-serif';
        boostButton.style.fontSize = '10px';
        boostButton.style.fontWeight = 'bold';
        boostButton.style.lineHeight = '1';
        boostButton.style.color = 'white';
        boostButton.style.backgroundColor = 'transparent';
        boostButton.style.cursor = 'pointer';
        boostButton.style.zIndex = '99999';
        boostButton.style.pointerEvents = 'auto';

        const voiceSpan = document.createElement('span');
        voiceSpan.textContent = 'VOICE';
        voiceSpan.style.display = 'block';
        voiceSpan.style.fontSize = '10px';
        voiceSpan.style.lineHeight = '1';
        voiceSpan.style.margin = '0';

        const boostSpan = document.createElement('span');
        boostSpan.textContent = 'BOOST';
        boostSpan.style.display = 'block';
        boostSpan.style.fontSize = '10px';
        boostSpan.style.lineHeight = '1';
        boostSpan.style.margin = '0';

        boostButton._voiceSpan = voiceSpan;
        boostButton._boostSpan = boostSpan;

        boostButton.appendChild(voiceSpan);
        boostButton.appendChild(boostSpan);

        boostButton.addEventListener('click', () => {
            const activeVideoElement = document.querySelector('video');
            if (!activeVideoElement) return;

            if (isEnhancementActive) {
                disableAudioGraph(activeVideoElement);
                localStorage.setItem('voiceBoostEnabled', 'false');
            } else {
                setupAudioGraph(activeVideoElement);
                localStorage.setItem('voiceBoostEnabled', 'true');
            }
        });

        if (bottomControlBar && volumeWrapper) {
            boostButton.style.marginLeft = '10px';
            if (spacer) {
                bottomControlBar.insertBefore(boostButton, spacer);
            } else if (fullscreenButton) {
                bottomControlBar.insertBefore(boostButton, fullscreenButton);
            } else {
                bottomControlBar.insertBefore(boostButton, volumeWrapper.nextSibling);
            }
        } else if (fullscreenButton && fullscreenButton.parentElement) {
            boostButton.style.marginLeft = '8px';
            fullscreenButton.parentElement.insertBefore(boostButton, fullscreenButton);
        } else {
            const playerContainer = videoElement.parentElement || videoElement;
            if (playerContainer instanceof HTMLElement && getComputedStyle(playerContainer).position === 'static') {
                playerContainer.style.position = 'relative';
            }
            boostButton.style.position = 'absolute';
            boostButton.style.right = '16px';
            boostButton.style.bottom = '72px';
            playerContainer.appendChild(boostButton);
        }

        updateButtonState();
    }

    function updateBoostButtonVisibility() {
        const parentDiv = document.getElementById('oframeplayer_parent');
        if (!parentDiv || !boostButton) return;

        // Find the main controls bar (usually bottom: 0px; height: 50px;)
        const controlsBar = Array.from(parentDiv.querySelectorAll('pjsdiv'))
            .find(div => div.style.position === 'absolute' && div.style.bottom === '0px' && div.style.height === '50px');

        if (controlsBar && controlsBar.style.display !== 'none' && controlsBar.style.opacity !== '0') {
            boostButton.style.display = 'flex';
        } else {
            boostButton.style.display = 'none';
        }
    }

    function main() {
        setInterval(() => {
            if (hostName === 'atishramkhe.github.io') {
                const iframeElement = document.querySelector('#player-content iframe');
                if (iframeElement) {
                    if (!document.getElementById('voice-boost-button')) {
                        createToggleButtonHostOverlay();
                    }
                    syncHostFrameVoiceBoostPreference(iframeElement);
                }
            }

            if (hostName === 'vidking.net') {
                if (!document.getElementById('voice-boost-button')) {
                    createToggleButtonVidKing();
                }
            } else if (hostName === 'vidsrc-embed.ru') {
                if (!document.getElementById('voice-boost-button')) {
                    createToggleButtonVidsrc();
                }
                updateBoostButtonVisibility();
            } else if (hostName === 'cloudnestra.com') {
                if (!document.getElementById('voice-boost-button')) {
                    createToggleButtonCloudnestra();
                }
                updateBoostButtonVisibility();
            } else if (hostName === 'cinesrc.st') {
                if (!document.getElementById('voice-boost-button')) {
                    createToggleButtonCinesrc();
                }
            } else if (hostName === 'xprime.today' || hostName === 'xprime.tv') {
                if (!document.getElementById('voice-boost-button')) {
                    createToggleButtonXprime();
                }
            } else {
                // Default (Cineby/Videasy)
                const playButton = document.getElementById('ButtonPlay');
                if (playButton && !document.getElementById('voice-boost-button')) {
                    createToggleButtonDefault();
                } else if (genericOverlayHosts.has(hostName) && !document.getElementById('voice-boost-button')) {
                    createToggleButtonGeneric();
                }
            }

            const videoElement = document.querySelector('video');
            const videoSource = videoElement ? (videoElement.currentSrc || videoElement.src || '') : '';
            if (videoElement && videoSource) {
                if (videoElement !== currentVideoElement || videoSource !== currentVideoSource) {
                    currentVideoElement = videoElement;
                    currentVideoSource = videoSource;
                    isEnhancementActive = false;
                    updateButtonState();
                }

                const boostEnabled = localStorage.getItem('voiceBoostEnabled') === 'true';
                if (boostEnabled && !isEnhancementActive && document.getElementById('voice-boost-button')) {
                    setupAudioGraph(videoElement);
                } else if (!boostEnabled) {
                    isEnhancementActive = false;
                    updateButtonState();
                }
            }
        }, 500);
    }

    main();

    window.addEventListener('message', handleVoiceBoostMessage);


})();

