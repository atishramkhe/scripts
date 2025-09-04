// ==UserScript==
// @name        GitHub Master Script Loader (URL-Aware with Caching)
// @namespace   atishramkhe
// @version     2.1
// @description Loads and executes other Violentmonkey scripts from your GitHub repository, respecting their @match/@include/@exclude directives, with caching.
// @author      Ateaish
// @match       *://*/*
// @grant       GM.xmlHttpRequest
// @grant       GM_addStyle
// @grant       GM_setValue
// @grant       GM_getValue
// @run-at      document-start
// @updateURL   https://raw.githubusercontent.com/atishramkhe/scripts/refs/heads/main/github_master_loader.user.js
// @downloadURL https://raw.githubusercontent.com/atishramkhe/scripts/refs/heads/main/github_master_loader.user.js
// ==/UserScript==

(function() {
    'use strict';

    // IMPORTANT: Replace these with the raw URLs of your scripts on GitHub.
    const scriptUrls = [
        'https://raw.githubusercontent.com/atishramkhe/scripts/refs/heads/main/anime_sama_netflix_player.user.js',
        'https://raw.githubusercontent.com/atishramkhe/scripts/refs/heads/main/cineby_voice_enhancer.user.js',
        'https://raw.githubusercontent.com/atishramkhe/scripts/refs/heads/main/youtube_audio_only.user.js',
        // Add more script URLs here as needed
    ];

     

    /**
     * Checks if a given URL matches a Violentmonkey-style pattern.
     * This is a simplified implementation and might not cover all edge cases of GM patterns.
     * It handles *, protocol, domain, and path wildcards.
     * @param {string} url The URL to test.
     * @param {string} pattern The Violentmonkey @match/@include/@exclude pattern.
     * @returns {boolean} True if the URL matches the pattern, false otherwise.
     */
    function isUrlMatch(url, pattern) {
        // Escape special regex characters, then convert * to .*
        let regexString = pattern
            .replace(/[.+?^${}()|[\\]/g, '\$&') // Corrected: Escape special regex characters
            .replace(/\*/g, '.*'); // Convert * to .*

        // Handle protocol wildcard *://
        if (regexString.startsWith('.*:\/\/')) {
            regexString = '^(http|https):\/\/' + regexString.substring('.*:\/\/'.length);
        } else if (regexString.startsWith('http:\/\/')) {
            regexString = '^http:\/\/' + regexString.substring('http:\/\/'.length);
        } else if (regexString.startsWith('https:\/\/')) {
            regexString = '^https:\/\/' + regexString.substring('https:\/\/'.length);
        } else {
            // If no protocol specified, assume http or https
            regexString = '^(http|https):\/\/' + regexString;
        }

        // Ensure it matches the whole string
        regexString += '$';

        try {
            const regex = new RegExp(regexString);
            return regex.test(url);
        } catch (e) {
            console.warn(`[Master Script] Invalid regex pattern generated from match pattern: ${pattern}`, e);
            return false;
        }
    }

    /**
     * Determines if a script's content should be executed based on its metadata
     * and the current URL.
     * @param {string} currentUrl The URL of the current page.
     * @param {string} scriptContent The full content of the userscript.
     * @returns {boolean} True if the script should be executed, false otherwise.
     */
    function shouldExecuteScript(currentUrl, scriptContent) {
        const matchPatterns = [];
        const includePatterns = [];
        const excludePatterns = [];

        const lines = scriptContent.split('\n');
        for (const line of lines) {
            if (line.startsWith('// @match')) {
                matchPatterns.push(line.substring('// @match'.length).trim());
            } else if (line.startsWith('// @include')) {
                includePatterns.push(line.substring('// @include'.length).trim());
            } else if (line.startsWith('// @exclude')) {
                excludePatterns.push(line.substring('// @exclude'.length).trim());
            }
        }

        // Logic based on Violentmonkey's pattern matching:
        // 1. If @match patterns are specified, the URL must match at least one of them.
        //    If no @match patterns, it defaults to matching all URLs (unless @include/exclude restrict it).
        let matches = true;
        if (matchPatterns.length > 0) {
            matches = matchPatterns.some(pattern => isUrlMatch(currentUrl, pattern));
        }

        // 2. If @include patterns are specified, the URL must match at least one of them.
        let includes = true;
        if (includePatterns.length > 0) {
            includes = includePatterns.some(pattern => isUrlMatch(currentUrl, pattern));
        }

        // 3. If @exclude patterns are specified, the URL must NOT match any of them.
        let excludes = false; // Assume not excluded initially
        if (excludePatterns.length > 0) {
            excludes = excludePatterns.some(pattern => isUrlMatch(currentUrl, pattern));
        }

        return (matches && includes && !excludes);
    }

    const currentUrl = window.location.href;

    scriptUrls.forEach(url => {
            // Fetch from GitHub always
            GM.xmlHttpRequest({
                method: "GET",
                url: url,
                onload: function(response) {
                    if (response.status === 200) {
                        const fetchedContent = response.responseText;
                        console.log(`[Master Script] Successfully fetched: ${url}`);
                        if (shouldExecuteScript(currentUrl, fetchedContent)) {
                            try {
                                eval(fetchedContent);
                                console.log(`[Master Script] Executed fetched script: ${url}`);
                            } catch (e) {
                                console.error(`[Master Script] Error executing fetched script from ${url}:`, e);
                            }
                        } else {
                            console.log(`[Master Script] Skipping fetched script ${url} as it does not match the current URL: ${currentUrl}`);
                        }
                    } else {
                        console.error(`[Master Script] Failed to fetch script from ${url}. Status: ${response.status}`);
                    }
                },
                onerror: function(error) {
                    console.error(`[Master Script] Network error fetching script from ${url}:`, error);
                }
            });
        });
})();
