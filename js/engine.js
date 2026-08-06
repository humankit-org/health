/*
 * engine.js — pure model math. No DOM, no state.
 *
 * Takes the data model (factors.js) plus a map of input values, returns all
 * derived estimates. Kept dependency-free so it can run both in the browser
 * (window.HEALTH_ENGINE) and in node (tests/engine.test.js).
 *
 * Method in one paragraph:
 *   Every input contributes a hazard ratio (HR) for all-cause mortality. HRs
 *   are combined multiplicatively (independence assumption — see methodology
 *   on the page), clamped to sane bounds, and translated into years of life
 *   expectancy via a Gompertz approximation. Mind outputs (cognition,
 *   happiness) accumulate unitless points that map onto qualitative bands.
 *
 * FILE MANIFEST (line numbers approximate — re-grep if they drift)
 * -----------------------------------------------------------------
 * imports:           schema.js (js/schema.js) -> HR_OUTPUTS/POINTS_OUTPUTS/
 *                     OUTPUTS, conflationGroups, shortLabel/esc/displayName.
 *                     Loaded BEFORE this file on both pages (script tag) and
 *                     required here for node.
 * fx builders:        evalEffect:96  evalEffects:438  pick:137  computeBmi:146
 * cluster machinery:  bandIndex:185  indexGrid:190  axisValue:206
 *                     gridForLookup:231  gridTotal:241  ratioTotal:298
 *                     scoreTotal:319  calibrateOffsets:352  shifted:395
 *                     clusterTotalFor:404  makeResolver:410
 * overlap machinery:  effectSide:483  clusterForMember:492  computeJmTotals:503
 *                     blendOverlaps:587 (pure)  applyOverlaps:537 (internal
 *                     mutating core)  activeOverlaps:608
 * endpoints:          boundsEndpoints:629  sigma2:429  widenBound:170
 * accumulate:         accumulateHr:783 (single named accumulate pass — marginal
 *                     product, per-lever exclusion, joint-model replacement,
 *                     covariance, derived BMI effect; returns totals/points/
 *                     jmMeta/bmi)
 * main entry points:  evaluateRaw:961  averageEval:1022  evaluate:1069
 * norm/noData helpers:normHr:1033 (evaluate's shared normalize->clamp->CI
 *                     path)  noDataInputs:1049 (cancer/cvd coverage labels)
 * findings:           evaluateFindings:1178  defaults:1188
 * conflation display: sourceIndex:1208  sourceTags:1228  clusterTotals:1265
 *                     activeJoint:1288
 * exports: bottom of file (alpha, evaluate, evaluateRaw, sourceIndex, …; plus
 *           re-exports of OUTPUTS/conflationGroups/shortLabel/esc/displayName
 *           as aliases to the schema.js objects).
 *
 * THE CENTRAL DATA FLOW (the part new agents struggle with):
 *   evaluateRaw(model, values) runs FOUR passes over the effects:
 *     1. evalEffects       -> fx map (input -> output -> {hr, logHr, sigma2,
 *                                points, record, rdHr/rdPoints})
 *     2. computeJmTotals   -> per-cluster lookup totals (score/grid/ratio)
 *     3. blendOverlaps (pure)  -> deep copies fx + jmTotals, then applies the
 *                                overlap blend to the COPIES. Returns
 *                                { blended, jmTotals, jmBlend, report } so the
 *                                caller holds blended values as a value, not a
 *                                side effect. applyOverlaps (internal) does the
 *                                actual log-space discounting of the weaker
 *                                pair member.
 *     4. accumulateHr       -> routes each input's HR: per-lever (excluded),
 *                                joint-model member (per-cluster product),
 *                                or marginal (multiplies directly). Then
 *                                joint-model totals replace cluster products,
 *                                covariance (2·ρU·σᵢ·σⱼ) is added, the derived
 *                                BMI effect folds in. (bounds wrap in step 5;
 *                                boundsEndpoints independently recomputes the
 *                                assumption-space endpoints.)
 *   A single evaluate() then normalizes raw HRs against the average profile
 *   (defaults) so 1.0× = the average person, and clamps to [hrFloor, hrCeiling].
 *   mutable-shared Maps are computed fresh per evaluate() call and are NOT
 *   reused across calls — treat them as ephemeral.
 */

