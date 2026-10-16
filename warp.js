
(() => {
    if (window.__timewarp) return;

    const realDate = Date;
    const realPerfNow = performance.now.bind(performance);

    const realST = window.setTimeout.bind(window);
    const realCT = window.clearTimeout.bind(window);
    const realSI = window.setInterval.bind(window);
    const realCI = window.clearInterval.bind(window);
    const realRAF = window.requestAnimationFrame.bind(window);

    // -- virtual clock --

    let speed = 1;

    let perfReal = realPerfNow();
    let perfVirtual = perfReal;

    let dateReal = realDate.now();
    let dateVirtual = dateReal;

    const fakePerf = () =>
        perfVirtual + (realPerfNow() - perfReal) * speed;

    const fakeDate = () =>
        dateVirtual + (realDate.now() - dateReal) * speed;

    function setSpeed(value) {
        value = Number(value);

        if (!Number.isFinite(value)) {
            throw new TypeError("Timewarp speed must be a finite number");
        }

        // keep time continuous when changing speed
        perfVirtual = fakePerf();
        perfReal = realPerfNow();

        dateVirtual = fakeDate();
        dateReal = realDate.now();

        speed = Math.max(-16, Math.min(16, value));

        scheduleTimers();
        applyAnimations();
        applyMedia();
        updateVisualIndicator();
    }

    // -- date and performance --

    const FakeDate = new Proxy(realDate, {
        apply() {
            return new realDate(fakeDate()).toString();
        },

        construct(target, args, newTarget) {
            return Reflect.construct(
                target,
                args.length ? args : [fakeDate()],
                newTarget
            );
        },

        get(target, property, receiver) {
            if (property === "now") return fakeDate;
            return Reflect.get(target, property, receiver);
        }
    });

    window.Date = FakeDate;

    try {
        Object.defineProperty(performance, "now", {
            configurable: true,
            value: fakePerf
        });
    } catch (error) {
        console.warn("[Timewarp] Could not override performance.now()", error);
    }

    // -- virtual time scheduler --

    const timers = new Map();

    let nextTimerId = 1;
    let schedulerId = null;

    function addTimer(fn, ms, args, repeat) {
        const delay = Math.max(0, Number(ms) || 0);
        const id = nextTimerId++;

        timers.set(id, {
            fn,
            args,
            delay,
            due: fakePerf() + delay,
            repeat
        });

        scheduleTimers();
        return id;
    }

    function clearVirtualTimer(id) {
        timers.delete(id);
        scheduleTimers();
    }

    function runTimers() {
        schedulerId = null;

        if (speed <= 0) return;

        const now = fakePerf();

        // snapshot so newly scheduled timers don't unexpectedly run during the same scheduler pass.
        const dueTimers = [...timers.entries()]
            .filter(([, timer]) => timer.due <= now)
            .sort((a, b) => a[1].due - b[1].due);

        for (const [id, timer] of dueTimers) {
            // it may have been cleared by an earlier callback
            if (timers.get(id) !== timer) continue;

            if (timer.repeat) {
                // avoid a burst of callbacks after a delayed scheduler pass
                timer.due = now + Math.max(timer.delay, 1);
            } else {
                timers.delete(id);
            }

            try {
                if (typeof timer.fn === "function") {
                    timer.fn.apply(window, timer.args);
                } else if (typeof timer.fn === "string") {
                    // preserve browser handling of string timer callbacks
                    realST(timer.fn, 0);
                }
            } catch (error) {
                realST(() => {
                    throw error;
                }, 0);
            }
        }

        scheduleTimers();
    }

    function scheduleTimers() {
        if (schedulerId !== null) {
            realCT(schedulerId);
            schedulerId = null;
        }

        // timers pause when virtual time is stopped or slowed
        if (speed <= 0 || timers.size === 0) return;

        let earliest = Infinity;

        for (const timer of timers.values()) {
            if (timer.due < earliest) earliest = timer.due;
        }

        const remainingVirtual = Math.max(0, earliest - fakePerf());
        const remainingReal = remainingVirtual / speed;

        schedulerId = realST(
            runTimers,
            Math.min(2147483647, remainingReal)
        );
    }

    window.setTimeout = (fn, ms, ...args) =>
        addTimer(fn, ms, args, false);

    window.setInterval = (fn, ms, ...args) =>
        addTimer(fn, ms, args, true);

    window.clearTimeout = clearVirtualTimer;
    window.clearInterval = clearVirtualTimer;

    // request animation frame

    window.requestAnimationFrame = callback =>
        realRAF(() => callback(fakePerf()));

    const animationRates = new WeakMap();

    function applyAnimations() {
        let animations = [];

        const isIndicator = (a) => {
            const e = a.effect;
            return e && e.target === document.documentElement &&
                (e.pseudoElement === "::before" || e.pseudoElement === "::after");
        };

        try {
            animations = document.getAnimations({ subtree: true })
                .filter(a => !isIndicator(a));
        } catch {
            return;
        }

        for (const animation of animations) {
            let state = animationRates.get(animation);

            if (!state) {
                state = {
                    base: animation.playbackRate,
                    applied: null
                };

                animationRates.set(animation, state);
            }

            if (
                state.applied !== null &&
                animation.playbackRate !== state.applied
            ) {
                state.base = animation.playbackRate;
            }

            const rate = state.base * speed;

            try {
                animation.playbackRate = rate;
                state.applied = rate;
            } catch {
                // some animations may reject a playback rate change
            }
        }
    }

    document.addEventListener("animationstart", applyAnimations, true);
    document.addEventListener("transitionrun", applyAnimations, true);

    // discover animations created without an event
    const animationScanId = realSI(applyAnimations, 500);

    // --- videos ---

    const mediaStates = new WeakMap();

    function applyMedia() {
        document.querySelectorAll("video, audio").forEach(media => {
            let state = mediaStates.get(media);

            if (!state) {
                state = {
                    baseRate: media.playbackRate,
                    appliedRate: null,
                    pausedByTimewarp: false
                };

                mediaStates.set(media, state);
            }

            // preserve playback-rate changes made by the page or user
            if (
                state.appliedRate !== null &&
                media.playbackRate !== state.appliedRate
            ) {
                state.baseRate = media.playbackRate;
            }

            if (speed <= 0) {
                if (!media.paused) {
                    state.pausedByTimewarp = true;
                    media.pause();
                }
                return;
            }

            const rate = Math.min(
                16,
                Math.max(0.0625, state.baseRate * speed)
            );

            try {
                media.playbackRate = rate;
                state.appliedRate = rate;
            } catch {
                // the browser or media element may reject the speed
            }

            if (state.pausedByTimewarp) {
                state.pausedByTimewarp = false;

                // resume only media that Timewarp paused
                media.play().catch(() => { });
            }
        });
    }

    // -- handle media elements added after initialisation --
    const mediaObserver = new MutationObserver(() => {
        applyMedia();
        applyAnimations();
    });

    mediaObserver.observe(document.documentElement, {
        childList: true,
        subtree: true
    });

    // add a visual indicator
    const indicatorStyle = document.createElement("style");
    indicatorStyle.textContent = `
        html::before {
            content: "! Time warped";
            position: fixed;
            right: 16px;
            bottom: 16px;
            z-index: 2147483646;
            pointer-events: none;
            padding: 6px 10px;
            border-radius: 999px;
            font: 600 15px/1 system-ui, -apple-system, sans-serif;
            letter-spacing: 0.02em;
            color: #ffffff;
            background: #000000eb;
            border: 1px solid #ffffff80;
            box-shadow: 0 2px 10px #00000073;
            opacity: var(--timewarp-glow);
        }
    `;
    updateVisualIndicator();
    (document.head || document.documentElement).appendChild(indicatorStyle);

    function updateVisualIndicator() {
        const root = document.documentElement;
        if (!root) return;

        root.style.setProperty(
            "--timewarp-glow",
            speed === 1 ? "0" : speed === 0 ? "1" : "1"
        );

        root.toggleAttribute("data-timewarp-frozen", speed === 0);
    }


    // -- control API --

    Object.defineProperty(window, "__timewarp", {
        configurable: false,
        value: Object.freeze({
            setSpeed,

            getSpeed() {
                return speed;
            },

            now() {
                return fakeDate();
            },

            perfNow() {
                return fakePerf();
            }
        })
    });

    // -- receive speed updates from bridge.js --
    window.addEventListener("message", event => {
        if (event.source !== window) return;

        const data = event.data;

        if (!data || data.__timewarp !== true) return;
        if (typeof data.speed !== "number" || !Number.isFinite(data.speed)) return;

        setSpeed(data.speed);

        console.info(`[Timewarp] Speed set to ${data.speed}×`);
    });

    console.info("[Timewarp] Initialised at 1× speed");
})();
