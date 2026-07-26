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
 */

(function (root, factory) {
  const engine = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = engine;
  root.HEALTH_ENGINE = engine;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

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
        const doses = Math.min(Math.max(value, 0), effect.capAt) / effect.per;
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
      case 'toggle':
        return value ? { points: effect.points } : { points: 0 };
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

  /**
   * Evaluate the whole model.
   * @param {object} model  HEALTH_MODEL
   * @param {object} values map of input id -> value (numbers; strings for segmented; bool for toggle)
   */
  function evaluate(model, values) {
    const contributions = { mortality: [], cognition: [], happiness: [] };
    let hr = 1, hrLow = 1, hrHigh = 1;
    const points = { cognition: 0, happiness: 0 };

    for (const input of model.inputs) {
      const value = values[input.id];
      for (const effect of input.effects) {
        const r = evalEffect(effect, value);
        const record = {
          inputId: input.id,
          label: input.label,
          value,
          evidence: effect.evidence,
          source: effect.source,
          note: effect.note,
          ...r,
        };
        if (effect.output === 'mortality') {
          hr *= r.hr;
          hrLow *= r.hrLow;
          hrHigh *= r.hrHigh;
          contributions.mortality.push(record);
        } else {
          points[effect.output] += r.points || 0;
          contributions[effect.output].push(record);
        }
      }
    }

    // Derived BMI effect.
    const bmi = computeBmi(values);
    if (bmi !== null && model.bmi) {
      const step = lookupSteps(model.bmi.steps, bmi);
      hr *= step.hr;
      hrLow *= step.hrLow;
      hrHigh *= step.hrHigh;
      contributions.mortality.push({
        inputId: 'bmi',
        label: 'BMI ' + bmi.toFixed(1),
        value: bmi,
        evidence: model.bmi.evidence,
        source: model.bmi.source,
        note: model.bmi.note,
        hr: step.hr, hrLow: step.hrLow, hrHigh: step.hrHigh,
      });
    }

    // Combine + clamp (lifestyle effects overlap; don't overclaim).
    const clamped = hr < model.constants.hrFloor || hr > model.constants.hrCeiling;
    const clampedLow = hrLow < model.constants.hrFloor;
    const clampedHigh = hrHigh > model.constants.hrCeiling;
    hr = clamp(hr, model.constants.hrFloor, model.constants.hrCeiling);
    hrLow = clamp(hrLow, model.constants.hrFloor, model.constants.hrCeiling);
    hrHigh = clamp(hrHigh, model.constants.hrFloor, model.constants.hrCeiling);

    const cap = model.constants;
    const years = clamp(hrToYears(model, hr), -cap.yearsCapLoss, cap.yearsCapGain);
    // Pessimistic bound = upper HR; optimistic bound = lower HR.
    const yearsLow = clamp(hrToYears(model, hrHigh), -cap.yearsCapLoss, cap.yearsCapGain);
    const yearsHigh = clamp(hrToYears(model, hrLow), -cap.yearsCapLoss, cap.yearsCapGain);

    const sex = model.baseline.lifeExpectancy[values.sex] !== undefined ? values.sex : 'unspecified';
    const baselineLe = model.baseline.lifeExpectancy[sex];

    return {
      values,
      bmi,
      mortality: { hr, hrLow, hrHigh, clamped, clampedLow, clampedHigh, years, yearsLow, yearsHigh },
      lifeExpectancy: {
        baseline: baselineLe,
        estimate: baselineLe + years,
        low: baselineLe + yearsLow,
        high: baselineLe + yearsHigh,
        delta: years,
      },
      scores: {
        cognition: { points: points.cognition, ...bandFor(model, points.cognition) },
        happiness: { points: points.happiness, ...bandFor(model, points.happiness) },
      },
      contributions,
    };
  }

  // Default values for every input (used to initialise the UI).
  function defaults(model) {
    const values = {};
    for (const input of model.inputs) values[input.id] = input.default;
    return values;
  }

  // Number sources in order of first use: input effects (in model order),
  // then the derived BMI effect, then the baseline life table. Both pages
  // compute citation numbers from this so they always match.
  function sourceIndex(model) {
    const order = [];
    const push = (s) => { if (s && !order.includes(s)) order.push(s); };
    for (const input of model.inputs) for (const e of input.effects) push(e.source);
    push(model.bmi.source);
    push(model.baseline.source);
    const map = {};
    order.forEach((key, i) => (map[key] = i + 1));
    return map;
  }

  return { alpha, hrToYears, yearsToHr, evalEffect, computeBmi, evaluate, defaults, sourceIndex };
});
