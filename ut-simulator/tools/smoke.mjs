// Headless smoke test for the built single-file simulator.
// Usage: NODE_PATH=/opt/node22/lib/node_modules node tools/smoke.mjs [path/to/utman_simulator.html] [--shots dir]
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const file = path.resolve(args.find(a => !a.startsWith('--')) || path.join(process.cwd(), '..', 'utman_simulator.html'));
const shotsIdx = args.indexOf('--shots');
const shots = shotsIdx >= 0 ? path.resolve(args[shotsIdx + 1]) : null;
if (shots) fs.mkdirSync(shots, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
await page.goto('file://' + file);
await page.waitForTimeout(600);
const hasUT = await page.evaluate(() => !!(window.UT && window.UT.test));
console.log('loaded', file, 'UT.test present:', hasUT, 'version:', await page.evaluate(() => window.UT && window.UT.VERSION));
if (shots) await page.screenshot({ path: path.join(shots, '00-boot.png') });

const ids = ['tb-0','tb-45','tb-60','tb-70','tb-v2','tb-v1','tb-dac','tb-plot','tb-damp','tb-size','tb-defect','tb-hide','tb-clear','tb-beam','tb-rad','tb-pipe','tb-tky','tb-tofd','tb-aut'];
for (const id of ids) {
  const before = errors.length;
  const exists = await page.$('#' + id);
  if (!exists) { errors.push('[missing] #' + id); continue; }
  await page.click('#' + id);
  await page.waitForTimeout(250);
  if (shots) await page.screenshot({ path: path.join(shots, id + '.png') });
  if (errors.length > before) console.log('errors after', id, errors.slice(before));
  await page.click('#' + id).catch(() => {}); // toggle back
  await page.waitForTimeout(100);
}
// Basic physics probes through the test API
const probe = await page.evaluate(() => {
  const out = {};
  try {
    UT.test.loadSpecimen('v1', { face: 'narrow' });
    UT.test.setProbe({ angle: 0, x: 150, crystal: 'single' });
    UT.test.setInstrument({ range: 125, gain: 30 });
    UT.test.compute();
    out.v1narrow = UT.test.echoes().slice(0, 6).map(e => [Math.round(e.path * 10) / 10, Math.round(e.ampPct), e.kind]);
    UT.test.loadSpecimen('plate-weld', { T: 20 });
    out.derived60 = UT.test.setProbe({ angle: 60, x: 40, z: 150 });
  } catch (e) { out.error = String(e && e.stack || e); }
  return out;
});
console.log(JSON.stringify(probe, null, 1));
await browser.close();
if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log('SMOKE OK');
