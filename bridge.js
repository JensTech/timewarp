
(() => {
    'use strict';

    const DEFAULT_SPEED = 1;
    const MIN_SPEED = 0;
    const MAX_SPEED = 100;

    let lastSpeed = null;

    function normaliseSpeed(value) {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            return DEFAULT_SPEED;
        }

        return Math.max(MIN_SPEED, Math.min(MAX_SPEED, value));
    }

    function pushSpeed(value) {
        const speed = normaliseSpeed(value);

        // Avoid sending duplicate updates.
        if (speed === lastSpeed) return;
        lastSpeed = speed;

        window.postMessage({
            __timewarp: true,
            speed
        }, '*');
    }

    // Load the saved speed when this frame's bridge starts.
    chrome.storage.local.get({ speed: DEFAULT_SPEED }, result => {
        if (chrome.runtime.lastError) {
            console.warn(
                '[TimeWarp] Could not read saved speed:',
                chrome.runtime.lastError.message
            );

            pushSpeed(DEFAULT_SPEED);
            return;
        }

        pushSpeed(result.speed);
    });

    // Propagate popup changes to every frame where this bridge runs.
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local' || !changes.speed) return;

        pushSpeed(changes.speed.newValue);
    });
})();
