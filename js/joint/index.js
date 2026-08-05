/*
 * js/joint/index.js — assembles the ADVANCED `HEALTH_MODEL` from the base
 * SIMPLE model (js/factors.js) plus the conflation layer in this folder
 * (joint-models.js, overlaps.js, per-lever-only.js, joint-sources.js,
 * findings.js).
 *
 * Two-mode architecture (see PLAN.md Phase 7):
 *   - js/factors.js         = the base SIMPLE model (no conflation structures).
 *   - js/joint/index.js     = the assembled ADVANCED model, which is what both
 *                             pages actually run (browser default).
 *   - SIMPLE_HEALTH_MODEL   = the base object, re-exported here for the
 *                             Simple/Advanced toggle (Phase 5.5).
 *
 * The engine stays a superset: with the conflation arrays present it applies
 * joint estimates / rho blends / per-lever exclusion; a model without them
 * (SIMPLE) degrades to byte-identical plain marginal multiplication.
 *
 * Object identity: the assembled model is a NEW top-level object (engine
 * caches `calibrateCache`/`_avgCache` by model object). Nested inputs/sources
 * are shared read-only references with the base — never mutate them.
 *
 * Dual export (same pattern as factors.js/schema.js/engine.js):
 *   CommonJS  module.exports = HEALTH_MODEL
 *             module.exports.SIMPLE_HEALTH_MODEL = base
 *   browser   globalThis.HEALTH_MODEL         (advanced, default)
 *             globalThis.SIMPLE_HEALTH_MODEL  (base/simple)
 *
 * Script load order on both pages: factors.js → schema.js → engine.js →
 * joint-models.js → overlaps.js → per-lever-only.js → joint-sources.js →
 * findings.js → index.js → app.js (or sources.js).
 */

(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const base = isNode ? require('../factors.js') : root.SIMPLE_HEALTH_MODEL;
  const jointModels = isNode ? require('./joint-models.js') : root.HEALTH_JOINT_MODELS;
  const overlaps = isNode ? require('./overlaps.js') : root.HEALTH_OVERLAPS;
  const perLeverOnly = isNode ? require('./per-lever-only.js') : root.HEALTH_PER_LEVER_ONLY;
  const jointSources = isNode ? require('./joint-sources.js') : root.HEALTH_JOINT_SOURCES;
  const jointFindings = isNode ? require('./findings.js') : root.HEALTH_JOINT_FINDINGS;

  // findings/sources are the only base fields the joint layer extends: the
  // two cluster-referencing findings append AFTER the base findings (keeping
  // sourceIndex/sourceTags walk-order identical to the pre-split monolith),
  // and the 5 joint-only source keys merge into the citation map.
  const HEALTH_MODEL = Object.assign({}, base, {
    jointModels: jointModels,
    overlaps: overlaps,
    perLeverOnly: perLeverOnly,
    findings: base.findings.concat(jointFindings),
    sources: Object.assign({}, base.sources, jointSources),
    meta: Object.assign({}, base.meta, { version: '0.2.0', updated: '2026-08-05' }),
  });

  if (isNode) {
    module.exports = HEALTH_MODEL;
    // Non-enumerable so the assembled model object stays clean (a plain
    // `module.exports.SIMPLE_HEALTH_MODEL = base` would add an enumerable
    // key to HEALTH_MODEL itself).
    Object.defineProperty(module.exports, 'SIMPLE_HEALTH_MODEL', { value: base, enumerable: false });
  }
  if (root) {
    root.HEALTH_MODEL = HEALTH_MODEL;
    root.SIMPLE_HEALTH_MODEL = base;
  }
})(typeof self !== 'undefined' ? self : globalThis);
