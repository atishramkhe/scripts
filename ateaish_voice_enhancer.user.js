// ==UserScript==
// @name         Voice Enhancer
// @namespace    http://tampermonkey.net/
// @version      1.9
// @description  Enhances voice frequencies on Cineby-style, Videasy, and VidKing players
// @author       Ateaish
// @match        https://player.videasy.net/*
// @match        https://atishramkhe.github.io/movies/*
// @match        https://www.vidking.net/embed/*
// @match        https://vidsrc-embed.ru/embed/*
// @match        https://cloudnestra.com/*
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
    let isEnhancementActive = false;
    const sourceNodeMap = new WeakMap();
    let currentVideoElement;
    let boostButton;

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
            if (videoElement) {
                if (isEnhancementActive) {
                    disableAudioGraph(videoElement);
                } else {
                    setupAudioGraph(videoElement);
                }
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
            if (videoElement) {
                if (isEnhancementActive) {
                    disableAudioGraph(videoElement);
                } else {
                    setupAudioGraph(videoElement);
                }
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
            if (videoElement) {
                if (isEnhancementActive) {
                    disableAudioGraph(videoElement);
                } else {
                    setupAudioGraph(videoElement);
                }
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
            if (videoElement) {
                if (isEnhancementActive) {
                    disableAudioGraph(videoElement);
                } else {
                    setupAudioGraph(videoElement);
                }
            }
        });

        parentDiv.appendChild(boostButton);
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
            if (location.hostname === 'www.vidking.net') {
                if (!document.getElementById('voice-boost-button')) {
                    createToggleButtonVidKing();
                }
            } else if (location.hostname === 'vidsrc-embed.ru') {
                if (!document.getElementById('voice-boost-button')) {
                    createToggleButtonVidsrc();
                }
                updateBoostButtonVisibility();
            } else if (location.hostname === 'cloudnestra.com') {
                if (!document.getElementById('voice-boost-button')) {
                    createToggleButtonCloudnestra();
                }
                updateBoostButtonVisibility();
            } else {
                // Default (Cineby/Videasy)
                const playButton = document.getElementById('ButtonPlay');
                if (playButton && !document.getElementById('voice-boost-button')) {
                    createToggleButtonDefault();
                }
            }

            const videoElement = document.querySelector('video');
            if (videoElement && videoElement.src && videoElement !== currentVideoElement) {
                currentVideoElement = videoElement;
                isEnhancementActive = false;
                updateButtonState();
            }
        }, 500);
    }

    main();

})();

