# Health checker — health.humankit.org

## What this is / the goal

An interactive **HumanKit** tool: **"sliders in, metrics out."** The visitor
sets sliders for lifestyle inputs — how much they exercise, what they weigh,
sleep, smoking, alcohol, diet, stress — and gets back estimated metrics such
as **life expectancy, cognitive function, happiness, and disease risk**.

The appeal is playfulness and tangibility: it makes population-level health
research feel personal. The danger is pseudoscience — the rules below are what
keep it honest.

## The hard rules (non-negotiable)

1. **Privacy by design: all inputs stay in the browser.** Never store,
   transmit, or log health inputs — not even "anonymously." Say this on the
   page; it's a selling point.
2. **Every estimate cites its source** — published epidemiological studies,
   actuarial life tables, WHO/Our World in Data statistics. No invented
   coefficients.
3. **Mandatory disclaimer:** these are rough population-level associations for
   education — not medical advice, and not predictions about any individual.
4. **Humility in presentation:** show ranges, not false precision. "Happiness"
   and "cognitive function" rest on weak, correlational research — the design
   must communicate that uncertainty instead of faking exactness.

## Current status

Working v0.2: plain HTML/CSS/JS, zero build step, zero runtime dependencies.

```
index.html          main page: nav, short disclaimer, calculator (inputs/outputs)
sources.html        method, limitations, full disclaimer, reference list
PLAN.md             roadmap + candidate-factor backlog (sources needed)
css/style.css       all styling
js/factors.js       THE MODEL — every number + its citation (see below)
js/engine.js        pure math: values -> estimates (no DOM; also runs in node)
js/app.js           main-page DOM rendering/wiring only; no numbers in this file
js/sources.js       renders the reference list on sources.html
tests/engine.test.js  dependency-free smoke tests: `node tests/engine.test.js`
```

Cloudflare Pages deployment planned, not confirmed. Site is fully static; serve
the repo root and it's deployed.

## The golden rule of the data model

**Every number lives in `js/factors.js`, right next to the study it came
from.** Never put a coefficient in `engine.js` or `app.js`. Each effect has:
`source` (key into the `sources` map with DOI/PMID), `note` (what the study
actually found + any approximation we made), `evidence` (high|moderate|low),
and CI bounds where published. The reference list on sources.html and the
per-estimate citations on index.html are generated from this file, so sources
can never drift away from the numbers. Citation numbers come from
`engine.sourceIndex(model)` — both pages use it, and every `[n]` on the main
page deep-links to `sources.html#ref-n`. To change a number: edit it + its
note/source in the same commit, then run the tests (they audit data
integrity: sorted steps, bracketing CIs, existing sources).

## Design decisions (v0.1, all reversible)

- **Inputs are sliders** (continuous quantities: min/week, g/day, hours,
  drinks…), **segmented controls** (categorical: sex, smoking status), and
  **toggles** (binary: creatine). Weight+height are two sliders feeding a
  derived BMI effect (HR steps from Di Angelantonio 2016).
- **Outputs are NOT sliders** (sliders imply control): life expectancy (big
  number + delta + range), mortality risk (log-scale HR gauge with CI band),
  cognition & happiness (qualitative 5-band meters with deliberately fuzzy
  markers + low-evidence badges). Honest uncertainty > fake precision.
- **Mortality model:** each input contributes a hazard ratio; HRs combine
  multiplicatively (independence assumption, stated on the page), then are
  **clamped to [0.45, 4.0]** because lifestyle effects overlap and naive
  multiplication overclaims. HR → years of life via a Gompertz approximation
  (mortality doubles every 7 y), calibrated so exercise reproduces Moore
  2012's +4.5 y and smoking reproduces Jha 2013's −10 y.
- **Anchoring:** baseline = US life expectancy at birth 2023 (NCHS) by sex;
  personal deltas shift it. Known approximation, stated on the page.
- **Mind outputs** accumulate unitless "points" per input → mapped to bands.
  Near everything here is correlational; badges and copy say so.
- **Defaults ARE the reference profile** (v0.2): reset ⇒ exactly 1.0× HR and
  0-point "about average" bands, so every input shows its own effect.
- **Uncertainty scales with (un)certainty** (v0.2): each effect's CI is
  widened in log space by `uncertaintyWiden` (high ×1 / moderate ×1.5 / low
  ×2.25) before combining; the central estimate is clamped to [0.45, 4.0] but
  the bounds deliberately are not. Mind-output marker fuzz grows per active
  low-evidence contributor.
- **Advanced gated inputs** (v0.2): `vo2maxOn`/`bodyFatOn` toggles unlock
  measured VO2 max (per-MET HR 0.87, Kodama 2009) and body-fat % (J-shaped,
  Jayedi 2022). When enabled they **replace** — never stack with — the cardio
  and BMI estimates (`supersededBy` in the data; engine enforces it).
- **Findings card** (v0.2): `findings` in factors.js holds sourced facts that
  don't fit sliders (disease-specific outcomes, honest nulls like the VITAL
  vitamin-D RCT, caveats); each shows only when its `when(values)` matches.
- **Every verified number was checked against the primary source** (PubMed
  abstracts) on 2026-07-24. Items still needing a second look are marked in
  their `note`: sauna all-cause HRs (verify vs paper Table 2), NCHS baseline
  figures (CDC blocked automated fetch), and a few mind-output effects that
  currently reuse a mortality-focused citation (marked "indirect citation —
  replace with a dedicated source").

## Architecture constraints

- Static, fully client-side. No backend, and **no database — ever, by design.**
- No dependencies required to start. Native `<input type="range">` goes a long
  way; justify any library added later.
- Model the estimates as a small, readable, cited data structure (e.g. a JSON
  of factors with study references) rather than burying magic numbers in code.
- `factors.js`/`engine.js` use a dual-export pattern (browser global +
  CommonJS) so the tests can require them without a bundler.

## Local development

- Serve: `python3 -m http.server 8000` (or any static server) →
  http://localhost:8000. Opening `index.html` directly also works (no modules,
  no fetch).
- Test: `node tests/engine.test.js` — run after any change to `js/factors.js`
  or `js/engine.js`.

## Related

Umbrella project context: `../AGENTS.md` (local-only file). The landing page
links here as `health.humankit.org`.
