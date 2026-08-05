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
js/schema.js        conflation schema/API: OUTPUTS, conflationGroups,
                    displayName/esc/shortLabel, auditModel (read by all JS)
js/engine.js        pure math: values -> estimates (no DOM; also runs in node)
js/app.js           main-page DOM rendering/wiring only; no numbers in this file
js/sources.js       renders the reference list on sources.html
tests/engine.test.js  dependency-free smoke tests: `node tests/engine.test.js`
tests/audit.js      standalone runner for schema.auditModel: `node tests/audit.js`
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
page deep-links to `sources.html#ref-n`. The topic chips on sources.html are
derived by `engine.sourceTags(model)` (same walk, so a source's subjects can
never drift from its citations). To change a number: edit it + its
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
- **Average-person anchoring** (v0.3): defaults = population averages (US,
  noted per input). `engine.evaluate` normalizes by the average profile
  (`averageEval` cache): **1.0× = the average person**, reset ⇒ exactly
  baseline LE, and all chips/contributions show `hrDelta`/`pointsDelta` vs
  the input's average value. The studies' reference strata ("monk profile")
  are an internal detail (`evaluateRaw`) — never displayed. (US LE is ~4–6 y
  BELOW other high-income countries; non-US baselines are a roadmap item.)
- **Uncertainty scales with (un)certainty** (v0.2/v0.3): each effect's CI is
  widened in log space by `uncertaintyWiden` (high ×1 / moderate ×1.5 / low
  ×2.25), then combined **in quadrature** (independence assumption) and
  applied around the clamped central estimate [0.45, 4.0]. Mind-output marker
  fuzz grows per active low-evidence contributor.
- **Advanced gated inputs** (v0.2): `vo2maxOn`/`bodyFatOn` toggles unlock
  measured VO2 max (per-MET HR 0.87, Kodama 2009) and body-fat % (J-shaped,
  Jayedi 2022). When enabled they **replace** — never stack with — the cardio
  and BMI estimates (`supersededBy` in the data; engine enforces it).
- **Findings card** (v0.2): `findings` in factors.js holds sourced facts that
  don't fit sliders (disease-specific outcomes, honest nulls like the VITAL
  vitamin-D RCT, caveats); each shows only when its `when(values)` matches.
- **Cancer output** (v0.4): a second HR card combining ONLY inputs with
  cancer-specific effect sizes (`output: 'cancer'` in factors.js); all others
  are listed on the card as "no data yet" (`result.cancer.noData`). Same
  normalization/clamp/quadrature path as mortality, no years translation.
  Overlap with all-cause mortality is stated on the card. Functional outcomes
  (osteoporosis, falls, injury nulls) are findings, not an output — sourced
  from Howe 2011, Sherrington 2019, Rong 2016, Leong 2015.
- **CVD output** (v0.5/v0.6): a 6th HR card following the cancer pattern
  exactly. CVD-specific effect sizes extracted from the same primary sources
  (~24 inputs with CVD data from Arem 2015, Momma 2022, Biswas 2015, Wood 2018,
  Jha 2013, et al.). BMI CVD data stored in `model.bmi.cvd` (separate steps
  array from the all-cause BMI data). Same quadrature/widening/clamp/noData
  path. Supersession works (VO2max replaces cardio, body fat replaces BMI).
- **Overlap rule** (v0.5): when two candidate factors share the same causal
  pathway, keep the one with the cleaner dose-response and credit the other
  in a finding — never multiply both. Applied to whole grains (cut, overlaps
  fiber). Similar partial overlaps are noted in `note` fields: resting heart
  rate ↔ cardio/VO2max; grip ↔ strength training; sleep regularity ↔ sleep
  duration.
- **Screen time is a mind-only input** (v0.7): recreational screen time
  (slider, h/day) affects ONLY happiness (Hunt 2018 RCT, Allcott 2020 RCT,
  Zhai 2015 meta — direction consistent, magnitude genuinely contested, so
  points are small and evidence is `low`). Its mortality/CVD pathway is
  sedentary behaviour, so the overlap rule applies: counted by `sitting` +
  fitness inputs, credited in findings (Stamatakis 2011; Celis-Morales 2018,
  incl. the fitness-attenuation nuance), never multiplied. Sleep displacement
  is a finding (Hale 2015), not an effect — the sleep sliders already count
  it. No credible cancer/cognition data, so it shows as no-data on those
  cards. A separate "doomscrolling" input was rejected (only correlational
  scale-development studies exist).
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
- `factors.js`/`schema.js`/`engine.js` use a dual-export pattern (browser
  global + CommonJS) so the tests can require them without a bundler. Script
  load order on both pages: factors.js → schema.js → engine.js → page script.

## Local development

- Serve: `python3 -m http.server 8000` (or any static server) →
  http://localhost:8000. Opening `index.html` directly also works (no modules,
  no fetch).
- Test: `node tests/engine.test.js` — run after any change to `js/factors.js`
  or `js/engine.js`.

## Related

Umbrella project context: `../AGENTS.md` (local-only file). The landing page
links here as `health.humankit.org`.


# You need to be currently working on:

We are working on implementing a fix for the conflating variables / double counting / correlation of seperate inputs problem, as described as 'The conflation problem' in PLAN.md, read it. We are working on implementing a fix / larger refactor to the engine/model to fix the issue. PLAN.md and todo.md are written by AI, only AGENTS.md is written by a human, so you can take the PLAN.md and todo.md with grains of salt if they say something you find questionable, double check it, it may be a hallucination.

PRIME DIRECTIVE (YOUR BREAD AND BUTTER IN THIS WORKFLOW, NEVER FORGET THESE INSTRUCTIONS EXACTLY. THIS IS ALSO REPEATED IN AGENTS.md, SO ALWAYS READ THAT). DO THE FOLLOWING:
1. Read AGENTS.md, PLAN.md
2. Identify the next step still yet to do in todo.md. Only work on one step at a time, and denote when you are finished with a step as soon as you are finished with a step. Don't wait until later.
3. Construct a plan on how to get the next step into our current code. What needs to be modified? What needs to be touched? How does it fit into our current code? Our current model/infrastructure? Will something major need changing? If part of implementing this next step requires creating sub-steps in todo.md, DO THAT and return to '2.'. Seriously, don't hesitate to create substeps, especially for larger changes, or creating steps to "construct new plans" or "research x" or "look up data on z" or "look into y code framework" or non-code related stuff. It needs to be done as a software engineer would do it. If the entire implementation process plan doesn't run into issues, that's also fine, you don't need to make more steps if you don't need to.
4. Once you have a concrete plan on how to implement something, implement it. If you run into issues, either make a note and new steps in todo.md and revert, or add it as the next step in todo.md.
5. Go back to step 1 until all tasks are finished.

Try to work out of todo.md, always leaving clear instructions as often as you can. Work as a software engineer would, not just coding on the fly, but once a seperate unanticipated issue is run into, go back and construct plans and ideas around it to get a well-functioning robust fix. You specifically track your work in todo.md as you are an AI agent and may suddenly run out of context, hence the IMPORTANCE of tracking everything you do structuredly in todo.md.
