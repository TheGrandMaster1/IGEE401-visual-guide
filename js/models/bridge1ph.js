/*
 * bridge1ph.js  -  single-phase bridge rectifiers.
 *
 *   diode1 : four diodes                         (alpha fixed at 0)
 *   thy1   : four thyristors (fully controlled)  rectifier AND inverter
 *   semi1  : two thyristors + two diodes         (T1 D3 / T4 D2, as in the lecture slide)
 *
 * One engine serves all three because they differ only in how the bridge
 * output voltage is built from the "active pair":
 *
 *   p(theta) = +1 while the T1/T2 gate window is open, -1 while T3/T4's is open
 *   fully controlled / diode :  vd = p * vs
 *   semi-controlled          :  vd = max(0, p * vs)     (diodes clamp vd at zero)
 *
 * Gate model: each pair's gate is held for 180 deg ("wide gating"), so a pair
 * conducts whenever it is gated AND forward biased.  With alpha = 0 this is
 * exactly a diode bridge.
 *
 * Load model:
 *   'cc' : ideal constant DC current Id   (the textbook assumption, closed form)
 *   'rl' : series R, L and DC source E, solved cycle by cycle until periodic.
 *          L = 0 gives a purely resistive load.  E < 0 lets a fully controlled
 *          bridge invert (power flows DC -> AC).
 */
