// ==UserScript==
// @name        GitHub Master Script Loader
// @namespace   atishramkhe
// @version     1.0
// @description Loads and executes other Violentmonkey scripts from your GitHub repository.
// @author      Ateaish
// @match       *://*/*
// @grant       GM.xmlHttpRequest
// @run-at      document-start
// @updateURL   https://raw.githubusercontent.com/atishramkhe/scripts/refs/heads/main/github_master_loader.user.js
// @downloadURL https://raw.githubusercontent.com/atishramkhe/scripts/refs/heads/main/github_master_loader.user.js
// ==/UserScript==

(function() {
    'use strict';

    // IMPORTANT: Replace these with the raw URLs of your scripts on GitHub.
    // To get a raw URL:
    // 1. Go to your script file on GitHub.
    // 2. Click the "Raw" button.
    // 3. Copy the URL from your browser's address bar.
    const scriptUrls = [
        'https://raw.githubusercontent.com/atishramkhe/scripts/refs/heads/main/anime_sama_netflix_player.user.js',
        'https://raw.githubusercontent.com/atishramkhe/scripts/refs/heads/main/cineby_voice_enhancer.user.js',
        // Add more script URLs here as needed
    ];

    scriptUrls.forEach(url => {
        GM.xmlHttpRequest({
            method: "GET",
            url: url,
            onload: function(response) {
                if (response.status === 200) {
                    try {
                        // Execute the fetched script content
                        eval(response.responseText);
                        console.log(`Successfully loaded and executed: ${url}`);
                    } catch (e) {
                        console.error(`Error executing script from ${url}:`, e);
                    }
                } else {
                    console.error(`Failed to fetch script from ${url}. Status: ${response.status}`);
                }
            },
            onerror: function(error) {
                console.error(`Network error fetching script from ${url}:`, error);
            }
        });
    });
})();
