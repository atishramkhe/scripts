// ==UserScript==
// @name         ateaish drama helpers (kisskh companion)
// @namespace    https://github.com/atishramkhe
// @version      1.2.0
// @description  Companion script for ateaish drama — progress tracking, resume, ad hiding, keyboard shortcuts, parent-frame sync, and CORS-free API bridge for kisskh.ovh
// @match        https://kisskh.ovh/*
// @match        https://kisskh.co/*
// @match        https://kisskh.la/*
// @match        https://atishramkhe.github.io/drama/*
// @match        https://localhost:8000/drama/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @connect      kisskh.ovh
// @connect      kisskh.co
// @connect      kisskh.la
// ==/UserScript==

(function () {
	'use strict';

	// ─────────────────────────────────────────────
	//  CONFIG
	// ─────────────────────────────────────────────
	const CFG = {
		progressIntervalMs: 3000,       // how often to save & report progress
		pollVideoMs: 1000,              // poll for <video> element
		hideAdsWhenEmbedded: true,      // hide clutter when in iframe
		debug: false,
	};

	const LOG_PREFIX = '[ateaish:drama]';
	const log = (...a) => console.log(LOG_PREFIX, ...a);
	const dbg = (...a) => { if (CFG.debug) console.debug(LOG_PREFIX, ...a); };

	// Are we on a kisskh site or on the ateaish drama page?
	const isKisskhSite = /kisskh\.(ovh|co|la)/i.test(location.hostname);

	// ─────────────────────────────────────────────
	//  UTILITIES
	// ─────────────────────────────────────────────
	const isEmbedded = (() => {
		try { return window.self !== window.top; } catch { return true; }
	})();

	function getEpisodeFromUrl(url = location.href) {
		try {
			const m = new URL(url).pathname.match(/\/Episode-(\d+)/i);
			return m ? Number(m[1]) : null;
		} catch { return null; }
	}

	function getDramaIdFromUrl(url = location.href) {
		try {
			const id = new URL(url).searchParams.get('id') || null;
			if (id) _cachedDramaId = id;
			return id || _cachedDramaId || null;
		} catch { return _cachedDramaId || null; }
	}
	let _cachedDramaId = null;

	function getDramaSlugFromUrl(url = location.href) {
		try {
			const m = new URL(url).pathname.match(/\/Drama\/([^/]+)/i);
			return m ? m[1] : null;
		} catch { return null; }
	}

	function pickBestVideo() {
		const videos = Array.from(document.querySelectorAll('video'));
		if (!videos.length) return null;
		let best = null, bestScore = -1;
		for (const v of videos) {
			const r = v.getBoundingClientRect();
			const area = Math.max(0, r.width) * Math.max(0, r.height);
			const visible = r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
			const has = Number.isFinite(v.duration) && v.duration > 0;
			const score = (visible ? 1e6 : 0) + area + (has ? 1e5 : 0);
			if (score > bestScore) { bestScore = score; best = v; }
		}
		return best;
	}

	// ─────────────────────────────────────────────
	//  1. PROGRESS TRACKING & PARENT SYNC
	// ─────────────────────────────────────────────
	const STORAGE_KEY_PREFIX = 'ateaish_progress_';

	function buildProgressData(video) {
		const ep = getEpisodeFromUrl();
		const dramaId = getDramaIdFromUrl();
		const slug = getDramaSlugFromUrl();
		if (!video || !ep || !dramaId) return null;

		return {
			dramaId,
			slug,
			episode: ep,
			currentTime: video.currentTime || 0,
			duration: video.duration || 0,
			percent: video.duration > 0 ? Math.round((video.currentTime / video.duration) * 100) : 0,
			paused: video.paused,
			updatedAt: Date.now(),
		};
	}

	function saveProgress(data) {
		if (!data) return;
		try {
			localStorage.setItem(STORAGE_KEY_PREFIX + data.dramaId + '_' + data.episode, JSON.stringify(data));
		} catch { /* quota */ }
	}

	function loadProgress(dramaId, episode) {
		try {
			const raw = localStorage.getItem(STORAGE_KEY_PREFIX + dramaId + '_' + episode);
			return raw ? JSON.parse(raw) : null;
		} catch { return null; }
	}

	function postToParent(type, data) {
		if (!isEmbedded) return;
		try {
			window.parent.postMessage({ source: 'ateaish-drama-helper', type, ...data }, '*');
		} catch { /* cross-origin parent may reject */ }
	}

	let _progressInterval = null;
	let _lastReportedTime = -1;

	function startProgressTracking(video) {
		if (_progressInterval) clearInterval(_progressInterval);

		_progressInterval = setInterval(() => {
			if (!video || video.paused) return;

			const data = buildProgressData(video);
			if (!data) return;

			// Only save/report if time actually changed
			if (Math.abs(data.currentTime - _lastReportedTime) < 1) return;
			_lastReportedTime = data.currentTime;

			saveProgress(data);
			postToParent('progress', data);
			dbg('Progress:', data.episode, `${data.percent}%`, `${Math.floor(data.currentTime)}s`);
		}, CFG.progressIntervalMs);
	}

	function stopProgressTracking() {
		if (_progressInterval) { clearInterval(_progressInterval); _progressInterval = null; }
	}

	// ─────────────────────────────────────────────
	//  2. AUTO-RESUME FROM SAVED POSITION
	//     Priority: URL hash (#ateaish_resume=X) > localStorage
	// ─────────────────────────────────────────────
	let _resumeAttempted = false;

	function getResumeTimeFromHash() {
		try {
			const h = location.hash;
			const m = h.match(/ateaish_resume=(\d+(?:\.\d+)?)/);
			return m ? parseFloat(m[1]) : null;
		} catch { return null; }
	}

	function tryResumePlayback(video) {
		if (_resumeAttempted) return;
		_resumeAttempted = true;

		const dramaId = getDramaIdFromUrl();
		const ep = getEpisodeFromUrl();
		if (!dramaId || !ep) return;

		// Priority 1: URL hash (passed from parent drama page)
		let resumeTime = getResumeTimeFromHash();

		// Priority 2: localStorage (saved by this userscript previously)
		if (!resumeTime || resumeTime < 5) {
			const saved = loadProgress(dramaId, ep);
			if (saved && saved.currentTime && saved.currentTime >= 5) {
				// Don't resume if near the end (within 30s)
				if (saved.duration > 0 && (saved.duration - saved.currentTime) < 30) {
					resumeTime = null;
				} else {
					resumeTime = saved.currentTime;
				}
			}
		}

		if (!resumeTime || resumeTime < 5) return;

		log(`Resuming EP ${ep} at ${Math.floor(resumeTime)}s (source: ${getResumeTimeFromHash() ? 'URL hash' : 'localStorage'})`);

		const doSeek = () => {
			video.currentTime = resumeTime;
			log(`Seeked to ${Math.floor(resumeTime)}s`);
		};

		const attemptSeek = () => {
			if (video.readyState >= 2 && video.duration > 0) {
				doSeek();
			} else {
				video.addEventListener('loadedmetadata', () => {
					// Wait for duration to be available
					if (video.duration > 0) {
						doSeek();
					} else {
						video.addEventListener('durationchange', () => doSeek(), { once: true });
					}
				}, { once: true });
			}
		};

		// Try immediately, then retry with delays for slow-loading players
		setTimeout(attemptSeek, 500);
		setTimeout(() => {
			if (Math.abs(video.currentTime - resumeTime) > 5) {
				attemptSeek();
			}
		}, 2000);
		setTimeout(() => {
			if (Math.abs(video.currentTime - resumeTime) > 5) {
				attemptSeek();
			}
		}, 5000);
	}

	// ─────────────────────────────────────────────
	//  3. HIDE ADS & CLUTTER (when embedded)
	// ─────────────────────────────────────────────
	function hideAdsAndClutter() {
		if (!isEmbedded || !CFG.hideAdsWhenEmbedded) return;

		const css = document.createElement('style');
		css.textContent = `
			/* Hide common ad containers, banners, popups, overlays */
			.adsbygoogle, [id*="google_ads"], [class*="ad-"], [class*="ads-"],
			[class*="popup"], [class*="modal"]:not(.video-modal),
			[class*="banner"], [id*="banner"],
			.overlay:not([class*="video"]),
			footer, .footer,
			nav:not([class*="episode"]),
			[class*="sidebar"], [class*="side-bar"],
			[class*="social"], [class*="share"],
			[class*="comment"], [class*="disqus"],
			[class*="donate"], [class*="support"],
			[class*="notification"]:not([class*="video"]),
			[class*="cookie"],
			.pop-ads, #pop-ads,
			[onclick*="window.open"],
			a[target="_blank"][rel*="nofollow"] {
				display: none !important;
				visibility: hidden !important;
				pointer-events: none !important;
				height: 0 !important;
				overflow: hidden !important;
			}

			/* Make the video player area take more space when embedded */
			body {
				overflow: hidden !important;
			}
		`;
		document.head.appendChild(css);
		dbg('Ad-hiding CSS injected');

		// Block popup/popunder scripts
		window.open = function (...args) {
			dbg('Blocked window.open:', args[0]);
			return null;
		};
	}

	// ─────────────────────────────────────────────
	//  4. KEYBOARD SHORTCUTS (only on direct visits)
	//     NOT active in iframe — avoids play/pause conflicts
	//     with kisskh's own player and auto-next scripts.
	// ─────────────────────────────────────────────
	function installKeyboardShortcuts() {
		if (isEmbedded) return;

		document.addEventListener('keydown', (e) => {
			if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

			const video = pickBestVideo();
			if (!video) return;

			switch (e.key) {
				case 'k':
					e.preventDefault();
					video.paused ? video.play().catch(() => {}) : video.pause();
					showToast(video.paused ? '⏸ Paused' : '▶ Playing');
					break;

				case 'ArrowLeft':
					e.preventDefault();
					video.currentTime = Math.max(0, video.currentTime - (e.shiftKey ? 30 : 10));
					showToast(`⏪ -${e.shiftKey ? 30 : 10}s`);
					break;

				case 'ArrowRight':
					e.preventDefault();
					video.currentTime = Math.min(video.duration || Infinity, video.currentTime + (e.shiftKey ? 30 : 10));
					showToast(`⏩ +${e.shiftKey ? 30 : 10}s`);
					break;

				case 'ArrowUp':
					e.preventDefault();
					video.volume = Math.min(1, video.volume + 0.1);
					showToast(`🔊 ${Math.round(video.volume * 100)}%`);
					break;

				case 'ArrowDown':
					e.preventDefault();
					video.volume = Math.max(0, video.volume - 0.1);
					showToast(`🔉 ${Math.round(video.volume * 100)}%`);
					break;

				case 'm':
					e.preventDefault();
					video.muted = !video.muted;
					showToast(video.muted ? '🔇 Muted' : '🔊 Unmuted');
					break;

				case 'f':
					e.preventDefault();
					toggleFullscreen(video);
					break;

				case 'j':
					e.preventDefault();
					video.currentTime = Math.max(0, video.currentTime - 10);
					showToast('⏪ -10s');
					break;

				case 'l':
					e.preventDefault();
					video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 10);
					showToast('⏩ +10s');
					break;

				case ',':
					if (e.shiftKey) {
						e.preventDefault();
						video.playbackRate = Math.max(0.25, video.playbackRate - 0.25);
						showToast(`🐢 ${video.playbackRate}x`);
					}
					break;

				case '.':
					if (e.shiftKey) {
						e.preventDefault();
						video.playbackRate = Math.min(4, video.playbackRate + 0.25);
						showToast(`🐇 ${video.playbackRate}x`);
					}
					break;
			}
		});
	}

	function toggleFullscreen(video) {
		if (document.fullscreenElement) {
			document.exitFullscreen().catch(() => {});
		} else {
			const target = video.closest('[class*="player" i]') || video.parentElement || video;
			(target.requestFullscreen || target.webkitRequestFullscreen || (() => {})).call(target);
		}
	}

	// ─────────────────────────────────────────────
	//  5. TOAST NOTIFICATIONS
	// ─────────────────────────────────────────────
	let _toastEl = null;
	let _toastTimer = null;

	function showToast(msg) {
		if (!_toastEl) {
			_toastEl = document.createElement('div');
			_toastEl.style.cssText = `
				position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
				background: rgba(0,0,0,0.85); color: #fff; padding: 8px 20px;
				border-radius: 6px; font-size: 14px; font-family: sans-serif;
				z-index: 999999; pointer-events: none; transition: opacity 0.3s;
				backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
			`;
			document.body.appendChild(_toastEl);
		}

		_toastEl.textContent = msg;
		_toastEl.style.opacity = '1';
		_toastEl.style.display = 'block';

		clearTimeout(_toastTimer);
		_toastTimer = setTimeout(() => {
			_toastEl.style.opacity = '0';
			setTimeout(() => { _toastEl.style.display = 'none'; }, 300);
		}, 1200);
	}

	// ─────────────────────────────────────────────
	//  6. EPISODE CHANGE DETECTION (SPA nav)
	// ─────────────────────────────────────────────
	let _lastEpisode = getEpisodeFromUrl();
	let _lastUrl = location.href;

	function onEpisodeChange(newEp) {
		log(`Episode changed to EP ${newEp}`);
		_resumeAttempted = false;
		_lastReportedTime = -1;
		_boundVideo = null;
		_episodeNavAttempted = true; // don't re-navigate, just highlight
		stopProgressTracking();

		postToParent('episodeChange', {
			dramaId: getDramaIdFromUrl(),
			episode: newEp,
			slug: getDramaSlugFromUrl(),
		});

		// Re-highlight the new episode after a delay for the DOM to update
		setTimeout(highlightCurrentEpisode, 800);
	}

	function checkForNavigation() {
		if (location.href !== _lastUrl) {
			_lastUrl = location.href;
			const ep = getEpisodeFromUrl();
			if (ep && ep !== _lastEpisode) {
				_lastEpisode = ep;
				onEpisodeChange(ep);
			}
		}
	}

	function hookHistory() {
		const wrap = (method) => {
			const orig = history[method];
			if (typeof orig !== 'function') return;
			history[method] = function (...args) {
				const ret = orig.apply(this, args);
				setTimeout(checkForNavigation, 50);
				return ret;
			};
		};
		wrap('pushState');
		wrap('replaceState');
		window.addEventListener('popstate', () => setTimeout(checkForNavigation, 50), { passive: true });
	}

	// ─────────────────────────────────────────────
	//  7. EPISODE NAVIGATION & HIGHLIGHTING
	//     Ensures the correct episode is loaded when
	//     resuming from continue watching. Also highlights
	//     the current episode in the episode list.
	// ─────────────────────────────────────────────
	let _episodeNavAttempted = false;

	function getAllEpisodeAnchors() {
		const anchors = Array.from(document.querySelectorAll('a[href]'));
		return anchors
			.map(a => ({ a, href: (() => { try { return new URL(a.getAttribute('href'), location.origin).href; } catch { return null; } })() }))
			.filter(x => x.href && /\/Drama\//i.test(x.href) && /\/Episode-\d+/i.test(x.href));
	}

	function getShowPathPrefix() {
		const m = location.pathname.match(/^(\/Drama\/[^/]+)\//i);
		return m ? m[1] : null;
	}

	function findEpisodeAnchor(epNum) {
		const prefix = getShowPathPrefix();
		const all = getAllEpisodeAnchors();
		for (const { a, href } of all) {
			try {
				const u = new URL(href);
				if (prefix && !u.pathname.startsWith(prefix + '/')) continue;
				const m = u.pathname.match(/\/Episode-(\d+)/i);
				if (m && Number(m[1]) === epNum) return a;
			} catch {}
		}
		return null;
	}

	function highlightCurrentEpisode() {
		const ep = getEpisodeFromUrl();
		if (!ep) return;

		// Remove old highlights
		document.querySelectorAll('.ateaish-ep-highlight').forEach(el => el.classList.remove('ateaish-ep-highlight'));

		// Inject highlight style once
		if (!document.getElementById('ateaish-ep-style')) {
			const style = document.createElement('style');
			style.id = 'ateaish-ep-style';
			style.textContent = `
				.ateaish-ep-highlight {
					outline: 2px solid #e02735 !important;
					outline-offset: -2px !important;
					background: rgba(224, 39, 53, 0.15) !important;
					border-radius: 4px !important;
					position: relative !important;
					box-shadow: 0 0 8px rgba(224, 39, 53, 0.4) !important;
				}
				.ateaish-ep-highlight::after {
					content: '▶ NOW';
					position: absolute;
					top: 2px;
					right: 4px;
					font-size: 9px;
					font-weight: bold;
					color: #e02735;
					background: rgba(0,0,0,0.7);
					padding: 1px 4px;
					border-radius: 3px;
					pointer-events: none;
					z-index: 10;
				}
			`;
			document.head.appendChild(style);
		}

		// Find and highlight the current episode link/item
		const anchor = findEpisodeAnchor(ep);
		if (anchor) {
			// Highlight the anchor or its parent list-item/container
			const target = anchor.closest('mat-list-item, li, [class*="episode" i], [class*="ep-" i]') || anchor;
			target.classList.add('ateaish-ep-highlight');

			// Scroll it into view
			setTimeout(() => {
				target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
			}, 300);

			dbg(`Highlighted EP ${ep}`);
		}
	}

	function navigateToCorrectEpisode() {
		if (_episodeNavAttempted) return;
		_episodeNavAttempted = true;

		const targetEp = getEpisodeFromUrl();
		if (!targetEp) return;

		// Wait for the episode list to render (Angular SPA needs time)
		const tryNav = (attempt = 0) => {
			if (attempt > 10) {
				log(`Could not find EP ${targetEp} link after ${attempt} attempts, highlighting only`);
				highlightCurrentEpisode();
				return;
			}

			const anchor = findEpisodeAnchor(targetEp);
			if (!anchor) {
				// Episode list might not be rendered yet
				setTimeout(() => tryNav(attempt + 1), 500);
				return;
			}

			// Check if we're already on the right episode by comparing URL
			try {
				const anchorHref = new URL(anchor.getAttribute('href'), location.origin).href;
				const currentHref = location.href.split('#')[0];
				if (anchorHref === currentHref || new URL(anchorHref).pathname === new URL(currentHref).pathname) {
					// Already on the right episode, just highlight
					highlightCurrentEpisode();
					return;
				}
			} catch {}

			// Click the episode link to navigate
			log(`Clicking EP ${targetEp} link to navigate`);
			anchor.click();

			// Highlight after navigation
			setTimeout(highlightCurrentEpisode, 1000);
		};

		// Start after a short delay to let the SPA initialize
		setTimeout(() => tryNav(0), 1000);
	}

	// ─────────────────────────────────────────────
	//  8. MAIN VIDEO BINDING
	// ─────────────────────────────────────────────
	let _boundVideo = null;

	function bindVideo(video) {
		if (!video || video === _boundVideo) return;
		_boundVideo = video;
		log(`Bound to video element (EP ${getEpisodeFromUrl() || '?'})`);

		// Resume from saved position
		tryResumePlayback(video);

		// Start progress tracking
		startProgressTracking(video);

		// On ended: notify parent, save final progress
		video.addEventListener('ended', () => {
			const data = buildProgressData(video);
			if (data) {
				data.percent = 100;
				saveProgress(data);
				postToParent('ended', data);
			}
			log(`EP ${data?.episode || '?'} ended`);
		}, { once: true });

		// On pause: save immediately
		video.addEventListener('pause', () => {
			const data = buildProgressData(video);
			if (data) {
				saveProgress(data);
				postToParent('pause', data);
			}
		}, { passive: true });

		// On seeked: save immediately
		video.addEventListener('seeked', () => {
			const data = buildProgressData(video);
			if (data) {
				saveProgress(data);
				postToParent('progress', data);
			}
		}, { passive: true });
	}

	function pollForVideo() {
		const check = () => {
			checkForNavigation();
			const v = pickBestVideo();
			if (v && v !== _boundVideo) {
				bindVideo(v);
			}
		};

		check();
		setInterval(check, CFG.pollVideoMs);
	}

	// ─────────────────────────────────────────────
	//  8. MESSAGE LISTENER (commands from parent)
	// ─────────────────────────────────────────────
	function installMessageListener() {
		window.addEventListener('message', (e) => {
			if (!e.data || e.data.source !== 'ateaish-drama') return;

			const video = pickBestVideo();

			switch (e.data.command) {
				case 'seek':
					if (typeof e.data.time === 'number') {
						const doSeek = (v) => {
							if (v.readyState >= 2 && v.duration > 0) {
								v.currentTime = e.data.time;
								log(`Seeked to ${Math.floor(e.data.time)}s via postMessage`);
							} else {
								v.addEventListener('loadedmetadata', () => {
									v.currentTime = e.data.time;
									log(`Seeked to ${Math.floor(e.data.time)}s via postMessage (after metadata)`);
								}, { once: true });
							}
						};
						if (video) {
							doSeek(video);
						} else {
							// Video not found yet — wait and retry
							const retrySeek = setInterval(() => {
								const v = pickBestVideo();
								if (v) {
									clearInterval(retrySeek);
									doSeek(v);
								}
							}, 500);
							setTimeout(() => clearInterval(retrySeek), 15000);
						}
					}
					break;
				case 'play':
					if (video) video.play().catch(() => {});
					break;
				case 'pause':
					if (video) video.pause();
					break;
				case 'getProgress':
					if (video) postToParent('progress', buildProgressData(video));
					break;
				case 'navigateEpisode':
					if (typeof e.data.episode === 'number') {
						const epAnchor = findEpisodeAnchor(e.data.episode);
						if (epAnchor) {
							log(`Navigating to EP ${e.data.episode} via postMessage command`);
							epAnchor.click();
							setTimeout(highlightCurrentEpisode, 1000);
						} else {
							dbg(`EP ${e.data.episode} anchor not found (expected when embedded)`);
						}
					}
					break;
			}
		});
	}

	// ─────────────────────────────────────────────
	//  9. API BRIDGE (runs on ateaish drama page)
	//     Receives postMessage requests from the page,
	//     fetches via GM_xmlhttpRequest (no CORS),
	//     and posts the response back.
	// ─────────────────────────────────────────────
	function installApiBridge() {
		log('Installing API bridge on drama page');

		// Listen for API requests from the page
		window.addEventListener('message', (e) => {
			if (!e.data || e.data.source !== 'ateaish-drama-api' || e.data.type !== 'request') return;
			const { id, url } = e.data;
			if (!id || !url) return;

			dbg(`Bridge request #${id}: ${url}`);

			GM_xmlhttpRequest({
				method: 'GET',
				url: url,
				responseType: 'text',
				headers: {
					'Accept': 'application/json, text/plain, */*',
				},
				onload: (resp) => {
					dbg(`Bridge response #${id}: HTTP ${resp.status}`);
					window.postMessage({
						source: 'ateaish-drama-api',
						type: 'response',
						id: id,
						status: resp.status,
						body: resp.responseText,
					}, '*');
				},
				onerror: (err) => {
					log(`Bridge error #${id}:`, err);
					window.postMessage({
						source: 'ateaish-drama-api',
						type: 'response',
						id: id,
						status: 0,
						body: null,
						error: true,
					}, '*');
				},
				ontimeout: () => {
					log(`Bridge timeout #${id}`);
					window.postMessage({
						source: 'ateaish-drama-api',
						type: 'response',
						id: id,
						status: 0,
						body: null,
						error: true,
					}, '*');
				},
				timeout: 15000,
			});
		});

		// Signal to the page that the bridge is ready
		window.postMessage({
			source: 'ateaish-drama-api',
			type: 'ready',
		}, '*');
		log('API bridge ready');
	}

	// ─────────────────────────────────────────────
	//  INIT
	// ─────────────────────────────────────────────
	function init() {
		if (!isKisskhSite) {
			// On the ateaish drama page — only install API bridge
			installApiBridge();
			return;
		}

		// On kisskh site — run all companion features
		log(`Initialized (embedded: ${isEmbedded}, EP: ${getEpisodeFromUrl() || 'N/A'})`);

		hookHistory();
		hideAdsAndClutter();
		installKeyboardShortcuts();
		installMessageListener();
		navigateToCorrectEpisode();
		pollForVideo();
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
