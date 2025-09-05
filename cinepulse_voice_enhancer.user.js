// ==UserScript==
// @name         Cinepulse.to Voice Enhancer
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Enhances voice frequencies on Cinepulse.to.
// @author       Ateaish
// @match        https://cinepulse.to/*
// @allFrames    true
// @grant        none
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
    let hideTimeout = null;

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
                console.error('[Cinepulse Voice Enhancer] Error creating source node:', e);
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

    function createToggleButton() {
        if (document.getElementById('voice-boost-button')) {
            return;
        }

        boostButton = document.createElement('button');
        boostButton.id = 'voice-boost-button';
        boostButton.dataset.tooltip = 'Voice Boost';

        // Rectangular, compact style similar to Cineby
        boostButton.style.position = 'fixed';
        boostButton.style.top = '70px';
        boostButton.style.right = '20px';
        boostButton.style.zIndex = '9999';
        boostButton.style.border = '2px solid white';
        boostButton.style.borderRadius = '5px';
        boostButton.style.padding = '2px 4px';
        boostButton.style.width = '48px';
        boostButton.style.height = '38px';
        boostButton.style.fontFamily = 'sans-serif';
        boostButton.style.fontSize = '11px';
        boostButton.style.fontWeight = 'bold';
        boostButton.style.lineHeight = '1';
        boostButton.style.color = 'white';
        boostButton.style.backgroundColor = 'transparent'; // No background
        boostButton.style.cursor = 'pointer';
        boostButton.style.display = 'flex';
        boostButton.style.flexDirection = 'column';
        boostButton.style.alignItems = 'center';
        boostButton.style.justifyContent = 'center';
        boostButton.style.transition = 'border-color 0.2s, color 0.2s, opacity 0.4s';
        boostButton.style.opacity = '1';
        boostButton.style.visibility = 'visible';

        // Text stacking, minimal gap
        const voiceSpan = document.createElement('span');
        voiceSpan.textContent = 'VOICE';
        voiceSpan.style.display = 'block';
        voiceSpan.style.fontSize = '11px';
        voiceSpan.style.lineHeight = '1';
        voiceSpan.style.marginTop = '0';
        voiceSpan.style.marginBottom = '0';

        const boostSpan = document.createElement('span');
        boostSpan.textContent = 'BOOST';
        boostSpan.style.display = 'block';
        boostSpan.style.fontSize = '11px';
        boostSpan.style.lineHeight = '1';
        boostSpan.style.marginTop = '0';
        boostSpan.style.marginBottom = '0';

        boostButton._voiceSpan = voiceSpan;
        boostButton._boostSpan = boostSpan;

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

        document.body.appendChild(boostButton);

        updateButtonState();
    }

    function updateButtonState() {
        if (boostButton) {
            const green = '#4CAF50';
            const white = 'white';
            if (isEnhancementActive) {
                boostButton.style.borderColor = green;
                boostButton.style.color = green;
                if (boostButton._voiceSpan) boostButton._voiceSpan.style.color = green;
                if (boostButton._boostSpan) boostButton._boostSpan.style.color = green;
            } else {
                boostButton.style.borderColor = white;
                boostButton.style.color = white;
                if (boostButton._voiceSpan) boostButton._voiceSpan.style.color = white;
                if (boostButton._boostSpan) boostButton._boostSpan.style.color = white;
            }
        }
    }

    // Smooth fade in
    function showBoostButton() {
        if (boostButton) {
            boostButton.style.opacity = '1';
            boostButton.style.visibility = 'visible';
            clearTimeout(hideTimeout);
            hideTimeout = setTimeout(() => {
                hideBoostButton();
            }, 3000);
        }
    }

    // Smooth fade out
    function hideBoostButton() {
        if (boostButton) {
            boostButton.style.opacity = '0';
            boostButton.style.visibility = 'hidden';
            clearTimeout(hideTimeout);
        }
    }

    // Listen for mouse movement to show the button
    function setupMouseMovementHandler() {
        document.addEventListener('mousemove', showBoostButton);
    }

    // Listen for fullscreen changes to reposition the button
    function setupFullscreenHandler() {
        document.addEventListener('fullscreenchange', () => {
            const video = document.querySelector('video');
            if (!boostButton || !video) return;

            if (document.fullscreenElement) {
                // Move button into fullscreen container
                document.fullscreenElement.appendChild(boostButton);
                boostButton.style.position = 'absolute';
                boostButton.style.top = '20px';
                boostButton.style.right = '20px';
            } else {
                // Move button back to body
                document.body.appendChild(boostButton);
                boostButton.style.position = 'fixed';
                boostButton.style.top = '70px';
                boostButton.style.right = '20px';
            }
        });
    }

    // Observe player UI visibility (if possible)
    function setupPlayerUIObserver() {
        const playerContainer = document.querySelector('.w-full.absolute.bottom-0.right-0.left-0');
        if (playerContainer) {
            const observer = new MutationObserver(() => {
                if (playerContainer.classList.contains('pointer-events-none')) {
                    hideBoostButton();
                } else {
                    showBoostButton();
                }
            });
            observer.observe(playerContainer, { attributes: true });
        }
    }

    function main() {
        waitForVideoAndCreateButton();

        // Setup handlers
        setupMouseMovementHandler();
        setupFullscreenHandler();
        setupPlayerUIObserver();

        // Initially hide the button after 3 seconds
        setTimeout(() => {
            hideBoostButton();
        }, 3000);
    }

    // Wait for video to appear before creating the button
    function waitForVideoAndCreateButton() {
        setInterval(() => {
            const videoElement = document.querySelector('video');
            if (videoElement) {
                if (!boostButton) {
                    createToggleButton();
                }
            } else {
                removeBoostButton();
            }
        }, 500);
    }

    function removeBoostButton() {
        if (boostButton && boostButton.parentNode) {
            boostButton.parentNode.removeChild(boostButton);
            boostButton = null;
        }
        // Reset enhancement state
        isEnhancementActive = false;

        // Disconnect audio context and filters if needed
        if (audioContext) {
            try {
                audioContext.close();
            } catch (e) {}
            audioContext = null;
            highPassFilter = null;
            peakingFilter1 = null;
            peakingFilter2 = null;
            compressor = null;
            currentVideoElement = null;
            sourceNodeMap.clear();
        }
    }

    main();

})();