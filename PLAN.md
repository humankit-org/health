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
  plan, part 2). Could maybe be scientific sources out there that just measure 'Diet quality' or 'General movement' which we can use to limit how much benefit the combined diet/movement sliders can give overall.
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
  (Verified 2026-07-31, see §1.10: point estimate 37% of the PA–all-cause
  association through BMI — CHARLS causal mediation, Q4-vs-Q1; sensitivity
  range 8–40% — ADNFS change-in-estimate <8%. The MSSE 2025 22.2% is the
  REVERSE direction [BMI→CVD mediated by PA] and is NOT a discount
  coefficient. Cardio↔BMI/bodyFat are superseded by the Mayo 2021 joint
  cells, 1.8; the discount survives only for steps↔BMI, strength↔BMI.)

Deliverable: a filled-in `overlaps` array, plus a paragraph here recording
any pair where sources were silent and what we did instead.

**Phase-1 silent-sources paragraph (written 2026-07-31, after §1.1–1.14).**
Where the candidate-list pairs ended up, and which sources were silent:

- **Resolved by the sources themselves (no ρ needed):** smoking↔alcohol
  (Wood 2018 adjusts smoking; Jha 2013 adjusts alcohol — §1.12);
  sun↔cardio and sun↔steps (Nazeeh 2025 measured r = 0.09/0.10 and
  PA-adjusted the HRs — the "outdoor time is really exercise" fear is
  empirically unfounded; §1.14); sun↔sleep duration (Burns 2021:
  effects on timing/quality, duration-adjusted ORs null; Zhang 2026
  even finds a slightly negative duration association — §1.14);
  meditation↔stress (direct rₛ = −0.27/−0.29, Munjal 2025 — §1.14).
- **Resolved by joint models instead of ρ (movement/adiposity cluster
  internals):** cardio↔sitting and steps↔sitting → Ekelund 2016 table
  (§1.5); aerobic↔strength → Momma 2022 cells (§1.6); PA×strength×sleep
  → Duncan 2023 cells (§1.7); PA↔adiposity → Mayo 2021 cells (§1.8);
  cardio↔steps → both map onto the same PA-level axis of the Ekelund/
  Duncan joint models, so the cluster structure (3.2) resolves them —
  no pairwise ρ. Sleep↔sleepRegularity → partially: Windred 2024's
  regularity marginal is mutually adjusted for duration; the residual
  duration×regularity cells (Korean cohort) are a Phase-2/3 candidate.
