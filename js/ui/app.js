/*
 * app.js  -  builds the page from the converter registry.
 *
 * Nothing in here knows about any particular converter.  It reads
 * CL.converters(), draws the sidebar, builds the controls from each
 * converter's `controls` array, calls simulate(params) and renders
 * whatever `panels`, `metrics`, `textbook` and `flow` come back.
 *
 * The URL hash carries the current settings, e.g.
 *   #/thy1?alpha=140&mode=rl&E=-100
 * so a configuration can be shared as a link.
 */
(function (g) {
  'use strict';
  const CL = g.CL;
  const $ = function (id) { return document.getElementById(id); };

  const state = { conv: null, p: {}, plots: [], plotKey: '', queued: false, ctlEls: {} };

  /* ------------------------------------------------------------- utilities */
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function decimals(step) { return step >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(step))); }
  function fmt(v, dec) {
    if (v === null || v === undefined || !isFinite(v)) return '\u2013';
    let s;
    if (dec !== null && dec !== undefined) s = v.toFixed(dec);
    else {
      const a = Math.abs(v);
      s = a < 0.0005 ? '0' : a >= 1000 ? v.toFixed(0) : a >= 100 ? v.toFixed(1) : a >= 10 ? v.toFixed(2) : v.toFixed(3);
    }
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '\u2212');
  }

  /* ----------------------------------------------------------------- theme */
  function initTheme() {
    let t = null;
    try { t = localStorage.getItem('igee401-theme'); } catch (e) { /* private mode */ }
    if (!t) t = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    setTheme(t);
    $('theme').addEventListener('click', function () {
      setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
      state.plots.forEach(function (p) { p.draw(); });
    });
  }
  function setTheme(t) {
    document.documentElement.dataset.theme = t;
    $('theme').textContent = t === 'dark' ? 'Use light theme' : 'Use dark theme';
    try { localStorage.setItem('igee401-theme', t); } catch (e) { /* ignore */ }
  }

  /* --------------------------------------------------------------- sidebar */
  function buildNav() {
    const nav = $('nav');
    nav.innerHTML = '';
    CL.groups().forEach(function (grp) {
      nav.appendChild(el('h2', 'navgroup', grp.name));
      const ul = el('ul');
      grp.items.forEach(function (c) {
        const li = el('li');
        const a = el('a');
        a.href = '#/' + c.id;
        a.dataset.id = c.id;
        a.textContent = c.title;
        li.appendChild(a);
        ul.appendChild(li);
      });
      nav.appendChild(ul);
    });
  }
  function markNav(id) {
    document.querySelectorAll('#nav a').forEach(function (a) {
      if (a.dataset.id === id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  /* --------------------------------------------------------------- routing */
  function parseHash() {
    const raw = (location.hash || '').replace(/^#\/?/, '');
    const parts = raw.split('?');
    return { id: parts[0], query: new URLSearchParams(parts[1] || '') };
  }
  function route() {
    const h = parseHash();
    const conv = CL.get(h.id) || CL.converters()[0];
    select(conv, h.query);
  }
  function writeHash() {
    const defs = CL.defaults(state.conv);
    const q = [];
    state.conv.controls.forEach(function (ct) {
      if (state.p[ct.key] !== defs[ct.key]) q.push(encodeURIComponent(ct.key) + '=' + encodeURIComponent(state.p[ct.key]));
    });
    const h = '#/' + state.conv.id + (q.length ? '?' + q.join('&') : '');
    if (location.hash !== h) history.replaceState(null, '', h);
  }

  function select(conv, query) {
    state.conv = conv;
    state.p = CL.defaults(conv);
    conv.controls.forEach(function (ct) {
      if (!query.has(ct.key)) return;
      const raw = query.get(ct.key);
      if (ct.type === 'seg') {
        const hit = ct.options.find(function (o) { return String(o[0]) === raw; });
        if (hit) state.p[ct.key] = hit[0];
      } else {
        const v = parseFloat(raw);
        if (isFinite(v)) state.p[ct.key] = clamp(v, ct.min, ct.max);
      }
    });
    markNav(conv.id);
    document.title = conv.title + ' | IGEE401 converter lab';
    $('title').textContent = conv.title;
    $('blurb').innerHTML = conv.blurb;
    const ul = $('assumptions-list');
    ul.innerHTML = '';
    conv.assumptions.forEach(function (a) { ul.appendChild(el('li', null, a)); });
    buildControls();
    buildPresets();
    update();
  }

  /* -------------------------------------------------------------- controls */
  function buildControls() {
    const host = $('controls');
    host.innerHTML = '';
    state.ctlEls = {};
    state.conv.controls.forEach(function (ct) {
      const wrap = el('div', 'ctl');
      wrap.dataset.key = ct.key;
      if (ct.type === 'seg') {
        wrap.classList.add('ctl-seg');
        const lab = el('div', 'lab', ct.label);
        lab.id = 'lab-' + ct.key;
        const grp = el('div', 'seg');
        grp.setAttribute('role', 'radiogroup');
        grp.setAttribute('aria-labelledby', lab.id);
        const btns = ct.options.map(function (o) {
          const b = el('button', null, o[1]);
          b.type = 'button';
          b.setAttribute('role', 'radio');
          b.addEventListener('click', function () { setParam(ct.key, o[0]); });
          grp.appendChild(b);
          return { b: b, v: o[0] };
        });
        wrap.appendChild(lab);
        wrap.appendChild(grp);
        state.ctlEls[ct.key] = { wrap: wrap, btns: btns };
      } else {
        const dec = decimals(ct.step);
        const row = el('div', 'row');
        const lab = el('label', null, ct.label);
        lab.htmlFor = 'in-' + ct.key;
        const val = el('span', 'val');
        const num = el('input');
        num.type = 'number'; num.id = 'in-' + ct.key;
        num.min = ct.min; num.max = ct.max; num.step = ct.step;
        const unit = el('span', 'unit', ct.unit || '');
        val.appendChild(num); val.appendChild(unit);
        row.appendChild(lab); row.appendChild(val);
        const rng = el('input');
        rng.type = 'range'; rng.min = ct.min; rng.max = ct.max; rng.step = ct.step;
        rng.setAttribute('aria-label', ct.label.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ''));
        rng.addEventListener('input', function () { setParam(ct.key, parseFloat(rng.value)); });
        num.addEventListener('change', function () {
          const v = parseFloat(num.value);
          setParam(ct.key, isFinite(v) ? clamp(v, ct.min, ct.max) : state.p[ct.key]);
        });
        wrap.appendChild(row);
        wrap.appendChild(rng);
        if (ct.hint) wrap.appendChild(el('p', 'hint', ct.hint));
        state.ctlEls[ct.key] = { wrap: wrap, num: num, rng: rng, dec: dec };
      }
      host.appendChild(wrap);
    });
    syncControls();
  }

  function syncControls() {
    state.conv.controls.forEach(function (ct) {
      const e = state.ctlEls[ct.key];
      const v = state.p[ct.key];
      if (ct.type === 'seg') {
        e.btns.forEach(function (b) { b.b.setAttribute('aria-checked', String(b.v === v)); });
      } else {
        e.rng.value = v;
        if (document.activeElement !== e.num) e.num.value = +v.toFixed(e.dec);
      }
      e.wrap.hidden = ct.showIf ? !ct.showIf(state.p) : false;
    });
  }

  function setParam(key, v) {
    state.p[key] = v;
    syncControls();
    update();
  }

  function buildPresets() {
    const host = $('presets');
    host.innerHTML = '';
    (state.conv.presets || []).forEach(function (pr) {
      const b = el('button', 'chip', pr.name);
      b.type = 'button';
      b.addEventListener('click', function () {
        state.p = CL.defaults(state.conv);
        Object.keys(pr.set).forEach(function (k) {
          const ct = state.conv.controls.find(function (c) { return c.key === k; });
          state.p[k] = ct && ct.type !== 'seg' ? clamp(pr.set[k], ct.min, ct.max) : pr.set[k];
        });
        syncControls();
        update();
      });
      host.appendChild(b);
    });
  }

  /* ------------------------------------------------------------ simulation */
  function update() {
    if (state.queued) return;
    state.queued = true;
    requestAnimationFrame(function () { state.queued = false; run(); });
  }

  function run() {
    let res;
    try {
      res = state.conv.simulate(state.p);
    } catch (err) {
      console.error(err);
      $('error').hidden = false;
      $('error').textContent = 'The simulation failed for these settings (' + err.message + '). Change a parameter to try again.';
      return;
    }
    $('error').hidden = true;
    ensurePlots(res.panels);
    res.panels.forEach(function (pn, k) { state.plots[k].set(pn); });
    renderFlow(res);
    renderReadouts(res.metrics);
    renderTextbook(res);
    writeHash();
  }

  function ensurePlots(panels) {
    const key = state.conv.id + ':' + panels.length;
    if (state.plotKey === key) return;
    state.plotKey = key;
    const host = $('plots');
    host.innerHTML = '';
    host.dataset.count = panels.length;
    state.plots = panels.map(function (pn) {
      const fig = el('figure', 'plot');
      const cap = el('figcaption', null, pn.title + ' <span class="u">(' + pn.unit + ')</span>');
      const cv = el('canvas');
      cv.setAttribute('role', 'img');
      cv.setAttribute('aria-label', pn.title.replace(/<[^>]+>/g, '') + ' over one cycle, 0 to 360 degrees');
      fig.appendChild(cap); fig.appendChild(cv);
      host.appendChild(fig);
      return new CL.Plot(cv);
    });
  }

  /* ---------------------------------------------------------------- output */
  function renderFlow(res) {
    const f = $('flow');
    if (!res.flow) { f.hidden = true; return; }
    f.hidden = false;
    f.textContent = res.flow.text;
    f.dataset.kind = res.flow.kind;
  }

  function renderReadouts(m) {
    const host = $('readouts');
    let html = '';
    CL.METRIC_GROUPS.forEach(function (grp) {
      let rows = '';
      grp.rows.forEach(function (r) {
        const key = r[0];
        let v = m[key];
        if (v === undefined) return;
        if (v === null && key === 'alpha') return;
        const shown = typeof v === 'string' ? v : fmt(v, r[3]);
        rows += '<tr><th scope="row">' + r[1] + '</th><td>' + shown + '</td><td class="u">' + (typeof v === 'string' ? '' : r[2]) + '</td></tr>';
      });
      if (rows) html += '<section class="grp"><h3>' + grp.title + '</h3><table>' + rows + '</table></section>';
    });
    host.innerHTML = html;
  }

  function renderTextbook(res) {
    const host = $('textbook');
    const m = res.metrics;
    if (!res.textbook) {
      host.innerHTML = '<h3>Textbook check</h3><p class="note">' +
        (res.textbookNote || 'Closed-form values are not available for these settings.') + '</p>';
      return;
    }
    let rows = '';
    res.textbook.forEach(function (t) {
      const sim = t.sim !== undefined ? m[t.sim] : undefined;
      let tag = '';
      if (sim !== undefined && sim !== null) {
        const tol = Math.max(0.005 * Math.abs(t.value), 0.06);
        tag = Math.abs(sim - t.value) <= tol ? '<span class="ok">matches</span>' : '<span class="off">differs</span>';
      }
      rows += '<tr><th scope="row">' + t.label + '</th><td>' + fmt(t.value, t.dec) + ' <span class="u">' + (t.unit || '') + '</span></td><td>' +
        (sim !== undefined && sim !== null ? fmt(sim, t.dec) : '') + '</td><td>' + tag + '</td></tr>';
    });
    host.innerHTML = '<h3>Textbook check</h3><table class="tb"><thead><tr><th scope="col">Formula</th><th scope="col">Value</th><th scope="col">Simulated</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  /* ---------------------------------------------------------------- start */
  function copyLink() {
    const done = function () {
      const s = $('status');
      s.textContent = 'Link copied';
      setTimeout(function () { s.textContent = ''; }, 2200);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(location.href).then(done, done);
    else done();
  }

  function init() {
    buildNav();
    initTheme();
    $('copy').addEventListener('click', copyLink);
    window.addEventListener('hashchange', route);
    route();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(window);
