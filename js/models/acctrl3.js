/*
 * acctrl3.js  -  three-phase AC voltage controllers.
 *
 *   ac3d : thyristor pairs inside a DELTA-connected R-L load.
 *          Each branch is an independent single-phase controller on a line
 *          voltage, so we reuse CL._engine1 and shift it by 120 degrees.
 *          Line current:  i_a = i_ab - i_ca.
 *          alpha is measured from the zero crossing of the line voltage v_ab.
 *
 *   ac3y : thyristor pairs in series with a STAR-connected R-L load, no
 *          neutral wire.  The neutral point floats, so the circuit switches
 *          between modes with three, two, or zero phases conducting:
 *              neutral shift  v_nN = mean of the conducting phase voltages
 *              load voltage   u_k  = v_k - v_nN
 *          alpha is measured from the zero crossing of the phase voltage.
 *
 * Both use the same wide-gating model as the single-phase controller.
 */
(function (g) {
  'use strict';
  const CL = g.CL;
  const N = CL.N, TH = CL.theta, D2R = CL.D2R, R2D = 180 / Math.PI, PI = Math.PI;
  const TWO_THIRD_PI = 2 * PI / 3;

  /* ------------------------------------------------------------------ delta */
  function simulateDelta(p) {
    const alpha = p.alpha * D2R;
    const VmLL = Math.SQRT2 * p.Vs;
    const VmPh = VmLL / Math.sqrt(3);
    const e = CL._engine1({ Vm: VmLL, f: p.f, alpha: alpha, phase0: 30 * D2R, R: p.R, L: p.L * 1e-3 });

    const k3 = N / 3;
    const iab = e.i, ibc = CL.delay(e.i, k3), ica = CL.delay(e.i, 2 * k3);
    const ia = CL.zeros(), ib = CL.zeros(), ic = CL.zeros();
    for (let n = 0; n < N; n++) {
      ia[n] = iab[n] - ica[n];
      ib[n] = ibc[n] - iab[n];
      ic[n] = ica[n] - ibc[n];
    }
    const van = CL.fill(function (th) { return VmPh * Math.sin(th); });
    const vbn = CL.fill(function (th) { return VmPh * Math.sin(th - TWO_THIRD_PI); });
    const vcn = CL.fill(function (th) { return VmPh * Math.sin(th + TWO_THIRD_PI); });

    const m = CL.acMetrics([{ v: van, i: ia }, { v: vbn, i: ib }, { v: vcn, i: ic }]);
    const Vo = CL.rms(e.vo), Io = CL.rms(iab);
    const Pload = 3 * Io * Io * p.R;
    const pulse = CL.positivePulse(iab);

    const metrics = Object.assign({}, m, {
      alpha: p.alpha,
      beta: pulse ? pulse.end * R2D : null,
      sigma: pulse ? pulse.angle * R2D : null,
      mode: CL.acMode(iab, pulse),
      Vo: Vo, Io: Io, Pload: Pload,
      balance: Math.abs(m.P - Pload)
    });

    const iMax = CL.maxAbs(ia), vMax = CL.maxAbs(van);
    const vScaled = CL.scale(van, iMax > 0 ? iMax / vMax : 1);
    const a0 = CL.mod2pi(alpha - 30 * D2R);
    const markers = [{ x: a0, label: '\u03b1 (branch ab)' }];

    return {
      metrics: metrics,
      flow: null,
      textbook: textbookDelta(p),
      textbookNote: 'Closed-form values are shown for a purely resistive load (set L to 0 mH).',
      panels: [
        CL.panel('vo', 'Branch ab: line voltage v<sub>ab</sub> and load voltage v<sub>o</sub>', 'V', [
          { name: 'v_ab', y: e.v, color: 'ref', dash: [2, 3], width: 1.3 },
          { name: 'v_o', y: e.vo, color: 'voltage', fill: true }
        ], { markers: markers }),
        CL.panel('is', 'Line current i<sub>a</sub>, branch current i<sub>ab</sub>, fundamental', 'A', [
          { name: 'v_an (scaled)', y: vScaled, color: 'ref', dash: [2, 3], width: 1.3 },
          { name: 'i_ab', y: iab, color: 'load', width: 1.4 },
          { name: 'i_a', y: ia, color: 'current' },
          { name: 'i_a1', y: m.i1, color: 'fund', dash: [7, 4] }
        ])
      ]
    };
  }

  function textbookDelta(p) {
    if (p.L * 1e-3 >= 1e-7) return null;
    const a = p.alpha * D2R;
    const k = Math.sqrt(Math.max(0, 1 - a / PI + Math.sin(2 * a) / (2 * PI)));
    return [
      { label: 'V<sub>o</sub> = V<sub>LL</sub>&radic;(1 &minus; &alpha;/&pi; + sin 2&alpha; / 2&pi;)', value: p.Vs * k, unit: 'V', sim: 'Vo' },
      { label: 'P<sub>load</sub> = 3 V<sub>o</sub><sup>2</sup>/R', value: 3 * Math.pow(p.Vs * k, 2) / p.R, unit: 'W', sim: 'Pload', dec: 1 }
    ];
  }

  /* ------------------------------------------------------------------- star */
  function simulateStar(p) {
    const alpha = p.alpha * D2R;
    const Vm = Math.SQRT2 * p.Vs / Math.sqrt(3);
    const R = Math.max(p.R, 1e-3), L = p.L * 1e-3, f = p.f;
    const resistive = L < 1e-7;
    const v = [0, 1, 2].map(function (k) {
      return CL.fill(function (th) { return Vm * Math.sin(th - k * TWO_THIRD_PI); });
    });
    // gate direction per phase: +1 while its T+ window is open, -1 for T-
    const gdir = [0, 1, 2].map(function (k) {
      const a = new Int8Array(N);
      for (let n = 0; n < N; n++) a[n] = CL.mod2pi(TH[n] - k * TWO_THIRD_PI - alpha) < PI ? 1 : -1;
      return a;
    });
    const dt = 1 / (f * N);
    const decay = resistive ? 0 : Math.exp(-R * dt / L);
    const om = resistive ? 1 : -Math.expm1(-R * dt / L);

    const cur = [CL.zeros(), CL.zeros(), CL.zeros()];
    const uA = CL.zeros(), vN = CL.zeros();
    const PAIRS = [[0, 1], [0, 2], [1, 2]];

    const run = function (x) {
      const i = x.slice();
      const on = [false, false, false];
      const dir = [0, 0, 0];
      for (let k = 0; k < 3; k++) {
        if (Math.abs(i[k]) > 1e-9) { on[k] = true; dir[k] = i[k] > 0 ? 1 : -1; }
      }
      const count = function () { return (on[0] ? 1 : 0) + (on[1] ? 1 : 0) + (on[2] ? 1 : 0); };
      let off = false;

      for (let n = 0; n < N; n++) {
        const vv = [v[0][n], v[1][n], v[2][n]];
        const d = [gdir[0][n], gdir[1][n], gdir[2][n]];

        // lone conducting phase cannot exist (no neutral wire)
        if (count() < 2) { on[0] = on[1] = on[2] = false; i[0] = i[1] = i[2] = 0; }

        // --- firing -------------------------------------------------------
        let c = count();
        if (c === 0) {
          let best = 0, bk = -1, bm = -1;
          for (let q = 0; q < 3; q++) {
            const a = PAIRS[q][0], b = PAIRS[q][1];
            const ua = (vv[a] - vv[b]) / 2;
            if (ua * d[a] > 0 && -ua * d[b] > 0 && Math.abs(ua) > best) { best = Math.abs(ua); bk = a; bm = b; }
          }
          if (bk >= 0) { on[bk] = on[bm] = true; dir[bk] = d[bk]; dir[bm] = d[bm]; c = 2; }
        }
        if (c === 2) {
          const q = !on[0] ? 0 : (!on[1] ? 1 : 2);
          const uq = vv[q] - (vv[0] + vv[1] + vv[2]) / 3;
          if (uq * d[q] > 0) { on[q] = true; dir[q] = d[q]; c = 3; }
        }
        if (c < 2) {
          off = true;
          cur[0][n] = cur[1][n] = cur[2][n] = 0;
          uA[n] = 0; vN[n] = 0;
          continue;
        }

        // --- integrate ----------------------------------------------------
        let vn = 0;
        for (let k = 0; k < 3; k++) if (on[k]) vn += vv[k];
        vn /= c;
        const wasOn = on.slice();
        for (let k = 0; k < 3; k++) {
          if (!wasOn[k]) { cur[k][n] = 0; continue; }
          const u = vv[k] - vn;
          const iNew = resistive ? u / R : i[k] * decay + (u / R) * om;
          if (dir[k] * iNew <= 0) {
            const fr = i[k] !== 0 ? i[k] / (i[k] - iNew) : 0;
            cur[k][n] = 0.5 * i[k] * fr;
            i[k] = 0;
            on[k] = false;
          } else {
            cur[k][n] = resistive ? iNew : 0.5 * (i[k] + iNew);
            i[k] = iNew;
          }
        }
        uA[n] = wasOn[0] ? vv[0] - vn : 0;
        vN[n] = vn;
      }
      return { xEnd: i.slice(), hadOff: off };
    };

    let r;
    if (resistive) {
      r = run([0, 0, 0]);
    } else {
      const Z = Math.hypot(R, 2 * PI * f * L), phi = Math.atan2(2 * PI * f * L, R);
      // alpha <= phi: current is continuous, start from the sinusoidal steady state.
      // alpha  > phi: the orbit passes through zero current, so start from rest.
      const guess = [0, 1, 2].map(function (k) {
        return alpha <= phi ? (Vm / Z) * Math.sin(-k * TWO_THIRD_PI - phi) : 0;
      });
      r = CL.solvePeriodic(run, guess, { a: Math.exp(-R / (f * L)), om: -Math.expm1(-R / (f * L)), maxIter: 300 });
    }

    const m = CL.acMetrics([0, 1, 2].map(function (k) { return { v: v[k], i: cur[k] }; }));
    const Vo = CL.rms(uA), Io = CL.rms(cur[0]);
    const Pload = 3 * Io * Io * R;
    const pulse = CL.positivePulse(cur[0]);

    const metrics = Object.assign({}, m, {
      alpha: p.alpha,
      beta: pulse ? pulse.end * R2D : null,
      sigma: pulse ? pulse.angle * R2D : null,
      mode: CL.acMode(cur[0], pulse),
      Vo: Vo, Io: Io, Pload: Pload,
      balance: Math.abs(m.P - Pload)
    });

    const iMax = CL.maxAbs(cur[0]), vMax = CL.maxAbs(v[0]);
    const vScaled = CL.scale(v[0], iMax > 0 ? iMax / vMax : 1);
    const markers = [{ x: alpha, label: '\u03b1 (phase a)' }, { x: alpha + PI, label: '\u03c0+\u03b1' }];

    return {
      metrics: metrics,
      flow: null,
      textbook: textbookStar(p),
      textbookNote: 'Closed-form values are shown for a purely resistive load (L = 0 mH) with &alpha; up to 60&deg;.',
      panels: [
        CL.panel('vo', 'Phase a: source v<sub>an</sub>, load voltage, neutral shift v<sub>nN</sub>', 'V', [
          { name: 'v_an', y: v[0], color: 'ref', dash: [2, 3], width: 1.3 },
          { name: 'load voltage', y: uA, color: 'voltage', fill: true },
          { name: 'v_nN', y: vN, color: 'load', width: 1.3 }
        ], { markers: markers }),
        CL.panel('is', 'Line current i<sub>a</sub> and its fundamental', 'A', [
          { name: 'v_an (scaled)', y: vScaled, color: 'ref', dash: [2, 3], width: 1.3 },
          { name: 'i_a', y: cur[0], color: 'current' },
          { name: 'i_a1', y: m.i1, color: 'fund', dash: [7, 4] }
        ], { markers: markers })
      ]
    };
  }

  function textbookStar(p) {
    if (p.L * 1e-3 >= 1e-7) return null;
    const a = p.alpha * D2R;
    if (p.alpha > 60) return null;
    const k = Math.sqrt(Math.max(0, 1 - 3 * a / (2 * PI) + 3 * Math.sin(2 * a) / (4 * PI)));
    const Vph = p.Vs / Math.sqrt(3);
    return [
      { label: 'V<sub>o</sub> = V<sub>ph</sub>&radic;(1 &minus; 3&alpha;/2&pi; + 3 sin 2&alpha; / 4&pi;)  (0&deg; &le; &alpha; &le; 60&deg;)', value: Vph * k, unit: 'V', sim: 'Vo' },
      { label: 'P<sub>load</sub> = 3 V<sub>o</sub><sup>2</sup>/R', value: 3 * Math.pow(Vph * k, 2) / p.R, unit: 'W', sim: 'Pload', dec: 1 }
    ];
  }

  CL._acctrl3d = simulateDelta;
  CL._acctrl3y = simulateStar;

  const ctl = function () {
    return [CL.CTL.alpha({ value: 60 }), CL.CTL.Vll(), CL.CTL.f(), CL.CTL.Rload(), CL.CTL.Lload()];
  };

  CL.register({
    id: 'ac3d', group: 'AC voltage controllers', title: '3-phase AC controller, delta load',
    blurb: 'Each delta branch is its own single-phase controller on a line voltage. The line current is the difference of two branch currents.',
    assumptions: [
      'Thyristor pairs sit inside the delta, in series with each R&ndash;L branch.',
      '&alpha; is measured from the zero crossing of the line voltage across the branch.',
      'Balanced ideal source; ideal thyristors with 180&deg; gate windows.'
    ],
    controls: ctl(),
    presets: [
      { name: 'Resistive load', set: { L: 0, alpha: 60 } },
      { name: 'Inductive load', set: { R: 10, L: 40, alpha: 100 } }
    ],
    simulate: simulateDelta
  });

  CL.register({
    id: 'ac3y', group: 'AC voltage controllers', title: '3-phase AC controller, star load',
    blurb: 'With no neutral wire the load neutral floats, so two or three phases conduct at a time depending on &alpha;.',
    assumptions: [
      'Three-wire star load, floating neutral; thyristor pair in each line.',
      '&alpha; is measured from the zero crossing of the phase voltage.',
      'The load goes dark at &alpha; = 150&deg; with a resistive load.'
    ],
    controls: ctl(),
    presets: [
      { name: 'Resistive load', set: { L: 0, alpha: 60 } },
      { name: 'Inductive load', set: { R: 10, L: 40, alpha: 100 } }
    ],
    simulate: simulateStar
  });
})(typeof window !== 'undefined' ? window : globalThis);
