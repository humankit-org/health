# PLAN — health.humankit.org

Living document. Update as things ship or priorities change. Nothing here
overrides the hard rules in AGENTS.md.

## North star

Make population-level health research **tangible and personal** — sliders in,
metrics out — while staying **boringly honest**: every number cited, every
uncertainty visible, nothing stored anywhere.

Our end goal of the entire website (our priorities):
1. Provide a realistic/accurate overview for users of the program about what variables affect your health, and by how much, realistically.
2. ALWAYS and ONLY source from real science
3. Try to provide as accurate metrics we can (with caveats and disclaimers noted, as this becomes harder when combining multiple inputs)

## Working agreements

1. **Sources first, code second.** A number only enters `js/factors.js` after
   someone has read the primary source and written a `note` summarising what
   it actually found (plus any approximation we made). Verification happens in
   the same commit as the number.
2. **Honest nulls are features.** "Vitamin D supplements did nothing in a
   26k-person RCT" is as valuable as a big effect. Null findings get shown (usually as an 'extra finding'), not buried.
3. **Uncertainty is UI.** Ranges, fuzz, evidence badges — never a single
   precise-looking number where the science is imprecise.
4. **Reference-profile defaults.** Reset ⇒ exactly 1.0× and "about average".
5. **Small diffs, tests green.** `node tests/engine.test.js` after every
   model change.

## The conflation problem & the v0.8 combination model

### The problem, measured

The model multiplies each study's marginal HR by every other study's marginal
HR. That is only correct when each HR is a *partial effect* — adjusted for
everything else on the page. Ours are not. Probe (2026-07-31, factors.js at
v0.1.2) with a merely-good profile — 300 min/wk cardio, 2×/wk strength, 10k
steps, decent diet, good sleep, low stress:

```
average person:   raw HR 0.465 (studies' reference strata are healthier than
                  the US average; v0.3 anchoring normalizes this to 1.0×)
                  → LE 78.4 = baseline exactly
"healthy" person: naive product 0.049 (−95%) before clamping
                  normalized pre-clamp 0.105 (−90%)
                  clamped to 0.45, LE pinned at +8.0 y (the gain cap)
per-cluster naive deltas (each alone, pre-multiplied):
  movement (cardio, steps, strength, sitting):  0.513  (−49%)
  diet (fiber, fruitVeg, nuts, magnesium, fish, procMeat, ssb, coffee): 0.447  (−55%)
  mind (purpose, social, stress, sleepReg):     0.469  (−53%)
```

(Cluster members with delta 1.0 at this profile — sun, occPA, sleep, meditation,
screen — omitted; meditation and screen have no mortality effects at all.)

Three distinct bugs:

1. **Marginal vs partial effects.** Each meta-analysis attributes the *whole*
   association of its one factor to that factor, because the cohorts adjust
   for our other sliders only partially or not at all. The worst offenders
   are latent-trait clusters: the eight diet sliders are one "diet quality"
   trait, yet their HRs multiply to −55% — while real top-vs-bottom
   dietary-pattern comparisons (HEI/DASH/Mediterranean) run about −20 to
   −30% all-cause mortality. The psychosocial cluster (purpose, stress,
   social, sleep regularity) is the same story.
2. **Shared-mediator double-charging.** Exercise lowers mortality partly
   *through* BMI — and the BMI slider charges that pathway again. Sleep
   regularity acts through BP variability — and RHR charges it again. Each
   mediator gets billed once per slider that traverses it. Similar problems may exist throughout the rest of the model that must also be accounted for, or have some way of working towards fixing.
