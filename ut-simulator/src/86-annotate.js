/* 86-annotate.js — the instructor annotation toolkit: the SHIFT+F12 / Ctrl+Shift+D drawing overlay,
 * the pencil / line / eraser palette, red and blue strokes over the whole screen and the highlight pointer.
 *
 * SPEC-v3 §6.4 F51 (instructor annotation toolkit).   owner: ui-8
 * Surfaces: the overlay `div#annot` (not a win) and the `draw` palette window (Tools ▸ Draw palette…).
 * Test API: UT.test.annot = {toggle, stroke, clear, torch, state} — this module CREATES that nested
 * namespace; others may only Object.assign onto it (SPEC-v3 §1).
 *
 * STUB (lead): namespace, css string and no-op lifecycle only, so index.html can carry the file and
 * build.py can produce a complete build before ui-8 lands the feature. Everything below is a placeholder.
 * House rules that must survive the implementation: one IIFE, no import/export, NO DOM at load time
 * (UT.dom.injectCss is called inside open()/mount(), never here), Pointer Events with setPointerCapture and
 * touch-action none for the overlay, scale-aware through UT.dom.localPos / UT.dom.scale, the stroke being
 * drawn lives in a module-level buffer (never in state), state.annot.strokes is capped at 200 and is never
 * persisted, and every user-visible string goes through UT.i18n.t.
 */
(function (UT) {
  'use strict';

  const css = [
    '#annot { position: absolute; inset: 0; z-index: 90000; touch-action: none; }',
    '#annot.off { display: none; }',
    '.win[data-win=draw] .an-tools { display: flex; gap: 4px; flex-wrap: wrap; }',
  ].join('\n');

  /** True while the annotation overlay is armed. */
  function on() { return !!(UT.state && UT.state.annot && UT.state.annot.on); }

  UT.annotate = {
    css,
    window: 'draw',
    overlayId: 'annot',
    on,
    /** Arm / disarm the annotation overlay (F51). Stub: no-op until ui-8 lands the toolkit. */
    toggle() { return false; },
    /** Open the draw palette. Stub: no-op. */
    open() { return null; },
    /** Close the draw palette and disarm the overlay. Stub: no-op. */
    close() { return null; },
    /** Erase every stroke. Stub: no-op. */
    clear() { return 0; },
    /**
     * Module self-test (pure helpers only — never touches the DOM).
     * @returns {string[]} failure strings, empty when the module is healthy
     */
    __selftest() {
      const f = [];
      if (typeof UT.annotate.css !== 'string' || !UT.annotate.css.length) f.push('css string');
      if (UT.annotate.window !== 'draw' || UT.annotate.overlayId !== 'annot') f.push('surface names');
      if (typeof UT.annotate.on !== 'function') f.push('on()');
      return f;
    },
  };
})(window.UT = window.UT || {});
