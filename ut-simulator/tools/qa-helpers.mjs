// Shared Playwright helpers for QA scripts.
// Usage:
//   import { launch, allMenuPaths } from './qa-helpers.mjs';
//   const { browser, page, errors, file } = await launch({ shots: '/tmp/x' });
//   ... await page.evaluate(() => UT.test.click('tb-60')) ...
//   await browser.close();
// Requires NODE_PATH=/opt/node22/lib/node_modules (playwright).
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));

/** Default built file: ../../utman_simulator.html relative to tools/. */
export const DEFAULT_FILE = path.resolve(here, '..', '..', 'utman_simulator.html');

/**
 * Boot the built single-file simulator from file:// with console/page error collection.
 * @param {{file?: string, width?: number, height?: number, hash?: string, shots?: string, settle?: number}} [opts]
 * @returns {Promise<{browser, page, errors: string[], file: string, shot: (name: string) => Promise<void>, errorsSince: (n: number) => string[]}>}
 */
export async function launch(opts = {}) {
  const { chromium } = require('playwright');
  const file = path.resolve(opts.file || DEFAULT_FILE);
  if (!fs.existsSync(file)) throw new Error('built file not found: ' + file + ' (run python3 build.py)');
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const page = await browser.newPage({ viewport: { width: opts.width || 1400, height: opts.height || 900 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
  page.on('pageerror', e => errors.push('[pageerror] ' + (e && e.message || e)));
  await page.goto('file://' + file + (opts.hash || ''));
  await page.waitForTimeout(opts.settle === undefined ? 600 : opts.settle);
  const shotsDir = opts.shots ? path.resolve(opts.shots) : null;
  if (shotsDir) fs.mkdirSync(shotsDir, { recursive: true });
  let n = 0;
  const shot = async (name) => {
    if (!shotsDir) return;
    const fname = String(n++).padStart(2, '0') + '-' + name.replace(/[^\w.-]+/g, '_') + '.png';
    await page.screenshot({ path: path.join(shotsDir, fname) });
  };
  const errorsSince = (k) => errors.slice(k);
  return { browser, page, errors, file, shot, errorsSince };
}

/** All toolbar button ids (SPEC §11; SPEC-v3 §8 adds `tb-accrej` after `tb-rad` — 20 buttons). */
export const TOOLBAR_IDS = ['tb-0', 'tb-45', 'tb-60', 'tb-70', 'tb-v2', 'tb-v1', 'tb-dac', 'tb-plot', 'tb-damp', 'tb-size', 'tb-defect', 'tb-hide', 'tb-clear', 'tb-beam', 'tb-rad', 'tb-accrej', 'tb-pipe', 'tb-tky', 'tb-tofd', 'tb-aut'];

/**
 * Dismiss every open modal dialog (SPEC-v3 F11 `blockpick`, F25 `defect-steps`, F33 `hidekey`, …).
 * v3 turned two toolbar actions into modal choosers, so a script that drives the real UI must clear the
 * `.win-backdrop` between gestures or the next click is swallowed. App behaviour is per spec; this is the
 * harness catching up.
 * @param {import('playwright').Page} page
 * @returns {Promise<string[]>} names of the windows that were closed
 */
export async function dismissModals(page) {
  return page.evaluate(() => {
    const closed = [];
    if (!window.UT || !UT.dom || !UT.dom.wins) return closed;
    for (const k of Object.keys(UT.dom.wins)) {
      const w = UT.dom.wins[k];
      try { if (w && w.isOpen() && w.el && w.el.previousElementSibling && w.el.previousElementSibling.classList.contains('win-backdrop') && w.el.previousElementSibling.style.display !== 'none') { w.close(); closed.push(k); } } catch (e) { /* ignore */ }
    }
    return closed;
  });
}

/** Enumerate every menu label path ('Probes/Number of Skips/2') by opening the menus in the page. */
export async function allMenuPaths(page) {
  return page.evaluate(() => {
    const out = [];
    const items = Array.from(document.querySelectorAll('#menubar .menu-item'));
    for (const item of items) {
      const top = item.dataset.key;
      item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      const walk = (container, prefix) => {
        for (const e of container.querySelectorAll(':scope > .menu-entry')) {
          const key = e.dataset.key;
          const sub = e.querySelector(':scope > .menu-sub');
          if (sub) walk(sub, prefix + '/' + key); else out.push(prefix + '/' + key);
        }
      };
      const drop = item.querySelector('.menu-drop');
      if (drop) walk(drop, top);
      item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    }
    if (window.UT && UT.app && UT.app.closeMenus) UT.app.closeMenus();
    return out;
  });
}
