# Adding a converter page

A page is one call to `CL.register(...)`. The sidebar, controls, plots,
readout table and share links are all generated from that object, so you
write physics only.

## 1. Create the model file

`js/models/my-converter.js`:

```js
(function (g) {
  'use strict';
  const CL = g.CL;

  function simulate(p) {
    // p holds one number or string per control, keyed by control.key
    const Vm = Math.SQRT2 * p.Vs;
    const vs = CL.fill(function (th) { return Vm * Math.sin(th); });   // 1440 samples
    const is = /* your current waveform, Float64Array(1440) */;

    const m = CL.acMetrics([{ v: vs, i: is }]);   // PF, DPF, Is1, P, Q1, S, D, THD ...

    return {
      metrics: Object.assign({}, m, { /* extra keys, see below */ }),
      flow: null,                       // or CL.flow(Pdc, m.S) for rectifier / inverter badge
      textbook: [ /* optional closed-form rows */ ],
      textbookNote: 'Shown when the textbook formula does not apply.',
      panels: [
        CL.panel('vs', 'Source voltage v<sub>s</sub>', 'V',
          [{ name: 'v_s', y: vs, color: 'voltage' }]),
        CL.panel('is', 'Source current', 'A', [
          { name: 'i_s',  y: is,   color: 'current' },
          { name: 'i_s1', y: m.i1, color: 'fund', dash: [7, 4] }
        ])
      ]
    };
  }

  CL.register({
    id: 'my-id',                        // used in the URL: #/my-id
    group: 'Rectifiers',                // sidebar section
    title: 'My converter',
    blurb: 'One sentence under the title (HTML allowed).',
    assumptions: ['Ideal devices.'],
    controls: [CL.CTL.alpha(), CL.CTL.Vs1(), CL.CTL.f()],
    presets: [{ name: 'Example', set: { alpha: 45 } }],
    simulate: simulate
  });
})(typeof window !== 'undefined' ? window : globalThis);
```

## 2. Load it

Add a `<script>` tag for it in `index.html`, after the core scripts and before `js/ui/plot.js`.
Add the file name to the list at the top of `tests/run.js`.

## 3. What `simulate` returns

| Key | Meaning |
|---|---|
| `metrics` | numbers keyed as in `CL.METRIC_GROUPS` (see `js/core/metrics.js`). A key that is missing is hidden. |
| `panels` | list of plots. Each trace is a `Float64Array(CL.N)`. |
| `flow` | `{ kind: 'rectifying' \| 'inverting' \| 'idle', text }` or `null`. |
| `textbook` | rows `{ label, value, unit, sim, dec }`. `sim` names the metric to compare with. |
| `textbookNote` | message shown when `textbook` is `null`. |

Trace options: `name`, `y`, `color` (`voltage`, `current`, `fund`, `dc`, `load`, `ref`, `va`, `vb`, `vc`),
`dash`, `width`, `fill`. A panel can also carry `hlines: [{ y, name, color }]` and
`markers: [{ x: radians, label }]`.

Metrics you may add: `alpha`, `beta`, `sigma`, `mode` (string), `Vdc`, `Idc`, `Pdc`, `Qdc`,
`Vo`, `Io`, `Pload`, `balance`.

## 4. Controls

Use the factories in `js/core/registry.js` (`CL.CTL.alpha`, `Vs1`, `Vll`, `f`, `mode`, `Id`, `R`, `L`, `E`,
`Rload`, `Lload`) and override fields: `CL.CTL.alpha({ value: 60, max: 150 })`.
A custom control is a plain object:

```js
{ key: 'Ls', label: 'Source inductance L<sub>s</sub>', unit: 'mH',
  min: 0, max: 20, step: 0.1, value: 0, showIf: function (p) { return p.mode === 'rl'; } }
```

`type: 'seg'` with `options: [[value, 'label'], ...]` makes a segmented button group instead of a slider.

## 5. Solving a circuit with memory (inductor current)

Do not wait for the transient. Write `run(x0)` that simulates one cycle from state `x0` and
returns `{ xEnd, hadOff }`, then call `CL.solvePeriodic(run, guess, { a, om })` with
`a = exp(-R/(f L))` and `om = 1 - a`. See `js/models/bridge1ph.js` for a complete example.

## 6. Test it

Add checks to `tests/run.js`: compare with a closed form where one exists, and make sure
the parameter sweep at the bottom covers the new page. Run `node tests/run.js`.
