/**
 * Shared game audio: mysterious old-port ambience plus a persistent mute control.
 * Playback is attempted as soon as the board appears, with a gesture fallback
 * for browsers that block automatic audio.
 */
(function globbleAmbientSound() {
  const MUTE_KEY = "globble-sound-muted-v1";
  let muted = false;
  let context = null;
  let ambientBus = null;
  let activeNodes = [];
  let foghornTimer = null;
  let sailTimer = null;
  let seabirdTimer = null;
  let stoppedForSubmit = false;

  try {
    muted = localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    muted = false;
  }

  function isBoardVisible() {
    const board = document.getElementById("board");
    const shell = board?.closest(".parchment-shell");
    const waitingForReveal =
      shell?.classList.contains("is-game-loading") &&
      !shell.classList.contains("is-game-loaded");
    return Boolean(
      board &&
      board.querySelector(".cell") &&
      !document.hidden &&
      board.getClientRects().length &&
      !waitingForReveal
    );
  }

  function ensureContext() {
    if (context) {
      if (!muted && context.state === "suspended") {
        void context.resume().then(startAmbient).catch(() => {});
      }
      return context;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return null;
    }
    try {
      context = new AudioContextClass();
      if (!muted && context.state === "suspended") {
        void context.resume().then(startAmbient).catch(() => {});
      }
      return context;
    } catch {
      return null;
    }
  }

  function makeNoiseBuffer(seconds) {
    const frames = Math.floor(context.sampleRate * seconds);
    const buffer = context.createBuffer(1, frames, context.sampleRate);
    const samples = buffer.getChannelData(0);
    let previous = 0;
    for (let i = 0; i < frames; i += 1) {
      const white = Math.random() * 2 - 1;
      previous = previous * 0.985 + white * 0.015;
      samples[i] = previous * 3.2;
    }
    return buffer;
  }

  function addNoiseLayer({ cutoff, volume, breezeRate, breezeDepth }) {
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const lfo = context.createOscillator();
    const lfoGain = context.createGain();
    source.buffer = makeNoiseBuffer(7);
    source.loop = true;
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    filter.Q.value = 0.55;
    gain.gain.value = volume;
    lfo.type = "sine";
    lfo.frequency.value = breezeRate;
    lfoGain.gain.value = breezeDepth;
    lfo.connect(lfoGain).connect(gain.gain);
    source.connect(filter).connect(gain).connect(ambientBus);
    source.start();
    lfo.start();
    activeNodes.push(source, filter, gain, lfo, lfoGain);
  }

  function makeWhiteNoiseBuffer(seconds) {
    const frames = Math.floor(context.sampleRate * seconds);
    const buffer = context.createBuffer(1, frames, context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) {
      samples[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  function playSailFlap() {
    // Disabled — the random flap bursts read as annoying clacks in play.
  }

  function scheduleSailFlap() {
    // No-op: keep API so stopAmbient still clears sailTimer safely.
  }

  function playFoghorn() {
    if (!ambientBus || muted || !isBoardVisible() || context.state !== "running") {
      return;
    }
    const now = context.currentTime;
    const hornGain = context.createGain();
    const lowpass = context.createBiquadFilter();
    hornGain.gain.setValueAtTime(0.0001, now);
    hornGain.gain.exponentialRampToValueAtTime(0.055, now + 0.65);
    hornGain.gain.setValueAtTime(0.055, now + 2.1);
    hornGain.gain.exponentialRampToValueAtTime(0.0001, now + 3.6);
    lowpass.type = "lowpass";
    lowpass.frequency.value = 360;
    lowpass.Q.value = 0.7;
    lowpass.connect(hornGain).connect(ambientBus);
    [82, 123].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = index ? "sine" : "triangle";
      oscillator.frequency.value = frequency;
      oscillator.detune.value = index ? -7 : 5;
      oscillator.connect(lowpass);
      oscillator.start(now);
      oscillator.stop(now + 3.7);
    });
  }

  function playSeabird() {
    if (!ambientBus || muted || !isBoardVisible() || context.state !== "running") {
      return;
    }
    const callCount = Math.random() < 0.36 ? 2 : 1;
    for (let index = 0; index < callCount; index += 1) {
      const start = context.currentTime + index * (0.32 + Math.random() * 0.2);
      const duration = 0.42 + Math.random() * 0.18;
      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      const baseFrequency = 1750 + Math.random() * 450;

      // A broad, swept band of air sounds birdlike at a distance without the
      // human whistle quality produced by a pitched oscillator.
      source.buffer = makeWhiteNoiseBuffer(duration);
      filter.type = "bandpass";
      filter.Q.value = 2.1 + Math.random() * 0.8;
      filter.frequency.setValueAtTime(baseFrequency, start);
      filter.frequency.linearRampToValueAtTime(baseFrequency + 950, start + duration * 0.42);
      filter.frequency.linearRampToValueAtTime(baseFrequency + 250, start + duration);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.022 + Math.random() * 0.01, start + 0.07);
      gain.gain.exponentialRampToValueAtTime(0.006, start + duration * 0.43);
      gain.gain.exponentialRampToValueAtTime(0.015, start + duration * 0.66);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      source.connect(filter).connect(gain).connect(ambientBus);
      source.start(start);
      source.stop(start + duration + 0.02);
    }
  }

  function scheduleFoghorn(first = false) {
    clearTimeout(foghornTimer);
    foghornTimer = window.setTimeout(() => {
      playFoghorn();
      scheduleFoghorn(false);
    }, first ? 9000 + Math.random() * 7000 : 24000 + Math.random() * 22000);
  }

  function scheduleSeabird(first = false) {
    clearTimeout(seabirdTimer);
    seabirdTimer = window.setTimeout(() => {
      playSeabird();
      scheduleSeabird(false);
    }, first ? 12000 + Math.random() * 10000 : 30000 + Math.random() * 35000);
  }

  function startAmbient() {
    if (muted || stoppedForSubmit || ambientBus || !isBoardVisible()) {
      return;
    }
    const audio = ensureContext();
    if (!audio || audio.state !== "running") {
      return;
    }
    ambientBus = audio.createGain();
    ambientBus.gain.value = 0.32;
    ambientBus.connect(audio.destination);
    // Light wind only—the former low ocean-wave layer has been removed.
    addNoiseLayer({ cutoff: 1650, volume: 0.032, breezeRate: 0.047, breezeDepth: 0.012 });
    scheduleFoghorn(true);
    scheduleSeabird(true);
  }

  function stopAmbient() {
    clearTimeout(foghornTimer);
    clearTimeout(sailTimer);
    clearTimeout(seabirdTimer);
    foghornTimer = null;
    sailTimer = null;
    seabirdTimer = null;
    activeNodes.forEach((node) => {
      try {
        node.stop?.();
        node.disconnect?.();
      } catch {
        /* already stopped */
      }
    });
    activeNodes = [];
    if (ambientBus) {
      ambientBus.disconnect();
      ambientBus = null;
    }
  }

  function updateButton() {
    const button = document.getElementById("soundToggleBtn");
    if (!button) return;
    button.classList.toggle("is-muted", muted);
    button.setAttribute("aria-pressed", String(muted));
    button.setAttribute("aria-label", muted ? "Turn on all sound" : "Mute all sound");
    button.title = muted ? "Turn on all sound" : "Mute all sound";
  }

  function setMuted(nextMuted) {
    muted = Boolean(nextMuted);
    try {
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch {
      /* ignore storage restrictions */
    }
    if (muted) {
      stopAmbient();
    } else {
      ensureContext();
      startAmbient();
    }
    updateButton();
    document.dispatchEvent(new CustomEvent("globble:soundchange", {
      detail: { muted }
    }));
  }

  function playShuffleRustle(options = {}) {
    if (muted) {
      return;
    }
    const audio = ensureContext();
    if (!audio) {
      return;
    }

    const run = () => {
      if (!audio || audio.state !== "running") {
        return;
      }
      const durationMs = Number(options.durationMs);
      const spanSec = Number.isFinite(durationMs)
        ? Math.max(0.28, durationMs / 1000)
        : 0.42;
      const layers = 6;
      const master = audio.createGain();
      const tone = audio.createBiquadFilter();
      tone.type = "lowpass";
      tone.frequency.value = 3200;
      tone.Q.value = 0.5;
      // Soft but clearly audible through laptop/phone speakers.
      master.gain.value = 0.55;
      master.connect(tone).connect(audio.destination);

      for (let index = 0; index < layers; index += 1) {
        const progress = index / (layers - 1);
        const start =
          audio.currentTime + progress * spanSec * 0.7 + Math.random() * 0.03;
        const duration = 0.14 + Math.random() * 0.1;
        const frames = Math.max(1, Math.floor(audio.sampleRate * duration));
        const buffer = audio.createBuffer(1, frames, audio.sampleRate);
        const samples = buffer.getChannelData(0);
        let brown = 0;
        for (let i = 0; i < frames; i += 1) {
          const white = Math.random() * 2 - 1;
          brown = (brown + white * 0.04) * 0.975;
          const t = i / Math.max(1, frames - 1);
          const envelope = Math.sin(Math.PI * t) ** 1.6;
          samples[i] = (brown * 4.5 + white * 0.22) * envelope;
        }
        const source = audio.createBufferSource();
        const filter = audio.createBiquadFilter();
        const gain = audio.createGain();
        source.buffer = buffer;
        filter.type = "bandpass";
        filter.frequency.value = 900 + Math.random() * 1400;
        filter.Q.value = 0.55;
        const peak = 0.22 + Math.random() * 0.12;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(peak, start + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        source.connect(filter).connect(gain).connect(master);
        source.start(start);
        source.stop(start + duration + 0.03);
      }

      window.setTimeout(() => {
        try {
          master.disconnect();
          tone.disconnect();
        } catch {
          /* already gone */
        }
      }, Math.ceil(spanSec * 1000) + 400);
    };

    if (audio.state === "suspended") {
      void audio.resume().then(run).catch(() => {});
      return;
    }
    run();
  }

  function primeFromGesture() {
    if (!muted) {
      ensureContext();
      startAmbient();
    }
  }

  function watchBoardReveal() {
    const board = document.getElementById("board");
    const shell = board?.closest(".parchment-shell");
    if (!board) {
      return;
    }

    const syncToBoard = () => {
      if (isBoardVisible()) {
        startAmbient();
      } else {
        stopAmbient();
      }
    };
    const observer = new MutationObserver(syncToBoard);
    if (shell) {
      observer.observe(shell, { attributes: true, attributeFilter: ["class"] });
    }
    observer.observe(board, { childList: true });
    syncToBoard();
  }

  document.addEventListener("pointerdown", primeFromGesture, { capture: true, once: true });
  document.addEventListener("keydown", primeFromGesture, { capture: true, once: true });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopAmbient();
    } else if (!muted) {
      startAmbient();
    }
  });
  window.addEventListener("pagehide", stopAmbient);
  document.addEventListener("DOMContentLoaded", () => {
    updateButton();
    // Attempt immediate playback when the reveal curtain exposes the board.
    ensureContext();
    requestAnimationFrame(watchBoardReveal);
    document.getElementById("submitTurnBtn")?.addEventListener("click", () => {
      stoppedForSubmit = true;
      stopAmbient();
    }, { capture: true });
    document.getElementById("newGameBtn")?.addEventListener("click", () => {
      stoppedForSubmit = false;
      requestAnimationFrame(startAmbient);
    });
    document.getElementById("soundToggleBtn")?.addEventListener("click", () => {
      setMuted(!muted);
    });
  });

  window.GlobbleSound = {
    isMuted: () => muted,
    setMuted,
    startAmbient,
    stopAmbient,
    playShuffleRustle
  };
})();
