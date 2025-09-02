// ==UserScript==
// @name         Cineby.app Voice Enhancer
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Enhances voice frequencies on Cineby.app using a BiquadFilterNode.
// @author       Gemini
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
        const button = document.createElement('button');
        button.textContent = 'Better Voice';
        button.style.position = 'fixed';
        button.style.top = '10px';
        button.style.right = '10px';
        button.style.zIndex = '99999';
        button.style.padding = '10px';
        button.style.backgroundColor = '#333'; // Darker when off
        button.style.color = 'white';
        button.style.border = 'none';
        button.style.borderRadius = '5px';
        button.style.cursor = 'pointer';

        const updateButtonState = () => {
            if (isEnhancementActive) {
                button.style.backgroundColor = '#888'; // Lighter when on
            } else {
                button.style.backgroundColor = '#333'; // Darker when off
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
        document.body.appendChild(button);

        // Initial state update
        updateButtonState();
    }

    function init() {
        let videoFound = false;

        const findAndSetupVideo = () => {
            const videoElement = document.querySelector('video');
            if (videoElement && !videoFound) {
                createToggleButton();
                setupAudioGraph(videoElement);
                videoFound = true;
                console.log('Video element found and audio graph set up.');
                return true; // Indicate video found
            }
            return false; // Indicate video not found yet
        };

        // Try to find video immediately
        if (findAndSetupVideo()) {
            return; // If found, no need for observers/intervals
        }

        console.log('Video element not found yet. Waiting...');

        // Use a MutationObserver to wait for the video element to be added
        const observer = new MutationObserver((mutationsList, observer) => {
            if (findAndSetupVideo()) {
                observer.disconnect(); // Stop observing once video is found
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });

        // Fallback: Use setInterval to periodically check for the video element
        const intervalId = setInterval(() => {
            if (findAndSetupVideo()) {
                clearInterval(intervalId); // Stop interval once video is found
            }
        }, 500); // Check every 500ms
    }

    // Run initialization when the DOM is fully loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
