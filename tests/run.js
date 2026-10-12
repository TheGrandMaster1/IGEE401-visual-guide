/*
 * Run with:  node tests/run.js        (or: npm test)
 *
 * No dependencies.  Loads the same files the browser loads, then checks
 *   1. every converter against the closed-form textbook results,
 *   2. power balance (source power = load power) over a parameter sweep,
 *   3. that nothing returns NaN or throws anywhere in the slider ranges.
 */
'use strict';
const path = require('path');
const root = path.join(__dirname, '..', 'js');
['core/numerics', 'core/metrics', 'core/registry',
  'models/acctrl1', 'models/acctrl3', 'models/bridge1ph', 'models/bridge3ph']
  .forEach(function (f) { require(path.join(root, f + '.js')); });
const CL = globalThis.CL;
const PI = Math.PI, D2R = PI / 180;

let passed = 0, failed = 0;
function check(name, got, want, tol) {
  const ok = Math.abs(got - want) <= tol;
  if (ok) passed++; else failed++;
  console.log((ok ? '  ok    ' : '  FAIL  ') + name + '   got ' + got.toFixed(4) + '   want ' + want.toFixed(4) + '   (tol ' + tol + ')');
}
function section(t) { console.log('\n' + t); }

/* ------------------------------------------------------------ 1-phase bridges */
section('1-phase diode bridge, constant current (Vs=120 V, Id=10 A)');
let m = CL._bridge1('diode', { Vs: 120, f: 60, mode: 'cc', Id: 10 }).metrics;
check('Vdc = 0.9 Vs', m.Vdc, 0.9 * 120, 0.3);
check('Is = Id', m.Is, 10, 0.01);
check('Is1 = 0.9 Id', m.Is1, 9, 0.02);
check('THD = 48.3 %', m.thd, 48.34, 0.1);
check('PF = 0.9', m.pf, 0.9, 0.002);

section('1-phase thyristor bridge, constant current, alpha = 60');
m = CL._bridge1('thy', { Vs: 120, f: 60, mode: 'cc', Id: 10, alpha: 60 }).metrics;
check('Vdc = 0.9 Vs cos(alpha)', m.Vdc, 0.9 * 120 * 0.5, 0.3);
check('phi1 = alpha', m.phi1, 60, 0.2);
check('PF = 0.9 cos(alpha)', m.pf, 0.45, 0.002);
check('Pdc = P_source', m.Pdc, m.P, 0.5);

section('1-phase thyristor bridge, inverter (alpha = 140, E = -100, R-L)');
m = CL._bridge1('thy', { Vs: 120, f: 60, mode: 'rl', R: 5, L: 500, E: -100, alpha: 140 }).metrics;
check('Vdc ~ 0.9 Vs cos(alpha)', m.Vdc, 0.9 * 120 * Math.cos(140 * D2R), 0.5);
check('Pdc is negative (inverting)', m.Pdc < 0 ? 1 : 0, 1, 0);
check('Pdc = P_source', m.Pdc, m.P, 1);

section('1-phase semi-controlled bridge, constant current, alpha = 60');
m = CL._bridge1('semi', { Vs: 120, f: 60, mode: 'cc', Id: 10, alpha: 60 }).metrics;
check('Vdc = 0.45 Vs (1 + cos alpha)', m.Vdc, 0.45 * 120 * 1.5, 0.3);
check('Is = Id sqrt(1 - alpha/pi)', m.Is, 10 * Math.sqrt(1 - 1 / 3), 0.02);
check('Is1 = 0.9 Id cos(alpha/2)', m.Is1, 9 * Math.cos(30 * D2R), 0.03);
check('phi1 = alpha/2', m.phi1, 30, 0.2);
check('Qs1 = 0.45 Vs Id sin(alpha)', m.Qs1, 0.45 * 120 * 10 * Math.sin(60 * D2R), 2);

section('1-phase bridges: large L reproduces the ideal-current result');
const a = CL._bridge1('thy', { Vs: 120, f: 60, mode: 'rl', R: 10, L: 20000, E: 0, alpha: 30 }).metrics;
check('Vdc (L = 20 H) = 0.9 Vs cos(alpha)', a.Vdc, 0.9 * 120 * Math.cos(30 * D2R), 0.3);
check('THD (L = 20 H) = 48.3 %', a.thd, 48.34, 0.3);

