/*
 * registry.js  -  every converter page registers itself here.
 *
 * A converter is a plain object:
 *   {
 *     id:        'thy1',                       (used in the URL: #/thy1)
 *     group:     'Rectifiers',                 (sidebar section)
 *     title:     '1-phase thyristor bridge',
 *     blurb:     'One sentence shown under the title.',
 *     assumptions: ['ideal devices', ...],     (shown in the notes box)
 *     controls:  [ CL.CTL.alpha(), ... ],      (see factories below)
 *     presets:   [ { name, set:{...} } ],      (optional one-click setups)
 *     simulate:  function (params) -> result   (see docs/ADDING_A_CONVERTER.md)
 *   }
 */
(function (g) {
  'use strict';
  const CL = g.CL;

  const list = [];
  CL.register = function (c) { list.push(c); };
  CL.converters = function () { return list.slice(); };
  CL.get = function (id) {
    for (let k = 0; k < list.length; k++) if (list[k].id === id) return list[k];
    return null;
  };
  CL.groups = function () {
    const out = [];
    list.forEach(function (c) {
      let grp = out.find(function (x) { return x.name === c.group; });
      if (!grp) { grp = { name: c.group, items: [] }; out.push(grp); }
      grp.items.push(c);
    });
    return out;
  };

  const isRL = function (p) { return p.mode === 'rl'; };
  const isCC = function (p) { return p.mode === 'cc'; };

  /** Control factories. Pass overrides as the first argument. */
  CL.CTL = {
    alpha: function (o) {
      return Object.assign({ key: 'alpha', label: 'Firing angle &alpha;', unit: '&deg;',
        min: 0, max: 180, step: 1, value: 30 }, o);
    },
    Vs1: function (o) {
      return Object.assign({ key: 'Vs', label: 'Source V<sub>s</sub> (rms)', unit: 'V',
        min: 20, max: 480, step: 1, value: 120 }, o);
    },
    Vll: function (o) {
      return Object.assign({ key: 'Vs', label: 'Line voltage V<sub>LL</sub> (rms)', unit: 'V',
        min: 50, max: 700, step: 1, value: 208 }, o);
    },
    f: function (o) {
      return Object.assign({ key: 'f', label: 'Frequency', unit: 'Hz', type: 'seg',
        options: [[50, '50'], [60, '60']], value: 60 }, o);
    },
    mode: function (o) {
      return Object.assign({ key: 'mode', label: 'Load model', type: 'seg',
        options: [['cc', 'Constant current'], ['rl', 'R&ndash;L (&ndash;E)']], value: 'cc' }, o);
    },
    Id: function (o) {
      return Object.assign({ key: 'Id', label: 'DC current I<sub>d</sub>', unit: 'A',
        min: 1, max: 60, step: 0.5, value: 10, showIf: isCC }, o);
    },
    R: function (o) {
      return Object.assign({ key: 'R', label: 'Resistance R', unit: '&Omega;',
        min: 0.5, max: 100, step: 0.5, value: 10, showIf: isRL }, o);
    },
    L: function (o) {
      return Object.assign({ key: 'L', label: 'Inductance L', unit: 'mH',
        min: 0, max: 2000, step: 5, value: 200, showIf: isRL,
        hint: '0 mH makes the load purely resistive.' }, o);
    },
    E: function (o) {
      return Object.assign({ key: 'E', label: 'DC source E', unit: 'V',
        min: 0, max: 200, step: 1, value: 0, showIf: isRL }, o);
    },
    /** Always-visible R and L for the AC controllers. */
    Rload: function (o) {
      return Object.assign({ key: 'R', label: 'Resistance R', unit: '&Omega;',
        min: 0.5, max: 100, step: 0.5, value: 10 }, o);
    },
    Lload: function (o) {
      return Object.assign({ key: 'L', label: 'Inductance L', unit: 'mH',
        min: 0, max: 500, step: 1, value: 40,
        hint: '0 mH makes the load purely resistive.' }, o);
    }
  };

  /** Default parameter object built from a converter's controls. */
  CL.defaults = function (c) {
    const p = {};
    c.controls.forEach(function (ct) { p[ct.key] = ct.value; });
    return p;
  };
})(typeof window !== 'undefined' ? window : globalThis);
