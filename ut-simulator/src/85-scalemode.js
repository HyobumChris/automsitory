/* 85-scalemode.js — Scale Mode: the white sheet with mm rulers, the ADJUST SCALE window, picture import,
 * boundary tracing into a `polygon` specimen, the protractor overlay and the magnified skip graduations.
 *
 * SPEC-v3 §6.2 F41 (Scale Mode) and F42 (magnified skip graduations).   owner: ui-7
 * Windows: `scale` (ADJUST SCALE) and the `protractor` overlay drawn on #cv-cross (not a win).
 * Test API: UT.test.scale = {enter, exit, setMmPerPx, loadPicture, trace, protractor, state} — this module
 * CREATES that nested namespace; others may only Object.assign onto it (SPEC-v3 §1).
 *
 * STUB (lead): namespace, css string and no-op lifecycle only, so index.html can carry the file and
 * build.py can produce a complete build before ui-7 lands the feature. Everything below is a placeholder.
 * House rules that must survive the implementation: one IIFE, no import/export, NO DOM at load time
 * (UT.dom.injectCss is called inside open()/mount(), never here), no external resources of any kind,
 * pictures only through UT.dom.fileOpen (§11.9), every user-visible string through UT.i18n.t, and no
 * synchronous UT.set from inside a 'render' listener.
 */
(function (UT) {
  'use strict';

  const css = [
    '.win[data-win=scale] .win-body { min-width: 260px; }',
    '.win[data-win=scale] .sm-row { display: flex; gap: 4px; align-items: center; margin-top: 6px; }',
    '.win[data-win=scale] .sm-icons { display: grid; grid-template-columns: repeat(9, 1fr); gap: 3px; }',
  ].join('\n');

  /** True while Scale Mode is active. */
  function on() { return !!(UT.state && UT.state.scaleMode && UT.state.scaleMode.on); }

  UT.scalemode = {
    css,
    window: 'scale',
    on,
    /** Enter Scale Mode (F41). Stub: no-op until ui-7 lands the mode. */
    enter() { return false; },
    /** Leave Scale Mode and restore the previous mode. Stub: no-op. */
    exit() { return false; },
    /** Open/close the ADJUST SCALE window. Stub: no-op. */
    toggle() { return false; },
    /** Open the ADJUST SCALE window. Stub: no-op. */
    open() { return null; },
    /** Close the ADJUST SCALE window. Stub: no-op. */
    close() { return null; },
    /**
     * Module self-test (pure helpers only — never touches the DOM).
     * @returns {string[]} failure strings, empty when the module is healthy
     */
    __selftest() {
      const f = [];
      if (typeof UT.scalemode.css !== 'string' || !UT.scalemode.css.length) f.push('css string');
      if (UT.scalemode.window !== 'scale') f.push('window name');
      if (typeof UT.scalemode.on !== 'function') f.push('on()');
      return f;
    },
  };
})(window.UT = window.UT || {});
