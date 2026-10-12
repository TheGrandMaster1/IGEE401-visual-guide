# IGEE401 converter lab

Interactive waveforms and power quantities for the converters in IGEE401.
Drag a slider and the source and load waveforms, the fundamental current, and
every readout (PF, DPF, I<sub>s1</sub>, P<sub>s1</sub>, Q<sub>s1</sub>, S, D, V<sub>dc</sub>, P<sub>dc</sub>, extinction and conduction angle ...) update together.

Live site: <https://thegrandmaster1.github.io/IGEE401-visual-guide/>

## What is covered

| Group | Page | Id |
|---|---|---|
| AC voltage controllers | 1-phase controller, R-L load | `ac1` |
| | 3-phase controller, delta load | `ac3d` |
| | 3-phase controller, star load (floating neutral) | `ac3y` |
| Rectifiers | 1-phase diode bridge | `diode1` |
| | 1-phase thyristor bridge (rectifier and inverter) | `thy1` |
| | 1-phase semi-controlled bridge (2 thyristors, 2 diodes) | `semi1` |
| | 3-phase diode bridge | `diode3` |
| | 3-phase thyristor bridge (rectifier and inverter) | `thy3` |

Rectifier pages have two load models:

* **Constant current**: the textbook assumption (infinitely large inductor). Closed-form results are shown next to the simulated ones.
* **R-L (-E)**: finite inductance, resistance and an optional DC source. Set **L = 0 mH** for a purely resistive load. A negative **E** with firing angle above 90 degrees gives inverter operation.

Any page can be shared as a link that carries the current settings
(the "Copy link" button), for example `#/thy1?alpha=140&mode=rl&E=-100&R=5&L=500`.

## Run it locally

No build step and no dependencies. Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000     # then visit http://localhost:8000
```

Run the checks (needs Node 18 or newer, nothing to install):

```bash
node tests/run.js
```

The tests compare every converter with the textbook formulas (0.9 V<sub>s</sub>, 1.35 V<sub>LL</sub>,
0.816 I<sub>d</sub>, the AC-controller V<sub>o</sub> expressions, the extinction-angle equation ...), then sweep
about 1,500 parameter combinations and require that source power equals load power and that nothing is NaN.

## Publish with GitHub Pages

1. Push this folder to the `main` branch.
2. Repository **Settings > Pages > Build and deployment**: source **Deploy from a branch**, branch **main**, folder **/ (root)**.
3. After a minute the site is live at `https://<user>.github.io/IGEE401-visual-guide/`.

Every later push to `main` redeploys automatically.

## Branches

```
main      what the live site serves. Only tested work lands here.
dev       integration branch. Features merge here first.
feat/*    one branch per feature or new converter      e.g. feat/schematics
fix/*     one branch per bug                           e.g. fix/ac3y-extinction-angle
docs/*    notes and README changes
```

Day-to-day flow:

```bash
git switch dev && git pull
git switch -c feat/my-change          # work, commit often
node tests/run.js                     # must pass
git push -u origin feat/my-change     # open a pull request into dev
# when dev is in good shape: pull request dev -> main (this publishes it)
```

GitHub Actions (`.github/workflows/test.yml`) runs the tests on every push and pull request to `main` and `dev`.

Suggested first feature branches: `feat/schematics` (circuit drawing per page),
`feat/source-inductance` (commutation overlap), `feat/harmonic-spectrum` (bar chart of I<sub>n</sub>).

## Project layout

```
index.html                 page shell
css/style.css              all styling, light and dark themes
js/core/numerics.js        sampling grid, DFT, periodic steady-state solver
js/core/metrics.js         PF, DPF, P, Q, S, D, THD, and the readout table
js/core/registry.js        converter registry and control factories
js/models/acctrl1.js       1-phase AC controller (also the engine for delta)
js/models/acctrl3.js       3-phase delta and star AC controllers
js/models/bridge1ph.js     1-phase diode, thyristor and semi-controlled bridges
js/models/bridge3ph.js     3-phase diode and thyristor bridges
js/ui/plot.js              canvas plotter
js/ui/app.js               sidebar, controls, readouts, routing
tests/run.js               textbook and sweep tests
docs/ADDING_A_CONVERTER.md how to add a page
docs/MODEL_NOTES.md        what each model assumes, and how it switches devices
```

## Conventions

* Angles are radians inside the code and degrees on screen.
* One cycle is 1440 samples (0.25 degree). Sample `n` sits at the middle of step `n`.
* Positive displacement angle phi<sub>1</sub> means the fundamental current **lags** the source voltage.
* Sources are ideal and balanced, devices are ideal (no drop, no overlap). Gates are held for the whole window in which a device could conduct, so a device conducts whenever it is gated and forward biased.
