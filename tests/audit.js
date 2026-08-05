/*
 * audit.js — standalone runner for the conflation data-model audit.
 * Run: `node tests/audit.js`
 *
 * The audit itself (auditModel) lives in js/schema.js — it is a read-only
 * STRUCTURAL validator: it cross-references ids, bands, grids, sources and
 * field shapes in js/factors.js against the conflation schema (jointModels /
 * overlaps / perLeverOnly). engine.test.js pins *shipped numbers*; this
 * catches structurally-broken edits with a precise message instead of a
 * confusing number mismatch later.
 *
 * It never evaluates the model (no math) and never mutates anything.
 * Re-exported here so `node tests/audit.js` and tests/engine.test.js
 * ([A3] section, `require('./audit.js')`) both get `{ audit }` without
 * duplicating the validator.
 */

(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.HEALTH_AUDIT = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const { auditModel } = require('../js/schema.js');

  // Run directly: print each problem and exit nonzero on any failure.
  if (typeof require !== 'undefined' && require.main === module) {
    const model = require('../js/factors.js');
    const problems = auditModel(model);
    if (problems.length === 0) {
      console.log('audit.js: model structure OK');
      process.exit(0);
    }
    for (const p of problems) console.error(`FAIL  [${p.field}] ${p.message} — ${p.what}`);
    console.error(`audit.js: ${problems.length} structural problem(s)`);
    process.exit(1);
  }

  return { audit: auditModel };
});
