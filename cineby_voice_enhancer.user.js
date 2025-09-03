// ==UserScript==
// @name         Cineby.app Voice Enhancer
// @namespace    http://tampermonkey.net/
// @version      0.4
// @description  Enhances voice frequencies on Cineby.app using a BiquadFilterNode.
// @author       Ateaish
// @match        https://www.cineby.app/*
// @match        https://filmcave.net/*
// @allFrames    true
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let audioContext;
    let sourceNode;
    let biquadFilter;
    let isEnhancementActive = false;

    function setupAudioGraph(videoElement) {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        if (!sourceNode) {
            sourceNode = audioContext.createMediaElementSource(videoElement);
        }

        if (!biquadFilter) {
            biquadFilter = audioContext.createBiquadFilter();
            biquadFilter.type = "peaking"; // Boosts a specific frequency range
            biquadFilter.frequency.value = 2000; // Center frequency for voice enhancement (Hz)
            biquadFilter.Q.value = 1; // Quality factor, controls bandwidth
            biquadFilter.gain.value = 10; // Gain in dB
        }

        // Disconnect previous connections if any
        sourceNode.disconnect();
        biquadFilter.disconnect();

        // Connect the nodes
        sourceNode.connect(biquadFilter);
        biquadFilter.connect(audioContext.destination);
        isEnhancementActive = true;
        console.log('Voice enhancement active.');
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
        const controlsParent = document.querySelector('.flex.h-12.flex-shrink-0');
        if (!controlsParent || document.getElementById('voice-boost-button')) {
            return;
        }

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

        const buttonWrapper = document.createElement('div');
        buttonWrapper.appendChild(button);
        controlsParent.insertBefore(buttonWrapper, controlsParent.firstChild);
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
    }

    // Run initialization when the DOM is fully loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
