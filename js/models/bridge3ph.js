/*
 * bridge3ph.js  -  three-phase six-pulse bridge rectifiers.
 *
 *   diode3 : six diodes
 *   thy3   : six thyristors, rectifier AND inverter
 *
 * Phase voltages: v_k = Vm sin(theta - k*120deg), k = a, b, c, with Vm taken
 * from the line-to-line RMS voltage V_LL (Vm = sqrt(2) V_LL / sqrt(3)).
 *
 * Firing model: the bridge has six 60-degree sectors.  Without delay the
 * conducting pair in each sector is (highest phase, lowest phase), and the
 * sector boundaries fall at 30, 90, 150, ... degrees (the natural commutation
 * points).  A firing angle alpha delays every boundary by alpha.  Each pair is
 * gated for its whole sector, so a pair conducts while it is gated AND its
 * line voltage exceeds the DC source E.  alpha = 0 reproduces a diode bridge.
 */
(function (g) {
  'use strict';
  const CL = g.CL;
  const N = CL.N, TH = CL.theta, D2R = CL.D2R, R2D = 180 / Math.PI, PI = Math.PI;
  const SIXTY = PI / 3;

  function simulate(kind, p) {
    const alpha = kind === 'diode' ? 0 : p.alpha * D2R;
    const Vm = Math.SQRT2 * p.Vs / Math.sqrt(3);
    const v = [0, 1, 2].map(function (k) {
      return CL.fill(function (th) { return Vm * Math.sin(th - k * 2 * PI / 3); });
    });

    // which phases are (top, bottom) in each delayed sector
    const topOf = [], botOf = [];
    for (let m = 0; m < 6; m++) {
      const thMid = (m + 1) * SIXTY;
      const vv = [0, 1, 2].map(function (k) { return Math.sin(thMid - k * 2 * PI / 3); });
      topOf.push(vv.indexOf(Math.max.apply(null, vv)));
      botOf.push(vv.indexOf(Math.min.apply(null, vv)));
    }
    const sector = new Int8Array(N);
    for (let n = 0; n < N; n++) {
      sector[n] = Math.floor(CL.mod2pi(TH[n] - alpha - 30 * D2R) / SIXTY) % 6;
    }

    const id = CL.zeros(), vd = CL.zeros();
    const is = [CL.zeros(), CL.zeros(), CL.zeros()];
    let hadOff = false;

    if (p.mode === 'cc') {
      for (let n = 0; n < N; n++) {
        const t = topOf[sector[n]], b = botOf[sector[n]];
        vd[n] = v[t][n] - v[b][n];
        id[n] = p.Id;
        is[t][n] = p.Id;
        is[b][n] = -p.Id;
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
          const t = topOf[sector[n]], b = botOf[sector[n]];
          const vc = v[t][n] - v[b][n];
          if (!on && vc > E + 1e-9) on = true;
          let iNew = 0, iMid = 0;
          if (on) {
            if (resistive) {
              iNew = (vc - E) / R;
              if (iNew <= 0) { iNew = 0; on = false; }
              iMid = iNew;
            } else {
              iNew = i * decay + ((vc - E) / R) * om;
              if (iNew <= 0) {
                const fr = i > 0 ? i / (i - iNew) : 0;
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
          is[0][n] = is[1][n] = is[2][n] = 0;
          if (iMid > 0) { is[t][n] = iMid; is[b][n] = -iMid; }
          i = iNew;
        }
        return { xEnd: [i], hadOff: off };
      };

      const Vavg = (3 * Math.sqrt(2) / PI) * p.Vs * Math.cos(alpha);
      const guess = [Math.max(0, (Vavg - E) / R)];
      const r = resistive ? run([0]) : CL.solvePeriodic(run, guess, {
        a: Math.exp(-R / (p.f * L)), om: -Math.expm1(-R / (p.f * L))
      });
      hadOff = r.hadOff;
    }

    const m = CL.acMetrics([0, 1, 2].map(function (k) { return { v: v[k], i: is[k] }; }));
    const Vdc = CL.mean(vd), Idc = CL.mean(id), Pdc = CL.meanProd(vd, id);
    const pulse = CL.positivePulse(is[0]);
    const idZero = CL.maxAbs(id) < 1e-9;

    const metrics = Object.assign({}, m, {
      alpha: kind === 'diode' ? null : p.alpha,
      beta: pulse ? pulse.end * R2D : null,
      sigma: pulse ? pulse.angle * R2D : null,
      mode: p.mode === 'cc' ? 'Ideal, constant' : idZero ? 'Zero' : (hadOff ? 'Discontinuous' : 'Continuous'),
      Vdc: Vdc, Idc: Idc, Pdc: Pdc, Qdc: 0,
      balance: Math.abs(m.P - Pdc)
    });

    const first = 30 * D2R + alpha;
    const markers = kind === 'diode' ? [] : [{ x: first, label: '30\u00b0+\u03b1' }];
    const iMax = CL.maxAbs(is[0]), vMax = CL.maxAbs(v[0]);
    const vScaled = CL.scale(v[0], iMax > 0 ? iMax / vMax : 1);

    return {
      metrics: metrics,
      flow: CL.flow(Pdc, m.S),
      textbook: p.mode === 'cc' ? textbook(kind, p) : null,
      textbookNote: 'Closed-form values assume the ideal constant-current load. Switch the load model to compare.',
      panels: [
        CL.panel('vs', 'Source phase voltages', 'V', [
          { name: 'v_a', y: v[0], color: 'va' },
          { name: 'v_b', y: v[1], color: 'vb' },
          { name: 'v_c', y: v[2], color: 'vc' }
        ], { markers: markers }),
        CL.panel('is', 'Source current i<sub>a</sub> and its fundamental', 'A', [
          { name: 'v_a (scaled)', y: vScaled, color: 'ref', dash: [2, 3], width: 1.3 },
          { name: 'i_a', y: is[0], color: 'current' },
          { name: 'i_a1', y: m.i1, color: 'fund', dash: [7, 4] }
        ], { markers: markers }),
        CL.panel('vd', 'DC output voltage v<sub>d</sub>', 'V',
          [{ name: 'v_d', y: vd, color: 'dc', fill: true }],
          { hlines: [{ y: Vdc, name: 'V_dc', color: 'ink' }] }),
        CL.panel('id', 'DC output current i<sub>d</sub>', 'A',
          [{ name: 'i_d', y: id, color: 'load' }],
          { hlines: [{ y: Idc, name: 'I_dc', color: 'ink' }] })
      ]
    };
  }

  function textbook(kind, p) {
    const a = kind === 'diode' ? 0 : p.alpha * D2R;
    const Id = p.Id;
    return [
      { label: 'V<sub>dc</sub> = (3&radic;2/&pi;) V<sub>LL</sub> cos &alpha;', value: (3 * Math.SQRT2 / PI) * p.Vs * Math.cos(a), unit: 'V', sim: 'Vdc' },
      { label: 'I<sub>s</sub> = &radic;(2/3) I<sub>d</sub>', value: Math.sqrt(2 / 3) * Id, unit: 'A', sim: 'Is' },
      { label: 'I<sub>s1</sub> = (&radic;6/&pi;) I<sub>d</sub>', value: (Math.sqrt(6) / PI) * Id, unit: 'A', sim: 'Is1' },
      { label: '&phi;<sub>1</sub> = &alpha;', value: kind === 'diode' ? 0 : p.alpha, unit: '&deg;', sim: 'phi1' },
      { label: 'PF = (3/&pi;) cos &alpha;', value: (3 / PI) * Math.cos(a), unit: '', sim: 'pf', dec: 3 }
    ];
  }

  const common = [CL.CTL.Vll(), CL.CTL.f(), CL.CTL.mode(), CL.CTL.Id(), CL.CTL.R(), CL.CTL.L()];

  CL.register({
    id: 'diode3', group: 'Rectifiers', title: '3-phase diode bridge',
    blurb: 'Each diode carries the load current for 120&deg;, so the source current is a quasi-square wave with no triplen harmonics.',
    assumptions: [
      'Ideal diodes, balanced ideal source, no source inductance (no commutation overlap).',
      'Constant-current mode gives the textbook 0.816 I<sub>d</sub> RMS line current.',
      'V<sub>LL</sub> is the line-to-line RMS voltage; V<sub>s</sub> in the readouts is the phase RMS voltage.'
    ],
    controls: [].concat(common, [CL.CTL.E({ max: 400 })]),
    presets: [
      { name: 'Ideal inductive load', set: { mode: 'cc' } },
      { name: 'Resistive load', set: { mode: 'rl', L: 0, E: 0 } }
    ],
    simulate: function (p) { return simulate('diode', p); }
  });

  CL.register({
    id: 'thy3', group: 'Rectifiers', title: '3-phase thyristor bridge',
    blurb: 'Firing angle \u03b1 is measured from the natural commutation point (30\u00b0 after the phase voltage crosses zero). Past 90\u00b0 the bridge inverts.',
    assumptions: [
      'Ideal thyristors, balanced source, no overlap; each pair is gated for its whole 60&deg; sector.',
      'Inverter operation needs a DC source in the load: set E negative and &alpha; &gt; 90&deg; in R&ndash;L mode.',
      'Commutation failure at large &alpha; (turn-off margin) is not modelled.'
    ],
    controls: [].concat([CL.CTL.alpha()], common, [CL.CTL.E({ min: -400, max: 400, label: 'DC source E (negative = inverting)' })]),
    presets: [
      { name: 'Ideal inductive load', set: { mode: 'cc', alpha: 30 } },
      { name: 'Resistive load', set: { mode: 'rl', L: 0, E: 0, alpha: 60 } },
      { name: 'Inverter', set: { mode: 'rl', alpha: 140, E: -260, R: 5, L: 500 } }
    ],
    simulate: function (p) { return simulate('thy', p); }
  });

  CL._bridge3 = simulate;
})(typeof window !== 'undefined' ? window : globalThis);
