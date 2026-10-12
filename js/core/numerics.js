/*
 * numerics.js  -  shared numerical helpers for every converter model.
 *
 * Everything lives on one global object, CL, so the site works as plain
 * <script> tags (no bundler, no ES modules, opens fine from file://).
 *
 * Conventions used everywhere in this project
 *   - One fundamental cycle is sampled at N points (0.25 deg resolution).
 *   - Sample n sits at the MIDDLE of step n:  theta[n] = (n + 0.5) * dTheta.
 *   - Angles are radians internally and degrees only in the UI.
 *   - "Lagging" current means a positive displacement angle phi1.
 */
(function (g) {
  'use strict';
  const CL = (g.CL = g.CL || {});

  const TWO_PI = 2 * Math.PI;
  const D2R = Math.PI / 180;
  const N = 1440;
  const DTH = TWO_PI / N;

  CL.TWO_PI = TWO_PI;
  CL.D2R = D2R;
  CL.N = N;
  CL.DTH = DTH;

  const theta = new Float64Array(N);
  for (let n = 0; n < N; n++) theta[n] = (n + 0.5) * DTH;
  CL.theta = theta;

  CL.mod2pi = function (x) {
    x %= TWO_PI;
    return x < 0 ? x + TWO_PI : x;
  };

  CL.zeros = function () { return new Float64Array(N); };
  CL.fill = function (fn) {
    const a = new Float64Array(N);
    for (let n = 0; n < N; n++) a[n] = fn(theta[n], n);
    return a;
  };

  CL.mean = function (a) {
    let s = 0;
    for (let n = 0; n < a.length; n++) s += a[n];
    return s / a.length;
  };
  CL.rms = function (a) {
    let s = 0;
    for (let n = 0; n < a.length; n++) s += a[n] * a[n];
    return Math.sqrt(s / a.length);
  };
  CL.meanProd = function (a, b) {
    let s = 0;
    for (let n = 0; n < a.length; n++) s += a[n] * b[n];
    return s / a.length;
  };
  CL.maxAbs = function (a) {
    let m = 0;
    for (let n = 0; n < a.length; n++) m = Math.max(m, Math.abs(a[n]));
    return m;
  };
  CL.scale = function (a, k) {
    const o = new Float64Array(a.length);
    for (let n = 0; n < a.length; n++) o[n] = a[n] * k;
    return o;
  };
  CL.constant = function (v) {
    const o = new Float64Array(N);
    o.fill(v);
    return o;
  };

  /** Circular delay: out[n] = a[n - k]  (the waveform arrives k samples later). */
  CL.delay = function (a, k) {
    const o = new Float64Array(a.length);
    const L = a.length;
    for (let n = 0; n < L; n++) o[n] = a[(((n - k) % L) + L) % L];
    return o;
  };

  /**
   * First harmonic of one sampled period.
   *   y(theta) ~ mag * sin(theta + psi)
   * A source v = Vm sin(theta) has psi = 0; a lagging current has psi < 0.
   */
  CL.dft1 = function (y) {
    let a = 0, b = 0;
    for (let n = 0; n < y.length; n++) {
      a += y[n] * Math.cos(theta[n]);
      b += y[n] * Math.sin(theta[n]);
    }
    a *= 2 / y.length;
    b *= 2 / y.length;
    return { a: a, b: b, mag: Math.hypot(a, b), psi: Math.atan2(a, b) };
  };

  CL.fundamentalArray = function (f) {
    return CL.fill(function (th) { return f.mag * Math.sin(th + f.psi); });
  };

  /**
   * Find the steady state of a piecewise-linear circuit.
   *
   * run(x0) simulates exactly one cycle starting from state vector x0 and
   * returns { xEnd:[...], hadOff:boolean, ...whatever arrays the model wants }.
   *
   * While no device has switched off, every state variable obeys the same
   * first-order law, so one cycle is an affine map  x1 = a*x0 + b.  We solve
   * the fixed point of that map directly instead of waiting for the decay
   * (otherwise a 10 H inductor would need thousands of simulated cycles).
   *
   * opts = { a: exp(-R*T/L), om: 1 - a (accurate when a is close to 1), maxIter }
   */
  CL.solvePeriodic = function (run, x0, opts) {
    const maxIter = (opts && opts.maxIter) || 150;
    const a = opts && opts.a;
    const om = opts && opts.om;
    let x = x0.slice();
    let r = null;
    let nextJump = 0, lastWasJump = false, lastErr = Infinity;
    for (let k = 0; k < maxIter; k++) {
      r = run(x);
      let err = 0, scale = 1e-9;
      for (let j = 0; j < x.length; j++) {
        err = Math.max(err, Math.abs(r.xEnd[j] - x[j]));
        scale = Math.max(scale, Math.abs(r.xEnd[j]));
      }
      if (err < 1e-9 + 1e-7 * scale) return r;
      // A jump that did not shrink the cycle error means the switching sequence
      // is still changing with the state (not a single affine map yet): fall
      // back to plain cycle-by-cycle iteration for a while, then try again.
      if (lastWasJump && err > 0.9 * lastErr) {
        nextJump = k + 8;
        lastWasJump = false;
        lastErr = err;
        x = r.xEnd.slice();
        continue;
      }
      lastErr = err;
      if (k >= nextJump && !r.hadOff && a !== undefined && om > 0) {
        x = x.map(function (xj, j) { return (r.xEnd[j] - a * xj) / om; });
        lastWasJump = true;
      } else {
        x = r.xEnd.slice();
        lastWasJump = false;
      }
    }
    return r;
  };

  /** Bisection root finder, used by the test-suite and by textbook formulas. */
  CL.bisect = function (f, lo, hi, iters) {
    let flo = f(lo);
    for (let k = 0; k < (iters || 80); k++) {
      const mid = 0.5 * (lo + hi);
      const fm = f(mid);
      if ((fm < 0) === (flo < 0)) { lo = mid; flo = fm; } else { hi = mid; }
    }
    return 0.5 * (lo + hi);
  };
})(typeof window !== 'undefined' ? window : globalThis);
