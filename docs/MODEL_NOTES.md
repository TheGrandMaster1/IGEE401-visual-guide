# Model notes

What each model assumes, how devices switch, and where it stops being valid.
Check these against your lecture notes: if a course convention differs
(for example where alpha is measured from), change it in one place and run the tests.

## Common to all pages

* Ideal, balanced, sinusoidal source with no source impedance.
* Ideal devices: no forward drop, instant switching, no commutation overlap, no turn-off time.
* Gate model ("wide gating"): a device is gated for the whole window in which it could
  conduct, so it conducts whenever it is gated **and** forward biased. With alpha = 0 this is a diode bridge.
* One cycle is 1440 samples. Inductor current is advanced with an exact exponential step
  (`i' = i e^(-R dt/L) + (v-E)/R (1 - e^(-R dt/L))`), then the periodic steady state is found by
  iterating cycles (with a fast-forward step while no device switches off).

## Quantities

| Symbol | Definition |
|---|---|
| P | mean(v i) summed over phases |
| S | V<sub>rms</sub> I<sub>rms</sub> summed over phases |
| phi<sub>1</sub> | phase of v<sub>1</sub> minus phase of i<sub>1</sub> (positive = lagging) |
| DPF | cos phi<sub>1</sub> |
| PF | P / S |
| Q<sub>s1</sub> | V<sub>1</sub> I<sub>1</sub> sin phi<sub>1</sub> |
| D | sqrt(S<sup>2</sup> - P<sup>2</sup> - Q<sub>s1</sub><sup>2</sup>) |
| Q<sub>dc</sub> | always 0: the DC side carries no reactive power (constant or purely DC current) |
| beta, sigma | end angle and width of the first positive pulse of the source current in phase a |

Three-phase pages report phase quantities for V<sub>s</sub> and line quantities for the current.
The V<sub>LL</sub> control is the line-to-line RMS voltage.

## Rectifier bridges

**1-phase.** The active pair is p = +1 while the T1/T2 gate window (alpha to alpha + 180 deg) is open and
p = -1 in the other window. Fully controlled and diode: v<sub>d</sub> = p v<sub>s</sub>. Semi-controlled (T1, D3, T4, D2):
v<sub>d</sub> = max(0, p v<sub>s</sub>); while p v<sub>s</sub> is negative the load free-wheels through D2 and D3
with i<sub>s</sub> = 0. A pair starts conducting when p v<sub>s</sub> exceeds E, and stops when the load current reaches zero.

**3-phase.** Six 60-degree sectors. Sector boundaries sit at 30, 90, 150 ... degrees plus alpha.
In each sector the conducting pair is the (highest, lowest) phase evaluated at the undelayed angle, so
alpha is measured from the natural commutation point. v<sub>d</sub> = v<sub>top</sub> - v<sub>bottom</sub>.

**Inverter mode.** Needs a DC source in the load. Set E < 0 and alpha > 90 degrees in R-L mode. Commutation
failure (overlap plus the thyristor turn-off margin) is not modelled, so the page never fails near 180 degrees as hardware would.

## AC voltage controllers

**1-phase.** T1 is gated from alpha to alpha + 180, T2 from alpha + 180 to alpha + 360. A thyristor turns on
when gated and forward biased and turns off when the current reaches zero. For an R-L load this gives the
two textbook regimes: alpha <= phi (current continuous and sinusoidal) and alpha > phi (discontinuous).

**3-phase delta.** Three independent 1-phase controllers on v<sub>ab</sub>, v<sub>bc</sub>, v<sub>ca</sub>.
Line current i<sub>a</sub> = i<sub>ab</sub> - i<sub>ca</sub>. alpha is measured from the line-voltage zero crossing.

**3-phase star, no neutral.** At every sample the program decides which phases conduct:

* neutral shift v<sub>nN</sub> = mean of the conducting phase voltages (needs at least two phases);
* a phase fires when gated and forward biased with respect to that neutral shift;
* a phase turns off when its current reverses.

alpha is measured from the phase-voltage zero crossing. With a resistive load the output is zero at alpha = 150 degrees.

## Known limits

* No source or commutation inductance, no device drops, no snubbers.
* The 1440-sample grid limits angle readouts (beta, sigma) to about +/- 0.25 degree.
* Star-connected controller with large L and small R converges slowly; the page still balances power to within about 0.1 percent.
