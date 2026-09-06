// Headless smoke test for the built single-file simulator.
// Usage: NODE_PATH=/opt/node22/lib/node_modules node tools/smoke.mjs [path/to/utman_simulator.html] [--shots dir]
import path from 'node:path';
import fs from 'node:fs';
import { launch, TOOLBAR_IDS } from './qa-helpers.mjs';

const args = process.argv.slice(2);
const fileArg = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--shots');
const shotsIdx = args.indexOf('--shots');
const shots = shotsIdx >= 0 ? path.resolve(args[shotsIdx + 1]) : null;
if (shots) fs.mkdirSync(shots, { recursive: true });

const { browser, page, errors, file } = await launch({ file: fileArg });
const hasUT = await page.evaluate(() => !!(window.UT && window.UT.test));
console.log('loaded', file, 'UT.test present:', hasUT, 'version:', await page.evaluate(() => window.UT && window.UT.VERSION));
if (shots) await page.screenshot({ path: path.join(shots, '00-boot.png') });

const ids = TOOLBAR_IDS;
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