(function (g) {
  'use strict';
  const CL = g.CL;
  const N = CL.N, TH = CL.theta, D2R = CL.D2R, R2D = 180 / Math.PI, PI = Math.PI;

  function simulate(kind, p) {
    const alpha = kind === 'diode' ? 0 : p.alpha * D2R;
    const semi = kind === 'semi';
    const Vm = Math.SQRT2 * p.Vs;
    const vs = CL.fill(function (th) { return Vm * Math.sin(th); });
    const id = CL.zeros(), is = CL.zeros(), vd = CL.zeros();
    let hadOff = false;

    // active pair at each sample: +1 -> T1/T2 gated, -1 -> T3/T4 gated
    const pair = new Int8Array(N);
    for (let n = 0; n < N; n++) pair[n] = CL.mod2pi(TH[n] - alpha) < PI ? 1 : -1;

    if (p.mode === 'cc') {
      for (let n = 0; n < N; n++) {
        const pv = pair[n] * vs[n];
        const conducting = !semi || pv > 0;
        vd[n] = semi ? Math.max(0, pv) : pv;
        id[n] = p.Id;
        is[n] = conducting ? pair[n] * p.Id : 0;
      }
    } else {
      const R = Math.max(p.R, 1e-3);
      const L = p.L * 1e-3;
      const E = p.E || 0;
      const resistive = L < 1e-7;
      const dt = 1 / (p.f * N);
      const decay = resistive ? 0 : Math.exp(-R * dt / L);
      const om = resistive ? 1 : -Math.expm1(-R * dt / L);

      const run = function (x) {
        let i = x[0];
        let on = i > 1e-9;
        let off = false;
        for (let n = 0; n < N; n++) {
          const pn = pair[n];
          const pv = pn * vs[n];
          const vc = semi ? Math.max(0, pv) : pv;       // voltage the bridge can apply
          if (!on && pv > E + 1e-9) on = true;          // gated and forward biased
          let iNew = 0, iMid = 0;
          if (on) {
            if (resistive) {
              iNew = (vc - E) / R;
              if (iNew <= 0) { iNew = 0; on = false; }
              iMid = iNew;
            } else {
              iNew = i * decay + ((vc - E) / R) * om;
              if (iNew <= 0) {
                const fr = i > 0 ? i / (i - iNew) : 0;  // fraction of the step before i hits 0
                iMid = 0.5 * i * fr;
                iNew = 0;
                on = false;
              } else {
                iMid = 0.5 * (i + iNew);
              }
            }
          }
          if (!on) off = true;
          id[n] = iMid;
          vd[n] = on ? vc : E;
          is[n] = iMid > 0 ? (semi && pv <= 0 ? 0 : pn * iMid) : 0;
          i = iNew;
        }
        return { xEnd: [i], hadOff: off };
      };

      const Vavg = kind === 'semi' ? (Vm / PI) * (1 + Math.cos(alpha)) : (2 * Vm / PI) * Math.cos(alpha);
      const guess = [Math.max(0, (Vavg - E) / R)];
      const r = resistive ? run([0]) : CL.solvePeriodic(run, guess, {
        a: Math.exp(-R / (p.f * L)), om: -Math.expm1(-R / (p.f * L))
      });
      hadOff = r.hadOff;
    }

    // ---- results --------------------------------------------------------
    const m = CL.acMetrics([{ v: vs, i: is }]);
    const Vdc = CL.mean(vd), Idc = CL.mean(id), Pdc = CL.meanProd(vd, id);
    const pulse = CL.positivePulse(is);
    const idZero = CL.maxAbs(id) < 1e-9;

    const metrics = Object.assign({}, m, {
      alpha: kind === 'diode' ? null : p.alpha,
      beta: pulse ? pulse.end * R2D : null,
      sigma: pulse ? pulse.angle * R2D : null,
      mode: p.mode === 'cc' ? 'Ideal, constant' : idZero ? 'Zero' : (hadOff ? 'Discontinuous' : 'Continuous'),
      Vdc: Vdc, Idc: Idc, Pdc: Pdc, Qdc: 0,
      balance: Math.abs(m.P - Pdc)
    });

    const markers = kind === 'diode' ? [] : [
      { x: alpha, label: '\u03b1' },
      { x: alpha + PI, label: '\u03c0+\u03b1' }
    ];
    const iMax = CL.maxAbs(is), vMax = CL.maxAbs(vs);
    const vScaled = CL.scale(vs, iMax > 0 ? iMax / vMax : 1);

    return {
      metrics: metrics,
      flow: CL.flow(Pdc, m.S),
      textbook: p.mode === 'cc' ? textbook(kind, p) : null,
      textbookNote: 'Closed-form values assume the ideal constant-current load. Switch the load model to compare.',
      panels: [
        CL.panel('vs', 'Source voltage v<sub>s</sub>', 'V',
          [{ name: 'v_s', y: vs, color: 'voltage' }], { markers: markers }),
        CL.panel('is', 'Source current i<sub>s</sub> and its fundamental', 'A', [
          { name: 'v_s (scaled)', y: vScaled, color: 'ref', dash: [2, 3], width: 1.3 },
          { name: 'i_s', y: is, color: 'current' },
          { name: 'i_s1', y: m.i1, color: 'fund', dash: [7, 4] }
        ], { markers: markers }),
        CL.panel('vd', 'DC output voltage v<sub>d</sub>', 'V',
          [{ name: 'v_d', y: vd, color: 'dc', fill: true }],
          { hlines: [{ y: Vdc, name: 'V_dc', color: 'ink' }], markers: markers }),
        CL.panel('id', 'DC output current i<sub>d</sub>', 'A',
          [{ name: 'i_d', y: id, color: 'load' }],
          { hlines: [{ y: Idc, name: 'I_dc', color: 'ink' }] })
      ]
    };
  }

  /** Closed-form results for the ideal constant-current load. */
  function textbook(kind, p) {
    const a = kind === 'diode' ? 0 : p.alpha * D2R;
    const Vs = p.Vs, Id = p.Id, Vm = Math.SQRT2 * Vs;
    if (kind === 'semi') {
      return [
        { label: 'V<sub>dc</sub> = (V<sub>m</sub>/&pi;)(1 + cos &alpha;)', value: (Vm / PI) * (1 + Math.cos(a)), unit: 'V', sim: 'Vdc' },
        { label: 'I<sub>s</sub> = I<sub>d</sub>&radic;(1 &minus; &alpha;/&pi;)', value: Id * Math.sqrt(1 - a / PI), unit: 'A', sim: 'Is' },
        { label: 'I<sub>s1</sub> = (2&radic;2/&pi;) I<sub>d</sub> cos(&alpha;/2)', value: (2 * Math.SQRT2 / PI) * Id * Math.cos(a / 2), unit: 'A', sim: 'Is1' },
        { label: '&phi;<sub>1</sub> = &alpha;/2', value: p.alpha / 2, unit: '&deg;', sim: 'phi1' },
        { label: 'Q<sub>s1</sub> = 0.45 V<sub>s</sub> I<sub>d</sub> sin &alpha;', value: 0.45 * Vs * Id * Math.sin(a), unit: 'var', sim: 'Qs1', dec: 1 }
      ];
    }
    return [
      { label: 'V<sub>dc</sub> = (2V<sub>m</sub>/&pi;) cos &alpha;', value: (2 * Vm / PI) * Math.cos(a), unit: 'V', sim: 'Vdc' },
      { label: 'I<sub>s</sub> = I<sub>d</sub>', value: Id, unit: 'A', sim: 'Is' },
      { label: 'I<sub>s1</sub> = (2&radic;2/&pi;) I<sub>d</sub>', value: (2 * Math.SQRT2 / PI) * Id, unit: 'A', sim: 'Is1' },
      { label: '&phi;<sub>1</sub> = &alpha;', value: kind === 'diode' ? 0 : p.alpha, unit: '&deg;', sim: 'phi1' },
      { label: 'PF = (2&radic;2/&pi;) cos &alpha;', value: (2 * Math.SQRT2 / PI) * Math.cos(a), unit: '', sim: 'pf', dec: 3 }
    ];
  }

  const common = [
    CL.CTL.Vs1(), CL.CTL.f(), CL.CTL.mode(), CL.CTL.Id(),
    CL.CTL.R(), CL.CTL.L()
  ];

  CL.register({
    id: 'diode1', group: 'Rectifiers', title: '1-phase diode bridge',
    blurb: 'Four diodes steer the load current, so the source current is a square wave in phase with the voltage.',
    assumptions: [
      'Ideal diodes and an ideal sinusoidal source with no source inductance.',
      'Constant-current mode: the load is so inductive that I<sub>d</sub> never changes.',
      'R&ndash;L mode: the battery E is optional; the diodes only conduct while |v<sub>s</sub>| &gt; E.'
    ],
    controls: [].concat(common, [CL.CTL.E({ max: 160 })]),
    presets: [
      { name: 'Ideal inductive load', set: { mode: 'cc' } },
      { name: 'Resistive load', set: { mode: 'rl', L: 0, E: 0 } },
      { name: 'Battery charger', set: { mode: 'rl', R: 2, L: 20, E: 60 } }
    ],
    simulate: function (p) { return simulate('diode', p); }
  });

  CL.register({
    id: 'thy1', group: 'Rectifiers', title: '1-phase thyristor bridge',
    blurb: 'Delaying the firing by \u03b1 shifts the source current by \u03b1. Past 90\u00b0 the average V<sub>d</sub> goes negative and power flows back to the AC side.',
    assumptions: [
      'Ideal thyristors, no commutation overlap, gates held for 180&deg; (wide gating).',
      'Inverter operation needs a DC source in the load: set E negative and &alpha; &gt; 90&deg; in R&ndash;L mode.',
      'The turn-off margin angle needed by real thyristors is not modelled, so keep &alpha; a little below 180&deg;.'
    ],
    controls: [].concat([CL.CTL.alpha()], common, [CL.CTL.E({ min: -200, max: 200, label: 'DC source E (negative = inverting)' })]),
    presets: [
      { name: 'Ideal inductive load', set: { mode: 'cc', alpha: 30 } },
      { name: 'Resistive load', set: { mode: 'rl', L: 0, E: 0, alpha: 60 } },
      { name: 'Inverter', set: { mode: 'rl', alpha: 140, E: -100, R: 5, L: 500 } }
    ],
    simulate: function (p) { return simulate('thy', p); }
  });

  CL.register({
    id: 'semi1', group: 'Rectifiers', title: '1-phase semi-controlled bridge',
    blurb: 'Two thyristors and two diodes. The diodes free-wheel the load for \u03b1 degrees each half cycle, so v<sub>d</sub> never goes negative.',
    assumptions: [
      'Topology as in the lecture slide: T1 and D3 in the positive group, T4 and D2 in the negative group.',
      'Ideal devices, no overlap, wide gating. It cannot invert, so E is limited to zero or above.',
      'Free-wheeling happens through D2 and D3, so v<sub>d</sub> = 0 and i<sub>s</sub> = 0 during those intervals.'
    ],
    controls: [].concat([CL.CTL.alpha({ value: 60 })], common, [CL.CTL.E({ max: 160 })]),
    presets: [
      { name: 'Ideal inductive load', set: { mode: 'cc', alpha: 60 } },
      { name: 'Resistive load', set: { mode: 'rl', L: 0, E: 0, alpha: 60 } }
    ],
    simulate: function (p) { return simulate('semi', p); }
  });

  CL._bridge1 = simulate;
})(typeof window !== 'undefined' ? window : globalThis);
