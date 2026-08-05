# PLAN — health.humankit.org

Living document. Update as things ship or priorities change. Nothing here
overrides the hard rules in AGENTS.md. Where things live: the verified
evidence base is in **research.md** (organised by cluster); the conflation
schema/API is the authoritative structure in **js/schema.js**; every number
lives in **js/factors.js** next to its citation; the engine is **js/engine.js**.

## North star

Make population-level health research **tangible and personal** — sliders in,
metrics out — while staying **boringly honest**: every number cited, every
uncertainty visible, nothing stored anywhere.

Our priorities (in order):
1. A realistic/accurate overview of what variables affect health, and by how
   much, realistically.
2. ALWAYS and ONLY source from real science.
3. As accurate metrics as we can give (with caveats and disclaimers noted, as
   this gets harder when combining multiple inputs).

## Working agreements

1. **Sources first, code second.** A number only enters `js/factors.js` after
   someone has read the primary source and written a `note` summarising what
   it actually found (plus any approximation). Verification happens in the
   same commit as the number.
2. **Honest nulls are features.** "Vitamin D supplements did nothing in a
   26k-person RCT" is as valuable as a big effect. Nulls get shown, usually as
   a finding.
3. **Uncertainty is UI.** Ranges, fuzz, evidence badges — never a single
   precise-looking number where the science is imprecise.
4. **Reference-profile defaults.** Reset ⇒ exactly 1.0× and "about average".
5. **Small diffs, tests green.** `node tests/engine.test.js` after every model
   change; `node tests/audit.js` after data-structure changes.

## Current model — "joint-estimate-first" (v0.9, shipped)

### The problem it solved (why the combination rules exist)

The old model multiplied each study's *marginal* HR by every other's. That is
only correct for *partial* effects; our meta-analysis HRs attribute each
factor's whole association to that factor, so the products overclaimed badly
(a "merely healthy" profile hit −93% and pinned the 0.45 clamp). Three bugs:
marginal-vs-partial effects (eight diet sliders are one "diet quality" trait),
shared-mediator double-charging (exercise through BMI, billed again by the BMI
slider), and ignored interactions (sitting attenuates at high activity). The
fix: **combine each cluster via the best published JOINT estimate; multiply
across clusters only; never combine clusters with no joint evidence.** See
research.md for the full verified evidence.

### The fair/unfair boundary (the model's constitution; also on sources.html)

| Zone | Rule | Where it applies |
|------|------|------------------|
| **Fair multiplication** | multiply marginal HRs, uncertainty only | across clusters (movement × diet × mind × substances × sleep are different exposure domains, modestly correlated) — justified by Ezzati 2003's qualifier (research.md §1.1) |
| **Fair** | coefficients from the published joint model (no per-slider multiplication) | within clusters *inside* a joint model (diet score; PA×sitting; PA×strength; PA×sleep; PA×adiposity) |
| **Unfair multiplication** | within clusters with no joint model — marginal HRs multiplied | must be replaced by a joint estimate or moved to per-lever |
| **No combination** | per-lever only; no cluster total, no combined claim | psychosocial (purpose, stress, social, sleepRegularity); screen→happiness already treated this way |

### Live structures (source of truth: `js/factors.js`; rendered by sources.html)

- **`jointModels`** (5, each owns a cluster; first-owner rule — an input's HR
  is counted by at most one joint model; cluster totals replace member
  marginals, never stack):
  - `dietScore` — PURE-style score, members [fiber, fruitVeg, nuts, fish],
    per-point HR 0.91, score gradient (research.md §2).
  - `ekelundTable` — PA×sitting, members [cardio, steps, sitting], mortality
    only, `calibrate: true` (research.md §3.1).
  - `mommaCells` — aerobic×strength, members [strength], ratio-mode (PA row
    divided away), mortality+cancer+cvd (research.md §3.2).
  - `duncanCells` — PA×sleep, members [sleep], ratio-mode, mortality only
    (research.md §3.3).
  - `mayoCells` — PA×adiposity, members [bmi, bodyFat], ratio-mode,
    `calibrate: true`, all three HR outputs (research.md §4.1).
- **`overlaps`** (8 live pairs; ρ in factors.js; ρU = 0.5·ρ unless a direct
  estimate exists):
  - processedMeat↔dietScore ρ0.3 · ssb↔dietScore ρ0.15 · magnesium↔dietScore
    ρ0.5 · duncanCells↔dietScore ρ0.10 · rhr↔ekelundTable ρ0.15 ·
    sunExposure↔ekelundTable ρ0.10 · snus↔alcohol ρ0.15 · vaping↔alcohol
    ρ0.10. (Justifications: research.md §2.4/§6/§7.)
