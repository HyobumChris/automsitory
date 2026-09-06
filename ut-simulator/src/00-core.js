/* 00-core.js — UT namespace, constants, math, event bus, state store, DOM helpers, test API stub.
 * Loaded first. Classic script (no modules). Nothing here touches the DOM at load time.
 */
(function (UT) {
  'use strict';

  UT.VERSION = '1.0.0';

  // ------------------------------------------------------------------ constants
  UT.consts = {
    V_SHEAR_STEEL: 3.24,   // mm/us
    V_COMP_STEEL: 5.90,    // mm/us
    V_PERSPEX: 2.74,       // mm/us (longitudinal, wedge/shoe)
    V_WATER: 1.48,
    PROBE_COLOURS: { 0: '#ff00ff', 45: '#ffff00', 60: '#00c000', 70: '#0000ff', pa: '#ff8800' },
    LEG_COLOURS: ['#e00000', '#0040ff', '#00a000', '#ff8800'],            // propagation colour code, leg 1..4
    SURFACE_COLOURS: { bottom: '#0040ff', top: '#e00000', end: '#00a000', radius: '#00a000', cap: '#ff8800', root: '#ff8800', step: '#00a000', brace: '#a000a0', fusion: '#ff8800' },
    COLOURS: {
      cream: '#fdfbd8', steel: '#8c8c8c', steelDark: '#6e6e6e', weldHatch: '#5c5c5c', defect: '#e00000',
      hole: '#ffffff', perspex: '#bfe3ff', ruler: '#111111', beamFan: 'rgba(255,255,255,0.35)',
      ascanBg: '#000000', ascanGrid: '#1f5f1f', ascanTrace: '#22e022', gate: '#ff2020', dac: '#ffd21e',
      uskBg: '#0b1fa8', uskGrid: '#3a52d8', uskTrace: '#7ff7ff',
    },
  };

  // ------------------------------------------------------------------ math
  const DEG = Math.PI / 180;
  const math = {
    clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; },
    lerp(a, b, t) { return a + (b - a) * t; },
    deg2rad(d) { return d * DEG; },
    rad2deg(r) { return r / DEG; },
    dist(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return Math.sqrt(dx * dx + dy * dy); },
    /** Snell: returns refracted angle (deg) in medium 2, or null beyond the critical angle. */
    snellAngle(theta1Deg, v1, v2) {
      const s = Math.sin(theta1Deg * DEG) * v2 / v1;
      if (s >= 1 || s <= -1) return null;
      return Math.asin(s) / DEG;
    },
    dB2lin(db) { return Math.pow(10, db / 20); },
    lin2dB(lin) { return lin > 0 ? 20 * Math.log10(lin) : -120; },
    /** Un-normalised Gaussian exp(-x^2 / (2 sigma^2)). */
    gaussian(x, sigma) { return Math.exp(-(x * x) / (2 * sigma * sigma)); },
    /** Beam-profile weight w(delta) = exp(-ln2 (delta/theta6)^2): 0.5 at theta6. */
    beamWeight(deltaDeg, theta6Deg) { const r = deltaDeg / Math.max(theta6Deg, 1e-6); return Math.exp(-Math.LN2 * r * r); },
    /** One-way directivity weight w(delta) = 10^(-1/2 (delta/theta20)^2): -10 dB at theta20 (pulse-echo -20 dB). */
    beamWeight20(deltaDeg, theta20Deg) { const r = deltaDeg / Math.max(theta20Deg, 1e-6); return Math.pow(10, -0.5 * r * r); },
    /** Skew loss for planar/geometry reflectors: max(0.05, exp(-ln2 (skew/6)^2)). */
    skewWeight(skewDeg) { const r = skewDeg / 6; return Math.max(0.05, Math.exp(-Math.LN2 * r * r)); },
    fmt(num, dp) { return (num === null || num === undefined || Number.isNaN(num)) ? '--' : Number(num).toFixed(dp === undefined ? 1 : dp); },
    /** Fixed-width EPOCH style number: fmt2(5.51) -> '05.51'. */
    fmt2(num) { if (num === null || num === undefined || Number.isNaN(num)) return '--.--'; const s = Math.abs(num).toFixed(2); return (num < 0 ? '-' : '') + (s.length < 5 ? '0' + s : s); },
    /** Overlap length of intervals [a0,a1] and [b0,b1] (0 if disjoint). */
    overlap(a0, a1, b0, b1) { return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)); },
    /** Seeded LCG in [0,1). */
    rng(seed) { let s = (seed >>> 0) || 1; return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; },
    /** Segment intersection: ray (p, d) with segment a-b. Returns {t, u, x, y} or null. t = ray distance (>= eps). */
    raySegment(px, py, dx, dy, ax, ay, bx, by, eps) {
      const ex = bx - ax, ey = by - ay;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) return null;
      const t = ((ax - px) * ey - (ay - py) * ex) / den;
      const u = ((ax - px) * dy - (ay - py) * dx) / den;
      if (t < (eps === undefined ? 1e-6 : eps) || u < 0 || u > 1) return null;
      return { t, u, x: px + dx * t, y: py + dy * t };
    },
    /** Ray (p, d) with circle (c, r): nearest positive t or null. */
    rayCircle(px, py, dx, dy, cx, cy, r, eps) {
      const fx = px - cx, fy = py - cy;
      const a = dx * dx + dy * dy, b = 2 * (fx * dx + fy * dy), c = fx * fx + fy * fy - r * r;
      const disc = b * b - 4 * a * c;
      if (disc < 0) return null;
      const sq = Math.sqrt(disc);
      const e = eps === undefined ? 1e-6 : eps;
      let t = (-b - sq) / (2 * a);
      if (t < e) t = (-b + sq) / (2 * a);
      if (t < e) return null;
      return { t, x: px + dx * t, y: py + dy * t };
    },
    /** Distance from point p to segment a-b and the foot parameter u in [0,1]. */
    pointSegment(px, py, ax, ay, bx, by) {
      const ex = bx - ax, ey = by - ay;
      const len2 = ex * ex + ey * ey;
      let u = len2 > 0 ? ((px - ax) * ex + (py - ay) * ey) / len2 : 0;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const x = ax + ex * u, y = ay + ey * u;
      return { d: Math.sqrt((px - x) * (px - x) + (py - y) * (py - y)), u, x, y };
    },
    /** Point in polygon (array of {x,y}). */
    pointInPolygon(x, y, poly) {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
        const hit = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (hit) inside = !inside;
      }
      return inside;
    },
    /** Angle (deg, 0..180) between two direction vectors. */
    angleBetween(ax, ay, bx, by) {
      const la = Math.hypot(ax, ay) || 1, lb = Math.hypot(bx, by) || 1;
      return Math.acos(math.clamp((ax * bx + ay * by) / (la * lb), -1, 1)) / DEG;
    },
  };
  UT.math = math;

  let _uid = 1;
  UT.uid = function () { return _uid++; };
  UT.clone = function (obj) { return obj === undefined ? undefined : JSON.parse(JSON.stringify(obj)); };

  // ------------------------------------------------------------------ event bus
  const listeners = new Map();
  UT.bus = {
    on(evt, fn) { if (!listeners.has(evt)) listeners.set(evt, []); listeners.get(evt).push(fn); return fn; },
    off(evt, fn) { const l = listeners.get(evt); if (!l) return; const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); },
    emit(evt, payload) {
      const l = listeners.get(evt);
      if (!l) return;
      for (const fn of l.slice()) {
        try { fn(payload); } catch (e) { console.error('[UT.bus]', evt, e); }
      }
    },
  };

  // ------------------------------------------------------------------ state
  UT.defaultState = function () {
    return {
      mode: 'weld',
      utSet: 'epoch600',
      specimen: null,               // set by UT.modes / UT.app at boot via UT.specimens.plateWeld()
      probe: {
        angle: 60, mode: 'shear', crystal: 'single', freq: 5, diameter: 10,
        wedgeVel: 2.74, method: 'pe',
        x: 40, z: 150, side: 1, skew: 0, surface: 'chord',
        paFrom: 40, paTo: 70, paStep: 1,
      },
      instrument: {
        gain: 30, refGain: 30, range: 100, delay: 0, reject: 0, damping: false,
        rectify: 'full', freeze: false, peakMem: false,
        gates: [
          { on: true, start: 10, width: 60, level: 20, alarm: false },
          { on: false, start: 70, width: 20, level: 40, alarm: false },
        ],
        activeGate: 0,
        dac: { points: [], on: false, refDb: null, curves: true },
        cal: { vel: null, zero: 0 },   // vel null = vTrue; zero (us) relative to the wedge-zeroed time; auto-cal sets numbers
        trig: { angle: 60, thick: 20, xValue: 0 },   // instrument trigonometry settings used for SD/DP/leg readouts
        page: 1,
        readout: 'dp',                 // which readout is shown big on EPOCH 600: 'sp' | 'sd' | 'dp' | 'amp'
        selectedParam: 'gain',         // softkey parameter being adjusted
      },
      display: {
        beam: true, skips: 3, colourCode: 'none', singleLine: false, focus: false,
        hide: false, plan: true, pipe3d: true, mirror: true, units: 'mm', legend: true, grid: true, autoTrig: true,
      },
      weldOpts: { T: 20, L: 300, type: 'single-v', bevel: 30, rootGap: 2, rootFace: 2, capWidth: 16, capHeight: 2, rootHeight: 1.5, pipe: false, od: 168.3, wt: 20 },
      defects: [],
      selectedDefect: 0,
      tofd: { pcs: 60, txAngle: 60, rangeUs: 15, delayUs: 0, gainDb: 40, scan: null, running: false },
      aut: {
        x: 40,
        gates: [
          { on: true, start: 20, width: 40, level: 20 },
          { on: true, start: 30, width: 30, level: 20 },
          { on: false, start: 40, width: 20, level: 20 },
        ],
        activeGate: 0, scan: null, running: false, rectified: true, revMap: false,
      },
      plot: { points: [], edgeMarks: [], mirror: true, refPct: 80, cardStyle: 'iow' },
      sizing: { method: '6dB', marks: [], result: null },
      trade: { active: false, revealed: false, report: [], score: null, seed: null, startedAt: null, truth: [] },
      lesson: null,
      status: { left: '', mid: '', right: '' },
      cursor: { x: null, y: null, view: null },
      editing: { defect: false, brush: 'planar' },   // cross-section brush active when defect editor open
    };
  };
  UT.state = UT.defaultState();

  let _dirty = false;
  let _rafPending = false;
  const _hasRAF = typeof requestAnimationFrame === 'function';

  /** Shallow-merge patch into UT.state (nested objects are REPLACED), mark dirty, emit 'state'. */
  UT.set = function (patch, opts) {
    const keys = Object.keys(patch || {});
    for (const k of keys) UT.state[k] = patch[k];
    _dirty = true;
    if (!(opts && opts.silent)) UT.bus.emit('state', { keys, patch });
    if (!(opts && opts.noRender)) UT.requestRender();
    return UT.state;
  };
  /** Convenience: patch a nested object one level down, e.g. UT.setIn('instrument', {gain: 40}). */
  UT.setIn = function (key, patch, opts) {
    const next = Object.assign({}, UT.state[key], patch);
    const p = {}; p[key] = next;
    return UT.set(p, opts);
  };

  UT.frame = { rays: null, echoes: [], ascan: null, readouts: null, ts: 0 };
  UT.compute = function () { /* replaced by 40-ascan.js */ return UT.frame; };

  UT.requestRender = function () {
    if (_rafPending) return;
    _rafPending = true;
    const run = function () {
      _rafPending = false;
      try {
        if (_dirty || !UT.frame.ts) {
          _dirty = false;
          if (!UT.state.instrument.freeze || !UT.frame.ts) UT.compute();
        }
        UT.bus.emit('render', UT.frame);
      } catch (e) { console.error('[UT.render]', e); }
    };
    if (_hasRAF) requestAnimationFrame(run); else setTimeout(run, 0);
  };
  /** Synchronous recompute + render (used by the test API and scans). */
  UT.renderNow = function () { _dirty = false; UT.compute(); UT.bus.emit('render', UT.frame); return UT.frame; };

  // ------------------------------------------------------------------ i18n
  const dict = {
    ko: {
      'File': '파일', 'Probes': '탐촉자', 'Step Wedge': '스텝 웨지', 'Weld': '용접부', 'Defects': '결함', 'Options': '옵션', 'Help': '도움말',
      'LEFT mouse button/drag to move the UT Probe': '마우스 왼쪽 버튼 드래그로 탐촉자를 이동하세요',
      'LEFT mouse button/drag to draw defect.': '마우스 왼쪽 버튼 드래그로 결함을 그리세요.',
      'Set Amplitude and press record button, then draw curves': '진폭을 맞춘 뒤 Record를 누르고 커브를 그리세요',
      'Lessons': '레슨', 'Trade Test': '실기 시험', 'Start': '시작', 'Reveal': '정답 공개', 'Submit': '제출',
    },
  };
  UT.i18n = {
    lang: 'en',
    t(key) { const d = dict[UT.i18n.lang]; return (d && d[key]) || key; },
    add(lang, entries) { dict[lang] = Object.assign(dict[lang] || {}, entries); },
  };

  // ------------------------------------------------------------------ DOM helpers
  const dom = {
    /** h('div', {class:'x', onclick: fn, dataset:{a:1}, style:{...}}, [children | strings]) */
    h(tag, attrs, children) {
      const el = document.createElement(tag);
      if (attrs) {
        for (const k of Object.keys(attrs)) {
          const v = attrs[k];
          if (v === null || v === undefined || v === false) continue;
          if (k === 'class' || k === 'className') el.className = v;
          else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
          else if (k === 'dataset' && typeof v === 'object') Object.assign(el.dataset, v);
          else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
          else if (k === 'text') el.textContent = v;
          else if (k === 'html') el.innerHTML = v;   // only for trusted, module-authored markup
          else if (v === true) el.setAttribute(k, '');
          else el.setAttribute(k, String(v));
        }
      }
      const kids = Array.isArray(children) ? children : (children === undefined ? [] : [children]);
      for (const c of kids) {
        if (c === null || c === undefined || c === false) continue;
        el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
      }
      return el;
    },
    /** Size a canvas to its CSS box × devicePixelRatio and return a ctx scaled to CSS pixels. */
    fitCanvas(canvas, cssW, cssH) {
      const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
      const w = cssW || canvas.clientWidth || canvas.width || 300;
      const h = cssH || canvas.clientHeight || canvas.height || 150;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return ctx;
    },
    cssSize(canvas) { return { w: canvas.clientWidth || canvas.width, h: canvas.clientHeight || canvas.height }; },
    /** Mouse/touch position in CSS px relative to element. */
    localPos(ev, el) {
      const r = el.getBoundingClientRect();
      const p = ev.touches && ev.touches[0] ? ev.touches[0] : ev;
      return { x: p.clientX - r.left, y: p.clientY - r.top };
    },
    button(label, onClick, attrs) {
      return dom.h('button', Object.assign({ class: 'btn', type: 'button', onclick: onClick }, attrs || {}), label);
    },
    /** Labelled numeric/text input row: field('Gain', {type:'number', value: 30, min:0, max:110, step:1, onchange}) */
    field(label, opts) {
      const o = opts || {};
      const input = dom.h(o.tag || 'input', Object.assign({ class: 'fld-input', type: o.type || 'number' }, o.attrs || {}));
      if (o.type !== 'checkbox') input.value = o.value === undefined ? '' : o.value; else input.checked = !!o.value;
      if (o.min !== undefined) input.min = o.min;
      if (o.max !== undefined) input.max = o.max;
      if (o.step !== undefined) input.step = o.step;
      if (o.options) { for (const opt of o.options) input.appendChild(dom.h('option', { value: opt.value === undefined ? opt : opt.value, selected: String(opt.value === undefined ? opt : opt.value) === String(o.value) ? true : null }, opt.label === undefined ? String(opt) : opt.label)); }
      if (o.onchange) input.addEventListener(o.event || 'change', function (e) { o.onchange(o.type === 'checkbox' ? input.checked : (o.type === 'number' ? parseFloat(input.value) : input.value), e); });
      const row = dom.h('label', { class: 'fld', title: o.title || null }, [dom.h('span', { class: 'fld-label' }, label), input]);
      row.input = input;
      return row;
    },
    /** Custom confirm dialog → Promise<boolean>. */
    confirm(message, opts) {
      return new Promise(function (resolve) {
        const o = opts || {};
        let win;
        const done = function (v) { win.close(); resolve(v); };
        win = dom.win({
          name: 'confirm-' + UT.uid(), title: o.title || 'Confirm', modal: true, w: 320,
          content: dom.h('div', { class: 'confirm-body' }, [
            dom.h('p', {}, message),
            dom.h('div', { class: 'btn-row' }, [dom.button(o.ok || 'OK', function () { done(true); }, { class: 'btn primary' }), dom.button(o.cancel || 'Cancel', function () { done(false); })]),
          ]),
          onClose: function () { resolve(false); },
        });
        win.show();
      });
    },
    /** Simple message dialog. */
    alert(message, title) {
      const win = dom.win({ name: 'alert-' + UT.uid(), title: title || 'UTsim', modal: true, w: 360,
        content: dom.h('div', { class: 'confirm-body' }, [dom.h('div', { class: 'alert-msg' }, message), dom.h('div', { class: 'btn-row' }, [dom.button('OK', function () { win.close(); }, { class: 'btn primary' })])]) });
      win.show();
      return win;
    },
    wins: {},
    _z: 100,
    /**
     * Floating, draggable Win-classic style window.
     * dom.win({name, title, x, y, w, h, content: Element|() => Element, onClose, onShow, modal, resizable})
     * → { el, body, show(), hide(), toggle(), close(), setTitle(), setContent(), isOpen(), raise() }
     * Windows are appended to #app (or document.body) on first show. Registry: dom.wins[name].
     */
    win(o) {
      const name = o.name || ('win-' + UT.uid());
      if (dom.wins[name] && !o.replace) { const existing = dom.wins[name]; if (o.content) existing.setContent(o.content); return existing; }
      const titleEl = dom.h('span', { class: 'win-title-text' }, o.title || name);
      const closeBtn = dom.h('button', { class: 'win-close', type: 'button', title: 'Close' }, '✕');
      const titleBar = dom.h('div', { class: 'win-title' }, [titleEl, closeBtn]);
      const body = dom.h('div', { class: 'win-body' });
      const el = dom.h('div', { class: 'win' + (o.modal ? ' modal' : '') + (o.class ? ' ' + o.class : ''), dataset: { win: name }, style: { left: (o.x === undefined ? 200 : o.x) + 'px', top: (o.y === undefined ? 120 : o.y) + 'px', width: o.w ? o.w + 'px' : null, height: o.h ? o.h + 'px' : null, display: 'none' } }, [titleBar, body]);
      let backdrop = null;
      const api = {
        el, body, name,
        isOpen() { return el.style.display !== 'none'; },
        raise() { el.style.zIndex = String(++dom._z); },
        setTitle(t) { titleEl.textContent = t; },
        setContent(c) { body.textContent = ''; const node = typeof c === 'function' ? c(api) : c; if (node) body.appendChild(node); },
        show() {
          if (!el.parentNode) { (document.getElementById('app') || document.body).appendChild(el); }
          if (o.modal && !backdrop) { backdrop = dom.h('div', { class: 'win-backdrop' }); el.parentNode.insertBefore(backdrop, el); }
          if (backdrop) backdrop.style.display = 'block';
          el.style.display = 'block';
          api.raise();
          // keep inside viewport
          const r = el.getBoundingClientRect();
          if (r.right > window.innerWidth) el.style.left = Math.max(0, window.innerWidth - r.width - 8) + 'px';
          if (r.bottom > window.innerHeight) el.style.top = Math.max(0, window.innerHeight - r.height - 8) + 'px';
          if (o.onShow) o.onShow(api);
          UT.bus.emit('win:show', api);
          return api;
        },
        hide() { el.style.display = 'none'; if (backdrop) backdrop.style.display = 'none'; UT.bus.emit('win:hide', api); return api; },
        toggle() { return api.isOpen() ? api.hide() : api.show(); },
        close() { api.hide(); if (o.onClose) o.onClose(api); UT.bus.emit('win:close', api); return api; },
        destroy() { api.hide(); if (el.parentNode) el.parentNode.removeChild(el); if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop); delete dom.wins[name]; },
      };
      closeBtn.addEventListener('click', function (e) { e.stopPropagation(); api.close(); });
      el.addEventListener('mousedown', function () { api.raise(); });
      // drag by title bar
      let drag = null;
      titleBar.addEventListener('mousedown', function (e) {
        if (e.target === closeBtn) return;
        drag = { dx: e.clientX - el.offsetLeft, dy: e.clientY - el.offsetTop };
        e.preventDefault();
      });
      window.addEventListener('mousemove', function (e) {
        if (!drag) return;
        el.style.left = Math.max(0, e.clientX - drag.dx) + 'px';
        el.style.top = Math.max(0, e.clientY - drag.dy) + 'px';
      });
      window.addEventListener('mouseup', function () { drag = null; });
      if (o.content) api.setContent(o.content);
      dom.wins[name] = api;
      return api;
    },
    /** Idempotently inject a module CSS string as <style id="css-<name>">. */
    injectCss(name, cssText) {
      if (typeof document === 'undefined' || !cssText) return null;
      const id = 'css-' + name;
      let el = document.getElementById(id);
      if (!el) { el = document.createElement('style'); el.id = id; (document.head || document.body).appendChild(el); }
      if (el.textContent !== cssText) el.textContent = cssText;
      return el;
    },
    /** Close the top-most open window (Esc). Returns true if one was closed. */
    closeTopWindow() {
      let top = null, z = -1;
      for (const k of Object.keys(dom.wins)) { const w = dom.wins[k]; if (w.isOpen() && +w.el.style.zIndex > z) { z = +w.el.style.zIndex; top = w; } }
      if (top) { top.close(); return true; }
      return false;
    },
  };
  UT.dom = dom;

  // ------------------------------------------------------------------ status helper
  UT.status = function (patch) { UT.setIn('status', patch, { noRender: true }); UT.bus.emit('status', UT.state.status); };

  // ------------------------------------------------------------------ test API stub (filled by modules)
  UT.test = { version: UT.VERSION };
  UT.test.state = function () {
    const s = Object.assign({}, UT.state);
    s.tofd = Object.assign({}, s.tofd, { scan: null });
    s.aut = Object.assign({}, s.aut, { scan: null });
    s.specimen = s.specimen ? { id: s.specimen.id, name: s.specimen.name, T: s.specimen.T, L: s.specimen.L, face: s.specimen.face || null, kind: s.specimen.kind } : null;
    return UT.clone(s);
  };
  /** Length formatter honouring display.units ('mm' | 'inch'). */
  UT.fmtLen = function (mm, dp) {
    if (mm === null || mm === undefined || Number.isNaN(mm)) return '--';
    if (UT.state.display && UT.state.display.units === 'inch') return (mm / 25.4).toFixed(dp === undefined ? 3 : dp) + '"';
    return math.fmt(mm, dp === undefined ? 1 : dp) + ' mm';
  };

  // ------------------------------------------------------------------ self test
  UT.core = {
    __selftest() {
      const f = [];
      const a = math.snellAngle(47.1, 2.74, 3.24);
      if (Math.abs(a - 60) > 0.2) f.push('snell 47.1->60 got ' + a);
      if (math.snellAngle(80, 2.74, 5.9) !== null) f.push('critical angle not detected');
      if (Math.abs(math.beamWeight(5, 5) - 0.5) > 1e-9) f.push('beamWeight(θ6) != 0.5');
      if (Math.abs(math.beamWeight20(4, 4) - Math.sqrt(0.1)) > 1e-9) f.push('beamWeight20(θ20) != -10 dB');
      const hit = math.raySegment(0, 0, 0, 1, -1, 10, 1, 10);
      if (!hit || Math.abs(hit.t - 10) > 1e-9) f.push('raySegment');
      const c = math.rayCircle(0, 0, 0, 1, 0, 10, 2);
      if (!c || Math.abs(c.t - 8) > 1e-9) f.push('rayCircle');
      if (!math.pointInPolygon(1, 1, [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }])) f.push('pointInPolygon');
      if (math.fmt2(5.51) !== '05.51') f.push('fmt2');
      return f;
    },
  };
})(window.UT = window.UT || {});
