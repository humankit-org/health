/*
 * schema.js — the conflation schema/API, read by agents and every other JS
 * file. Holds the things the rest of the codebase (and AI agents) must agree
 * on but that are NOT numbers:
 *
 *   OUTPUTS            the fixed, ordered list of output ids (mortality,
 *                      cancer, cvd, cognition, happiness)
 *   conflationGroups   one walk over jointModels + overlaps + perLeverOnly
 *                      -> ownership/grouping maps (shared by engine + pages)
 *   shortLabel/esc     display helpers (dropping parentheticals, escaping)
 *   displayName        input OR joint-model id -> readable title
 *   auditModel         read-only structural validator (tests/audit.js hosts
 *                      the standalone runner)
 *
 * Dual-export pattern like factors.js/engine.js: sets `globalThis.HEALTH_SCHEMA`
 * for the browser and `module.exports` for node. Load AFTER factors.js and
 * BEFORE engine.js/app.js/sources.js on both pages.
 *
 * THE CONFLATION SCHEMA (the machine-readable data model — see PLAN.md for
 * the full derivation and history; this is the authoritative short form).
 *
 * The conflation problem: several inputs share causal pathways (cardio +
 * strength + steps + sitting are all "physical activity"; fiber + fruit/veg +
 * nuts + fish are all "diet"). Multiplying each input's marginal hazard ratio
 * double-counts shared risk. The model resolves this with three top-level
 * structures in factors.js:
 *
 *   jointModels: [ { id, title, cluster, members, model, evidence, source,
 *                    outputs, calibrate? } ]
 *     A joint model OWNS a cluster: its lookup computes the cluster total per
 *     HR output, REPLACING the members' marginal product. `members` are the
 *     input ids whose marginals the joint estimate replaces; `outputs`
 *     declares coverage per output id (outputs without coverage fall back to
 *     the members' marginal product). `model` is one of:
 *       'score' -> { components:[{input,max,weight,valueOf?}],
 *                    gradient:[{max,hr,hrLow,hrHigh}] }   (PURE-style diet
 *                    score; score = Σ weight·clamp(value/max,0,1); HR via the
 *                    same step walk as input `steps`; per-input partialCredit
 *                    = weight·fraction for the UI)
 *       'table'/'cells' -> { axes:[{id,label,unit, inputs:[ids], coeffs:[..],
 *                    fn?, bands:[{max,label}]}], grid|grids, ratio?, ... }
 *                    (Ekelund PA×sitting, Momma aerobic×strength, Duncan
 *                    PA×sleep, Mayo PA×adiposity; axis value = Σ coeffᵢ·inputᵢ
 *                    banded by `max` cutoffs, grid indexed by band index;
 *                    `fn` axes are data-driven categorical axes; `ratio` lets
 *                    the total contribute only the referent axis's main
 *                    effect; `calibrate:true` shifts the lookup so the total
 *                    at the AVERAGE profile equals the owned members' marginal
 *                    product exactly — the 1.0× anchoring rule).
 *     Ownership rule: an input's HR is counted by at most ONE joint model —
 *     the FIRST entry whose `members` include it (array order decides).
 *     Derived pseudo-inputs (`bmi`, `bodyFat`) can appear in `members` too.
 *
 *   overlaps: [ { a, b, rho, rhoU?, source, note, tier?, kind? } ]
 *     Input↔input / cluster↔input pairs whose effects overlap. When BOTH
 *     members are active on an output, the WEAKER (smaller |log HR|) is
 *     discounted in log space by `rho` (logHR → logHR·(1−ρ)); the record
 *     carries `overlapBlend: {pair, rho}` for the UI. `rhoU` is the
 *     uncertainty correlation used by the covariance term (2·rhoU·σᵢ·σⱼ,
 *     added to the output's quadrature sigma²). `a`/`b` may be input ids OR
 *     joint-model ids (a pair naming a cluster discounts the cluster total).
 *     Pairs whose members are BOTH owned by one joint model are removed from
 *     `overlaps` (the joint estimate already handles that redundancy).
 *
 *   perLeverOnly: [ { cluster, members } ]
 *     Clusters whose HRs cannot be combined yet (psychosocial factors); their
 *     members are EXCLUDED from the total product and shown per-slider only
 *     (contribution records get `perLever: true`).
 *
 * Engine behavior this drives: HRs combine multiplicatively (independence
 * assumption, stated on the page) then clamp to [hrFloor, hrCeiling]; the
 * blended point estimate is used for the display while CIs combine in
 * quadrature around the clamped central value. outputs/lookups never invent
 * coefficients — every number cites its source in factors.js.
 */

