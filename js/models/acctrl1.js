/*
 * acctrl1.js  -  single-phase AC voltage controller (two anti-parallel
 * thyristors in series with an R-L load).
 *
 * The same engine, CL._engine1, is reused by the three-phase delta controller:
 * a delta controller is three of these, one per line voltage, shifted by 120.
 *
 * Gate model: T1 is gated for 180 deg starting at alpha, T2 for 180 deg
 * starting at pi + alpha ("wide gating").  A thyristor turns on when it is
 * gated and forward biased, and turns off when the load current reaches zero.
 * That reproduces both regimes of the textbook analysis:
 *   alpha <= phi : current is continuous and sinusoidal (the controller does nothing)
 *   alpha  > phi : current is discontinuous, conduction angle < 180 deg
 *
 *   phi = atan(omega L / R)
 */
(function (g) {
  'use strict';
  const CL = g.CL;
  const N = CL.N, TH = CL.theta, D2R = CL.D2R, R2D = 180 / Math.PI, PI = Math.PI;

  /**
   * o = { Vm, f, alpha (rad), phase0 (rad), R, L (henry) }
   * Source: v = Vm sin(theta + phase0).  alpha is measured from that
   * voltage's rising zero crossing.
   */
  function engine1(o) {
    const R = Math.max(o.R, 1e-3), L = o.L, f = o.f;
    const resistive = L < 1e-7;
    const v = CL.fill(function (th) { return o.Vm * Math.sin(th + o.phase0); });
    const gp = new Uint8Array(N);
    for (let n = 0; n < N; n++) gp[n] = CL.mod2pi(TH[n] + o.phase0 - o.alpha) < PI ? 1 : 0;

    const dt = 1 / (f * N);
    const decay = resistive ? 0 : Math.exp(-R * dt / L);
    const om = resistive ? 1 : -Math.expm1(-R * dt / L);
    const iArr = CL.zeros(), vo = CL.zeros();

    const run = function (x) {
      let i = x[0];
      let s = i > 1e-9 ? 1 : (i < -1e-9 ? -1 : 0);
      let off = false;
      for (let n = 0; n < N; n++) {
        const vs = v[n];
        if (s === 0) {
          if (gp[n] && vs > 0) s = 1;
          else if (!gp[n] && vs < 0) s = -1;
        }
        if (s === 0) off = true;
        let iNew = 0, iMid = 0, vOut = 0;
        if (s !== 0) {
          vOut = vs;
          if (resistive) {
            iNew = vs / R;
            if (s * iNew <= 0) { iNew = 0; s = 0; }
            iMid = iNew;
          } else {
            iNew = i * decay + (vs / R) * om;
            if (s * iNew <= 0) {
              const fr = i !== 0 ? i / (i - iNew) : 0;
              iMid = 0.5 * i * fr;
              iNew = 0;
              s = 0;
            } else {
              iMid = 0.5 * (i + iNew);
            }
          }
        }
        iArr[n] = iMid;
        vo[n] = vOut;
        i = iNew;
      }
      return { xEnd: [i], hadOff: off };
    };

    let r;
    if (resistive) {
      r = run([0]);
    } else {
      const Z = Math.hypot(R, 2 * PI * f * L);
      const phi = Math.atan2(2 * PI * f * L, R);
      const guess = [o.alpha <= phi ? (o.Vm / Z) * Math.sin(o.phase0 - phi) : 0];
      r = CL.solvePeriodic(run, guess, {
        a: Math.exp(-R / (f * L)), om: -Math.expm1(-R / (f * L))
      });
    }
    return { v: v, i: iArr, vo: vo, hadOff: r.hadOff };
  }

  /** Extinction angle for alpha > phi: sin(b-phi) = sin(a-phi) exp(-(b-a)/tan(phi)). */
  function extinction(alpha, phi) {
    const t = Math.tan(phi);
    const f = function (b) { return Math.sin(b - phi) - Math.sin(alpha - phi) * Math.exp(-(b - alpha) / t); };
    return CL.bisect(f, PI, PI + alpha, 100);
  }

  function resistiveVo(alpha) {
    return Math.sqrt(Math.max(0, 1 - alpha / PI + Math.sin(2 * alpha) / (2 * PI)));
  }

  function simulate(p) {
    const alpha = p.alpha * D2R;
    const Vm = Math.SQRT2 * p.Vs;
    const e = engine1({ Vm: Vm, f: p.f, alpha: alpha, phase0: 0, R: p.R, L: p.L * 1e-3 });
    const vs = e.v;
    const m = CL.acMetrics([{ v: vs, i: e.i }]);
    const Vo = CL.rms(e.vo), Io = CL.rms(e.i);
    const Pload = Io * Io * p.R;
    const pulse = CL.positivePulse(e.i);

    const metrics = Object.assign({}, m, {
      alpha: p.alpha,
      beta: pulse ? pulse.end * R2D : null,
      sigma: pulse ? pulse.angle * R2D : null,
      mode: CL.acMode(e.i, pulse),
      Vo: Vo, Io: Io, Pload: Pload,
      balance: Math.abs(m.P - Pload)
    });

    const iMax = CL.maxAbs(e.i), vMax = CL.maxAbs(vs);
    const vScaled = CL.scale(vs, iMax > 0 ? iMax / vMax : 1);
    const markers = [{ x: alpha, label: '\u03b1' }, { x: alpha + PI, label: '\u03c0+\u03b1' }];

    return {
      metrics: metrics,
      flow: null,
      textbook: textbook(p),
      panels: [
        CL.panel('vo', 'Source voltage v<sub>s</sub> and load voltage v<sub>o</sub>', 'V', [
          { name: 'v_s', y: vs, color: 'ref', dash: [2, 3], width: 1.3 },
          { name: 'v_o', y: e.vo, color: 'voltage', fill: true }
        ], { markers: markers }),
        CL.panel('is', 'Source current i<sub>s</sub> and its fundamental', 'A', [
          { name: 'v_s (scaled)', y: vScaled, color: 'ref', dash: [2, 3], width: 1.3 },
          { name: 'i_s', y: e.i, color: 'current' },
          { name: 'i_s1', y: m.i1, color: 'fund', dash: [7, 4] }
        ], { markers: markers })
      ]
    };
  }

  function textbook(p) {
    const a = p.alpha * D2R;
    const rows = [];
    if (p.L * 1e-3 < 1e-7) {
      const k = resistiveVo(a);
      rows.push({ label: 'V<sub>o</sub> = V<sub>s</sub>&radic;(1 &minus; &alpha;/&pi; + sin 2&alpha; / 2&pi;)', value: p.Vs * k, unit: 'V', sim: 'Vo' });
      rows.push({ label: 'PF = V<sub>o</sub> / V<sub>s</sub>', value: k, unit: '', sim: 'pf', dec: 3 });
      return rows;
    }
    const w = 2 * PI * p.f * p.L * 1e-3;
    const Z = Math.hypot(p.R, w), phi = Math.atan2(w, p.R);
    rows.push({ label: '&phi; = tan<sup>&minus;1</sup>(&omega;L/R)', value: phi * R2D, unit: '&deg;' });
    if (a <= phi) {
      rows.push({ label: '&alpha; &le; &phi;: I<sub>o</sub> = V<sub>s</sub> / Z', value: p.Vs / Z, unit: 'A', sim: 'Io' });
    } else {
      rows.push({ label: '&beta; from sin(&beta;&minus;&phi;) = sin(&alpha;&minus;&phi;) e<sup>&minus;(&beta;&minus;&alpha;)/tan &phi;</sup>',
        value: extinction(a, phi) * R2D, unit: '&deg;', sim: 'beta' });
    }
    return rows;
  }

  CL._engine1 = engine1;
  CL._acctrl1 = simulate;

  CL.register({
    id: 'ac1', group: 'AC voltage controllers', title: '1-phase AC controller',
    blurb: 'Two back-to-back thyristors chop the source voltage. With an inductive load, nothing changes until &alpha; passes the load angle &phi;.',
    assumptions: [
      'Ideal thyristors with 180&deg; gate windows; the load is a series R&ndash;L.',
      '&alpha; is measured from the source voltage zero crossing.',
      'There is no DC side: the DC readouts are not used here.'
    ],
    controls: [CL.CTL.alpha({ value: 90 }), CL.CTL.Vs1(), CL.CTL.f(), CL.CTL.Rload(), CL.CTL.Lload()],
    presets: [
      { name: 'Resistive load', set: { L: 0, alpha: 90 } },
      { name: 'Inductive, \u03b1 < \u03c6', set: { R: 10, L: 80, alpha: 30 } },
      { name: 'Inductive, \u03b1 > \u03c6', set: { R: 10, L: 40, alpha: 100 } }
    ],
    simulate: simulate
  });
})(typeof window !== 'undefined' ? window : globalThis);
