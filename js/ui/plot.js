/*
 * plot.js  -  tiny canvas plotter for one-cycle waveforms (0 to 360 deg).
 *
 * spec = {
 *   unit:   'V',
 *   traces: [{ name, y: Float64Array, color: 'voltage', dash:[..], width, fill:true }],
 *   hlines: [{ y, name, color }],           horizontal reference lines (averages)
 *   markers:[{ x: radians, label }]         vertical reference lines (alpha, ...)
 * }
 * Colours are CSS variables named --tr-<color>, so light and dark themes
 * change the plot without any JavaScript knowing about them.
 */
(function (g) {
  'use strict';
  const CL = g.CL;
  const R2D = 180 / Math.PI;

  function css(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }
  function niceStep(range, target) {
    const raw = range / target;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / p;
    return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
  }
  function fmt(v) {
    if (!isFinite(v)) return '-';
    const a = Math.abs(v);
    if (a < 5e-4) return '0';
    const s = a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : v.toFixed(2);
    return s.replace(/\.?0+$/, function (m) { return m.indexOf('.') === 0 ? '' : m; });
  }
  function tickLabel(v, step) {
    if (Math.abs(v) < step * 1e-6) return '0';
    const dec = step >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(step)));
    return v.toFixed(dec);
  }

  function Plot(canvas) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.spec = null;
    this.hoverX = null;
    const self = this;
    canvas.addEventListener('pointermove', function (e) {
      self.hoverX = e.clientX - canvas.getBoundingClientRect().left;
      self.draw();
    });
    canvas.addEventListener('pointerleave', function () { self.hoverX = null; self.draw(); });
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(function () { self.draw(); }).observe(canvas);
  }

  Plot.prototype.set = function (spec) { this.spec = spec; this.draw(); };

  Plot.prototype.draw = function () {
    const c = this.c, ctx = this.ctx, spec = this.spec;
    const w = c.clientWidth, h = c.clientHeight;
    if (!spec || !w || !h) return;
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const col = {
      ink: css('--ink', '#14202b'), ink2: css('--ink-2', '#4a5864'),
      grid: css('--grid', '#e2e8e3'), axis: css('--axis', '#9aa6a0'), panel: css('--panel', '#fff')
    };
    const colorOf = function (k) { return css('--tr-' + k, col.ink); };

    const L = 50, R = 14, T = 10, B = 24;
    const pw = w - L - R, ph = h - T - B;

    // ---- y range -------------------------------------------------------
    let lo = 0, hi = 0;
    spec.traces.forEach(function (t) {
      for (let n = 0; n < t.y.length; n++) { if (t.y[n] < lo) lo = t.y[n]; if (t.y[n] > hi) hi = t.y[n]; }
    });
    (spec.hlines || []).forEach(function (l) { lo = Math.min(lo, l.y); hi = Math.max(hi, l.y); });
    if (hi - lo < 1e-9) { hi = 1; lo = -1; }
    const pad = 0.08 * (hi - lo);
    hi += pad; if (lo < 0) lo -= pad;
    const step = niceStep(hi - lo, 4);
    const X = function (rad) { return L + (rad * R2D / 360) * pw; };
    const Y = function (v) { return T + (1 - (v - lo) / (hi - lo)) * ph; };

    // ---- graticule -----------------------------------------------------
    ctx.lineWidth = 1;
    ctx.font = '11px ' + css('--font', 'system-ui, sans-serif');
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    ctx.fillStyle = col.ink2;
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
      const y = Math.round(Y(v)) + 0.5;
      ctx.strokeStyle = col.grid;
      ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(L + pw, y); ctx.stroke();
      ctx.fillText(tickLabel(v, step), L - 7, y);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let d = 0; d <= 360; d += 30) {
      const x = Math.round(L + (d / 360) * pw) + 0.5;
      ctx.strokeStyle = col.grid;
      ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, T + ph); ctx.stroke();
      if (d % 90 === 0) ctx.fillText(d + '\u00b0', Math.min(Math.max(x, L + 8), L + pw - 8), T + ph + 6);
    }
    // zero line and frame
    if (lo < 0 && hi > 0) {
      ctx.strokeStyle = col.axis; ctx.lineWidth = 1.2;
      const y0 = Math.round(Y(0)) + 0.5;
      ctx.beginPath(); ctx.moveTo(L, y0); ctx.lineTo(L + pw, y0); ctx.stroke();
    }
    ctx.strokeStyle = col.axis; ctx.lineWidth = 1;
    ctx.strokeRect(L + 0.5, T + 0.5, pw, ph);

    // ---- markers (alpha, pi+alpha ...) -----------------------------------
    (spec.markers || []).forEach(function (m) {
      const a = CL.mod2pi(m.x);
      const x = X(a);
      ctx.save();
      ctx.setLineDash([4, 4]); ctx.strokeStyle = col.ink2; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, T + ph); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = col.ink2;
      ctx.textAlign = x > L + pw - 60 ? 'right' : 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(m.label, x + (ctx.textAlign === 'left' ? 4 : -4), T + ph - 3);
    });

    // ---- fills, then lines ------------------------------------------------
    const nS = spec.traces.length;
    const poly = function (t) {
      ctx.beginPath();
      for (let n = 0; n < t.y.length; n++) {
        const x = L + ((CL.theta[n] * R2D) / 360) * pw, y = Y(t.y[n]);
        if (n === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
    };
    spec.traces.forEach(function (t) {
      if (!t.fill) return;
      ctx.save();
      ctx.beginPath(); ctx.rect(L, T, pw, ph); ctx.clip();
      poly(t);
      ctx.lineTo(L + pw, Y(0)); ctx.lineTo(L, Y(0)); ctx.closePath();
      ctx.globalAlpha = 0.16; ctx.fillStyle = colorOf(t.color); ctx.fill();
      ctx.restore();
    });
    (spec.hlines || []).forEach(function (l) {
      ctx.save();
      ctx.setLineDash([2, 3]); ctx.strokeStyle = colorOf(l.color || 'ink'); ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(L, Y(l.y)); ctx.lineTo(L + pw, Y(l.y)); ctx.stroke();
      ctx.restore();
    });
    ctx.save();
    ctx.beginPath(); ctx.rect(L, T, pw, ph); ctx.clip();
    spec.traces.forEach(function (t) {
      poly(t);
      ctx.setLineDash(t.dash || []);
      ctx.strokeStyle = colorOf(t.color);
      ctx.lineWidth = t.width || 2;
      ctx.lineJoin = 'round';
      ctx.stroke();
    });
    ctx.restore();

    // ---- legend ------------------------------------------------------------
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    let lx = L + 10;
    const ly = T + 12;
    const entries = spec.traces.map(function (t) { return { name: t.name, color: t.color, dash: t.dash, width: t.width }; })
      .concat((spec.hlines || []).map(function (l) { return { name: l.name, color: l.color || 'ink', dash: [2, 3], width: 1.4 }; }));
    entries.forEach(function (e) {
      const nice = e.name;
      ctx.save();
      ctx.setLineDash(e.dash || []); ctx.strokeStyle = colorOf(e.color); ctx.lineWidth = e.width || 2;
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 16, ly); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = col.ink;
      ctx.fillText(nice, lx + 21, ly);
      lx += 21 + ctx.measureText(nice).width + 14;
    });

    // ---- hover ---------------------------------------------------------------
    if (this.hoverX !== null && this.hoverX >= L && this.hoverX <= L + pw) {
      const deg = ((this.hoverX - L) / pw) * 360;
      const n = Math.min(CL.N - 1, Math.max(0, Math.floor((deg / 360) * CL.N)));
      const x = this.hoverX;
      ctx.strokeStyle = col.ink; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + 0.5, T); ctx.lineTo(x + 0.5, T + ph); ctx.stroke();
      const lines = ['\u03b8 = ' + deg.toFixed(1) + '\u00b0'].concat(spec.traces.map(function (t) {
        return t.name.replace(/\s*\(.*\)/, '') + ' = ' + fmt(t.y[n]) + ' ' + spec.unit;
      }));
      ctx.font = '11px ' + css('--font', 'system-ui, sans-serif');
      let bw = 0;
      lines.forEach(function (s) { bw = Math.max(bw, ctx.measureText(s).width); });
      bw += 14;
      const bh = lines.length * 15 + 8;
      const bx = x + 12 + bw > L + pw ? x - 12 - bw : x + 12;
      const by = T + 28;
      ctx.fillStyle = col.panel; ctx.globalAlpha = 0.94;
      ctx.fillRect(bx, by, bw, bh);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = col.axis; ctx.strokeRect(bx + 0.5, by + 0.5, bw, bh);
      ctx.fillStyle = col.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      lines.forEach(function (s, k) { ctx.fillText(s, bx + 7, by + 12 + k * 15); });
    }
  };

  CL.Plot = Plot;
})(window);
