// ==UserScript==
// @name         KissKH Auto-Next Episode
// @namespace    https://github.com/atishramkhe
// @version      1.0.0
// @description  Auto-plays the next episode when the current one ends on kisskh.ovh.
// @match        https://kisskh.ovh/Drama/*/Episode-*
// @match        https://kisskh.ovh/Drama/*/Episode-*
// @run-at       document-idle
// ==/UserScript==

(function () {
	'use strict';

	const STORAGE_ENABLED = 'kisskh:autoNext:enabled';
	const STORAGE_RESTORE_FULLSCREEN = 'kisskh:autoNext:restoreFullscreen';

	const DEFAULTS = {
		enabled: true,
		nearEndThresholdSeconds: 2.0,
		minWatchSecondsBeforeTrigger: 10,
		rebindPollMs: 1000,
		restoreFullscreenTtlMs: 60_000,
	};

	function isInFullscreen() {
		return Boolean(
			document.fullscreenElement ||
			/** @type {any} */ (document).webkitFullscreenElement ||
			/** @type {any} */ (document).mozFullScreenElement ||
			/** @type {any} */ (document).msFullscreenElement
		);
	}

	function getFullscreenElement() {
		return (
			document.fullscreenElement ||
			/** @type {any} */ (document).webkitFullscreenElement ||
			/** @type {any} */ (document).mozFullScreenElement ||
			/** @type {any} */ (document).msFullscreenElement ||
			null
		);
	}

	function setRestoreFullscreenState() {
		try {
			localStorage.setItem(
				STORAGE_RESTORE_FULLSCREEN,
				JSON.stringify({ t: Date.now(), restore: true })
			);
		} catch {
			// ignore
		}
	}

	function shouldRestoreFullscreenNow() {
		try {
			const raw = localStorage.getItem(STORAGE_RESTORE_FULLSCREEN);
			if (!raw) return false;
			const obj = JSON.parse(raw);
			if (!obj || obj.restore !== true || !Number.isFinite(obj.t)) return false;
			if (Date.now() - obj.t > DEFAULTS.restoreFullscreenTtlMs) return false;
			return true;
		} catch {
			return false;
		}
	}

	function clearRestoreFullscreenState() {
		try {
			localStorage.removeItem(STORAGE_RESTORE_FULLSCREEN);
		} catch {
			// ignore
		}
		restorePendingGestureRetry = false;
	}

	async function requestFullscreenFor(el) {
		if (!el) return false;
		if (isInFullscreen()) return true;
		try {
			if (el.requestFullscreen) {
				await el.requestFullscreen();
				return true;
			}
			const anyEl = /** @type {any} */ (el);
			if (anyEl.webkitRequestFullscreen) {
				anyEl.webkitRequestFullscreen();
				return true;
			}
			if (anyEl.mozRequestFullScreen) {
				anyEl.mozRequestFullScreen();
				return true;
			}
			if (anyEl.msRequestFullscreen) {
				anyEl.msRequestFullscreen();
				return true;
			}
			return false;
		} catch {
			return false;
		}
	}

	async function promoteFullscreenToStableRoot() {
		// Goal: keep fullscreen across SPA navigation by fullscreening a stable element
		// (like <html>) while we're already fullscreen.
		// This is best-effort; browsers may still block it.
		const current = getFullscreenElement();
		if (!current) return false;

		const target = document.documentElement;
		if (!target || current === target) return true;

		try {
			if (target.requestFullscreen) {
				await target.requestFullscreen();
				return true;
			}
			const anyEl = /** @type {any} */ (target);
			if (anyEl.webkitRequestFullscreen) {
				anyEl.webkitRequestFullscreen();
				return true;
			}
			if (anyEl.mozRequestFullScreen) {
				anyEl.mozRequestFullScreen();
				return true;
			}
			if (anyEl.msRequestFullscreen) {
				anyEl.msRequestFullscreen();
				return true;
			}
			return false;
		} catch {
			return false;
		}
	}

	function pickFullscreenTarget(video) {
		if (!video) return null;
		// Prefer a stable container if present, otherwise fullscreen the <video>.
		return (
			video.closest('.videoplayer') ||
			video.closest('.video-js') ||
			video.closest('[class*="player" i]') ||
			video.parentElement ||
			video
		);
	}

	function findNextEpisodeButton() {
		return /** @type {HTMLButtonElement|null} */ (
			document.querySelector('button#nextEP') ||
			// fallback: any button with tooltip/title mentioning next episode
			document.querySelector('button[mattooltip*="Next" i], button[title*="Next" i]')
		);
	}

	function clickNextEpisodeButton() {
		const btn = findNextEpisodeButton();
		if (!btn) return false;
		if (btn.disabled) return false;
		btn.click();
		return true;
	}

	function findMatFullscreenButton() {
		// KissKH uses Angular Material; this is their fullscreen control.
		// Example: <mat-fullscreen-button> <button mat-icon-button> ... <mat-icon>fullscreen</mat-icon>
		return (
			document.querySelector('mat-fullscreen-button button') ||
			document.querySelector('mat-fullscreen-button')?.querySelector('button') ||
			null
		);
	}

	function clickMatFullscreenButton() {
		const btn = findMatFullscreenButton();
		if (!btn) return false;
		btn.click();
		return true;
	}

	function waitForVideoReady(video, timeoutMs = 12_000) {
		if (!video) return Promise.resolve(false);
		if (video.readyState >= 2) return Promise.resolve(true);

		return new Promise((resolve) => {
			let done = false;
			const finish = (ok) => {
				if (done) return;
				done = true;
				cleanup();
				resolve(Boolean(ok));
			};
			const onReady = () => finish(true);
			const onError = () => finish(false);
			const cleanup = () => {
				clearTimeout(t);
				video.removeEventListener('loadedmetadata', onReady);
				video.removeEventListener('canplay', onReady);
				video.removeEventListener('playing', onReady);
				video.removeEventListener('error', onError);
			};
			const t = setTimeout(() => finish(video.readyState >= 2), timeoutMs);
			video.addEventListener('loadedmetadata', onReady, { passive: true, once: true });
			video.addEventListener('canplay', onReady, { passive: true, once: true });
			video.addEventListener('playing', onReady, { passive: true, once: true });
			video.addEventListener('error', onError, { passive: true, once: true });
		});
	}

	let lastRestoreVideo = null;

	let restorePendingGestureRetry = false;
	function installOneShotFullscreenRetryOnGesture(target) {
		if (!target) return;
		if (restorePendingGestureRetry) return;
		restorePendingGestureRetry = true;

		const handler = async () => {
			// Detach first to keep it truly one-shot.
			document.removeEventListener('click', handler, true);
			document.removeEventListener('keydown', handler, true);
			document.removeEventListener('touchstart', handler, true);
			document.removeEventListener('pointerdown', handler, true);
			restorePendingGestureRetry = false;

			if (!shouldRestoreFullscreenNow()) return;

			// Give the player a moment to be ready before toggling fullscreen.
			await waitForVideoReady(lastRestoreVideo, 12_000);

			// Prefer clicking the site's own fullscreen control inside a trusted user gesture.
			let ok = false;
			if (clickMatFullscreenButton()) {
				// Give the click handler a moment to enter fullscreen.
				await new Promise((r) => setTimeout(r, 0));
				ok = isInFullscreen();
			}
			if (!ok) ok = await requestFullscreenFor(target);
			// Clear either way to avoid nagging loops.
			clearRestoreFullscreenState();
			return ok;
		};

		// Capture phase so we catch the first gesture early.
		document.addEventListener('click', handler, true);
		document.addEventListener('keydown', handler, true);
		document.addEventListener('touchstart', handler, true);
		document.addEventListener('pointerdown', handler, true);
	}

	function readBool(key, fallback) {
		const v = localStorage.getItem(key);
		if (v === null) return fallback;
		return v === '1' || v === 'true';
	}

	function getEpisodeNumberFromUrl(url = location.href) {
		try {
			const u = new URL(url);
			const m = u.pathname.match(/\/Episode-(\d+)/i);
			if (!m) return null;
			const n = Number(m[1]);
			return Number.isFinite(n) ? n : null;
		} catch {
			return null;
		}
	}

	function normalizeToAbsoluteHref(href) {
		try {
			return new URL(href, location.origin).toString();
		} catch {
			return null;
		}
	}

	function isLikelyEpisodeLink(href) {
		if (!href) return false;
		return /\/Drama\//i.test(href) && /\/Episode-\d+/i.test(href);
	}

	function getAllEpisodeAnchors() {
		const anchors = Array.from(document.querySelectorAll('a[href]'));
		return anchors
			.map((a) => ({ a, href: normalizeToAbsoluteHref(a.getAttribute('href')) }))
			.filter((x) => x.href && isLikelyEpisodeLink(x.href));
	}

	function guessNextEpisodeHref() {
		const currentEp = getEpisodeNumberFromUrl();
		if (!currentEp) return null;

		// 1) Build an episode map from any episode list links on the page.
		const all = getAllEpisodeAnchors();
		const currentPathPrefix = (() => {
			// /Drama/<slug>/Episode-1 -> /Drama/<slug>/
			const m = location.pathname.match(/^(\/Drama\/[^/]+)\//i);
			return m ? m[1] : null;
		})();

		const candidates = all.filter(({ href }) => {
			if (!currentPathPrefix) return true;
			try {
				const u = new URL(href);
				return u.pathname.startsWith(currentPathPrefix + '/');
			} catch {
				return false;
			}
		});

		const epToHref = new Map();
		for (const { href } of candidates) {
			const n = getEpisodeNumberFromUrl(href);
			if (!n) continue;
			if (!epToHref.has(n)) epToHref.set(n, href);
		}

		const direct = epToHref.get(currentEp + 1);
		if (direct) return direct;

		// 2) Fallback: look for a “Next” link/button.
		const nextTextCandidates = Array.from(document.querySelectorAll('a[href], button'));
		for (const el of nextTextCandidates) {
			const text = (el.textContent || '').trim().toLowerCase();
			if (!text) continue;
			if (!/(next|>)/.test(text)) continue;

			if (el.tagName.toLowerCase() === 'a') {
				const href = normalizeToAbsoluteHref(el.getAttribute('href'));
				if (href && isLikelyEpisodeLink(href)) return href;
			}
		}

		// 3) Last resort: construct URL by incrementing Episode-N in the path.
		try {
			const u = new URL(location.href);
			u.pathname = u.pathname.replace(/(\/Episode-)(\d+)/i, (full, p1, p2) => {
				const n = Number(p2);
				if (!Number.isFinite(n)) return full;
				return p1 + String(n + 1);
			});
			return u.toString();
		} catch {
			return null;
		}
	}

	function clickOrNavigateTo(href) {
		const abs = normalizeToAbsoluteHref(href);
		if (!abs) return false;
		if (abs === location.href) return false;

		// Prefer clicking an existing anchor to preserve SPA behavior.
		const anchors = Array.from(document.querySelectorAll('a[href]'));
		const match = anchors.find((a) => normalizeToAbsoluteHref(a.getAttribute('href')) === abs);
		if (match) {
			match.click();
			return true;
		}

		location.href = abs;
		return true;
	}

	function pickBestVideo() {
		const videos = Array.from(document.querySelectorAll('video'));
		if (!videos.length) return null;

		let best = null;
		let bestScore = -1;
		for (const v of videos) {
			const rect = v.getBoundingClientRect();
			const area = Math.max(0, rect.width) * Math.max(0, rect.height);
			const visible = rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
			const hasDuration = Number.isFinite(v.duration) && v.duration > 0;

			// Score: visible + large + actual media loaded.
			const score = (visible ? 1_000_000 : 0) + area + (hasDuration ? 100_000 : 0);
			if (score > bestScore) {
				bestScore = score;
				best = v;
			}
		}
		return best;
	}

	// Auto-next is ON by default, with no UI.
	// If you ever want to disable it manually, set localStorage[STORAGE_ENABLED] = '0'.
	let enabled = readBool(STORAGE_ENABLED, DEFAULTS.enabled);

	let lastUrl = location.href;
	let pendingNextHref = null;
	let pendingGo = null;
	let triggeredForThisUrl = false;
	let restoreFullscreenAttempted = false;
	const boundVideos = new WeakSet();
	const clickBoundVideos = new WeakSet();

	function resetForNavigation() {
		lastUrl = location.href;
		triggeredForThisUrl = false;
		pendingNextHref = null;
		pendingGo = null;
		restoreFullscreenAttempted = false;
		cancelCountdown();
	}

	function cancelCountdown() {
		pendingNextHref = null;
		pendingGo = null;
	}

	function startCountdownAndGo(href, go) {
		if (!href && typeof go !== 'function') return;
		if (triggeredForThisUrl) return;
		triggeredForThisUrl = true;

		// If user was fullscreen, try to restore it on the next episode.
		if (isInFullscreen()) {
			setRestoreFullscreenState();
			// Best-effort: keep fullscreen across navigation by switching fullscreen
			// to a stable root element before the player DOM is replaced.
			void promoteFullscreenToStableRoot();
		}

		pendingNextHref = href;
		pendingGo = typeof go === 'function' ? go : () => clickOrNavigateTo(href);
		// No countdown UI; run immediately.
		const run = pendingGo;
		cancelCountdown();
		if (run) run();
	}

	function maybeGoNext(reason) {
		if (!enabled) return;
		if (triggeredForThisUrl) return;

		// Prefer the site's in-player Next Episode button. This usually preserves
		// the existing fullscreen player without requiring any extra user gesture.
		const goViaButton = () => {
			if (clickNextEpisodeButton()) return true;
			// fallback to URL-based navigation if button isn't available
			const nextHref = guessNextEpisodeHref();
			if (!nextHref) return false;
			const abs = normalizeToAbsoluteHref(nextHref);
			if (!abs || abs === location.href) return false;
			return clickOrNavigateTo(abs);
		};

		startCountdownAndGo(null, goViaButton);
		return;

		// (unreachable)
	}

	function bindToVideo(video) {
		if (!video || boundVideos.has(video)) return;
		boundVideos.add(video);

		const onEnded = () => maybeGoNext('ended');
		const onTimeUpdate = () => {
			if (triggeredForThisUrl || !enabled) return;
			if (!Number.isFinite(video.duration) || video.duration <= 0) return;
			if (!Number.isFinite(video.currentTime)) return;
			if (video.currentTime < DEFAULTS.minWatchSecondsBeforeTrigger) return;

			const remaining = video.duration - video.currentTime;
			if (remaining <= DEFAULTS.nearEndThresholdSeconds) {
				maybeGoNext('near-end');
			}
		};

		video.addEventListener('ended', onEnded, { passive: true });
		video.addEventListener('timeupdate', onTimeUpdate, { passive: true });

		// Direct click-to-fullscreen: clicking the video goes fullscreen immediately,
		// without relying on the site's fullscreen button.
		if (!clickBoundVideos.has(video)) {
			clickBoundVideos.add(video);
			video.addEventListener(
				'click',
				async (e) => {
					// Only handle clicks directly on the video element.
					if (e.target !== video) return;
					if (isInFullscreen()) return;

					const wasPaused = video.paused;
					const target = pickFullscreenTarget(video);
					const ok = await requestFullscreenFor(target);
					if (!ok) return;

					// If the site's click handler toggled pause, try to restore playback.
					if (!wasPaused && video.paused) {
						try {
							await video.play();
						} catch {
							// ignore
						}
					}
				},
				{ passive: true }
			);
		}
	}

	async function maybeRestoreFullscreen(video) {
		if (restoreFullscreenAttempted) return;
		if (!video) return;
		lastRestoreVideo = video;
		if (isInFullscreen()) {
			clearRestoreFullscreenState();
			restoreFullscreenAttempted = true;
			return;
		}
		if (!shouldRestoreFullscreenNow()) return;

		restoreFullscreenAttempted = true;
		const target = pickFullscreenTarget(video);

		// Wait until the new video is actually ready before toggling fullscreen.
		await waitForVideoReady(video, 12_000);

		// First try clicking the site's fullscreen control (may or may not work without a gesture).
		let ok = false;
		if (clickMatFullscreenButton()) {
			await new Promise((r) => setTimeout(r, 0));
			ok = isInFullscreen();
		}
		if (!ok) ok = await requestFullscreenFor(target);
		if (ok) {
			clearRestoreFullscreenState();
			return;
		}

		// Browser likely requires a user gesture; retry automatically on first interaction.
		installOneShotFullscreenRetryOnGesture(target);
	}

	function rebindLoop() {
		// Rebind if URL changes (SPA) or video node replaced.
		if (location.href !== lastUrl) resetForNavigation();

		const v = pickBestVideo();
		if (v) {
			bindToVideo(v);
			// Best-effort fullscreen restore after navigation.
			void maybeRestoreFullscreen(v);
		}
	}

	function installHistoryHooks() {
		const fire = () => window.dispatchEvent(new Event('kisskh:navigation'));

		const wrap = (type) => {
			const orig = history[type];
			if (typeof orig !== 'function') return;
			history[type] = function (...args) {
				const ret = orig.apply(this, args);
				fire();
				return ret;
			};
		};

		wrap('pushState');
		wrap('replaceState');
		window.addEventListener('popstate', fire, { passive: true });
		window.addEventListener('kisskh:navigation', () => {
			// Give DOM a tick to update after route changes.
			setTimeout(resetForNavigation, 0);
			setTimeout(rebindLoop, 250);
		});
	}

	// Note: we intentionally avoid any on-page UI.

	function main() {
		installHistoryHooks();
		resetForNavigation();
		rebindLoop();
		setInterval(rebindLoop, DEFAULTS.rebindPollMs);
	}

	main();
})();