3. **Ignored interactions.** Sitting's association with mortality largely
   attenuates at high activity (Ekelund 2016, 1M people, publishes the joint
   PA×sitting estimates; our own sitting note admits "an interaction we do
   not model") — yet sitting is still multiplied at full strength. Similar problems may exist throughout the rest of the model.

Verdict on multiplication itself: it is the correct rule *for partial
effects* (Cox models are log-linear). The failure is in the inputs —
marginal effects, unshared mediators, unmodelled interactions — and in
presenting the naive product as a precise total. Notably the clamp floor
(0.45) roughly matches published *joint* lifestyle-score gradients (best vs
worst combination ≈ 0.4–0.6): the endpoints are right, the path to them is
wrong. The model reaches the floor with moderately good habits; published
scores only approach it by being excellent on everything.

### Options considered (all of ours, with verdicts)

- **A. Category aggregation** (user): combine inputs into one
  'movement'/'diet' metric; weight categories by study-HR magnitude.
  *Help:* the category is the right unit — published *joint* evidence exists
  at category level (Ekelund 2016 PA×sitting; dietary-pattern
  meta-analyses), i.e. published answers to "how do these combine?".
  *Rejected parts:* weighting by HR magnitude is a category error — HRs are
  per-exposure-contrast (Di 2017's 1.073 is per 10 µg/m³; its realistic
  achievable change is ~2%). Real importance sources: GBD attributable-burden
  rankings, or each slider's achievable years-spread. Merging the *sliders*
  is also rejected — it kills per-lever feedback; sliders stay and feed
  category scores instead. *Adopted:* category-level combination (§Final
  plan, part 2).
- **B. Conflation half-matrix on sources.html** (user).   *Help:* forces
  explicit per-pair decisions; transparency; doubles as the covariance
  matrix for the uncertainty. *Limit:* a full matrix over the 37
  effect-bearing inputs is 666 cells of mostly "no data", which reads as
  "no conflation". Keep it sparse
  (~15–25 documented pairs) and *generated* from the data model (same
  pattern as `sourceIndex`/`sourceTags`), never hand-maintained. *Adopted*
  as the presentation layer over the overlap data (Phase 5).
- **C. Manual per-study independence inspection** (user). *Help:* the only
  way to ground the overlap numbers. Sharpened job: for each suspected pair,
  read the sources for (i) mutual adjustment, (ii) published mediation
  analyses (% of the association running through shared mediators like BMI),
  (iii) published interaction tables. Classify each overlap as
  **confounder** (the other factor's marginal is inflated → discount) or
  **mediator** (the downstream slider already contains part of the upstream
  effect → discount the *upstream* factor by the published % mediated).
  *Limit:* unmeasured confounding can't be proven away — price it into the
  uncertainty instead of chasing it. Watch overadjustment: adjusting for a
  mediator biases toward null; "adjusted for BMI" in an exercise paper is
  not a clean confounder adjustment. *Adopted* as Phase 1.
- **D. Combining confidence intervals** (user). Already implemented
  (log-space quadrature + evidence widening). The missing piece is
  *covariance*: correlated effects' errors don't add independently. The ρs
  from B/C are the covariances: σ²total = Σσᵢ² + ΣΣ ρᵢⱼσᵢσⱼ. *Adopted*
  (§Final plan, part 3).
- **E. Life-expectancy translation revisit** (user). Our LE calculations work by adding 7 years every halving of mortality, but is the *base* life expectancy also equal to 1.0x reference? e.g. the average person might eat 15g of fiber, but if our slider starts at 25g of fiber, and that is 1.0x reference, thats 8% mortality (fiber gives -8% mortality per 10g) that you don't get credit for. Baseline is LE at *birth* while profiles are midlife
  adults, and a constant HR is applied for the whole remaining lifespan —
  that's the age-conditional actuarial engine. Stays on the roadmap, out of
  scope here.
- **F. Declared overlap parameters (ρ) in factors.js** (assistant, Tier 1).
  *Help:* the conflation structure becomes machine-readable engine input.
  Blend rule for a correlated pair: keep the stronger effect full, discount
  the weaker in log space by ρ (ρ=0 → product, ρ=1 → the stronger effect
  alone — both anchors correct). The ρ values themselves are sourced: step
  meta-analyses report HRs adjusted for leisure-time activity where
  available and the association survives → cardio↔steps ρ is low; Ekelund's
  table gives sitting×PA directly. *Adopted* (§Final plan, part 1/3).
- **G. Joint calibration curves / lifestyle scores** (assistant, Tier 2).
  *Help:* replace "product of marginals" with a published curve that *is*
  the combination — e.g. Ekelund 2016's 4-way PA×sitting table as a 2-D
  lookup; dietary-pattern-score dose-responses (Schwingshackl-style
  meta-analyses give per-point HRs). Sliders become partial-credit
  components. *Adopted* at category level (§Final plan, part 2) — the user's
  category framing improved this: category curves map to domain-specific
  joint evidence without the resolution loss of a single global score.
- **H. GBD-style pathway apportionment** (assistant, Tier 3): tag each
  effect with a pathway (adiposity/metabolic/vascular/oncogenic/neuro);
  apportion within a pathway, multiply across. The structural fix for
  cross-category overlaps (sun↔sleep↔outdoor activity). *Deferred* — the
  category curves + ρ cover most of the benefit at far lower complexity.
- **I. Q1/Q2 UI split + importance framing** (assistant, Tier 3): "risk
  profile vs average" (joint-calibrated) vs "this lever does X" (labeled
  univariate associations). Serves goal 3 ("what affects health, by how
  much") via per-lever achievable years-spread and GBD-style importance,
  without pretending the total is precise. *Deferred* to a presentation
  pass.

### Final plan — the combination model (v0.8)

Principle: **sliders stay, combination changes.** Every slider keeps its
effect and its citation; what changes is how effects combine:

1. **Overlap inventory (sources-first).** Declare every documented overlap
   in a new top-level `overlaps` array in factors.js:
   `{ a, b, rho, kind: 'confounder'|'mediator'|'marker', note, source }`.
   ρ = the share of the weaker factor's effect treated as redundant with the
   stronger (0 = independent → 1 = fully redundant). `kind`: confounder
   (marginal inflated by shared exposure), mediator (downstream slider
   contains part of the upstream effect), marker (a proxy for another
   factor, e.g. grip for overall strength — not a lever). Each entry carries
   the citation and a one-sentence justification from the manual inspection
   (option C). ~15–25 entries; dense clusters (diet) may use a `cluster`
   shorthand with one shared ρ plus exceptions, to keep the data model
   readable.
2. **Category curves.** Movement combines via Ekelund 2016's published
   PA×sitting joint table — a 2-D lookup keyed by PA level (cardio + steps
   → MET-min/wk) and sitting hours; exact cell HRs verified against the
   paper before use. Diet: pairwise ρ within the diet cluster initially;
   upgrade to a published dietary-pattern dose-response curve if a suitable
   one is verified (Schwingshackl-style). Substances: keep multiplication —
   smoking, alcohol, snus, vaping are genuinely independent exposures and
   Wood 2018 adjusts for smoking; documented exception. Everything else:
   per-effect HR with ρ-blends. Supersession keeps working (VO2max replaces
   cardio, which now moves the PA level).
3. **Covariance uncertainty.** σ²total = Σσᵢ² + ΣΣ ρᵢⱼσᵢσⱼ over pairs with
   an `overlaps` entry. An inactive effect (HR 1.0) has σ = 0, so the
   covariance term only bites when both factors are active — no
   special-casing. Ranges now honestly span "independent" to "overlapping".
4. **Endpoints.** Floor/cap (0.45/4.0) remain as a safety net only; the
   curves should make the "regular healthy person" land mid-range (a
   regression test enforces this). Reset = baseline LE invariant stays.
5. **Mind outputs.** Same ρ-blending in points space — purpose, stress and
   social are one psychosocial trait and their points currently stack.

Assumptions & open decisions (settle during Phase 1):
- ρ values are judgment calls grounded in what the papers report; when
  uncertain, err toward discounting more (the error direction is
  overclaiming).
- Ekelund's table needs a verification pass against the paper before use,
  like every other number.
- The diet-curve upgrade depends on finding a published pattern-score
  dose-response with citable HRs; until then pairwise ρ is the honest
  fallback.
- Cross-category pairs to decide: RHR↔cardio/VO2max, grip↔strength,
  sun↔sleep↔outdoor activity, meditation↔stress.

### Implementation roadmap

**Phase 1 — inventory (no code; the real work; sources-first).** Produce the
`overlaps` drafts: pairs, classification, ρ, citation. Candidate pairs, by
cluster:
- movement: cardio↔steps (low ρ — steps meta-analyses adjust for
  leisure-time activity where available, association survives; verify),
  cardio↔sitting and steps↔sitting (superseded by Ekelund's table instead
  of ρ), strength↔grip (ρ ~0.5; grip is a marker, not a lever),
  cardio↔RHR (ρ ~0.3; RHR partly proxies fitness but survived activity
  adjustment), strength↔cardio (check Momma 2022 for a published joint
  estimate), sunExposure↔cardio/steps (outdoor activity, low ρ).
- diet (cluster, shared ρ ~0.3–0.5 for the "diet quality" latent): fiber↔
  fruitVeg, fiber↔nuts, fiber↔magnesium, fish↔nuts, processedMeat↔fish,
  processedMeat↔ssb (substitution patterns), coffee↔fiber/fruitVeg.
- psychosocial: purpose↔stress, purpose↔social, stress↔social,
  sleep↔sleepRegularity, screen↔sleep, sun↔sleep (circadian),
  meditation↔stress.
- mediator pairs (discount the *upstream* factor by published % mediated):
  cardio↔BMI, cardio↔bodyFat, steps↔BMI, strength↔BMI, sun↔vitaminD.
  (Mediation analyses report ~20–40% of the PA–mortality association
  through BMI; verify the specific source.)

Deliverable: a filled-in `overlaps` array, plus a paragraph here recording
any pair where sources were silent and what we did instead.

**Phase 2 — engine machinery (no behavior change; `overlaps` starts empty
→ no-ops).**
- `js/engine.js`: blend rule — for each overlap pair, when both effects are
  active (|log HR| > ε) and feed the same output, discount the weaker in log
  space by ρ (points: same rule on |points|); covariance — extend the
  quadrature sum in `evaluateRaw` with 2·ρ·σᵢ·σⱼ per active pair; export
  `activeOverlaps(model, values)` for UI/table use.
- `js/factors.js`: add `overlaps: []` with the documented schema comment.
- Tests: symmetry (a↔b == b↔a), ρ ∈ [0,1], ids exist, ρ=0 reproduces
  today's math exactly, ρ=1 pair → combined equals the stronger effect
  alone, covariance monotonically widens σ.

**Phase 3 — ρs live, category by category** (movement → psychosocial → diet
→ mediator discounts), each category with its own probe. After each
category, the per-cluster naive delta should move from ~0.45–0.51 toward
the published cluster endpoints (movement ~0.55–0.6 at moderate levels,
diet ~0.7–0.8, psychosocial ~0.8–0.9). Phase 0 regression test goes green.

**Phase 4 — movement category curve.** Verify Ekelund 2016's table (exact
cell HRs, matching units: PA level from cardio + steps via MET-min/wk;
sitting hours from the slider), add a `categoryCurves` entry + 2-D lookup
in the engine, retire the movement ρ entries it replaces. Supersession
still works: VO2max replaces cardio, which moves the PA level.

**Phase 5 — presentation.**
- `js/sources.js`: render the generated conflation table (pairs, ρ,
  classification, citation) from `overlaps` — same pattern as
  `sourceIndex`/`sourceTags` so it can't drift.
- `js/app.js` + `index.html`: per-category score chips; per-slider
  contributions disclose discounts ("counted at 70% — overlaps cardio");
  methodology copy updated: within-category effects use published joint
  estimates, categories treated as independent with ranges that price the
  risk; mind outputs disclose blended points.

**Phase 6 — deferred:** diet pattern-curve upgrade (decision from Phase 1),
GBD pathway layer (option H), age-conditional actuarial engine (option E),
Q1/Q2 split + importance framing (option I).

Tests: `node tests/engine.test.js` after every change; new assertions as
listed; the Phase 0 regression test is the completion criterion for Phase 3.

### Weaknesses (assessed 2026-07-31)

- **Pairwise ρ is a judgment parameter displayed next to citations** — risks
  reading as sourced even though no paper publishes a "redundancy share."
  *Criticality: moderate.* The error direction is right (discounting), but
  the mechanism is uniform where the evidence is uneven.
- **Pairwise ρ does not compose in dense clusters** — triangles
  (purpose↔stress↔social) double-discount; chains (A↔B, B↔C) can discount
  B twice while A↔C goes uncounted. *Criticality: moderate.* Invisible
  without dedicated tests; fixable by cluster-level blending.
- **ρ does two jobs** (point blend + covariance). Redundancy share ≠ error
  correlation. *Criticality: minor* — defensible simplification, but must be
  stated in methodology copy.
- **Under-uses published joint evidence.** The plan's own category-curve
  instinct (option G) is confined to movement plus an *optional* diet
  upgrade, while ~8 diet sliders get pairwise ρs even though a published,
  validated, interaction-tested joint diet model exists (PURE score — see
  Plan option #3). *Criticality: moderate–major.* This is the plan's biggest
  gap: it invents more than the science requires. Not wrong — mechanically
  safe — but over-engineered on the judgment surface.
- **Ekelund's table is load-bearing** with only an implicit fallback.
  *Criticality: minor.*
- **Substances asserted independent, verification deferred.**
  *Criticality: minor* — cheap to verify in Phase 1.
- **Overall:** mechanically sound and honest in direction; failures are of
  degree, not kind. Not pseudoscience — at category level the multiplication
  is a fair, standard assumption; within clusters it is known-unfair and the
  ρs fix the worst of it. Its main weakness is efficiency of honesty: it
  could lean on published joint models more and on judgment less.

## Plan option #2 — the evidence-tier combination model (alternative final plan)

*Written to stand alone: same structure as the v0.8 plan above (problem →
options → plan → assumptions → roadmap) so the two can be read side by
side. Everything it builds on is restated here; nothing is implied from the
other section, and no gaps are left if that section is deleted.*

### The constraint this plan starts from

No published study has ever fit a model with all ~37 of our inputs at once.
A scientific basis for a *combined* metric therefore cannot come from one
uniform mechanism — multiply, blend, or curve — because all of them are
invented at the combination step. It can only come from three real things:

1. **Published joint estimates** wherever they exist — papers that report
   how factors combine (PA×sitting tables, dietary-pattern-score
   dose-responses, multifactor lifestyle scores).
2. **Calibration** — anchoring our combined output to published joint
   gradients so the model is falsifiable, not just plausible.
3. **Bounded uncertainty** — showing the total as a range whose endpoints
   are the two defensible extreme assumptions (full independence vs full
   within-cluster redundancy), with the point estimate inside.

Plan option #1 gets the diagnosis right (marginal vs partial effects,
shared-mediator double-charging, ignored interactions) but applies one
mechanism — pairwise ρ — everywhere. This plan tiers the mechanisms by
evidence strength, shrinks the judgment-parameter surface, and makes the
residual judgment visible as a bound instead of a number.

### The problem, restated (same probe, 2026-07-31, factors.js at v0.1.2)

```
"healthy" person: naive product 0.049 (−95%) before clamping
                  normalized pre-clamp 0.105 (−90%)
per-cluster naive deltas (each alone, pre-multiplied):
  movement: 0.513 (−49%)     diet: 0.447 (−55%)    mind: 0.469 (−53%)
```

Three bugs (unchanged from Plan option #1):

1. **Marginal vs partial effects.** Each meta-analysis attributes the
   whole association to its factor; the eight diet sliders multiply to
   −55% while published top-vs-bottom dietary-pattern comparisons run
   about −20 to −30% all-cause mortality. The psychosocial cluster is the
   same story.
2. **Shared-mediator double-charging.** Exercise lowers mortality partly
   through BMI — and the BMI slider charges that pathway again. Each
   mediator gets billed once per slider that traverses it.
3. **Ignored interactions.** Sitting's association largely attenuates at
   high activity (Ekelund 2016 publishes the joint PA×sitting table; our
   sitting note admits "an interaction we do not model").

Verdict on multiplication: correct *for partial effects*; the failure is
in the inputs and in presenting the naive product as a precise total. The
clamp floor (0.45) roughly matches published *joint* lifestyle-score
gradients (best vs worst ≈ 0.4–0.6): endpoints right, path wrong.

### Options considered (Plan option #1's A–I restated, plus new J–N)

- **A. Category aggregation** — *adopted (as here)*: sliders stay; the
  category is the unit of combination, and it is the level at which
  published joint evidence exists.
- **B. Conflation half-matrix on sources.html** — *adopted*: sparse
  (~15–25 entries), generated from the data model, never hand-maintained.
- **C. Manual per-study independence inspection** — *adopted*: read
  sources for (i) mutual adjustment, (ii) published mediation analyses
  (% through shared mediators), (iii) interaction tables; classify each
  overlap as confounder | mediator | marker. Phase 1.
- **D. Combining CIs in quadrature** — *adopted, revised*: the covariance
  term is kept, but the ρ inside it is separated from the ρ used in the
  blend (see Plan, part 4) — redundancy share ≠ error correlation.
- **E. Life-expectancy translation revisit** — *out of scope* here; the
  age-conditional actuarial engine stays on the roadmap.
- **F. Declared ρ overlaps in factors.js** — *adopted, in reduced role*:
  pairwise ρ survives only for a small cross-category set (Tier 3). Dense
  clusters use *one cluster-level ρ* instead of per-pair values — fixes
  pairwise non-composition (three pairwise blends ≠ one cluster blend; a
  chain A↔B, B↔C can discount B twice while A↔C goes uncounted).
- **G. Joint calibration curves** — *adopted, expanded*: becomes the
  *default* where published evidence exists (Tier 1), not a special case.
- **H. GBD-style pathway apportionment** — *deferred* (same reasons:
  complexity, population-level rather than personal).
- **I. Q1/Q2 split + importance framing** — *partially pulled forward*:
  the per-lever "what this lever does" framing serves goal #1 and lands in
  Phase 5, even though the full Q1/Q2 split stays deferred.
- **J. Published joint / multivariable models** (new). Multifactor
  lifestyle scores (Li 2018-style) and pooled-cohort equations publish
  *jointly adjusted* coefficients — true partial effects. Where a
  published model's factor set overlaps ours, its coefficients are more
  honest than blending marginals. *Limits:* coarse (binary factors, few of
  them); reference category is the worst group, which may not line up with
  our average-person anchoring. *Adopted* as Tier-1 evidence, subject to
  the Phase-1 compatibility check.
- **K. External calibration tests** (new). Published joint-score gradients
  become regression anchors: a profile matching a score's healthy group
  must land near the published HR (within CI). Turns the combination model
  from a judgment call into something falsifiable. *Adopted.*
- **L. Bounds presentation** (new). Output the total as an interval
  between the independence endpoint (full product) and the
  cluster-redundancy endpoint (strongest effect per category only). The
  ρ-model sits inside. *Adopted* as the honesty layer; replaces "one
  number + CI" as the primary display.
- **M. GBD/PAF apportionment** (new restatement). Attribution-hierarchy
  data is published and solves conflation by construction, but it is
  population-level and a large integration lift. *Deferred* (same as H).
- **N. No-total radical honesty** (new). Per-lever deltas only, no
  combined metric. Most truthful, but kills the product and goal #3.
  *Rejected.*

### Final plan — the evidence-tier combination model (v0.8-alt)

Principle: **sliders stay, combination changes** — same as option #1, but
combination is an evidence hierarchy (published joint estimate → category
aggregate → small pairwise ρ set), and the output is a *bounded range*
rather than a point estimate with a CI.

1. **Evidence tiers (sources-first).** The `overlaps` array in factors.js
   gains a `tier` field; entries are grouped by mechanism:
   - **Tier 1 — published joint estimates.** Where a published curve or
     table *is* the combination, it replaces multiplication within its
     scope: Ekelund 2016's PA×sitting joint table (movement; 2-D lookup
     keyed by MET-min/wk and sitting hours); a dietary-pattern-score
     dose-response if a suitable one verifies (Schwingshackl-style
     per-point HRs); multifactor lifestyle scores whose jointly adjusted
     coefficients cover subsets of our factors (Li 2018-style) — each
     covered factor's marginal HR is replaced by the score's coefficient,
     subject to the Phase-1 compatibility check (adjustment set, reference
     category, anchoring).
   - **Tier 2 — category-level aggregates.** One cluster-level ρ per
     category (movement, diet, mind, sleep): the *category* is the unit of
     redundancy, so triangles compose by construction — no pairwise
     chains. Within a category, effects blend against the cluster ρ (the
     weaker is discounted in log space); where a Tier-1 curve covers the
     category it supersedes the ρ. Category HRs multiply across categories
     — a smaller, more defensible independence claim than per-slider — and
     the residual risk is priced by the covariance + bounds (parts 3–4).
   - **Tier 3 — cross-category ρ pairs, small set (~5–8).** BMI mediators
     (cardio↔BMI, steps↔BMI, strength↔BMI, sun↔vitaminD — discount the
     *upstream* factor by published % mediated where available);
     sun↔sleep↔outdoor activity (circadian); RHR↔cardio/VO2max;
     meditation↔stress; grip↔strength (marker, not a lever). Each entry:
     `{a, b, rho, kind, tier, note, source}`, with an explicit
     "assumption band" (ρ as a range) where the source is silent.
   - **Substances stay multiplied** (documented exception): smoking,
     alcohol, snus, vaping are distinct exposures and Wood 2018 adjusts
     for smoking — but Phase 1 must *verify* mutual adjustment in each
     source; any pair that fails becomes a Tier-3 entry.
2. **Calibration layer.** Published joint lifestyle-score gradients become
   external anchors: regression tests map a profile equivalent to a
   published score's "healthy group" onto the published HR (within CI).
   Where a category has a published gradient (diet patterns ≈ −20–30%),
   the cluster ρ is chosen so the aggregate reproduces it. The model is
   falsifiable; the Phase-3 completion criteria are calibration tests, not
   just "doesn't pin the floor/cap."
3. **Bounded output.** Every combined metric is displayed as a range with
   two computed endpoints:
   - **independence endpoint** (least discounting): full product of all
     active effects — today's math;
   - **cluster-redundancy endpoint** (most discounting): within each
     category only the strongest active effect counts; Tier-3 pairs at
     their ρ.
   The ρ-model point estimate sits between them; the interval width is the
   honest statement of what the science cannot resolve. LE: years range
   from the endpoints, point estimate as midpoint (or median of the bounds
   distribution — Phase-5 decision). Mind outputs: same bounds in points
   space, mapped to bands with the fuzz already in place.
4. **Covariance uncertainty (revised).** Quadrature unchanged in form —
   σ²total = Σσᵢ² + ΣΣ ρᵢⱼσᵢσⱼ over active overlap pairs — but the ρ used
   here is the *uncertainty* ρ, deliberately separated from the blend ρ
   (part 1): redundancy share ≠ error correlation, and the methodology
   copy says so. When an overlap's ρ is itself a band, the covariance term
   is widened by the band, or the engine runs a small Monte Carlo (sample
   ρ per active pair, report percentiles) — zero dependencies, pure math;
   the Monte Carlo becomes the default if the analytic form proves
   insufficient. Evidence widening (×1 / ×1.5 / ×2.25) unchanged.
5. **Endpoints.** Floor/cap (0.45/4.0) remain a safety net only; the
   calibration tests (part 2) are the real guardrail. Reset = baseline LE
   invariant unchanged.
6. **Mind outputs.** Same tier logic in points space: the psychosocial
   cluster (purpose, stress, social) blends as one trait; sleep blends with
   sleep regularity; bounds shown as band fuzz; low-evidence badges
   unchanged.

### Assumptions & open decisions (settle during Phase 1)

- Cluster and cross-category ρ values are judgment calls grounded in what
  the papers report; when uncertain, err toward discounting more (the
  error direction is overclaiming) — and record the band.
- Tier-1 adoption rule: a published joint estimate replaces marginal
  blending only when its adjustment set, reference category, and unit
  definition are compatible with ours after the Phase-1 verification pass;
  otherwise it is cited as a calibration anchor instead.
- The bounds endpoints will be wide for healthy profiles (independence vs
  redundancy is a big spread) — that is the point, and Phase-5 copy must
  pre-frame the range ("spans the plausible extremes") so it reads as
  honesty, not noise.
- Whether the "big number" LE is the range midpoint or the median of the
  bounds distribution — presentation decision, Phase 5.
- The diet curve upgrade depends on finding a published pattern-score
  dose-response with citable HRs (same as option #1); until then, cluster
  ρ is the honest fallback.
- Cross-category pairs to decide: RHR↔cardio/VO2max, grip↔strength,
  sun↔sleep↔outdoor, meditation↔stress (unchanged from option #1).

### Implementation roadmap

**Phase 1 — inventory (no code; sources-first; re-scoped question).** The
question changes from "catalog all pairs" to "what joint/multivariable
evidence exists per category?" Hunt Tier-1 candidates first (Ekelund cells,
dietary-pattern-score dose-responses, Li 2018-style multifactor scores
with factor overlap), then draft cluster-level ρ per category with
justification, then the small Tier-3 cross-category set with
% mediated / mutual-adjustment evidence or assumption bands. Deliverable:
a filled `overlaps` array (`tier` field, cluster shorthand, assumption
bands), the Tier-1 compatibility notes, and a paragraph recording any pair
where sources were silent and what we did instead.

**Phase 2 — engine machinery (no behavior change; `overlaps` empty → no
ops).**
- `js/engine.js`: tier dispatch — Tier-1 lookups replace (Ekelund 2-D
  table; pattern curves), Tier-2 cluster blend (weaker discounted in log
  space by the cluster ρ), Tier-3 pairwise blend; covariance with the
  separated uncertainty ρ; `bounds(output)` computing the independence and
  cluster-redundancy endpoints; `activeOverlaps(model, values)` for UI
  use.
- `js/factors.js`: `overlaps: []` with the documented schema (tier,
  cluster shorthand, assumption bands).
- Tests: symmetry, ρ ∈ [0,1], ids exist, ρ=0 reproduces today's math
  exactly, ρ=1 pair → stronger alone, bounds ordering (independence ≥
  midpoint ≥ cluster-redundant for every profile), covariance widens
  monotonically, Tier-1 lookup vs cluster ρ agree within CI where both
  exist.

**Phase 3 — ρs live, category by category** (movement → psychosocial →
diet → Tier-3 pairs), each with its own probe; after each, per-cluster
naive deltas move toward published cluster endpoints (movement ~0.55–0.6,
diet ~0.7–0.8, psychosocial ~0.8–0.9). Completion criteria: the Phase-0
regression test ("regular healthy person" must not pin floor/cap) **and**
the calibration tests (part 2) green.

**Phase 4 — movement category curve.** Verify Ekelund 2016's table (exact
cell HRs; MET-min/wk keying from cardio + steps; sitting hours from the
slider), add the Tier-1 lookup in the engine, retire the movement ρ
entries it replaces. Supersession unchanged (VO2max replaces cardio, which
moves the PA level). Diet-curve decision point: verified pattern-score
dose-response → adopt as Tier-1 for diet; else cluster ρ stands, with the
reason recorded in the methodology.

**Phase 5 — presentation.**
- `js/sources.js`: generated conflation table from `overlaps` (pairs,
  tier, cluster ρ or band, classification, citation) — same drift-proof
  pattern as `sourceIndex`/`sourceTags`.
- `js/app.js` + `index.html`: bounded outputs (range display per card,
  midpoint marked); per-slider disclosures ("counted at 70% — overlaps
  cardio"); the per-lever "what this lever does" section pulled forward
  from option I (univariate deltas labeled as such, separate from the
  combined range); methodology copy rewritten: tier hierarchy, ρ named as
  a model parameter (not a published number), bounds pre-framed.
- Mind outputs disclose blended points and band fuzz.

**Phase 6 — deferred:** GBD pathway layer (H), age-conditional actuarial
engine (E), diet curve if not adopted in Phase 4, full Q1/Q2 split if the
per-lever section ships in Phase 5, default-on Monte Carlo if the analytic
covariance proves insufficient.

Tests: `node tests/engine.test.js` after every change; new assertions as
listed per phase; Phase-3 completion = regression + calibration tests.

### Weaknesses (assessed 2026-07-31)

- **The bounds are assumption-space bounds, not scientific bounds.** They
  bound our modeling choices (independence vs cluster-redundancy), not the
  truth — synergy or antagonism can put reality outside the interval.
  *Criticality: moderate* — presentation risk; fixable by labeling ("the
  range of our models' answers", never "the plausible range of the truth").
- **Calibration anchor selection is judgment** — the 5-factor gradients
  differ by study: Li 2018 US HR 0.26 (0.22–0.31), China 0.38, Korea 0.37
  for equivalent profiles; no rule for choosing or for responding to a
  failed test. *Criticality: moderate* — the falsifiability claim is weaker
  than advertised; needs pre-registered anchors with a stated tolerance band
  and a defined failure response (record and widen, never silently tune).
- **Tier-1 replacement can re-introduce mediator double-charging** — a
  score's coefficient adjusted for BMI multiplied with our still-active BMI
  slider. *Criticality: moderate* — real modeling gap; fixable with the
  adjustment-set check, which the plan mentions but does not operationalize.
- **Cluster ρ composes the point estimate, not the covariance** — pair-level
  ρs are still needed for the quadrature. *Criticality: minor.*
- **Complexity tax.** Tier dispatch + bounds + two ρs + Monte Carlo option
  is more machinery than the residual problem justifies once the
  joint-evidence tier is as large as the research shows it can be.
  *Criticality: moderate* — the plan works, but spends effort in the wrong
  place: the science can carry more of the load than it assumes.
- **Psychosocial cluster default is still blending where no evidence
  exists** (cluster ρ with a band). The better honest answer is per-lever
  only. *Criticality: moderate* — treat the gap as a non-answer by design.
- **Overall:** the best architecture of the first-generation options
  (hierarchy, falsifiability, ρ-job separation), but the center of gravity
  stays on blending machinery. Assumptions are fair at category level and
  defensible-but-avoidable within clusters.

## Plan option #3 — the joint-estimate-first model (final candidate)

*Written to stand alone: same structure as options #1–2 (problem → options →
plan → assumptions → roadmap). The evidence base below was verified against
primary sources and abstracts on 2026-07-31; everything marked "verify"
still needs the project's standard verification pass before entering
`js/factors.js`.*

### The reframe (what changed since options #1–2)

Two verified facts changed the problem's shape:

1. **Multiplication is not the bug; multiplying *marginals* is.** Papers
   that fit factors jointly and then test interactions find the
   multiplicative rule approximately right: PURE diet-score components show
   no significant multiplicative interactions (LR test p=0.304; fruit-veg
   and fish-veg pairs null — npj Sci Food 2026; note: cognition outcome);
   a 282,473-person US analysis of PA×strength×sleep found no significant
   multiplicative or additive interactions except long-sleep synergy (NHIS,
   2023). The failure is that our per-slider HRs are *marginal* — each
   meta-analysis attributes the whole association of its factor to that
   factor.
2. **Published joint estimates exist for the biggest clusters** — more than
   options #1–2 assumed: diet (PURE score: jointly fitted, validated in 5
   independent cohorts, per-percentile gradients, plus a menu of
   US-compatible scores fitted in the same framework), movement (Ekelund
   2016 PA×sitting; Momma 2022 aerobic×strength combined cells; NHIS 2023
   PA×strength×sleep cells), adiposity (Mayo 2021 PA×BMI/BF joint cells;
   BJSM 2025 CRF×BMI joint meta-analysis), and published mediation shares
   for the PA↔BMI pair (CHARLS 37.2%, MSSE 22.2%).

Consequence: the combination problem shrinks to a *sourcing* problem for
the big clusters and an *honest non-answer* for the rest. Options #1–2
spent their machinery on blending math (ρ); this plan spends it on
verification passes, with blending reduced to a small documented residual.

### The honesty sizing (is the current model pseudoscience?)

No — with two fixable overclaims. The current model is the standard
comparative-risk-assessment approximation: combining RRs under an
independence assumption is a published WHO/GBD-family method (Ezzati 2003,
Lancet 362:271–80), *valid when factors are weakly correlated and do not
share pathways* — that qualifier is the entire conflation problem in one
sentence. The error is bounded: the clamp floor (0.45) ≈ published joint
best-vs-worst gradients (Li 2018 US 0.26; Sun 2022 China 0.38; PURE diet
alone 0.70), and average-person anchoring makes reset exactly right. The
two honest failures: (1) independence is applied *within* clusters where
correlation is high — the unfair zone (probe clusters multiply to
−49/−55/−53%); (2) point-precision display overstates. Both are
targeted-fixable; the fix set is ~12–15 verification passes, not 37×37
pair bookkeeping.

### Options considered (carry-forward verdicts + new)

Carry-forward (options #1–2 restated): A category aggregation — adopted;
B sparse generated conflation matrix — adopted; C manual source inspection —
adopted (this plan *is* option C industrialized); D covariance quadrature —
adopted; E LE-translation revisit — out of scope (age-conditional engine on
roadmap); F ρ machinery — adopted *only as fallback*; G joint curves —
adopted *as the centerpiece, not a special case*; H GBD pathway
apportionment — deferred; I Q1/Q2 framing — partially adopted (per-lever
section, Phase 4); J published joint/multivariable models — adopted (this
plan's core; research confirms far more joint evidence exists than #2
assumed); K external calibration — adopted; L bounds — adopted with the
corrected label (assumption-space, not truth-space); M GBD/PAF — deferred;
N no-total radical honesty — rejected.

New:

- **O. Joint-estimate-first sourcing order.** For each cluster: verify the
  best published joint model → use its coefficients; only where none exists,
  fall back to marginal HRs with ρ or to per-lever-only display. *Adopted*
  (this plan's core).
- **P. Own-cohort primary analysis.** Fit our own multivariable model on UK
  Biobank to obtain true partial effects for *all* factors jointly.
  *Rejected:* changes the project from curator of published science to
  researcher, undercutting the trust model; UKB healthy-volunteer bias and
  slider-measurement mismatches need their own corrections; published joint
  estimates capture most of the benefit with zero character change.
  Revisit only if Phase 1 reveals a major cluster with no joint evidence
  and no other option.
- **Q. Non-answer clusters.** Where no joint evidence exists (psychosocial),
  the cluster is shown per-lever only — no combined claim, by design. This
  converts an evidence gap into the site's honesty layer. *Adopted* as the
  default unless Phase 1 finds joint evidence.

### Final plan — the joint-estimate-first model (v0.9)

Principle: **sliders stay; each cluster's total comes from the best
published joint model; the independence assumption is applied only across
clusters where correlation is modest; clusters without joint evidence are
not combined.** Blending (ρ) survives only for the residual pairs the
sources do not cover.

1. **Phase 0 — attribution analysis (measure before fixing).** A probe
   script decomposes the healthy-profile total log-HR into per-cluster and
   per-pair contributions. Prediction to test: ~80% of the overclaim
   concentrates in three products — diet (8 sliders), movement (cardio×
   steps×strength×sitting), psychosocial (purpose×stress×social×sleepReg).
   The fix set is sized by the result: only clusters that measurably
   contribute to the excess get joint models; the rest keep multiplication
   with a note. Also produces the fair/unfair boundary table (part 2).
2. **The fair/unfair boundary (the model's constitution).** Three explicit
   zones, stated on the methodology page verbatim:
   - **Fair multiplication** (no fix, uncertainty only): across clusters
     (movement × diet × mind × substances × sleep are different exposure
     domains, modestly correlated) — justified by Ezzati 2003's qualifier
     and by cross-category meta-analyses adjusting for the other domains
     where available; and within clusters *inside published joint models*
     (PURE components; PA×strength) — justified by the interaction tests
     above.
   - **Unfair multiplication** (must be replaced by joint estimates):
     within clusters with no joint model — the Phase-0 probe clusters.
   - **No combination** (per-lever only): psychosocial cluster unless
     Phase 1 finds joint evidence; any factor whose sources are univariate
     with no credible overlap data (screen→happiness already treated this
     way).
3. **Cluster fixes (the centerpiece — sourcing, not math).**
   - **Diet** → PURE-style joint score family. Verify Mente 2023 (Eur
     Heart J 44:2560–80): 6 components (fruit, vegetables, nuts, legumes,
     fish, whole-fat dairy), per-20-percentile-increment HRs, gradient
     HR 0.70 (0.63–0.77) for ≥5 vs ≤1, confirmed in 5 independent cohorts
     (HR 0.73, 0.66–0.81); the same paper fits HEI-2010/2015, DASH,
     Mediterranean, and Planetary scores to 244,597 people across 80
     countries — pick the score family after the US-fit check (decision
     rule in Assumptions). Map our protective sliders onto score
     components (fiber→fruit/veg/legume family, fruitVeg, nuts, fish).
     Magnesium and coffee are not score components — keep as marginal HRs
     with ρ against the score, or move to findings (decide with evidence).
     Harmful foods (processedMeat, ssb) are not in protective scores —
     keep marginal HRs with substitution ρ against the protective base;
     hunt published substitution analyses (red-meat→plant-protein HRs
     exist) in Phase 1.
   - **Movement** → joint cells: Ekelund 2016 PA×sitting (verify exact
     cells) + Momma 2022 (BJSM 56:755–63) aerobic×strength combined
     RR 0.60 (0.49–0.72) all-cause / 0.54 CVD / 0.72 cancer (verify) +
     NHIS 2023 PA×strength×sleep cells (282,473 US adults; long-sleep
     synergy the only interaction) where sleep is involved. Strength is
     the lever; grip stays a marker finding.
   - **Adiposity** → joint, not mediated-discount: Mayo 2021 (Mayo Clin
     Proc 96:108–21) PA×BMI/BF/WC joint cells (UK Biobank, 295,917; PA
     attenuates high-adiposity risk — HR 1.54 low-PA/high-BF vs
     high-PA/low-BF referent) or BJSM 2025 CRF×BMI joint meta-analysis
     (fitness absorbs BMI's association — verify). Supersession (VO2max
     replaces cardio, bodyFat replaces BMI) keys into these joint tables.
     Where no joint cell exists, use the published %-mediated band 20–40%
     (CHARLS 37.2% BMI / 39.6% CRP; MSSE 22.2% BMI–CVD) as the upstream
     discount, band displayed.
   - **Psychosocial** → per-lever only (default; the Phase-1 search pass
     must confirm no joint evidence). Purpose, stress, social, sleepReg
     keep their marginal deltas with evidence badges; the cluster shows no
     combined number. This is the design's honesty statement, not a gap.
   - **Substances** → multiplication; verify mutual adjustment in each
     source (Wood 2018 adjusts for smoking; check alcohol, snus, vaping
     sources). Any pair that fails becomes a ρ pair.
   - **Cross-cluster residual** → the small ρ set from option #2 (~5–8
     pairs: sun↔sleep↔outdoor, RHR↔cardio/VO2max, meditation↔stress,
     grip↔strength) with assumption bands; covariance uses these ρs.
4. **Uncertainty & bounds (revised).** Covariance quadrature unchanged in
   form, but σ entries come from the joint models' published CIs. The
   option-#2 bounds are kept with the corrected label — "the range of our
   models' answers under two extreme assumptions (full independence vs
   within-cluster redundancy)" — never "the plausible range of the true
   answer"; methodology copy says so. Evidence widening (×1 / ×1.5 /
   ×2.25) unchanged. Monte Carlo only if the analytic form proves
   insufficient.
5. **Calibration (falsifiability).** Regression tests anchor the combined
   model to published joint gradients: the PURE diet gradient (0.70 for
   the equivalent diet profile), Ekelund cells, Momma combined cells, and
   the US 5-factor lifestyle gradient (Li 2018, Circulation 138:345–55:
   HR 0.26, 0.22–0.31 for 5-vs-0; +14.9 y women / +12.4 y men at age 50).
   Because gradients differ by study (China 0.38, Korea 0.37), anchors are
   pre-registered with a stated tolerance band; a failed test is recorded
   and widens uncertainty — never silently tuned.
6. **Mind outputs.** Same per-cluster rule in points space: psychosocial
   blends nothing; bands, fuzz, and low-evidence badges unchanged.

### Assumptions & open decisions (settle during Phase 1)

- The PURE component-additivity evidence is from a *cognition* outcome
  (npj Sci Food 2026); extending "no multiplicative interactions" to
  mortality is an assumption, stated in the methodology. The
  mortality-side interaction tests (NHIS 2023) cover the PA clusters.
- Score-family selection rule: prefer the score with US-cohort validation
  and the most slider overlap; if PURE-specific components fit our sliders
  poorly (e.g. dairy), a US-fitted alternative (HEI-2015 family) from the
  same comparison paper wins. Decision recorded with the verification
  notes.
- Sliders the chosen score does not cover (magnesium, coffee) keep marginal
  HRs with ρ against the score's protective base, or move to findings —
  decided by the Phase-1 evidence hunt (published substitution /
  mutual-adjustment data).
- The Ekelund/Momma/NHIS/Mayo cell verification is the Phase-2 gate: exact
  cell values, units, and reference categories must match our sliders'
  scale (MET-min/wk keying); where cells are sparse, interpolate from the
  papers' fitted curves.
- Psychosocial per-lever default flips to a joint model only if Phase 1
  finds one; otherwise it is permanent and advertised as such.
- Cross-category pairs list unchanged from option #2.

### Implementation roadmap

**Phase 0 — attribution probe** (no model change): script decomposing the
total log-HR per cluster/pair; deliverables: the fair/unfair boundary table
and the fix-set sizing; results recorded in PLAN.md.

**Phase 1 — verification passes (the real work; sources-first; ~12–15
passes):** as listed under cluster fixes — Mente 2023 (gradient,
per-20-percentile HRs, adjustment set incl. PA/smoking/waist-to-hip; the
additivity-test source), score-menu comparison HRs, Ekelund cells, Momma
cells, NHIS 2023 cells, Mayo 2021 cells, BJSM 2025 CRF×BMI, CHARLS/MSSE
mediation shares, substitution analyses (procMeat/ssb vs protective foods),
psychosocial joint-evidence search pass, substance mutual adjustment, Li
2018 + one non-US gradient for the calibration band. Deliverables: a
`jointModels` structure in factors.js (`{ id, cluster, model:
'score'|'table'|'cells', source, steps, units }`), the residual `overlaps`
list, and a PLAN.md paragraph recording any cluster where sources were
silent and what we did instead.

**Phase 2 — engine (no behavior change; `jointModels` empty → no-ops):**
`js/engine.js`: cluster dispatch — cluster totals from `jointModels`
lookups (score gradient → per-component partial credit; table/cell
interpolation), else marginal product, else per-lever-only flag; ρ blend +
covariance for the residual set only; bounds endpoints;
`activeJoint(model, values)` / `activeOverlaps(model, values)` exports.
Tests: lookups keyed correctly, interpolation bounds, ρ=0 reproduces
today's math for unaffected clusters, bounds ordering, per-lever-only
clusters never enter the product.

**Phase 3 — live per cluster, ordered by Phase-0 sizing** (diet →
movement → adiposity → substances verification → psychosocial flag). After
each cluster: per-cluster naive deltas land on the published cluster
endpoints (diet ≈ the 0.70 gradient; movement ≈ Ekelund/Momma cells).
Completion: Phase-0 regression test green + calibration suite green.

**Phase 4 — presentation.** The generated conflation table on sources.html
now includes the joint models (components, gradient, cells) from
`jointModels`; per-slider disclosures ("this lever is part of the PURE
diet-score family — combined jointly, not multiplied"); methodology copy:
the fair/unfair boundary table verbatim, the Ezzati 2003 independence
qualifier, bounds labeled as assumption-space; psychosocial card copy: "no
reliable way to combine these yet — shown individually"; the per-lever
"what this lever does" section (option I) ships here.

**Phase 5 — deferred:** GBD pathway layer (H), age-conditional actuarial
engine (E), own-cohort analysis (P) only if a Phase-1 gap demands it, full
Q1/Q2 split if the per-lever section ships in Phase 4, Monte Carlo default
if the analytic covariance proves insufficient.

Tests: `node tests/engine.test.js` after every change; assertions per phase
as listed; Phase-3 completion = regression + calibration tests; the
attribution probe re-runs after each cluster fix.

## Roadmap

### Now (v0.3, mostly done)
- [x] New inputs v0.2: snus, cannabis, meditation, vitamin D, dietary
      magnesium, occupational physical activity, iron deficiency, cognitive
      training
- [x] New inputs v0.3: processed meat, sugar-sweetened beverages, fish,
      sitting time, sense of purpose, grip strength (advanced)
- [x] Advanced (gated) inputs: VO2 max (replaces cardio), body fat %
      (replaces BMI), grip strength
- [x] Uncertainty widening by evidence level, combined in quadrature;
      fuzz scales on mind outputs
- [x] Findings card (sourced facts that don't fit sliders)
- [x] **Average-person anchoring:** defaults = population averages; every
      displayed number is "vs the average person" (1.0×); reset ⇒ average ⇒
      exactly baseline LE. Studies' reference strata never shown directly.
- [x] New inputs v0.5 (all verified before coding): nuts (Aune 2016),
      resting heart rate (Aune 2017, gated — fitness overlap noted), sleep
      regularity (Windred 2024, stronger than duration), air pollution PM2.5
      (Di 2017, framed as exposure not habit). **Whole grains CUT as a
      slider** — overlaps fiber (same foods, same effect size); credited in
      a finding instead to avoid double-counting.
- [x] Vaping (e-cigarettes) input v0.6: segmented Never/Current, substances
      group. **Mortality & cancer = honest nulls** — the only national
      mortality cohort (NHIS) suppressed the exclusive-vaping estimate (too
      few deaths) and no human cancer signal exists in 39 studies; the
      dual-use evidence (HR 2.44 ≈ exclusive smoking) is a finding instead.
      CVD uses PATH's null point estimate (HR 1.00, 0.69–1.45, low
      evidence); mind outputs small negatives (cognition −0.1, happiness
      −0.15, both low). Sources: Xie 2024, Berlowitz 2022, Kundu 2025,
      Novak 2024, Kang 2024.
- [ ] **v0.8 conflation fix** (full detail in "The conflation problem" section
      above): overlap inventory → engine ρ-blend + covariance machinery →
      ρs live per category → Ekelund movement curve → generated conflation
      table + methodology copy. Phase 0 regression test: "regular healthy
      person" profile must not pin floor/cap.

### Design decisions made (and why)
- **Cancer output exists but only sums what's sourced (v0.4).** It combines
  cancer-specific effect sizes for the ~11 inputs that have them and lists
  every other input as "no data yet" on the card itself. Overlap with
  all-cause mortality (cancer ≈ a fifth of it) is stated on the card.
- **Functional/independence outcomes live in findings** (osteoporosis, falls,
  honest injury nulls) — no separate output until more is sourced.
- **US averages, not world.** The baseline life table and the average profile
  are US-centric (US LE is ~4–6 y BELOW other high-income countries — the
  discrepancy the anchoring now handles explicitly). Non-US baselines are a
  roadmap item.

### Next (needs verification pass first)
- [ ] **Verify flagged numbers** (all marked in `note` fields): sauna
      all-cause HRs vs paper Table 2; NCHS 2023 baseline figures; body-fat
      steps vs Jayedi 2022; occupational-PA middle step; coffee 1–2 & 5+
      steps; smoking all-cancer HR (replace approximation with Carter 2015
      site-specific figures); screen-time default average (~5 h/day —
      BLS ATUS blocks automated fetch; DataReportal/GWI social-media time).
- [ ] **Replace indirect citations** for mind outputs with dedicated sources
      (each is marked "indirect citation" in its note).
- [ ] Age input → actuarial engine (baseline LE conditional on current age
      instead of at birth; more honest deltas).
- [ ] Sex-specific body-fat and VO2max curves.
- [ ] Deploy to Cloudflare Pages; add a `humans.txt`/about blurb.

### Later (ideas, no commitment)
- URL-hash state encoding for sharing profiles (client-side only; must stay
  analytics-free).
- Per-disease risk outputs (CVD, T2D, dementia) once enough disease-specific
  effects are sourced to make them non-gimmicky.
- Non-US baseline selection.
- Accessibility audit (keyboard, screen reader, contrast).
- Print/PDF summary.

## Candidate inputs backlog

Each needs: primary source → verified effect size → step/point design. Do not
add without that. Roughly ordered by expected evidence quality.

| Candidate | Likely evidence | Status |
|---|---|---|
| ~~Processed/red meat~~ | Pan 2012 (HR 1.20/serving/day) | **done** |
| ~~Sugar-sweetened beverages~~ | Malik 2019 (graded, to 1.21) | **done** |
| ~~Fish / omega-3~~ | Kwok 2019 (RR 0.98) + VITAL null | **done** |
| ~~Sitting time~~ | Biswas 2015 (HR 1.24) | **done** |
| ~~Purpose in life~~ | Cohen 2016 (RR 0.83) | **done** |
| ~~Grip strength~~ | Leong 2015 PURE (HR 1.16/5 kg) | **done** |
| ~~Nuts~~ | Aune 2016 (RR 0.78/28 g) | **done** |
| ~~Whole grains~~ | CUT — overlaps fiber; finding only | **done (cut)** |
| ~~Resting heart rate~~ | Aune 2017 (RR 1.17/10 bpm) | **done** |
| ~~Sleep regularity~~ | Windred 2024 (UKB accelerometer) | **done** |
| ~~Air pollution (PM2.5)~~ | Di 2017 (+7.3%/10 µg) | **done** |
| ~~Recreational screen time~~ | Hunt 2018 + Allcott 2020 (happiness only, small); mortality pathway = sitting → overlap rule, findings only | **done** |
| ~~Vaping / e-cigarettes~~ | Xie 2024 (mortality: suppressed estimate → null), Berlowitz 2022 (CVD null), Kundu 2025 (cancer null), Novak 2024 (cognition), Kang 2024 (happiness) | **done** |
| Ultra-processed food share | cohort meta-analyses (~2024) | needs sourcing |
| Unprocessed red meat | Pan 2012 has it (1.13) — add as second slider? | ready to source |
| Protein intake (esp. 65+) | decent cohorts, U-shaped | needs sourcing |
| Sodium / potassium ratio | strong for BP; mortality meta-analyses exist | needs sourcing |
| Teflon vs Steel pan cooking | Needs research | Needs research |
| Crack, cocaine, heroin, etc. | needs research | needs research |
| Resting heart rate | cohorts, easy to measure | needs sourcing |
| ~~Grip strength~~ | Leong 2015 PURE | **done** |
| Sleep regularity (not just duration) | emerging, decent cohorts | needs sourcing |
| ~~Purpose in life / ikigai~~ | Cohen 2016 | **done** |
| Volunteering | cohorts, moderate | needs sourcing |
| Nature / green-space exposure | meta-analyses, moderate | needs sourcing |
| Air pollution (PM2.5, home city) | strong (GBD), but not a "lifestyle choice" | maybe as context input |
| Shift work | IARC 2A, cohorts | needs sourcing |
| Loneliness (distinct from social time) | Holt-Lunstad 2015 | needs sourcing |
| Yoga / tai chi | small RCTs, weak-moderate | needs sourcing |
| Cold exposure | mostly mechanistic/small trials — likely findings-only | likely too weak |
| Psychedelics (therapeutic) | small RCTs for depression — findings-only at best | likely too weak |
| Multivitamin | RCTs mostly null — candidate honest-null | needs sourcing |
| Dental hygiene / flossing | cohorts (perio ↔ CVD), confounded | needs sourcing |
| Handgrip dynamometer input | same as grip strength | duplicate |
| Blood pressure / lipids / HbA1c | strong actuarial data, but clinical rather than lifestyle | design decision needed |
| Education / income | strong effects, not changeable "levers" — context at most | design decision needed |

## Explicit non-goals

- **No accounts, no storage, no backend.** Health inputs never leave the tab.
- **No medical-adjacent advice** (drug dosing, supplement stacks beyond what
  sources support, "see a doctor if X" triage logic).
- **No disease-risk precision theater.** If a number can't be honestly
  sourced, it goes in findings as qualitative text or not at all.