(function (root, factory) {
  const engine = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = engine;
  root.HEALTH_ENGINE = engine;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  // The conflation schema/API lives in js/schema.js (browser: the <script>
  // tag before this file sets globalThis.HEALTH_SCHEMA; node: require). We
  // destructure the SAME objects schema.js exports, so the output-id lists,
  // grouping walk and display helpers can never drift from the pages that
  // also read them.
  const schema = (typeof module !== 'undefined' && module.exports) ? require('./schema.js') : globalThis.HEALTH_SCHEMA;
  const { HR_OUTPUTS, POINTS_OUTPUTS, OUTPUTS, conflationGroups, shortLabel, esc, displayName } = schema;

  // Gompertz slope: adult mortality hazard doubles every mrrtYears.
  function alpha(model) {
    return Math.LN2 / model.constants.mrrtYears;
  }

  // Sustained hazard ratio -> approximate change in life expectancy (years).
  function hrToYears(model, hr) {
    return -Math.log(hr) / alpha(model);
  }

  // Inverse of hrToYears (used to encode published year-estimates as HRs).
  function yearsToHr(model, years) {
    return Math.exp(-years * alpha(model));
  }

  // Evaluate one effect against one input value -> { hr, hrLow, hrHigh } | { points }
  function evalEffect(effect, value) {
    switch (effect.type) {
      case 'steps': {
        const step = effect.steps.find((s) => value <= s.max);
        if (!step) throw new Error('steps effect has no matching step for value ' + value);
        return pick(step);
      }
      case 'perUnit': {
        const lo = effect.minDose !== undefined ? effect.minDose : 0;
        const hi = effect.capAt !== undefined ? effect.capAt : Infinity;
        const ref = effect.ref !== undefined ? effect.ref : 0;
        const doses = (Math.min(Math.max(value, lo), hi) - ref) / effect.per;
        return {
          hr: Math.pow(effect.hr, doses),
          hrLow: Math.pow(effect.hrLow, doses),
          hrHigh: Math.pow(effect.hrHigh, doses),
        };
      }
      case 'byOption': {
        const entry = effect.byOption[value];
        if (!entry) throw new Error('byOption effect missing option "' + value + '"');
        return pick(entry);
      }
      case 'toggle': {
        const r = {};
        if (effect.hr !== undefined) {
          r.hr = value ? effect.hr : 1;
          r.hrLow = value ? effect.hrLow : 1;
          r.hrHigh = value ? effect.hrHigh : 1;
        }
        if (effect.points !== undefined) r.points = value ? effect.points : 0;
        return r;
      }
      default:
        throw new Error('unknown effect type: ' + effect.type);
    }
  }

  function pick(obj) {
    const out = {};
    if (obj.hr !== undefined) out.hr = obj.hr;
    if (obj.hrLow !== undefined) out.hrLow = obj.hrLow;
    if (obj.hrHigh !== undefined) out.hrHigh = obj.hrHigh;
    if (obj.points !== undefined) out.points = obj.points;
    return out;
  }

  function computeBmi(values) {
    const m = values.heightCm / 100;
    if (!m || m <= 0) return null;
    return values.weightKg / (m * m);
  }

  function lookupSteps(steps, value) {
    return steps.find((s) => value <= s.max);
  }

  function bandFor(model, points) {
    const idx = model.bands.findIndex((b) => points <= b.max);
    return { index: idx, label: model.bands[idx].label };
  }

  function clamp(x, lo, hi) {
    return Math.min(hi, Math.max(lo, x));
  }

  /*
   * Widen one CI bound around the central estimate (log space) by factor w.
   * The less certain the evidence, the wider the range we show — a published
   * 95% CI only captures sampling error, not confounding or our approximations.
   */
  function widenBound(center, bound, w) {
    if (center <= 0 || bound <= 0) return bound;
    return Math.exp(Math.log(center) + (Math.log(bound) - Math.log(center)) * w);
  }

  /* ------------------------------ Cluster dispatch (Phase 2) ------------------------------
   * Three resolution modes per cluster: joint model (lookup replaces the
   * members' marginal product), marginal product (default; today's math),
   * per-lever-only (excluded from the total product; contributions shown
   * individually). With empty `jointModels`/`perLeverOnly` the dispatch is
   * a no-op and every number is byte-identical to the old engine.
   */

  // Band index: first band whose `max` cutoff >= value (-1 above every cutoff;
  // callers clamp to the last band).
  function bandIndex(bands, value) {
    return bands.findIndex((b) => value <= b.max);
  }

  // Walk a nested `grid` by band indices (one index per axis).
  function indexGrid(grid, indices) {
    let node = grid;
    for (const i of indices) {
      if (!node || !node[i]) return null;
      node = node[i];
    }
    return node;
  }

  // Axis value: sum of coeff_i * input_i (axis inputs are read-only), or a
  // data-driven `fn` for categorical axes (Duncan 2023's PA category) —
  // fn(values, resolveValue) returns the axis value; all thresholds live in
  // factors.js. Inputs that are gated off, or whose effect for the OUTPUT is
  // superseded by an enabled advanced input, contribute 0 — so vo2maxOn
  // retires the cardio slider from the Ekelund PA axis (PLAN 3.2 option A)
  // and measured fitness never double-counts.
  function axisValue(axis, resolveValue, values, model, output) {
    if (axis.fn) return axis.fn(values, resolveValue);
    const byId = model && model.inputs ? model.inputs : [];
    let v = 0;
    for (let i = 0; i < (axis.inputs || []).length; i++) {
      const id = axis.inputs[i];
      const input = byId.find((x) => x.id === id);
      if (input && input.gatedBy && !values[input.gatedBy]) continue;
      if (input && input.effects && input.effects.some((e) => e.output === output && e.supersededBy && values[e.supersededBy])) continue;
      const x = resolveValue(id);
      if (typeof x !== 'number' || !isFinite(x)) continue;
      v += (axis.coeffs && axis.coeffs[i] !== undefined ? axis.coeffs[i] : 1) * x;
    }
    return v;
  }

  function lerpLog(a, b, t) {
    return Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * t);
  }

  // Resolved grid for a 'table'/'cells' lookup: a data-driven selector may
  // pick between per-mode grids (mayoCells 3.3 — the BMI and body-fat rows
  // are separate published tables, one grid per adiposity mode). The
  // selector must read the same gates as the axis fn that picked the mode,
  // so the grid always matches the axis bands.
  function gridForLookup(lookup, resolveValue, values) {
    if (typeof lookup.gridForAxis === 'function') return lookup.gridForAxis(resolveValue, values);
    return lookup.grid;
  }

  // 'table'/'cells' lookup: axes -> band indices -> grid cell. With
  // interpolate: true, bilinear on log HR between adjacent band cutoffs
  // (2 axes; values outside every cutoff clamp to the edge cell). With
  // `lookup.ratio` (PLAN 3.2d), the result is divided by the referent cell
  // on `ratio.axis` (see ratioTotal).
  function gridTotal(jm, lookup, resolveValue, values, model, output) {
    const grid = gridForLookup(lookup, resolveValue, values);
    if (!grid) return null;
    const axes = lookup.axes || [];
    const axisVals = axes.map((ax) => axisValue(ax, resolveValue, values, model, output));
    const indices = axes.map((ax, i) => {
      const idx = bandIndex(ax.bands, axisVals[i]);
      return idx < 0 ? Math.max(0, ax.bands.length - 1) : idx;
    });
    let out;
    if (lookup.interpolate && axes.length === 2) {
      const a0 = axes[0], a1 = axes[1];
      const i0 = indices[0], i1 = indices[1];
      const has0 = i0 > 0 && axisVals[0] <= a0.bands[i0].max && a0.bands[i0].max > a0.bands[i0 - 1].max;
      const has1 = i1 > 0 && axisVals[1] <= a1.bands[i1].max && a1.bands[i1].max > a1.bands[i1 - 1].max;
      const d0 = has0 ? a0.bands[i0].max - a0.bands[i0 - 1].max : 0;
      const d1 = has1 ? a1.bands[i1].max - a1.bands[i1 - 1].max : 0;
      const t0 = has0 ? (axisVals[0] - a0.bands[i0 - 1].max) / d0 : 0;
      const t1 = has1 ? (axisVals[1] - a1.bands[i1 - 1].max) / d1 : 0;
      const r0 = has0 ? i0 - 1 : i0;
      const c0 = has1 ? i1 - 1 : i1;
      const field = (f) => {
        const e00 = indexGrid(grid, [r0, c0]);
        const e10 = indexGrid(grid, [r0 + (has0 ? 1 : 0), c0]);
        const e01 = indexGrid(grid, [r0, c0 + (has1 ? 1 : 0)]);
        const e11 = indexGrid(grid, [r0 + (has0 ? 1 : 0), c0 + (has1 ? 1 : 0)]);
        if (!e00 || !e10 || !e01 || !e11 || e00[f] == null || e10[f] == null || e01[f] == null || e11[f] == null) return null;
        return lerpLog(lerpLog(e00[f], e10[f], t0), lerpLog(e01[f], e11[f], t0), t1);
      };
      const hr = field('hr');
      const hrLow = field('hrLow');
      const hrHigh = field('hrHigh');
      if (hr === null) return null;
      out = { hr, hrLow: hrLow === null ? hr : hrLow, hrHigh: hrHigh === null ? hr : hrHigh, axisValues: axisVals };
    } else {
      const cell = indexGrid(grid, indices);
      if (!cell || cell.hr === undefined) return null;
      out = {
        hr: cell.hr,
        hrLow: cell.hrLow !== undefined ? cell.hrLow : cell.hr,
        hrHigh: cell.hrHigh !== undefined ? cell.hrHigh : cell.hr,
        axisValues: axisVals,
      };
    }
    if (lookup.ratio) return ratioTotal(lookup, indices, out, grid);
    return out;
  }

  // 'ratio' table mode (PLAN 3.2d, Duncan 2023): total = cell(PA, sleep) /
  // cell(PA, referentBand). The table contributes only the referent axis's
  // main effect interacted with the other axis; the other axis's row main
  // effect is divided away because a sibling cluster owns it (Ekelund/Momma
  // own PA; Duncan owns sleep). At the referent band the ratio is exactly
  // 1.0, so no calibration offset is needed. CI = quadrature of the two
  // cells' log-space sigmas; the engine's single evidence-wide at the
  // cluster level is equivalent to widening each cell's sigma first (both
  // are linear in the widen factor).
  function ratioTotal(lookup, indices, num, grid) {
    const r = lookup.ratio;
    const denIdx = indices.slice();
    denIdx[r.axis] = r.referent;
    const den = indexGrid(grid, denIdx);
    if (!den || den.hr === undefined) return num;
    const sigma = (e) => (e.hrLow !== undefined && e.hrHigh !== undefined
      ? (Math.log(e.hrHigh) - Math.log(e.hrLow)) / (2 * 1.96)
      : null);
    const sn = sigma(num), sd = sigma(den);
    const hr = num.hr / den.hr;
    if (sn === null || sd === null) return { hr, hrLow: hr, hrHigh: hr, axisValues: num.axisValues };
    const s = Math.sqrt(sn * sn + sd * sd);
    return { hr, hrLow: hr * Math.exp(-1.96 * s), hrHigh: hr * Math.exp(1.96 * s), axisValues: num.axisValues };
  }

  // 'score' lookup: weighted per-input fractions -> gradient step. Each
  // component's `weight * fraction` is its partial credit (UI attribution).
  // Components may carry a `valueOf` map to translate segmented values
  // (e.g. fish: {none:0, some:1, lots:1}); credit sums over duplicate
  // component entries (one slider feeding two components earns both).
  function scoreTotal(jm, lookup, resolveValue) {
    let score = 0;
    const credit = {};
    for (const c of lookup.components || []) {
      let v = resolveValue(c.input);
      if (c.valueOf && v !== undefined && c.valueOf[v] !== undefined) v = c.valueOf[v];
      if (typeof v !== 'number' || !isFinite(v)) continue;
      const fraction = c.max > 0 ? clamp(v, 0, c.max) / c.max : 0;
      const weight = c.weight !== undefined ? c.weight : 1;
      score += weight * fraction;
      credit[c.input] = (credit[c.input] || 0) + weight * fraction;
    }
    const step = lookupSteps(lookup.gradient, score);
    if (!step) return null;
    return {
      hr: step.hr,
      hrLow: step.hrLow !== undefined ? step.hrLow : step.hr,
      hrHigh: step.hrHigh !== undefined ? step.hrHigh : step.hr,
      score, credit,
    };
  }

  // Log-space calibration offsets for joint models with `calibrate: true`
  // (PLAN §3.2): offset[output] = Σ logHR(owned members' marginals at
  // DEFAULTS) − logHR(lookup at DEFAULTS). The lookup result at ANY values
  // is shifted by the offset, so the cluster total at the average profile
  // equals the members' marginal product EXACTLY (calibration rule §2.1)
  // while the lookup's shape and interaction are preserved (a constant
  // shift in log space). Needed when the published table's referent is far
  // from our members' frame (Ekelund's default cell is ~92% off the
  // members' product); skipped when the table is within the tolerance band
  // (Momma). Offsets depend only on the model, so they are cached.
  const calibrateCache = new Map();
  function calibrateOffsets(model) {
    if (!model.jointModels || !model.jointModels.some((jm) => jm.calibrate)) return null;
    if (calibrateCache.has(model)) return calibrateCache.get(model);
    const fx = evalEffects(model, {}).fx;
    const resolveDefault = makeResolver(model, {});
    const owned = new Set();
    const result = new Map();
    for (const jm of model.jointModels) {
      const mine = (jm.members || []).filter((m) => !owned.has(m));
      (jm.members || []).forEach((m) => owned.add(m));
      if (!jm.calibrate) continue;
      const offsets = {};
      for (const output of HR_OUTPUTS) {
        const t = clusterTotalFor(jm, output, resolveDefault, {}, model);
        if (!t) continue;
        let membersLog = 0;
        for (const m of mine) {
          const e = fx[m] && fx[m][output];
          if (e && e.logHr !== undefined) membersLog += e.logHr;
          else if (m === 'bmi' && model.bmi) {
            // Derived member (3.3): its marginal at DEFAULTS. bodyFat is
            // gated off on the defaults profile, so the bmi marginal IS the
            // whole members' product there (and for cancer there is no bmi
            // marginal — product 1.0).
            const steps = output === 'mortality'
              ? model.bmi.steps
              : (output === 'cvd' && model.bmi.cvd ? model.bmi.cvd.steps : null);
            if (steps) {
              const s = lookupSteps(steps, computeBmi(defaults(model)));
              if (s) membersLog += Math.log(s.hr);
            }
          }
        }
        offsets[output] = membersLog - Math.log(t.hr);
      }
      result.set(jm.id, offsets);
    }
    calibrateCache.set(model, result);
    return result;
  }

  // Lookup total shifted by a calibration offset (constant log-space shift
  // applied to hr/hrLow/hrHigh; score/credit/axisValues pass through).
  function shifted(t, offset) {
    if (!offset) return t;
    const k = Math.exp(offset);
    return { hr: t.hr * k, hrLow: t.hrLow * k, hrHigh: t.hrHigh * k, score: t.score, credit: t.credit, axisValues: t.axisValues };
  }

  // One joint model's total for one HR output; null when the model has no
  // coverage for that output (caller falls back to the marginal product).
  // A top-level `lookup` alone is shorthand for `outputs: { mortality: lookup }`.
  function clusterTotalFor(jm, output, resolveValue, values, model) {
    const lookup = jm.outputs ? jm.outputs[output] : (output === 'mortality' ? jm.lookup : null);
    if (!lookup) return null;
    return jm.model === 'score' ? scoreTotal(jm, lookup, resolveValue) : gridTotal(jm, lookup, resolveValue, values, model, output);
  }

  function makeResolver(model, values) {
    const defaultById = {};
    for (const input of model.inputs) defaultById[input.id] = input.default;
    return (id) => {
      if (id === 'bmi') {
        // Derived input (3.3): joint-model axes may read it on ANY profile,
        // including the calibration/average profiles that evaluate with {}
        // — fall back to the default height/weight when the profile does
        // not carry them.
        const h = values.heightCm !== undefined ? values.heightCm : defaultById.heightCm;
        const w = values.weightKg !== undefined ? values.weightKg : defaultById.weightKg;
        return computeBmi({ heightCm: h, weightKg: w });
      }
      return values[id] !== undefined ? values[id] : defaultById[id];
    };
  }

  // (Widened) CI -> log-space variance, per effect. Shared by evaluateRaw,
  // evalEffects and the cluster-total override so every sigma is the same.
  function sigma2(center, lo, hi, w) {
    const wLo = widenBound(center, lo, w);
    const wHi = widenBound(center, hi, w);
    const s = (Math.log(wHi) - Math.log(wLo)) / (2 * 1.96);
    return s * s;
  }

  const EPS = 1e-6; // |log HR| (or |points|) above this counts as "active"

  // Evaluate every active effect once: fx[inputId][output] = { hr, logHr,
  // hrLow, hrHigh, sigma2, points, record, rdHr, rdPoints }. Shared by
  // evaluateRaw and activeOverlaps so the blend logic never drifts.
  function evalEffects(model, values) {
    const fx = {};
    const contributions = {};
    for (const o of OUTPUTS) contributions[o] = [];
    const widen = model.constants.uncertaintyWiden || { high: 1, moderate: 1, low: 1 };
    const isOn = (key) => !!values[key];
    const superseded = (flag) => flag && isOn(flag);
    for (const input of model.inputs) {
      if (input.gatedBy && !isOn(input.gatedBy)) continue; // advanced inputs only count when enabled
      const value = values[input.id] !== undefined ? values[input.id] : input.default;
      const perInput = {};
      for (const effect of input.effects) {
        if (superseded(effect.supersededBy)) continue; // e.g. measured VO2max replaces reported cardio
        const r = evalEffect(effect, value);
        const rd = evalEffect(effect, input.default); // effect at the average value
        const w = widen[effect.evidence] !== undefined ? widen[effect.evidence] : 1;
        const record = {
          inputId: input.id,
          label: input.label,
          value,
          evidence: effect.evidence,
          source: effect.source,
          note: effect.note,
          ...r,
        };
        const out = perInput[effect.output] || (perInput[effect.output] = {
          id: input.id, record, rdHr: rd.hr !== undefined ? rd.hr : undefined, rdPoints: rd.points !== undefined ? rd.points : 0,
        });
        if (r.hr !== undefined) {
          out.hr = r.hr;
          out.logHr = Math.log(r.hr);
          out.hrLow = r.hrLow;
          out.hrHigh = r.hrHigh;
          out.sigma2 = sigma2(r.hr, r.hrLow, r.hrHigh, w);
        }
        if (r.points !== undefined) out.points = r.points || 0;
        contributions[effect.output].push(record);
      }
      if (Object.keys(perInput).length > 0) fx[input.id] = perInput;
    }
    return { fx, contributions };
  }

  // One side of an overlap pair: an input effect, or — when the member
  // names a joint model — that cluster's total for the output.
  function effectSide(fx, jmTotals, id, output) {
    if (jmTotals && jmTotals.has(id)) return jmTotals.get(id)[output];
    const f = fx[id];
    return f ? f[output] : undefined;
  }

  // First joint model whose members include `id` (mirrors the jmForInput
  // first-owner rule for DERIVED members like 'bmi', which are not inputs
  // and never appear in fx).
  function clusterForMember(model, id) {
    for (const jm of model.jointModels || []) {
      if ((jm.members || []).includes(id)) return jm;
    }
    return undefined;
  }

  // Precomputed per-output totals for every joint model (pure function of
  // the values). Shared by the overlap blend (cluster↔input pairs), the
  // covariance terms, and the accumulation replacement, so every use sees
  // the same total. Entries carry `id: jm.id` for the blend report, plus
  // `rdHr` = the cluster total at the average profile (defaults) — the blend
  // discounts deviations from that level, never the raw level (4.5.8).
  function computeJmTotals(model, values) {
    const perOutput = computeJmTotalsCore(model, values);
    const def = defaultJmTotalsCore(model);
    for (const [jmId, outs] of perOutput) {
      const dOuts = def.get(jmId);
      if (!dOuts) continue;
      for (const output of HR_OUTPUTS) {
        const o = outs[output];
        const dd = dOuts[output];
        if (o && dd) o.rdHr = dd.hr;
      }
    }
    return perOutput;
  }

  // The cluster-total body without the rdHr attachment (so the default
  // totals can be computed recursively without infinite recursion).
  const _jmDefaultCache = new WeakMap();
  function computeJmTotalsCore(model, values) {
    const resolveValue = makeResolver(model, values);
    const widen = model.constants.uncertaintyWiden || { high: 1, moderate: 1, low: 1 };
    const offsets = calibrateOffsets(model);
    const jmTotals = new Map();
    for (const jm of model.jointModels || []) {
      const perOutput = {};
      for (const output of HR_OUTPUTS) {
        const t = clusterTotalFor(jm, output, resolveValue, values, model);
        if (!t) continue;
        const off = offsets ? (offsets.get(jm.id) || {})[output] : 0;
        const c = shifted(t, off);
        const w = widen[jm.evidence] !== undefined ? widen[jm.evidence] : 1;
        perOutput[output] = {
          id: jm.id,
          hr: c.hr, hrLow: c.hrLow, hrHigh: c.hrHigh,
          logHr: Math.log(c.hr),
          sigma2: sigma2(c.hr, c.hrLow, c.hrHigh, w),
          credit: c.credit || null,
        };
      }
      jmTotals.set(jm.id, perOutput);
    }
    return jmTotals;
  }
  function defaultJmTotalsCore(model) {
    let m = _jmDefaultCache.get(model);
    if (!m) {
      m = computeJmTotalsCore(model, defaults(model));
      _jmDefaultCache.set(model, m);
    }
    return m;
  }

  // Overlap blend: for each pair, per output, when BOTH members are active,
  // the weaker (smaller |log HR| / |points|) is discounted in log space by
  // rho. Mutates fx (and the jmTotals objects, for cluster members) in
  // place; returns the per-pair report (all pairs, with `outputs` filled
  // for the active ones) that activeOverlaps exposes and evaluateRaw uses
  // for the covariance terms. When a joint-model total is the weaker side,
  // the blended total is recorded in jmBlend (jm.id -> output -> {hr,
  // sigma2}) so the accumulation replaces the lookup with it.
  function applyOverlaps(model, fx, jmTotals, jmBlend) {
    const report = [];
    for (const o of model.overlaps || []) {
      const entry = {
        a: o.a, b: o.b, rho: o.rho, rhoU: o.rhoU,
        kind: o.kind, tier: o.tier, note: o.note, source: o.source,
        outputs: {},
      };
      for (const output of HR_OUTPUTS) {
        const a = effectSide(fx, jmTotals, o.a, output);
        const b = effectSide(fx, jmTotals, o.b, output);
        if (!a || !b || a.hr === undefined || b.hr === undefined) continue;
        // Blend the DEVIATION from the average-person level (rdHr = the effect
        // at defaults), never the raw level (4.5.8): excess = logHr - log(rdHr),
        // so at reset excess = 0 and nothing blends — an input whose raw effect
        // at its own average value is != 1 (magnesium 0.969 at 280 mg/d, sun
        // 0.88 at 1.5 h/d) no longer shows a spurious chip. "Weaker" means the
        // smaller deviation, matching the semantics of what the blend discounts.
        const rdA = a.rdHr !== undefined ? a.rdHr : 1;
        const rdB = b.rdHr !== undefined ? b.rdHr : 1;
        const eA = a.logHr - Math.log(rdA);
        const eB = b.logHr - Math.log(rdB);
        if (Math.abs(eA) <= EPS || Math.abs(eB) <= EPS) continue;
        // Only discount SHARED deviation: when the two sides move in opposite
        // directions there is no overlapping excess to remove, and blending
        // one of them would push the point estimate outside the
        // [independence, redundancy] assumption band (4.5.8 refinement).
        if (Math.sign(eA) !== Math.sign(eB)) continue;
        const weaker = Math.abs(eA) <= Math.abs(eB) ? a : b;
        const other = weaker === a ? b : a;
        const rdW = weaker === a ? rdA : rdB;
        const excess = weaker === a ? eA : eB;
        const factor = 1 - o.rho;
        weaker.logHr = Math.log(rdW) + factor * excess;
        weaker.hr = Math.exp(weaker.logHr);
        if (weaker.record) weaker.record.overlapBlend = { pair: other.id, rho: o.rho };
        entry.outputs[output] = { active: true, blended: weaker.id, factor };
        if (jmBlend && weaker.record === undefined) {
          const cur = jmBlend.get(weaker.id) || {};
          cur[output] = { hr: weaker.hr, sigma2: weaker.sigma2 };
          jmBlend.set(weaker.id, cur);
        }
      }
      for (const output of POINTS_OUTPUTS) {
        const a = fx[o.a] ? fx[o.a][output] : undefined;
        const b = fx[o.b] ? fx[o.b][output] : undefined;
        if (!a || !b || a.points === undefined || b.points === undefined) continue;
        // Points blend mirrors the HR side: discount the deviation from the
        // default points (rdPoints), so nothing blends when both members sit
        // at their average values.
        const dA = a.points - (a.rdPoints || 0);
        const dB = b.points - (b.rdPoints || 0);
        if (Math.abs(dA) <= EPS || Math.abs(dB) <= EPS) continue;
        const weaker = Math.abs(dA) <= Math.abs(dB) ? a : b;
        const other = weaker === a ? b : a;
        const rdP = weaker === a ? (a.rdPoints || 0) : (b.rdPoints || 0);
        const dev = weaker === a ? dA : dB;
        weaker.points = rdP + (1 - o.rho) * dev;
        weaker.record.overlapBlend = { pair: other.id, rho: o.rho };
        entry.outputs[output] = { active: true, blended: weaker.id, factor: 1 - o.rho };
      }
      report.push(entry);
    }
    return report;
  }

  // Pure entry point for the overlap blend (Phase C-B1). applyOverlaps above
  // mutates the fx/jmTotals maps it is given; that mutation was the hidden
  // hand-off to the accumulation loop. This wrapper instead works on
  // shallow copies so callers get the blended state back as a VALUE
  // ({ blended, jmTotals, jmBlend, report }) and never have to reason about
  // side effects. The `record` objects (the contribution records the UI
  // reads) are SHARED by reference, so a blend still tags the returned
  // contributions' overlapBlend — only the effect value maps are copied.
  function blendOverlaps(model, fx, jmTotals) {
    const fxCopy = {};
    for (const key of Object.keys(fx)) {
      const out = fx[key];
      fxCopy[key] = {};
      for (const outName of Object.keys(out)) fxCopy[key][outName] = { ...out[outName] };
    }
    const jmCopy = new Map();
    for (const [id, perOutput] of jmTotals) {
      const c = {};
      for (const outName of Object.keys(perOutput)) c[outName] = { ...perOutput[outName] };
      jmCopy.set(id, c);
    }
    const jmBlend = new Map();
    const report = applyOverlaps(model, fxCopy, jmCopy, jmBlend);
    return { blended: fxCopy, jmTotals: jmCopy, jmBlend, report };
  }

// Active overlap pairs for the current values (per output: which member
  // was blended, by how much). Mirrors sourceIndex/sourceTags' drift-proof
  // pattern — the conflation table and per-slider chips read from here.
  function activeOverlaps(model, values) {
    const { fx } = evalEffects(model, values);
    const jmTotals = computeJmTotals(model, values);
    const { report } = blendOverlaps(model, fx, jmTotals);
    return report.map((e) => ({ ...e, active: Object.keys(e.outputs).length > 0 }));
  }

  // conflationGroups (the grouping/ownership walk) lives in js/schema.js —
  // shared with boundsEndpoints and the pages; see the top-of-file import.

  // Assumption endpoints per HR output: independence (full marginal product
  // of every active effect — "if all levers were truly independent") vs
  // redundancy (per conflation group — a joint model or an overlap pair —
  // only the strongest active effect; joint models with lookup coverage use
  // the published joint total). Both endpoints use RAW (unblended) effects;
  // perLever-only members are excluded from both, matching the point
  // estimate. The blend rule is monotone in log space, so for pair groups
  // the point estimate always lies between the two endpoint products; a
  // joint-model total is an evidence-based lookup and can sit outside the
  // member range — the endpoints are assumption-space labels for the UI
  // (4.3), not hard brackets.
  function boundsEndpoints(model, values) {
    const { fx } = evalEffects(model, values);
    const G = conflationGroups(model);
    const perLever = G.perLeverSet;
    const groups = G.groups;
    const groupOf = G.groupOf;
    const jmTotals = computeJmTotals(model, values);
    const widen = model.constants.uncertaintyWiden || { high: 1, moderate: 1, low: 1 };
    const out = {};
    for (const output of HR_OUTPUTS) {
      const ind = { hr: 1, sigma2: 0 };
      const red = { hr: 1, sigma2: 0 };
      for (const input of model.inputs) {
        const e = fx[input.id] && fx[input.id][output];
        if (!e || e.hr === undefined) continue;
        if (perLever.has(input.id)) continue;
        ind.hr *= e.hr;
        ind.sigma2 += e.sigma2;
        if (!groupOf[input.id]) {
          red.hr *= e.hr;
          red.sigma2 += e.sigma2;
        }
      }
      for (const g of groups) {
        // Candidates: input-side effects plus joint-model totals (a pair
        // member may name a cluster id — 3.1).
        const candidates = [];
        for (const m of g.members) {
          const c = effectSide(fx, jmTotals, m, output);
          if (!c || c.hr === undefined) continue;
          if (perLever.has(m)) continue;
          candidates.push({ eff: c, cluster: jmTotals.has(m) });
        }
        if (candidates.length === 0) {
          if (!g.jm) continue; // dead pair group (both members gated off)
          // Dead JM group (all members gated off or derived, e.g. mayoCells
          // with bodyFat off and the derived bmi member): the cluster total
          // may still exist (3.3) — count it, like evaluateRaw's pre-seeded
          // jmAcc. The members' marginals are already excluded from the
          // base product by groupOf.
          const t = jmTotals.get(g.jm.id) && jmTotals.get(g.jm.id)[output];
          if (t) {
            red.hr *= t.hr;
            red.sigma2 += t.sigma2;
          }
          continue;
        }
        if (g.key.startsWith('pair:') && candidates.length < 2) {
          // Pair with only one active member: not a conflation group here —
          // its member multiplies like an unclustered input. A lone CLUSTER
          // side is already counted by the cluster's own group (e.g. rhr
          // gated off leaves ekelundTable alone — 3.2) and must not be
          // re-added.
          for (const c of candidates) {
            if (c.cluster) continue;
            red.hr *= c.eff.hr;
            red.sigma2 += c.eff.sigma2;
          }
          continue;
        }
        if (g.jm) {
          const t = jmTotals.get(g.jm.id) && jmTotals.get(g.jm.id)[output];
          if (t) {
            red.hr *= t.hr;
            red.sigma2 += t.sigma2;
            continue;
          }
        } else if (candidates.some((c) => c.cluster)) {
          // Cluster↔input pair: only the input side contributes to the
          // redundancy endpoint — the cluster's total is already counted by
          // the cluster's own group (option A in the 3.1 note).
          for (const c of candidates) {
            if (!c.cluster) {
              red.hr *= c.eff.hr;
              red.sigma2 += c.eff.sigma2;
            }
          }
          continue;
        }
        // Both-input pair: the strongest active effect wins.
        let s = null;
        for (const c of candidates) {
          if (!s || Math.abs(c.eff.logHr) > Math.abs(s.eff.logHr)) s = c;
        }
        red.hr *= s.eff.hr;
        red.sigma2 += s.eff.sigma2;
      }
      out[output] = { ind, red };
    }

    // Derived BMI effect (same rule as evaluateRaw: replaced by measured
    // body fat % when enabled; and by the owning cluster's lookup total in
    // the REDUNDANCY endpoint when the cluster covers the output — 3.3).
    // The independence endpoint always keeps the marginal product.
    const bmi = computeBmi(values);
    const isOn = (key) => !!values[key];
    if (bmi !== null && model.bmi && !(model.bmi.supersededBy && isOn(model.bmi.supersededBy))) {
      const bmiOwner = clusterForMember(model, 'bmi');
      const bmiCovered = (output) => {
        if (!bmiOwner) return false;
        const t = jmTotals.get(bmiOwner.id);
        return !!(t && t[output]);
      };
      const step = lookupSteps(model.bmi.steps, bmi);
      const w = widen[model.bmi.evidence] !== undefined ? widen[model.bmi.evidence] : 1;
      out.mortality.ind.hr *= step.hr;
      out.mortality.ind.sigma2 += sigma2(step.hr, step.hrLow, step.hrHigh, w);
      if (!bmiCovered('mortality')) {
        out.mortality.red.hr *= step.hr;
        out.mortality.red.sigma2 += sigma2(step.hr, step.hrLow, step.hrHigh, w);
      }
      if (model.bmi.cvd) {
        const cs = lookupSteps(model.bmi.cvd.steps, bmi);
        const cw = widen[model.bmi.cvd.evidence] !== undefined ? widen[model.bmi.cvd.evidence] : 1;
        out.cvd.ind.hr *= cs.hr;
        out.cvd.ind.sigma2 += sigma2(cs.hr, cs.hrLow, cs.hrHigh, cw);
        if (!bmiCovered('cvd')) {
          out.cvd.red.hr *= cs.hr;
          out.cvd.red.sigma2 += sigma2(cs.hr, cs.hrLow, cs.hrHigh, cw);
        }
      }
    }

    const result = {};
    for (const output of HR_OUTPUTS) {
      const mk = (acc) => ({
        hr: acc.hr,
        hrLow: acc.hr * Math.exp(-1.96 * Math.sqrt(acc.sigma2)),
        hrHigh: acc.hr * Math.exp(1.96 * Math.sqrt(acc.sigma2)),
      });
      result[output] = { independence: mk(out[output].ind), redundancy: mk(out[output].red) };
    }
    return result;
  }

  /**
   * Raw evaluation: combined HR vs each study's REFERENCE stratum (no clamp,
   * no anchoring, no years). Also records per-contribution deltas vs the
   * input's default (population-average) value, so the UI can phrase every
   * effect as "vs the average person".
   */

  // The HR accumulation pass of evaluateRaw (Phase C-B3), extracted so the
  // caller reads as a short sequence of named steps. Pure-ish: mutates
  // `contributions` (BMI records are pushed here) and builds jmMeta; every
  // other input (blended, jmTotals, jmBlend, overlapReport) is read-only.
  //   blended        the blendOverlaps() output (effect values, discounted)
  //   jmTotals       per-cluster lookup totals (unblended — used for the
  //                  joint-model replacement + bmiCovered)
  //   covJmTotals    post-blend cluster totals (covariance reads the sigmas)
  //   jmBlend        jm.id -> output -> {hr, sigma2} when the cluster side blended
  //   overlapReport  per-pair active outputs (for the covariance term)
  //   contributions  the shared record arrays (BMI pushes land here)
  // Returns { totals, points, jmMeta }.
  function accumulateHr(model, values, blended, jmTotals, covJmTotals, jmBlend, overlapReport, contributions) {
    const widen = model.constants.uncertaintyWiden || { high: 1, moderate: 1, low: 1 };
    // One accumulator per HR output (mortality/cancer/cvd all share the same
    // accumulate path — marginal product, quadrature sigma, joint-model
    // replacement, covariance, BMI derived effect; cognition/happiness are
    // point sums and never enter these).
    const totals = {};
    for (const o of HR_OUTPUTS) totals[o] = { hr: 1, sigma2: 0 };
    const points = { cognition: 0, happiness: 0 };

    const isOn = (key) => !!values[key];
    const superseded = (flag) => flag && isOn(flag);

    // Cluster dispatch setup: each input's HR is owned by at most one joint
    // model (first `members` match in array order); per-lever-only clusters
    // never enter the product. Empty structures -> no-ops.
    const G = conflationGroups(model);
    const jmById = G.jmById;
    const jmForInput = G.jmForInput;
    const perLeverKeys = G.perLeverKeys;
    const perLeverOf = G.perLeverOf;
    const jmAcc = new Map(); // jm.id -> output -> {prod, sigma2}
    // Seed EVERY joint model so a cluster whose members are all gated off —
    // or derived-only (mayoCells' bmi is not an input and never reaches the
    // accumulation loop) — still contributes its lookup total where the
    // lookup covers the output.
    for (const jm of model.jointModels || []) jmAcc.set(jm.id, {});

    // Accumulate: per-lever-only clusters contribute nothing; joint-model
    // members accumulate per joint model; everything else multiplies
    // marginals. hrDelta is computed from the BLENDED value vs the
    // (unblended) default-value effect.
    for (const input of model.inputs) {
      const perInput = blended[input.id];
      if (!perInput) continue;
      const jm = jmForInput.get(input.id);
      const perLeverCluster = perLeverOf.get(input.id);
      for (const output of Object.keys(perInput)) {
        const out = perInput[output];
        const record = out.record;
        if (jm) record.cluster = jm.cluster;
        else if (perLeverCluster) record.cluster = perLeverCluster;
        if (perLeverCluster) record.perLever = true;
        if (out.hr !== undefined) {
          record.hr = out.hr; // blended point estimate
          record.hrDelta = out.hr / out.rdHr;
        }
        if (out.points !== undefined) {
          record.points = out.points; // blended
          record.pointsDelta = out.points - out.rdPoints;
        }
        const acc = totals[output];
        if (acc && !perLeverCluster) {
          if (jm) {
            let jacc = jmAcc.get(jm.id);
            if (!jacc) { jacc = {}; jmAcc.set(jm.id, jacc); }
            const o = jacc[output] || (jacc[output] = { prod: 1, sigma2: 0 });
            o.prod *= out.hr;
            o.sigma2 += out.sigma2;
          } else {
            acc.hr *= out.hr;
            acc.sigma2 += out.sigma2;
          }
        } else if (!acc) {
          points[output] += out.points || 0;
        }
      }
    }

    // Covariance: each active overlap pair adds 2·rhoU·σᵢ·σⱼ (widened,
    // pre-blend sigmas — cluster members use the cluster total's sigma) to
    // its output's quadrature sum.
    for (const entry of overlapReport) {
      for (const output of Object.keys(entry.outputs)) {
        const a = effectSide(blended, covJmTotals, entry.a, output);
        const b = effectSide(blended, covJmTotals, entry.b, output);
        if (!a || !b) continue;
        const cov = 2 * entry.rhoU * Math.sqrt(a.sigma2) * Math.sqrt(b.sigma2);
        const acc = totals[output];
        if (acc) acc.sigma2 += cov;
      }
    }

    // Derived BMI effect (replaced by measured body fat % when enabled; and
    // by the OWNING joint model's lookup when it covers the output — the
    // cluster total then carries the adiposity risk and the bmi marginal
    // retires on that output, first-owner rule 3.3).
    const bmi = computeBmi(values);
    const bmiOwner = clusterForMember(model, 'bmi');
    const bmiCovered = (output) => {
      if (!bmiOwner) return false;
      const t = jmTotals.get(bmiOwner.id);
      return !!(t && t[output]);
    };
    if (bmi !== null && model.bmi && !superseded(model.bmi.supersededBy)) {
      if (!bmiCovered('mortality')) {
        const step = lookupSteps(model.bmi.steps, bmi);
        const bmiDefault = computeBmi(defaults(model));
        const stepDefault = lookupSteps(model.bmi.steps, bmiDefault);
        const w = widen[model.bmi.evidence] !== undefined ? widen[model.bmi.evidence] : 1;
        totals.mortality.hr *= step.hr;
        totals.mortality.sigma2 += sigma2(step.hr, step.hrLow, step.hrHigh, w);
        contributions.mortality.push({
          inputId: 'bmi',
          label: 'BMI ' + bmi.toFixed(1),
          value: bmi,
          evidence: model.bmi.evidence,
          source: model.bmi.source,
          note: model.bmi.note,
          hr: step.hr, hrLow: step.hrLow, hrHigh: step.hrHigh,
          hrDelta: step.hr / stepDefault.hr, // vs average
        });
      }

      // BMI CVD effect.
      if (model.bmi.cvd && !bmiCovered('cvd')) {
        const cvdStep = lookupSteps(model.bmi.cvd.steps, bmi);
        const cvdStepDefault = lookupSteps(model.bmi.cvd.steps, computeBmi(defaults(model)));
        const cvdW = widen[model.bmi.cvd.evidence] !== undefined ? widen[model.bmi.cvd.evidence] : 1;
        totals.cvd.hr *= cvdStep.hr;
        totals.cvd.sigma2 += sigma2(cvdStep.hr, cvdStep.hrLow, cvdStep.hrHigh, cvdW);
        contributions.cvd.push({
          inputId: 'bmi',
          label: 'BMI ' + bmi.toFixed(1),
          value: bmi,
          evidence: model.bmi.cvd.evidence,
          source: model.bmi.cvd.source,
          note: model.bmi.cvd.note,
          hr: cvdStep.hr, hrLow: cvdStep.hrLow, hrHigh: cvdStep.hrHigh,
          hrDelta: cvdStep.hr / cvdStepDefault.hr,
        });
      }
    }

    // Joint-model totals: replace each cluster's marginal product where the
    // lookup covers the output (per-lever-only clusters never enter the
    // product; outputs without coverage keep the members' marginal product).
    // A blended cluster↔input pair replaces the lookup value with the
    // blended total (its sigma is unchanged — the 2.2 rule).
    const jmMeta = new Map(); // jm.id -> { outputs: {output: jm.id}, credit }
    for (const [jmId, acc] of jmAcc) {
      const jm = jmById.get(jmId);
      const meta = { outputs: {}, credit: null };
      for (const output of HR_OUTPUTS) {
        const t = jmTotals.get(jmId) && jmTotals.get(jmId)[output];
        if (!t) continue;
        // Seed an empty accumulator when no member contributed (all gated
        // off, or a derived-only member like mayoCells' bmi) so the lookup
        // total still replaces the members' product.
        const o = acc[output] || (acc[output] = { prod: 1, sigma2: 0 });
        const blend = jmBlend.get(jmId) && jmBlend.get(jmId)[output];
        o.prod = blend ? blend.hr : t.hr;
        o.sigma2 = t.sigma2;
        meta.outputs[output] = jm.id;
        if (t.credit) meta.credit = t.credit;
      }
      jmMeta.set(jmId, meta);
    }

    for (const [jmId, acc] of jmAcc) {
      if (perLeverKeys.has(jmById.get(jmId).cluster)) continue;
      for (const output of HR_OUTPUTS) {
        const o = acc[output];
        if (o) {
          totals[output].hr *= o.prod;
          totals[output].sigma2 += o.sigma2;
        }
      }
    }

    return { totals, points, jmMeta, bmi };
  }

  function evaluateRaw(model, values) {
    const { fx, contributions } = evalEffects(model, values);

    // Overlap blend (discounts the weaker active member of each pair in log
    // space). Pure call: returns the blended value maps ({ blended, jmTotals,
    // jmBlend, report }) — the accumulation below reads `blended`, not `fx`.
    const jmTotals = computeJmTotals(model, values);
    const { blended, jmTotals: blendedJmTotals, jmBlend, report: overlapReport } = blendOverlaps(model, fx, jmTotals);

    // Accumulate (single named step): marginal product + quadrature sigma per
    // output, with per-lever exclusion, joint-model replacement, covariance
    // and the derived BMI effect folded in (see accumulateHr). Contribution
    // records get hrDelta/pointsDelta/cluster/perLever tags here too.
    const { totals, points, jmMeta, bmi } = accumulateHr(
      model, values, blended, jmTotals, blendedJmTotals, jmBlend, overlapReport, contributions
    );

    // Attribution tags on HR records: viaJoint = this input's marginal was
    // replaced by the joint model; partialCredit = its share of the cluster
    // score. The UI phrases these ("counted together via…", "counted at X%").
    const { jmForInput } = conflationGroups(model);
    const mark = (recs, output) => {
      for (const rec of recs) {
        const jm = jmForInput.get(rec.inputId);
        if (!jm) continue;
        const meta = jmMeta.get(jm.id);
        if (!meta) continue;
        if (meta.outputs[output] === jm.id) rec.viaJoint = jm.id;
        if (meta.credit && meta.credit[rec.inputId] !== undefined) rec.partialCredit = meta.credit[rec.inputId];
      }
    };
    mark(contributions.mortality, 'mortality');
    mark(contributions.cancer, 'cancer');
    mark(contributions.cvd, 'cvd');

    // Bounds around each HR total (log-space, 95%).
    const withBounds = (t) => {
      const sigma = Math.sqrt(t.sigma2);
      return {
        hr: t.hr,
        hrLow: t.hr * Math.exp(-1.96 * sigma),
        hrHigh: t.hr * Math.exp(1.96 * sigma),
      };
    };
    const m = withBounds(totals.mortality);
    const c = withBounds(totals.cancer);
    const v = withBounds(totals.cvd);

    return {
      hr: m.hr, hrLow: m.hrLow, hrHigh: m.hrHigh,
      hrCancer: c.hr, hrCancerLow: c.hrLow, hrCancerHigh: c.hrHigh,
      hrCvd: v.hr, hrCvdLow: v.hrLow, hrCvdHigh: v.hrHigh,
      points, contributions, bmi, values,
      findings: evaluateFindings(model, values),
      bounds: boundsEndpoints(model, values),
    };
  }

  // The population-average profile, evaluated once per model (defaults ARE the
  // averages). Everything the user sees is anchored against this.
  const _avgCache = new WeakMap();
  function averageEval(model) {
    if (!_avgCache.has(model)) _avgCache.set(model, evaluateRaw(model, defaults(model)));
    return _avgCache.get(model);
  }

  // Normalize one raw HR output onto the "vs the average person" scale:
  // raw HR is vs the studies' reference strata; dividing by the average
  // profile's HR makes 1.0x = the average person. Clamp the CENTRAL estimate
  // (lifestyle effects overlap; don't overclaim) — then apply the combined
  // uncertainty AROUND the clamped value so the range always brackets what
  // we display. Shared by the mortality/cancer/cvd blocks in evaluate().
  function normHr(rawHr, rawLow, rawHigh, avgHr, cap) {
    const hrAvgRaw = rawHr / avgHr;
    const clamped = hrAvgRaw < cap.hrFloor || hrAvgRaw > cap.hrCeiling;
    const hrAvg = clamp(hrAvgRaw, cap.hrFloor, cap.hrCeiling);
    const sigma = (Math.log(rawHigh) - Math.log(rawLow)) / (2 * 1.96);
    return {
      hrAvg, hrAvgRaw, clamped,
      hrAvgLow: hrAvg * Math.exp(-1.96 * sigma),
      hrAvgHigh: hrAvg * Math.exp(1.96 * sigma),
    };
  }

  // Which inputs have NO output-specific effect (labels only, for the card's
  // coverage note)? Shown so users see exactly what this output does and
  // doesn't cover. Inputs whose joint model covers the output count as
  // covered (3.3: bodyFat gains CVD + cancer data via the Mayo cells).
  function noDataInputs(model, output) {
    const clusterCovered = new Set();
    for (const jm of model.jointModels || []) {
      if (!jm.outputs || !jm.outputs[output]) continue;
      for (const m of jm.members || []) clusterCovered.add(m);
    }
    const withOut = new Set();
    for (const input of model.inputs) {
      for (const e of input.effects) if (e.output === output) withOut.add(input.id);
    }
    return model.inputs
      .filter((i) => i.group !== 'you' && i.effects.length > 0 && !withOut.has(i.id) && !clusterCovered.has(i.id))
      .map((i) => i.label);
  }

  /**
   * Evaluate the whole model, normalized so 1.0x = the average person.
   * @param {object} model  HEALTH_MODEL
   * @param {object} values map of input id -> value (numbers; strings for segmented; bool for toggle)
   */
  function evaluate(model, values) {
    const raw = evaluateRaw(model, values);
    const avg = averageEval(model);
    const cap = model.constants;

    // Each HR output (mortality/cancer/cvd) goes through the same
    // normalize -> clamp -> CI-around-clamped path; no years translation
    // for cancer/cvd.
    const m = normHr(raw.hr, raw.hrLow, raw.hrHigh, avg.hr, cap);
    const c = normHr(raw.hrCancer, raw.hrCancerLow, raw.hrCancerHigh, avg.hrCancer, cap);
    const v = normHr(raw.hrCvd, raw.hrCvdLow, raw.hrCvdHigh, avg.hrCvd, cap);

    const cancerNoData = noDataInputs(model, 'cancer');
    const cvdNoData = noDataInputs(model, 'cvd');

    const years = clamp(hrToYears(model, m.hrAvg), -cap.yearsCapLoss, cap.yearsCapGain);
    // Pessimistic bound = upper HR; optimistic bound = lower HR.
    const yearsLow = clamp(hrToYears(model, m.hrAvgHigh), -cap.yearsCapLoss, cap.yearsCapGain);
    const yearsHigh = clamp(hrToYears(model, m.hrAvgLow), -cap.yearsCapLoss, cap.yearsCapGain);

    const sex = model.baseline.lifeExpectancy[raw.values.sex] !== undefined ? raw.values.sex : 'unspecified';
    const baselineLe = model.baseline.lifeExpectancy[sex];

    // Marker fuzz for the mind outputs: grows with every active low-evidence
    // contributor — the shakier the inputs, the blurrier the marker.
    const fuzz = (outputId) => {
      const c = model.constants;
      const lows = raw.contributions[outputId].filter(
        (x) => x.evidence === 'low' && Math.abs(x.points || 0) > 0.001
      ).length;
      return Math.min(c.bandFuzzMax, c.bandFuzzBase + lows * c.bandFuzzPerLowEvidence);
    };

    const relCognition = raw.points.cognition - avg.points.cognition;
    const relHappiness = raw.points.happiness - avg.points.happiness;

    // Assumption-space endpoints (2.3), normalized to the average-person
    // scale and clamped like the point estimate so the UI range stays
    // consistent with what we display. Compare against hrAvgRaw (unclamped).
    const normBounds = (b, avgHr) => ({
      hr: clamp(b.hr / avgHr, cap.hrFloor, cap.hrCeiling),
      hrLow: clamp(b.hrLow / avgHr, cap.hrFloor, cap.hrCeiling),
      hrHigh: clamp(b.hrHigh / avgHr, cap.hrFloor, cap.hrCeiling),
    });
    const bounds = {
      mortality: {
        independence: normBounds(raw.bounds.mortality.independence, avg.hr),
        redundancy: normBounds(raw.bounds.mortality.redundancy, avg.hr),
      },
      cancer: {
        independence: normBounds(raw.bounds.cancer.independence, avg.hrCancer),
        redundancy: normBounds(raw.bounds.cancer.redundancy, avg.hrCancer),
      },
      cvd: {
        independence: normBounds(raw.bounds.cvd.independence, avg.hrCvd),
        redundancy: normBounds(raw.bounds.cvd.redundancy, avg.hrCvd),
      },
    };

    return {
      values: raw.values,
      bmi: raw.bmi,
      bounds,
      mortality: {
        // vs the studies' reference strata (transparent internals):
        hr: raw.hr, hrLow: raw.hrLow, hrHigh: raw.hrHigh,
        // vs the average person (what the UI shows):
        hrAvg: m.hrAvg, hrAvgRaw: m.hrAvgRaw,
        hrAvgLow: m.hrAvgLow, hrAvgHigh: m.hrAvgHigh,
        clamped: m.clamped, years, yearsLow, yearsHigh,
      },
      lifeExpectancy: {
        baseline: baselineLe,
        estimate: baselineLe + years,
        low: baselineLe + yearsLow,
        high: baselineLe + yearsHigh,
        delta: years,
      },
      cancer: {
        hr: raw.hrCancer,
        hrAvg: c.hrAvg, hrAvgRaw: c.hrAvgRaw,
        hrAvgLow: c.hrAvgLow, hrAvgHigh: c.hrAvgHigh,
        clamped: c.clamped,
        noData: cancerNoData,
      },
      cvd: {
        hr: raw.hrCvd,
        hrAvg: v.hrAvg, hrAvgRaw: v.hrAvgRaw,
        hrAvgLow: v.hrAvgLow, hrAvgHigh: v.hrAvgHigh,
        clamped: v.clamped,
        noData: cvdNoData,
      },
      scores: {
        cognition: {
          points: raw.points.cognition, relPoints: relCognition,
          fuzz: fuzz('cognition'), ...bandFor(model, relCognition),
        },
        happiness: {
          points: raw.points.happiness, relPoints: relHappiness,
          fuzz: fuzz('happiness'), ...bandFor(model, relHappiness),
        },
      },
      contributions: raw.contributions,
      findings: raw.findings,
    };
  }

  // Sourced findings that apply to the current inputs (disease-specific
  // outcomes, honest nulls, caveats). Each entry: { dir, input, text, source }.
  function evaluateFindings(model, values) {
    if (!model.findings) return [];
    return model.findings
      .filter((f) => {
        try { return f.when(values); } catch { return false; }
      })
      .map((f) => ({ dir: f.dir, input: f.input, text: f.text, source: f.source, mode: f.mode }));
  }

  // Default values for every input (used to initialise the UI).
  function defaults(model) {
    const values = {};
    for (const input of model.inputs) values[input.id] = input.default;
    return values;
  }

  // --------------------------------------------------------- shared display
  // shortLabel/esc/displayName (the display helpers app.js + sources.js use)
  // live in js/schema.js — destructured at the top; see the import there.

  // Number sources in order of first use: input effects (in model order),
  // then the derived BMI effect, then the baseline life table, then joint
  // models and overlap pairs (appended at the end so existing citation
  // numbers never shift). Both pages compute citation numbers from this so
  // they always match.
  function sourceIndex(model) {
    const order = [];
    const push = (s) => { if (s && !order.includes(s)) order.push(s); };
    const pushAll = (keys) => { if (keys) (Array.isArray(keys) ? keys : [keys]).forEach(push); };
    for (const input of model.inputs) for (const e of input.effects) pushAll(e.source);
    for (const f of model.findings) pushAll(f.source);
    pushAll(model.bmi.source);
    pushAll(model.baseline.source);
    for (const jm of model.jointModels || []) pushAll(jm.source);
    for (const o of model.overlaps || []) pushAll(o.source);
    const map = {};
    order.forEach((key, i) => (map[key] = i + 1));
    return map;
  }

  // Map every cited source key to the subject labels that cite it (input
  // labels, finding subjects, the derived BMI effect, the life-expectancy
  // baseline). Same walk as sourceIndex, so the chips on sources.html can
  // never drift from actual usage: add an input/effect citing a source and
  // its chip appears automatically.
  function sourceTags(model) {
    const tags = {};
    const add = (keys, label) => {
      if (!keys || !label) return;
      (Array.isArray(keys) ? keys : [keys]).forEach((k) => {
        if (!tags[k]) tags[k] = [];
        if (!tags[k].includes(label)) tags[k].push(label);
      });
    };
    // Short chip form of an input label: drop parentheticals, e.g.
    // "Cardio (moderate-equivalent)" -> "Cardio" (shortLabel from schema.js).
    // A finding's subject label (e.g. "Strength", "Iron") is often just a
    // short form of the input label (e.g. "Strength training"); fold it in
    // rather than showing two chips for the same subject.
    const covered = (labels, label) => labels.some((l) => {
      const a = l.toLowerCase(), b = label.toLowerCase();
      return a.includes(b) || b.includes(a);
    });
    for (const input of model.inputs) {
      const label = shortLabel(input.label);
      for (const e of input.effects) add(e.source, label);
    }
    for (const f of model.findings) {
      for (const key of Array.isArray(f.source) ? f.source : [f.source]) {
        if (tags[key] && covered(tags[key], f.input)) continue;
        add(key, f.input);
      }
    }
    add(model.bmi.source, shortLabel(model.bmi.label));
    add(model.baseline.source, 'Life expectancy baseline');
    for (const jm of model.jointModels || []) add(jm.source, jm.cluster.charAt(0).toUpperCase() + jm.cluster.slice(1) + ' score');
    return tags;
  }

  // Active joint models for the given values: per-output totals + score
  // attribution. Mirrors sourceIndex/sourceTags' drift-proof pattern — the
  // conflation table on sources.html and the per-slider chips read from here.
  function clusterTotals(model, values) {
    const resolveValue = makeResolver(model, values);
    const offsets = calibrateOffsets(model);
    const out = [];
    for (const jm of model.jointModels || []) {
      const entry = { id: jm.id, cluster: jm.cluster, model: jm.model, outputs: {} };
      for (const output of ['mortality', 'cancer', 'cvd']) {
        const t = clusterTotalFor(jm, output, resolveValue, values, model);
        if (!t) continue;
        const off = offsets ? (offsets.get(jm.id) || {})[output] : 0;
        const c = shifted(t, off);
        entry.outputs[output] = { hr: c.hr, hrLow: c.hrLow, hrHigh: c.hrHigh };
        if (c.score !== undefined) { entry.score = c.score; entry.credit = c.credit; }
      }
      out.push(entry);
    }
    return out;
  }

  // Active joint models for the current values: same shape as clusterTotals,
  // filtered to clusters where at least one member's value differs from its
  // default. By the calibration rule a cluster at all-default values is the
  // average profile (1.0x), so the UI can skip those.
  function activeJoint(model, values) {
    const defaultById = {};
    for (const input of model.inputs) defaultById[input.id] = input.default;
    const activeIds = new Set();
    for (const jm of model.jointModels || []) {
      for (const m of jm.members || []) {
        if (values[m] !== undefined && values[m] !== defaultById[m]) { activeIds.add(jm.id); break; }
      }
    }
    return clusterTotals(model, values).filter((t) => activeIds.has(t.id));
  }

  // ------------------------------------------------- per-input disclosure (4.5.7)
  // "What we use, where, why": one entry per input (same order as
  // model.inputs), classifying HOW each input feeds each of the five outputs.
  // STATIC data walk (per-lever > joint-model ownership > overlap pair >
  // marginal > no-data > none) — deliberately NOT a probe-profile evaluation:
  // evalEffects skips gated sliders when their gate is off (a probe can't see
  // vo2max/bodyFat/grip/rhr), and the overlap blend discounts whichever side
  // is weaker at the probe values (a classification that changes with the
  // numbers). This walk dispatches on the same structures the engine uses
  // (conflationGroups + per-output lookup coverage + effect lists), so it
  // cannot drift from the numbers. Gate toggles and gated sliders and the
  // derived-BMI pathway (height/weight) get explicit labels.
  function inputDisclosure(model) {
    const { jmById, jmForInput, perLeverOf } = conflationGroups(model);
    const byId = new Map(model.inputs.map((i) => [i.id, i]));
    const clusterCovers = (jmId, output) => {
      const jm = jmById.get(jmId);
      return !!(jm && jm.outputs && jm.outputs[output]);
    };
    const actsOn = (id, output) => {
      if (jmById.has(id)) return clusterCovers(id, output);
      const input = byId.get(id);
      return !!(input && (input.effects || []).some((e) => e.output === output));
    };
    const pairFor = (id, output) => {
      for (const o of model.overlaps || []) {
        const other = o.a === id ? o.b : o.b === id ? o.a : null;
        if (other === null) continue;
        if (actsOn(id, output) && actsOn(other, output)) return { rho: o.rho, other };
      }
      return null;
    };
    const shareHow = (jm, output, effFor) => {
      const e = effFor(output);
      return {
        how: 'share',
        detail: jm.id,
        evidence: e ? e.evidence : jm.evidence,
        source: e ? (e.source || []).slice() : (jm.source || []).slice(),
      };
    };

    return model.inputs.map((input) => {
      const effects = input.effects || [];
      const effFor = (output) => effects.find((e) => e.output === output);
      const isGateToggle = effects.length === 0 && input.kind === 'toggle';
      const gatedSliders = isGateToggle ? model.inputs.filter((i) => i.gatedBy === input.id) : [];
      const supersededInputs = isGateToggle
        ? model.inputs.filter((i) => (i.effects || []).some((e) => e.supersededBy === input.id))
        : [];
      const replacesBmi = isGateToggle && !!(model.bmi && model.bmi.supersededBy === input.id);

    const hows = {};
    for (const output of OUTPUTS) {
      const eff = effFor(output);
      let how = null;
      if (isGateToggle) {
        const affected = new Set();
        if (replacesBmi) { affected.add('mortality'); affected.add('cvd'); }
        for (const s of supersededInputs) for (const e of s.effects || []) if (e.supersededBy === input.id) affected.add(e.output);
        for (const s of gatedSliders) for (const e of s.effects || []) affected.add(e.output);
        if (affected.has(output)) {
          const targets = [];
          if (replacesBmi) targets.push('BMI');
          for (const s of supersededInputs) if (!targets.includes(s.label)) targets.push(s.label);
          const gatedNames = gatedSliders.map((s) => s.label).join(' / ');
          how = {
            how: targets.length ? 'replaces' : 'enables',
            detail: targets.length
              ? (targets.join(' and ') + ' when enabled')
              : (gatedNames + ' input'),
            evidence: (gatedSliders[0] && gatedSliders[0].effects[0] && gatedSliders[0].effects[0].evidence) || 'moderate',
            source: (gatedSliders[0] && gatedSliders[0].effects[0] && gatedSliders[0].effects[0].source) || [],
          };
        } else {
          how = { how: 'none' };
        }
      } else if (input.id === 'sex') {
        how = { how: 'none' };
      } else if (input.id === 'heightCm' || input.id === 'weightKg') {
        if (output === 'mortality' || output === 'cvd') {
          how = { how: 'via-bmi', detail: 'derived BMI → PA × body weight cluster', evidence: model.bmi.evidence, source: (model.bmi.source || []).slice() };
        } else {
          how = { how: 'none' };
        }
      } else if (eff) {
        const pl = perLeverOf.get(input.id);
        if (pl) {
          const points = OUTPUTS.indexOf(output) >= 3;
          how = {
            how: points ? 'per-lever-points' : 'per-lever',
            detail: 'psychosocial — ' + (points ? 'points count into the band' : 'not in the total'),
            evidence: eff.evidence,
            source: (eff.source || []).slice(),
          };
        } else {
          const jm = jmForInput.get(input.id);
          if (jm && clusterCovers(jm.id, output)) {
            how = shareHow(jm, output, effFor);
          } else {
            const pair = pairFor(input.id, output);
            if (pair) how = { how: 'overlap', detail: pair.other, rho: pair.rho, evidence: eff.evidence, source: (eff.source || []).slice() };
            else how = { how: 'marginal', evidence: eff.evidence, source: (eff.source || []).slice() };
          }
        }
      } else if (effects.length > 0) {
        const jm = jmForInput.get(input.id);
        if (jm && clusterCovers(jm.id, output)) how = shareHow(jm, output, effFor);
        else how = { how: 'no-data' };
      } else {
        how = { how: 'none' };
      }
      // Gated sliders (vo2max/bodyFat/grip/rhr): everything is conditional on
      // the gate toggle. Tag the classification rather than a separate 'how'
      // value so share/overlap/marginal all read as gated too.
      if (how && input.gatedBy) {
        const gate = byId.get(input.gatedBy);
        how.gated = true;
        how.gateLabel = gate ? gate.label : input.gatedBy;
      }
      if (how) hows[output] = how;
    }

      const seen = new Set();
      const sources = [];
      const add = (arr) => { for (const k of arr || []) if (!seen.has(k)) { seen.add(k); sources.push(k); } };
      for (const output of OUTPUTS) { const h = hows[output]; if (h && h.source) add(h.source); }
      if (sources.length === 0 && isGateToggle) {
        for (const s of gatedSliders) for (const e of s.effects || []) add(e.source);
        for (const s of supersededInputs) for (const e of s.effects || []) add(e.source);
        if (replacesBmi) add(model.bmi.source);
      }
      if (sources.length === 0 && input.id === 'sex') add(model.baseline.source);

      return { id: input.id, label: input.label, group: input.group, hows, sources };
    });
  }

  return { alpha, hrToYears, yearsToHr, evalEffect, computeBmi, evaluate, evaluateRaw, averageEval, evaluateFindings, defaults, sourceIndex, sourceTags, clusterTotals, activeJoint, activeOverlaps, boundsEndpoints, inputDisclosure, shortLabel, esc, displayName, OUTPUTS };
});