- **Sources SILENT — assumption bands used instead (recorded in §1.12/
  §1.14):** grip↔strength (no direct population r anywhere; band
  0.10–0.40 from the RT→grip network meta); sun↔sleepRegularity (no
  data; band 0–0.30 from entrainment logic); sun↔vitaminD (no published
  % mediated; band 0–0.30, kept small because the sun benefit is mostly
  non-vitamin-D and the VITAL RCT caps causality); snus↔alcohol (0.15,
  sensitivity-stable — byhamre2021's age+BMI-only main model);
  vaping↔alcohol (0.10 — PATH collects no alcohol data; moot while the
  vaping HR is null).
- **Sources silent with NO usable data → structural treatment, not ρ:**
  purpose↔stress, purpose↔social, stress↔social — no joint model
  exists; the psychosocial cluster gets the per-lever-only flag (3.5)
  instead. meditation↔sleep / meditation↔social — shared outcomes are
  happiness points only; deferred to 3.5 unless mind-points conflation
  grows. Screen↔sleep — already handled by design (screen time is
  mind-only; sleep displacement is a finding, not an effect; AGENTS.md).
- **Diet cluster internals (fiber↔fruitVeg, fiber↔nuts, etc.):** the
  sources contain no pairwise correlations between our slider choices —
  resolved structurally: the PURE-style diet SCORE becomes the joint
  model (§1.3), so pairwise ρ is unnecessary within the cluster; the
  harmful-foods substitution ρ is built into the score marginals
  (Pan 2012/Malik 2019, §1.4).

The `overlaps` array in factors.js is populated in Phase 3 from the
values recorded in §1.12 (2 pairs) and §1.14 (9 pairs); `jointModels`
from §1.3/§1.5–1.8 per cluster. (Schema added 2026-07-31, §1.15.)

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

**§2.1 implementation notes — cluster dispatch (recorded 2026-07-31).** The
dispatch is per-cluster, three resolution modes, in this order:
1. **Joint model** — a `jointModels` entry owns a cluster; its lookup computes
   the cluster total per HR output, REPLACING the member inputs' marginal
   product (their per-input HRs no longer enter the product; contribution
   records carry `viaJoint` so the UI can say "counted together via …").
   Lookup sub-schemas (added to the factors.js comment):
   - `score` (PURE-style diet): `{ components: [{input, max, weight}],
     gradient: [{max, hr, hrLow, hrHigh}] }`. Score = Σ weight·clamp(value/
     max, 0, 1); cluster HR = lookupSteps(gradient, score); per-input
     `partialCredit` = weight·fraction, recorded for the UI's per-slider
     attribution. Axes inputs are read-only — `members` declare whose HRs
     the total replaces.
   - `table`/`cells` (Ekelund, Momma, Duncan, Mayo): one structure —
     `{ axes: [{id, label, unit, inputs: [ids], coeffs: [..], bands:
     [{max, label}]}], grid, interpolate: bool }`. Axis value = Σ coeffᵢ·
     inputᵢ (banded via the same `max` cutoff walk as `lookupSteps`; grid
     indexed by band index per axis; cells entries {hr, hrLow, hrHigh}).
     `interpolate: true` → bilinear interpolation on log HR between adjacent
     band cutoffs (2 axes only; otherwise falls back to nearest band).
     Members of the entry are the inputs whose marginals the table/cells
     replace — axis inputs are separate (read-only) so cardio can feed both
     the Ekelund PA axis and the Momma aerobic axis without being counted
     twice.
2. **Marginal product** — the default: per-input effects multiply (today's
   math, byte-identical).
3. **Per-lever-only** — clusters listed in the new top-level `perLeverOnly`
   array (entries `{cluster, members}`; empty now; `psychosocial` in 3.5) are
   excluded from the total product; their contribution records get
   `perLever: true` and the UI shows them individually.

Ownership rule: an input's HR is counted by at most one joint model — the
FIRST `jointModels` entry whose `members` include it (array order decides;
Phase 3.2 arranges movement as Ekelund [cardio, steps, sitting] then Momma
[strength]). Joint models cover only the HR outputs they publish data for
(Ekelund = all-cause); outputs without coverage fall back to the members'
marginal product. Derived pseudo-inputs (`bmi`, `bodyFat`) resolve via a
resolver callback so Phase 3.3 can fold them in without new machinery.
Cluster totals get their own widened CI (`evidence` tier on the entry);
empty `jointModels`/`perLeverOnly` → clusterOf empty → identical numbers.
Calibration requirement for Phase 3 data: every joint model must reproduce
its members' marginal product at the AVERAGE profile (defaults), or the
1.0× anchoring breaks — the score gradient and table cells get their
reference bands anchored to the members' default-value HRs.

**§2.2 implementation notes — overlap blend + covariance (recorded
2026-07-31).** `evaluateRaw` now runs three passes over the effects: (1)
evaluate every active effect into an `fx` map (input → output → {hr,
logHr, hrLow, hrHigh, sigma2, points, record, rdHr}); (2) blend — for
each `overlaps` pair, per output, when BOTH members are active (|log HR|
> ε = 1e-6; points: |points| > ε), the WEAKER member (smaller |log HR|)
is discounted in log space by `rho`: logHR → logHR·(1−ρ) (points: |p| →
|p|·(1−ρ)); ρ=1 collapses the weaker to exactly 1.0 → combined equals the
stronger alone. The record carries `overlapBlend: {pair, rho}` for the
Phase-4 disclosure ("counted at 70% — overlaps cardio"). (3) accumulate —
per-lever / joint-model / marginal routing as in §2.1, but with the
blended point estimates. Covariance: after accumulation, each ACTIVE pair
adds 2·rhoU·σᵢ·σⱼ (σ = widened per-effect sigma, pre-blend — the point
discount does not shrink the effect's own CI) to that output's sumΣ²;
always into the global sums (per-cluster sigma display is Phase 4 only;
the final total is identical wherever the covariance lands).
`activeOverlaps(model, values)` reuses the same `applyOverlaps` pass so
the UI/table can never drift from the math. hrDelta is computed from the
blended value vs the (unblended) default-value effect. Retired when a
cluster goes live: overlap pairs whose members are both owned by the
cluster's joint model are REMOVED from `overlaps` (the joint estimate
already handles the redundancy; keeping both would double-discount); the
rhr↔cardio, sun↔cardio and sun↔steps pairs are affected by 3.2.

**§2.3 implementation notes — bounds endpoints (recorded 2026-07-31).**
`boundsEndpoints(model, values)` (exported; attached to `evaluateRaw`'s
return as `bounds`) computes per HR output two assumption endpoints around
the point estimate, both on RAW (unblended) effects, perLever-only members
excluded from both (they have no combined number by design):
- **independence** = full marginal product of every active effect
  ("if every effect were truly independent") — quadrature of the kept
  sigmas, no blend, no covariance.
- **redundancy** = per cluster the STRONGEST active effect (largest
  |log HR|), unclustered inputs multiply, clusters WITH a joint model use
  the joint total itself when the lookup covers the output (the published
  joint estimate IS the cluster-level redundancy handling; the interval
  collapses where evidence is strongest) — "if each cluster were a single
  lever". The blend rule (2.2) is monotone in log space, so for pair
  groups the point estimate ALWAYS lies between the two endpoint products
  (any direction mix: b^(1−ρ) ∈ (b,1) per group; products of intervals
  stay bracketed). A joint-model total is an evidence-based lookup and
  can sit outside the member range — the UI labels both endpoints as
  assumption-space (4.3), not hard brackets. Bounds endpoints are also
  exposed normalized + clamped on `evaluate()` as `bounds` (compare
  against `hrAvgRaw`); 2.4's `activeJoint` mirrors `clusterTotals`,
   filtered to clusters with ≥1 member off its default value.

**§3.1 implementation notes — diet cluster live (recorded 2026-07-31).**
`jointModels: [{ id: 'dietScore', cluster: 'diet', members: [fiber,
fruitVeg, nuts, fish], model: 'score', evidence: 'high', outputs:
{ mortality: { components, gradient } } }]` per the 1.3 mapping.
- **Components (fractional, not binary):** the schema credits
  `weight·clamp(v/max, 0, 1)` per component — the 1.3 table's point
  thresholds are reproduced at the boundary values (fruitVeg 6 → 2 pts,
  3 → 1 pt; fiber 25 → 1; nuts 9 → 1; fish 'some'/'lots' → 1 via a new
  optional `valueOf` map on components for segmented sliders), and
  intermediate intakes earn partial credit by construction (disclosed).
  `credit[input]` now SUMS over duplicate component entries (fruitVeg
  feeds both the fruit and the vegetables component; last-wins would
  have shown 0.87 instead of 1.73 at defaults).
- **Gradient:** per-point HR 0.91 (0.89–0.93) (Mente 2023 Table 3
  per-20-percentile increment), exact powers: steps {≤1: 1.0}, {≤2:
  0.91}, {≤3: 0.8281}, {≤4: 0.7536}, {≤5: 0.6857}; CIs = 0.89^k/0.93^k
  scaled. Cross-check vs the published ≥5-vs-≤1 contrast 0.70
  (0.63–0.77): 0.686 (0.627–0.748) — within 2–3%, disclosed in the
  joint model's note.
- **Calibration:** the US-average profile computes to score ≈ 3.02
  (fiber 15→0.6, fruitVeg 2.6→0.867, nuts 5→0.556, fish some→1.0) →
  gradient step 0.7536 vs the members' default-value marginal product
  0.792 (fiber 0.90^1.5 × fruitVeg 1.0 (ref-anchored) × nuts 0.78^(5/28)
  × fish 0.97) — 4.9% off, within the calibration tolerance band; the
  1.0× anchoring is exact regardless (normalization divides the average
  profile away). The 1.3 record's "US average scores ~1/5" was written
  for binary thresholds; the fractional mechanism yields ~3/5 and the
  calibration note is amended here.
- **Cluster-level overlap pairs (engine extension):** §1.3/1.4 pairs
  reference the SCORE, not an input: `{processedMeat, dietScore}`
  ρ 0.3, `{ssb, dietScore}` ρ 0.15, `{magnesium, dietScore}` ρ 0.5.
  Overlap entries may now name a joint-model id as either member; the
  pair's effect for that side = the cluster total for the output
  (resolved per output; no points side — clusters carry none). Blend
  rules identical (weaker |log HR| ×(1−ρ)); when the cluster side is
  blended, the blended total replaces the lookup value in the
  accumulation (sigma unchanged — the 2.2 rule "the point discount does
  not shrink the effect's own CI"). ρU convention: ρU = 0.5·ρ unless a
  direct estimate exists (0.15/0.075/0.25). Retirement rule (2.2)
  unaffected: none of these inputs is a diet member. Bounds endpoints:
  a cluster↔input pair contributes only its INPUT side to the
   redundancy endpoint — the cluster's total is already counted by the
   cluster's own group (option B, max-of-both, double-counts the total;
   option A chosen: deterministic, no double count; documented).
- **Shipped 2026-07-31 (factors.js v0.1.5, verified by §[21] tests):**
  score at US-average defaults = 3.0222 (credit fiber 0.6 / fruitVeg
  0.8667 / nuts 0.5556 / fish 1.0) → gradient 0.7536. No double-count
  verified: model total ≡ plain total with members' marginals replaced by
  the cluster total and magnesium re-blended. Defaults → hrAvg exactly
  1.0 (anchoring intact); LE delta 0. Bounds at defaults: independence =
  full marginal product, redundancy = cluster total + other marginals
  (option A: only the magnesium input side counts), point between both.
  Blend directions verified: processedMeat 8/wk (1.1845, weaker than the
  cluster) → 1.1845^0.7 = 1.1258; processedMeat 0/wk (0.9616, weakest
  side) → 0.9616^0.7 = 0.9730; magnesium at defaults 0.969^0.5 = 0.9843.
  At defaults only the magnesium pair is active — processedMeat and ssb
  sit at their study references (1.5/wk, 4.9/wk), HR 1.0 (the ssb default
  is 4.9, NOT 0 — its effect is reference-anchored). Perfect diet scores
  5.0 → 0.6857 (vs published 0.70, within 2–3%). Cancer output falls back
  to marginals identically to the plain model. Citation handling: the
  golden-rule walk (sourceIndex/sourceTags) now also walks
  `jointModels[].source` and `overlaps[].source`, appended AFTER the
  baseline so existing [n] numbers never shift; mente2023 is last with a
  "Diet score" topic chip. §[2] marginal tests and §[17]/[18]/[19]
  machinery tests now run against a `plainModel` (structures stripped) —
  the shipped cluster is exercised by §[17] (defaults totals) and §[21].

**§3.2 implementation notes — movement cluster (recorded 2026-07-31).**
Three joint models, first-owner rule: `ekelundTable` owns [cardio, steps,
sitting] (mortality only), `mommaCells` owns [strength] (mortality+cancer
+cvd), `duncanCells` owns [sleep] (mortality only; the PA axis consumes the
movement state read-only). At defaults the members' marginal products are
cardio 0.80 × steps 0.67 × sitting 1.10 = 0.590 (Ekelund), strength 0.92
(Momma), sleep 1.00 (Duncan).
- **Ekelund axis mapping (MET-min/wk):** cardio min/wk × 4 MET
  (moderate-equivalent; 210 min/wk ≈ the "recommended" 150–299 band
  midpoint) + steps/d × 7 × 0.03 MET-min/step (walking ≈ 3 MET at
  100 steps/min). Quartile bands (MET-h/wk × 60): Q1 ≤150 (≈5 min/d),
  Q2 ≤960 (25–35 min/d), Q3 ≤1800 (50–65 min/d), Q4 >2130 (60–75 min/d).
  Defaults: cardio 60×4=240 + steps 4800×7×0.03=1008 → 1248 → Q3; sitting
  9 h/d → >8 row → cell (Q3, >8) = 1.13 vs members' product 0.590 — ~92%
  off → **the `calibrate` anchor is REQUIRED here** (see below).
- **`calibrate: true` anchor (engine extension, 3.2a):** per HR output with
  lookup coverage, log-space offset = Σ logHR of the OWNED members' marginal
  effects at DEFAULT values − logHR of the lookup at default values; the
  lookup result (hr/hrLow/hrHigh) is shifted by the offset. The cluster
  total at defaults then EQUALS the members' marginal product exactly
  (1.0× anchoring and per-cluster probes stay in the marginal frame; the
  table's shape/interaction is preserved). Disclosed in the note. Used for
  Ekelund (92% off) and Duncan (see ratio below); NOT for Momma (8% off —
  within the tolerance band; keeps the published 0.60/0.54/0.72 cells
  intact).
  - **Shipped 2026-07-31 (engine.js + §[22]):** `calibrateOffsets()` (cached
    per model object; first-owner filter — members owned by an earlier
    joint model are excluded from the anchor sum) + `shifted()` applied in
    `computeJmTotals` (so evaluateRaw/bounds/overlap-blends see anchored
    totals) and `clusterTotals` (so sources.html's conflation table shows
    anchored numbers). `calibrate: true` is a no-op for un-calibrated
    models (suite green before any movement data shipped). §[22] verifies
    against the synthetic Ekelund fixture (default cell 1.78× off the
    members' 0.5896 product → anchored total equals it to 1e-9; constant
    shift k at other values incl. CIs; combined HR and redundancy endpoint
    shift by k; reset → hrAvg exactly 1.0; ownership exclusion).
- **Momma cells (no calibrate):** axes aerobic (cardio read-only, bands
  {≤149: none, ≤999: any}; AER = ≥150 min/wk) × strength ({0: none, ≤99:
  any}; MS = ≥1 session/wk). Grids [aerobic][strength] with CIs:
  mortality [[1.0 REF, 0.85 (0.79–0.93)], [0.80 (0.78–0.82), 0.60
  (0.54–0.67)]], cancer [[1.0, 0.88 (0.80–0.97)], [0.80 (0.78–0.82), 0.72
  (0.53–0.98)]], cvd [[1.0, 0.83 (0.73–0.93)], [0.79 (0.76–0.82), 0.54
  (0.41–0.70)]]. MS-only cells: Momma's aerobic-adjusted single-activity
  contrasts; aerobic-only cells: the existing Arem 2015 ≥150-adjacent
  bands (0.80 mortality/cancer — the cardio cancer effect mirrors
  mortality — 0.79 cvd), disclosed as the approximation §1.6 specifies;
  the published interaction (both 0.60 < 0.85×0.80 ≈ 0.68, synergistic) is
  the point of the cells. Evidence 'low' (Momma GRADE very low, I² 59%).
- **Duncan cells + the cluster-cluster overlap decision (the hard one):**
  the 12-cell table's PA gradient (1.21 AER-only → 1.68 Inactive) overlaps
  the Ekelund/Momma PA risk — multiplying both double-counts PA. Options
  considered: (i) plain cells → double count (rejected); (ii) ρ-pair
  between cluster totals → blends the weaker ENTIRE total, wiping the sleep
  effect (rejected); (iii) **`ratio: true` table extension — total =
  cell(PA, sleep) / cell(PA, Rec): the table contributes ONLY the sleep
  main effect interacted with PA category; the PA-row main effect is
  divided away (it is owned by Ekelund/Momma) — ADOPTED.** At defaults
  (Inactive, Rec) the ratio = 1.0 exactly, no calibrate needed. CI for the
  ratio = quadrature of the two cells' sigmas (engine 3.2d). Sleep bands:
  {≤6.9: Short, ≤9.4: Rec, ≤11: Long} (slider 4–11, step 0.5; the 9.1–9.9
  gap is ambiguous in the study too — 9.5 maps Long, disclosed). PA
  category axis: nonlinear mapping (cardio ≥150 → AER flag; strength ≥2 →
  MSA flag; both → Active) — NOT expressible as Σ coeff·input → axes get
  an optional `fn` in factors.js (numbers/thresholds stay in factors.js,
  golden rule intact). Duncan's diet non-adjustment (§1.7 limitation):
  new overlap pair `sleep ↔ dietScore` ρ 0.10 (ρU 0.05) added in 3.2d.
- **VO2max supersession in the axis:** the axis resolver today ignores
  `gatedBy`/`supersededBy` — with Ekelund live, vo2maxOn would still feed
  the cardio slider into the PA axis while the vo2max marginal also counts
  (double count). Decision: when `vo2maxOn`, the PA axis IGNORES the cardio
  input (its effects are superseded) and reads the steps contribution only;
  the Kodama per-MET marginal then carries the fitness signal (option A —
  conservative, no double count, disclosed in the note; option B, mapping
  vo2max to MET-min/wk via an arbitrary activity-equivalence, rejected as
  unfalsifiable). Implementation (3.2d): axis inputs whose effects for the
  output are superseded/gated contribute 0.
- **rhr/sun retirement:** cardio/steps are now cluster-owned, so the
  verified rhr↔cardio (0.20), sun↔cardio (0.10), sun↔steps (0.10) input
  pairs cannot exist as written. Decision: add cluster-facing pairs in
  3.2d — `rhr ↔ ekelundTable` ρ 0.15 (ρU 0.075; discounted from 0.20
  because the cluster total also includes steps+sitting, diluting the
  correlation; disclosed), `sunExposure ↔ ekelundTable` ρ 0.10 (ρU 0.05;
  sun↔steps is absorbed by this pair — steps contribute ~40% of the default
  PA axis — disclosed in the note). The input side is the weaker side in
  both pairs at typical values (rhr 1.29 vs cluster ≈0.9–1.1; sun ≈0.8 vs
  cluster ≥0.6), so the cluster total is never blended; rhr 1.29 → 1.24 at
  ρ 0.15, sun 0.80 → 0.81 at ρ 0.10 — small, honest discounts.
- **Probe:** anchored movement cluster at defaults = 0.590 × 0.92 = 0.543
  — inside the "movement ~0.55–0.6 at moderate levels" band (3.6 checks
  the Ekelund/Momma/Duncan calibrations as named tests).

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
correlation is high — the unfair zone (fresh probe 2026-07-31: movement
−72%, diet −65%, mind −35%; v0.1.2 probe at the time: −49/−55/−53%); (2) point-precision display overstates. Both are
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
     high-PA/low-BF referent), CHOSEN over BJSM 2025 CRF×BMI joint
     meta-analysis (see 1.9 DECISION). Supersession (VO2max replaces
     cardio, bodyFat replaces BMI) keys into these joint tables.
     Where no joint cell exists, use the published %-mediated point 37%
     (CHARLS PA→all-cause through BMI, Q4-vs-Q1; §1.10) with sensitivity
     range 8–40% (ADNFS change-in-estimate <8%) as the upstream discount,
     band displayed; the MSSE 2025 22.2% (BMI→CVD via PA) is the reverse
     direction and is NOT a discount coefficient.
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

**Phase 0 — results (recorded 2026-07-31).** Probe: `node
tests/attribution.probe.js`; profile "regular healthy person" (300 min/wk
cardio, 2×/wk strength, 10k steps, sitting 5 h, fiber 30 g, fruit/veg 5,
nuts 30 g, Mg 400 mg, fish 1–2/wk, proc meat 2/wk, SSB 1/wk, coffee 2/d,
purpose 6, social 6, stress 2.5, sleepReg 8, alcohol 5/wk, sleep 7.5 h,
everything else at study-reference level; gated inputs off).

```
naive ratio vs reference (pre-clamp):        0.0643  (−93.6%)
normalized pre-clamp (vs average person):    0.1382  (−86.2%)
normalized + clamped:                        0.4500  → FLOOR PINNED
                                              LE delta +8.0 y (gain cap)
per-cluster naive deltas (each alone):
  movement (cardio, steps, strength, sitting):   0.2785  (−72.2%)
  diet (fiber, fruitVeg, nuts, Mg, fish, pm, ssb, coffee): 0.3554  (−64.5%)
  mind (purpose, social, stress, sleepReg):      0.6500  (−35.0%)
  substances (alcohol, smoking, snus, cannabis, vaping): 1.0000  (0.0%)
  sleep (duration, at reference):                1.0000  (0.0%)
cluster product = naive total exactly (0.2785 × 0.3554 × 0.6500 = 0.0643);
BMI-only delta 1.0 (probe keeps reference build); unaccounted 0.0%.
per-input worst (alone): steps 0.52, fiber 0.73, nuts 0.77, sleepReg 0.78,
  stress 0.83, strength 0.85, Mg 0.85, fruit/veg 0.88, coffee 0.90
```

Findings: (a) the overclaim concentrates in exactly the three predicted
products — movement + diet + mind = 93.6% of the total naive reduction,
with substances and sleep contributing nothing at this profile; (b) the
floor/cap is pinned by a merely-good (not extreme) profile, so the clamp is
currently doing all the humility work; (c) the fix set is confirmed: joint
models for movement + diet (≈67% of the naive reduction combined), and
psychosocial moves to per-lever-only (no combination) rather than a joint
model, per plan point 3. The prediction that ~80% of the overclaim sits in
three clusters is confirmed (93.6% of it does).

**The fair/unfair boundary table (draft, for the methodology page verbatim).**

| Zone | Rule | Where it applies | Status |
|------|------|------------------|--------|
| **Fair multiplication** | multiply marginal HRs, uncertainty only | across clusters (movement × diet × mind × substances × sleep: different exposure domains, modestly correlated) | keep as-is |
| **Fair multiplication** | coefficients from the published joint model (no per-slider multiplication) | within clusters *inside* published joint models (PURE diet-score components; PA×strength cells) | Phase 1/3: replace |
| **Unfair multiplication** | within clusters with no joint model — marginal HRs multiplied | diet sliders outside the chosen score (coffee, magnesium), movement once Ekelund/Momma cells are in, until then the whole cluster | must be replaced by joint estimates |
| **No combination** | per-lever only; no cluster total, no combined claim | psychosocial (purpose, stress, social, sleepReg) unless Phase 1 finds joint evidence; screen→happiness already treated this way | adopted |

Sizing: the unfair zone is bounded by the two joint models (diet −65% →
score gradient ~0.70; movement −72% → Ekelund/Momma/NHIS cells) plus the
psychosocial flag; the residual ρ set stays ~5–8 pairs as planned.

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

### Weaknesses (assessed 2026-07-31)

- **The cross-cluster "fair" zone is declared, not sourced.** "Across
  clusters" is called fair multiplication on Ezzati 2003's qualifier, but no
  pass verifies which cross-category pairs actually share pathways or whether
  each source adjusted for the other domains (PURE adjusts for PA; whether
  the Ekelund/Momma/NHIS cells are diet-adjusted varies). *Criticality:
  moderate* — the fair-zone wording needs a pair inventory that governs the
  covariance layer even for "fair" pairs, with small banded ρs (~0.1–0.3)
  where adjustment is missing; without it the honesty claim rests on an
  assertion.
- **Slider→score-component mapping can hide double-counting.** Fiber and
  fruitVeg partially overlap in the same foods; PURE components are binary
  (meets/not-meets a cohort median) while our sliders are continuous
  US-relative quantities — a user at the US-average fiber slider is not at
  the PURE cohort median, so the mapping does real judgment work.
  *Criticality: moderate* — needs an explicit mapping table (which slider
  feeds which component, at what reference point) with residual pairs
  listed, not implied.
- **The harmful-foods fork is the least specified and most consequential.**
  processedMeat (HR 1.20) and ssb (1.21) are marginal HRs, off-model from
  the protective scores, and harmful foods are what swing a bad profile's
  total. *Criticality: major* — without a pre-committed rule, the Phase-1
  "hunt substitution analyses" is open-ended. Decision rule: per-source
  adjustment-set check — was the marginal HR adjusted for the score's
  components? If yes, multiply with the score; if no, fall back to a
  psychosocial-style per-lever display with a conflation label, not a ρ
  guess. Substitution hunting happens only after this gate.
- **Calibration is partly tautological.** Matching the PURE gradient when
  the PURE gradient is built into the diet cluster is an implementation
  check, not falsification. The genuinely external anchors are Li 2018
  (HR 0.26) and Sun 2022 (0.38) at the total level. *Criticality: moderate*
  — the regression suite must separate "reproduces its own inputs" tests
  from "predicts an external gradient" tests; only the latter carry the
  falsifiability claim.
- **Psychosocial per-lever deltas remain internally inflated.** Each
  marginal HR (purpose 0.83, stress, social, sleepReg) is inflated by the
  other three; showing them per-lever is honest about the cluster but still
  overstates each lever. *Criticality: moderate* — card copy must carry a
  conflation caveat ("each shown with its full unadjusted association; the
  real overlap is large"), not just the low-evidence badge.
- **Momma 2022 is a weak joint source.** 3 studies, I² = 62.6%, certainty
  rated "very low" by the authors; the combined-cell 0.60 is load-bearing
  for the movement cluster's aerobic×strength product. *Criticality:
  moderate* — pre-commit the fallback: if the cells fail the verification
  pass, ρ-blend aerobic×strength against the Ekelund table instead of
  shipping a shaky joint model.
- **Supersession vs joint tables is hand-waved.** VO2max (fitness) replaces
  cardio (activity), but the movement joint tables are keyed to activity
  (MET-min/wk); BJSM 2025's CRF×BMI table is keyed to fitness. Which table
  governs when `vo2maxOn` is true needs a spec (two-table world with a
  switch), or supersession silently leaves the model keyed to the wrong
  joint table. *Criticality: minor–moderate* — cheap to specify in Phase
  1.15, but only if decided before Phase 3.
- **PURE's LMIC-diet gradient may not transfer to US profiles.** The 0.70
  gradient is driven by diets where fish/nuts/legumes are scarce and the
  top-vs-bottom contrast is large; a US slider profile rarely spans that
  range. *Criticality: moderate* — the score-family selection rule (US-fit
  wins on gradient fidelity) must apply to the calibration anchors too, and
  the calibration suite must include a US-typical profile, not just the
  PURE-style top-bottom contrast.
- **Overall:** the right architecture — the science carries the load — and
  its weak spots are exactly the places where judgment is left unmapped:
  the fair-zone pair inventory, the slider→component mapping table, and the
  harmful-foods decision rule. All are Phase-1-addressable (mapping, not
  invention), which is what separates this plan from options #1–2: the
  failures are checkable, and the plan states what a failure means. The
  critical-path risk is sequencing — if the harmful-foods gate or the
  score-family selection slips to Phase 3, the plan degrades into option #2
  in disguise.

## Phase 1 — verification records (sources-first, recorded as passes complete)

Each entry: what was verified, exact numbers, decisions taken. When a number
enters `js/factors.js`, the same step edits the data + runs the tests.

### 1.1 PURE diet score — Mente 2023 (verified 2026-07-31)

Source: Mente A, et al. *Eur Heart J* 2023;44(28):2560–80. DOI
10.1093/eurheartj/ehad269 (PMID 37414411; full text read from the published
PDF, sochob.cl mirror).

Verified against the primary source:

- **6 components, exactly as planned:** fruit, vegetables, nuts, legumes,
  fish, dairy (mainly whole-fat). One point per component above the cohort
  median; score range 0–6. PURE cohort median daily intakes: fruit 145 g,
  vegetables 250 g, legumes 38 g, nuts 9 g, fish 12 g, dairy 113 g.
- **Development cohort:** 147,642 people, 21 countries (PURE general
  population), median follow-up 9.3 y. Replication: 3 prospective studies in
  vascular patients (ONTARGET, TRANSCEND, ORIGIN) + 2 case–control studies
  (INTERHEART, INTERSTROKE) — total 244,597 people, 80 countries,
  ~50,000 events.
- **Gradient, score ≥5 vs ≤1 (all-cause mortality): HR 0.70 (0.63–0.77).**
  CVD 0.82 (0.75–0.91); MI 0.86 (0.75–0.99); stroke 0.81 (0.71–0.93);
  CVD mortality 0.72 (0.60–0.85); non-CVD mortality 0.68 (0.60–0.78).
- **Per-20-percentile (1-quintile) increment:** total mortality HR 0.91
  (0.89–0.93); major CVD 0.94 (0.92–0.97); MI 0.95 (0.92–0.98); stroke 0.95
  (0.92–0.98); CVD mortality 0.91 (0.88–0.95); non-CVD mortality 0.91
  (0.88–0.93). This is the natural engine keying: sliders map onto
  components, component count → quintile increment HRs.
- **Independent confirmation, 3 vascular-patient cohorts:** mortality HR
  0.73 (0.66–0.81); CVD 0.79 (0.72–0.87); stroke 0.87 (0.73–1.03, NS).
- **Adjustment set (full, quoted):** age, sex, study centre (random effect),
  energy intake, waist-to-hip ratio, education, wealth index, current
  smoking status, urban/rural location, physical activity (low <600 /
  moderate 600–3000 / high >3000 MET-min/wk), baseline diabetes, statin or
  BP meds. → PA and smoking are adjusted for: the diet cluster can be
  multiplied across to movement/substances without a ρ pair on those axes
  (Ezzati-qualifier satisfied for them).
- **Sensitivity:** removing potential mediators (BMI, waist-to-hip,
  diabetes, hypertension) tested; direction held (results reported as
  similar — table in paper). Regional interaction: stronger associations in
  lower-GNI countries (P heterogeneity <0.0001) — the LMIC-gradient caveat
  is real; the US-fit check in 1.2 decides which score family wins.
- **Component balance:** removing any single component slightly weakens the
  association (Appendix S8) — each food contributes similarly. Supports
  per-component partial credit in the Phase-2 score dispatch.
- **Score comparison (for 1.2):** PURE slightly stronger than
  Mediterranean, HEI-2010, HEI-2015, DASH (P<0.001 each) and markedly
  stronger than the EAT-Lancet Planetary score.

**Additivity-test source (npj Sci Food 2026) — verified 2026-07-31.** Su X,
et al. *npj Science of Food* 2026;10:180. DOI 10.1038/s41538-026-00829-0
(CHNS, 3106 Chinese older adults, cognition outcome). Likelihood-ratio test
of model with 6 components vs + total PURE score: **P = 0.304** (no
improvement in fit); fruit–vegetable and fish–vegetable pair interactions
both non-significant (P > 0.05). One subgroup interaction (PA) had nominal
P = 0.016 but FDR-adjusted P = 0.128 (NS). → supports additive combination
of score components; caveat stands: this is a *cognition* outcome, and
extending "no multiplicative interaction" to mortality is an assumption
(stated in methodology copy).

**Decision (1.1):** PURE healthy diet score verified fit for the diet
cluster's joint model. All numbers above are candidates for
`js/factors.js`'s `jointModels` structure once the score-family decision
(1.2) and slider mapping (1.3) land.

### 1.2 Score-family selection — decision recorded 2026-07-31

Rule applied: prefer the score with the most slider overlap and documented
component-removal robustness; the US-fitted alternative (HEI-2015 family)
wins only if PURE components fit our sliders poorly.

Evidence from Mente 2023 (same paper, Table 4 + text): PURE was *most
similar* to HEI-2010/2015 ("only slightly larger HRs"); significantly
stronger than Mediterranean and DASH for composite events/mortality/CVD;
substantially stronger than the EAT-Lancet Planetary score — which was
**neutral** (no association) in this global analysis and is thereby
disqualified outright.

Slider-overlap comparison (our 8 diet sliders):

| Slider | PURE (6 comps) | HEI-2015 (13 comps) |
|--------|----------------|----------------------|
| fruitVeg | fruit + vegetables (2 pts) | total fruit, whole fruit, total veg (3 pts) |
| fiber | legumes (partial; 1 pt) | greens & beans (partial; 1 pt) |
| nuts | nuts (1 pt) | seafood & plant proteins (partial; 1 pt) |
| fish | fish (1 pt) | seafood & plant proteins (partial, same pt) |
| magnesium | — | — |
| coffee | — | — |
| processedMeat | — | — (red-meat via saturated fat, unmapped) |
| ssb | — | added sugars (partial; 1 pt) |
| **mappable** | **5/6 components (dairy unmapped)** | **~4/13, with the unmapped 9 incl. major ones** (fatty acids, sodium, refined grains, saturated fat, dairy, whole grains) |

Decision: **PURE 6-component score wins, engine-run as the 5 mappable
components (dairy excluded).** Rationale: (a) 5/6 components map to our
sliders vs ~4/13 for HEI-2015; (b) PURE's component-removal robustness is
published in the same paper (Appendix S8: removing any one component barely
weakens the association) — the dairy-less variant is therefore an evidence-
supported subset, whereas a half-mapped HEI-2015 silently changes meaning;
(c) whole grains/red meat inclusion sensitivity (Appendix 9, "neither
stronger nor weaker") further supports leaving unmapped foods out. The
dairy exclusion is stated on the card: "one PURE component (whole-fat
dairy) is not asked about; scores below were computed over the 5 mapped
components." Fallback pre-committed: if Phase-2 dispatch calibration shows
users cannot reach the top gradient (0.70 span was 6-of-6 vs ≤1-of-6), the
gradient anchor shifts to the 5-component span from the same paper's
per-quintile curve — never a different score family swapped in silently.

### 1.3 Slider→component mapping — recorded 2026-07-31

PURE score run as the 5 mappable components (dairy excluded, per 1.2);
each slider contributes 0–1 points (fruitVeg can earn 2). Thresholds are
calibrated so the US-average person scores ~1/5 — the PURE cohort medians
are genuinely above US-average intake (PURE medians: fruit 145 g/d ≈ 1.8
servings, veg 250 g/d ≈ 3.1 servings of 80 g, legumes 38 g/d, nuts 9 g/d,
fish 12 g/d ≈ 1 serving/wk). Normalization by the average profile absorbs
the absolute level; deltas are what the engine displays.

| Slider | Score component | Point rule | Rationale / overlap annotation |
|--------|-----------------|------------|--------------------------------|
| fruitVeg | fruit + vegetables | ≥6 servings/d → 2 pts; 3–5.5 → 1 pt; ≤2.5 → 0 pts | PURE medians ≈ 1.8 (fruit) + 3.1 (veg) servings; 3 earns veg's point, ~2× earns both. Single point source for both components — no other slider feeds them. |
| fiber | legumes (+ whole-grain fiber) | ≥25 g/d → 1 pt | PURE legume median 38 g/d ≈ 6–8 g fiber; our fiber slider is total fiber (US avg 15 g/d), so ≥25 marks a clear above-median legume/grain pattern. **Overlap: ρ(fiber, fruitVeg) ≈ 0.3** — the fruit/veg sliders already carry their own fiber; card copy discloses "the fiber point counts legume + whole-grain fiber; fruit/veg fiber is not billed twice". |
| nuts | nuts | ≥9 g/d → 1 pt | PURE nut median 9 g/d exactly; US avg ~5 g/d. Clean. |
| fish | fish | 'some' (1–2/wk) or 'lots' (3+/wk) → 1 pt; 'none' → 0 | PURE median 12 g/d ≈ 1 serving/wk; 'some' is already above it. Clean. |
| magnesium | — (not a component) | keeps marginal HR (fang2016), **ρ(mg, score) ≈ 0.5** | Mg's food sources ARE the score foods (nuts, legumes, veg, whole grains) — same-pathway overlap, so its marginal HR is heavily pre-billed by the score. Covariance layer applies ρ; card copy states the overlap. Alternative (move to findings) rejected: drops a working slider. |
| coffee | — (not a component) | keeps marginal HR (poole2017/grosso2016), ρ ≈ 0 | No food-level overlap with score components; separate pathway (polyphenols/caffeine). Kept as a clean marginal. |
| processedMeat, ssb | — (harmful foods) | not in protective score; handled by 1.4 | per 1.4 decision. |

Point-count keying for the engine (Phase 2): each point ≈ one 20-percentile
increment → per-point HR 0.91 (0.89–0.93) from Mente 2023 Table 3, applied
multiplicatively over the user's score relative to the average person's
score; the ≥5-vs-≤1 gradient 0.70 (0.63–0.77) and the 0.73 (0.66–0.81)
independent confirmation serve as the calibration anchors (1.13). Score
spans 0–5 for our users (5 mappable components) vs 0–6 in PURE; the
dairy-less span is the documented conservative choice (S8: removing any
component barely changes the association).

### 1.4 Harmful foods — verified 2026-07-31, decision recorded

**Pan 2012** (Arch Intern Med 172(7):555–63, DOI 10.1001/archinternmed.2011.2287,
PMID 22412075; full text read). Multivariate model adjusted for: age, BMI
category, alcohol, PA (MET-h/wk), smoking, race, menopausal status/hormone
use, family history (diabetes/MI/cancer), history of diabetes/hypertension/
hypercholesterolemia, **total energy + whole grains + fruit + vegetables
(all in quintiles)** — i.e. the score's foods ARE in the adjustment set.
Additional adjustment for fish, poultry, nuts, beans, dairy or nutrients
(glycemic load, cereal fiber, magnesium, PUFA/trans) did not appreciably
change the HRs; saturated fat/cholesterol moderately attenuated; heme iron
partially explained the CVD link. No interaction with BMI or PA (P ≥ .10).
Substitution (1 serving/d processed red meat →): fish 10%, poultry 17%,
nuts 22%, legumes 13%, low-fat dairy 13%, whole grains 16% lower all-cause
mortality; the same foods substituted for total red meat give 7–19%.

**Malik 2019** (Circulation 139(18):2113–25, DOI 10.1161/CIRCULATIONAHA.118.037401,
PMID 30882235; full text read). Primary model (MV2) adjusted for: age,
smoking, alcohol, PA, family history, multivitamin, ethnicity, aspirin,
hypertension/hypercholesterolemia history, **whole grains + fruit +
vegetables + red/processed meat + total energy + BMI** (i.e. score foods +
processed meat + BMI all in the adjustment set); a modified AHEI (SSBs
removed) substituted for individual foods in secondary analysis — results
held. SSB association independent of diet quality, PA, BMI, and age strata
(P interaction > 0.10). Per-1-serving/d increment pooled MV2: total
mortality 1.05 (1.02–1.08). Substitution: 1 serving/d SSB → ASB ≈ 4% lower
total mortality (0.96 [0.94–0.98]).

**Decision: keep both as marginals with substitution ρ, NOT per-lever with
conflation label.** Both marginal HRs are already mutually adjusted for the
score's foods (+ BMI for SSB) in the primary papers, so their residual
overlap with the diet score is intake-behavioral, not statistical — a
conflation label alone would under-state what the papers establish, and
there are no published joint cells with a diet score to lift. ρ pair
assignments (covariance layer, Phase 2): **ρ(processedMeat, dietScore) ≈
0.3** — justified by the intake correlation (Pan 2012 Table 1: high red-meat
consumers eat fewer whole grains/fruit/veg) and bounded by the substitution
estimates (the harm is partially "not eating the alternatives"); **ρ(ssb,
dietScore) ≈ 0.15** — justified by the P-interaction > 0.10 independence
from diet quality and by BMI (the shared mediator) already being adjusted.
Substitution numbers (Pan 2012 Figure 2, Malik 2019) become findings on the
card; no factors.js number changes (existing HRs already match the papers:
processedMeat 1.20 [1.15–1.24] ✓, SSB ≥2/d CVD 1.31 ✓).

### 1.5 Ekelund 2016 PA×sitting — verified 2026-07-31

**Ekelund et al. Lancet 388(10051):1302–10, DOI 10.1016/S0140-6736(16)30370-1,
PMID 27475271** (full text + supplementary Table 4 read). Harmonised
meta-analysis, 16 studies, 1,005,791 people / 84,609 deaths (13 studies on
sitting), follow-up 2–18.1 y.

PA quartiles (MET-h/w): Q1 ≤2.5 (≈5 min/d moderate), Q2 16 (25–35 min/d),
Q3 30 (50–65 min/d), Q4 >35.5 (60–75 min/d). Sitting: <4, 4–6, 6–8, >8 h/d.
Referent = <4 h/d sitting + Q4.

Joint all-cause mortality HRs (Supplementary Table 4), sitting × PA:

| sitting \ PA | Q1 ≤2.5 | Q2 16 | Q3 30 | Q4 >35.5 |
|---|---|---|---|---|
| <4 h/d | 1.27 (1.22–1.30) | 1.12 (1.08–1.16) | 1.03 (0.99–1.07) | 1.00 REF |
| 4–6 h/d | 1.35 (1.30–1.40) | 1.15 (1.11–1.20) | 1.08 (1.04–1.13) | 1.00 (0.96–1.04) |
| 6–8 h/d | 1.40 (1.35–1.46) | 1.22 (1.16–1.27) | 1.06 (1.01–1.11) | 1.01 (0.96–1.06) |
| >8 h/d | 1.59 (1.52–1.66) | 1.27 (1.21–1.33) | 1.13 (1.07–1.19) | 1.04 (0.99–1.10) |

Key properties: (1) sitting×PA interaction — high PA eliminates sitting's
risk (top row ≤ 1.04, all NS vs ref except the 1.04; >8 h/d + Q4 HR 1.04 vs
1.59 + Q1, p<0.0001); (2) mean heterogeneity I² = 38%; (3) cells are
"minimally adjusted (sex, age)" PLUS each study's original covariates —
i.e. mixed per-study adjustment sets (typically age, sex, BMI, smoking,
alcohol; diet NOT uniformly adjusted); (4) cancer mortality: sitting risk
only in the least active quartile (+12–22%); CVD similar to all-cause
(supp Tables 6–7); (5) TV-viewing >5 h/d retains risk even at Q4
(1.16 [1.05–1.28]) — our `sitting` slider tracks total sitting, so the
main table is the right engine source; TV nuance goes to a finding.
(6) Units: our sliders (minutes/wk exercise → MET-h/w via MET intensities,
sitting h/d) map to these cells directly; the 2018 accelerometer follow-up
(30–40 min/d MVPA attenuates) is a later refinement, not needed here.

**Phase-2 dispatch: sitting enters the movement joint model as a cells
model with the table above (interpolation between cells), replacing the
current sitting marginal. The `cardio` slider feeds the PA quartile; the
`sitting` slider feeds the sitting row. Strength (Momma 2022, 1.6) is a
separate cell dimension on top (movement joint = PA×sitting cells
× strength per 1.6/1.7 design).**

### 1.6 Momma 2022 aerobic×strength — verified 2026-07-31

**Momma H, Kawakami R, Honda T, Sawada SS. BJSM 56(13):755–63,
DOI 10.1136/bjsports-2021-105061, PMID 35228201, PMCID PMC9209691** (full
text read; Kyushu repository PDF). Systematic review + meta-analysis of
prospective cohorts, muscle-strengthening (MS) activities.

Joint (combined MS + aerobic vs neither) mortality RRs, all I² high:

| Outcome | RR (95% CI) | I² | Studies | N (cases) | GRADE |
|---|---|---|---|---|---|
| All-cause | 0.60 (0.54–0.67) | 59.3% | 3 | 581,194 (68,637) | very low |
| CVD mortality | 0.54 (0.41–0.70) | 62.6% | 3 | 582,672 (15,643) | very low |
| Total cancer mortality | 0.72 (0.53–0.98) | 84.8% | 3 | 585,930 (17,212) | very low |

CORRECTIONS to todo.md's pre-audit numbers: all-cause CI is 0.54–0.67
(not 0.49–0.72); CVD CI 0.41–0.70; cancer CI 0.53–0.98 (0.72 point ✓).
Study counts (3 per outcome) ✓. GRADE 'very low' for all outcomes ✓.

Single-activity contrasts (same review, "independent of aerobic activity",
i.e. aerobic-adjusted): MS any vs none — all-cause 0.85 (0.79–0.93, I²
83%, 7 studies), CVD 0.83 (0.73–0.93), total cancer 0.88 (0.80–0.97).
MS dose-response is J-shaped: min RR 0.82 (0.76–0.90) at 60 min/wk,
RR <1.00 up to ~130 min/wk → our `strength` slider (sessions/wk) should
not reward past ~2–3 sessions/wk (≈60 min/wk), a Phase-2 clamp, not a
linear term.

Adjustment sets: varied across studies — most adjusted age, BMI, alcohol,
smoking; several also sex, race/ethnicity, **dietary habits**, disease
history, sociodemographics; ALL studies adjusted for aerobic PA. So the
cells are mutually adjusted for aerobic (the reference "none" group is
people doing neither), and the diet overlap is partly handled (some
studies adjusted diet).

Engine use (Phase 2): 4-cell contrast {none, MS-only, aerobic-only, both}
where the text gives both=0.60 and MS-only=0.85; the aerobic-only cell
exists only inside Figure 5 (graphical) — engine will use the two-group
aerobic estimate (≈0.78–0.80, Arem 2015) as that cell with the interaction
captured by using the published combined cell when both are active
(measured 0.60 < multiplicative 0.85×0.80≈0.68 — the combination is
genuinely synergistic, not merely additive). Cancer/CVD outputs use the
cause-specific cells above.

### 1.7 Duncan 2023 NHIS PA×strength×sleep — verified 2026-07-31

**Duncan MJ, Oftedal S, Kline CE, Plotnikoff RC, Holliday EG. J Sport Health
Sci 12(1):65–72, DOI 10.1016/j.jshs.2022.07.003, PMID 35872092, PMC9923431**
(full text + Table 2 read). NHIS 2004–2014, n=282,473 US adults 18–84,
18,793 deaths (6.7%), follow-up 5.4 y mean, NDI to Dec 31 2015; deaths
within 1 y of baseline excluded (reverse causation). Exposures: PA =
Active (aerobic ≥150 min/wk mod or ≥75 vig [vig doubled] + MSA ≥2/wk),
AER only, MSA only, Inactive; sleep = Rec (7–9 h [18–64] / 7–8 h [>64]),
Short (≤6 h), Long (≥10 h [18–64] / ≥9 h [>64]). 12 joint cells,
referent Active-Rec:

| | Rec | Short | Long |
|---|---|---|---|
| Active | 1.00 REF | 1.08 (0.92–1.26) | 1.40 (1.11–1.77) |
| AER only | 1.21 (1.09–1.34) | 1.28 (1.14–1.44) | 1.54 (1.34–1.76) |
| MSA only | 1.56 (1.36–1.80) | 1.43 (1.17–1.76) | 2.32 (1.85–2.91) |
| Inactive | 1.68 (1.53–1.84) | 1.59 (1.43–1.76) | 2.20 (1.99–2.44) |

Model 3 adjustment: age, age², sex, education, race/ethnicity, work
status, BMI, alcohol, smoking, self-rated health, chronic-disease
presence. **Diet and sedentary behaviour NOT adjusted** (explicitly stated
limitation — the cells partially absorb diet/sitting correlation, so
Phase-2 ρ(sleep cells, diet) and ρ(sleep cells, sitting cells) must be
modest-positive, not zero). No multiplicative or additive interaction is
statistically significant (MSA-Long synergy index 1.37, NS) → **cells used
directly, no interaction term**. Key patterns: short-sleep risk eliminated
in Active (1.08 NS); long-sleep risk persists at every PA level (1.40–
2.32; worst with MSA-only 2.32 / Inactive 2.20 — the "long-sleep synergy"
lives in the low-PA+long-sleep cells); sensitivity excluding chronic
disease consistent (long-sleep finding robust to reverse causation).
Caveats: self-reported PA/sleep, some cells small (wide CIs), sleep
DURATION only (our `sleepRegularity` regularity slider is orthogonal —
stays mind-only; Hale 2015 finding keeps its role).

**Phase-2 dispatch: sleep duration becomes a cells model consuming the
movement-model state — the user's {cardio, strength} map to
Active/AER/MSA/Inactive (strength ≥2/wk flips MSA on; aerobic ≥150 min/wk
mod-equivalent flips AER on), and the `sleep` slider (h/day) picks the
sleep row — replacing the current sleep-duration marginal. `sleepRegularity`
stays a mind/points-only input for THIS phase (no sleep-duration cells for
it; standalone mortality data exists — Windred 2024 + Korean joint cells,
see §1.11 — tracked as a Phase-2/3 candidate, NOT this pass).**

### 1.8 Sanchez-Lastra 2021 (Mayo) PA×adiposity — verified 2026-07-31

**Sanchez-Lastra MA, Ding D, Dalene KE, Ekelund U, Tarp J. Mayo Clin Proc
96(1):105–19, DOI 10.1016/j.mayocp.2020.06.049, PMID 33309181** (open
access CC BY; supplementary Tables 3/9/10 + Table 2 read). UK Biobank,
n=295,917, median follow-up 8.9 y (to Jan 31 2018), 6,684 deaths. PA =
sex- and age-stratified quintiles of self-reported MET-min/wk, collapsed
to 3 groups: **G1 = Q4+Q5** (median ≈2,800–3,700 MET-min/wk ≈ ≥47 MET-h/wk),
**G2 = Q2+Q3** (≈925–2,230 ≈ 15–37 MET-h/wk), **G3 = Q1 least active**
(≈340–490 ≈ 6–8 MET-h/wk — note: much higher than Ekelund's harmonized
Q1 ≤2.5 MET-h/wk; UK Biobank self-report overreports, so the two tables
are NOT on the same PA scale). Adiposity: measured BMI 4 categories
(18.5–24.9 / 25–29.9 / 30–34.9 / ≥35), WC 2 (low <88/102, high ≥88/102
cm, W/M), BF 4 groups (impedance; sex-specific distribution matched to
the BMI categories: low / medium-low / medium-high / high).

Joint all-cause HRs (Model 3), referent G1 × lowest-adiposity cell:

| BMI | G1 (Q4+Q5) | G2 (Q2+Q3) | G3 (Q1) |
|---|---|---|---|
| 18.5–24.9 | 1.00 REF | 1.07 (0.96–1.18) | 1.22 (1.07–1.38) |
| 25–29.9 | 1.00 (0.90–1.10) | 1.02 (0.93–1.11) | 1.12 (1.00–1.24) |
| 30–34.9 | 1.15 (1.02–1.29) | 1.09 (0.97–1.23) | 1.38 (1.22–1.56) |
| ≥35 | 1.45 (1.21–1.73) | 1.43 (1.21–1.67) | 1.52 (1.30–1.78) |

| WC | G1 | G2 | G3 |
|---|---|---|---|
| low | 1.00 REF | 1.03 (0.96–1.10) | 1.10 (1.01–1.20) |
| high | 1.19 (1.10–1.30) | 1.19 (1.10–1.29) | 1.44 (1.32–1.57) |

| BF | G1 | G2 | G3 |
|---|---|---|---|
| low | 1.00 REF | 1.05 (0.94–1.16) | 1.11 (0.96–1.28) |
| medium-low | 1.02 (0.93–1.12) | 1.01 (0.92–1.11) | 1.13 (1.01–1.25) |
| medium-high | 1.12 (0.99–1.25) | 1.13 (1.01–1.26) | 1.38 (1.22–1.55) |
| high | 1.24 (1.04–1.49) | 1.36 (1.17–1.59) | 1.54 (1.33–1.79) |

CVD-mortality cells (Model 3, supp Table 9): BMI — 1.00 REF; 0.89
(0.68–1.15); 1.31 (0.97–1.78) / 1.03; 0.99; 1.10 / 1.15; 1.12; **1.71
(1.30–2.24)** / ≥35: 1.37; **1.99 (1.44–2.76)**; 1.55. WC — high: 1.12;
1.29 (1.07–1.54); 1.53 (1.26–1.86). BF — high: 1.20; **1.71 (1.24–2.36)**;
1.58 (1.13–2.21). Cancer-mortality cells (supp Table 10) are flatter:
BMI ≥35: 1.57 (1.25–1.97); 1.30; 1.48; WC high: 1.29 (1.16–1.43); 1.21;
1.35; BF high: 1.31; 1.25; 1.45.

Key properties: (1) **no significant interaction** (likelihood-ratio tests
P>0.08 Model 1, P>0.18 Model 3) → multiplicative combination would be
defensible, but the cells are used directly anyway; (2) high PA
attenuates but does not eliminate high-adiposity risk (BF: G1 1.24 vs G3
1.54; BMI ≥35: G1 1.45 vs G3 1.52 — **no attenuation at BMI ≥35**, the
"fat-but-fit" limit); (3) never-smoker restriction (supp Table 4, n=
168,654) attenuates effect sizes to NS across normal/overweight BMI —
smoking is a major confounder of PA×adiposity; (4) Model 3 adjustment
includes **diet pattern** (red/processed meat ≤3+1 svg/wk, fish ≥2 svg/wk
incl ≥1 oily, fruit+veg ≥5/d) + salt, alcohol, smoking, screen time,
depression, diabetes, hypertension, statins — unlike Ekelund's cells,
**diet IS adjusted here, so ρ(adiposity cells, dietScore) ≈ 0**; (5)
BMI↔BF correlation 0.85 (W) / 0.79 (M), BMI↔WC 0.87/0.81, BF↔WC 0.87/0.79
— confirms the three adiposity sliders (BMI, WC, BF) are near-collinear
measures of the same construct and must never stack (currently `bodyFat`
supersedes BMI ✓); (6) self-reported PA, quintiles not on Ekelund's
harmonized scale — Phase-2 mapping must keep the two tables' PA axes
separate (or rescale cardio slider values per table).

**Phase-2 dispatch: this table is the candidate ADIPOSITY joint model
replacing the Di Angelantonio 2016 BMI marginal (BMI rows for the `bmi`
slider, BF rows for the `bodyFat` advanced input, WC rows for a future WC
input) — with the PA axis fed by the movement-model state (cardio
slider). Final decision vs the 1.9 CRF×BMI model is deferred to 1.9. The
≥35-rows and never-smoker caveat become card copy.**

### 1.9 Weeldreyer 2025 CRF×BMI meta — verified 2026-07-31

**Weeldreyer NR, De Guzman JC, Paterson C, Allen JD, Gaesser GA, Angadi
SS. Br J Sports Med 59(5):339–46, DOI 10.1136/bjsports-2024-108748, PMID
39537313, PMCID PMC11874340** (full text read). Systematic review +
meta-analysis of prospective cohorts with measured CRF (maximal/VO2peak
exercise test), 20 studies, 398,716 observations (458,784 before CRF-
criteria exclusions), three-level REML random-effects + robust variance
estimation (accounts for nested databases, e.g. the ACLS/CCLS cluster —
conservative SEs). Search Jan 1980–Feb 2023, PROSPERO CRD42023392979.
CRF dichotomised per study: **fit = top CRF group, unfit = bottom group**
(the discussion notes most studies' "fit" bar is merely >20th percentile
of age-adjusted CRF — a low bar); BMI normal <25 / overweight 25–29.9 /
obese ≥30; referent normal weight-fit. 67% male, mean age 42–64,
follow-up 7.7–26 y; included clinical populations (diabetes, CVD, renal,
asthma…).

Joint HRs vs normal weight-fit:

| Group | All-cause HR (95% CI) | CVD HR (95% CI) |
|---|---|---|
| Normal weight-fit | 1.00 REF | 1.00 REF |
| Overweight-fit | 0.96 (0.61–1.50) NS | 1.50 (0.82–2.76) NS |
| Obese-fit | 1.11 (0.88–1.40) NS | 1.62 (0.87–3.01) NS (p=0.078) |
| Normal weight-unfit | 1.92 (1.43–2.57) | 2.04 (1.32–3.14) |
| Overweight-unfit | 1.82 (1.47–2.24) | 2.58 (1.48–4.52) |
| Obese-unfit | 2.04 (1.54–2.71) | 3.35 (1.17–9.61) |

Claim verified: **fitness (measured CRF) absorbs BMI's all-cause
mortality association** — fit at any BMI ≈ normal-weight fit (0.96–1.11,
all NS); unfit = ~2× all-cause, ~2–3× CVD at any BMI. CVD is attenuated,
not eliminated (fit cells 1.50/1.62, NS but numerically elevated — the
authors' own framing). Robustness: all-cause models survive removal of
influential clusters (ACLS/CCLS, Church, Goel); **CVD obese-unfit is
fragile** (removing Stevens → 3.99 [0.72–22.2] NS; removing the largest
ACLS cohort → 3.21 [0.98–10.6] NS). Moderators (sex, age, chronic
disease, follow-up) all NS for all-cause; CVD overweight-unfit modifiers
confounded by cohort selection (all chronic-disease data from one
cluster). Heterogeneity moderate-to-considerable (all-cause unfit
I² level-2 59.7–81.6%). Limitations: English-only search, mostly
US/Caucasian/higher-SES, 67% male, BMI-only (body-fat subsets in Lee/
McAuley show similar attenuation), dichotomous CRF, varied per-study
cutoffs, clinical-population mix.

**DECISION — Mayo 2021 (1.8) is the adiposity joint model, not this one.**
Reasons: (1) Mayo's axes are self-reported PA groups — the same construct
as our `cardio` slider — while CRF percentiles need age/sex norm tables
(no data dependency we can justify); (2) Mayo covers BMI **and** BF and
WC rows, matching the `bmi` slider plus the `bodyFat` advanced input,
whereas Weeldreyer is BMI-only; (3) Mayo's cells are diet-adjusted with
4 BMI categories including the ≥35 "no PA attenuation" row — the
conservative choice; (4) Weeldreyer's fit/unfit dichotomy and clinical-
population mix fit no slider. Role of 1.9 in the model: (a) **finding
card**: "fitness absorbs fatness" — unfit 2–3× risk at any BMI, fit at
any BMI ≈ normal-fit, and the modest bar (fitness better than the least
fit 20% is enough); (b) **engine cross-check**: Mayo G1×BMI≥35 1.45 vs
Weeldreyer obese-fit 1.11 (0.88–1.40) — the two disagree most at severe
obesity because measured CRF ≠ self-reported PA; Mayo stays (conservative,
on-axis); the discrepancy goes in the finding's `note`; (c) when
`vo2maxOn`, the PA axis of the Mayo table should take the vo2max-derived
fitness state (Phase-2 detail, Kodama per-MET HR 0.87 remains the cardio
replace, per v0.2 supersession).**

### 1.10 Mediation shares (PA→mortality through BMI/CRP) — verified 2026-07-31

Two candidate sources + one counterpoint checked at source.

**CHARLS (verified, matches pre-audit numbers):** Wei J, Liu Z, Sun J,
Zhao M, Xi B. "Association between physical activity and all-cause
mortality risk and related mediators in middle-aged and elderly Chinese
population: an analysis of CHARLS data." Chinese Journal of Public
Health 40(6):730–6, DOI 10.11847/zgggws1143020. CHARLS 2011–2018,
n=5,727 aged ≥45, 509 deaths (8.9%). PA quartiles (MET-min/wk, total PA
incl. occupational — Q4 ≥12,264 ≈ 204 MET-h/wk, far above Western
ranges): fully adjusted HRs vs Q1 — Q2 0.62 (0.49–0.80), Q3 0.52
(0.40–0.67), Q4 0.46 (0.35–0.61); note the adjustment set INCLUDES the
mediators (BMI, CRP, blood panels) → these are direct-effect HRs,
already "BMI-free". Mediation analysis: **37.22% of the PA–all-cause
mortality association via BMI, 39.60% via CRP** (highest vs lowest PA
quartile). Caveats: extreme Q4-vs-Q1 contrast; mediators measured at
follow-up (time-varying-mediator bias); Chinese ≥45 population;
journal not MEDLINE-indexed (English abstract on journal site read).

**MSSE 2025 (exists but direction REVERSED — not an upstream discount):**
Zhao L, Zhang D, Zhang T, Wang C, Han S, Zhang T, He Z, Wang J. "The
Interaction and Mediation of Physical Activity of Body Mass Index with
Cardiovascular Disease: Evidence from NHANES and MR Analysis." Med Sci
Sports Exerc 57(7):1326–32, DOI 10.1249/MSS.0000000000003668. NHANES
cross-sectional n=35,406, four-way decomposition + two-step MR: PA CVD
OR 0.84 (0.74–0.95); BMI OR 1.04 (1.03–1.04)/unit; **22.2% = proportion
of the BMI→CVD association mediated BY PA** (higher BMI → lower PA →
higher CVD; MR-confirmed causal). The 22.2% therefore describes how much
of BMI's CVD risk runs through inactivity — the mirror of what a PA→CVD
discount needs. Its role in the model: causal-support evidence for the
BMI↔PA pathway (sits beside the Mayo attenuation + Weeldreyer 1.9
finding copy), NOT a discount coefficient.

**Counterpoint (low-mediation end):** Long G, Watkinson C, Brage S,
Morris J, Tuxworth B, Fentem P, et al. Eur J Epidemiol 30:71–9, PMCID
PMC4356894 (ADNFS cohort, England): adding baseline BMI changed PA–
mortality HRs <8% (change-in-estimate). Mediation estimates are
method-dependent (change-in-estimate ≈ <8% vs causal mediation ≈ 37%);
the 20–40% band is NOT robust across methods.

**Band fix (applies to PLAN.md "mediator pairs" design, §ρ layer, and
the adiposity section below):** replace "~20–40% (CHARLS 37.2% / MSSE
22.2%)" with — point estimate **37%** for PA→all-cause through BMI
(CHARLS, Q4-vs-Q1, the only directionally-correct causal-mediation
number verified here), sensitivity range **8–40%** (ADNFS change-in-
estimate <8% to CHARLS 37%); **drop MSSE 22.2% from the band** (reverse
direction). CRP share 39.6% (CHARLS) is informational only — no CRP
slider. NOTE: since 1.8 chose Mayo's PA×adiposity joint cells, the
discount fallback now applies only to pairs without joint cells
(steps↔BMI, strength↔BMI); cardio↔BMI and bodyFat are fully covered by
the joint cells.

### 1.11 Psychosocial search pass — done 2026-07-31

**Search terms used:** "joint association purpose in life perceived stress
social connection mortality hazard ratio combined cohort prospective";
"perceived stress social support joint association all-cause mortality
interaction hazard ratio cohort sleep regularity index mortality" (plus
follow-up queries on the top hits). Scope: any published JOINT
mortality model (cells table, like Ekelund/Momma/Duncan/Mayo) covering
the purpose/stress/social sliders, in any combination.

**Conclusion: NO joint purpose×stress×social mortality model exists.**
The per-lever default stands, advertised as such. Closest adjacent
literature (each verified to exist at source):
- Purpose alone: Alimujiang 2019 (JAMA Netw Open 2(3):e190712, HRS
  n=6,985, lowest vs highest purpose HR 2.43 [1.57–3.75]); Boyle 2009
  (Psychosom Med 71(5):574–9, Rush cohorts, per-unit HR 0.60
  [0.42–0.87]); the definitive pooled estimate is now Sutin 2026
  (meta-analysis + IPD, 488,765 participants, 25 samples, up to 32 y
  follow-up, PMID 42417009, PMC13370182 — "consistent association with
  lower mortality, due in part but not completely to behavioral,
  clinical, and psychological risk factors").
- Purpose×SES joint (AJPM 2021, PMC8319073, HRS n=13,159): the only
  purpose JOINT cells found — with SES, not with stress/social.
- Loneliness/purpose: Sutin 2022 (IPD meta, 36 cohorts, n=135,227:
  purpose↔loneliness r=−0.31, purpose → less incident loneliness HR
  0.85); Soc Sci Med 2026 (PubMed 39653383 area): **~88% of the
  loneliness→mortality association runs through purpose** (mediation).
  This is real mediator-pair evidence: in the ρ layer, purpose↔social
  is mediator-kind (purpose downstream of social's loneliness path),
  discount modest — single study, and loneliness ≠ our `social` slider
  (which spans structural + functional connection).
- Social components: UK Biobank social connection (BMC Med 2023,
  458,146; functional×structural interactions WITHIN social connection
  — no purpose/stress in the joint cells); H-EPESE support trajectories
  (Res Aging 2016, HR 1.70 low vs high support, men; sex interaction —
  per-lever, not a triple).
- Stress: only mutual adjustment found (Japanese ikigai studies adjust
  perceived stress; Koizumi 2008 Japan J Public Health); no joint cells
  with purpose or social.

**Sleep regularity — the search found MORE than the todo expected:**
- Windred et al. 2024 (Sleep 47(1):zsad253, PMC10782501, UK Biobank
  n=60,977, accelerometer Sleep Regularity Index): top vs bottom SRI
  quintile all-cause HR 0.70 (0.59–0.83) fully adjusted, mutually
  adjusted for sleep DURATION — regularity's effect is duration-
  independent. Regularity predicted mortality MORE strongly than
  duration in this cohort.
- A duration×regularity JOINT cells table exists (Sci Rep 2025,
  Ansung-Ansan Korean cohort n=9,641, self-reported regularity:
  <7 h irregular HR 1.28 [1.04–1.55]-area; women >8 h irregular HR
  1.78 [1.05–3.02], sex-stratified).
- Effect on the plan: the 1.7 dispatch said sleepReg stays mind-only
  "no mortality joint data" — that is now outdated. This does NOT
  change the conflation fix (no purpose×stress×social joint table),
  but it is a recorded follow-up: Phase 2/3 candidate to give
  `sleepRegularity` a mortality effect (Windred marginal + Korean
  cells) with ρ(sleepReg, sleep-duration cells) ≈ moderate-high
  (regularity and duration correlate ~0.3–0.5 in actigraphy; Windred
  mutual adjustment means the HRs themselves don't double count, but
  the covariance layer should still share σ) and ρ vs
  purpose/stress/social none (no data). Do NOT implement in this pass
  (scope); tracked under "later".

### 1.12 Substance mutual adjustment — done 2026-07-31

**Task:** verify Wood 2018 (alcohol) adjusts for smoking; check snus,
vaping, cannabis sources for mutual adjustment with smoking/alcohol;
any failing pair becomes a ρ pair.

**Pairs VERIFIED — no ρ needed (mutually adjusted or excluded by design):**

- alcohol↔smoking — **both directions adjusted.** Wood 2018 (Lancet
  391:1513–23): Cox models per study "stratified by sex and with
  adjustment for known confounders: age, smoking status (current vs
  non-current) and history of diabetes". Jha 2013 (NEJM 368:341–50):
  age-stratified Cox adjusted for educational level, **alcohol
  consumption (nondrinker / former / light / moderate-to-heavy)** and
  adiposity (BMI <25/25–29.9/≥30). The core smoking×alcohol double
  count does not exist; plain multiplication is honest for this pair.
- snus↔smoking — by design: byhamre2021 pooled **169,103 never-smoking
  men** (smoking excluded via restriction, not adjustment).
- vaping↔smoking — by design + adjustment: berlowitz2022 (Circulation
  145:1557–9, PATH) categories are mutually exclusive (nonuse /
  exclusive e-cigarette / exclusive smoking / dual use, updated per
  wave); multivariable models additionally adjust for cigarette
  pack-years + pack-years². (Nuance: "nonuse" includes FORMER smokers —
  stated limitation; exclusive vapers carry ~11 pack-years vs 4.2 in
  nonuse, handled by the pack-years term.)
- vaping↔cannabis — berlowitz2022 adjusts for "ever use of marijuana".
- cannabis↔smoking and cannabis↔alcohol — sidney1997 (AJPH 87:585–90,
  Kaiser n=65,171): Cox models adjust for cigarette smoking and
  alcohol use; marijuana×tobacco and marijuana×alcohol interactions
  tested, none significant (P<0.05 threshold); sensitivity among
  nonsmokers/occasional drinkers gave "generally similar" RRs — the
  authors conclude the null was not an artifact of incomplete control
  for smoking/alcohol.

**Pairs FAILING — become ρ pairs (recorded for 1.15/3.4):**

1. **ρ(snus, alcohol)** ≈ 0.15 (ρU 0.10), tier moderate — byhamre2021
   main aHRs adjusted for attained age (time scale) + BMI ONLY; alcohol
   not in the main model. The sensitivity analysis (excluding
   Construction Workers Cohort + Malmö Diet and Cancer Study; +education
   +alcohol +physical activity) "yielded similar results" — so the
   double count is real but small (snus users drink more, yet the snus
   HR is stable under alcohol adjustment). Kind: residual confounding.
2. **ρ(vaping, alcohol)** ≈ 0.10 (ρU 0.05), tier low — PATH collects no
   alcohol data; unmeasured confounder. Numerically moot while the
   vaping CVD estimate is a null (HR 1.00 [0.69–1.45]); re-evaluate if
   a future vaping HR turns non-null.

**Other sources touched, no ρ:** xie2024 (NHIS dual-use finding, HR
2.44 vs never/never, 1.06 vs exclusive smoking — finding card only, no
effect, categories mutually adjusted by design). moore2007 (cannabis
psychosis/affective systematic review — mind-output points source;
psychosis ORs come from heterogeneous studies with inconsistent
smoking adjustment, but points are not multiplied in the HR product, so
no ρ assigned; revisit only if mind-points conflation rules ever land
on the substances cluster). gbd2016 (alcohol cancer RR curves from a
systematic analysis; smoking-adjusted where pooled studies permitted —
cancer-card-only, no pair decision needed).

**Correction found (apply in the application pass):** factors.js snus
CVD byOption CI (1.20–1.35) does not match the published value —
byhamre2021 abstract/Table: cardiovascular mortality aHR 1.27 (95% CI
**1.15–1.41**). All-cause 1.28 (1.20–1.35) and cancer 1.12 (1.00–1.26)
match the paper exactly.

**Bottom line for 3.4:** substance multiplication is mostly honest —
two small ρ pairs only (snus↔alcohol 0.15, vaping↔alcohol 0.10); no
ρ(smoking, alcohol) — the classic double-count fear is already
controlled by both primary sources.

### 1.13 Calibration anchors — pre-registered 2026-07-31

**Purpose:** a falsifiable end-to-end calibration for Phase 3.6: the
fixed engine must reproduce a published "5 healthy factors vs 0" hazard
ratio and life-expectancy delta. Pre-registration binds the profile
mapping and the tolerance band NOW, so Phase 3.6 cannot tune either to
make the test pass.

**Anchor 1 — Li 2018 (primary), verified at the paper (Circulation
138:345–55, DOI 10.1161/CIRCULATIONAHA.117.032047, PMID 29712712,
PMC6207481; NHS 1980–2014 n=78,865 + HPFS 1986–2014 n=44,354; 42,167
deaths, ≤34 y FU):**
- 5-vs-0 low-risk factors, all-cause: **HR 0.26 (0.22–0.31)**; cancer
  0.35 (0.27–0.45); CVD 0.18 (0.12–0.26).
- Life expectancy at age 50, 5 vs 0 factors: **+14.0 y women (95% CI
  11.8–16.2), +12.2 y men (95% CI 10.1–14.2)** — NOTE: the todo.md
  pre-registration draft said "+14.9 / +12.4" — WRONG, corrected here;
  the published deltas are 14.0 / 12.2.
- Absolute LE at 50: 0 factors 29.0 y F / 25.5 y M; 5 factors 43.1 y F /
  37.6 y M.
- Low-risk definitions: never smoking; BMI 18.5–24.9; ≥30 min/d MVPA
  (≈ ≥3.5 h/wk, ≈ ≥210 min/wk); moderate alcohol 5–15 g/d F / 5–30 g/d M
  (≈ 2.5–7.5 / 2.5–15 drinks/wk); diet upper-40% AHEI. Multivariable
  age- and sex-specific HRs, adjusted for each other.

**Anchor 2 — Sun 2022 (cross-check), verified at the paper (Lancet
Public Health 7(12):e994–e1004, DOI 10.1016/S2468-2667(22)00110-4,
PMID 35926549, open access; CKB n=487,209 primary, 42,496 deaths,
median 11.1 y FU):**
- 5 vs 0–1 low-risk factors, all-cause: **aHR 0.38 (0.34–0.43)**; CVD
  0.37 (0.30–0.46); cancer 0.47 (0.39–0.56); CRD 0.30 (0.14–0.64).
- LE at age 30, 5 vs 0–1 factors: **+8.8 y men (6.8–10.7), +8.1 y women
  (6.5–9.9)**. Factors: never smoking or quit-not-for-illness; no
  excessive alcohol; physically active; healthy eating; healthy body
  shape (waist-based, NOT BMI-only). NOTE: todo.md draft "Sun 2022
  China (HR 0.38)" — the number is right; the reference is 0–1 factors
  and the LE is at age 30 (not 50).

**Pre-registered profile mapping (sliders → Li 2018 factors).** Both
profiles share: height 170 cm; everything NOT listed is left at its
default in BOTH profiles (so it cancels in the ratio); sex is run
separately (only affects baseline LE in the engine, not HRs).

| Factor (Li 2018) | Profile A ("5") | Profile B ("0") |
|---|---|---|
| Smoking | `never` | `current` |
| BMI (via weight) | 22.0 (63.6 kg) | 30.0 (86.7 kg) |
| PA ≥30 min/d MVPA | cardio 210 min/wk | cardio 0 |
| Diet (AHEI top 40%) | fiber 30, fruitVeg 5, fish `lots`, nuts 30, Mg 350, processedMeat 0, ssb 0, coffee 2 | fiber 5, fruitVeg 0, fish `none`, nuts 0, Mg 100, processedMeat 7, ssb 3, coffee 0 |
| Alcohol | **2.5 drinks/wk (held)** | **2.5 drinks/wk (held)** |

Pre-registered mapping decisions (no post-hoc changes):
1. **Alcohol is held at 2.5 in both profiles.** Li 2018's "moderate
   alcohol" component is not exercised because (a) our model's
   reference stratum is light drinkers ≤7 drinks/wk (HR 1.0) — any
   value within [0,7] cancels in the ratio anyway; (b) Li's "0" category
   mixes abstainers and heavy drinkers, and our model deliberately does
   not penalize abstainers (abstainer-bias caveat, factors.js note).
2. **Strength, steps, sitting, occupationalPA, sleep, and all mind
   inputs stay at defaults** — they are not in Li's 5-factor score.
3. **The metric is the RAW ratio** `raw.hr(A) / raw.hr(B)` from
   `engine.evaluateRaw` (both profiles vs the studies' reference strata;
   the common reference cancels). The years translation uses
   `engine.hrToYears(ratio)` (Gompertz, mrrtYears=7 — an approximation
   of a full life table; documented caveat).

**Tolerance bands (pre-registered, falsifiable, NOT widen-able):**
- Primary (Li 2018): `raw.hr(A)/raw.hr(B)` point estimate must land in
  **[0.22, 0.31]** (target 0.26). Secondary: Gompertz-converted years
  delta must land in **[11.8, 16.2] (women) / [10.1, 14.2] (men)**.
- Cross-check (Sun 2022): same two profiles, band **[0.34, 0.43]**
  (target 0.38), with documented caveats (Chinese population, 0–1
  reference, body-shape vs BMI definition, LE at 30).
- **Calibration failure → debug the mapping/engine machinery, never the
  band.** factors.js coefficients are frozen during the calibration run
  (the calibration tests the conflation machinery, not the numbers).

**Baseline probe (pre-refactor engine, recorded 2026-07-31):** the
current double-counting engine yields `hr(A)=0.167, hr(B)=4.102,
ratio=0.041` (target 0.26; ~6× too strong) and a Gompertz years delta
of 32.3 y (vs 14.0/12.2). This is the expected-fail baseline: the
ratio must INCREASE ~6-fold as the Phase 2/3 machinery replaces naive
multiplication with joint models and per-cluster contributions. The
probe script is at /tmp/opencode/anchor_probe.js (reusable in 3.6;
move into tests/ if desired).

### 1.14 Cross-category residual pairs — done 2026-07-31

**Task:** for the four candidate residual pairs from the option-#2 list
(sun↔sleep, RHR↔cardio/VO2max, meditation↔stress, grip↔strength), find
direct correlation evidence or justify an assumption band; record each
ρ/ρU/tier for the `overlaps` structure in 1.15.

**Method:** targeted literature searches for direct correlations
between the two constructs each slider measures. Where no direct r
exists, an assumption band is derived from directional causal evidence
and explicitly flagged. All six pairs are RESIDUAL: neither marginal HR
was mutually adjusted in its primary source (verified during the pass).

**Pairs (all magnitudes ≤0.30; direction noted for the input
correlation):**

1. **ρ(rhr, cardio) ≈ 0.20 (ρU 0.10), tier moderate, kind
   shared-pathway** (both track cardiorespiratory fitness/autonomic
   tone). Fenland Study (Gonzales 2023, PLoS ONE 18(5):e0285272;
   n=10,865, 29–65 y): age-adjusted RHR↔VO2max β ≈ −0.26/−0.29
   ml/kg/bpm (seated/supine); PAEE adjustment attenuates 30–40% and
   MVPA share another 5–15% (~50% total); fully adjusted (age, sex,
   ethnicity, smoking, alcohol, BMI, PA) coefficient ≈ −0.13.
   β→r with SD_RHR ≈ 9.8 bpm, SD_VO2max ≈ 8 ml/kg: age-adjusted
   r ≈ 0.35, fully adjusted r ≈ 0.16; longitudinal within-person
   Δr = −0.20. Our cardio slider is self-reported min/week (noisier
   than objectively measured PAEE) → ρ 0.20, band ±0.10. Direction:
   NEGATIVE (active people have lower RHR). Nuance: aune2017rhr
   reports the RHR association "survived activity adjustment in most
   studies" — the RHR marginal is already mostly net of activity, so
   the residual double count sits mostly on the cardio side.
2. **ρ(rhr, vo2max) ≈ 0.15 (ρU 0.10), tier moderate, kind
   shared-pathway.** Same source: Fenland fully-adjusted coefficient
   (−0.13) → r ≈ 0.16; longitudinal −0.20. With a measured VO2 max
   entered, this is the direct physiological correlation with RHR;
   ρ 0.15, band 0.05–0.25.
3. **ρ(meditation, stress) ≈ 0.28 (ρU 0.13), tier moderate, kind
   shared-pathway** (negative affect). DIRECT evidence: Munjal et al.
   2025 (Frontiers in Psychiatry 16:1573407; n=145 undergraduates,
   COVID-lockdown sample): PSS-10 ↔ meditation frequency
   rₛ = −0.27 (95% CI −0.50 to −0.01); PSS-10 ↔ weekly meditation
   minutes rₛ = −0.29 (−0.52 to −0.03). Both sliders map directly onto
   these constructs (min/week; stress /10). Direction: NEGATIVE.
   Caveats: single small sample; and both effects ALSO share
   negative-affect variance on the happiness POINTS pathway (not the
   HR product) — the Phase-2 blend rule (2.2) is log-space/HR-only;
   points-overlap needs a points analogue (blend |Δpoints| by ρ) to be
   specified in 2.2.
4. **ρ(grip, strength) ≈ 0.25 (ρU 0.15), tier moderate, kind
   shared-pathway** (muscle), ASSUMPTION BAND — no direct population
   r between RT sessions/wk and grip kg found. Justification: causal
   RT→grip direction established (Frontiers in Physiology 2025 network
   meta-analysis: RT 2–5×/wk raises grip, optimum 3×/wk MD 7.02 kg
   [4.62–9.42]); grip is a marker of overall muscular strength
   (leong2015 note) but is dominated by age/sex/body size, and only a
   minority of gripOn users will also train → weak-to-moderate input
   correlation. Band 0.10–0.40.
5. **ρ(sunExposure, sleep) ≈ 0.05 (ρU 0.10), tier low, kind
   shared-pathway** (circadian). Burns 2021 (UK Biobank, J Affect
   Disord 295:347–52, n≈400k): per additional hour of daytime outdoor
   light, FULLY adjusted incl. sleep duration: earlier chronotype
   OR 0.76 (0.75–0.77), easier waking OR 1.47, fewer insomnia
   symptoms OR 0.96, less tiredness OR 0.81 — effects on sleep
   TIMING/QUALITY, not duration (the duration-adjusted ORs are null
   on duration). Objectively measured (Zhang 2026, Res Q Exerc Sport,
   UK Biobank n=100,021): light-exposure minutes are significantly
   NEGATIVELY associated with sleep duration (B = −0.617, p<.001) —
   more outdoor time accompanies slightly SHORTER sleep. Input
   correlation ≈ 0/slightly negative; ρ 0.05 with a generous band.
6. **ρ(sunExposure, sleepRegularity) ≈ 0.15 (ρU 0.15), tier low,
   kind shared-pathway**, ASSUMPTION BAND — no direct data. Daylight
   is the primary circadian entrainer (Burns 2021: phase advancement
   per hour — implies more regular timing), but our self-rated
   regularity slider is a proxy for an accelerometer SRI; band
   0–0.30.
7. **ρ(sunExposure, cardio) ≈ 0.10 (ρU 0.05), tier moderate, kind
   shared-pathway** (outdoor activity). DIRECT r from the same cohort
   our HRs came from: Nazeeh 2025 (AHS-2, Environ Epidemiol 9(3):e401,
   PMC12122178) — "the correlation between time outdoors in daylight
   and physical activity was low (Pearson r = 0.09 warmer / 0.10
   cooler months, P<0.001)", and the published HRs are "after
   adjusting for physical activity and important confounders". The
   sunExposure marginal is therefore already NET of activity, and the
   input correlation is tiny — the naive fear ("outdoor time is
   really exercise") is empirically unfounded in this cohort. Burns
   2021 (model 3) also adjusts for exercise, corroborating.
8. **ρ(sunExposure, steps) ≈ 0.10 (ρU 0.05), tier moderate, kind
   shared-pathway.** Same source as 7 (steps is another PA measure;
   AHS-2's PA correlation applies).
9. **ρ(sunExposure, vitaminD) ≈ 0.15 (ρU 0.15), tier low, kind
   mediator**, ASSUMPTION BAND — sources silent on the % of the
   sun→mortality association mediated by 25(OH)D. Reasoning: sun is
   causal upstream of vitamin D status (UV-B photosynthesis; sun
   avoiders have markedly lower 25(OH)D, lindqvist2014), and the
   vitamin D marginal (schottker2014, bottom-vs-top quintile RR 1.57)
   is NOT adjusted for sun hours — but the sun marginal's benefit is
   largely non-vitamin-D (NO-mediated BP, circadian; stevenson2024),
   and the VITAL RCT null (manson2019, HR 0.99) caps how much of the
   vitamin D association is causal — so the residual overlap is small.
   Band 0–0.30; re-evaluate if a published % mediated appears.

**Not paired (and why):** meditation↔sleep / meditation↔social:
not on the option-#2 list; shared outcomes limited to happiness
points — defer to 3.5 if mind-points conflation grows. (Earlier
draft notes in the roadmap suggested a sun↔outdoor-activity pair —
implemented here as pairs 7–8 with direct r evidence.)

**Bottom line for 1.15/3.4:** nine ρ pairs (three with direct r from
the relevant cohorts, six assumption bands), all ≤0.30 — blending
shifts the product only mildly, consistent with the 1.13 calibration
band [0.22, 0.31] as the double count is removed elsewhere. New
source keys needed in the application pass (not yet in factors.js
sources map): `gonzales2023` (Fenland), `munjal2025`, `burns2021`,
`zhang2026` (+ the Frontiers 2025 RT network meta if cited).
Nazeeh 2025 is already in the sources map as `adventist2025`.

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
