// Integration drive: boots the built file, exercises toolbar, menus, windows, drags, keys, scans,
// trade test, lessons; prints physics acceptance numbers; writes screenshots.
// Usage: NODE_PATH=/opt/node22/lib/node_modules node tools/integ.mjs [--shots /tmp/utsim-integ/shots]
import { launch, TOOLBAR_IDS, allMenuPaths } from './qa-helpers.mjs';

const args = process.argv.slice(2);
const si = args.indexOf('--shots');
const shots = si >= 0 ? args[si + 1] : '/tmp/utsim-integ/shots';
const { browser, page, errors, shot } = await launch({ shots });
const report = [];
const log = (...a) => { console.log(...a); report.push(a.join(' ')); };
const errMark = (label, k) => { const e = errors.slice(k); if (e.length) log('!! errors during ' + label + ':\n   ' + e.join('\n   ')); };
const ev = (fn, arg) => page.evaluate(fn, arg);
// Assertions of the drive itself (drags must move the probe, …) are pushed into `errors` so a silently broken
// scenario shows up in TOTAL ERRORS and in the exit code instead of passing as a mere log line.
const expect = (cond, msg) => { if (!cond) { errors.push('ASSERT ' + msg); log('!! ASSERT FAILED: ' + msg); } return !!cond; };
// v2 design-box scaling (SPEC-v2 §5.4): view.toPx() returns design px inside the 1280×760 #app box while
// getBoundingClientRect() is in screen px — multiply design offsets by UT.dom.scale() before adding the rect origin.
const scaleK = () => ev(() => (UT.dom && UT.dom.scale ? UT.dom.scale() : 1) || 1);

