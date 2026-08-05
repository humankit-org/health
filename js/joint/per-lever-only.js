/*
 * per-lever-only.js — psychosocial levers shown individually, never summed
 *
 * Part of the assembled ADVANCED model — see js/joint/index.js; the
 * base SIMPLE model lives in js/factors.js.
 *
 * Dual export (same pattern as factors.js/schema.js/engine.js):
 *   CommonJS  module.exports
 *   browser   globalThis.HEALTH_PER_LEVER_ONLY  (<script> loaded before js/joint/index.js)
 */
(function (root) {
  'use strict';

  // ---------------------------------------- Per-lever-only clusters (Phase 3)
  // Cluster keys whose combined HR must NOT be computed at all — no joint
  // model exists and the pairwise correlations are too entangled to model
  // (e.g. psychosocial: purpose↔stress↔social triangle). Their contributions
  // are shown individually with a conflation label; they never enter the
  // total product (engine sets `perLever: true` on their contribution
  // records). Populated by Phase 3.5.
  //
  // Schema (documented; entries are objects so members can be declared):
  //   {
  //     cluster: string,            // cluster key (e.g. 'psychosocial')
  //     members: string[],          // input ids shown individually
  //   }
  //
  // psychosocial (PLAN §1.11/§1.14): NO joint purpose×stress×social×
  // sleepReg mortality model exists — the per-lever-only landing is the fix
  // (structural, not ρ, so the purpose↔stress↔social triangle cannot
  // double-discount). The four sliders stop entering the mortality/cancer/
  // cvd products entirely; their happiness/cognition POINTS still
  // accumulate (points outputs have no accumulator entry). sleepReg loses
  // its marginal HR; sleep duration stays in the duncanCells joint model;
  // screenTime is already mind-only (happiness-only) by design. See PLAN
  // map at line ~850, "§3.5 implementation notes".

const perLeverOnly = [
    {
      cluster: 'psychosocial',
      members: ['purpose', 'stress', 'social', 'sleepRegularity'],
    },
];


  if (typeof module !== 'undefined' && module.exports) module.exports = perLeverOnly;
  if (root) root.HEALTH_PER_LEVER_ONLY = perLeverOnly;
})(typeof self !== 'undefined' ? self : globalThis);