(function (root, factory) {
  const schema = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = schema;
  root.HEALTH_SCHEMA = schema;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const HR_OUTPUTS = ['mortality', 'cancer', 'cvd'];
  const POINTS_OUTPUTS = ['cognition', 'happiness'];

  // The FULL ordered list of output ids, used by the DOM/copy layers
  // (app.js, sources.js) and by the engine's own contributions object keys.
  // PRESERVE THIS ORDER — sourceIndex/clusterTotals and per-output gaps rely
  // on it; do NOT sort. HR_OUTPUTS/POINTS_OUTPUTS above are the subsets the
  // accumulate loops actually key on.
  const OUTPUTS = HR_OUTPUTS.concat(POINTS_OUTPUTS);

  // --------------------------------------------------------- display helpers
  // Single source for the label helpers the pages used to redefine locally
  // (C1 de-dup): shortLabel (drops parentheticals), esc (HTML-escape), and
  // displayName (input OR joint-model id -> readable title, with the same
  // fallbacks the two pages used).
  function shortLabel(s) {
    const stripped = String(s || '').replace(/\(.*?\)/g, '').trim();
    return stripped || s;
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  }
  function displayName(model, id) {
    const input = model.inputs.find((i) => i.id === id);
    if (input) return shortLabel(input.label);
    if (id === 'bmi' && model.bmi && model.bmi.label) return shortLabel(model.bmi.label);
    const jm = (model.jointModels || []).find((j) => j.id === id);
    if (jm) return jm.title || shortLabel(jm.cluster || jm.id);
    return id;
  }

  // ------------------------------------------------------------ grouping walk
  // Returns:
  //   jmById       Map(jm.id -> jm)
  //   jmForInput   Map(input id -> owning joint model, first members-match)
  //   groups       [{ key, jm?, members }] for every joint model + overlap pair
  //   groupOf      Map(input/cluster id -> first group key that lists it)
  //   perLeverSet  Set of input ids in ANY per-lever-only cluster
  //   perLeverKeys Set of per-lever-only cluster keys
  //   perLeverOf   Map(input id -> per-lever cluster key)
  function conflationGroups(model) {
    const jmById = new Map();
    const jmForInput = new Map();
    for (const jm of model.jointModels || []) {
      jmById.set(jm.id, jm);
      for (const m of jm.members || []) if (!jmForInput.has(m)) jmForInput.set(m, jm);
    }
    const groups = [];
    for (const jm of model.jointModels || []) groups.push({ key: 'jm:' + jm.id, jm, members: jm.members || [] });
    for (const o of model.overlaps || []) groups.push({ key: 'pair:' + o.a + '+' + o.b, members: [o.a, o.b] });
    const groupOf = {};
    for (const g of groups) for (const m of g.members) if (groupOf[m] === undefined) groupOf[m] = g.key;
    const perLeverSet = new Set();
    const perLeverKeys = new Set();
    const perLeverOf = new Map();
    for (const entry of model.perLeverOnly || []) {
      perLeverKeys.add(entry.cluster);
      for (const m of entry.members || []) { perLeverOf.set(m, entry.cluster); perLeverSet.add(m); }
    }
    return { jmById, jmForInput, groups, groupOf, perLeverSet, perLeverKeys, perLeverOf };
  }

  // ------------------------------------------------------------------ audit
  // Read-only STRUCTURAL validator for the conflation data model. Returns an
  // array of { field, message, what } problems (empty = clean). Throws if the
  // model object itself is malformed. Never evaluates the model (no math) and
  // never mutates anything — it only cross-references ids, bands, grids,
  // sources and field shapes. (tests/audit.js hosts the standalone runner.)
  function auditModel(model) {
    if (!model || typeof model !== 'object') throw new Error('model must be an object');
    const problems = [];

    const ids = new Set((model.inputs || []).map((i) => i.id));
    const jmIds = new Set((model.jointModels || []).map((jm) => jm && jm.id));
    // An overlap member may be a real input id OR a live joint-model id.
    const idsOrJm = new Set(ids);
    for (const id of jmIds) idsOrJm.add(id);

    const bad = (field, message, what) => problems.push({ field, message, what });

    // ---- overlapping pairs -------------------------------------------------
    for (const o of model.overlaps || []) {
      const field = 'overlaps';
      if (!o || typeof o !== 'object') { bad(field, 'overlap entry is not an object', o); continue; }
      ['a', 'b'].forEach((side) => {
        if (typeof o[side] !== 'string' || !idsOrJm.has(o[side]))
          bad(field, `member "${o[side]}" is not a real input id or a live joint-model id`, `${o.sideLabel || o.a}↔${o.b}`);
      });
      [['rho', 1], ['rhoU', 1]].forEach(([k, hi]) => {
        const v = o[k];
        if (typeof v !== 'number' || !isFinite(v) || v < 0 || v > hi)
          bad(field, `"${k}" must be a number in [0,${hi}]`, `${o.a}↔${o.b}`);
      });
      if (!o.source || !(typeof o.source === 'string' || Array.isArray(o.source)))
        bad(field, 'must carry a `source` key (string or array of keys)', `${o.a}↔${o.b}`);
      if (!o.note || o.note.length < 10)
        bad(field, 'must carry an explanatory `note`', `${o.a}↔${o.b}`);
    }

    // ---- joint models ------------------------------------------------------
    const outNames = new Set(['mortality', 'cancer', 'cvd', 'cognition', 'happiness']);
    for (const jm of model.jointModels || []) {
      const field = 'jointModels:' + (jm && jm.id);
      if (!jm || typeof jm !== 'object') { bad('jointModels', 'joint model is not an object', jm); continue; }
      if (!jm.id || typeof jm.id !== 'string') bad(field, 'missing string `id`', jm);
      if (!['score', 'table'].includes(jm.model))
        bad(field, '`model` must be "score" or "table"', jm.id);
      // members: real inputs, plus the derived 'bmi' pseudo-input.
      if (!Array.isArray(jm.members) || jm.members.length === 0 ||
          !jm.members.every((m) => ids.has(m) || m === 'bmi'))
        bad(field, '`members` must be a non-empty list of real input ids (bmi allowed as derived)', jm.id);
      // output coverage.
      const outputs = jm.outputs || (jm.lookup ? { mortality: jm.lookup } : null);
      if (!outputs || Object.keys(outputs).length === 0)
        bad(field, 'must declare `outputs` (or `lookup` shorthand)', jm.id);
      for (const [outName, out] of Object.entries(outputs || {})) {
        if (!outNames.has(outName)) bad(field, `output "${outName}" is not a known output`, jm.id);
        verifyOutputShape(field + '.' + outName, out, jm, ids, jmIds, bad);
      }
    }

    // ---- per-lever-only clusters ------------------------------------------
    for (const g of model.perLeverOnly || []) {
      const field = 'perLeverOnly';
      if (!g || typeof g !== 'object') { bad(field, 'entry is not an object', g); continue; }
      if (typeof g.cluster !== 'string') bad(field, 'missing string `cluster`', g);
      if (!Array.isArray(g.members) || !g.members.every((m) => ids.has(m)))
        bad(field, '`members` must all be real input ids', g.cluster);
    }

    // ---- findings + sources keys ------------------------------------------
    for (const f of model.findings || []) {
      const field = 'findings';
      if (!f || typeof f !== 'object') { bad(field, 'finding is not an object', f); continue; }
      if (typeof f.when !== 'function') bad(field, '`when` must be a callable function', f.input);
      if (typeof f.input !== 'string') bad(field, 'missing string `input`', f.input);
      if (!f.source) bad(field, 'missing `source`', f.input);
    }
    for (const key of Object.keys(model.sources || {})) {
      const s = model.sources[key];
      if (!s || typeof s !== 'object') bad('sources', `"${key}" source entry is not an object`, key);
    }

    return problems;
  }

  // Shape-check a single joint-model output block:
  //   score -> { components:[{input,max,weight,valueOf?}], gradient:[{max,hr,hrLow,hrHigh}] }
  //   table  -> { axes:[{id,label,unit?,inputs,coeffs?,bands:[{max,label}]}],
  //               grid (rows of cells {hr,hrLow,hrHigh}) | grids (map of modes) }
  function verifyOutputShape(field, out, jm, ids, jmIds, bad) {
    if (!out || typeof out !== 'object') { bad(field, 'output block is not an object', jm.id); return; }
    if (jm.model === 'score') {
      const comps = out.components || [];
      if (!Array.isArray(comps) || comps.length === 0)
        bad(field, 'score model needs a non-empty `components` list', jm.id);
      for (const c of comps) {
        if (!ids.has(c.input)) bad(field, `component input "${c.input}" is not a real input id`, jm.id);
        if (typeof c.max !== 'number' || !(c.max > 0)) bad(field, `component "${c.input}" needs a positive max`, jm.id);
      }
      const grad = out.gradient || [];
      if (!Array.isArray(grad) || grad.length === 0)
        bad(field, 'score model needs a non-empty `gradient`', jm.id);
      for (const s of grad) {
        if (typeof s.max !== 'number') bad(field, 'gradient step needs a numeric `max`', jm.id);
        if (typeof s.hr !== 'number') bad(field, 'gradient step needs a numeric `hr`', jm.id);
      }
      return;
    }
    // table model
    if (!Array.isArray(out.axes) || out.axes.length === 0)
      bad(field, 'table model needs a non-empty `axes` list', jm.id);
    for (const ax of out.axes || []) {
      if (!ax || typeof ax !== 'object') { bad(field, 'axis is not an object', jm.id); continue; }
      // Two valid axis shapes: a linear one (real input ids -> coeffs) or a
      // data-driven `fn` one (Duncan PA category / Mayo adiposity mode). A
      // fn axis may STILL declare inputs for linear inputs it also reads.
      const hasFn = typeof ax.fn === 'function';
      const axInputs = Array.isArray(ax.inputs) ? ax.inputs : [];
      const okInputs = axInputs.every((p) => ids.has(p) || p === 'bmi' || p === 'bodyFat');
      if (!hasFn && (!Array.isArray(ax.inputs) || ax.inputs.length === 0 || !okInputs))
        bad(field, 'axis needs real-input `inputs` (or a data `fn`)', ax.id);
      if (ax.fn !== undefined && !hasFn)
        bad(field, 'data `fn` axis must be a function', ax.id);
      if (!Array.isArray(ax.bands) || ax.bands.length === 0 ||
          !ax.bands.every((b) => b && typeof b.max === 'number'))
        bad(field, 'axis needs non-empty `bands` with numeric `max` cutoffs', ax.id);
    }
    if (out.grids !== undefined) {
      if (typeof out.grids !== 'object') bad(field, '`grids` must be a map of mode -> grid', jm.id);
      for (const g of Object.values(out.grids)) checkGrid(field, g, bad, jm);
    } else if (out.grid !== undefined) {
      checkGrid(field, out.grid, bad, jm);
    } else {
      bad(field, 'table model must declare `grid` (or `grids`)', jm.id);
    }
    if (out.ratio !== undefined &&
        (!out.ratio || typeof out.ratio.axis !== 'number' || typeof out.ratio.referent !== 'number'))
      bad(field, '`ratio` must be { axis: number, referent: number }', jm.id);
    if (out.calibrate !== undefined && typeof out.calibrate !== 'boolean' && jm !== undefined)
      bad(field, '`calibrate` must be a boolean', jm.id);
  }

  function checkGrid(field, grid, bad, jm) {
    if (!Array.isArray(grid) || grid.length === 0) { bad(field, 'grid must be a non-empty array of rows', jm.id); return; }
    const cols = grid[0].length;
    grid.forEach((row, i) => {
      if (!Array.isArray(row)) { bad(field, 'grid row is not an array', jm.id); return; }
      if (row.length !== cols) bad(field, `grid row ${i} has a different width`, jm.id);
      for (const cell of row) {
        if (cell && typeof cell.hr !== 'number') bad(field, 'grid cell needs a numeric `hr`', jm.id);
      }
    });
  }

  return { HR_OUTPUTS, POINTS_OUTPUTS, OUTPUTS, conflationGroups, shortLabel, esc, displayName, auditModel };
});
