/**
 * emulator.js – NES emulator core integration
 * Wraps jsnes to drive the canvas and audio.
 */

(function () {
  'use strict';

  /* ---- DOM refs ---- */
  const loadingScreen = document.getElementById('loading-screen');
  const loadingBar    = document.getElementById('loading-bar');
  const loadingText   = document.getElementById('loading-text');
  const app           = document.getElementById('app');
  const canvas        = document.getElementById('nes-canvas');
  const pauseOverlay  = document.getElementById('pause-overlay');
  const resumeBtn     = document.getElementById('resume-btn');
  const romUpload     = document.getElementById('rom-upload');
  const menuRomUpload = document.getElementById('menu-rom-upload');

  const ctx = canvas.getContext('2d');

  /* ---- State ---- */
  let nes        = null;
  let animFrameId = null;
  let paused     = false;
  let imageData  = null;

  /* ---- Audio context ---- */
  let audioCtx   = null;
  let audioNode  = null;
  let sampleRate = 44100;
  const BUFFER_SIZE = 4096;
  let audioBuffer  = new Float32Array(BUFFER_SIZE * 2);
  let audioHead    = 0;

  function initAudio() {
    try {
      audioCtx  = new (window.AudioContext || window.webkitAudioContext)();
      sampleRate = audioCtx.sampleRate;
      audioNode = audioCtx.createScriptProcessor(BUFFER_SIZE, 0, 1);
      audioNode.onaudioprocess = function (e) {
        const out = e.outputBuffer.getChannelData(0);
        for (let i = 0; i < BUFFER_SIZE; i++) {
          out[i] = audioHead > 0 ? audioBuffer[--audioHead] : 0;
        }
      };
      audioNode.connect(audioCtx.destination);
    } catch (err) {
      console.warn('Audio unavailable:', err);
    }
  }

  /* ---- Pixel buffer ---- */
  function onFrame(frameBuffer) {
    const buf32 = new Uint32Array(imageData.data.buffer);
    for (let i = 0; i < frameBuffer.length; i++) {
      buf32[i] = 0xff000000 | frameBuffer[i];
    }
    ctx.putImageData(imageData, 0, 0);
  }

  function onAudioSample(left) {
    if (audioHead < audioBuffer.length) {
      audioBuffer[audioHead++] = left;
    }
  }

  /* ---- NES init ---- */
  function createNES() {
    imageData = ctx.createImageData(256, 240);
    nes = new jsnes.NES({
      onFrame:       onFrame,
      onAudioSample: onAudioSample,
      sampleRate:    sampleRate,
    });
  }

  /* ---- Main loop ---- */
  let lastTime = 0;
  const FRAME_MS = 1000 / 60;

  function loop(ts) {
    if (!paused && nes) {
      const delta = ts - lastTime;
      if (delta >= FRAME_MS) {
        lastTime = ts - (delta % FRAME_MS);
        nes.frame();
      }
    }
    animFrameId = requestAnimationFrame(loop);
  }

  /* ---- Load ROM ---- */
  function loadROMData(buffer) {
    setProgress(30, 'Parsing ROM…');
    try {
      createNES();
      initAudio();
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      const bytes = new Uint8Array(buffer);
      let str = '';
      for (let i = 0; i < bytes.length; i++) {
        str += String.fromCharCode(bytes[i]);
      }
      setProgress(60, 'Loading ROM into emulator…');
      nes.loadROM(str);
      setProgress(100, 'Ready!');
      setTimeout(startEmulator, 400);
    } catch (err) {
      setProgress(0, 'Error: ' + err.message);
      console.error(err);
    }
  }

  function startEmulator() {
    loadingScreen.classList.add('hidden');
    app.classList.remove('hidden');
    paused = false;
    lastTime = performance.now();
    if (animFrameId) cancelAnimationFrame(animFrameId);
    animFrameId = requestAnimationFrame(loop);
  }

  /* ---- UI helpers ---- */
  function setProgress(pct, msg) {
    loadingBar.style.width = pct + '%';
    loadingText.textContent = msg;
  }

  /* ---- File input handlers ---- */
  function handleFileInput(input) {
    input.addEventListener('change', function () {
      const file = this.files[0];
      if (!file) return;
      setProgress(10, 'Reading file…');
      const reader = new FileReader();
      reader.onprogress = function (e) {
        if (e.lengthComputable) {
          setProgress(10 + (e.loaded / e.total) * 18, 'Loading…');
        }
      };
      reader.onload = function (e) {
        loadROMData(e.target.result);
      };
      reader.onerror = function () {
        setProgress(0, 'Failed to read file');
      };
      reader.readAsArrayBuffer(file);
    });
  }

  handleFileInput(romUpload);
  handleFileInput(menuRomUpload);

  /* ---- Expose global helpers (used by HTML onclick attrs) ---- */
  window.togglePause = function () {
    if (!nes) return;
    paused = !paused;
    pauseOverlay.classList.toggle('hidden', !paused);
    closeMenu();
  };

  window.resetGame = function () {
    if (!nes) return;
    nes.reset();
    paused = false;
    pauseOverlay.classList.add('hidden');
    closeMenu();
  };

  window.loadROM = function () {
    closeMenu();
    loadingScreen.classList.remove('hidden');
    app.classList.add('hidden');
    setProgress(0, 'Choose a .nes file…');
    romUpload.click();
  };

  window.toggleFullscreen = function () {
    closeMenu();
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  resumeBtn.addEventListener('click', function () {
    window.togglePause();
  });

  /* ---- Close menu helper ---- */
  function closeMenu() {
    const m = document.getElementById('slide-menu');
    if (m) m.classList.add('hidden');
  }

  window.toggleMenu = function () {
    const m = document.getElementById('slide-menu');
    if (m) m.classList.toggle('hidden');
  };

  /* ---- Keyboard support (desktop) ---- */
  const BUTTON_MAP = {
    A:      0,
    B:      1,
    SELECT: 2,
    START:  3,
    UP:     4,
    DOWN:   5,
    LEFT:   6,
    RIGHT:  7,
  };

  document.addEventListener('keydown', function (e) {
    const mapping = getKeyMapping(e.key);
    if (mapping && nes) {
      nes.buttonDown(1, mapping);
      e.preventDefault();
    }
  });

  document.addEventListener('keyup', function (e) {
    const mapping = getKeyMapping(e.key);
    if (mapping && nes) {
      nes.buttonUp(1, mapping);
      e.preventDefault();
    }
  });

  function getKeyMapping(key) {
    const map = {
      ArrowUp:    4,
      ArrowDown:  5,
      ArrowLeft:  6,
      ArrowRight: 7,
      z: 0, Z: 0,
      x: 1, X: 1,
      Enter: 3,
      Shift: 2,
    };
    return map[key] !== undefined ? map[key] : null;
  }

  /* ---- Expose button constants for controller.js ---- */
  window.NES_BUTTON_MAP = BUTTON_MAP;
  window.getNES = function () { return nes; };

  /* ---- Startup message ---- */
  setProgress(0, 'Load a .nes ROM file to begin');
})();
