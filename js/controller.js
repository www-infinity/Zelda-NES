/**
 * controller.js – Touch/click on-screen NES controller
 * Handles button press/release events and forwards them to jsnes.
 */

(function () {
  'use strict';

  /* ---- Button press / release forwarded to emulator ---- */
  function pressButton(keyName, down) {
    const nes    = window.getNES ? window.getNES() : null;
    const btnMap = window.NES_BUTTON_MAP;
    if (!nes || btnMap === undefined) return;

    const btn = btnMap[keyName];
    if (btn === undefined) return;

    if (down) {
      nes.buttonDown(1, btn);
    } else {
      nes.buttonUp(1, btn);
    }
  }

  /* ---- Visual feedback helpers ---- */
  function addPressedClass(el) {
    if (el) el.classList.add('pressed');
  }

  function removePressedClass(el) {
    if (el) el.classList.remove('pressed');
  }

  /* ---- Global handlers referenced from HTML ontouchstart/onmousedown ---- */
  window.btnDown = function (el) {
    const key = el.getAttribute('data-key');
    if (!key) return;
    pressButton(key, true);
    addPressedClass(el);
  };

  window.btnUp = function (el) {
    const key = el.getAttribute('data-key');
    if (!key) return;
    pressButton(key, false);
    removePressedClass(el);
  };

  /* ---- Cancel all button presses if touch leaves controller area ---- */
  document.addEventListener('touchcancel', releaseAll);
  document.addEventListener('touchend',   releaseAll, { passive: true });

  function releaseAll() {
    document.querySelectorAll('.controller button.pressed').forEach(function (el) {
      window.btnUp(el);
    });
  }

  /* ---- Prevent default touch scroll on controller ---- */
  const controller = document.getElementById('controller');
  if (controller) {
    controller.addEventListener('touchstart', function (e) {
      e.preventDefault();
    }, { passive: false });

    controller.addEventListener('touchmove', function (e) {
      e.preventDefault();
    }, { passive: false });
  }

  /* ---- Wake AudioContext on first interaction (iOS/Android requirement) ---- */
  document.addEventListener('touchstart', function wakeAudio() {
    if (window.audioCtx && window.audioCtx.state === 'suspended') {
      window.audioCtx.resume();
    }
    document.removeEventListener('touchstart', wakeAudio);
  }, { once: true });
})();