section('1-phase bridge, resistive load, alpha = 60  (Vdc = Vm/pi (1 + cos alpha))');
m = CL._bridge1('thy', { Vs: 120, f: 60, mode: 'rl', R: 10, L: 0, E: 0, alpha: 60 }).metrics;
check('Vdc', m.Vdc, (Math.SQRT2 * 120 / PI) * 1.5, 0.3);

/* ------------------------------------------------------------ 3-phase bridges */
section('3-phase diode bridge, constant current (VLL=208 V, Id=10 A)');
m = CL._bridge3('diode', { Vs: 208, f: 60, mode: 'cc', Id: 10 }).metrics;
check('Vdc = 1.35 VLL', m.Vdc, 3 * Math.SQRT2 / PI * 208, 0.3);
check('Is = 0.816 Id', m.Is, Math.sqrt(2 / 3) * 10, 0.01);
check('Is1 = 0.78 Id', m.Is1, Math.sqrt(6) / PI * 10, 0.01);
check('THD = 31.1 %', m.thd, 31.08, 0.2);
check('PF = 3/pi', m.pf, 3 / PI, 0.002);

section('3-phase thyristor bridge, constant current, alpha = 30');
m = CL._bridge3('thy', { Vs: 208, f: 60, mode: 'cc', Id: 10, alpha: 30 }).metrics;
check('Vdc = 1.35 VLL cos(alpha)', m.Vdc, 3 * Math.SQRT2 / PI * 208 * Math.cos(30 * D2R), 0.3);
check('phi1 = alpha', m.phi1, 30, 0.3);
check('PF = (3/pi) cos(alpha)', m.pf, 3 / PI * Math.cos(30 * D2R), 0.003);

section('3-phase thyristor bridge, resistive load, alpha = 90  (Vdc = 1.35 VLL [1 + cos(alpha + 60)])');
m = CL._bridge3('thy', { Vs: 208, f: 60, mode: 'rl', R: 10, L: 0, E: 0, alpha: 90 }).metrics;
check('Vdc', m.Vdc, 3 * Math.SQRT2 / PI * 208 * (1 + Math.cos(150 * D2R)), 0.3);

section('3-phase thyristor bridge, inverter (alpha = 140, E = -260, R-L)');
m = CL._bridge3('thy', { Vs: 208, f: 60, mode: 'rl', R: 5, L: 500, E: -260, alpha: 140 }).metrics;
check('Pdc is negative (inverting)', m.Pdc < 0 ? 1 : 0, 1, 0);
check('Pdc = P_source', m.Pdc, m.P, 2);

/* --------------------------------------------------------------- AC controllers */
section('1-phase AC controller, resistive load (Vs = 120 V, R = 10)');
[30, 90, 150].forEach(function (al) {
  m = CL._acctrl1({ Vs: 120, f: 60, R: 10, L: 0, alpha: al }).metrics;
  const k = Math.sqrt(1 - al * D2R / PI + Math.sin(2 * al * D2R) / (2 * PI));
  check('Vo at alpha = ' + al, m.Vo, 120 * k, 0.3);
  check('PF at alpha = ' + al, m.pf, k, 0.005);
});

section('1-phase AC controller, R-L load (R = 10, L = 80 mH -> phi = 71.7 deg)');
m = CL._acctrl1({ Vs: 120, f: 60, R: 10, L: 80, alpha: 30 }).metrics;
const Z = Math.hypot(10, 2 * PI * 60 * 0.08);
check('alpha < phi: Io = Vs / Z', m.Io, 120 / Z, 0.01);
check('alpha < phi: Vo = Vs', m.Vo, 120, 0.1);

