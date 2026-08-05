/*
 * joint-models.js — the conflation joint estimates (dietScore, ekelundTable, mommaCells, duncanCells, mayoCells)
 *
 * Part of the assembled ADVANCED model — see js/joint/index.js; the
 * base SIMPLE model lives in js/factors.js.
 *
 * Dual export (same pattern as factors.js/schema.js/engine.js):
 *   CommonJS  module.exports
 *   browser   globalThis.HEALTH_JOINT_MODELS  (<script> loaded before js/joint/index.js)
 */
(function (root) {
  'use strict';

  // ------------------------------------------------- Joint models (conflation)
  // When multiple inputs share a causal pathway, their marginal effects must
  // NOT be multiplied — the joint estimate replaces the product (see PLAN.md
  // §1.2–1.11 for the verified joint models). Each entry describes ONE
  // sub-model; the engine (Phase 2) dispatches per `cluster` and only applies
  // the joint model when at least one cluster member is active. Ownership
  // rule: an input's HR is counted by at most ONE joint model — the first
  // entry whose `members` include it (array order decides).
  //
  // Schema (documented; this array is EMPTY until Phase 3 populates it):
  //   {
  //     id:       string,            // unique joint-model id
  //     cluster:  string,            // cluster key (e.g. 'diet', 'movement',
  //                                  //   'adiposity', 'substances', 'psychosocial')
  //     members:  string[],          // input ids whose marginal HRs this
  //                                  //   entry REPLACES (each counted once)
  //     model:    'score'|'table'|'cells',
  //                                  // 'score': additive score built from
  //                                  //   per-input components (PURE-style);
  //                                  //   each component gets partial credit
  //                                  //   along the published gradient
  //                                  // 'table': grid of published joint
  //                                  //   categories (e.g. Ekelund PA×sitting,
  //                                  //   Mayo 2021 PA×adiposity) with
  //                                  //   bilinear interpolation
  //                                  // 'cells': published discrete cells
  //                                  //   (e.g. Momma 2022 aerobic×strength,
  //                                  //   Duncan 2023 PA×strength×sleep) —
  //                                  //   same shape as 'table', no
  //                                  //   interpolation
  //     lookup:   { components, gradient }  // 'score' model:
  //                                  //   components: [{ input, max, weight,
  //                                  //     valueOf? }]
  //                                  //     (read-only axis inputs; score =
  //                                  //     Σ weight·clamp(value/max, 0, 1);
  //                                  //     partialCredit per input =
  //                                  //     Σ weight·fraction over the
  //                                  //     slider's entries, for the UI;
  //                                  //     valueOf maps segmented values,
  //                                  //     e.g. fish {none:0, some:1, lots:1})
  //                                  //   gradient: [{ max, hr, hrLow, hrHigh }]
  //                                  //     (score -> HR steps, same walk as
  //                                  //     input `steps`)
   //              { axes, grid, interpolate, ratio }  // 'table'/'cells':
   //                                  //   axes: [{ id, label, unit,
   //                                  //     inputs: [ids], coeffs: [..],
   //                                  //     fn: (values, resolveValue) -> n,
   //                                  //     bands: [{ max, label }] }]
   //                                  //     (axis value = Σ coeffᵢ·inputᵢ,
   //                                  //     banded by `max` cutoffs; inputs
   //                                  //     are read-only — members decide
   //                                  //     whose HRs this replaces; `fn`
   //                                  //     replaces the sum for categorical
   //                                  //     axes (Duncan PA category — all
   //                                  //     thresholds live here, and the fn
   //                                  //     must mirror the engine's
   //                                  //     gated/superseded rule, e.g.
   //                                  //     vo2maxOn retires cardio);
   //                                  //     gated-off or superseded inputs
   //                                  //     contribute 0 automatically)
   //                                  //   grid: nested array by band index,
   //                                  //     entries { hr, hrLow, hrHigh };
   //                                  //     interpolate: true → bilinear on
   //                                  //     log HR between band cutoffs
   //                                  //     (2 axes only)
   //                                  //   ratio: { axis, referent } →
   //                                  //     total = cell(...)/cell(axis →
   //                                  //     referent band): the lookup
   //                                  //     contributes only the referent
   //                                  //     axis's main effect (interacted
   //                                  //     with the other axis); the other
   //                                  //     axis's row effect is divided away
   //                                  //     because a sibling cluster owns it
   //                                  //     (Duncan's PA rows are owned by
   //                                  //     Ekelund/Momma). CI = quadrature
   //                                  //     of the two cells' sigmas.
  //     outputs:  { mortality: lookup, cvd: lookup, ... }  // per-output
  //                                  //   lookups; outputs without coverage
  //                                  //   fall back to the members' marginal
  //                                  //   product
  //     evidence: 'high'|'moderate'|'low',  // widens the joint total's CI
  //     source:   string|string[],  // keys into `sources` below
  //     calibrate: true,  // OPTIONAL: shift this joint model's lookup
  //                                  //   (and CI) by a constant log-space
  //                                  //   offset per HR output so the total at
  //                                  //   the AVERAGE profile equals the owned
  //                                  //   members' marginal product exactly
  //                                  //   (calibration rule §2.1). Used when
  //                                  //   the published table's default cell
  //                                  //   is far from our members' frame
  //                                  //   (Ekelund ~92% off); skipped when it
  //                                  //   is within the tolerance band (Momma).
  //                                  //   Members already owned by an earlier
  //                                  //   joint model are excluded from the
  //                                  //   anchor sum (first-owner rule).
  //   }
  // While empty, the engine multiplies marginals exactly as before — this
  // structure is a no-op by design.

const jointModels = [
    {
      // PURE-style healthy diet score (Phase 3.1). One joint model per
      // cluster, here: the 4 inputs with PURE score components mapped onto
      // our sliders (fiber, fruitVeg, nuts, fish).
      id: 'dietScore',
      title: 'Diet score (PURE)',
      cluster: 'diet',
      members: ['fiber', 'fruitVeg', 'nuts', 'fish'],
      model: 'score',
      evidence: 'high',
      source: ['mente2023'],
      outputs: {
        mortality: {
          // Six PURE components, five mappable: fruit, vegetables, legumes,
          // nuts, fish (dairy excluded — the paper's Appendix S8 shows
          // dropping any single component barely changes the association).
          // fruitVeg feeds BOTH the fruit and the vegetables component:
          // 6 servings/d ≈ fruit (PURE median 145 g/d ≈ 1.8 servings) +
          // vegetables (250 g/d ≈ 3.1 servings); 3 servings/d = the
          // vegetables point. fiber stands in for legumes (PURE median
          // 38 g/d ≈ 6–8 g fiber → 25 g/d). fish max 1 (any regular
          // intake = the PURE fish median 12 g/d point).
          components: [
            { input: 'fruitVeg', max: 6, weight: 1 }, // fruit
            { input: 'fruitVeg', max: 6, weight: 1 }, // vegetables
            { input: 'fiber', max: 25, weight: 1 }, // legumes
            { input: 'nuts', max: 9, weight: 1 }, // nuts
            { input: 'fish', max: 1, weight: 1, valueOf: { none: 0, some: 1, lots: 1 } },
          ],
          // Per-point HR 0.91 (0.89–0.93) — the paper's per-20-percentile
          // increment, applied as exact powers. Cross-check: ≥5-vs-≤1 0.70
          // (0.63–0.77) vs our top step 0.91^4 = 0.6857 (0.6274–0.7481).
          gradient: [
            { max: 1, hr: 1.0, hrLow: 1.0, hrHigh: 1.0 },
            { max: 2, hr: 0.91, hrLow: 0.89, hrHigh: 0.93 },
            { max: 3, hr: 0.8281, hrLow: 0.7921, hrHigh: 0.8649 },
            { max: 4, hr: 0.7536, hrLow: 0.705, hrHigh: 0.8044 },
            { max: 5, hr: 0.6857, hrLow: 0.6274, hrHigh: 0.7481 },
          ],
        },
      },
      note: "PURE healthy diet score (Mente 2023, Eur Heart J 44:2560–79): one point per above-median component; scores here are FRACTIONAL (partial credit along each component), so the US-average profile scores ≈3.0 points and lands mid-gradient (≈0.75 HR). The paper's per-20-percentile increment 0.91 (0.89–0.93) is applied per point as exact powers; the published ≥5-vs-≤1 contrast 0.70 (0.63–0.77) matches our top step 0.686 (0.627–0.748) within ~2%. Members' own marginal effects (fiber Yang 2015, fruit/veg Wang 2014, nuts Aune 2016, fish Kwok 2019/Li 2020) are superseded for mortality; the joint total replaces the marginal product when the score lookup covers the output.",
    },
    {
      // PA×sitting joint table (Phase 3.2). Ekelund 2016 (Lancet): 16
      // studies, 1,005,791 people, 84,609 deaths; harmonised meta-analysis
      // of the sitting×PA interaction. Members' marginal effects (cardio
      // Arem 2015, steps Stamatakis 2011, sitting Biswas 2015) are
      // superseded for mortality; cancer/CVD have no coverage here and fall
      // back to the members' marginals.
      id: 'ekelundTable',
      title: 'PA × sitting cluster',
      cluster: 'movement',
      members: ['cardio', 'steps', 'sitting'],
      model: 'table',
      evidence: 'high',
      source: ['ekelund2016'],
      calibrate: true,
      outputs: {
        mortality: {
          axes: [
            // PA axis (MET-min/wk): cardio min/wk × 4 MET (moderate
            // equivalent) + steps/d × 7 × 0.03 MET-min (walking ≈ 3 MET at
            // ~100 steps/min). Quartile cutoffs from the paper (MET-h/w ×
            // 60): Q1 ≤150, Q2 ≤960, Q3 ≤1800, Q4 >2130 (above 2130 the
            // risk is flat per the paper, so Q4's cell clamps).
            { id: 'pa', label: 'PA', unit: 'MET-min/wk', inputs: ['cardio', 'steps'], coeffs: [4, 0.21], bands: [{ max: 150, label: 'Q1' }, { max: 960, label: 'Q2' }, { max: 1800, label: 'Q3' }, { max: 2130, label: 'Q4' }] },
            // Sitting axis (h/day): the paper's <4 and 4–6 rows are stored
            // as-is; the open-ended >8 row is the LAST band so ≥8 h clamps
            // flat to it, and 6–8 h values interpolate between the 4–6 and
            // >8 rows (the published 6–8 row is not stored separately — it
            // is close to that midpoint, disclosed in the note).
            { id: 'sit', label: 'Sitting', unit: 'h/day', inputs: ['sitting'], coeffs: [1], bands: [{ max: 4, label: '<4' }, { max: 6, label: '4–6' }, { max: 8, label: '≥6' }] },
          ],
          // Rows = PA quartile (Q1…Q4), cols = sitting (<4, 4–6, >8).
          // Referent = <4 h/d + Q4 (1.00, top-right). Grid rows hold the HR
          // AT each band cutoff; interpolate: true bilinears between them.
          grid: [
            [{ hr: 1.27, hrLow: 1.22, hrHigh: 1.30 }, { hr: 1.35, hrLow: 1.30, hrHigh: 1.40 }, { hr: 1.59, hrLow: 1.52, hrHigh: 1.66 }],
            [{ hr: 1.12, hrLow: 1.08, hrHigh: 1.16 }, { hr: 1.15, hrLow: 1.11, hrHigh: 1.20 }, { hr: 1.27, hrLow: 1.21, hrHigh: 1.33 }],
            [{ hr: 1.03, hrLow: 0.99, hrHigh: 1.07 }, { hr: 1.08, hrLow: 1.04, hrHigh: 1.13 }, { hr: 1.13, hrLow: 1.07, hrHigh: 1.19 }],
            [{ hr: 1.00, hrLow: 0.96, hrHigh: 1.04 }, { hr: 1.00, hrLow: 0.96, hrHigh: 1.04 }, { hr: 1.04, hrLow: 0.99, hrHigh: 1.10 }],
          ],
          interpolate: true,
        },
      },
      note: "Ekelund 2016 (Lancet 388:1302–10): harmonised meta-analysis of 16 studies (1,005,791 people), joint sitting×PA all-cause mortality. Sitting 9 h/d at the US-average profile lands in the paper's >8 h/d row and ≈Q3 PA (defaults → PA 1248 MET-min/wk), where the table reads ≈1.22 while the members' marginal product is 0.59 — the `calibrate: true` anchor shifts the whole table by a constant log-space offset so the average profile is exactly 1.0× (calibration rule), preserving the table's shape and the sitting×PA interaction. HRs between band cutoffs are interpolated on the log scale (rows/cols hold the HR at each cutoff); the open-ended >8 h/d row clamps flat (≥8 h), and the published 6–8 h/d row is not stored separately — 6–8 h values interpolate between the 4–6 and >8 rows (the paper's 6–8 cells sit near that midpoint; 9 h/d reads the flat >8 row). Cells are minimally adjusted (age, sex) plus each study's original covariates — diet is not uniformly adjusted, and the remaining cross-cluster overlap with the diet score is not modelled. Ref cell CI (0.96–1.04) approximated from the adjacent published cell (the paper gives no CI for the referent). Cancer/CVD outputs have no table coverage and use the members' marginal effects.",
    },
    {
      // Aerobic×strength cells (Phase 3.2). Momma 2022 (BJSM): systematic
      // review + meta-analysis; the both-cells are the published joint
      // estimates and are genuinely synergistic (0.60 < 0.85×0.80 ≈ 0.68).
      // The `strength` slider's marginal (0.85 at the US-average 1
      // session/wk, now exactly matching the MS-only cell) is superseded;
      // `cardio` stays owned by ekelundTable —
      // this axis only reads it to select the aerobic row.
      id: 'mommaCells',
      title: 'Aerobic × strength cluster',
      cluster: 'movement',
      members: ['strength'],
      model: 'table',
      evidence: 'low',
      source: ['momma2022'],
      outputs: {
        mortality: {
          axes: [
            // Aerobic axis (read-only, owned by ekelundTable): ≥150 min/wk
            // moderate-equivalent = "AER" (the paper's aerobic group).
            { id: 'aer', label: 'Aerobic', unit: 'min/wk', inputs: ['cardio'], coeffs: [1], bands: [{ max: 149, label: 'none' }, { max: 9999, label: 'AER' }] },
            // Strength axis (sessions/wk): any ≥1 = "MS" (the paper's
            // muscle-strengthening group; the J-shaped dose-response beyond
            // 2–3 sessions/wk is not modelled — binary band, disclosed).
            { id: 'ms', label: 'Strength', unit: 'sessions/wk', inputs: ['strength'], coeffs: [1], bands: [{ max: 0, label: 'none' }, { max: 99, label: 'MS' }] },
          ],
          // Rows = aerobic (none, AER), cols = strength (none, MS).
          // Referent = neither (1.00, top-left). Published cells used
          // directly (no interpolation — 'cells' semantics). `ratio`
          // divides by the none COLUMN (axis 1, referent 0): total =
          // cell(aerobic, strength) / cell(aerobic, none). The aerobic
          // ROW main effect is divided away because the Ekelund cluster's
          // PA axis (cardio+steps) owns aerobic PA on mortality — keeping
          // both would price the aerobic signal twice (3.2f probe: cardio
          // 0→300 moved Ekelund ×0.824 AND this row ×0.706, combined
          // ×0.582 vs Arem's single 0.63). What remains is the strength
          // main effect interacted with aerobic status (the published
          // synergy survives: both-cell 0.60/0.80 = 0.75 < MS-only 0.85).
          // At the default none row the ratio is exactly the published
          // MS-only cell (0.85) — no calibration change. On cancer/cvd
          // Ekelund has no coverage, so aerobic there falls back to the
          // cardio input's own marginal — still priced exactly once.
          grid: [
            [{ hr: 1.00, hrLow: 0.96, hrHigh: 1.04 }, { hr: 0.85, hrLow: 0.79, hrHigh: 0.93 }],
            [{ hr: 0.80, hrLow: 0.78, hrHigh: 0.82 }, { hr: 0.60, hrLow: 0.54, hrHigh: 0.67 }],
          ],
          ratio: { axis: 1, referent: 0 },
        },
        cancer: {
          axes: [
            { id: 'aer', label: 'Aerobic', unit: 'min/wk', inputs: ['cardio'], coeffs: [1], bands: [{ max: 149, label: 'none' }, { max: 9999, label: 'AER' }] },
            { id: 'ms', label: 'Strength', unit: 'sessions/wk', inputs: ['strength'], coeffs: [1], bands: [{ max: 0, label: 'none' }, { max: 99, label: 'MS' }] },
          ],
          grid: [
            [{ hr: 1.00, hrLow: 0.96, hrHigh: 1.04 }, { hr: 0.88, hrLow: 0.80, hrHigh: 0.97 }],
            [{ hr: 0.80, hrLow: 0.78, hrHigh: 0.82 }, { hr: 0.72, hrLow: 0.53, hrHigh: 0.98 }],
          ],
          ratio: { axis: 1, referent: 0 },
        },
        cvd: {
          axes: [
            { id: 'aer', label: 'Aerobic', unit: 'min/wk', inputs: ['cardio'], coeffs: [1], bands: [{ max: 149, label: 'none' }, { max: 9999, label: 'AER' }] },
            { id: 'ms', label: 'Strength', unit: 'sessions/wk', inputs: ['strength'], coeffs: [1], bands: [{ max: 0, label: 'none' }, { max: 99, label: 'MS' }] },
          ],
          grid: [
            [{ hr: 1.00, hrLow: 0.96, hrHigh: 1.04 }, { hr: 0.83, hrLow: 0.73, hrHigh: 0.93 }],
            [{ hr: 0.79, hrLow: 0.76, hrHigh: 0.82 }, { hr: 0.54, hrLow: 0.41, hrHigh: 0.70 }],
          ],
          ratio: { axis: 1, referent: 0 },
        },
      },
      note: "Momma 2022 (BJSM 56:755–63): systematic review + meta-analysis of prospective cohorts; all cells are 'minimally adjusted plus aerobic PA adjusted in every study' (several also adjusted diet — the diet overlap is partly handled in-study). MS-only cells are Momma's aerobic-adjusted single-activity contrasts (all-cause 0.85, cancer 0.88, CVD 0.83); aerobic-only cells are approximated from the existing Arem 2015 ≥150 min/wk bands (0.80 all-cause/cancer — the cardio cancer effect mirrors mortality — 0.79 CVD) because Momma's aerobic-only contrast is graphical only (Figure 5); the combined cells are Momma's published joint estimates and are SYNERGISTIC (all-cause 0.60 < 0.85×0.80 ≈ 0.68 — the interaction is the point of the cells). RATIO MODE (3.2f): total = cell(aerobic, strength) / cell(aerobic, none) — the aerobic ROW main effect is divided away because the Ekelund cluster's PA axis owns aerobic PA on mortality (keeping both double-priced the aerobic signal ~8–15%, found by the 3.2f probe); the strength main effect × aerobic interaction survives (both-cell 0.60/0.80 = 0.75, still < MS-only 0.85 — synergy intact). On cancer/cvd, Ekelund has no coverage and aerobic falls back to the cardio input's own marginal, so each output prices aerobic exactly once. NO `calibrate` anchor: the default none row is exactly the published MS-only cells (0.85/0.88/0.83) and matches the strength marginal's 1-session band exactly (0.85/0.88/0.83) — the published cells stay intact (unlike the Ekelund table, which is ~92% off at defaults). The strength band is binary (any ≥1 session/wk = MS) — the paper's J-shaped dose-response (min RR at ~60 min/wk, no benefit past ~130 min/wk) is not modelled. Referent = no AER + no MS. Evidence 'low' (GRADE very low, I² 59–85%).",
    },
    {
      // Sleep×PA category cells (Phase 3.2). Duncan 2023 (JSHS 12:65–72,
      // NHIS 2004–2014, n=282,473, 18,793 deaths): joint PA×sleep-duration
      // table, referent Active-Rec. `ratio: true` divides by the Rec column
      // so the table contributes ONLY the sleep main effect interacted with
      // PA category — the PA-row main effect is owned by the Ekelund/Momma
      // clusters and would double-count if multiplied. The `sleep` slider's
      // marginal (Cappuccio 2010) is superseded for mortality only.
      id: 'duncanCells',
      title: 'PA × sleep cluster',
      cluster: 'movement',
      members: ['sleep'],
      model: 'table',
      evidence: 'low',
      source: ['duncan2023'],
      outputs: {
        mortality: {
          axes: [
            // PA category (categorical, via `fn`): the paper's Active /
            // AER only / MSA only / Inactive groups. Thresholds: aerobic
            // ≥150 min/wk mod-equivalent flips AER on; strength ≥2
            // sessions/wk flips MSA on; both = Active; neither = Inactive.
            // Mirrors the engine's supersession rule: vo2maxOn retires the
            // cardio slider (the Ekelund PA axis does the same), so
            // measured fitness never double-counts. Returns the band index.
            {
              id: 'paCategory', label: 'PA category',
              fn: (v, r) => {
                const cardio = (v.vo2maxOn ? 0 : r('cardio')) || 0;
                const strength = r('strength') || 0;
                const aer = cardio >= 150, msa = strength >= 2;
                return aer && msa ? 3 : aer ? 2 : msa ? 1 : 0;
              },
              bands: [
                { max: 0, label: 'Inactive' },
                { max: 1, label: 'MSA only' },
                { max: 2, label: 'AER only' },
                { max: 3, label: 'Active' },
              ],
            },
            // Sleep duration (h/day): Short ≤6.9, Rec ≤9.4, Long ≤11. The
            // 9.1–9.9 range is ambiguous in the study itself (its Long
            // boundary is ≥10 for 18–64 y and ≥9 for >64 y) — 9.5 maps
            // Long, disclosed.
            { id: 'sleep', label: 'Sleep', unit: 'h/day', inputs: ['sleep'], coeffs: [1], bands: [{ max: 6.9, label: 'Short' }, { max: 9.4, label: 'Rec' }, { max: 11, label: 'Long' }] },
          ],
          // Rows = PA category in BAND order (Inactive, MSA only, AER only,
          // Active — note: NOT the paper's display order, which lists the
          // referent Active first); cols = sleep (Short, Rec, Long). The
          // paper's published cells, used directly — NO interpolation: the
          // study's sleep groups are discrete categories (Rec = 7–9 h), so
          // a slider value inside a band reads that band's cell (no
          // invented gradient; also keeps the defaults ratio exactly 1.0).
          // `ratio` divides by the Rec column (band 1) so at defaults
          // (Inactive, Rec) the total is 1.00 exactly — the average person
          // sleeps a reference duration, no calibration offset needed.
          grid: [
            [{ hr: 1.59, hrLow: 1.43, hrHigh: 1.76 }, { hr: 1.68, hrLow: 1.53, hrHigh: 1.84 }, { hr: 2.20, hrLow: 1.99, hrHigh: 2.44 }],
            [{ hr: 1.43, hrLow: 1.17, hrHigh: 1.76 }, { hr: 1.56, hrLow: 1.36, hrHigh: 1.80 }, { hr: 2.32, hrLow: 1.85, hrHigh: 2.91 }],
            [{ hr: 1.28, hrLow: 1.14, hrHigh: 1.44 }, { hr: 1.21, hrLow: 1.09, hrHigh: 1.34 }, { hr: 1.54, hrLow: 1.34, hrHigh: 1.76 }],
            [{ hr: 1.08, hrLow: 0.92, hrHigh: 1.26 }, { hr: 1.00, hrLow: 1.00, hrHigh: 1.00 }, { hr: 1.40, hrLow: 1.11, hrHigh: 1.77 }],
          ],
          ratio: { axis: 1, referent: 1 },
        },
      },
      note: "Duncan 2023 (J Sport Health Sci 12:65–72, NHIS 2004–2014, n=282,473): joint PA×sleep-duration all-cause mortality. Ratio mode: total = cell(PA, sleep) / cell(PA, Rec) — the PA-row main effect (Inactive 1.68 → Active 1.00 gradient) is divided away because Ekelund/Momma already own the PA risk; what remains is the sleep main effect interacted with PA category, which is the study's novel finding (short-sleep risk ~eliminated in the Active group, 1.08 NS; long-sleep risk persists at every PA level, worst with low PA 2.20–2.32). No multiplicative interaction is significant in the study, so the cells are used directly; the study's sleep groups are discrete categories, so there is NO interpolation on the sleep axis (a value inside a band reads that band's cell — the defaults ratio is then exactly 1.00, no `calibrate` anchor needed). Sleep slider 4–11 h, step 0.5; Rec = the 7–9 h (18–64 y) / 7–8 h (>64 y) reference; the 9.1–9.9 range is ambiguous in the study itself and 9.5 maps Long. The study does NOT adjust for diet or sedentary behaviour (stated limitation) — the diet overlap is priced by the `duncanCells ↔ dietScore` overlap pair (ρ 0.10), and sitting overlap by the Ekelund cluster's own sitting axis. The Active-Rec referent cell has no published CI (1.00 used as-is; the ratio's CI adds only the denominator's sigma — a slight understatement, disclosed). Evidence 'low' (self-reported PA/sleep, wide CIs in some cells).",
    },
    {
      // PA×adiposity joint table (Phase 3.3). Sanchez-Lastra 2021 (Mayo Clin
      // Proc 96:105–19; UK Biobank n=295,917, 6,684 deaths): joint PA×BMI
      // and PA×body-fat cells for ALL-CAUSE, CVD- and cancer-mortality
      // (Model 3). Replaces the Di Angelantonio BMI marginal on all three HR
      // outputs AND gives the body-fat slider real CVD + cancer data; the
      // bodyFat marginal (Jayedi 2022) retires on mortality too (first-owner
      // rule — one joint model per cluster, members counted once).
      // The PA axis is rank-preserving (Ekelund cutoffs, not Mayo's MET
      // medians — UK Biobank self-report overreports; keeping both tables'
      // axes on the same scale matters more, disclosed). The adiposity axis
      // reads derived BMI, or the measured body-fat slider when bodyFatOn;
      // the grid follows the axis mode (the BF quartile rows are a separate
      // published table — same study, different adiposity measure).
      id: 'mayoCells',
      title: 'PA × body weight cluster',
      cluster: 'adiposity',
      members: ['bmi', 'bodyFat'],
      model: 'table',
      evidence: 'high',
      source: ['sanchezlastra2021'],
      calibrate: true,
      outputs: {
        mortality: {
          // Axis 0 = grid ROWS, axis 1 = grid COLUMNS (indexGrid order; the
          // grids below are stored rows=PA, cols=adiposity). The ratio's
          // referent is column 0 of axis 1 — the normal/low adiposity column
          // — so the PA-row main effect divides away.
          axes: [
            // PA axis: rank-preserving mapping onto the Ekelund quartile
            // cutoffs the movement cluster already uses (G3 ≤150 / G2 ≤1800 /
            // G1 >1800 MET-min/wk from cardio min/wk × 4 + steps/d × 0.21) —
            // NOT the paper's MET medians (UKB overreports; the two tables
            // must stay on the same PA scale). vo2maxOn retires the cardio
            // slider here automatically (engine axis rule, same as Ekelund).
            { id: 'pa', label: 'PA', unit: 'MET-min/wk', inputs: ['cardio', 'steps'], coeffs: [4, 0.21], bands: [{ max: 150, label: 'G3' }, { max: 1800, label: 'G2' }, { max: Infinity, label: 'G1' }] },
            // Adiposity axis. BMI mode: the study's four BMI groups
            // (18.5–24.9 / 25–29.9 / 30–34.9 / ≥35); BMI <18.5 was EXCLUDED
            // from the study (illness-related weight loss), so underweight
            // maps into the normal-weight band (col 0) — the Di Angelantonio
            // left arm is not counted (finding + note). BF mode (bodyFatOn):
            // the study's sex-specific distribution-matched quartiles — the
            // paper publishes NO % cutoffs, so these bands are OUR disclosed
            // translation via the Deurenberg 1991 BF%-BMI equation at the UK
            // Biobank mean age (56 y): BF% at BMI 18.5/25/30/35 ≈ 30/37/43/49
            // (women), 19/27/33/39 (men). Returns the band INDEX (Duncan
            // paCategory pattern).
            {
              id: 'adip', label: 'Adiposity',
              fn: (v, r) => {
                if (v.bodyFatOn) {
                  const bf = r('bodyFat');
                  if (typeof bf !== 'number' || !isFinite(bf)) return 0;
                  const c = v.sex === 'female' ? [30, 37, 43, 49] : [19, 27, 33, 39];
                  const idx = c.findIndex((x) => bf <= x);
                  return idx < 0 ? 3 : idx;
                }
                const bmi = r('bmi');
                if (typeof bmi !== 'number' || !isFinite(bmi)) return 0;
                if (bmi < 18.5) return 0;
                if (bmi < 25) return 0;
                if (bmi < 30) return 1;
                if (bmi < 35) return 2;
                return 3;
              },
              bands: [
                { max: 0, label: 'Normal' },
                { max: 1, label: 'Overweight' },
                { max: 2, label: 'Obese I' },
                { max: 3, label: 'Obese II+' },
              ],
            },
          ],
          // Rows = PA group in BAND order (G3, G2, G1 — NOT the paper's
          // display order), cols = adiposity bands normal-first (normal /
          // overweight / obese I / ≥35 for BMI; low / med-low / med-high /
          // high for BF) so the ratio's referent col = 0. Published Model 3
          // cells used directly, NO interpolation (both axes are discrete
          // study categories — Duncan precedent). `ratio {axis: 1,
          // referent: 0}` divides by the normal column: the PA-row main
          // effect divides away (Ekelund's PA axis owns PA on mortality;
          // the cardio+steps marginals own it on cancer/cvd) and what
          // survives is the published PA×adiposity interaction
          // (attenuation: BF high 1.54 → 1.24 from G3 to G1; BMI ≥35 flat
          // 1.52 → 1.45). At defaults (G2, overweight) the ratio reads
          // 1.02/1.07 = 0.9533 — below 1.0 because the normal-weight G2
          // cell (1.07) is itself elevated (overweight-paradox artifact,
          // see note). `calibrate: true` anchors the table so the cluster
          // total at defaults equals the members' marginal product (the
          // bmi marginal ≈1.20; the ratio 0.9533 is ~26% off — Ekelund
          // anchor rule). CI for the referent cell: no published CI (1.00
          // used as-is — the ratio's CI then adds only the numerator's
          // sigma; slight understatement, disclosed, Duncan precedent).
          grids: {
            bmi: [
              [{ hr: 1.22, hrLow: 1.07, hrHigh: 1.38 }, { hr: 1.12, hrLow: 1.00, hrHigh: 1.24 }, { hr: 1.38, hrLow: 1.22, hrHigh: 1.56 }, { hr: 1.52, hrLow: 1.30, hrHigh: 1.78 }],
              [{ hr: 1.07, hrLow: 0.96, hrHigh: 1.18 }, { hr: 1.02, hrLow: 0.93, hrHigh: 1.11 }, { hr: 1.09, hrLow: 0.97, hrHigh: 1.23 }, { hr: 1.43, hrLow: 1.21, hrHigh: 1.67 }],
              [{ hr: 1.00, hrLow: 1.00, hrHigh: 1.00 }, { hr: 1.00, hrLow: 0.90, hrHigh: 1.10 }, { hr: 1.15, hrLow: 1.02, hrHigh: 1.29 }, { hr: 1.45, hrLow: 1.21, hrHigh: 1.73 }],
            ],
            bodyFat: [
              [{ hr: 1.11, hrLow: 0.96, hrHigh: 1.28 }, { hr: 1.13, hrLow: 1.01, hrHigh: 1.25 }, { hr: 1.38, hrLow: 1.22, hrHigh: 1.55 }, { hr: 1.54, hrLow: 1.33, hrHigh: 1.79 }],
              [{ hr: 1.05, hrLow: 0.94, hrHigh: 1.16 }, { hr: 1.01, hrLow: 0.92, hrHigh: 1.11 }, { hr: 1.13, hrLow: 1.01, hrHigh: 1.26 }, { hr: 1.36, hrLow: 1.17, hrHigh: 1.59 }],
              [{ hr: 1.00, hrLow: 1.00, hrHigh: 1.00 }, { hr: 1.02, hrLow: 0.93, hrHigh: 1.12 }, { hr: 1.12, hrLow: 0.99, hrHigh: 1.25 }, { hr: 1.24, hrLow: 1.04, hrHigh: 1.49 }],
            ],
          },
          gridForAxis: function (r, v) { return this.grids[v.bodyFatOn ? 'bodyFat' : 'bmi']; },
          ratio: { axis: 1, referent: 0 },
        },
        cvd: {
          // Same axis order as mortality: axis 0 = PA (grid ROWS), axis 1 =
          // adiposity (grid COLUMNS; ratio referent = normal col 0).
          axes: [
            { id: 'pa', label: 'PA', unit: 'MET-min/wk', inputs: ['cardio', 'steps'], coeffs: [4, 0.21], bands: [{ max: 150, label: 'G3' }, { max: 1800, label: 'G2' }, { max: Infinity, label: 'G1' }] },
            {
              id: 'adip', label: 'Adiposity',
              fn: (v, r) => {
                if (v.bodyFatOn) {
                  const bf = r('bodyFat');
                  if (typeof bf !== 'number' || !isFinite(bf)) return 0;
                  const c = v.sex === 'female' ? [30, 37, 43, 49] : [19, 27, 33, 39];
                  const idx = c.findIndex((x) => bf <= x);
                  return idx < 0 ? 3 : idx;
                }
                const bmi = r('bmi');
                if (typeof bmi !== 'number' || !isFinite(bmi)) return 0;
                if (bmi < 18.5) return 0;
                if (bmi < 25) return 0;
                if (bmi < 30) return 1;
                if (bmi < 35) return 2;
                return 3;
              },
              bands: [
                { max: 0, label: 'Normal' },
                { max: 1, label: 'Overweight' },
                { max: 2, label: 'Obese I' },
                { max: 3, label: 'Obese II+' },
              ],
            },
          ],
          // CVD-MORTALITY cells (supp Table 9, Model 3, Fine–Gray
          // competing-risk subdistribution HRs — stated on the card). Note
          // the real 0.89 anomaly: normal-weight G2 (0.89 [0.68–1.15] < REF)
          // is driven by sparse CVD deaths (n=128 in the ref cell) —
          // transcribed as published, disclosed. `ratio` + `calibrate`
          // identical to mortality (the bmi CVD marginal ≈1.25 at defaults
          // anchors the table).
          grids: {
            bmi: [
              [{ hr: 1.31, hrLow: 0.97, hrHigh: 1.78 }, { hr: 1.10, hrLow: 0.85, hrHigh: 1.42 }, { hr: 1.71, hrLow: 1.30, hrHigh: 2.24 }, { hr: 1.55, hrLow: 1.08, hrHigh: 2.23 }],
              [{ hr: 0.89, hrLow: 0.68, hrHigh: 1.15 }, { hr: 0.99, hrLow: 0.79, hrHigh: 1.23 }, { hr: 1.12, hrLow: 0.86, hrHigh: 1.48 }, { hr: 1.99, hrLow: 1.44, hrHigh: 2.76 }],
              [{ hr: 1.00, hrLow: 1.00, hrHigh: 1.00 }, { hr: 1.03, hrLow: 0.83, hrHigh: 1.29 }, { hr: 1.15, hrLow: 0.87, hrHigh: 1.51 }, { hr: 1.37, hrLow: 0.90, hrHigh: 2.06 }],
            ],
            bodyFat: [
              [{ hr: 1.20, hrLow: 0.85, hrHigh: 1.68 }, { hr: 1.24, hrLow: 0.96, hrHigh: 1.59 }, { hr: 1.30, hrLow: 0.97, hrHigh: 1.72 }, { hr: 1.58, hrLow: 1.13, hrHigh: 2.21 }],
              [{ hr: 1.00, hrLow: 0.77, hrHigh: 1.30 }, { hr: 0.88, hrLow: 0.70, hrHigh: 1.10 }, { hr: 1.12, hrLow: 0.86, hrHigh: 1.45 }, { hr: 1.71, hrLow: 1.24, hrHigh: 2.36 }],
              [{ hr: 1.00, hrLow: 1.00, hrHigh: 1.00 }, { hr: 1.03, hrLow: 0.83, hrHigh: 1.29 }, { hr: 1.01, hrLow: 0.76, hrHigh: 1.34 }, { hr: 1.20, hrLow: 0.80, hrHigh: 1.81 }],
            ],
          },
          gridForAxis: function (r, v) { return this.grids[v.bodyFatOn ? 'bodyFat' : 'bmi']; },
          ratio: { axis: 1, referent: 0 },
        },
        cancer: {
          // Same axis order as mortality: axis 0 = PA (grid ROWS), axis 1 =
          // adiposity (grid COLUMNS; ratio referent = normal col 0).
          axes: [
            { id: 'pa', label: 'PA', unit: 'MET-min/wk', inputs: ['cardio', 'steps'], coeffs: [4, 0.21], bands: [{ max: 150, label: 'G3' }, { max: 1800, label: 'G2' }, { max: Infinity, label: 'G1' }] },
            {
              id: 'adip', label: 'Adiposity',
              fn: (v, r) => {
                if (v.bodyFatOn) {
                  const bf = r('bodyFat');
                  if (typeof bf !== 'number' || !isFinite(bf)) return 0;
                  const c = v.sex === 'female' ? [30, 37, 43, 49] : [19, 27, 33, 39];
                  const idx = c.findIndex((x) => bf <= x);
                  return idx < 0 ? 3 : idx;
                }
                const bmi = r('bmi');
                if (typeof bmi !== 'number' || !isFinite(bmi)) return 0;
                if (bmi < 18.5) return 0;
                if (bmi < 25) return 0;
                if (bmi < 30) return 1;
                if (bmi < 35) return 2;
                return 3;
              },
              bands: [
                { max: 0, label: 'Normal' },
                { max: 1, label: 'Overweight' },
                { max: 2, label: 'Obese I' },
                { max: 3, label: 'Obese II+' },
              ],
            },
          ],
          // CANCER-MORTALITY cells (supp Table 10, Model 3, Fine–Gray
          // competing-risk subdistribution HRs). Flatter than all-cause; the
          // ≥35 row carries the published gradient (1.57 G1 → 1.48 G3).
          // `ratio` + `calibrate`: no bmi/bodyFat cancer marginal exists, so
          // the members' product at defaults is 1.0 and the calibration
          // anchors the table to exactly 1.0 at defaults (the old
          // no-data-free product).
          grids: {
            bmi: [
              [{ hr: 1.12, hrLow: 0.94, hrHigh: 1.32 }, { hr: 1.20, hrLow: 1.05, hrHigh: 1.38 }, { hr: 1.30, hrLow: 1.10, hrHigh: 1.54 }, { hr: 1.48, hrLow: 1.19, hrHigh: 1.84 }],
              [{ hr: 1.10, hrLow: 0.97, hrHigh: 1.24 }, { hr: 1.09, hrLow: 0.97, hrHigh: 1.22 }, { hr: 1.21, hrLow: 1.04, hrHigh: 1.40 }, { hr: 1.30, hrLow: 1.05, hrHigh: 1.63 }],
              [{ hr: 1.00, hrLow: 1.00, hrHigh: 1.00 }, { hr: 1.07, hrLow: 0.95, hrHigh: 1.20 }, { hr: 1.29, hrLow: 1.11, hrHigh: 1.49 }, { hr: 1.57, hrLow: 1.25, hrHigh: 1.97 }],
            ],
            bodyFat: [
              [{ hr: 1.01, hrLow: 0.84, hrHigh: 1.21 }, { hr: 1.13, hrLow: 0.99, hrHigh: 1.30 }, { hr: 1.43, hrLow: 1.23, hrHigh: 1.68 }, { hr: 1.45, hrLow: 1.18, hrHigh: 1.78 }],
              [{ hr: 1.03, hrLow: 0.91, hrHigh: 1.18 }, { hr: 1.10, hrLow: 0.98, hrHigh: 1.23 }, { hr: 1.21, hrLow: 1.04, hrHigh: 1.39 }, { hr: 1.25, hrLow: 1.02, hrHigh: 1.54 }],
              [{ hr: 1.00, hrLow: 1.00, hrHigh: 1.00 }, { hr: 1.07, hrLow: 0.95, hrHigh: 1.20 }, { hr: 1.27, hrLow: 1.09, hrHigh: 1.47 }, { hr: 1.31, hrLow: 1.04, hrHigh: 1.65 }],
            ],
          },
          gridForAxis: function (r, v) { return this.grids[v.bodyFatOn ? 'bodyFat' : 'bmi']; },
          ratio: { axis: 1, referent: 0 },
        },
      },
      note: "Sanchez-Lastra 2021 (Mayo Clin Proc 96:105–19, UK Biobank n=295,917, 6,684 deaths): joint PA×adiposity tables (Model 3). RATIO MODE: total = cell(PA, adiposity) / cell(PA, normal) — the PA-row main effect divides away because the movement cluster's Ekelund PA axis owns PA on mortality (and the cardio+steps marginals on cancer/CVD, where Ekelund has no coverage); what survives is the published PA×adiposity INTERACTION (high PA attenuates high-adiposity risk but does not eliminate it; at BMI ≥35 no attenuation: G1 1.45 vs G3 1.52). RANK-PRESERVING PA AXIS (disclosed): the paper's G1/G2/G3 are UK Biobank self-reported MET-min/wk quintiles (medians ≈2,800–3,700 / ≈925–2,230 / ≈340–490) — we do NOT reuse those medians; the axis maps cardio+steps onto the Ekelund quartile cutoffs (G3 ≤150 / G2 ≤1800 / G1 >1800 MET-min/wk) so both tables stay on the same PA scale. UKB overreports PA, so a given slider value lands in a higher activity group than the paper's median would suggest. `calibrate: true` (Ekelund anchor rule): at defaults (G2, overweight) the ratio reads 1.02/1.07 = 0.9533, the members' marginal product is the bmi marginal ≈1.20 (bodyFat gated off) — ~26% off, so a constant log-space offset anchors the cluster total to the members' product at defaults (it cancels in the page's evaluate() normalization anyway). OVERWEIGHT-PARADOX ARTIFACT (disclose, never 'protect'): the normal-weight cells (G3 1.22, G2 1.07) are elevated by reverse causality + smoking; the never-smoker restriction (supp Table 6, n=168,654) attenuates to NS — so the ratio can read <1 for overweight at low PA (G3×overweight 1.12/1.22 = 0.92), a source artifact, not a protective claim. UNDERWEIGHT: BMI <18.5 was EXCLUDED from the study, so underweight maps into the normal-weight row (the Di Angelantonio left arm is lost — disclosed, finding). BODY-FAT MODE: the BF rows are the study's sex-specific distribution-matched quartiles; NO % cutoffs are published, so the axis uses our disclosed translation via the Deurenberg 1991 equation at the UK Biobank mean age (56 y): BF% ≈ 30/37/43/49 (women), 19/27/33/39 (men) at BMI 18.5/25/30/35 — our translation, not the paper's. CVD and cancer tables are Fine–Gray COMPETING-RISK subdistribution HRs (mortality = Cox); the CVD 0.89 normal-weight-G2 anomaly is real (sparse deaths, n=128 in ref cell) and transcribed as-is. No significant multiplicative interactions in the study (P>0.18) — cells used directly, NO interpolation (discrete study categories). Diet pattern IS adjusted in Model 3 → ρ(mayoCells, dietScore) ≈ 0, no new overlap pair. Referent cell CI: not published (1.00 used as-is — the ratio's CI adds only the numerator's sigma; slight understatement, Duncan precedent).",
    },
];


  if (typeof module !== 'undefined' && module.exports) module.exports = jointModels;
  if (root) root.HEALTH_JOINT_MODELS = jointModels;
})(typeof self !== 'undefined' ? self : globalThis);
