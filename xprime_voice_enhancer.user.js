// ==UserScript==
// @name         Xprime.tv Voice Enhancer
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Enhances voice frequencies on Xprime.tv.
// @author       Ateaish
// @match        https://xprime.tv/*
// @match        https://xprime.today/*
// @allFrames    true
// @grant        none
// @updateURL    https://raw.githubusercontent.com/atishramkhe/scripts/refs/heads/main/xprime/xprime_voice_enhancer.user.js
// @downloadURL  https://raw.githubusercontent.com/atishramkhe/scripts/refs/heads/main/xprime/xprime_voice_enhancer.user.js
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
                console.error('[Xprime Voice Enhancer] Error creating source node:', e);
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
                boostButton.style.borderColor = '#4CAF50'; // Green when on
                boostButton.style.color = '#4CAF50';
            } else {
                boostButton.style.borderColor = 'white'; // Default color when off
                boostButton.style.color = 'white';
            }
        }
    }

    function createToggleButton() {
        const controlsContainer = document.querySelector('.first-controls-container.svelte-1i4gjts');
        if (!controlsContainer || document.getElementById('voice-boost-button')) {
            return;
        }

        boostButton = document.createElement('button');
        boostButton.id = 'voice-boost-button';
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
        boostButton.style.marginLeft = '10px';
        boostButton.style.backgroundColor = 'transparent';


        const voiceSpan = document.createElement('span');
        voiceSpan.textContent = 'VOICE';
        const boostSpan = document.createElement('span');
        boostSpan.textContent = 'BOOST';

        boostButton.appendChild(voiceSpan);
        boostButton.appendChild(boostSpan);

        boostButton.addEventListener('click', (e) => {
            e.stopPropagation();
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

    function main() {
        setInterval(() => {
            const controlsContainer = document.querySelector('.first-controls-container.svelte-1i4gjts');
            if (controlsContainer && !document.getElementById('voice-boost-button')) {
                createToggleButton();
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
