/*
 * metrics.js  -  power quantities computed from sampled waveforms.
 *
 * Every converter hands its source voltage / source current arrays to
 * CL.acMetrics, so all pages calculate PF, DPF, Q1, D ... the same way.
 *
 * Definitions (per phase, summed over phases for three-phase circuits)
 *   P   = mean(v * i)                       real power
 *   S   = Vrms * Irms                       apparent power
 *   P1  = V1 * I1 * cos(phi1)               fundamental real power
 *   Q1  = V1 * I1 * sin(phi1)               fundamental reactive power
 *   D   = sqrt(S^2 - P^2 - Q1^2)            distortion power
 *   DPF = cos(phi1)    PF = P / S    THD_i = sqrt(I^2 - I1^2) / I1
 * phi1 = (phase of v1) - (phase of i1); positive when the current lags.
 */
(function (g) {
  'use strict';
  const CL = g.CL;
  const R2D = 180 / Math.PI;

  function wrapPi(x) {
    while (x > Math.PI) x -= 2 * Math.PI;
    while (x <= -Math.PI) x += 2 * Math.PI;
    return x;
  }

  /**
   * phases = [{ v: Float64Array, i: Float64Array }, ...]
   * The FIRST phase is the reference for I1, phi1, DPF and the fundamental
   * waveform that gets plotted.
   */
  CL.acMetrics = function (phases) {
    let P = 0, S = 0, P1 = 0, Q1 = 0;
    let ref = null;
    for (let k = 0; k < phases.length; k++) {
      const ph = phases[k];
      const fv = CL.dft1(ph.v);
      const fi = CL.dft1(ph.i);
      const V = CL.rms(ph.v);
      const I = CL.rms(ph.i);
      const V1 = fv.mag / Math.SQRT2;
      const I1 = fi.mag / Math.SQRT2;
      const phi = wrapPi(fv.psi - fi.psi);
      P += CL.meanProd(ph.v, ph.i);
      S += V * I;
      P1 += V1 * I1 * Math.cos(phi);
      Q1 += V1 * I1 * Math.sin(phi);
      if (!ref) ref = { V: V, I: I, I1: I1, phi: phi, fi: fi };
    }
    const noCurrent = ref.I1 < 1e-9;
    return {
      Vs: ref.V,
      Is: ref.I,
      Is1: ref.I1,
      phi1: noCurrent ? null : ref.phi * R2D,
      dpf: noCurrent ? null : Math.cos(ref.phi),
      pf: S > 1e-12 ? P / S : null,
      P: P,
      Ps1: P1,
      Qs1: Q1,
      S: S,
      D: Math.sqrt(Math.max(0, S * S - P * P - Q1 * Q1)),
      thd: noCurrent ? null : 100 * Math.sqrt(Math.max(0, ref.I * ref.I - ref.I1 * ref.I1)) / ref.I1,
      i1: noCurrent ? CL.zeros() : CL.fundamentalArray(ref.fi)
    };
  };

  /**
   * First positive pulse of a waveform (rising edge to falling edge).
   * Returns angles in radians, or null if the waveform never goes positive.
   */
  CL.positivePulse = function (y) {
    const N = y.length;
    const mx = CL.maxAbs(y);
    if (mx < 1e-9) return null;
    const thr = 2e-3 * mx;
    let start = -1;
    for (let n = 0; n < N; n++) {
      if (y[n] > thr && y[(n - 1 + N) % N] <= thr) { start = n; break; }
    }
    if (start < 0) return null;
    let len = 0;
    while (len < N && y[(start + len) % N] > thr) len++;
    const a0 = start * CL.DTH;
    const a1 = (start + len) * CL.DTH;
    return { start: a0, end: a1, angle: a1 - a0 };
  };

  /** AC controllers: a phase current is 'continuous' only if it flows for the full 180 degrees. */
  CL.acMode = function (i, pulse) {
    if (CL.maxAbs(i) < 1e-9 || !pulse) return 'Zero';
    return pulse.angle * R2D >= 179 ? 'Continuous' : 'Discontinuous';
  };

  CL.flow = function (Pdc, S) {
    const tol = 1e-3 * Math.max(S, 1e-9);
    if (Math.abs(Pdc) <= tol) return { kind: 'idle', text: 'No net power transfer' };
    if (Pdc > 0) return { kind: 'rectifying', text: 'Rectifying: AC to DC' };
    return { kind: 'inverting', text: 'Inverting: DC to AC' };
  };

  /** Plot-panel helper so models stay short. */
  CL.panel = function (id, title, unit, traces, extra) {
    return Object.assign({ id: id, title: title, unit: unit, traces: traces }, extra || {});
  };

  /**
   * Readout table. Each row is [metricKey, labelHTML, unit, decimals|null].
   * A row (or a whole group) is hidden when the model does not return that key.
   */
  CL.METRIC_GROUPS = [
    { title: 'Conduction', rows: [
      ['alpha', 'Firing angle &alpha;', '&deg;', 1],
      ['beta', 'Extinction angle &beta;', '&deg;', 1],
      ['sigma', 'Conduction angle &sigma;', '&deg;', 1],
      ['mode', 'Load current', '', null]
    ] },
    { title: 'Source side', rows: [
      ['Vs', 'V<sub>s</sub> (phase)', 'V', null],
      ['Is', 'I<sub>s</sub>', 'A', null],
      ['Is1', 'I<sub>s1</sub> (fundamental)', 'A', null],
      ['phi1', 'Displacement angle &phi;<sub>1</sub>', '&deg;', 1],
      ['dpf', 'DPF = cos &phi;<sub>1</sub>', '', 3],
      ['pf', 'PF = P / S', '', 3],
      ['thd', 'THD of i<sub>s</sub>', '%', 1]
    ] },
    { title: 'Power', rows: [
      ['Ps1', 'P<sub>s1</sub>', 'W', null],
      ['Qs1', 'Q<sub>s1</sub>', 'var', null],
      ['S', 'S', 'VA', null],
      ['D', 'D (distortion)', 'var', null]
    ] },
    { title: 'DC side', rows: [
      ['Vdc', 'V<sub>dc</sub>', 'V', null],
      ['Idc', 'I<sub>dc</sub>', 'A', null],
      ['Pdc', 'P<sub>dc</sub>', 'W', null],
      ['Qdc', 'Q<sub>dc</sub>', 'var', null]
    ] },
    { title: 'Load', rows: [
      ['Vo', 'V<sub>o</sub> (rms)', 'V', null],
      ['Io', 'I<sub>o</sub> (rms)', 'A', null],
      ['Pload', 'P<sub>load</sub>', 'W', null]
    ] },
    { title: 'Self-check', rows: [
      ['balance', '|P<sub>source</sub> &minus; P<sub>load</sub>|', 'W', 3]
    ] }
  ];
})(typeof window !== 'undefined' ? window : globalThis);
