// ==UserScript==
// @name         CDN Live Agent "active" Disabler
// @namespace    https://cdn-live.tv/
// @version      1.0
// @description  Force the anti-ad/agent config in sessionStorage to have "active": false on cdn-live.tv
// @author       You
// @match        https://cdn-live.tv/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
	'use strict';

	// Fake-load the ad-manager script so its onerror never fires
	// and the adblock detector believes the script loaded.
	(function hookAdManagerScript() {
		try {
			const originalAppendChild = Element.prototype.appendChild;
			Element.prototype.appendChild = function (node) {
				try {
					if (
						node &&
						node.tagName === 'SCRIPT' &&
						typeof node.src === 'string' &&
						node.src.indexOf('/api/v1/ad-manager/script.js') !== -1
					) {
						const onload = node.onload;
						if (typeof onload === 'function') {
							// Call onload asynchronously as if the script loaded successfully.
							setTimeout(() => {
								try {
									onload.call(node);
								} catch (e) {
									// ignore
								}
							}, 0);
						}
						// Do not actually append the script element to avoid network errors/onerror.
						return node;
					}
				} catch (e) {
					// fall through to original append
				}
				return originalAppendChild.call(this, node);
			};
		} catch (e) {
			// Ignore if we cannot hook appendChild for some reason.
		}
	})();

	// Make the CSS-based bait element check think it is visible
	// even if an adblocker hides it with its own styles.
	(function hookAdblockBaitMeasurements() {
		try {
			const baitClassFragment = 'adbanner ad-block';

			// Hook getComputedStyle to lie about display/visibility.
			const originalGetComputedStyle = window.getComputedStyle.bind(window);
			window.getComputedStyle = function (elt, pseudoElt) {
				const orig = originalGetComputedStyle(elt, pseudoElt);
				try {
					if (elt && typeof elt.className === 'string' && elt.className.indexOf(baitClassFragment) !== -1) {
						return new Proxy(orig, {
							get(target, prop, receiver) {
								if (prop === 'display') return 'block';
								if (prop === 'visibility') return 'visible';
								return Reflect.get(target, prop, receiver);
							}
						});
					}
				} catch (e) {
					// fall back to original
				}
				return orig;
			};

			// Hook offsetHeight getter so it is non-zero for the bait element.
			const desc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
			if (desc && typeof desc.get === 'function') {
				const originalGetter = desc.get;
				Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
					configurable: true,
					get: function () {
						try {
							if (this && typeof this.className === 'string' && this.className.indexOf(baitClassFragment) !== -1) {
								return 100;
							}
						} catch (e) {
							// fall through
						}
						return originalGetter.call(this);
					}
				});
			}
		} catch (e) {
			// Ignore if we cannot hook measurements.
		}
	})();

	/**
	 * Try to get the nested adBlockInspectorConfig object from the big config.
	 */
	function getAdBlockInspectorConfigRoot(obj) {
		if (!obj || typeof obj !== 'object') return null;
		if (!obj.config || typeof obj.config !== 'object') return null;
		const cfg = obj.config.adBlockInspectorConfig;
		if (!cfg || typeof cfg !== 'object') return null;

		const required = [
			'active',
			'needsActiveAgentIntervalSec',
			'agentActivationTimeoutSec',
			'adRemovingTimeoutSec',
			'detectionClassName',
			'detectionSrcPatterns'
		];

		if (!required.every((key) => Object.prototype.hasOwnProperty.call(cfg, key))) {
			return null;
		}

		return cfg;
	}

	/**
	 * Ensure the nested config.config.adBlockInspectorConfig.active === false.
	 */
	function patchConfigValue(rawValue) {
		if (typeof rawValue !== 'string') return rawValue;

		try {
			const parsed = JSON.parse(rawValue);
			const target = getAdBlockInspectorConfigRoot(parsed);
			if (!target) return rawValue;

			if (target.active !== false) {
				target.active = false;
			}

			return JSON.stringify(parsed);
		} catch (e) {
			// Not JSON or not what we expect – leave it unchanged.
			return rawValue;
		}
	}

	/**
	 * Scan all existing sessionStorage entries and patch in place.
	 */
	function patchExistingSessionStorage() {
		try {
			const storage = window.sessionStorage;
			for (let i = 0; i < storage.length; i++) {
				const key = storage.key(i);
				if (!key) continue;
				const original = storage.getItem(key);
				const patched = patchConfigValue(original);
				if (patched !== original) {
					storage.setItem(key, patched);
				}
			}
		} catch (e) {
			// Access to sessionStorage may fail in some contexts; ignore.
		}
	}

	/**
	 * Monkey‑patch sessionStorage.setItem so future writes are also patched.
	 */
	function hookSessionStorageSetItem() {
		try {
			const storage = window.sessionStorage;
			const originalSetItem = storage.setItem.bind(storage);

			storage.setItem = function (key, value) {
				const patchedValue = patchConfigValue(value);
				return originalSetItem(key, patchedValue);
			};
		} catch (e) {
			// Ignore if sessionStorage is not available.
		}
	}

	function init() {
		hookSessionStorageSetItem();
		patchExistingSessionStorage();

		// In case the site recreates sessionStorage entries later via other means,
		// run a periodic patch as a fallback.
		setInterval(patchExistingSessionStorage, 5000);
	}

	// Run ASAP
	init();

	function removeAdblockOverlay() {
		const all = document.querySelectorAll('body *');
		for (const el of all) {
			if (!el.textContent) continue;
			const txt = el.textContent.trim();
			if (/AdBlock detected/i.test(txt) || /AdBlock Detected/i.test(txt)) {
				// Hide the closest dialog/overlay container
				let node = el;
				for (let i = 0; i < 5 && node && node !== document.body; i++) {
					if (node.style && node.style.display !== 'none') {
						node.style.display = 'none';
					}
					node = node.parentElement;
				}
			}
		}
	}

	const mo = new MutationObserver(() => removeAdblockOverlay());
	mo.observe(document.documentElement, { childList: true, subtree: true });
	window.addEventListener('load', removeAdblockOverlay);

	const style = document.createElement('style');
	style.textContent =
		'.ad.ads.adsbox.ad-placement.carbon-ads.adbanner.ad-block { ' +
		'display:block !important; visibility:visible !important; height:100px !important; position:absolute !important; left:-9999px !important; top:-9999px !important; }';
	document.documentElement.appendChild(style);
})();

