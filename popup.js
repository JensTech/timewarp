
const slider = document.getElementById('s');
const label = document.getElementById('v');

const MIN_SPEED = 0;
const MAX_SPEED = 100;
const DEFAULT_SPEED = 1;

// Slider position 0–3 maps to 0×, then 0.01×–100× logarithmically.
const toSpeed = position => {
    if (position <= 0) return 0;
    return Number(Math.pow(10, position - 1).toFixed(3));
};

const toPos = speed => {
    if (speed <= 0) return 0;
    return Math.max(0, Math.min(3, Math.log10(speed) + 1));
};

const normaliseSpeed = value => {
    const speed = Number(value);

    if (!Number.isFinite(speed)) return DEFAULT_SPEED;

    return Math.max(MIN_SPEED, Math.min(MAX_SPEED, speed));
};

const show = speed => {
    if (speed === 0) {
        label.textContent = 'Frozen';
    } else {
        label.textContent = `${speed}×`;
    }
};

const updateUI = speed => {
    slider.value = toPos(speed);
    show(speed);
};

const save = speed => {
    speed = normaliseSpeed(speed);
    updateUI(speed);

    chrome.storage.local.set({ speed }, () => {
        if (chrome.runtime.lastError) {
            console.error(
                '[TimeWarp] Failed to save speed:',
                chrome.runtime.lastError.message
            );
        }
    });
};

// Load the previously saved speed.
chrome.storage.local.get({ speed: DEFAULT_SPEED }, result => {
    if (chrome.runtime.lastError) {
        console.error(
            '[TimeWarp] Failed to load speed:',
            chrome.runtime.lastError.message
        );

        updateUI(DEFAULT_SPEED);
        return;
    }

    const speed = normaliseSpeed(result.speed);
    updateUI(speed);

    // Correct invalid or out-of-range stored values.
    if (result.speed !== speed) {
        chrome.storage.local.set({ speed });
    }
});

// Update speed continuously while moving the slider.
slider.addEventListener('input', () => {
    save(toSpeed(Number(slider.value)));
});

// Handle preset buttons using their data-s attribute.
// Example: <button data-s="2">2×</button>
document.querySelectorAll('button[data-s]').forEach(button => {
    button.addEventListener('click', () => {
        const speed = Number(button.dataset.s);

        if (!Number.isFinite(speed)) return;

        save(speed);
    });
});
