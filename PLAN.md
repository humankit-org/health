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

### Live structures (source of truth: `js/factors.js` + `js/joint/`; rendered by sources.html)

Under **Phase 7** (in progress — Working TODO at the bottom) the conflation
structures will live in `js/joint/` (joint-models.js / overlaps.js /
per-lever-only.js, plus the conflation-only sources and the two
cluster-referencing findings); `js/factors.js` is the base SIMPLE model
(inputs, effects, sources, bmi, baseline, constants, findings).
`js/joint/index.js` assembles `HEALTH_MODEL` (advanced) = base + joint layer and
exposes `SIMPLE_HEALTH_MODEL` (the base object). The engine stays a superset
over the assembled model — empty/absent conflation structures ⇒ byte-identical
plain multiplication (see Phase 7).

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
 5. **ρ does two jobs** — point blend (weaker deviation ×(1−ρ) in log space,
    where deviation = log HR − log rdHr, the excess over the input's
    average-person level) and covariance (2·ρU·σᵢ·σⱼ in the quadrature).
    Redundancy share ≠ error correlation; methodology copy says so. Blend
    rule (4.5.8, 2026-08-05): when both members of a pair deviate from their
    average levels, the weaker |deviation| is discounted by ρ (ρ=1 ⇒ the
    weaker deviation collapses to its average level — NOT to 1.0 if its
    average level ≠ 1, e.g. magnesium 0.969 at 280 mg/d; ρ=0 ⇒ independent).
    Nothing blends when a side sits at its average (deviation 0), so reset is
    silent by construction; and only SAME-direction deviations are blended —
    opposite directions share no excess to remove, and blending one would push
    the point outside the assumption band.
 6. **Bounds endpoints** (independence = full product; redundancy = strongest
    effect per cluster) are ASSUMPTION-space labels ("the range of our models'
    answers"), not truth bounds. The deviation blend is a convex move toward
    the weaker side's average level, so for pair groups the point always lies
    between the endpoints (same-direction blend only); joint-model totals are
    lookups and may sit outside (they are evidence).
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
- **Phase 4.6** — chips + More-list presentation: advanced-mode chips for
  joint-model members (arrow + cluster name, no %); clustered, expandable
  More list on the HR cards.
- **Phase 5.5** — Simple/Advanced model toggle.
- **Phase 7** — refactor: extract the joint model into `js/joint/` (separate
  the base SIMPLE model from the conflation layer; steps below).
- **Phase 8** — the Conflation explainer page (`conflation.html`): a new static
  page explaining the conflation problem and the combination math at a
  first-year-university level, plus an interactive flex-grid overview of every
  conflation cluster whose cards pop open into exact-math dialogs. Steps below.

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
- **Phase 4.5 [x]** — main-page conflation disclosure: audit done; steps below.
- **Phase 5.5 [x]** — Simple/Advanced model toggle shipped; steps below.
- **Phase 7 [x]** — refactor: extract the joint model into its own files
  (`js/joint/`); plan written; steps below.
- **Phase 8 [x]** — the Conflation explainer page (`conflation.html`) shipped
  (2026-08-06): all steps 8.1–8.11 done below (prose + live worked-example
  boxes + 5/8/1 cluster-card flex grid + exact-math dialogs; §[30]
  data-contract tests; DOM-shim probe green; index.html disclosure links
  re-pointed to the explainer; AGENTS.md file map updated, human reviews the
  diff).
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

- [x] 4.5.2 Card-level cluster note (js/app.js + index.html template +
      css/style.css): for each output card, when `engine.activeJoint(model,
      state)` returns a cluster covering that output, render inside the card's
      More panel (above the contrib list) a note of the form: "cardio + steps +
      sitting are counted as ONE joint estimate (PA × sitting cluster [n]):
      combined effect 0.433 (range 0.415–0.433). Each slider's chip is a share
      of this one estimate — they don't multiply." Data: activeJoint()
      per-output {hr, hrLow, hrHigh} normalized to the "vs average person"
      scale by dividing by the same cluster's total at defaults
      (clusterTotals(model, defaults)); jmById from schema.conflationGroups for
      label/ref; member labels from jm.members via displayName. No engine
      change. Implemented 2026-08-05: `updateClusterNotes()` in app.js,
      `.cluster-note` divs added to the three HR cards' More panels in the
      outputs-template, `.cluster-note` CSS. Verified: at cardio 300 / steps
      10000 / sitting 5 the ekelund note reads 0.820 (0.787–0.852) vs the naive
      member-product 0.632 — the redundancy is surfaced, not hidden.
- [x] 4.5.3 More-panel header note + output-grid footer link (js/app.js +
      index.html template + css/style.css): one shared note ("The values below
      already account for overlapping effects: joint-model members are shares
      of one published estimate, overlap pairs are counted at partial strength,
      and psychosocial factors are shown per lever only. Full breakdown: how
      inputs are combined →" linking to sources.html#conflation) rendered into
      a `.confl-more-note` div at the top of all five contrib More panels, plus
      a `.confl-foot` link under the output grid. Both are gated on
      `conflationActive()` = "any conflation-relevant input (joint-model
      member / overlap member / per-lever member) moved off its default" —
      false at reset by construction. NOT driven by engine.activeOverlaps():
      the overlap blend runs on RAW marginals, so some inputs report blended
      even at all-defaults (magnesium raw marginal at average intake 0.969;
      sunExposure likewise) — the record flags would light the note up at
      reset. The gate matches engine.activeJoint's member-off-default
      semantics, keeping the note in sync with the cluster notes. Implemented
      2026-08-05. Verified: defaults → all three panels empty; cardio/
      magnesium/purpose/sleep moved → note+footer on; sauna-only and
      weight-only → off.
- [x] 4.5.4 sources.html copy (js/sources.js + sources.html + css/style.css):
      one sentence at the top of the conflation section tying it to the main
      page — "Every chip and More-row on the calculator gets its overlap
      discount and its joint-model share from the tables below — the main page
      and this page read the same data." Rendered into a
      `<p id="conflation-tie">` (the first element under #conflation's h2) from
      sources.js, so it can double as the intro of the per-input table (4.5.7).
      Styled `.conflation-tie` (soft italic callout). Implemented 2026-08-05.
- [x] 4.5.7 sources.html per-input transparency table — the "what we use,
      where, why" ask. New section under #conflation, generated from the model
      (drift-proof, like everything else): one row per input, columns: input;
      which outputs it feeds (mortality / cancer / cvd / cognition /
      happiness); HOW it is counted per output (marginal HR / share of
      <joint model> / overlap ρ with <pair> / per-lever only, not in total /
      no data yet / none); evidence tier; source [n]. Implement:
      (a) [x] engine helper `engine.inputDisclosure(model)` (pure, node-testable,
      in engine.js, implemented 2026-08-05): STATIC walk (no evaluateRaw) over
      conflationGroups + per-output lookup coverage + effect lists, so it
      cannot drift from the numbers. Returns one row per model.input (44),
      each { id, label, group, hows{output→{how,detail,evidence,source[,rho]}},
      sources }. HOW per output: gate toggles → "replaces BMI/Cardio… when
      enabled" (only for effects whose supersededBy === toggle, or BMI when
      model.bmi.supersededBy, or gated sliders' outputs) else "none";
      heightCm/weightKg → "via-bmi" (mortality+cvd) / none; perLeverOnly →
      "per-lever"/"per-lever-points"; joint-model owner with lookup coverage →
      "share" (detail = cluster id; source falls back to jm.source when the
      input has no own effect on that output); overlap pair where BOTH sides
      act on the output → "overlap" (rho + other side); else "marginal";
      effects-but-undefined-coverage → "no-data"; else "none". GATED sliders
      (vo2max/bodyFat/grip/rhr) are tagged `gated:true + gateLabel` on top of
      their normal classification (bodyFat mortality/cancer/cvd = "share" of
      mayoCells, gated). sex → none. Sources = deduped union over hows, with
      gate/bmi/baseline fallbacks. Verified by node probe: 44 rows, no
      source-less rows, bodyFatOn/vo2maxOn/grip/rhr/bodyFat/vo2max/grip rows
      all classify correctly; cardio's cognition/happiness effects are NOT
      superseded by vo2maxOn (confirmed in factors.js), so the toggle shows
      "none" there. Full suite green. (b) [x] rendering in sources.js (implemented
      2026-08-05): new `renderInputTable()` → `#input-transparency tbody`, a
      section after the overlap table in sources.html ("What each input does").
      Columns: Input (displayName + group), Feeds (outputs where the how is
      neither none nor no-data), How it is counted (one `<li>` per output via
      `howText`, reusing displayName/evBadge/citeKeys — cluster ids and overlap
      partners resolved to readable titles, gated rows carry "— only when
      "<gate>" is on"), Evidence (deduped badges), Source (citeKeys). Styled
      `.group-sub`/`.how-list` in css/style.css. Verified via
      /tmp/opencode/dom_shim_sources.js: 44 rows, all classification strings
      present. (c) [x] tests (tests/engine.test.js §[27], implemented
      2026-08-05): rows == model.inputs length; every row has ≥1 source; all
      hows ∈ known set; 'no-data' never where an effect exists; disclosure's
      no-data rows == engine.noDataInputs labels EXACTLY on cancer (17) and
      cvd (7) — the drift-proof invariant; spot checks bodyFat=gated-share,
      vo2maxOn cognition='none', sex='none'. Full suite + audit green.
- [x] 4.5.5 Tests (tests/engine.test.js) §[28] (implemented 2026-08-05):
      asserts the note's premise — with a joint model active, the cluster
      total normalized to the average person (exactly what the note displays)
      differs from the naive product of the member hrDeltas. Verified for both
      shipped clusters at off-default members: diet total 1.0989 vs naive
      0.7576; ekelund total 0.8524 vs naive 0.6956. Also pins the discovery
      that member chips' hrDeltas EQUAL the naive (SIMPLE) model's marginals
      (diet 0.7576, ekelund 0.6956) — the redundancy is carried by the cluster
      total, NOT by member shares. This proved the 4.5.2 note's last sentence
      ("Each slider's chip is a share of this one estimate — they don't
      multiply") factually wrong, so the app.js copy was corrected (same step)
      to: "Each slider's chip still shows its independent effect; multiplying
      those chips together would double-count the shared pathway — the
      combined effect above prices it once." Suite + audit green.
- [x] 4.5.6 Verification: `node --check js/app.js` (+ js/sources.js), full
      suite green, serve and manually check four scenarios: (a) PA cluster
      active (cardio+steps+sitting) → cluster note + header note visible;
      (b) overlap pair active (magnesium + diet) → "counted at X%" tags on
      chip and row, header note visible; (c) all defaults → no conflation UI
      rendered anywhere; (d) sources.html per-input table renders every input
      with a where/how/why for each output.
      DONE (2026-08-06): node --check clean on app.js/sources.js; full suite +
      audit green. Verified the four scenarios with a DOM-shim probe
      (/tmp/opencode/dom_shim_probe.js) driving the real app.js + sources.js
      against a minimal fake document — (a) cardio 300/steps 10000/sitting 5 →
      cluster note + header note + confl-foot all render, mortality estimate
      0.76; (b) harmful-direction crash (fruitVeg/fiber/nuts 0, fish none,
      magnesium 0) → magnesium chip + mortality contrib row both carry
      "counted at X% — overlaps …", header note on — NOTE the blend needs the
      diet cluster to actually move a gradient bracket (defaults→fiber 40 both
      sit in the 0.7536 step, so no blend); (c) all defaults → every cluster
      note/header note/confl-foot empty, zero confl-tag or chip-lever spans;
      (d) input-transparency tbody renders 44 rows == model.inputs, each with
      a how-list li + source ref, including share/marginal/no-data wordings.
      (The serve-and-click browser pass in a real browser is still recommended
      but the probe covers the rendered output of both pages.)
- [x] 4.5.8 FIX (implemented 2026-08-05): the overlap blend ran on RAW
      marginals, so inputs whose raw effect at their average value is ≠1
      (magnesium raw 0.969 at 280 mg/d; sunExposure) showed a spurious chip at
      reset. DONE — engine now blends the DEVIATION from the average-person
      level: excess = logHr − log(rdHr), blended logHr = log(rdHr) +
      (1−ρ)·excess. `computeJmTotals` now attaches `rdHr` (cluster total at
      defaults) to every cluster entry via a new memoized `defaultJmTotalsCore`
      WeakMap (computeJmTotalsCore split out to avoid recursion); input effects
      already carried rdHr/rdPoints. Points blend mirrors it (deviation from
      rdPoints). REFINEMENT beyond the PLAN formula (discovered running the
      suite): blend ONLY same-direction deviations (`Math.sign(eA) ===
      Math.sign(eB)`) — opposite-direction pairs (rhr harmful vs cardio
      protective; pm harmful vs a protective diet cluster) share no excess to
      remove, and blending one would push the point estimate outside the
      [independence, redundancy] assumption band ([19] failed). This preserves
      the documented between-endpoints invariant. Consequences (all pinned in
      updated tests): at defaults EVERY pair is inactive (excess 0) — the
      reset artifact is gone; a lone moving member whose cluster sits at its
      average (magnesium@450 alone, rhr@90 alone, pm@8 alone) is NOT blended
      (no shared excess); the blend fires only when both sides deviate the
      same way, and it discounts the smaller |deviation| — which can be the
      CLUSTER (rhr 0.283 vs cluster 0.265 harmful; magnesium 0.179 vs diet
      cluster 0.094 protective), never the raw-level comparison. [21]/[23]
      defaults identities now cancel mg/sun exactly (blends inert); [24] rhr
      alone unblended + cluster-blended scenario; [18] opposite-direction skip
      + same-direction snus/alcohol blend (rdHr 1.0 → identical to the old
      log-space discount); [20] swap test moved to snus/alcohol. Suite + audit
      green. research.md line ~545 (vaping null) still holds — a null HR 1.00
      has rdHr 1.0 → zero deviation → no-op. Design-decision §5/§6 in PLAN.md
      updated. Blocked-by cleared: 4.5.6(c) now satisfiable.

## Phase 4.6 — chips + More-list presentation (Feature A: advanced-mode chips; Feature B: clustered More list) (created 2026-08-06)

Two presentational changes, planned separately (A = chips under inputs, B =
the More disclosure list under the HR output cards). NO engine change and NO
new numbers: everything renders from data the engine already returns
(contribution records carry `viaJoint`/`overlapBlend`/`perLever`; per-cluster
totals come from `engine.activeJoint`/`clusterTotals` + the existing
`avgClusters` map in app.js; cluster titles come from `schema.displayName`).
Both features are pure app.js + css + (maybe) template work.

### Design decisions (confirmed with the human 2026-08-06)

- **Feature A scope:** ONLY cluster-member chips change format in advanced
  mode. A chip whose record has `c.viaJoint` renders as
  `{output} {arrow} ({cluster displayName}) [n]` — arrow = ↓ when
  `hrDelta < 1`, ↑ when `hrDelta > 1`; cluster name via
  `schema.displayName(model, c.viaJoint)`; the `[n]` citation stays. NO % and
  NO separate `via` tag (the parenthesised cluster name IS the disclosure —
  it replaces the "counted via …" confl-tag). Non-members (plain marginal,
  overlap-blend, per-lever HR) keep today's format exactly (flat % + any
  overlap `confl-tag`). Points chips (cognition/happiness) never have
  `viaJoint` → unchanged. Per-lever HR chips keep their "(shown individually)"
  tag. Overlap-blend records are never cluster members in the current data
  (pairs are input↔input or input↔cluster), so the formats can't collide; if a
  record ever carried BOTH flags, the cluster format wins and the overlap info
  stays in the chip's title tooltip only.
- **Feature A self-neutralises:** `viaJoint` is only set when `jointModels` is
  non-empty, so simple mode renders flat % with zero branch code (the
  AGENTS.md mode-convention allows relying on engine tags). The branch in
  `updateChips` is just `if (c.viaJoint)` — no `mode` check needed.
- **Feature B scope:** clustered list ONLY on the three HR panels
  (mortality/cancer/cvd). cognition/happiness keep the flat list exactly as
  today (incl. their per-lever "psychosocial — points only" tags).
- **More-list structure (advanced, HR panels):**
  1. Cluster groups first: for each cluster in
     `engine.activeJoint(activeModel, state)` that covers the output AND has ≥1
     nonzero member record on it, a group header row `▸ {displayName} [n]`
     plus the cluster's combined % =
     `fmtPctFromHr(t.outputs[out].hr / avgOut.hr)` (avgOut from the existing
     `avgClusters` map — the same normalization the 4.5.2 cluster note uses).
     The header is a `<details>`/`<summary>` expanding to member rows.
  2. Member rows (inside the group): each nonzero member record — label,
     marginal % (`fmtPctFromHr(c.hrDelta)`), citation, evidence badge. Same
     row content as today minus the inline tags. Members at default (hrDelta
     ≈ 1.0, filtered by the existing nonzero gate) simply don't appear.
  3. Unclustered rows after the groups: records with no `viaJoint` (plain
     marginal, overlap-blend, per-lever) — flat, minus the inline
     `conflNote`/`leverNote` tags.
- **Removed "popup text":** on HR panels, the per-row
  `contrib-lever`/`conflNote`/`leverNote` spans ("counted at X% — overlaps Y",
  "counted via …", "psychosocial — shown individually"). The `.confl-more-note`
  header note STAYS (it is the explanation; the group headers are navigation).
  The strength-training reference the human flagged is the `jointNote` "counted
  via Aerobic × strength cluster" row tag — gone with the inline tags (and on
  chips the cluster name replaces it).
- **Card-level cluster notes REMOVED (2026-08-06):** the 4.5.2 `.cluster-note`
  divs (and their `updateClusterNotes`/`clusterNote` code + CSS) are gone —
  the grouped More-list group headers now carry the same combined-effect
  number, so the note was redundant. Only the `.confl-more-note` header note
  and the `.confl-foot` link remain of the 4.5.x disclosure block.
- **Ordering:** cluster groups sorted by |log(combined ratio)| descending
  (biggest effect first, matching today's magnitude sort); members within a
  group by |log(hrDelta)|; unclustered rows by magnitude as today.
- **Group renders even when the cluster nets ±0%** (refinement, 2026-08-06):
  a group appears whenever it has ≥1 nonzero member record on the card, even
  if the cluster's normalized total is exactly 1.0 (e.g. mommaCells on
  cancer: strength 1→3 stays in the same grid cell, so the cluster total is
  unchanged while the member marginal is +8% — hiding the group would drop the
  member row entirely). The ±0% header next to the +8% member is honest: the
  cluster prices it once.
- **Effect-label fix:** HR More rows now label with the actual card
  (`cancer −14%` on the cancer card) instead of the old hard-coded
  `mortality −14%` on every card — a pre-existing copy bug corrected in
  `contribRow()`.
- **Self-neutralising in simple mode:** no record carries `viaJoint` when
  `jointModels` is empty → the grouped renderer produces the flat list with no
  branch. `avgClusters`/`activeJoint` are empty on the base model.
- **Cluster→output coverage (verified in joint-models.js):** mortality = all 5
  clusters (dietScore, ekelundTable, mommaCells, duncanCells, mayoCells);
  cancer = mommaCells + mayoCells; cvd = mommaCells + mayoCells. dietScore and
  ekelundTable and duncanCells cover mortality ONLY, so their members appear as
  plain marginal rows on the cancer/cvd cards — expected, not a bug.
- **Gated sliders:** `vo2maxOn` retires cardio from the PA axes, `bodyFatOn`
  retires bmi from mayoCells (supersession). When a member is retired it simply
  produces no nonzero contribution on the covered output → its member row
  disappears from the group (verify per cluster below). The derived BMI
  pseudo-input is grouped under mayoCells when it produces a `viaJoint:
  'mayoCells'` record; the `bmi-readout` copy is untouched.

### Feature A steps (advanced-mode chips)

- [x] 4.6.1 app.js `updateChips`: add the `c.viaJoint` branch — for HR records,
      render `{which} {arrow} ({displayName(c.viaJoint)}) {refLink(c.source)}`
      instead of the % + `chipTags`; keep the per-lever "(shown individually)"
      handling and the title `c.note`. `node --check js/app.js`.
      DONE (2026-08-06): a new `hrChip()` helper renders the joint-member form
      (arrow from `hrDelta`, cluster name in parens, no %, no `via`/`confl-tag`)
      and the flat form for everyone else. Points chips untouched. Verified by
      /tmp/opencode/phase46_probe.js §[1–6]: all 5 clusters' members render the
      new form on mortality (momma also on cancer+cvd); fiber's cancer/cvd
      chips stay flat % (no viaJoint on uncovered outputs — expected); alcohol
      (non-member) keeps flat % + no confl-tag unless blended; simple mode flat.
- [x] 4.6.2 css/style.css: `.chip-group` span for the parenthesised cluster
      name (small, muted, maybe a distinct accent to signal "this chip is a
      share of one estimate, not an independent %"); keep `.chip.good/.bad`
      colours driving the arrow. No layout change.
      DONE (2026-08-06): `.chip-group` — lighter weight, ~0.85 opacity, nowrap.
- [x] 4.6.3 DOM-shim verification per cluster (reuse the mode_probe pattern):
      move one member off-default and assert the chip reads `{output} {arrow}
      ({cluster title}) [n]` with NO % and NO `via`/`confl-tag` span, for:
      (a) dietScore — fiber (mortality ↓); (b) ekelundTable — cardio ↑… no,
      cardio ↓; also steps + sitting; (c) mommaCells — strength (mortality ↓,
      cancer ↓, cvd ↓); (d) duncanCells — sleep (mortality ↓); (e) mayoCells —
      bmi via weight/height AND bodyFatOn (mortality/cancer/cvd ↑). Also: a
      non-member (e.g. alcohol) keeps the flat % format in advanced mode.
      DONE (2026-08-06) via /tmp/opencode/phase46_probe.js §[1–6] — directions
      computed FROM the engine (don't hard-code them; e.g. strength@3 is
      HARMFUL per momma's ratio-mode, sitting@12 harmful / @2 protective,
      bodyFat@22 protective / @45 harmful). bodyFat has NO input-level
      cancer/cvd records (the mayo grid prices those, but no per-input
      attribution exists) → no bodyFat chips there, by design.

### Feature B steps (clustered More list)

- [x] 4.6.4 app.js `updateContrib`: for the three HR outputs, build the
      grouped list — pass `activeClusters` in (already computed in `update()`);
      group by cluster as per the design block; unclustered rows appended.
      cognition/happiness keep the existing flat path unchanged.
      DONE (2026-08-06): `groupedContribRows()` — group header = combined % +
      cluster title + `[n]` + evidence badge, wrapped in `<details>/<summary>`,
      expanding to member rows (marginal %, label, citation, evidence); then
      unclustered rows flat. REFINEMENT vs the plan: a group renders whenever
      it has ≥1 nonzero member record even if the cluster total nets to ±0
      (the original "skip ratio===1" hid e.g. mommaCells on cancer — strength
      1→3 stays in the same grid cell so the cluster total is unchanged while
      the member marginal is +8%; hiding it would drop the member row entirely).
      The ±0% header + the member's +8% is honest (the cluster prices it once).
      Verified /tmp/opencode/phase46_probe.js §[7–10]: ekelund group on
      mortality with combined % ≠ member product; mommaCells grouped on
      cancer+cvd; dietScore NOT grouped on cancer (mortality-only cluster,
      fiber appears as a flat marginal row there); mayoCells + ekelund both
      grouped on mortality together; unclustered alcohol + per-lever purpose
      render flat with no tags.
- [x] 4.6.5 app.js: stop emitting `conflNote`/`leverNote` inline spans on HR
      rows (the grouped list replaces them). Mind panels keep `contribNotes`
      as today. Remove now-dead code if nothing else uses it.
      DONE (2026-08-06): `contribRow()` renders inline conflation tags ONLY for
      `field === 'points'` (mind panels); HR rows are tag-free everywhere.
      `contribNotes` is still used by the mind panels, so it stays. NOTE: this
      intentionally obsoletes the 4.5.6 dom_shim_probe.js scenario-(b) assertion
      "mortality contrib row carries overlap disclosure" — the overlap
      disclosure now lives on the chip + `.confl-more-note` header + sources.html
      (per the human's confirmed "remove inline tags, keep note divs").
- [x] 4.6.6 css/style.css: `.contrib-cluster` (group block), `.contrib-cluster
      head` (summary row: ▸ marker, title, combined % + `[n]`), nested member
      list indentation, `.contrib-members` spacing. Reuse `.contrib-effect`/
      `.ev`/`.contrib-ref` for member rows so the look stays consistent.
      DONE (2026-08-06): `.contrib-cluster`/`summary` flex rows with a rotating
      ▸ affordance, `.contrib-members` indented under a left border.
- [x] 4.6.7 DOM-shim verification per cluster × covered output (mortality:
      all 5; cancer/cvd: mommaCells + mayoCells): group header shows cluster
      title + combined % (normalized, ≠ naive member product — §[28] already
      pins this) and expands to member rows with marginal %; unclustered rows
      (e.g. alcohol, smoking, per-lever purpose) render flat with NO inline
      tags; `.confl-more-note` still present (`.cluster-note` divs removed with
      4.6.10). Mind panels unchanged (flat, tags intact). Simple mode: flat
      list, no group headers, chips flat.
      DONE (2026-08-06) via /tmp/opencode/phase46_probe.js §[7–11] + §[12]
      (simple mode). `.confl-more-note` presence re-verified by the existing
      /tmp/opencode/mode_probe.js (still green, cluster-note assertions
      replaced by grouped-list checks after 4.6.10). mind panels keep per-lever
      tags (happiness check — purpose has NO cognition record, so the
      per-lever-tag assertion must target happiness).
- [x] 4.6.10 REMOVE the 4.5.2 card-level cluster notes (human request,
      2026-08-06): the `.cluster-note` divs in the outputs-template
      (index.html:79/92/104), `clusterNote` + `updateClusterNotes` in app.js,
      and the `.cluster-note` CSS. Rationale: the grouped More-list group
      headers (4.6.4) now carry the same combined-effect number, so the note
      was redundant. KEEP `.confl-more-note` (header) + `.confl-foot` + the
      `activeClusters` computation (still feeds `updateContrib`).
      DONE (2026-08-06): all three removed. `avgClusters`/`jmById` stay (used
      by `groupedContribRows`). Note: the file had been left mid-refactor
      (`updateClusterNotes` commented out but still called in `update()` → a
      runtime ReferenceError) — the removal completed it cleanly. `/tmp/
      opencode/mode_probe.js`'s three cluster-note assertions were replaced
      with grouped-list checks. `node --check`, full suite, audit, phase46 +
      mode probes all green.

### Verification (both features)

- [x] 4.6.8 `node --check` on edited JS; `node tests/engine.test.js` +
      `node tests/audit.js` green (engine untouched — no assertion edits
      expected); DOM-shim probe from 4.6.3 + 4.6.7 passing.
      DONE (2026-08-06): `node --check js/app.js` clean; full suite + audit
      green; /tmp/opencode/phase46_probe.js ALL PASS; /tmp/opencode/mode_probe.js
      ALL PASS (cluster notes / header notes / confl-foot / toggle intact).
      KNOWN EXPECTED FAIL: /tmp/opencode/dom_shim_probe.js scenario (b) —
      its "mortality contrib row carries overlap disclosure" assertion is
      obsolete by design (4.6.5 removed HR-row inline tags; the overlap
      disclosure remains on the chip, which that probe still passes).
- [ ] 4.6.9 Serve and manual pass: advanced mode shows arrow+cluster chips and
      the grouped More list; toggle to simple → flat chips + flat list; reset →
      nothing; all `[n]` links resolve on sources.html (canonical numbering).

## Phase 4.7 — Weight default → worldwide-average BMI ≈ 25 (created 2026-08-08)

### Goal

The site's reset anchor is "the average person" (AGENTS.md v0.3), but the
weight default (84 kg @ 168 cm) yields **BMI ≈ 29.8 ≈ 30** — the US average,
not the worldwide average (~25). The human wants the reset default to reflect
the worldwide-average BMI so "reset = exactly the average person" reads
credibly to a global visitor. Scope: the `weightKg` default only. Height
stays 168 cm (fine for a generic adult; a height change is not requested).

### Impact analysis (probe-verified 2026-08-08, /tmp/opencode/bmi_default_probe2.js)

- Candidate defaults (step 1 kg): **70 kg → BMI 24.80**, **71 kg → BMI 25.16**.
  Both keep the reset invariant (reset hrAvg exactly 1.0 / LE delta 0 — the
  engine normalises by `averageEval(model)` regardless of the default value).
- **The mayo adiposity band boundary sits at BMI 25.** 70 kg (24.80) drops the
  default into the **Normal band (col 0)**; 71 kg (25.16) keeps it in
  **Overweight (col 1), exactly like today**. Because mayoCells is
  `calibrate: true` and ratio-mode, the default band determines the
  calibration offset AND the whole §[26]/§[30] cell-pin test block:
  - 71 kg: mayo@defaults mortality 1.0700 / cvd 1.1000 / cancer 1.0000;
    §[30] mayo worked-example stays **1.402** (unchanged); §[26] cell pins
    (1.25882·…) all shift.
  - 70 kg: mayo@defaults mortality 1.0000 / cvd 1.0000 / cancer 1.0000
    (cleanest anchor); §[30] mayo worked-example becomes **1.336**.
- Other shipped clusters (dietScore, ekelundTable, mommaCells, duncanCells)
  do NOT consume weight → untouched. `engine.sourceIndex` numbering
  unchanged (no new/changed sources).
- Tests that must change: §[3.3] shippedTot mayo defaults (engine.test.js:
  497–499) and §[26] (1219–1229, 1233–1234) and §[30] mayo worked-example
  (1497) only if 70 kg. Nothing else references the weight default.
- sources.html:39–42 copy hard-codes the BMI-30 anchor — must be updated
  regardless of which candidate wins ("…30 BMI = 1.0 as 30 BMI is closer to
  the average" → reworded for the ≈25 anchor).

### Decision needed (human)

**70 kg (BMI 24.80)** vs **71 kg (BMI 25.16)**. Recommendation: **71 kg** —
it is the closest integer to BMI 25 at 168 cm, keeps the mayo cluster on its
current default band (Overweight) so the conflation page's mayo worked-example
(1.402) stays truthful, and the calibration story in joint-models.js:426–432
stays valid. 70 kg gives the "cleaner" 1.0× mayo anchor but silently changes
a documented worked example and the displayed mayo numbers.

### Steps

- [x] 4.7.1 factors.js: `weightKg` default 84 → **70** (chosen by the human
      2026-08-08); hint now reads "Default ≈ worldwide average BMI 25".
      `node --check js/factors.js` clean.
- [x] 4.7.2 tests/engine.test.js: §[3.3] mayo@defaults 1.20/1.25 → **1.00/1.00**
      (offset now 0 — reset profile sits in the normal column); §[26] cell pins
      re-written to probe the overweight column via explicit `weightKg: 71`
      (raw published ratios, the 1.25882 offset constant is gone); §[30] mayo
      worked example 1.402 → **1.336**; §[3] raw-average-HR sanity bound
      widened (0.3 → 0.2 — the default bmi marginal is now 1.00, so the raw
      average product is lower); §[5] all-healthy profile gains
      `sleepRegularity: 10` to re-pin the floor (reference BMI 22 is no longer
      a protective deviation from the BMI 24.8 default). All values
      probe-verified (/tmp/opencode/bmi_default_probe*.js).
- [x] 4.7.3 sources.html:39–42: "How it works" BMI example re-anchored — "the
      BMI curve is J-shaped with its lowest risk at 20–25, and we anchor
      HR = 1.0 at the average person's BMI ≈ 25 — so 20 BMI = 1.13 and 30 BMI =
      1.20 as ratios to that reference" (verified against engine.bmi.steps:
      default BMI 24.8 sits on the hr 1.00 step; 20/30 read 1.13/1.20).
- [x] 4.7.4 Docs: research.md §4.1 engine-notes gains the anchor note (default
      84→70 kg; offset now 0; mayo worked example 1.402→1.336); PLAN.md Phase
      8.6 worked-example list updated to the new mayo figure. AGENTS.md needs
      no change (v0.3 bullet "defaults = population averages" still accurate —
      weight is now the worldwide average; the others are US averages as noted
      per input).
- [x] 4.7.5 Verify: `node tests/engine.test.js` (All passed) + `node
      tests/audit.js` (OK) green; probes re-run; reset still exactly 1.0× /
      LE Δ 0 on the real assembled model; `node --check` clean. NOTE: the
      mid-session `git stash` + failed `git stash pop` (Windows file lock on
      tests/engine.test.js) briefly reset the working tree to HEAD — recovered
      via `git reset --hard HEAD` + `git stash pop`; ALL edits verified present
      afterwards (the dev-gotcha in the TODO header about vanished edits
      happened again; the `js/*` source is intact).

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
- **Mode = which model object is active.** AFTER Phase 7 this is free:
  factors.js IS the base/simple model and exports it as `SIMPLE_HEALTH_MODEL`
  (conflation keys DELETED, not emptied — absence === empty for every
  consumer's `|| []` guard); js/joint/index.js assembles the distinct
  advanced `HEALTH_MODEL`. Distinct top-level object identity is REQUIRED
  because the engine caches by model object (`calibrateCache` Map at
  engine.js:353, `_avgCache` WeakMap at engine.js:1021).
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
  "fitness absorbs fatness" finding (weeldreyer2025) and the underweight/Mayo
  caveat (sanchezlastra2021). AFTER Phase 7 they live in **js/joint/
  findings.js** (not factors.js:2183/2187). Add `mode: 'advanced'` to them;
  the engine's `evaluateFindings` passes the field through (one-line change at
  engine.js:1178–1185). app.js does NOT need to filter by mode (Phase 7: the
  base model simply lacks these findings) — the field is for
  self-documentation and the data audit test. Numbers/behavior stay in the
  data files (golden rule).
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

- [x] 6.0 Record the design above in PLAN.md (new note after the Phase 4.5
      section, "§5.5 — Simple/Advanced mode toggle"). No code.
      DONE (2026-08-04): the design block above IS this step — recorded at
      creation; verified present 2026-08-06.
- [x] 6.1 factors.js: add `SIMPLE_HEALTH_MODEL` + a comment block explaining
      the two-mode architecture (decisions above). Dual export: keep
      `module.exports = HEALTH_MODEL` (tests require it directly) and attach
      `module.exports.SIMPLE_HEALTH_MODEL = SIMPLE_HEALTH_MODEL`; browser:
      `globalThis.SIMPLE_HEALTH_MODEL = SIMPLE_HEALTH_MODEL`. Run tests —
      suite must stay green (advanced model untouched).
      NOTE (Phase 7 supersedes this): the `js/joint/` split makes factors.js
      the base model and exports it as `SIMPLE_HEALTH_MODEL` already — verify
      the export shape exists and skip the code part of this step.
      DONE (2026-08-06): verified the post-Phase-7 shape — `module.exports =
      base` + `globalThis.SIMPLE_HEALTH_MODEL = base`; `require('../js/
      factors.js')` has NO jointModels/overlaps/perLeverOnly keys (absence ===
      empty), 44 inputs, 31 findings; `js/joint/index.js` re-exports the same
      base as `SIMPLE_HEALTH_MODEL` and assembles the distinct advanced model
      (5 jointModels / 8 overlaps / 33 findings, meta 0.2.0). No code change
      needed — no-op per plan.
- [x] 6.2 Add `mode: 'advanced'` to the two cluster-referencing findings —
      AFTER Phase 7 they live in **js/joint/findings.js** (weeldreyer2025/
      vo2maxOn + sanchezlastra2021/underweight), not factors.js. All other
      findings stay mode-agnostic. Tests green.
      DONE (2026-08-06): both js/joint/findings.js entries carry `mode:
      'advanced'` (with a comment block; the base model never contains them).
      engine.evaluateFindings now passes `mode: f.mode` through (engine.js:
      1236) — the 6.5g engine change landed here with it. Suite + audit green.
- [x] 6.3 index.html: add the toggle to the `.topbar` (or a new row under the
      tagline) — a labelled segmented control `Simple | Advanced` (use the
      same radiogroup pattern as `.segmented`, id="mode-toggle"), default
      Advanced, plus a one-line caption: "Simple multiplies each factor's
      effect as if independent — it overstates combinations. Advanced
      corrects overlapping effects using published joint studies." Place it
      ABOVE the calculator inputs so it reads as a site-level control.
      DONE (2026-08-06): toggle sits in `.topbar-right` (next to page-nav),
      id="mode-toggle", two `.seg-option` radios named `mode` with
      data-mode="simple|advanced", Advanced checked; caption is an empty
      `<p class="mode-caption" id="mode-caption">` under the tagline (filled
      by JS); copy is set in app.js updateModeUI (6.6). A first attempt also
      placed a `.mode-badge` row above the output grid, but that <p> is a
      real grid item in the two-column `main` grid and stole the right-hand
      cell — pushing the outputs BELOW the inputs. Removed the badge
      (element + CSS + app.js code, 2026-08-06); the caption under the
      tagline alone carries the reminder.
- [x] 6.4 css/style.css: `.mode-toggle` styles reusing the existing
      `.segmented`/`.switch` aesthetic (css/style.css:179–221); a clear
      "active mode" state so the current mode is obvious.
      DONE (2026-08-06): `.topbar-right` flex row, `.mode-toggle` pill group
      (checked option = accent fill, same as .seg-option), `.mode-caption`
      (simple-mode tint). `.mode-badge`/`.mode-badge-row` styles were added
      then REMOVED with the badge (6.3 note) so `#outputs` stays in the
      right grid column.
- [x] 6.5 app.js: two-model refactor.
      (a) Keep `const model = HEALTH_MODEL` for one-time data-derived
      structures (GROUPS, inputLabels, jmById, renderInputs, updateGates) —
      inputs are identical in both modes.
      (b) Add `let activeModel = HEALTH_MODEL; let mode = 'advanced';` and a
      `recompute()` that runs `engine.evaluate(activeModel, state)` + the
      existing `update()`.
      (c) Wire the toggle: on change set `activeModel`/`mode` then
      `recompute()`. Do NOT reset `state` — slider values carry across modes.
      (d) `refs` stays `engine.sourceIndex(HEALTH_MODEL)` (canonical).
      (e) `updateFindings`: AFTER Phase 7 this filter is a NO-OP and can be
      dropped — the base/simple model has no joint findings at all (they live
      in js/joint/findings.js and are only merged into the advanced model), so
      evaluating the base never returns them. Keep the `mode: 'advanced'`
      data field (6.2) for self-documentation + test 6.7(e); the filter was
      only needed because the pre-Phase-7 derived SIMPLE shared the findings
      array.
      (f) `updateChips`/`updateContrib` need NO branch code — the missing
      flags render the flat look automatically; verify rather than add code.
      (g) engine.js: `evaluateFindings` map gains `mode: f.mode`
      (engine.js:1178–1185, NOT :1088 — that line drifted). `node --check
      js/app.js js/engine.js`.
      DONE (2026-08-06): app.js adds `const simpleModel =
      globalThis.SIMPLE_HEALTH_MODEL` + `let activeModel/mode`; `update()` and
      both event handlers run `engine.evaluate(activeModel, state)`; the
      toggle radios are wired via `setMode()` (swaps model, calls
      updateModeUI + update, state untouched — inputs identical in both
      models so values stay valid); `updateMoreNotes` gated on
      `mode === 'advanced' && conflationActive()` (the note is itself a
      conflation claim, per the 6.9 convention); `updateClusterNotes` already
      self-neutralises via `engine.activeJoint(activeModel, state)` returning
      [] on the base; chips/contribs confirmed flag-free in simple mode
      (probe §3). `updateFindings` was ALREADY filter-free post-Phase-7 (no
      change needed). (g) landed with 6.2. `node --check` clean, suite +
      audit green.
- [x] 6.6 app.js copy: render the mode caption + a small mode badge near the
      outputs so a viewer in simple mode is reminded the numbers are naive
      (honesty rule). No new numbers — copy only.
      DONE (2026-08-06): `updateModeUI()` sets `#mode-caption` innerHTML
      (advanced: "…priced from published joint studies… How inputs are
      combined →"; simple: "…multiplied as if independent — it overstates
      combinations… Full method →") + toggles `.simple-mode` tint. Called on
      init and from setMode. (A `#mode-badge` near the outputs was dropped
      post-review — see 6.3 note — so updateModeUI sets caption copy only.)
- [x] 6.7 tests (tests/engine.test.js): new §[29] "Simple vs advanced mode"
      (AFTER Phase 7: `SIMPLE_HEALTH_MODEL` comes from
      `require('../js/joint/index.js').SIMPLE_HEALTH_MODEL`, or just
      `require('../js/factors.js')`; `HEALTH_MODEL` from
      `require('../js/joint/index.js')`):
      (a) SIMPLE_HEALTH_MODEL at defaults → hrAvg exactly 1.0, LE delta 0
      (same invariant as advanced);
      (b) on a healthy profile the simple total == the naive marginal product
      (no cluster replacement) and DIFFERS from the advanced total (redundancy
      really removed);
      (c) no contribution record in simple mode carries `viaJoint`,
      `overlapBlend`, or `perLever`;
      (d) `sourceIndex(SIMPLE_HEALTH_MODEL)` keys are a SUBSET of
      `sourceIndex(HEALTH_MODEL)` keys, and the shared-prefix numbering
      matches: every shared key numbered BEFORE the first advanced-only source
      (weeldreyer2025/sanchezlastra2021/mente2023/ekelund2016/duncan2023) has
      the SAME number in both maps; keys at/after that point (the derived BMI
      + life-expectancy baseline) shift by the count of joint-finding sources,
      which is fine because BOTH pages always compute refs from the advanced
      model — simple mode never renumbers anything (canonical-numbering
      invariant);
      (e) the two `mode: 'advanced'` findings exist, are the only findings
      flagged, and their `when()` matches the original (data audit);
      (f) a findings-mode filter check (engine passes mode through). Suite
      green.
      DONE (2026-08-06): §[29] added before the A3 audit block. (a) 1.0x +
      delta 0; (b) simple == product of its own hrDeltas (0.6147) and differs
      from advanced (0.7736) with simple MORE protective (overclaim removed) —
      note the naive-product comparison uses the product of the SIMPLE
      contributions' hrDeltas, NOT plainHrOut (raw scale); the profile was
      chosen mild enough to stay above the 0.45 clamp (an extreme healthy
      profile pins the floor and hides the equality); (c) all contributions
      across all 5 outputs flag-free; (d) 99 vs 94 keys, subset + shared-prefix
      hold, 5 advanced-only sources exact; (e/f) 2 flagged findings + engine
      pass-through. Full suite green.
- [x] 6.8 Verification: `node --check` on all JS, full suite green, serve and
      manually check: defaults show 1.0× in BOTH modes; a healthy profile
      shows advanced LESS protective than simple (overclaim removed) with
      conflation tags in advanced and absent in simple; toggle preserves
      slider values; the two cluster findings vanish in simple; simple-mode
      chip [n] links still resolve on sources.html (canonical numbering); no
      console errors toggling rapidly.
      DONE (2026-08-06): `node --check` clean on all edited JS; full suite
      (1200 ok, 0 fail) + audit green; anchor/attribution probes green.
      DOM-shim probe (/tmp/opencode/mode_probe.js) driving the REAL app.js
      verifies: defaults 1.0× / LE 78.4 in advanced; healthy PA profile →
      advanced HR 0.76 vs simple 0.63 (advanced LESS protective — redundancy
      removed) with cluster note + header note + confl-foot present in
      advanced and ALL cleared in simple; the mode radio change handler
      actually swaps the displayed HR (0.63 ≈ engine simple 0.632,
      display-rounded), flips caption, and restores the cluster note on
      flip-back; slider values carry across (state untouched by setMode);
      base evaluateFindings returns no mode:advanced findings (they vanish in
      simple) while advanced returns them; simple-mode contribution records
      carry zero conflation tags. Canonical numbering: sourceIndex subset +
      shared-prefix invariant asserted in §[29]d. Served pages load clean
      (index has the toggle, sources has none; both pages' script order
      intact). A real-browser pass of 6.8's manual list is still
      recommended but the probe covers every assertion programmatically.
- [x] 6.9 AGENTS.md + file headers: add the mode convention line to AGENTS.md's
      design decisions and a short note atop js/app.js and js/factors.js so
      future work tags its feature's mode (advanced = conflation-clarity UI /
      simple = flat naive). Human reviews this diff.
      DONE (2026-08-06): AGENTS.md design decisions gains the "Two modes
      (v0.8/Phase 5.5)" bullet incl. the MODE CONVENTION ("any UI that
      explains HOW inputs combine is an ADVANCED-mode feature…; any file
      under js/joint/ is advanced-layer by definition; citation numbers
      always come from sourceIndex(HEALTH_MODEL)"). js/app.js header gains
      the mode-convention block (advanced surface + toggle mechanics);
      js/factors.js header gains the base-model convention (conflation
      structures absent by design; new HOW-combines structures belong in
      js/joint/; cluster-referencing findings get `mode: 'advanced'` and live
      in js/joint/findings.js). js/joint/index.js header already carried the
      advanced-layer note (Phase 7). Human review of the AGENTS.md diff
      still recommended.

## Phase 7 — extract/isolate the joint/advanced model into its own files (`js/joint/`) (created 2026-08-05)

Goal: physically separate the two models. `js/factors.js` becomes the base
SIMPLE model with the conflation structures REMOVED (not emptied); the
conflation layer moves to `js/joint/` (five data files + one assembler). The
engine stays a superset over the ASSEMBLED model, so no engine math changes.
This is a pure move+assemble refactor — citation numbers, the reset invariant
and both pages' output must be byte-identical afterwards (the test suite
proves it: zero assertion edits allowed). The goal is easier future maintenance by separating the joint model into its own files, more modular.

### Design decisions (from the planning pass — read before coding)

- **factors.js = the base SIMPLE model.** Keeps `meta`/`constants`/`baseline`/
  `outputs`/`inputs`/`bmi`/`findings`(minus the 2 cluster ones)/`sources`
  (minus the 5 joint-only ones). The `jointModels`/`overlaps`/`perLeverOnly`
  keys are DELETED entirely — absence === empty for engine/schema/app (every
  consumer guards with `model.jointModels || []`). Internal `const HEALTH_MODEL`
  name stays (it is THE model file); tail exports become
  `module.exports = HEALTH_MODEL` + `globalThis.SIMPLE_HEALTH_MODEL =
  HEALTH_MODEL` (drop the `globalThis.HEALTH_MODEL` line — that global now
  belongs to the assembled advanced model, set by js/joint/index.js).
- **js/joint/index.js assembles the ADVANCED model.**
  `HEALTH_MODEL = Object.assign({}, base, { jointModels, overlaps,
  perLeverOnly, findings: base.findings.concat(jointFindings),
  sources: Object.assign({}, base.sources, jointSources) })`. Distinct top-level
  object identity is REQUIRED (engine WeakMaps `calibrateCache`/`_avgCache` key
  by model object). Sets `globalThis.HEALTH_MODEL` (browser default =
  advanced) and `globalThis.SIMPLE_HEALTH_MODEL` (re-export of base); node:
  `module.exports = HEALTH_MODEL`, `module.exports.SIMPLE_HEALTH_MODEL = base`.
  Bump `meta.version`/`meta.updated` on the assembled model.
- **Shared vs joint-only sources.** `momma2022` STAYS in factors.js — the
  strength input marginals (factors.js:306/332/342) and a base finding (:2097)
  cite it. Only `mente2023`, `duncan2023`, `ekelund2016`, `sanchezlastra2021`,
  `weeldreyer2025` move to js/joint/joint-sources.js. In `sourceIndex` they are
  only reachable via jointModels/overlaps/findings-appended-last, so the
  append-order invariant (§[26]) survives unchanged.
- **findings split.** Base keeps findings :2075–:2199. The LAST TWO entries
  (:2201–:2208 — vo2maxOn/weeldreyer2025, underweight/sanchezlastra2021) move
  to js/joint/findings.js; the assembler appends them AFTER base findings
  (same relative order as today, so the `findings`-walk numbering in
  sourceIndex/sourceTags is unchanged).
- **Dual-export per file**, same pattern as factors/schema/engine: each data
  file does `module.exports = DATA` + `root.HEALTH_<X> = DATA`. index.js picks
  `root.HEALTH_<X> || require('./<x>.js')` (engine.js:82 pattern). Globals:
  `HEALTH_JOINT_MODELS`, `HEALTH_OVERLAPS`, `HEALTH_PER_LEVER_ONLY`,
  `HEALTH_JOINT_SOURCES`, `HEALTH_JOINT_FINDINGS`.
- **Script order (both pages):** factors.js → schema.js → engine.js →
  joint-models.js → overlaps.js → per-lever-only.js → joint-sources.js →
  findings.js → index.js → app.js (or sources.js). index.js must run after all
  data files and before the page scripts.
- **No schema.js / engine.js / app.js / sources.js changes.** `auditModel`
  uses `model.jointModels || []` (safe on the base too). app.js/sources.js read
  `globalThis.HEALTH_MODEL` (advanced). `refs = engine.sourceIndex(model)`
  stays canonical on both pages.
- **Tests/probes point at the assembler.** `model` (advanced) becomes
  `require('../js/joint/index.js')` in engine.test.js:9, audit.js:29,
  anchor.probe.js:3, attribution.probe.js:15. `plainModel` (engine.test.js:15)
  becomes `require('../js/factors.js')` — the base IS the plain model.
  `plainHrOut` still works: `perLeverIds` come from the advanced model, and the
  base product still includes the psychosocial marginals the advanced
  perLeverOnly cluster excludes (same recomposition math as today).
- **Phase 5.5 synergy:** the toggle's `SIMPLE_HEALTH_MODEL` now comes free from
  the split (step 6.1 → no-op, noted above); step 6.2's `mode: 'advanced'`
  fields still apply to the two joint findings, which now live in
  js/joint/findings.js.

### Phase 7 × Phase 5.5 compatibility (cross-checked 2026-08-05)

The two plans are compatible; Phase 7 must land FIRST (it is a pure refactor
proven green with zero assertion edits), then Phase 5.5 adds the toggle UI.
Verified against the code:

- **SIMPLE comes free.** Phase 5.5's derived
  `{ ...HEALTH_MODEL, jointModels: [], overlaps: [], perLeverOnly: [] }` is
  exactly the Phase 7 base object (keys absent instead of empty — every
  consumer guards with `|| []`: engine.js:181/355/498/513/544/814/1051/
  1211–1212/1264/1287, schema.js:110/127/132/139/165/185/206, sources.js:36/100).
  Behavior identical.
- **Distinct object identity holds.** Advanced = `Object.assign({}, base,
  …)`; caches key by model object (`calibrateCache` Map engine.js:353,
  `_avgCache` WeakMap engine.js:1021). Base and advanced share nested
  inputs/sources references (read-only) — toggle never cross-contaminates
  caches because each evaluate call passes exactly one model object.
- **Findings.** The two joint findings move to js/joint/findings.js (Phase 7
  step 7.4); simple mode can't show them because the base has no `mode:
  'advanced'` entries at all. Phase 5.5's app.js mode-filter is therefore
  unnecessary (kept only as a defensive no-op if ever evaluating the advanced
  model in simple mode). `mode: 'advanced'` fields + engine pass-through still
  wanted for self-documentation and test 6.7(e).
- **Citations.** Both pages compute `refs` from `globalThis.HEALTH_MODEL`
  (advanced, set by js/joint/index.js) regardless of toggle state, so chip
  [n] numbers never change when toggling. NOTE (verified 2026-08-05): the
  base's own `sourceIndex` is a subset of advanced BY KEYS, but NOT identical
  on every shared key — the 2 joint findings cite weeldreyer2025 +
  sanchezlastra2021 in the findings-walk BEFORE bmi/baseline, so the base
  pushes diangelantonio2016 (BMI) and nchs2023 (baseline) 2 positions
  EARLIER (simple 93/94 vs advanced 95/96). Harmless for the UI (pages use
  advanced refs); test 6.7(d) asserts the correct shared-prefix invariant
  instead of full equality.
- **Reset invariant.** `engine.evaluate` normalizes by `averageEval(model)`
  (= raw at defaults). Base at defaults → ratio exactly 1.0 → test 6.7(a)
  holds without any calibrate offset (calibrate lives only in the advanced
  joint models, where it already preserves the invariant).
- **Tests.** Phase 7 step 7.6 already repoints `plainModel` →
  `require('../js/factors.js')` (the base IS the naive product, incl.
  psychosocial marginals) — exactly what Phase 5.5 §6.7(b) needs.
- **Docs.** Phase 5.5 §6.9's mode convention goes into AGENTS.md + headers;
  it references factors.js — after Phase 7, also add a line for js/joint/
  files (any file defining joint data is advanced-layer by definition).

### Steps (one at a time; steps 7.0–7.5 are additive and safe in isolation,
7.6 must land atomically with its test-require swap)

- [x] 7.0 `js/joint/joint-models.js` — move the jointModels schema-comment
      block (factors.js:2211–2308) + data array (:2309–:2782) verbatim into a
      dual-export file (`root.HEALTH_JOINT_MODELS`). Header comment: "part of
      the assembled advanced model — see js/joint/index.js".
- [x] 7.1 `js/joint/overlaps.js` — move the overlaps array (factors.js:
      2783–:2904) + its leading comment; `root.HEALTH_OVERLAPS`.
- [x] 7.2 `js/joint/per-lever-only.js` — move the perLeverOnly array
      (factors.js:2906–:2911); `root.HEALTH_PER_LEVER_ONLY`.
- [x] 7.3 `js/joint/joint-sources.js` — move the 5 joint-only source keys
      (mente2023 :2925, duncan2023 :2934, ekelund2016 :2943,
      sanchezlastra2021 :2961, weeldreyer2025 :2970); `root.HEALTH_JOINT_SOURCES`.
      KEEP momma2022 in factors.js.
- [x] 7.4 `js/joint/findings.js` — move the 2 cluster-referencing findings
      (factors.js:2201–:2208); `root.HEALTH_JOINT_FINDINGS`.
- [x] 7.5 `js/joint/index.js` — the assembler (design decision above).
      `node --check js/joint/index.js`.
- [x] 7.6 Slim `js/factors.js` AND swap all test/probe requires to
      index.js/factors.js IN THE SAME EDIT: delete the moved blocks (findings
      tail, joint schema comment, jointModels, overlaps, perLeverOnly, 5 source
      keys); change the tail to export the base as `SIMPLE_HEALTH_MODEL` (no
      HEALTH_MODEL global); bump meta.version/updated; update the FILE MANIFEST
      header (factors.js:23–41). Requires: engine.test.js:9 → index.js,
      :15 plainModel → factors.js; audit.js:29 → index.js; anchor.probe.js:3
      and attribution.probe.js:15 → index.js. Then `node --check` on all
      edited JS + `node tests/engine.test.js` + `node tests/audit.js` + both
      probes — suite must stay green with ZERO assertion edits (this proves
      the assembled advanced model is byte-identical to the monolith).
- [x] 7.7 Pages — index.html + sources.html: add the 6 new script tags in the
      order above (after engine.js, before app.js/sources.js). No other HTML
      change.
- [x] 7.8 Docs — AGENTS.md file map: add the `js/joint/` files + adjust the
      factors.js line; engine.js:38–40 manifest comment stays accurate (no
      change); PLAN.md "Live structures" already updated. Human reviews the
      AGENTS.md diff.
- [x] 7.9 Verification — serve and smoke both pages: advanced renders
      IDENTICAL to pre-refactor (spot-check citation numbers [n] on chips,
      conflation tables + topic chips on sources.html, reset ⇒ 1.0× / baseline
      LE, all joint models/overlaps still listed); toggle-free pages have no
      console errors. Confirm `node tests/engine.test.js` + `node tests/audit.js`
      still green.

## Phase 8 — the Conflation explainer page (`conflation.html`) (created 2026-08-06)

### Goal

A new static, dependency-free page that (a) briefly explains the **conflation
problem** ("why can't you just multiply the sliders' effects together?"), (b)
walks through **how the combination math works at a first-year-university
level** (hazard ratios, log space, why marginals overclaim, the three fixes,
normalisation/clamp/uncertainty), and (c) gives an **interactive overview of
every conflation cluster** — the 5 joint models, the 8 overlap ρ pairs, and
the psychosocial per-lever cluster — as a **flex-grid of cards that pop open
into detailed dialogs** showing the exact math for every metric the cluster
affects, by how much and how.

Audience: a curious visitor who is not a statistician (the human designing this
is also not a statistician — this page is our chance to make the math legible).
Tone: patient, concrete, honest about uncertainty, zero fake precision.

**No new numbers, no engine changes.** The page is pure presentation: every
figure it shows is computed at render time from `globalThis.HEALTH_MODEL` via
existing engine/schema helpers (`engine.clusterTotals`, `engine.evaluate`,
`engine.activeOverlaps`, `engine.sourceIndex`, `schema.displayName`). The only
literals it may contain are the illustrative profiles in the worked examples
(step 8.6) and prose copy — never coefficients.

### Design decisions (from the planning pass — read before coding)

- **Placement & nav.** New file `conflation.html` at repo root. Add a third
  link to the `<nav class="page-nav">` on ALL three pages: Calculator |
  Conflation | Method &amp; Sources. On conflation.html the Conflation link
  carries `aria-current="page"`. conflation.html mirrors sources.html's simple
  topbar (title + nav only — NO mode toggle; the page describes the advanced
  model and says so in a note, "the calculator defaults to Advanced, which is
  what this page describes; Simple mode multiplies everything as if
  independent").
- **Sections (in-page anchors).**
  1. `#problem` — "The problem: inputs overlap". Plain-language: each slider's
     HR is the study's whole association for that trait, but traits share
     pathways and study populations — cardio+steps+sitting are all "physical
     activity", fiber+fruitVeg+nuts+fish are all "diet quality". The Ezzati
     2003 independence qualifier (research.md §1.1) is the whole issue. A
     mini-example box (the same 0.632→0.820 ekelund numbers as #math) plus
     links onward.
  2. `#math` — "How the combination math works" (the 1st-year-uni explainer,
     step 8.4). HR primer; risk multiplies so ln-HR adds; marginal vs partial
     effects; the three fixes each with a **computed** worked example; the
     fair/unfair boundary table (same copy as sources.html#fair-boundary);
     "average person" normalisation (reset = 1.0×); clamp [0.45, 4.0]; CI
     quadrature; Gompertz years; uncertainty framing (assumption-space bounds,
     not truth).
  3. `#clusters` — "How each cluster combines": the card grid + dialogs
     (steps 8.5–8.6).
- **Cluster cards (the flex grid).** Three sub-groups, each a `<h3>` + a flex
  container: "Joint estimates (one study, one number)" = 5 cards (dietScore,
  ekelundTable, mommaCells, duncanCells, mayoCells); "Residual overlaps (ρ
  pairs)" = 8 cards (one per pair); "Psychosocial — per lever only" = 1 card.
  Card = a `<button class="cluster-card">` (keyboard-accessible), styled
  `flex: 1 1 260px; max-width: 340px` inside a `display:flex; flex-wrap:wrap;
  gap:1rem` container. Card contents: title (schema.displayName), members (or
  the pair), the outputs it drives as chips, a one-line summary
  (jm.note/o.note trimmed), evidence badge, source `[n]`, and a "How it works
  →" affordance.
- **Dialogs.** Native `<dialog>` via `showModal()`: Esc closes, backdrop
  click closes, close button, focus returns to the card. One dialog element
  reused; its innerHTML is rebuilt per open target (joint model / overlap /
  psychosocial).
  - *Joint dialogs:* header (title, evidence, sources, close); "What this
    cluster is" (jm.note); "What feeds it" (owned `jm.members` + any read-only
    axis inputs referenced by `o.axes[].inputs`, with their role — own vs
    read-only); "What it drives" (outputs); per output, the exact-math tables
    reusing sources.js's rendering (`js/sources.js:62–124`: components +
    gradient for score models; `gridCells` axes+table for cell models,
    including mayoCells' bmi/bodyFat grids map); a **worked-example box**
    (step 8.6); and a link "Raw data table on the method page →
    sources.html#conflation".
  - *Overlap dialogs:* pair, ρ, ρU, kind/tier, note, sources; the blend rule
    in words + the formula (excess = ln(HR) − ln(rdHr); blended ln(HR) =
    ln(rdHr) + (1−ρ)·excess for the weaker same-direction deviation — PLAN.md
    design-decision §5, and an explicit "ρ is a model parameter, not a
    published number" line per the sources.html convention); a worked-example
    box; link to sources.html#conflation.
  - *Psychosocial dialog:* members; why no combination (no published joint
    estimate; pairwise ρ does not compose in dense triangles — research.md
    §5.1); what happens instead (points feed the cognition/happiness bands
    only, never an HR product); no worked example (nothing combines).
- **Worked examples are computed at render time** from engine calls at fixed
  illustrative profiles (the profiles are the only literals — see step 8.6 for
  the exact profiles + expected values, pinned in §[30] tests). Prose never
  hard-codes the numbers ("as the box shows, 0.63 became 0.82" is forbidden —
  the copy explains the concept, the `<code>` box carries the live number), so
  the page cannot drift from the model.
- **Drift-proofing & reuse.** conflation.js is a plain IIFE (like app.js /
  sources.js), reads the globals, uses `schema.displayName` for every label and
  `engine.sourceIndex` for every `[n]` (deep-linking to `sources.html#ref-N` —
  NOTE sources.js uses same-page `#ref-N`; conflation.js must prefix
  `sources.html#`). It re-implements sources.js's small table-builders
  (components/gradient/gridCells ≈ 40 lines). **Do NOT refactor sources.js to
  share them** — presentational duplication is acceptable (the DATA comes from
  the model, so it can't drift) and touching sources.js risks a working page.
  Flag this as a deliberate trade-off in a code comment.
- **Honesty requirements.** Mandatory disclaimer block (same spirit as the
  other pages); evidence badge + CI ranges on every card/dialog; the
  assumption-space framing; the "not medical advice, not a prediction about
  you" line. Simple-mode note (above). No analytics, no storage — a static
  page like the others.
- **Script order** on conflation.html (same stack as sources.html): factors.js
  → schema.js → engine.js → joint-models.js → overlaps.js → per-lever-only.js
  → joint-sources.js → findings.js → index.js → conflation.js.

### Steps

- [x] 8.1 Record this plan (the design block above) + the roadmap entry. No
      code. DONE (2026-08-06): section written.
- [x] 8.2 `conflation.html` — static skeleton: topbar + 3-link page-nav
      (Conflation `aria-current`), tagline, disclaimer block, the three
      `<section class="page-section">`s (#problem copy, #math host
      `#math-steps`, #clusters host `#cluster-grid` with the three sub-groups'
      `<h3>` + empty flex containers), footer with the privacy/not-medical
      lines + link to sources.html#references. Script stack at the bottom in
      the order above. No inline JS. Validate: `python3 -m http.server 8000`
      loads with a clean console (JS renders nothing yet is fine).
- [x] 8.3 Nav — add the Conflation link to index.html:26–29 and
      sources.html:15–18 page-navs (`<a href="conflation.html">Conflation</a>`
      between Calculator and Method &amp; Sources). Verify both pages still
      load and their script order is untouched.
- [x] 8.4 `js/conflation.js` — section #math renderer. For each of the three
      fixes, render a `.math-step` block: prose + a live `<code>` worked
      example box. Helpers:
      `clusterNormalized(id, out, prof)` = `clusterTotals(model, prof)[out].hr
      / clusterTotals(model, defaults)[out].hr`;
      `naiveProduct(memberIds, out, prof)` = product of
      `evaluate(model, prof).contributions[out]` hrDeltas over the members
      (`c.hrDelta || 1`). Render the fair/unfair boundary table (copy from
      sources.html:56–91) + the normalise/clamp/Gompertz/uncertainty bullets.
      `node --check js/conflation.js`.
- [x] 8.5 `js/conflation.js` — cluster card grid. Iterate `jointModels` (5),
      `overlaps` (8), `perLeverOnly` (1) → cards into their group containers.
      Card = `<button class="cluster-card" data-kind data-id>`: title via
      `schema.displayName(model, id)` (for overlaps, "A ↔ B"), members/pair
      line, output chips (`Object.keys(jm.outputs)`), one-line summary
      (first sentence of jm.note/o.note), `evBadge`, `citeKeys` (refs prefixed
      `sources.html#ref-`), "How it works →". Empty-state text if a group is
      empty. `node --check`.
- [x] 8.6 `js/conflation.js` — dialog builder. One `<dialog id="cluster-dialog">`
      reused; on card click, `buildDialog(data)` fills innerHTML per kind and
      `showModal()`. Joint dialog per the design block (reuse the sources.js
      table markup patterns for components/gradient/gridCells — including the
      mayoCells `grids` map branch). **Worked-example profiles** (the only
      literals; expected values from the real engine, verified 2026-08-06):
      ekelundTable: cardio 300 / steps 10000 / sitting 5 → naive ≈0.632 vs
      cluster ≈0.820; dietScore: fiber 40 / fruitVeg 6 / nuts 30 / fish 'lots'
      → naive ≈0.592 vs cluster ≈0.910; mommaCells: strength 2 + cardio 300 →
      cluster mortality ≈0.882 (prices aerobic×strength once); duncanCells:
      sleep 9.5 → cluster ≈1.310; mayoCells: weightKg 100 (BMI ≈35.4) →
      cluster ≈1.336 (was ≈1.402 pre-4.7 — the 2026-08-08 weight-default change
      to BMI 24.8 re-anchored the mayo cluster; §[30] re-pinned). Overlap
      examples (pick a profile where both sides deviate
      same-direction): magnesium 0 + diet crash (fruitVeg 0 / fiber 0 / nuts 0 /
      fish 'none') → magnesium hrDelta ≈1.071 blended ρ 0.5 vs dietScore; snus
      'yes' + alcohol 15 → alcohol hrDelta ≈1.134 blended ρ 0.15. If a pair is
      inactive at its profile, the box honestly says "no shared deviation at
      this profile — the discount is off." Close wiring: Esc (native), backdrop
      click, `.dialog-close` button, focus restore. `node --check`.
- [x] 8.7 css/style.css — `.cluster-group`, `.cluster-flex`, `.cluster-card`
      (+ hover/focus-visible lift + border accent), `.cluster-card .outputs`,
      `.dialog` + `::backdrop`, `.dialog-head`, `.worked-example`,
      `.math-step`, `.jm-axes`, responsive collapse at 900px (mirror the
      existing `main` grid breakpoint). Reuse existing tokens (`--accent`,
      `--card`, `--line`, `--radius`), `.ev`, `.chip.topic`, `.jm-tbl`.
- [x] 8.8 Tests (tests/engine.test.js) — new §[30] "Conflation explainer page
      data contract": (a) inventory: `jointModels.length === 5`, `overlaps.length
      === 8`, `perLeverOnly.length === 1` (== what the page renders); (b) for the
      fixed profiles in 8.6, the naive-vs-cluster numbers the page will display
      are asserted with tolerance (so a model change that alters a displayed
      figure fails the suite); (c) two overlap blend factors match (magnesium
      ρ0.5, alcohol ρ0.15 — reuse the §[18] scenario); (d) every cluster id /
      overlap pair / perLeverOnly id resolves via `schema.displayName` (no
      undefined titles on the page). Full suite + audit green.
- [x] 8.9 Verification — `node --check` on conflation.js; full suite + audit
      green; DOM-shim probe (/tmp/opencode/conflation_probe.js) driving the
      REAL conflation.js against a fake document: card counts per group (5/8/1),
      dialog opens with per-output tables present, worked-example numbers equal
      the engine's (same calls), Esc/backdrop/close handlers, empty-state
      fallbacks, simple-mode note + disclaimer present; serve and manual pass:
      all three pages nav correctly, dialogs readable, `[n]` links land on
      sources.html#ref-N. Implemented 2026-08-06: `node --check` clean; full
      suite + audit green; probe ALL checks pass (ekelund 0.63→0.82,
      magnesium 1.15→1.07, cards 5/8/1, joint/overlap/per-lever dialogs, all
      displayName resolutions, model-version footer); all three pages serve 200
      with the nav intact and untouched script order.
- [x] 8.10 IA follow-up — re-point the `.confl-more-note` (→ conflation.html#math)
      and `.confl-foot` (→ conflation.html#clusters, the per-cluster cards it
      describes) links on index.html (js/app.js `updateMoreNotes`), leaving the
      Simple/Advanced mode-caption "Full method →" links on sources.html#conflation
      (the raw methodology). conflation.html already links back to
      sources.html#conflation for the raw tables. Implemented 2026-08-06.
- [x] 8.11 Docs — AGENTS.md file map: add `conflation.html` + `js/conflation.js`
      lines; note the page renders the advanced model on both modes. Implemented
      2026-08-06. Human reviews the AGENTS.md diff (as with 7.8/6.9).

## Phase 5 — deferred (not now)

GBD pathway layer, age-conditional actuarial engine, own-cohort analysis, full
Q1/Q2 split + importance framing, Monte Carlo covariance default.
