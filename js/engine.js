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

  /**
   * Raw evaluation: combined HR vs each study's REFERENCE stratum (no clamp,
   * no anchoring, no years). Also records per-contribution deltas vs the
   * input's default (population-average) value, so the UI can phrase every
   * effect as "vs the average person".
   */
  function evaluateRaw(model, values) {
    const contributions = { mortality: [], cancer: [], cvd: [], cognition: [], happiness: [] };
    const widen = model.constants.uncertaintyWiden || { high: 1, moderate: 1, low: 1 };
    let hr = 1;
    let hrCancer = 1;
    let hrCvd = 1;
    let sumSigma2 = 0;       // mortality, combined in quadrature (log space)
    let sumSigma2Cancer = 0; // cancer, same
    let sumSigma2Cvd = 0;    // cvd, same
    const points = { cognition: 0, happiness: 0 };

    const isOn = (key) => !!values[key];
    const superseded = (flag) => flag && isOn(flag);

    // Each effect's (widened) CI -> a log-space standard error; independent
    // errors add in quadrature. Same independence assumption as the central
    // multiplication, but without absurd "multiply the extremes" ranges.
    const sigma = (center, lo, hi, w) => {
      const wLo = widenBound(center, lo, w);
      const wHi = widenBound(center, hi, w);
      const s = (Math.log(wHi) - Math.log(wLo)) / (2 * 1.96);
      return s * s;
    };

    for (const input of model.inputs) {
      if (input.gatedBy && !isOn(input.gatedBy)) continue; // advanced inputs only count when enabled
      const value = values[input.id] !== undefined ? values[input.id] : input.default;
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
        if (r.hr !== undefined) record.hrDelta = r.hr / rd.hr; // vs average
        if (r.points !== undefined) record.pointsDelta = r.points - (rd.points || 0);
        if (effect.output === 'mortality') {
          hr *= r.hr;
          sumSigma2 += sigma(r.hr, r.hrLow, r.hrHigh, w);
          contributions.mortality.push(record);
        } else if (effect.output === 'cancer') {
          hrCancer *= r.hr;
          sumSigma2Cancer += sigma(r.hr, r.hrLow, r.hrHigh, w);
          contributions.cancer.push(record);
        } else if (effect.output === 'cvd') {
          hrCvd *= r.hr;
          sumSigma2Cvd += sigma(r.hr, r.hrLow, r.hrHigh, w);
          contributions.cvd.push(record);
        } else {
          points[effect.output] += r.points || 0;
          contributions[effect.output].push(record);
        }
      }
    }

    // Derived BMI effect (replaced by measured body fat % when enabled).
    const bmi = computeBmi(values);
    if (bmi !== null && model.bmi && !superseded(model.bmi.supersededBy)) {
      const step = lookupSteps(model.bmi.steps, bmi);
      const bmiDefault = computeBmi(defaults(model));
      const stepDefault = lookupSteps(model.bmi.steps, bmiDefault);
      const w = widen[model.bmi.evidence] !== undefined ? widen[model.bmi.evidence] : 1;
      hr *= step.hr;
      sumSigma2 += sigma(step.hr, step.hrLow, step.hrHigh, w);
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

      // BMI CVD effect.
      if (model.bmi.cvd) {
        const cvdStep = lookupSteps(model.bmi.cvd.steps, bmi);
        const cvdStepDefault = lookupSteps(model.bmi.cvd.steps, bmiDefault);
        const cvdW = widen[model.bmi.cvd.evidence] !== undefined ? widen[model.bmi.cvd.evidence] : 1;
        hrCvd *= cvdStep.hr;
        sumSigma2Cvd += sigma(cvdStep.hr, cvdStep.hrLow, cvdStep.hrHigh, cvdW);
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

    const totalSigma = Math.sqrt(sumSigma2);
    const hrLow = hr * Math.exp(-1.96 * totalSigma);
    const hrHigh = hr * Math.exp(1.96 * totalSigma);

    const totalSigmaCancer = Math.sqrt(sumSigma2Cancer);
    const hrCancerLow = hrCancer * Math.exp(-1.96 * totalSigmaCancer);
    const hrCancerHigh = hrCancer * Math.exp(1.96 * totalSigmaCancer);

    const totalSigmaCvd = Math.sqrt(sumSigma2Cvd);
    const hrCvdLow = hrCvd * Math.exp(-1.96 * totalSigmaCvd);
    const hrCvdHigh = hrCvd * Math.exp(1.96 * totalSigmaCvd);

    return {
      hr, hrLow, hrHigh,
      hrCancer, hrCancerLow, hrCancerHigh,
      hrCvd, hrCvdLow, hrCvdHigh,
      points, contributions, bmi, values,
      findings: evaluateFindings(model, values),
    };
  }

  // The population-average profile, evaluated once per model (defaults ARE the
  // averages). Everything the user sees is anchored against this.
  const _avgCache = new WeakMap();
  function averageEval(model) {
    if (!_avgCache.has(model)) _avgCache.set(model, evaluateRaw(model, defaults(model)));
    return _avgCache.get(model);
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

    // Normalize: raw HR is vs the studies' reference strata; dividing by the
    // average profile's HR makes 1.0x = the average person. Clamp the CENTRAL
    // estimate (lifestyle effects overlap; don't overclaim) — then apply the
    // combined uncertainty AROUND the clamped value so the range always
    // brackets what we display.
    const hrAvgRaw = raw.hr / avg.hr;
    const clamped = hrAvgRaw < cap.hrFloor || hrAvgRaw > cap.hrCeiling;
    const hrAvg = clamp(hrAvgRaw, cap.hrFloor, cap.hrCeiling);
    const sigmaNorm = (Math.log(raw.hrHigh) - Math.log(raw.hrLow)) / (2 * 1.96);
    const hrAvgLow = hrAvg * Math.exp(-1.96 * sigmaNorm);
    const hrAvgHigh = hrAvg * Math.exp(1.96 * sigmaNorm);

    // Cancer output: same normalization/clamp, no years translation.
    const cancerAvgRaw = raw.hrCancer / avg.hrCancer;
    const clampedCancer = cancerAvgRaw < cap.hrFloor || cancerAvgRaw > cap.hrCeiling;
    const hrAvgCancer = clamp(cancerAvgRaw, cap.hrFloor, cap.hrCeiling);
    const sigmaCancer = (Math.log(raw.hrCancerHigh) - Math.log(raw.hrCancerLow)) / (2 * 1.96);
    const hrAvgCancerLow = hrAvgCancer * Math.exp(-1.96 * sigmaCancer);
    const hrAvgCancerHigh = hrAvgCancer * Math.exp(1.96 * sigmaCancer);

    // CVD output: same normalization/clamp, no years translation.
    const cvdAvgRaw = raw.hrCvd / avg.hrCvd;
    const clampedCvd = cvdAvgRaw < cap.hrFloor || cvdAvgRaw > cap.hrCeiling;
    const hrAvgCvd = clamp(cvdAvgRaw, cap.hrFloor, cap.hrCeiling);
    const sigmaCvd = (Math.log(raw.hrCvdHigh) - Math.log(raw.hrCvdLow)) / (2 * 1.96);
    const hrAvgCvdLow = hrAvgCvd * Math.exp(-1.96 * sigmaCvd);
    const hrAvgCvdHigh = hrAvgCvd * Math.exp(1.96 * sigmaCvd);

    // Which inputs have NO cancer-specific effect? Shown on the card so users
    // see exactly what this output does and doesn't cover.
    const withCancer = new Set();
    for (const input of model.inputs) {
      for (const e of input.effects) if (e.output === 'cancer') withCancer.add(input.id);
    }
    const cancerNoData = model.inputs
      .filter((i) => i.group !== 'you' && i.effects.length > 0 && !withCancer.has(i.id))
      .map((i) => i.label);

    // Which inputs have NO CVD-specific effect?
    const withCvd = new Set();
    for (const input of model.inputs) {
      for (const e of input.effects) if (e.output === 'cvd') withCvd.add(input.id);
    }
    const cvdNoData = model.inputs
      .filter((i) => i.group !== 'you' && i.effects.length > 0 && !withCvd.has(i.id))
      .map((i) => i.label);

    const years = clamp(hrToYears(model, hrAvg), -cap.yearsCapLoss, cap.yearsCapGain);
    // Pessimistic bound = upper HR; optimistic bound = lower HR.
    const yearsLow = clamp(hrToYears(model, hrAvgHigh), -cap.yearsCapLoss, cap.yearsCapGain);
    const yearsHigh = clamp(hrToYears(model, hrAvgLow), -cap.yearsCapLoss, cap.yearsCapGain);

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

    return {
      values: raw.values,
      bmi: raw.bmi,
      mortality: {
        // vs the studies' reference strata (transparent internals):
        hr: raw.hr, hrLow: raw.hrLow, hrHigh: raw.hrHigh,
        // vs the average person (what the UI shows):
        hrAvg, hrAvgRaw, hrAvgLow, hrAvgHigh, clamped, years, yearsLow, yearsHigh,
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
        hrAvg: hrAvgCancer, hrAvgRaw: cancerAvgRaw,
        hrAvgLow: hrAvgCancerLow, hrAvgHigh: hrAvgCancerHigh,
        clamped: clampedCancer,
        noData: cancerNoData,
      },
      cvd: {
        hr: raw.hrCvd,
        hrAvg: hrAvgCvd, hrAvgRaw: cvdAvgRaw,
        hrAvgLow: hrAvgCvdLow, hrAvgHigh: hrAvgCvdHigh,
        clamped: clampedCvd,
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
      .map((f) => ({ dir: f.dir, input: f.input, text: f.text, source: f.source }));
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

  return { alpha, hrToYears, yearsToHr, evalEffect, computeBmi, evaluate, evaluateRaw, averageEval, evaluateFindings, defaults, sourceIndex };
});
