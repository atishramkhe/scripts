// ==UserScript==
// @name         Cineby.app Voice Enhancer
// @namespace    http://tampermonkey.net/
// @version      0.7
// @description  Enhances voice frequencies on Cineby.app using a BiquadFilterNode.
// @author       Ateaish
// @match        https://www.cineby.app/*
// @allFrames    true
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let audioContext;
    let sourceNode;
    let highPassFilter;
    let peakingFilter1;
    let peakingFilter2;
    let compressor;
    let isEnhancementActive = false;

    function setupAudioGraph(videoElement) {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        if (!sourceNode) {
            sourceNode = audioContext.createMediaElementSource(videoElement);
        }

        // Create and configure the audio nodes
        highPassFilter = audioContext.createBiquadFilter();
        highPassFilter.type = 'highpass';
        highPassFilter.frequency.value = 100; // Cut off frequencies below 100Hz

        peakingFilter1 = audioContext.createBiquadFilter();
        peakingFilter1.type = 'peaking';
        peakingFilter1.frequency.value = 1500; // Boost fundamental voice frequencies
        peakingFilter1.Q.value = 1.5;
        peakingFilter1.gain.value = 6;

        peakingFilter2 = audioContext.createBiquadFilter();
        peakingFilter2.type = 'peaking';
        peakingFilter2.frequency.value = 3000; // Boost voice harmonics and clarity
        peakingFilter2.Q.value = 1.5;
        peakingFilter2.gain.value = 4;

        compressor = audioContext.createDynamicsCompressor();
        compressor.threshold.value = -20; // Start compressing when the signal exceeds -20dB
        compressor.knee.value = 20; // Softer transition into compression
        compressor.ratio.value = 4; // 4:1 compression ratio
        compressor.attack.value = 0.05; // 50ms attack time
        compressor.release.value = 0.25; // 250ms release time

        // Connect the nodes in a chain
        sourceNode.disconnect();
        sourceNode.connect(highPassFilter);
        highPassFilter.connect(peakingFilter1);
        peakingFilter1.connect(peakingFilter2);
        peakingFilter2.connect(compressor);
        compressor.connect(audioContext.destination);

        isEnhancementActive = true;
        console.log('Advanced voice enhancement active.');
    }

    function disableAudioGraph() {
        if (sourceNode && audioContext) {
            sourceNode.disconnect();
            sourceNode.connect(audioContext.destination); // Connect video directly to destination
            isEnhancementActive = false;
            console.log('Voice enhancement disabled.');
        }
    }

    function createToggleButton() {
        const volumeButton = document.getElementById('ButtonVolume');
        if (!volumeButton || document.getElementById('voice-boost-button')) {
            return;
        }
        const volumeButtonContainer = volumeButton.parentElement;

        const button = document.createElement('button');
        button.id = 'voice-boost-button';
        button.classList.add('cineby-scale');
        button.dataset.tooltip = 'Voice Boost';
        button.style.display = 'flex';
        button.style.flexDirection = 'column';
        button.style.alignItems = 'center';
        button.style.justifyContent = 'center';
        button.style.border = '1px solid white';
        button.style.borderRadius = '5px';
        button.style.padding = '2px 4px';
        button.style.fontFamily = 'sans-serif';
        button.style.fontSize = '8px';
        button.style.lineHeight = '1';
        button.style.color = 'white';
        button.style.marginLeft = '10px';

        const voiceSpan = document.createElement('span');
        voiceSpan.textContent = 'VOICE';
        const boostSpan = document.createElement('span');
        boostSpan.textContent = 'BOOST';

        button.appendChild(voiceSpan);
        button.appendChild(boostSpan);

        const updateButtonState = () => {
            if (isEnhancementActive) {
                button.style.borderColor = '#4CAF50'; // Green when on
                button.style.color = '#4CAF50';
            } else {
                button.style.borderColor = 'white'; // Default color when off
                button.style.color = 'white';
            }
        };

        button.addEventListener('click', () => {
            const videoElement = document.querySelector('video');
            if (videoElement) {
                if (isEnhancementActive) {
                    disableAudioGraph();
                } else {
                    setupAudioGraph(videoElement);
                }
                updateButtonState();
            } else {
                console.warn('Video element not found.');
            }
        });

        volumeButtonContainer.insertAdjacentElement('afterend', button);
        updateButtonState();
    }

    function init() {
        const observer = new MutationObserver((mutationsList, observer) => {
            for (const mutation of mutationsList) {
                if (mutation.type === 'childList') {
                    createToggleButton();
                }
            }
        });

        const targetNode = document.getElementById('cineby-player-wrapper');
        if (targetNode) {
            observer.observe(targetNode, { childList: true, subtree: true });
        } else {
            // Fallback if the wrapper is not immediately available
            const bodyObserver = new MutationObserver((mutationsList, bodyObserver) => {
                const targetNode = document.getElementById('cineby-player-wrapper');
                if (targetNode) {
                    bodyObserver.disconnect();
                    observer.observe(targetNode, { childList: true, subtree: true });
                }
            });
            bodyObserver.observe(document.body, { childList: true, subtree: true });
        }

        // Fallback interval to ensure the button is created
        setInterval(() => {
            createToggleButton();
        }, 1000);
    }

    // Run initialization when the DOM is fully loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