log('booted; UT.test:', await ev(() => !!(window.UT && UT.test)), 'mode', await ev(() => UT.state.mode));
await shot('boot');
const layout = await ev(() => {
  const r = id => { const el = document.getElementById(id); if (!el) return null; const b = el.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
  return { instrument: r('instrument'), ascan: r('cv-ascan'), plan: r('cv-plan'), ruler: r('cv-ruler'), cross: r('cv-cross'), status: r('statusbar'), cv3d: r('cv-3d'), page: [window.innerWidth, window.innerHeight, document.documentElement.scrollWidth, document.documentElement.scrollHeight] };
});
log('layout', JSON.stringify(layout));

// ---- toolbar: click each twice (toggle back)
for (const id of TOOLBAR_IDS) {
  const k = errors.length;
  const r1 = await ev(id => UT.test.click(id), id);
  await page.waitForTimeout(150);
  await shot(id);
  const wins = await ev(() => Array.from(document.querySelectorAll('.win')).filter(w => w.style.display !== 'none').map(w => { const b = w.getBoundingClientRect(); return w.dataset.win + '@' + Math.round(b.left) + ',' + Math.round(b.top) + ' ' + Math.round(b.width) + 'x' + Math.round(b.height); }));
  log('click', id, '→', r1, 'mode', await ev(() => UT.state.mode), 'wins', wins.join(' '));
  const r2 = await ev(id => UT.test.click(id), id);
  await page.waitForTimeout(80);
  void r2;
  errMark('toolbar ' + id, k);
}
log('mode after toolbar loop', await ev(() => UT.state.mode));
// disabled-state check per mode (SPEC 14.7)
for (const m of ['dac', 'v1', 'v2', 'iow', 'tofd', 'aut', 'tky', 'step', 'lamination', 'trade']) {
  const k = errors.length;
  const r = await ev(m => {
    UT.test.enterMode(m, { silentUI: false });
    const tb = Array.from(document.querySelectorAll('.tb-btn.disabled')).map(b => b.id.slice(3));
    const menus = Array.from(document.querySelectorAll('#menubar .menu-item.disabled')).map(b => b.id.slice(5));
    const main = document.getElementById('main').className;
    const cross = document.getElementById('cv-cross').getBoundingClientRect();
    const plan = document.getElementById('cv-plan');
    return { tb: tb.join(','), menus: menus.join(','), main, cross: [Math.round(cross.width), Math.round(cross.height)], planVisible: plan.offsetParent !== null };
  }, m);
  await page.waitForTimeout(120);
  await shot('mode-' + m);
  log('mode', m, JSON.stringify(r));
  errMark('mode ' + m, k);
}
await ev(() => UT.test.enterMode('weld'));

// ---- menus: every item
const paths = await allMenuPaths(page);
log('menu paths', paths.length);
const skip = /Print|^File\/New|Trade Test|Lamination Check|Language\/Korean|Delete All Defects|Exit Step Wedge|Auto Cal$/;
// Every path is exercised from weld mode: some items are mode toggles (Step Wedge ▸ Steps…/FBH block, Weld ▸ TKY Joint)
// and v2's DISABLED table legitimately greys out whole menus in other modes (SPEC-v2 §8: DISABLED.fbh.menus =
// ['weld','defects']), so a loop that stays in fbh mode would log the entire Weld/Defects menus as false negatives.
// The mode is restored after such an item and every non-skipped path must return true (a disabled or throwing entry
// is a drive failure, not a log line).
const modeSwitches = [];
for (const p of paths) {
  const k = errors.length;
  let r = 'skipped';
  if (!skip.test(p)) {
    r = await ev(p => { try { return UT.test.menu(p); } catch (e) { return 'EXC ' + e.message; } }, p);
    await page.waitForTimeout(60);
  }
  const mode = await ev(() => UT.state.mode);
  if (r !== 'skipped') expect(r === true, `menu ${p} returns true (got ${r}, mode ${mode})`);
  if (mode !== 'weld') { modeSwitches.push(p + '→' + mode); await ev(() => UT.test.enterMode('weld')); await page.waitForTimeout(60); }
  errMark('menu ' + p, k);
  // undo modal things
  await ev(() => { for (const k of Object.keys(UT.dom.wins)) { const w = UT.dom.wins[k]; if (w.isOpen() && (k.startsWith('confirm-') || k.startsWith('alert-'))) w.close(); } });
}
log('menu mode switches (restored to weld):', modeSwitches.join(' ') || 'none');
await shot('after-menus');
// back to defaults
await ev(() => { UT.test.enterMode('weld'); UT.setIn('probe', { method: 'pe', angle: 60, mode: 'shear', crystal: 'single', freq: 5, diameter: 10 }); UT.setIn('display', { colourCode: 'none', singleLine: false, focus: false, skips: 3, units: 'mm', plan: true }); UT.setIn('damping', { tool: false, points: [] }); if (UT.app.closeTour) UT.app.closeTour(); /* Help ▸ Quick tour leaves its modal #tour overlay up */ UT.set({ utSet: 'epoch600' }); UT.app.applyLayout(); });
log('mode after menus', await ev(() => UT.state.mode), 'utSet', await ev(() => UT.state.utSet));
expect(!(await ev(() => UT.state.damping && UT.state.damping.tool)), 'finger damping tool is off after the menu loop reset');
// Korean then back
{ const k = errors.length; await ev(() => UT.test.menu('Options/Language/Korean (한국어)')); await page.waitForTimeout(80); await shot('korean'); await ev(() => UT.test.menu('Options/Language/English')); errMark('language', k); }

// ---- windows: open/close every known window through owners
const winNames = ['pipe3d', 'defects', 'tofd', 'tofd-ascan', 'aut', 'plotter', 'rad', 'size', 'usk7', 'weld', 'wedge', 'options', 'stepwedge', 'about', 'guide', 'keys', 'export', 'tky', 'trade', 'lessons', 'dac'];
{
  const k = errors.length;
  const r = await ev(() => {
    const out = {};
    const open = { pipe3d: () => UT.views.pipe3d.open(), defects: () => UT.modes.defectEditor.open(), tofd: () => UT.tofd.panel.open(), 'tofd-ascan': () => UT.tofd.panel.open(), aut: () => UT.aut.open(), plotter: () => UT.views.plotter.open(), rad: () => UT.views.radiograph.open(), size: () => UT.views.sizing.open(), usk7: () => UT.instruments.setSkin('usk7'), weld: () => UT.app.openWeld(), wedge: () => UT.app.openWedge(), options: () => UT.app.openOptions(), stepwedge: () => UT.app.openStepWedge(), about: () => UT.app.openAbout(), guide: () => UT.app.openGuide(), keys: () => UT.app.openKeys(), export: () => UT.app.openExport(), tky: () => UT.modes.tkyPanel.open(), trade: () => UT.modes.tradeTest.open(), lessons: () => UT.modes.lessonsWindow.open(), dac: () => UT.modes.dacPanel.open() };
    for (const n of Object.keys(open)) {
      try { open[n](); } catch (e) { out[n] = 'EXC ' + e.message; continue; }
      const w = UT.dom.wins[n];
      if (!w) { out[n] = 'NO WINDOW'; continue; }
      const b = w.el.getBoundingClientRect();
      out[n] = (w.isOpen() ? 'open ' : 'CLOSED ') + Math.round(b.left) + ',' + Math.round(b.top) + ' ' + Math.round(b.width) + 'x' + Math.round(b.height);
    }
    return out;
  });
  await page.waitForTimeout(150);
  await shot('all-windows');
  log('windows', JSON.stringify(r, null, 0));
  await ev(() => { for (const k of Object.keys(UT.dom.wins)) { const w = UT.dom.wins[k]; if (w.isOpen()) w.close(); } UT.set({ utSet: 'epoch600' }); UT.test.enterMode('weld'); });
  errMark('windows', k);
}
// window listing
log('data-win names', await ev(() => Array.from(document.querySelectorAll('.win')).map(w => w.dataset.win).join(',')));

// ---- probe drag on cross-section and plan
{
  const k = errors.length;
  const ks = await scaleK();   // design px → screen px factor (1 with display.scale 'fixed', ≈ 1.09 at 1400×900 'auto')
  expect(!(await ev(() => UT.state.damping && UT.state.damping.tool)), 'finger damping tool off before the drag section');
  const c = await ev(() => { const b = document.getElementById('cv-cross').getBoundingClientRect(); const p = UT.views.cross.toPx(UT.state.probe.x, -5); return { left: b.left, top: b.top, px: p.x, py: p.y }; });
  const x0 = await ev(() => UT.state.probe.x);
  // the press point must reach the canvas itself (no window / tour overlay left over the cross-section)
  const atPress = await ev(pt => { const e = document.elementFromPoint(pt[0], pt[1]); return e ? e.tagName + (e.id ? '#' + e.id : '') : 'none'; }, [c.left + c.px * ks, c.top + c.py * ks]);
  expect(atPress === 'CANVAS#cv-cross', `press point on the cross-section canvas is uncovered (elementFromPoint = ${atPress})`);
  await page.mouse.move(c.left + c.px * ks, c.top + c.py * ks);
  await page.mouse.down();
  await page.mouse.move(c.left + (c.px + 80) * ks, c.top + c.py * ks, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(100);
  const x1 = await ev(() => UT.state.probe.x);
  log('cross drag: probe.x', x0, '→', x1, '(scale', ks.toFixed(3) + ')');
  expect(x1 > x0 + 5, `cross drag moved the probe (+80 design px): ${x0} → ${x1}`);
  const pl = await ev(() => { const b = document.getElementById('cv-plan').getBoundingClientRect(); const p = UT.views.plan.toPx(UT.state.probe.x, UT.state.probe.z); return { left: b.left, top: b.top, px: p.x, py: p.y }; });
  const z0 = await ev(() => UT.state.probe.z);
  await page.mouse.move(pl.left + pl.px * ks, pl.top + pl.py * ks);
  await page.mouse.down();
  await page.mouse.move(pl.left + (pl.px - 40) * ks, pl.top + (pl.py + 40) * ks, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(100);
  const after = await ev(() => [UT.state.probe.x, UT.state.probe.z]);
  log('plan drag: (x,z)', x1, z0, '→', after.join(','));
  expect(after[0] < x1 - 2 && after[1] > z0 + 2, `plan drag moved the probe (−40/+40 design px): ${x1},${z0} → ${after.join(',')}`);
  await shot('after-drag');
  // ruler click
  const ru = await ev(() => { const b = document.getElementById('cv-ruler').getBoundingClientRect(); const p = UT.views.cross.toPx(60, 0); return { x: b.left, px: p.x, y: b.top + b.height / 2 }; });
  await page.mouse.click(ru.x + ru.px * ks, ru.y);
  await page.waitForTimeout(80);
  const xr = await ev(() => UT.state.probe.x);
  log('ruler click x=60 → probe.x', xr);
  expect(Math.abs(xr - 60) <= 1, `ruler click at x = 60 mm sets probe.x ≈ 60 (got ${xr})`);
  // compass drag: the dial sits 16 px inside the top-right corner of the plan field (design px, see 62-view-plan)
  const cp = await ev(() => { const cv = document.getElementById('cv-plan'); const b = cv.getBoundingClientRect(); return { l: b.left, t: b.top, w: cv.clientWidth }; });
  await page.mouse.move(cp.l + (cp.w - 80) * ks, cp.t + 25 * ks);
  await page.mouse.down();
  await page.mouse.move(cp.l + (cp.w - 30) * ks, cp.t + 60 * ks, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(80);
  const skew = await ev(() => UT.state.probe.skew);
  log('compass drag → skew', skew);
  expect(skew !== 0, `compass drag changes the skew (got ${skew})`);
  await ev(() => UT.setIn('probe', { skew: 0 }));
  // wheel over cross → gain
  const g0 = await ev(() => UT.state.instrument.gain);
  await page.mouse.move(c.left + 200, c.top + 50);
  await page.mouse.wheel(0, -120);
  await page.waitForTimeout(80);
  log('wheel over cross: gain', g0, '→', await ev(() => UT.state.instrument.gain));
  errMark('drags', k);
}

// ---- keyboard
{
  const k = errors.length;
  await page.mouse.click(700, 400);
  const before = await ev(() => [UT.state.probe.x, UT.state.probe.z, UT.state.instrument.gain, UT.state.instrument.range, UT.state.probe.angle]);
  for (const key of ['ArrowRight', 'ArrowRight', 'Shift+ArrowLeft', 'ArrowDown', '+', '-', '=', 'r', 'f', 'f', 'p', 'p', 'h', 'h', 'b', 'b', '2', '3', 'Escape']) await page.keyboard.press(key);
  await page.waitForTimeout(100);
  const after = await ev(() => [UT.state.probe.x, UT.state.probe.z, UT.state.instrument.gain, UT.state.instrument.range, UT.state.probe.angle]);
  log('keys: [x,z,gain,range,angle]', before.join(','), '→', after.join(','));
  errMark('keyboard', k);
}

// ---- instrument interactions (softkeys)
{
  const k = errors.length;
  const r = await ev(() => {
    const out = [];
    const clickText = (txt) => { const els = Array.from(document.querySelectorAll('#instrument *')).filter(e => e.children.length === 0 && e.textContent.trim() === txt); if (els.length) { els[0].click(); return true; } return false; };
    out.push('40.0dB:' + clickText('40.0dB') + ' gain=' + UT.state.instrument.gain);
    out.push('Range:' + clickText('Range') + ' sel=' + UT.state.instrument.selectedParam);
    const el = document.getElementById('instrument'); el.focus();
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    out.push('range after up=' + UT.state.instrument.range);
    out.push('NEXT GROUP:' + clickText('NEXT GROUP') + ' page=' + UT.state.instrument.page);
    for (const s of ['epoch4', 'usk7', 'epoch600']) { UT.set({ utSet: s }); UT.renderNow(); out.push(s + ' cv-ascan=' + !!document.getElementById('cv-ascan')); }
    return out;
  });
  log('instrument', r.join(' | '));
  for (const s of ['epoch4', 'usk7']) { await ev(s => { UT.set({ utSet: s }); }, s); await page.waitForTimeout(150); await shot('skin-' + s); }
  await ev(() => UT.set({ utSet: 'epoch600' }));
  errMark('instrument', k);
}

// ---- scans
{
  const k = errors.length;
  const r = await ev(() => {
    const out = {};
    UT.test.loadSpecimen('plate-weld', { T: 20 });
    UT.test.setDefects([{ n: 1, type: 'planar', pts: [{ x: 0, y: 8 }, { x: 0, y: 13 }], zFrom: 120, zTo: 150, label: 'Defect 1' }]);
    UT.test.enterMode('tofd');
    UT.renderNow();
    out.tofd = UT.test.tofd();
    out.tofdScan = UT.test.runTofdScan();
    out.statusMid = UT.state.status.mid; out.statusRight = UT.state.status.right;
    return out;
  });
  await page.waitForTimeout(150);
  await shot('tofd-scan');
  log('tofd lateralUs', r.tofd.lateralUs, 'backwallUs', r.tofd.backwallUs, 'events', (r.tofd.events || []).length, 'scan', JSON.stringify(r.tofdScan));
  log('tofd status mid:', r.statusMid, '| right:', r.statusRight);
  const a = await ev(() => {
    UT.test.enterMode('aut');
    UT.renderNow();
    const s = UT.test.runAutScan();
    return { scan: s, mid: UT.state.status.mid };
  });
  await page.waitForTimeout(150);
  await shot('aut-scan');
  log('aut scan', JSON.stringify(a.scan).slice(0, 300), '| mid:', a.mid);
  await ev(() => UT.test.enterMode('weld'));
  errMark('scans', k);
}

// ---- trade
{
  const k = errors.length;
  const r = await ev(() => {
    const t1 = UT.test.trade.start(1);
    const t2 = UT.test.trade.start(1);
    const same = JSON.stringify(t1) === JSON.stringify(t2);
    const rows = UT.test.trade.truth().map(t => ({ n: t.n, z: t.zFrom, length: t.zTo - t.zFrom, depth: t.depth, type: t.type }));
    const score = UT.test.trade.submit(rows);
    return { n: t1.length, same, score, hide: UT.state.display.hide, mode: UT.state.mode };
  });
  await page.waitForTimeout(150);
  await shot('trade');
  log('trade', JSON.stringify(r));
  await ev(() => UT.test.enterMode('weld'));
  errMark('trade', k);
}

// ---- lessons
{
  const titles = await ev(() => UT.test.lessons());
  log('lessons', titles.length);
  for (const i of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17, 19, 20, 21]) {
    const k = errors.length;
    await ev(i => { UT.modes.lessonsWindow.open(); UT.modes.lessonsWindow.load(i); }, i);
    await page.waitForTimeout(150);
    await shot('lesson-' + (i + 1));
    log('lesson', i + 1, titles[i], 'mode', await ev(() => UT.state.mode), 'wins', await ev(() => Object.keys(UT.dom.wins).filter(k => UT.dom.wins[k].isOpen()).join(',')));
    errMark('lesson ' + (i + 1), k);
    await ev(() => { for (const k of Object.keys(UT.dom.wins)) { const w = UT.dom.wins[k]; if (w.isOpen() && k !== 'lessons') w.close(); } });
  }
  await ev(() => { UT.modes.lessonsWindow.close(); UT.test.enterMode('weld'); UT.set({ utSet: 'epoch600' }); });
}

// ---- defect editor brush drawing
{
  const k = errors.length;
  await ev(() => { UT.test.loadSpecimen('plate-weld', { T: 20 }); UT.test.setDefects([]); UT.modes.defectEditor.open(); });
  await page.waitForTimeout(100);
  const ks = await scaleK();
  const c = await ev(() => { const b = document.getElementById('cv-cross').getBoundingClientRect(); const p = UT.views.cross.toPx(0, 15); const q = UT.views.cross.toPx(0, 20); return { left: b.left, top: b.top, px0: p.x, py0: p.y, px1: q.x, py1: q.y }; });
  await page.mouse.move(c.left + c.px0 * ks, c.top + c.py0 * ks); await page.mouse.down(); await page.mouse.move(c.left + c.px1 * ks, c.top + c.py1 * ks, { steps: 6 }); await page.mouse.up();
  await page.waitForTimeout(100);
  const d = await ev(() => UT.state.defects.map(x => ({ n: x.n, type: x.type, pts: x.pts.length, zFrom: x.zFrom, zTo: x.zTo })));
  log('brush → defects', JSON.stringify(d));
  expect(d.length === 1 && d[0].pts >= 2, 'brush stroke on the cross-section creates one defect');
  await shot('defect-editor');
  await ev(() => UT.modes.defectEditor.close());
  errMark('defect editor', k);
}

// ---- physics acceptance
{
  const r = await ev(() => {
    const out = {};
    // #1
    UT.test.loadSpecimen('v1', { face: 'narrow' });
    UT.test.setProbe({ angle: 0, x: 150, crystal: 'single' });
    UT.test.setInstrument({ range: 125, gain: 30 });
    UT.test.compute();
    out.c1 = UT.test.echoes().filter(e => e.kind !== 'initial').slice(0, 4).map(e => [+e.path.toFixed(2), +e.ampPct.toFixed(1), e.kind]);
    out.c1init = UT.test.echoes().some(e => e.kind === 'initial') || (UT.test.ascan().samples.slice(0, 20).some(v => v > 50));
    UT.test.setProbe({ crystal: 'twin' }); UT.test.compute();
    out.c1twinInit = UT.test.ascan().samples.slice(0, 20).some(v => v > 50);
    UT.test.setProbe({ crystal: 'single' });
    // #2
    out.c2 = {};
    UT.test.loadSpecimen('v1', { face: 'wide' });
    for (const a of [0, 45, 60, 70]) { UT.test.setProbe({ angle: a, x: 100, side: 1 }); UT.test.setInstrument({ range: 400 }); UT.test.compute(); out.c2[a] = UT.test.echoes().filter(e => e.ampPct > 2).slice(0, 4).map(e => [+e.path.toFixed(1), +e.ampPct.toFixed(1)]); }
    out.c2status = UT.state.status.mid;
    UT.test.loadSpecimen('v2', { face: 'wide' });
    UT.test.setProbe({ angle: 45, x: 60, side: 1 }); UT.test.setInstrument({ range: 250 }); UT.test.compute();
    out.v2p = UT.test.echoes().filter(e => e.ampPct > 2).slice(0, 4).map(e => [+e.path.toFixed(1), +e.ampPct.toFixed(1)]);
    UT.test.setProbe({ side: -1 }); UT.test.compute();
    out.v2m = UT.test.echoes().filter(e => e.ampPct > 2).slice(0, 4).map(e => [+e.path.toFixed(1), +e.ampPct.toFixed(1)]);
    // #4/#5
    UT.test.loadSpecimen('iow');
    UT.test.setInstrument({ range: 100, gain: 40 });
    const best = { x: null, amp: -1 };
    for (let x = 257.5; x <= 267.5; x += 0.5) { UT.test.setProbe({ angle: 60, x, side: 1 }); UT.test.compute(); const e = UT.test.echoes().filter(e => e.kind === 'sdh' || e.kind === 'hole' || /hole|sdh/i.test(e.kind)).sort((a, b) => b.ampPct - a.ampPct)[0]; if (e && e.ampPct > best.amp) { best.amp = e.ampPct; best.x = x; best.path = e.path; best.kind = e.kind; } }
    UT.test.setProbe({ angle: 60, x: 262.5, side: 1 }); UT.test.compute();
    const e4 = UT.test.echoes().filter(e => /hole|sdh/i.test(e.kind)).sort((a, b) => b.ampPct - a.ampPct)[0];
    out.c4 = { at262: e4 && { path: +e4.path.toFixed(2), amp: +e4.ampPct.toFixed(1), kind: e4.kind }, best };
    const ro = UT.test.readouts();
    out.c5 = ro && ro.primary ? { sp: +ro.primary.path.toFixed(2), sd: +ro.primary.sd.toFixed(2), dp: +ro.primary.dp.toFixed(2), kind: ro.primary.echoKind } : ro;
    // #8
    UT.test.loadSpecimen('plate-weld', { T: 20, rootHeight: 0, capHeight: 0 });
    UT.test.setDefects([]);
    UT.test.addPreset('rootCrack');
    UT.test.setInstrument({ range: 100, gain: 40 });
    const scan = [];
    for (const x of [19.6, 25, 30, 34.6, 38, 42, 49.6]) { UT.test.setProbe({ angle: 60, x, side: 1 }); UT.test.compute(); const c = UT.test.echoes().filter(e => e.kind === 'corner').sort((a, b) => b.ampPct - a.ampPct)[0]; scan.push([x, c ? +c.path.toFixed(1) : null, c ? +c.ampPct.toFixed(1) : null]); }
    out.c8 = scan;
    out.c8defect = UT.state.defects.map(d => ({ type: d.type, pts: d.pts }));
    UT.test.loadSpecimen('plate-weld', { T: 20 });
    return out;
  });
  log('CHECK1 v1 narrow 0deg:', JSON.stringify(r.c1), 'initial pulse single:', r.c1init, 'twin has initial:', r.c1twinInit);
  log('CHECK2 v1 wide:', JSON.stringify(r.c2), 'status:', r.c2status);
  log('CHECK2 v2 side+1:', JSON.stringify(r.v2p), 'side-1:', JSON.stringify(r.v2m));
  log('CHECK4 iow:', JSON.stringify(r.c4));
  log('CHECK5 readouts:', JSON.stringify(r.c5));
  log('CHECK8 root crack scan [x, path, amp]:', JSON.stringify(r.c8), JSON.stringify(r.c8defect));
}
await ev(() => { UT.test.enterMode('weld'); });
await shot('final');
log('TOTAL ERRORS', errors.length);
if (errors.length) log(errors.join('\n'));
await browser.close();
process.exitCode = errors.length ? 1 : 0;