section('1-phase AC controller: extinction angle for alpha > phi (R = 10, L = 40 mH)');
const w = 2 * PI * 60 * 0.04, phi = Math.atan2(w, 10), al = 100 * D2R;
const t = Math.tan(phi);
const beta = CL.bisect(function (b) { return Math.sin(b - phi) - Math.sin(al - phi) * Math.exp(-(b - al) / t); }, PI, PI + al, 100);
m = CL._acctrl1({ Vs: 120, f: 60, R: 10, L: 40, alpha: 100 }).metrics;
check('beta', m.beta, beta / D2R, 0.5);

section('3-phase delta controller, resistive load (VLL = 208 V, R = 10)');
m = CL._acctrl3d({ Vs: 208, f: 60, R: 10, L: 0, alpha: 60 }).metrics;
const kd = Math.sqrt(1 - 60 * D2R / PI + Math.sin(120 * D2R) / (2 * PI));
check('Vo = VLL sqrt(...)', m.Vo, 208 * kd, 0.3);
check('P = 3 Vo^2 / R', m.P, 3 * Math.pow(208 * kd, 2) / 10, 15);

section('3-phase star controller, resistive load (0 <= alpha <= 60)');
[0, 30, 60].forEach(function (a2) {
  m = CL._acctrl3y({ Vs: 208, f: 60, R: 10, L: 0, alpha: a2 }).metrics;
  const ar = a2 * D2R;
  const ks = Math.sqrt(1 - 3 * ar / (2 * PI) + 3 * Math.sin(2 * ar) / (4 * PI));
  check('Vo at alpha = ' + a2, m.Vo, (208 / Math.sqrt(3)) * ks, 0.3);
});
m = CL._acctrl3y({ Vs: 208, f: 60, R: 10, L: 0, alpha: 150 }).metrics;
check('Vo at alpha = 150 is ~0', m.Vo, 0, 0.5);

/* ---------------------------------------------------------------- sweep */
section('Parameter sweep: no NaN, power balance holds');
let runs = 0, bad = 0, worst = 0;
function finite(o, tag) {
  Object.keys(o).forEach(function (k) {
    if (typeof o[k] === 'number' && !isFinite(o[k])) { bad++; console.log('  FAIL  non-finite ' + k + ' in ' + tag); }
  });
}
CL.converters().forEach(function (c) {
  const alphas = c.controls.some(function (x) { return x.key === 'alpha'; }) ? [0, 20, 45, 60, 90, 120, 150, 175] : [0];
  const modes = c.controls.some(function (x) { return x.key === 'mode'; }) ? ['cc', 'rl'] : [undefined];
  const Ls = [0, 5, 50, 300, 2000];
  const Rs = [1, 10, 60];
  const Es = c.controls.some(function (x) { return x.key === 'E'; }) ? [-150, 0, 60] : [0];
  alphas.forEach(function (alpha) {
    modes.forEach(function (mode) {
      (mode === 'cc' ? [0] : Ls).forEach(function (L) {
        (mode === 'cc' ? [10] : Rs).forEach(function (R) {
          (mode === 'cc' ? [0] : Es).forEach(function (E) {
            const p = CL.defaults(c);
            p.alpha = alpha; if (mode) p.mode = mode; p.L = L; p.R = R; p.E = E;
            if (c.id === 'diode1' || c.id === 'semi1' || c.id === 'diode3') p.E = Math.max(0, E);
            runs++;
            let res;
            try { res = c.simulate(p); } catch (e) { bad++; console.log('  FAIL  threw in ' + c.id + ' ' + JSON.stringify(p) + ': ' + e.message); return; }
            finite(res.metrics, c.id + ' ' + JSON.stringify(p));
            const ref = res.metrics.Pdc !== undefined ? res.metrics.Pdc : res.metrics.Pload;
            const err = Math.abs(res.metrics.P - ref);
            const rel = err / Math.max(res.metrics.S, 1);
            worst = Math.max(worst, rel);
            if (rel > 0.012) { bad++; console.log('  FAIL  balance ' + c.id + ' ' + JSON.stringify(p) + ' err ' + err.toFixed(2) + ' W'); }
          });
        });
      });
    });
  });
});
console.log('  ' + runs + ' runs, ' + bad + ' problems, worst balance error ' + (100 * worst).toFixed(3) + ' % of S');
if (bad === 0) passed++; else failed++;

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