- **`perLeverOnly`**: psychosocial {purpose, stress, social, sleepRegularity}
  — excluded from all HR products; mind points still accumulate.

The machine-readable schema (shapes, ownership rules, blend rule, audit) is in
**js/schema.js**; the engine passes are eval → blend → accumulate in
**js/engine.js**.

### Key design decisions (don't undo without re-deriving; evidence in research.md)

1. **Joint-estimate-first**: a published joint estimate replaces marginal
   multiplication wherever one exists; ρ is the fallback for residual pairs,
   not the default mechanism.
2. **Ratio-mode for shared axes**: Momma's aerobic row, Duncan's PA row, and
   Mayo's PA row are *divided away* so each output prices aerobic/PA exactly
   once (the owning table keeps the gradient). Discovered via probe: cardio
   0→300 used to move Ekelund ×0.824 AND Momma ×0.706 (combined ×0.582 vs
   Arem's 0.63).
3. **`calibrate: true`** re-anchors a cluster total to its members' marginal
   product at DEFAULTS (constant log-space offset). This is what keeps
   reset ⇒ exactly 1.0× / baseline LE. Ekelund (~92% off) and Mayo (~26% off)
   need it; Momma (~8%) doesn't.
4. **Psychosocial = per-lever-only, not ρ**: no joint model exists
   (research.md §5.1); pairwise ρ does not compose in dense triangles
   (double-discounts), so the structural removal is used instead.
5. **ρ does two jobs** — point blend (weaker effect ×(1−ρ) in log space) and
   covariance (2·ρU·σᵢ·σⱼ in the quadrature). Redundancy share ≠ error
   correlation; methodology copy says so. Blend rule: when both members of a
   pair are active, the weaker |log HR| is discounted by ρ (ρ=1 ⇒ stronger
   alone, ρ=0 ⇒ independent).
6. **Bounds endpoints** (independence = full product; redundancy = strongest
   effect per cluster) are ASSUMPTION-space labels ("the range of our models'
   answers"), not truth bounds. Blend is monotone, so the point always lies
   between the endpoints for pair groups; joint-model totals are lookups and
   may sit outside (they are evidence).
7. **Clamp [0.45, 4.0]** is a safety net only; the joint curves should keep a
   regular healthy person mid-range. Reset invariant = baseline LE.
8. **Supersession works inside joint axes**: `vo2maxOn` retires cardio from
   the PA axes (steps stay, so the axis doesn't collapse; Kodama marginal
   carries fitness); `bodyFatOn` switches the mayo adiposity axis to BF rows.
9. **Calibration anchors are pre-registered and frozen** (research.md §1.4):
   a failed test is recorded and widens uncertainty — never silently tuned.
10. **Simple/Advanced toggle** (in flight — Working TODO, Phase 5.5): SIMPLE =
    the same audited factors.js with jointModels/overlaps/perLeverOnly emptied
    — NOT a data rollback (the 0.9 sweep removed fabricated numbers; old
    engine.js must not be restored).

### Calibration status

Phase 3.6 (2026-08-02): the Li 2018 anchor ratio = **0.112 vs band
[0.22, 0.31]**; Sun 2022 band also fails. Recorded as an honest FAIL per the
pre-registration — coefficients/mapping/bands frozen, no ρ tuned to force it,
uncertainty widened instead. Attribution probe: the residual overclaim sits in
the cross-cluster "fair zone" (smoking 0.345, diet 0.423 at the anchor
contrast). This is the known remaining caveat. Full record: research.md §1.4.

## Where the numbers come from

Every effect in `js/factors.js` carries `source` (key into the sources map
with DOI/PMID), `note` (what the study found + our approximation), `evidence`
(high|moderate|low), and CI bounds. Citation numbers come from
`engine.sourceIndex(model)`; both pages generate their reference lists and
topic chips from it, so sources can never drift from numbers. **Change a
number only after reading the primary source AND the research.md section for
that cluster**; edit the number + its note/source in the same commit, run
`node tests/engine.test.js` + `node tests/audit.js`.

## Roadmap

### In flight (live task list: Working TODO at the bottom of this file)
- **Phase 4.5** — main-page conflation disclosure: card-level cluster notes,
  More-panel header note, per-input transparency table on sources.html.
- **Phase 5.5** — Simple/Advanced model toggle.

### Next (needs sourcing/design)
- Replace indirect citations for mind outputs with dedicated sources.
- Age input → age-conditional actuarial engine (baseline LE at current age
  instead of at birth).
- Sex-specific body-fat and VO2max curves.
- Deploy to Cloudflare Pages; add a `humans.txt`/about blurb.

### Later (ideas, no commitment)
- URL-hash state encoding for sharing profiles (client-side, analytics-free).
- Per-disease risk outputs (CVD, T2D, dementia) once enough disease-specific
  effects are sourced.
- Non-US baseline selection.
- Accessibility audit; print/PDF summary.

### Deferred (from the conflation work)
- GBD pathway apportionment; own-cohort analysis; full Q1/Q2 split +
  importance framing; Monte Carlo covariance default (if the analytic form
  proves insufficient).

## Candidate inputs backlog

Each needs: primary source → verified effect size → step/point design. Do not
add without that. Roughly ordered by expected evidence quality.

**Done:** processed/red meat (Pan 2012), sugar-sweetened beverages (Malik
2019), fish/omega-3 (Kwok 2019 + VITAL null), sitting time (Biswas 2015),
purpose in life (Cohen 2016), grip strength (Leong 2015), nuts (Aune 2016),
whole grains (CUT — overlaps fiber; finding only), resting heart rate (Aune
2017), sleep regularity (Windred 2024), air pollution PM2.5 (Di 2017), screen
time (Hunt 2018 + Allcott 2020, happiness only), vaping (Xie 2024, Berlowitz
2022, Kundu 2025, Novak 2024, Kang 2024).

**Ready to source / candidate:** unprocessed red meat (Pan 2012 has it, 1.13
— add as second slider?); protein intake esp. 65+ (U-shaped); sodium/potassium
ratio (strong for BP); sleep regularity already sourced (above); volunteering;
nature/green-space; shift work (IARC 2A); loneliness as distinct from social
time (Holt-Lunstad 2015); multivitamin (RCTs mostly null — candidate
honest-null); dental hygiene/flossing (confounded); handgrip dynamometer
(duplicate of grip); blood pressure/lipids/HbA1c (strong actuarial but
clinical — design decision); education/income (strong but not changeable
levers — context at most); ultra-processed food share; yoga/tai chi; cold
exposure; psychedelics (both likely findings-only); crack/cocaine/heroin
(needs research); Teflon vs steel pan (needs research).

## Explicit non-goals

- **No accounts, no storage, no backend.** Health inputs never leave the tab.
- **No medical-adjacent advice** (drug dosing, supplement stacks beyond what
  sources support, "see a doctor if X" triage logic).
- **No disease-risk precision theater.** If a number can't be honestly
  sourced, it goes in findings as qualitative text or not at all.

---

# Working TODO — current work (merged from the former todo.md)

Status markers: `[ ]` not started · `[~]` in progress · `[x]` done.
**One step at a time.** After any change to `js/factors.js` or `js/engine.js`
run `node tests/engine.test.js`; run `node tests/audit.js` after
data-structure changes; `node --check` on any edited JS. Update this section
the moment a step finishes; when you hit an unanticipated issue, write a new
step here about it and work from there.

Dev gotchas (learned the hard way):
- JSON deep-clones corrupt `max: Infinity` steps (JSON → null) — tests must
  shallow-copy models.
- This TODO section was reverted mid-session once (concurrent process?); if
  edits vanish, re-apply and continue — the `js/*` code is the source of truth
  and survives.

## Status of the conflation work — the big fix is DONE

- **Phase 0–3 [x]** — v0.9 conflation fix shipped: joint models for
  diet/movement/adiposity, 8 overlap ρ pairs, psychosocial per-lever-only.
  Attribution probe went from −93.6% naive ratio (floor-pinned) to −66% with
  no clamp pinning. Architecture + design decisions: "Current model" above.
  Evidence: research.md.
- **Phase 4 [x]** — presentation: generated conflation table + per-slider
  disclosures ("counted at X% — overlaps Y", "counted via …") + methodology
  copy (fair/unfair table, Ezzati qualifier, bounds labeled assumption-space).
- **Phase C/C2 [x]** — cleanup: `js/schema.js` owns OUTPUTS/conflationGroups/
  displayName/esc/auditModel (dual-export; loaded factors → schema → engine);
  engine de-tangled (pure blendOverlaps, conflationGroups, accumulateHr);
  output markup in a `<template id="outputs-template">` in index.html; tests
  renumbered to 26 sections with headers.
- **Phase 4.5 [~]** — main-page conflation disclosure: audit done; steps below.
- **Phase 5.5 [ ]** — Simple/Advanced model toggle; steps below.
- **Phase 5** — deferred (list at the end).

## Phase 4.5 — UI disclosure of conflation (chips / More panels)

### 4.5.1 Audit [x] (2026-08-03, /tmp/opencode/ui_probe.js)

Findings: (a) chips/More rows already render CONFLATION-ADJUSTED values
(overlap-blends tagged "counted at X% — overlaps Y", joint members tagged
"counted via …", psychosocial per-lever tagged "shown individually, not in the
total"). (b) Member shares are consistent with the isolated marginal (cardio
300 alone 0.787 = cardio inside ekelundTable). (c) GAP: when a joint model is
live, the output total is the cluster's joint estimate, NOT the product of the
member chips — probe: chips 0.787 × 0.883 × 0.909 = 0.632 naive vs cluster
total 0.433; that redundancy is invisible on the main page. (d) The More panel
has no header note explaining values are already adjusted, and the output area
never links to sources.html#conflation (`activeJoint` already exports
per-cluster totals and is tested).

- [ ] 4.5.2 Card-level cluster note (js/app.js): for each output card, when
      `engine.activeJoint(model, state)` returns a cluster covering that
      output, render inside the card's More panel (above the contrib list) a
      note of the form: "cardio + steps + sitting are counted as ONE joint
      estimate (Ekelund 2019): combined effect 0.433 (range 0.415–0.433).
      Each slider's chip is a share of this one estimate — they don't
      multiply." Data: activeJoint() per-output {hr, hrLow, hrHigh}, jmById
      for label/ref, member labels from the cluster definition. No engine
      change needed.
- [ ] 4.5.3 More-panel header note (js/app.js): one shared note (build once,
      reuse in all five contrib panels) — "The percentages below are already
      adjusted for overlaps: joint-model members are shares of one estimate,
      overlap pairs are counted at partial strength. Full breakdown:
      conflation on the methodology page." Link to sources.html#conflation.
      Also a footer link to that anchor from the output grid whenever any
      overlap/cluster is active.
- [ ] 4.5.4 sources.html copy (js/sources.js): one sentence at the top of the
      conflation section tying it to the main page ("every chip and More-row
      on the main page gets its overlap discount / joint-model share from the
      tables below") — doubles as the intro of the per-input table from 4.5.7.
      No new tables beyond 4.5.7; ids #conflation, #overlap-list,
      #fair-boundary already exist.
- [ ] 4.5.7 sources.html per-input transparency table — the "what we use,
      where, why" ask. New section under #conflation, generated from the model
      (drift-proof, like everything else): one row per input, columns: input;
      which outputs it feeds (mortality / cancer / cvd / cognition /
      happiness); HOW it is counted per output (marginal HR / share of
      <joint model> / overlap ρ with <pair> / per-lever only, not in total /
      no data yet / none); evidence tier; source [n]. Implement:
      (a) engine helper `engine.inputDisclosure(model)` (pure, node-testable,
      in engine.js): for each input nudge it off-default, evaluateRaw once,
      collect its per-output records from contributions (viaJoint /
      overlapBlend / perLever / evidence / source) and mark outputs listed in
      result.noData as "no data yet"; gate inputs (vo2maxOn / bodyFatOn)
      marked "replaces X when enabled"; (b) rendering in sources.js reusing
      the existing inputName/evBadge/citeKeys/refLink/jmTitle helpers;
      (c) tests: rows == model.inputs length, every row has a source, no-data
      outputs only appear where engine says so.
- [ ] 4.5.5 Tests (tests/engine.test.js): assert the note's premise — with a
      joint model active, the naive product of the member hrDeltas differs
      from the cluster total (redundancy exists and is carried by the cluster,
      not hidden in member shares). Suite: `node tests/engine.test.js`.
- [ ] 4.5.6 Verification: `node --check js/app.js` (+ js/sources.js), full
      suite green, serve and manually check four scenarios: (a) PA cluster
      active (cardio+steps+sitting) → cluster note + header note visible;
      (b) overlap pair active (magnesium + diet) → "counted at X%" tags on
      chip and row, header note visible; (c) all defaults → no conflation UI
      rendered anywhere; (d) sources.html per-input table renders every input
      with a where/how/why for each output.

## Phase 5.5 — Simple/Advanced model toggle (created 2026-08-04)

Feature: a toggle at the top of the calculator switching between the ADVANCED
model (current, conflation-corrected: joint models, overlap ρ blends,
per-lever-only psychosocial) and a SIMPLE model ("without any conflation
fixing"). The toggle swaps the model driving the outputs AND gates the
conflation-clarity UI (cluster notes, subcategorised More panels, per-lever
labels) so future presentation work knows which mode it belongs to.

### Design decisions (from the planning pass — read before coding)

- **SIMPLE = same audited data, pre-conflation combination math. NOT a data
  rollback.** The old factors.js (commit ee1c3a4) contains numbers the 0.9
  sweep has since FIXED or nulled (fabricated li2020, unsourced CVD columns,
  invented CIs). Restoring them would break the sources-first hard rule. The
  simple model uses today's corrected marginals multiplied naively — which is
  what the site did before the conflation fix. The toggle's caption says so.
- **The engine already implements both modes.** `js/engine.js` is a superset:
  with `jointModels: [], overlaps: [], perLeverOnly: []` every number is
  byte-identical to the old engine (the suite's `plainModel` proves it). Do
  NOT restore the old engine.js file — its `evaluate()` return shape lacks
  `bounds` and other fields app.js now reads. Current engine + empty
  structures IS the simple model. **No engine math change needed.**
- **Mode = which model object is active.** factors.js exports the canonical
  `HEALTH_MODEL` plus a derived `SIMPLE_HEALTH_MODEL = { ...HEALTH_MODEL,
  jointModels: [], overlaps: [], perLeverOnly: [] }` (shallow spread only —
  nested inputs/sources are read-only; a distinct object identity is REQUIRED
  because `calibrateCache`/`_avgCache` are WeakMaps keyed by model object).
  `engine.evaluate(model, state)` does all the work; no mode flag is threaded
  through the engine.
- **The UI self-neutralises.** Every conflation disclosure in app.js
  (chipTags, overlapNote, jointNote, per-lever labels) renders from flags the
  engine sets on contribution records (`viaJoint`, `overlapBlend`, `perLever`)
  — those flags only appear when the structures are non-empty, so the simple
  model renders the flat pre-conflation look with ZERO branch code.
- **Citation numbering stays canonical.** Both pages compute
  `refs = engine.sourceIndex(HEALTH_MODEL)` (advanced) regardless of mode.
  The joint-model/overlap-only sources (mente2023, ekelund2016, duncan2023,
  sanchezlastra2021) sit at the END of the numbering (sourceIndex appends
  them after the baseline), so simple mode simply never links to them and
  nothing renumbers. sources.html keeps rendering the full advanced list.
- **Cluster-referencing findings get a `mode` field.** Two findings reference
  the Mayo adiposity cluster and mislead in simple mode: the vo2maxOn
  "fitness absorbs fatness" finding (weeldreyer2025, factors.js:2183) and the
  underweight/Mayo caveat (factors.js:2187). Add `mode: 'advanced'` to them;
  the engine's `evaluateFindings` passes the field through (one-line change
  at engine.js:1088) and app.js filters by active mode. Numbers/behavior stay
  in factors.js (golden rule).
- **sources.html stays advanced-only.** It is the methodology page for the
  conflation model. Simple mode's "Full method" link still lands there; the
  toggle's caption covers the mismatch.
- **Mode is session-only** (in-memory, no localStorage) — consistent with the
  site's nothing-is-stored ethos. Default mode = Advanced (the honest one).
- **Future-dev convention (record in AGENTS.md + file headers):** any UI that
  explains HOW inputs combine (cluster notes, subcategorised More panels,
  per-lever labels, bounds display) is an ADVANCED-mode feature; SIMPLE mode
  is the flat, naive-independence look. When adding UI, ask "does this
  describe conflation?" — if yes, gate it on advanced mode.

### Steps

- [ ] 6.0 Record the design above in PLAN.md (new note after the Phase 4.5
      section, "§5.5 — Simple/Advanced mode toggle"). No code.
- [ ] 6.1 factors.js: add `SIMPLE_HEALTH_MODEL` + a comment block explaining
      the two-mode architecture (decisions above). Dual export: keep
      `module.exports = HEALTH_MODEL` (tests require it directly) and attach
      `module.exports.SIMPLE_HEALTH_MODEL = SIMPLE_HEALTH_MODEL`; browser:
      `globalThis.SIMPLE_HEALTH_MODEL = SIMPLE_HEALTH_MODEL`. Run tests —
      suite must stay green (advanced model untouched).
- [ ] 6.2 factors.js: add `mode: 'advanced'` to the two cluster-referencing
      findings (factors.js:2183 weeldreyer2025/vo2maxOn, factors.js:2187
      underweight/Mayo). All other findings stay mode-agnostic. Tests green.
- [ ] 6.3 index.html: add the toggle to the `.topbar` (or a new row under the
      tagline) — a labelled segmented control `Simple | Advanced` (use the
      same radiogroup pattern as `.segmented`, id="mode-toggle"), default
      Advanced, plus a one-line caption: "Simple multiplies each factor's
      effect as if independent — it overstates combinations. Advanced
      corrects overlapping effects using published joint studies." Place it
      ABOVE the calculator inputs so it reads as a site-level control.
- [ ] 6.4 css/style.css: `.mode-toggle` styles reusing the existing
      `.segmented`/`.switch` aesthetic (css/style.css:179–221); a clear
      "active mode" state so the current mode is obvious.
- [ ] 6.5 app.js: two-model refactor.
      (a) Keep `const model = HEALTH_MODEL` for one-time data-derived
      structures (GROUPS, inputLabels, jmById, renderInputs, updateGates) —
      inputs are identical in both modes.
      (b) Add `let activeModel = HEALTH_MODEL; let mode = 'advanced';` and a
      `recompute()` that runs `engine.evaluate(activeModel, state)` + the
      existing `update()`.
      (c) Wire the toggle: on change set `activeModel`/`mode` then
      `recompute()`. Do NOT reset `state` — slider values carry across modes.
      (d) `refs` stays `engine.sourceIndex(HEALTH_MODEL)` (canonical).
      (e) `updateFindings`: filter records with `mode === 'advanced'` when
      `mode === 'simple'` (needs the engine pass-through from 6.2).
      (f) `updateChips`/`updateContrib` need NO branch code — the missing
      flags render the flat look automatically; verify rather than add code.
      (g) engine.js: `evaluateFindings` map gains `mode: f.mode` (engine.js:
      1088). `node --check js/app.js js/engine.js`.
- [ ] 6.6 app.js copy: render the mode caption + a small mode badge near the
      outputs so a viewer in simple mode is reminded the numbers are naive
      (honesty rule). No new numbers — copy only.
- [ ] 6.7 tests (tests/engine.test.js): new §[27] "Simple vs advanced mode":
      (a) SIMPLE_HEALTH_MODEL at defaults → hrAvg exactly 1.0, LE delta 0
      (same invariant as advanced);
      (b) on a healthy profile the simple total == the naive marginal product
      (no cluster replacement) and DIFFERS from the advanced total (redundancy
      really removed);
      (c) no contribution record in simple mode carries `viaJoint`,
      `overlapBlend`, or `perLever`;
      (d) `sourceIndex(SIMPLE_HEALTH_MODEL)` is a subset of
      `sourceIndex(HEALTH_MODEL)` with identical numbers for shared keys
      (append-order invariant);
      (e) the two `mode: 'advanced'` findings exist, are the only findings
      flagged, and their `when()` matches the original (data audit);
      (f) a findings-mode filter check (engine passes mode through). Suite
      green.
- [ ] 6.8 Verification: `node --check` on all JS, full suite green, serve and
      manually check: defaults show 1.0× in BOTH modes; a healthy profile
      shows advanced LESS protective than simple (overclaim removed) with
      conflation tags in advanced and absent in simple; toggle preserves
      slider values; the two cluster findings vanish in simple; simple-mode
      chip [n] links still resolve on sources.html (canonical numbering); no
      console errors toggling rapidly.
- [ ] 6.9 AGENTS.md + file headers: add the mode convention line to AGENTS.md's
      design decisions and a short note atop js/app.js and js/factors.js so
      future work tags its feature's mode (advanced = conflation-clarity UI /
      simple = flat naive). Human reviews this diff.

## Phase 5 — deferred (not now)

GBD pathway layer, age-conditional actuarial engine, own-cohort analysis, full
Q1/Q2 split + importance framing, Monte Carlo covariance default.
