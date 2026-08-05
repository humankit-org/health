/*
 * overlaps.js — the conflation rho pairs (input<->input / cluster<->input)
 *
 * Part of the assembled ADVANCED model — see js/joint/index.js; the
 * base SIMPLE model lives in js/factors.js.
 *
 * Dual export (same pattern as factors.js/schema.js/engine.js):
 *   CommonJS  module.exports
 *   browser   globalThis.HEALTH_OVERLAPS  (<script> loaded before js/joint/index.js)
 */
(function (root) {
  'use strict';

  // --------------------------------------------------- Overlap pairs (ρ)
  // Residual correlations between inputs whose marginal effects were NOT
  // mutually adjusted in their primary sources (verified in PLAN.md §1.12
  // and §1.14). When both members of a pair are active on the same output,
  // the engine (Phase 2) discounts the weaker effect in log space by `rho`
  // and widens the combined uncertainty by the covariance term
  // 2·rhoU·σᵢ·σⱼ. rho = 0 reproduces today's plain multiplication.
  //
  // Schema (documented; this array is EMPTY until Phase 3 populates it —
  // the verified values live in PLAN.md §1.12/§1.14 until then):
  //   {
  //     a:       string,           // input id (first member) — may also be a
  //                                 //   joint-model id (Phase 3): the pair
  //                                 //   then prices the input against the
  //                                 //   cluster total, not the input alone
  //     b:       string,           // input id (second member), same rule
  //     rho:     number,           // 0..1 — input-correlation point estimate
  //                                 //   (magnitude; sign recorded in `note`)
  //     rhoU:    number,           // 0..1 — uncertainty half-width used in
  //                                 //   the covariance term (2·rhoU·σᵢ·σⱼ)
  //     kind:    'shared-pathway'|'residual-confounding'|'mediator',
  //     tier:    'high'|'moderate'|'low',  // evidence tier of rho itself
  //     note:    string,           // direction of the input correlation +
  //                                 //   what the source actually found
  //     source:  string|string[],  // keys into `sources` below
  //   }

const overlaps = [
    {
      // Harmful foods vs the diet score (PLAN §1.4): same intake channel —
      // people who eat more processed meat / drink more SSBs eat fewer
      // score foods. Pan 2012 and Malik 2019 already adjust for whole
      // grains/fruit/veg, so the HRs are not double-charged statistically;
      // the pair prices the residual intake correlation.
      a: 'processedMeat',
      b: 'dietScore', // joint-model id: pair vs the cluster total
      rho: 0.3,
      rhoU: 0.15,
      kind: 'residual-confounding',
      tier: 'moderate',
      note: 'Processed meat ↔ diet score. Pan 2012 adjusts for whole grains/fruit/veg; substitution estimates bound the residual correlation at 10–22%. rhoU = 0.5·rho convention (§3.1).',
      source: ['pan2012'],
    },
    {
      a: 'ssb',
      b: 'dietScore',
      rho: 0.15,
      rhoU: 0.075,
      kind: 'residual-confounding',
      tier: 'moderate',
      note: 'SSB ↔ diet score. Malik 2019 adjusts for whole grains/fruit/veg/BMI and reports no SSB×diet-quality interaction (P > .10), so the residual correlation is small. rhoU = 0.5·rho convention.',
      source: ['malik2019'],
    },
    {
      a: 'magnesium',
      b: 'dietScore',
      rho: 0.5,
      rhoU: 0.25,
      kind: 'shared-pathway',
      tier: 'moderate',
      note: 'Magnesium ↔ diet score: Mg food sources ARE the score foods (nuts, legumes, whole grains, vegetables) — same-pathway overlap, so the marginal HR is largely pre-billed by the score. rhoU = 0.5·rho convention.',
      source: ['fang2016'],
    },
    {
      // Cluster↔cluster pair (Phase 3.2): sleep's marginal is RETIRED into
      // duncanCells, so blending the marginal would discount a number that
      // is not in the model — the pair prices the sleep-cells total against
      // the diet total instead.
      a: 'duncanCells',
      b: 'dietScore',
      rho: 0.10,
      rhoU: 0.05,
      kind: 'residual-confounding',
      tier: 'low',
      note: 'Duncan cells ↔ diet score. Duncan 2023 explicitly does NOT adjust for diet (stated limitation) — the sleep cells partially absorb diet correlation, so the sleep-cell contribution gets a modest discount. rhoU = 0.5·rho convention.',
      source: ['duncan2023'],
    },
    {
      // Cluster-facing pair (Phase 3.2): the old rhr↔cardio pair (ρ 0.20,
      // verified) cannot exist as written — cardio is cluster-owned. The
      // cluster total includes steps+sitting too, which dilutes the shared
      // pathway, hence the discount from 0.20 to 0.15.
      a: 'rhr',
      b: 'ekelundTable',
      rho: 0.15,
      rhoU: 0.075,
      kind: 'shared-pathway',
      tier: 'low',
      note: 'Resting heart rate ↔ Ekelund PA×sitting cluster: the retired rhr↔cardio pair (ρ 0.20), rewritten against the cluster total and discounted to 0.15 because the total also carries steps+sitting. The engine discounts whichever side is weaker — at typical active values the input side (rhr) is the weaker one and gets the discount (e.g. 1.29 → 1.24); when the cluster total itself is weak (near 1.0) the small discount lands on the cluster side. rhoU = 0.5·rho convention.',
      source: ['aune2017rhr'],
    },
    {
      a: 'sunExposure',
      b: 'ekelundTable',
      rho: 0.10,
      rhoU: 0.05,
      kind: 'shared-pathway',
      tier: 'low',
      note: 'Sun exposure ↔ Ekelund PA×sitting cluster: absorbs the retired sun↔steps pair — steps contribute ~40% of the default PA axis — so no separate sun↔steps pair exists. Small, honest discount on whichever side is weaker. rhoU = 0.5·rho convention.',
      source: ['adventist2025', 'stevenson2024'],
    },
    {
      // PLAN §1.12 / §3.4: substance mutual-adjustment verification. Two
      // failing pairs only — everything else in the category is honestly
      // multiplied. Both pairs are silent at defaults (snus 'no', vaping
      // 'never', alcohol 2.5 → all HR 1.0).
      a: 'snus',
      b: 'alcohol',
      rho: 0.15,
      rhoU: 0.10,
      kind: 'residual-confounding',
      tier: 'moderate',
      note: 'Snus ↔ alcohol (PLAN §1.12): byhamre2021 main aHRs adjust for attained age + BMI ONLY — alcohol not in the main model. Sensitivity (+education +alcohol +physical activity) "yielded similar results", so the double count is real but small. Engine discounts whichever side is weaker per output. rhoU = 0.5·rho convention.',
      source: ['byhamre2021'],
    },
    {
      a: 'vaping',
      b: 'alcohol',
      rho: 0.10,
      rhoU: 0.05,
      kind: 'unmeasured-confounding',
      tier: 'low',
      note: 'Vaping ↔ alcohol (PLAN §1.12): PATH collects no alcohol data — unmeasured confounder. Numerically moot while the vaping CVD estimate is a null (HR 1.00 [0.69–1.45]): a 1.0 HR raised to (1−ρ) is still 1.0, so the blend is a no-op today; kept for honest structure, activates automatically if a future vaping HR turns non-null. rhoU = 0.5·rho convention.',
      source: ['berlowitz2022'],
    },
];


  if (typeof module !== 'undefined' && module.exports) module.exports = overlaps;
  if (root) root.HEALTH_OVERLAPS = overlaps;
})(typeof self !== 'undefined' ? self : globalThis);
