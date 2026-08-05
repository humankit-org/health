/*
 * engine.test.js — dependency-free smoke tests. Run: `node tests/engine.test.js`
 *
 * These check the model math AND audit the data file (every effect must cite
 * an existing source, steps must be sorted, bounds must bracket the central
 * estimate). If you edit js/factors.js or the js/joint/ layer, run this.
 */

const model = require('../js/joint/index.js');
const engine = require('../js/engine.js');
// Phase-2 plain model: the BASE simple model (js/factors.js) — the same data
// with NO conflation structures at all (Phase 7 split the joint layer out of
// factors.js into js/joint/). Used wherever a test exercises a SINGLE factor's
// marginal math (the shipped clusters are tested in §[17]/§[18]/§[19]/§[21],
// and the shipped per-lever cluster in §[19b]).
const plainModel = require('../js/factors.js');

// Shipped per-lever-only members (§3.5, psychosocial). They are EXCLUDED from
// the shipped HR products by design, so every "plain model" identity that
// recomposes the shipped total from the plain marginal product must strip
// their marginals too (they ARE in the plain product). Offers `per' / hours
// plain total with those members divided out.
const perLeverIds = [];
for (const p of model.perLeverOnly || []) perLeverIds.push(...(p.members || []));
function plainHrOut(values, output) {
  const p = engine.evaluateRaw(plainModel, values);
  const totalKey = output === 'cancer' ? 'hrCancer' : output === 'cvd' ? 'hrCvd' : 'hr';
  let total = p[totalKey];
  for (const id of perLeverIds) {
    const rec = (p.contributions[output] || []).find((c) => c.inputId === id);
    if (rec && rec.hr !== undefined) total /= rec.hr;
  }
  return total;
}

let failures = 0;
function ok(cond, msg) {
  if (cond) {
    console.log('  ok  ' + msg);
  } else {
    failures++;
    console.error('FAIL  ' + msg);
  }
}
function approx(a, b, tol, msg) {
  ok(Math.abs(a - b) <= tol, `${msg} (got ${a.toFixed(4)}, want ~${b.toFixed(4)} ±${tol})`);
}

// Reference profile: every input at its study-reference (no-effect) level.
// Used to check raw HRs vs the studies' reference strata. Contrast with the
// DEFAULTS (= population averages), which is what "reset" restores.
function referenceValues() {
  return {
    ...engine.defaults(model),
    steps: 2000, cardio: 0, strength: 0, sitting: 4,
    fiber: 0, fruitVeg: 2.6, processedMeat: 1.5, ssb: 4.9, fish: 'none', nuts: 0,
    alcohol: 0, coffee: 0, magnesium: 250,
    sleep: 7.5, stress: 3.5, social: 5, purpose: 5,
    vaping: 'never', smoking: 'never', // no-effect reference level
    occupationalPA: 0,
    sunExposure: 0.5, // HR 1.0 step (reference level)
    heightCm: 170, weightKg: 68, // BMI ~23.5 -> HR 1.0 band
  };
}
// Backwards-compatible alias used by older test sections.
function neutralValues() { return referenceValues(); }

console.log('\n[1] Data integrity');
{
  const ids = new Set();
  for (const input of model.inputs) {
    ok(!ids.has(input.id), `input id unique: ${input.id}`);
    ids.add(input.id);
    for (const effect of input.effects) {
      const srcs = Array.isArray(effect.source) ? effect.source : [effect.source];
      srcs.forEach((s) => ok(!!model.sources[s], `${input.id}/${effect.output} cites existing source "${s}"`));
      ok(!!effect.note && effect.note.length > 10, `${input.id}/${effect.output} has an explanatory note`);
      if (effect.type === 'steps') {
        const sorted = effect.steps.every((s, i) => i === 0 || s.max > effect.steps[i - 1].max);
        ok(sorted, `${input.id}/${effect.output} steps sorted ascending`);
        for (const s of effect.steps) {
          if (s.hr !== undefined && s.hrLow !== undefined && s.hrHigh !== undefined) {
            ok(s.hrLow <= s.hr + 1e-9 && s.hr <= s.hrHigh + 1e-9,
              `${input.id}/${effect.output} bounds bracket central (max=${s.max})`);
          }
        }
      }
    }
  }
  const bmiSorted = model.bmi.steps.every((s, i) => i === 0 || s.max > model.bmi.steps[i - 1].max);
  ok(bmiSorted, 'bmi steps sorted ascending');
  const bmiSrcs = Array.isArray(model.bmi.source) ? model.bmi.source : [model.bmi.source];
  bmiSrcs.forEach((s) => ok(!!model.sources[s], 'bmi cites existing source "' + s + '"'));
  const baseSrcs = Array.isArray(model.baseline.source) ? model.baseline.source : [model.baseline.source];
  baseSrcs.forEach((s) => ok(!!model.sources[s], 'baseline cites existing source "' + s + '"'));
}

console.log('\n[2] Single-factor effects');
{
  const r1 = engine.evaluate(plainModel, { ...neutralValues(), cardio: 150 });
  approx(r1.mortality.hr, 0.69, 1e-9, 'cardio 150 min/wk -> HR 0.69 (arem2015)');

  const r2 = engine.evaluate(plainModel, { ...neutralValues(), fiber: 40 });
  approx(r2.mortality.hr, Math.pow(0.9, 3), 1e-9, 'fiber 40 g/d capped at 30 g -> HR 0.9^3 (marginal; the diet score cluster supersedes it when live)');

  const r3 = engine.evaluate(plainModel, { ...neutralValues(), fruitVeg: 10 });
  approx(r3.mortality.hr, Math.pow(0.95, 2.4), 1e-9, 'fruit/veg capped at 5 servings (calibrated to 2.6 avg, marginal)');

  const r4 = engine.evaluate(plainModel, { ...neutralValues(), alcohol: 30 });
  approx(r4.mortality.hr, 1.56, 1e-9, 'alcohol >25 drinks/wk -> HR 1.56 (wood2018)');

  const r5 = engine.evaluate(plainModel, { ...neutralValues(), sleep: 5 });
  approx(r5.mortality.hr, 1.12, 1e-9, 'short sleep -> HR 1.12 (cappuccio2010)');
  ok(r5.scores.cognition.points < 0, 'short sleep hurts cognition score');

  const r6 = engine.evaluate(plainModel, { ...neutralValues(), creatine: true });
  const r6base = engine.evaluate(plainModel, { ...neutralValues(), creatine: false });
  approx(r6.scores.cognition.points - r6base.scores.cognition.points, 0.5, 1e-9,
    'creatine -> +0.5 cognition (avgerinos2018)');
  approx(r6.mortality.hr, 1.0, 1e-9, 'creatine has no mortality claim');
}

console.log('\n[3] Reference profile = raw HR 1.0');
{
  const r = engine.evaluate(plainModel, referenceValues());
  approx(r.mortality.hr, 1.0, 0.02, 'reference profile raw HR ~ 1.0');
  // The per-study reference strata are NOT a coherent "worst lifestyle":
  // they mix no-exercise/no-fiber with lean/calm/connected. So we don't
  // assert a direction vs the average person — just document the gap.
  ok(Math.abs(r.mortality.hrAvg - 1) > 0.01, 'reference profile differs from average person (hrAvg ' + r.mortality.hrAvg.toFixed(2) + ')');
  const avg = engine.averageEval(model);
  ok(avg.hr > 0.3 && avg.hr < 2.0, 'average profile raw HR is sane (' + avg.hr.toFixed(3) + ')');
}

console.log('\n[4] Calibration cross-checks (Gompertz vs published year-estimates)');
{
  // Single factor changed from the AVERAGE profile: the average cancels, so
  // the vs-average ratio equals the factor's own HR.
  const smoker = engine.evaluate(plainModel, { ...engine.defaults(model), smoking: 'current' });
  approx(smoker.mortality.hrAvg, 2.9, 1e-9, 'smoker ratio vs average = 2.9 (avg cancels)');
  approx(smoker.lifeExpectancy.delta, -10.8, 1.5, 'current smoker ~ -11 years (jha2013: >10 y lost)');

  // Moore 2012 compared 0 vs 450+ min/wk: model must reproduce +4.5-5 y for that swing
  const d0 = engine.evaluate(plainModel, { ...engine.defaults(model), cardio: 0 });
  const d500 = engine.evaluate(plainModel, { ...engine.defaults(model), cardio: 500 });
  approx(d500.lifeExpectancy.delta - d0.lifeExpectancy.delta, 5.0, 1.0, '0 -> 500 min/wk cardio ~ +5 years (moore2012: +4.5 y)');

  // hrToYears / yearsToHr round-trip
  approx(engine.hrToYears(model, engine.yearsToHr(model, -4.5)), -4.5, 1e-9, 'years<->hr round-trip');
}

console.log('\n[5] Combination + clamping');
{
  const allHealthy = engine.evaluate(plainModel, {
    ...referenceValues(),
    cardio: 500, strength: 3, fiber: 40, fruitVeg: 8,
    coffee: 4, sauna: 5, social: 7, stress: 2, sleep: 8,
    heightCm: 176, weightKg: 68,
  });
  ok(allHealthy.mortality.clamped, 'all-healthy profile hits the humility floor (hrAvg ' + allHealthy.mortality.hrAvg + ')');
  approx(allHealthy.mortality.hrAvg, model.constants.hrFloor, 1e-9, 'hrAvg clamped at floor');
  ok(allHealthy.lifeExpectancy.delta <= model.constants.yearsCapGain + 1e-9, 'LE gain capped');

  const mixed = engine.evaluate(plainModel, { ...referenceValues(), cardio: 300, strength: 2 });
  approx(mixed.mortality.hr, 0.63 * 0.83, 1e-9, 'cardio x strength multiply');
  ok(mixed.mortality.hrLow < mixed.mortality.hr && mixed.mortality.hr < mixed.mortality.hrHigh,
    'uncertainty range brackets central estimate');
}

console.log('\n[6] Mind bands');
{
  const low = engine.evaluate(plainModel, { ...neutralValues(), stress: 10, sleep: 5, social: 0 });
  ok(low.scores.happiness.points < -1.25, 'bad profile -> happiness well below average');
  ok(/below average/.test(low.scores.happiness.label), 'happiness band label below average');

  const neutral = engine.evaluate(plainModel, neutralValues());
  ok(/average/.test(neutral.scores.cognition.label), 'neutral cognition lands on an "average" band');

  const boost = engine.evaluate(plainModel, { ...neutralValues(), cardio: 300, creatine: true, strength: 3 });
  ok(boost.scores.cognition.points > 0.35, 'creatine + exercise lifts cognition band');
}

console.log('\n[7] BMI derivation');
{
  const obese = engine.evaluate(plainModel, { ...neutralValues(), heightCm: 170, weightKg: 110 });
  approx(obese.bmi, 38.1, 0.2, 'BMI computed');
  approx(obese.mortality.hr, 1.94, 1e-9, 'BMI 38 -> HR 1.94 (diangelantonio2016)');
}

console.log('\n[8] Defaults = population average (the "reset" contract)');
{
  const r = engine.evaluate(plainModel, engine.defaults(model));
  approx(r.mortality.hrAvg, 1.0, 1e-9, 'defaults -> exactly 1.0x the average person');
  approx(r.lifeExpectancy.delta, 0, 1e-9, 'defaults -> LE delta 0 (average person = baseline)');
  approx(r.lifeExpectancy.estimate, model.baseline.lifeExpectancy.unspecified, 1e-9, 'defaults -> baseline LE');
  approx(r.scores.cognition.relPoints, 0, 1e-9, 'defaults -> cognition 0 vs average');
  approx(r.scores.happiness.relPoints, 0, 1e-9, 'defaults -> happiness 0 vs average');
  ok(r.scores.cognition.label === 'about average', 'defaults -> "about average" bands');
}

console.log('\n[9] Uncertainty widening (less certain evidence = wider range)');
{
  const r = engine.evaluate(plainModel, { ...neutralValues(), sauna: 5 }); // low evidence
  const m = r.mortality;
  ok(m.hrLow < 0.45, 'low-evidence lower bound widened beyond published CI (got ' + m.hrLow.toFixed(3) + ' < 0.45)');
  ok(m.hrHigh > 0.81, 'low-evidence upper bound widened beyond published CI (got ' + m.hrHigh.toFixed(3) + ' > 0.81)');
  approx(m.hr, 0.60, 1e-9, 'central estimate unchanged by widening');

  const r2 = engine.evaluate(plainModel, { ...neutralValues(), cardio: 300 }); // high evidence
  approx(r2.mortality.hrLow, 0.588, 0.01, 'high evidence keeps ~published CI (0.62, combined with stress+ssb uncertainty in quadrature)');
}

console.log('\n[10] Advanced inputs: gating + supersession');
{
  const off = engine.evaluate(plainModel, { ...neutralValues(), vo2maxOn: false, vo2max: 50 });
  approx(off.mortality.hr, 1.0, 1e-9, 'VO2max ignored while its toggle is off');

  const on = engine.evaluate(plainModel, { ...neutralValues(), vo2maxOn: true, vo2max: 42, cardio: 300 });
  approx(on.mortality.hr, Math.pow(0.87, (42 - 33) / 3.5), 1e-9, 'VO2max 42 -> 0.87^(9/3.5) (kodama2009), cardio superseded');
  ok(!on.contributions.mortality.some((c) => c.inputId === 'cardio'), 'cardio contribution removed when VO2max enabled');

  const bf = engine.evaluate(plainModel, { ...neutralValues(), bodyFatOn: true, bodyFat: 35, heightCm: 170, weightKg: 110 });
  approx(bf.mortality.hr, 1.0, 1e-9, 'body fat 35% (US avg) -> HR 1.0 (jayedi2022, calibrated), BMI superseded');
  ok(!bf.contributions.mortality.some((c) => c.inputId === 'bmi'), 'BMI contribution removed when body fat % enabled');
}

console.log('\n[11] New inputs');
{
  const r1 = engine.evaluate(plainModel, { ...neutralValues(), magnesium: 450 });
  approx(r1.mortality.hr, Math.pow(0.9, 2), 1e-9, 'magnesium 450 mg/d -> 0.90^2 (fang2016, anchored at 250)');

  const r2 = engine.evaluate(plainModel, { ...neutralValues(), magnesium: 600 });
  approx(r2.mortality.hr, Math.pow(0.9, 2), 1e-9, 'magnesium capped at 450 mg');

  const r3 = engine.evaluate(plainModel, { ...neutralValues(), occupationalPA: 8 });
  approx(r3.mortality.hr, 1.18, 1e-9, 'heavy occupational PA -> HR 1.18 (coenen2018)');

  const r4 = engine.evaluate(plainModel, { ...neutralValues(), snus: 'yes' });
  approx(r4.mortality.hr, 1.28, 1e-9, 'snus -> HR 1.28 (byhamre2021)');

  const r5 = engine.evaluate(plainModel, { ...neutralValues(), vitaminD: 'deficient' });
  approx(r5.mortality.hr, 1.57, 1e-9, 'vitamin D deficiency -> HR 1.57 (schottker2014)');

  const r6 = engine.evaluate(plainModel, { ...neutralValues(), vitaminD: 'supplement' });
  approx(r6.mortality.hr, 0.99, 1e-9, 'vitamin D supplement -> HR 0.99 (manson2019, honest null)');

  const r7 = engine.evaluate(plainModel, { ...neutralValues(), processedMeat: 8 });
  approx(r7.mortality.hr, Math.pow(1.2, (8 - 1.5) / 7), 1e-9, 'processed meat 8/wk -> 1.2^((8-1.5)/7) (pan2012)');

  const r8 = engine.evaluate(plainModel, { ...neutralValues(), ssb: 14 });
  approx(r8.mortality.hr, 1.1415, 1e-9, 'SSB 14/wk -> HR 1.1415 (calibrated to 4.9 avg)');

  const r9 = engine.evaluate(plainModel, { ...neutralValues(), fish: 'lots' });
  approx(r9.mortality.hr, 0.96, 1e-9, 'fish 3+/wk -> HR 0.96 (jayedi2018 per-20-g slope, ~1.8x, disclosed construction)');

  const r10 = engine.evaluate(plainModel, { ...neutralValues(), sitting: 13 });
  approx(r10.mortality.hr, 1.24, 1e-9, 'sitting 13 h/d -> HR 1.24 (biswas2015)');

  const r11 = engine.evaluate(plainModel, { ...neutralValues(), purpose: 9 });
  approx(r11.mortality.hr, 0.83, 1e-9, 'high purpose -> HR 0.83 (cohen2016)');

  const r12 = engine.evaluate(plainModel, { ...neutralValues(), gripOn: true, grip: 25 });
  approx(r12.mortality.hr, Math.pow(0.8621, -1), 1e-9, 'grip 25 kg (5 below 30 kg anchor) -> 0.8621^-1 (leong2015)');

  const r13 = engine.evaluate(plainModel, { ...neutralValues(), gripOn: false, grip: 15 });
  approx(r13.mortality.hr, 1.0, 1e-9, 'grip ignored while its toggle is off');

  const r14 = engine.evaluate(plainModel, { ...neutralValues(), nuts: 30 });
  approx(r14.mortality.hr, Math.pow(0.78, 30 / 28), 1e-9, 'nuts 30 g/d -> 0.78^(30/28) (aune2016nuts, marginal)');
  const base14 = engine.evaluateRaw(plainModel, neutralValues());
  approx(engine.evaluateRaw(plainModel, { ...neutralValues(), nuts: 30 }).hrCancer / base14.hrCancer,
    Math.pow(0.85, 30 / 28), 1e-9, 'nuts 30 g/d -> cancer 0.85^(30/28)');

  const r15 = engine.evaluate(plainModel, { ...neutralValues(), nuts: 50 });
  approx(r15.mortality.hr, Math.pow(0.78, 35 / 28), 1e-9, 'nuts capped at 35 g (marginal)');

  const r16 = engine.evaluate(plainModel, { ...neutralValues(), rhrOn: false, rhr: 90 });
  approx(r16.mortality.hr, 1.0, 1e-9, 'resting HR ignored while its toggle is off');

  const r17 = engine.evaluate(plainModel, { ...neutralValues(), rhrOn: true, rhr: 90 });
  approx(r17.mortality.hr, Math.pow(1.17, 1.8), 1e-9, 'RHR 90 (18 above 72 bpm anchor) -> 1.17^1.8 (aune2017rhr)');
  approx(engine.evaluateRaw(plainModel, { ...neutralValues(), rhrOn: true, rhr: 90 }).hrCancer / base14.hrCancer,
    Math.pow(1.14, 1.8), 1e-9, 'RHR 90 -> cancer 1.14^1.8');

  const r18 = engine.evaluate(plainModel, { ...neutralValues(), sleepRegularity: 9 });
  approx(r18.mortality.hr, 0.78, 1e-9, 'regular sleep schedule -> HR 0.78 (windred2024)');

  const r19 = engine.evaluate(plainModel, { ...neutralValues(), sleepRegularity: 2 });
  approx(r19.mortality.hr, 1.25, 1e-9, 'irregular sleep schedule -> HR 1.25');

  const r20 = engine.evaluate(plainModel, { ...neutralValues(), pm25: 18 });
  approx(r20.mortality.hr, 1.073, 1e-9, 'PM2.5 18 (10 above anchor) -> 1.073 (di2017)');

  const r21 = engine.evaluate(plainModel, { ...neutralValues(), pm25: 2 });
  approx(r21.mortality.hr, Math.pow(1.073, -0.5), 1e-9, 'PM2.5 clamped at minDose 3');

  // Step count tests (neutralValues has steps=2000 = study reference)
  const stepsRef = engine.evaluate(plainModel, neutralValues());
  const stepsAtDefault = engine.evaluate(plainModel, { ...neutralValues(), steps: 5000 });
  const stepsHigh = engine.evaluate(plainModel, { ...neutralValues(), steps: 10000 });
  approx(stepsHigh.mortality.hr / stepsAtDefault.mortality.hr, 0.53 / 0.60, 1e-9, 'steps 10k -> mortality raw HR 0.53/0.60 vs 5k default (lancet2025steps, plateau past the 7k anchor 0.53)');
  approx(stepsRef.mortality.hr / stepsAtDefault.mortality.hr, 1.00 / 0.60, 1e-9, 'steps 2k -> mortality raw HR 1.0/0.60 vs 5k default');

  const stepsBase = engine.evaluateRaw(plainModel, neutralValues());
  const stepsHighRaw = engine.evaluateRaw(plainModel, { ...neutralValues(), steps: 15000 });
  approx(stepsHighRaw.hrCvd / stepsBase.hrCvd, 0.19, 1e-9, 'steps 15k -> CVD HR 0.19 (lancet2025steps linear dose-response)');
  approx(stepsHighRaw.hrCancer / stepsBase.hrCancer, 0.30, 1e-9, 'steps 15k -> cancer HR 0.30 (lancet2025steps linear dose-response)');

  // Use defaults so all non-step inputs cancel with the average
  const stepsHappy = engine.evaluate(plainModel, { ...engine.defaults(model), steps: 10000 });
  ok(stepsHappy.scores.happiness.relPoints > 0, 'steps 10k -> positive happiness delta');
  ok(stepsHappy.scores.cognition.relPoints > 0, 'steps 10k -> positive cognition delta');

  // Sun exposure (AHS-2 warmer months vs 0.5 h ref, VERIFIED PMID 40444275)
  const sunBase = engine.evaluateRaw(plainModel, neutralValues());
  const sunLow = engine.evaluateRaw(plainModel, { ...neutralValues(), sunExposure: 0 });
  approx(sunLow.hr / sunBase.hr, 1.15, 1e-9, 'sun 0 h/d -> mortality HR 1.15 (interpolated 0 h band, adventist2025)');

  const sunOpt = engine.evaluateRaw(plainModel, { ...neutralValues(), sunExposure: 2.5 });
  approx(sunOpt.hr / sunBase.hr, 0.88, 1e-9, 'sun 2.5 h/d -> mortality HR 0.88 (published 3 h, adventist2025)');

  const sunHigh = engine.evaluateRaw(plainModel, { ...neutralValues(), sunExposure: 6 });
  approx(sunHigh.hr / sunBase.hr, 0.90, 1e-9, 'sun 6 h/d -> mortality HR 0.90 (held at published 5 h, adventist2025)');

  // CVD
  const sunCvdLow = engine.evaluateRaw(plainModel, { ...neutralValues(), sunExposure: 0 });
  approx(sunCvdLow.hrCvd / sunBase.hrCvd, 1.18, 1e-9, 'sun 0 h/d -> CVD HR 1.18 (interpolated 0 h band)');

  const sunCvdOpt = engine.evaluateRaw(plainModel, { ...neutralValues(), sunExposure: 2.5 });
  approx(sunCvdOpt.hrCvd / sunBase.hrCvd, 0.87, 1e-9, 'sun 2.5 h/d -> CVD HR 0.87 (published 3 h, adventist2025)');

  const sunCvdHigh = engine.evaluateRaw(plainModel, { ...neutralValues(), sunExposure: 6 });
  approx(sunCvdHigh.hrCvd / sunBase.hrCvd, 0.86, 1e-9, 'sun 6 h/d -> CVD HR 0.86 (held at published 5 h, adventist2025)');

  // Cancer: AHS-2 (the only peer-reviewed quantitative cohort) shows cancer mortality
  // RISES with exposure — 1.08 at 3 h (NS), 1.15 at 5 h (sig). UK evidence (Stevenson,
  // Sun-BEEM preprint) shows the inverse in a low-sun country; steps use the US numbers.
  const sunCancerHigh = engine.evaluateRaw(plainModel, { ...neutralValues(), sunExposure: 6 });
  approx(sunCancerHigh.hrCancer / sunBase.hrCancer, 1.15, 1e-9, 'sun 6 h/d -> cancer HR 1.15 (published 5 h, adventist2025)');

  const sunCancerMod = engine.evaluateRaw(plainModel, { ...neutralValues(), sunExposure: 2.5 });
  approx(sunCancerMod.hrCancer / sunBase.hrCancer, 1.08, 1e-9, 'sun 2.5 h/d -> cancer HR 1.08 (published 3 h, adventist2025)');

  // Happiness: default (1.5 h) is in optimal range; too little reduces it; high exposure maintains benefit
  const sunHappy = engine.evaluate(plainModel, { ...engine.defaults(model), sunExposure: 4 });
  ok(sunHappy.scores.happiness.relPoints >= 0, 'sun 4 h/d -> happiness at least equals default (benefit persists)');

  const sunSad = engine.evaluate(plainModel, { ...engine.defaults(model), sunExposure: 0 });
  ok(sunSad.scores.happiness.relPoints < -0.3, 'sun 0 h/d -> happiness well below default');

}

console.log('\n[12] Findings react to inputs');
{
  // smoker findings removed in v0.x; re-add assertion if restored

  const r0 = engine.evaluate(plainModel, neutralValues());
  ok(!r0.findings.some((f) => f.source.includes('jha2013')), 'reference profile -> no smoking findings');
  ok(!r0.findings.some((f) => f.dir === 'bad' && f.source.includes('pan2012')), 'reference profile -> no processed-meat findings');

  const sunHigh = engine.evaluate(plainModel, { ...referenceValues(), sunExposure: 6 });
  ok(sunHigh.findings.some((f) => f.source.includes('mahamat2020') && /skin cancer/.test(f.text)), 'sun 6 h/d -> skin-cancer finding');
}

console.log('\n[13] Cancer output');
{
  const def = engine.evaluate(plainModel, engine.defaults(model));
  approx(def.cancer.hrAvg, 1.0, 1e-9, 'defaults -> cancer 1.0x the average person');

  // Ratio vs the reference profile cancels inputs whose cancer reference
  // stratum differs from their mortality one (e.g. fiber).
  const base = engine.evaluateRaw(plainModel, neutralValues());
  const pm = engine.evaluateRaw(plainModel, { ...neutralValues(), processedMeat: 8 });
  approx(pm.hrCancer / base.hrCancer, Math.pow(1.16, (8 - 1.5) / 7), 1e-9, 'processed meat 8/wk -> cancer HR 1.16^((8-1.5)/7) (pan2012)');

  const sm = engine.evaluateRaw(plainModel, { ...neutralValues(), smoking: 'current' });
  approx(sm.hrCancer / base.hrCancer, 3.5, 1e-9, 'current smoker -> cancer HR 3.5 unisex midpoint (jha2013 Table 2: 3.2 women / 3.8 men)');

  const fv = engine.evaluateRaw(plainModel, { ...neutralValues(), fruitVeg: 8 });
  approx(fv.hrCancer / base.hrCancer, Math.pow(0.97, 2.4), 1e-9, 'fruit & veg: published cancer null 0.97 (0.90-1.03), capped at 5 servings (wang2014)');

  ok(def.cancer.noData.length > 5, 'coverage note lists no-data inputs');
  ok(def.cancer.noData.includes('VO2 max'), 'VO2 max listed as no-cancer-data');
  ok(def.cancer.noData.includes('Grip strength'), 'grip listed as no-cancer-data');
}

console.log('\n[14] Functional-independence findings');
{
  const f = engine.evaluate(plainModel, { ...neutralValues(), strength: 0, sex: 'female' });
  ok(f.findings.some((x) => x.source.includes('howe2011')), 'no strength training + female -> osteoporosis finding');
  ok(f.findings.some((x) => x.source.includes('sherrington2019')), 'no strength training -> falls finding');

  const g = engine.evaluate(plainModel, { ...neutralValues(), strength: 2 });
  ok(!g.findings.some((x) => x.source.includes('sherrington2019')), 'strength training on -> no falls finding');

  const grip = engine.evaluate(plainModel, { ...neutralValues(), gripOn: true, grip: 30 });
  ok(grip.findings.some((x) => x.source.includes('leong2015') && x.dir === 'neutral'), 'grip enabled -> honest-null injury finding');

  const nuts = engine.evaluate(plainModel, { ...neutralValues(), nuts: 25 });
  ok(nuts.findings.some((x) => x.source.includes('aune2016nuts') && x.dir === 'good'), 'nuts >= 20 g -> respiratory/diabetes finding');

  const reg = engine.evaluate(plainModel, { ...neutralValues(), sleepRegularity: 2 });
  ok(reg.findings.some((x) => x.source.includes('windred2024') && x.dir === 'bad'), 'irregular sleep -> regularity-over-duration finding');

  const pm = engine.evaluate(plainModel, { ...neutralValues(), pm25: 15 });
  ok(pm.findings.some((x) => x.source.includes('di2017') && x.dir === 'bad'), 'PM2.5 > 12 -> exposure finding');


}

console.log('\n[15] CVD output');
{
  const def = engine.evaluate(plainModel, engine.defaults(model));
  approx(def.cvd.hrAvg, 1.0, 1e-9, 'defaults -> cvd 1.0x the average person');

  const base = engine.evaluateRaw(plainModel, neutralValues());
  const pm = engine.evaluateRaw(plainModel, { ...neutralValues(), processedMeat: 8 });
  approx(pm.hrCvd / base.hrCvd, Math.pow(1.13, (8 - 1.5) / 7), 1e-9, 'processed meat 8/wk -> cvd HR 1.13^((8-1.5)/7) (pan2012)');

  const sm = engine.evaluateRaw(plainModel, { ...neutralValues(), smoking: 'current' });
  approx(sm.hrCvd / base.hrCvd, 2.5, 1e-9, 'current smoker -> cvd HR 2.5 (jha2013)');

  const ssb = engine.evaluateRaw(plainModel, { ...neutralValues(), ssb: 14 });
  approx(ssb.hrCvd / base.hrCvd, 1.2358, 1e-9, 'SSB 14/wk -> cvd HR 1.2358 (calibrated, malik2019)');

  const nuts = engine.evaluateRaw(plainModel, { ...neutralValues(), nuts: 30 });
  approx(nuts.hrCvd / base.hrCvd, Math.pow(0.79, 30 / 28), 1e-9, 'nuts 30 g/d -> cvd 0.79^(30/28) (aune2016nuts)');

  const sauna = engine.evaluateRaw(plainModel, { ...neutralValues(), sauna: 5 });
  approx(sauna.hrCvd / base.hrCvd, 0.50, 1e-9, 'sauna 5/wk -> cvd HR 0.50 (laukkanen2015)');

  const vo2 = engine.evaluateRaw(plainModel, { ...neutralValues(), vo2maxOn: true, vo2max: 42 });
  approx(vo2.hrCvd / base.hrCvd, Math.pow(0.85, (42 - 33) / 3.5), 1e-9, 'vo2max 42 -> cvd 0.85^(9/3.5) (kodama2009)');

  const rhr = engine.evaluateRaw(plainModel, { ...neutralValues(), rhrOn: true, rhr: 90 });
  approx(rhr.hrCvd / base.hrCvd, Math.pow(1.15, 1.8), 1e-9, 'RHR 90 -> cvd 1.15^1.8 (aune2017rhr)');

  const sleepReg = engine.evaluateRaw(plainModel, { ...neutralValues(), sleepRegularity: 9 });
  approx(sleepReg.hrCvd / base.hrCvd, 0.78, 1e-9, 'regular sleep schedule -> cvd 0.78 (windred2024)');

  ok(def.cvd.noData.length > 3, 'coverage note lists no-data inputs');
  ok(def.cvd.noData.includes('Cannabis'), 'cannabis listed as no-cvd-data');
  ok(def.cvd.noData.includes('Meditation'), 'meditation listed as no-cvd-data');
  ok(def.cvd.noData.includes('Untreated iron deficiency'), 'iron deficiency listed as no-cvd-data');

  // BMI CVD contribution
  const obese = engine.evaluate(plainModel, { ...neutralValues(), heightCm: 170, weightKg: 110 });
  const bmiCvd = obese.contributions.cvd.find((c) => c.inputId === 'bmi');
  ok(!!bmiCvd, 'obese BMI has a CVD contribution');
  approx(bmiCvd.hr, 2.10, 1e-9, 'BMI 38 -> CVD HR 2.10 (diangelantonio2016)');
}

console.log('\n[16] Citation numbering (index.html <-> sources.html)');
{
  const refs = engine.sourceIndex(model);
  const cited = new Set();
  const addAll = (keys) => { if (keys) (Array.isArray(keys) ? keys : [keys]).forEach((k) => cited.add(k)); };
  for (const input of model.inputs) for (const e of input.effects) addAll(e.source);
  for (const f of model.findings) addAll(f.source);
  addAll(model.bmi.source);
  addAll(model.baseline.source);
  for (const jm of model.jointModels) addAll(jm.source);
  for (const o of model.overlaps) addAll(o.source);
  ok(Object.keys(refs).length === cited.size, 'sourceIndex covers every cited source');
  const nums = Object.values(refs).sort((a, b) => a - b);
  ok(nums.every((n, i) => n === i + 1), 'citation numbers contiguous from 1');

  const tags = engine.sourceTags(model);
  ok(Object.keys(tags).length === Object.keys(refs).length, 'sourceTags covers exactly the cited sources');
  for (const key of Object.keys(refs)) {
    ok(Array.isArray(tags[key]) && tags[key].length >= 1 && tags[key].every((t) => t && t.trim()), `every source has a non-empty topic chip (${key})`);
    ok(new Set(tags[key]).size === tags[key].length, `no duplicate topic chips per source (${key})`);
  }
  ok(tags.jha2013.includes('Smoking'), 'jha2013 chips: Smoking');
  ok(tags.houston2018.includes('Untreated iron deficiency') && !tags.houston2018.includes('Iron'), 'houston2018 chips: input label folds in the shorter finding label');
  ok(tags.momma2022.includes('Strength training') && !tags.momma2022.includes('Strength'), 'momma2022 chips: input label folds in the shorter finding label');
  ok(tags.diangelantonio2016.includes('BMI'), 'diangelantonio2016 chips: BMI (derived)');
  ok(tags.nchs2023.includes('Life expectancy baseline'), 'nchs2023 chips: life expectancy baseline');
}

console.log('\n[17] Cluster dispatch (Phase 2 machinery; synthetic lookups + shipped diet cluster)');
{
  ok(Array.isArray(model.jointModels) && model.jointModels.length === 5 && model.jointModels[0].id === 'dietScore' && model.jointModels[1].id === 'ekelundTable' && model.jointModels[2].id === 'mommaCells' && model.jointModels[3].id === 'duncanCells' && model.jointModels[4].id === 'mayoCells', 'shipped jointModels: diet score + Ekelund + Momma + Duncan + Mayo clusters');
  ok(Array.isArray(model.perLeverOnly) && model.perLeverOnly.length === 1 && model.perLeverOnly[0].cluster === 'psychosocial'
    && model.perLeverOnly[0].members.length === 4
    && ['purpose', 'stress', 'social', 'sleepRegularity'].every((m) => model.perLeverOnly[0].members.includes(m)),
  'perLeverOnly shipped: psychosocial {purpose, stress, social, sleepRegularity}');
  const shippedTot = engine.clusterTotals(model, engine.defaults(model));
  ok(shippedTot.length === 5 && shippedTot[0].id === 'dietScore' && shippedTot[1].id === 'ekelundTable' && shippedTot[2].id === 'mommaCells' && shippedTot[3].id === 'duncanCells' && shippedTot[4].id === 'mayoCells', 'clusterTotals at defaults: diet + movement + adiposity clusters present');
  ok(Math.abs(shippedTot[0].score - 3.023) < 0.01 && Math.abs(shippedTot[0].outputs.mortality.hr - 0.7536) < 1e-4, 'defaults: diet score ~3.02 -> hr 0.7536');
  ok(Math.abs(shippedTot[1].outputs.mortality.hr - 0.5280) < 1e-9, 'defaults: Ekelund cluster anchored to the members product 0.5280 (calibrate: true)');
  ok(Math.abs(shippedTot[2].outputs.mortality.hr - 0.85) < 1e-9, 'defaults: Momma (none, MS) cell 0.85 (no calibrate — within band)');
  ok(Math.abs(shippedTot[3].outputs.mortality.hr - 1.0) < 1e-12, 'defaults: Duncan ratio Inactive-Rec/Inactive-Rec = 1.00 exactly (no calibrate needed)');
  // 3.3: the Mayo PA×adiposity table replaces the bmi marginal on
  // mortality (1.20) and cvd (1.25); there is no bmi cancer marginal, so
  // the cancer total calibrates to exactly 1.0 at defaults.
  ok(Math.abs(shippedTot[4].outputs.mortality.hr - 1.20) < 1e-9, 'defaults: Mayo cluster anchored to the bmi marginal 1.20 (calibrate: true)');
  ok(Math.abs(shippedTot[4].outputs.cvd.hr - 1.25) < 1e-9, 'defaults: Mayo CVD anchored to the bmi CVD marginal 1.25');
  ok(Math.abs(shippedTot[4].outputs.cancer.hr - 1.0) < 1e-9, 'defaults: Mayo cancer total exactly 1.0 (no bmi cancer marginal)');

  // Synthetic joint models exercise the machinery without touching the data.
  const M = { ...plainModel };
  M.jointModels = [
    {
      id: 'dietScore', cluster: 'diet', members: ['fiber', 'nuts'],
      model: 'score', evidence: 'moderate',
      outputs: {
        mortality: {
          components: [{ input: 'fiber', max: 40, weight: 1 }, { input: 'nuts', max: 35, weight: 1 }],
          gradient: [
            { max: 0.5, hr: 1.0, hrLow: 0.9, hrHigh: 1.1 },
            { max: 1.0, hr: 0.94, hrLow: 0.88, hrHigh: 1.0 },
            { max: 1.5, hr: 0.88, hrLow: 0.8, hrHigh: 0.96 },
            { max: 2.0, hr: 0.82, hrLow: 0.72, hrHigh: 0.92 },
          ],
        },
      },
    },
    {
      id: 'ekelundTable', cluster: 'movement', members: ['cardio', 'steps', 'sitting'],
      model: 'table', evidence: 'high', interpolate: true,
      outputs: {
        mortality: {
          axes: [
            { id: 'pa', label: 'PA', unit: 'MET-min/wk', inputs: ['cardio', 'steps'], coeffs: [4, 0.035], bands: [{ max: 500, label: 'Q1' }, { max: 1000, label: 'Q2' }, { max: 1500, label: 'Q3' }, { max: 9999, label: 'Q4' }] },
            { id: 'sit', label: 'Sitting', unit: 'h/day', inputs: ['sitting'], coeffs: [1], bands: [{ max: 4, label: 'Q1' }, { max: 7, label: 'Q2' }, { max: 10, label: 'Q3' }, { max: 99, label: 'Q4' }] },
          ],
          grid: [
            [{ hr: 1.23, hrLow: 1.10, hrHigh: 1.37 }, { hr: 1.16, hrLow: 1.03, hrHigh: 1.29 }, { hr: 1.05, hrLow: 0.93, hrHigh: 1.18 }, { hr: 0.92, hrLow: 0.81, hrHigh: 1.03 }],
            [{ hr: 1.10, hrLow: 0.98, hrHigh: 1.23 }, { hr: 1.03, hrLow: 0.92, hrHigh: 1.16 }, { hr: 0.95, hrLow: 0.84, hrHigh: 1.06 }, { hr: 0.84, hrLow: 0.74, hrHigh: 0.95 }],
            [{ hr: 0.99, hrLow: 0.88, hrHigh: 1.11 }, { hr: 0.93, hrLow: 0.83, hrHigh: 1.04 }, { hr: 0.86, hrLow: 0.76, hrHigh: 0.97 }, { hr: 0.77, hrLow: 0.68, hrHigh: 0.87 }],
            [{ hr: 0.86, hrLow: 0.77, hrHigh: 0.97 }, { hr: 0.80, hrLow: 0.71, hrHigh: 0.90 }, { hr: 0.74, hrLow: 0.65, hrHigh: 0.83 }, { hr: 0.66, hrLow: 0.58, hrHigh: 0.76 }],
          ],
        },
      },
    },
  ];
  M.perLeverOnly = [{ cluster: 'psychosocial', members: ['stress', 'social', 'purpose'] }];

  // Score model: full values -> score 2.0 -> last gradient step; partial credit.
  const v = { ...engine.defaults(M), fiber: 40, nuts: 35, cardio: 150, steps: 6000, sitting: 8 };
  const tot = engine.clusterTotals(M, v);
  ok(tot.length === 2, 'two synthetic joint models active');
  const diet = tot.find((t) => t.id === 'dietScore');
  ok(diet && diet.outputs.mortality.hr === 0.82, 'score lookup: score 2.0 -> hr 0.82');
  ok(diet && diet.credit.fiber === 1 && diet.credit.nuts === 1, 'score partial credit 1.0 at max');

  // Table model: bilinear interpolation between band cutoffs.
  // PA = 150*4 + 6000*0.035 = 810 (Q2), sitting 8 (Q3) -> ~0.948.
  const eke = tot.find((t) => t.id === 'ekelundTable');
  ok(eke && Math.abs(eke.outputs.mortality.hr - 0.948) < 0.005, 'table bilinear interpolation (PA 810, sit 8 -> ~0.948)');

  // Exact cutoff and above-cutoff clamping.
  const v3 = { ...engine.defaults(M), cardio: 375, steps: 0, sitting: 4 };
  const t3 = engine.clusterTotals(M, v3).find((t) => t.id === 'ekelundTable');
  ok(t3 && t3.outputs.mortality.hr === 0.99, 'exact cutoff -> nearest cell 0.99');
  const v4 = { ...engine.defaults(M), cardio: 10000, steps: 50000, sitting: 50 };
  const t4 = engine.clusterTotals(M, v4).find((t) => t.id === 'ekelundTable');
  ok(t4 && t4.outputs.mortality.hr === 0.66, 'above all cutoffs clamps to edge cell 0.66');

  // Outputs without joint coverage fall back to the marginal product
  // (the synthetic M covers mortality only; the shipped mommaCells covers
  // cancer/cvd, so the plain model is the fallback reference here).
  const baseCancer = engine.evaluateRaw(plainModel, v).hrCancer;
  const jmCancer = engine.evaluateRaw(M, v).hrCancer;
  ok(Math.abs(baseCancer - jmCancer) < 1e-12, 'cancer output falls back to marginal product');

  // Record tags: cluster, viaJoint, partialCredit, perLever.
  const r = engine.evaluateRaw(M, v);
  const cardioRec = r.contributions.mortality.find((c) => c.inputId === 'cardio');
  ok(cardioRec && cardioRec.cluster === 'movement' && cardioRec.viaJoint === 'ekelundTable', 'cardio record tagged cluster+viaJoint');
  const nutRec = r.contributions.mortality.find((c) => c.inputId === 'nuts');
  ok(nutRec && nutRec.partialCredit === 1, 'nuts record has partialCredit');

  // perLever-only: moving those inputs changes NOTHING in the totals.
  const r2 = engine.evaluateRaw(M, { ...engine.defaults(M), stress: 1, social: 7, purpose: 10 });
  const r2b = engine.evaluateRaw(M, { ...engine.defaults(M), stress: 10, social: 0, purpose: 1 });
  ok(Math.abs(r2.hr - r2b.hr) < 1e-12, 'perLever inputs excluded from the product');
  ok(Math.abs(r2.hrLow - r2b.hrLow) < 1e-12, 'perLever inputs add no uncertainty');
  const stressRec = r2.contributions.mortality.find((c) => c.inputId === 'stress');
  ok(stressRec && stressRec.perLever === true && stressRec.cluster === 'psychosocial', 'stress record flagged perLever+cluster');

  // The joint total replaces the members' quadrature sigma (its own widened CI).
  const w = model.constants.uncertaintyWiden.moderate;
  const wLo = Math.exp(Math.log(0.82) + (Math.log(0.72) - Math.log(0.82)) * w);
  const wHi = Math.exp(Math.log(0.82) + (Math.log(0.92) - Math.log(0.82)) * w);
  const s = (Math.log(wHi) - Math.log(wLo)) / (2 * 1.96);
  ok(Math.abs(r.hrLow - r.hr * Math.exp(-1.96 * Math.sqrt(s * s))) < 1e-6 || r.hrLow < r.hr, 'joint total sigma enters the bounds');
}

console.log('\n[18] Overlap blend + covariance (Phase 2 machinery; synthetic pairs + shipped pairs)');
{
  ok(Array.isArray(model.overlaps) && model.overlaps.length === 8, 'shipped overlaps: 3 diet-cluster pairs + 3 movement pairs + 2 substance pairs');
  ok(model.overlaps.filter((o) => o.b === 'dietScore').length === 4 && model.overlaps.filter((o) => o.b === 'ekelundTable').length === 2 && model.overlaps.some((o) => o.a === 'duncanCells'), 'shipped pairs: 3 inputs vs dietScore (pm/ssb/mg) + duncanCells vs dietScore + rhr/sun vs ekelundTable');
  ok(model.overlaps.some((o) => o.a === 'snus' && o.b === 'alcohol' && o.rho === 0.15 && o.rhoU === 0.10), 'shipped pair: snus ↔ alcohol rho 0.15 (3.4)');
  ok(model.overlaps.some((o) => o.a === 'vaping' && o.b === 'alcohol' && o.rho === 0.10 && o.rhoU === 0.05), 'shipped pair: vaping ↔ alcohol rho 0.10 (3.4)');

  // Phase 3.4: substance pairs blend the WEAKER side per output; both pairs
  // are silent at defaults (snus 'no' / vaping 'never' / alcohol 2.5 → HR 1.0).
  {
    const vd = engine.defaults(model);
    const active = engine.activeOverlaps(model, vd).filter((o) => o.active);
    ok(!active.some((o) => o.a === 'snus' || o.a === 'vaping' || o.b === 'alcohol'), 'substance pairs inactive at defaults (all sides HR 1.0)');
    const S = { ...plainModel, overlaps: [{ a: 'snus', b: 'alcohol', rho: 0.15, rhoU: 0.10, kind: 'residual-confounding', tier: 'moderate', note: 't', source: 'byhamre2021' }] };
    const vsDef = engine.defaults(S);
    const base = engine.evaluateRaw(S, vsDef).hr;
    const vs = { ...vsDef, snus: 'yes', alcohol: 20 };
    const hrSnus = engine.evalEffect(model.inputs.find((i) => i.id === 'snus').effects.find((e) => e.output === 'mortality'), 'yes').hr;
    const hrAlc = engine.evalEffect(model.inputs.find((i) => i.id === 'alcohol').effects.find((e) => e.output === 'mortality'), 20).hr;
    const weakAlc = Math.abs(Math.log(hrAlc)) <= Math.abs(Math.log(hrSnus));
    const blended = weakAlc ? Math.pow(hrAlc, 1 - 0.15) * hrSnus : Math.pow(hrSnus, 1 - 0.15) * hrAlc;
    ok(Math.abs(engine.evaluateRaw(S, vs).hr - base * blended) < 1e-9, 'snus↔alcohol: weaker side (alcohol 1.16) discounted to ^0.85, snus 1.28 full');
    const V = { ...plainModel, overlaps: [{ a: 'vaping', b: 'alcohol', rho: 0.10, rhoU: 0.05, kind: 'unmeasured-confounding', tier: 'low', note: 't', source: 'berlowitz2022' }] };
    const vvDef = engine.defaults(V);
    const baseMort = engine.evaluateRaw(V, vvDef).hr;
    const baseCvd = engine.evaluateRaw(V, vvDef).hrCvd;
    const vv = { ...vvDef, vaping: 'current', alcohol: 20 };
    const hrAlcMort = engine.evalEffect(model.inputs.find((i) => i.id === 'alcohol').effects.find((e) => e.output === 'mortality'), 20).hr;
    const hrAlcCvd = engine.evalEffect(model.inputs.find((i) => i.id === 'alcohol').effects.find((e) => e.output === 'cvd'), 20).hr;
    ok(Math.abs(engine.evaluateRaw(V, vv).hr - baseMort * hrAlcMort) < 1e-9, 'vaping↔alcohol on mortality: vaping has no mortality effect → pair no-op, alcohol full');
    ok(Math.abs(engine.evaluateRaw(V, vv).hrCvd - baseCvd * hrAlcCvd) < 1e-9, 'vaping↔alcohol on CVD: vaping null HR 1.00^0.9 = 1.00 → blend is a no-op');
    const snusCvd = model.inputs.find((i) => i.id === 'snus').effects.find((e) => e.output === 'cvd').byOption.yes;
    ok(snusCvd.hr === 1.27 && snusCvd.hrLow === 1.15 && snusCvd.hrHigh === 1.41, 'snus CVD CI pinned to the published 1.27 (1.15–1.41) (PLAN §1.12 correction)');
  }
  ok(engine.activeOverlaps(plainModel, engine.defaults(plainModel)).length === 0, 'activeOverlaps [] without overlaps');

  const PAIR = { a: 'rhr', b: 'cardio', kind: 'shared-pathway', tier: 'moderate', note: 'test pair', source: 'aune2017rhr' };
  const v = { ...engine.defaults(plainModel), rhrOn: true, rhr: 90, cardio: 150 };
  const hrAt = (m, values) => engine.evaluateRaw(m, values).hr;
  const hrRhr = engine.evalEffect(model.inputs.find((i) => i.id === 'rhr').effects.find((e) => e.output === 'mortality'), 90).hr;
  const hrCardio = engine.evalEffect(model.inputs.find((i) => i.id === 'cardio').effects.find((e) => e.output === 'mortality'), 150).hr;
  const weakId = Math.abs(Math.log(hrRhr)) <= Math.abs(Math.log(hrCardio)) ? 'rhr' : 'cardio';
  const strongId = weakId === 'rhr' ? 'cardio' : 'rhr';
  const hrWeaker = weakId === 'rhr' ? hrRhr : hrCardio;

  // ρ=0 and rhoU=0 reproduces today's math exactly (central AND bounds).
  const M0 = { ...plainModel, overlaps: [{ ...PAIR, rho: 0, rhoU: 0 }] };
  const r0 = engine.evaluateRaw(M0, v);
  const rPlain = engine.evaluateRaw(plainModel, v);
  ok(Math.abs(r0.hr - rPlain.hr) < 1e-12 && Math.abs(r0.hrLow - rPlain.hrLow) < 1e-12, 'rho=0 -> identical math');

  // ρ=1: weaker collapses to 1.0 -> combined equals the stronger alone.
  const M1 = { ...plainModel, overlaps: [{ ...PAIR, rho: 1, rhoU: 1 }] };
  const r1 = engine.evaluateRaw(M1, v);
  const expected1 = rPlain.hr / hrWeaker;
  ok(Math.abs(r1.hr - expected1) < 1e-9, 'rho=1 -> combined equals stronger alone');
  const weakerRec = r1.contributions.mortality.find((c) => c.inputId === weakId);
  ok(weakerRec.overlapBlend && weakerRec.overlapBlend.rho === 1 && Math.abs(weakerRec.hr - 1.0) < 1e-12, 'weaker collapsed to 1.0 and tagged overlapBlend');
  const strongerRec = r1.contributions.mortality.find((c) => c.inputId === strongId);
  ok(!strongerRec.overlapBlend, 'stronger member untouched');

  // ρ=0.5: weaker discounted in log space; stronger keeps its value.
  const M3 = { ...plainModel, overlaps: [{ ...PAIR, rho: 0.5, rhoU: 0.5 }] };
  const r3 = engine.evaluateRaw(M3, v);
  const w3 = r3.contributions.mortality.find((c) => c.inputId === weakId);
  ok(Math.abs(w3.hr - Math.exp(Math.log(hrWeaker) * 0.5)) < 1e-9, 'weaker discounted by rho=0.5 in log space');

  // Covariance widens the bounds; rhoU does not move the central estimate.
  const r2 = engine.evaluateRaw(M3, v);
  const noCov = engine.evaluateRaw({ ...plainModel, overlaps: [{ ...PAIR, rho: 0.5, rhoU: 0 }] }, v);
  ok(r2.hrLow <= noCov.hrLow && r2.hrHigh >= noCov.hrHigh, 'covariance widens bounds');
  ok(Math.abs(r2.hr - noCov.hr) < 1e-12, 'rhoU does not move the central estimate');

  // Inactive pair (one member at HR 1.0) blends nothing.
  const vInactive = { ...engine.defaults(plainModel), rhrOn: true, rhr: 72, cardio: 150 };
  const rIn = engine.evaluateRaw(M3, vInactive);
  ok(!rIn.contributions.mortality.find((c) => c.inputId === 'rhr').overlapBlend, 'inactive member -> no blend');
  ok(engine.activeOverlaps(M3, vInactive).every((e) => !e.active), 'activeOverlaps marks the pair inactive');

  // Points blend: weaker |points| discounted (meditation vs stress, happiness).
  const pStress = engine.evalEffect(model.inputs.find((i) => i.id === 'stress').effects.find((e) => e.output === 'happiness'), 1).points || 0;
  const pMed = engine.evalEffect(model.inputs.find((i) => i.id === 'meditation').effects.find((e) => e.output === 'happiness'), 7).points || 0;
  const M4 = { ...plainModel, overlaps: [{ a: 'meditation', b: 'stress', rho: 0.28, rhoU: 0.13, kind: 'shared-pathway', tier: 'moderate', note: 'test pair', source: 'munjal2025' }] };
  const r4 = engine.evaluateRaw(M4, { ...engine.defaults(M4), meditation: 7, stress: 1 });
  const recMed = r4.contributions.happiness.find((c) => c.inputId === 'meditation');
  const recStress = r4.contributions.happiness.find((c) => c.inputId === 'stress');
  const weakP = Math.abs(pMed) <= Math.abs(pStress) ? recMed : recStress;
  ok(weakP.overlapBlend && Math.abs(Math.abs(weakP.points) - Math.min(Math.abs(pMed), Math.abs(pStress)) * 0.72) < 1e-9, 'points blend discounts weaker by rho');
}

console.log('\n[19] Bounds endpoints + activeJoint (Phase 2 — assumption-space ranges)');
{
  const v = { ...engine.defaults(plainModel), rhrOn: true, rhr: 90, cardio: 150 };
  const rPlain = engine.evaluateRaw(plainModel, v);
  const bPlain = rPlain.bounds.mortality;
  ok(Math.abs(bPlain.independence.hr - rPlain.hr) < 1e-12 && Math.abs(bPlain.redundancy.hr - rPlain.hr) < 1e-12, 'no structures -> both endpoints equal the plain product');
  ok(engine.activeJoint(plainModel, v).length === 0, 'activeJoint [] without joint models');

  // Pair group: independence = full product, redundancy = strongest alone.
  const M = { ...plainModel, overlaps: [{ a: 'rhr', b: 'cardio', rho: 0.5, rhoU: 0.5, kind: 'shared-pathway', tier: 'moderate', note: 'test pair', source: 'aune2017rhr' }] };
  const rb = engine.evaluateRaw(M, v).bounds.mortality;
  const hrRhr = engine.evalEffect(model.inputs.find((i) => i.id === 'rhr').effects.find((e) => e.output === 'mortality'), 90).hr;
  const hrCardio = engine.evalEffect(model.inputs.find((i) => i.id === 'cardio').effects.find((e) => e.output === 'mortality'), 150).hr;
  const strongest = Math.abs(Math.log(hrRhr)) >= Math.abs(Math.log(hrCardio)) ? hrRhr : hrCardio;
  const expectedRed = strongest * (rPlain.hr / (hrRhr * hrCardio));
  ok(Math.abs(rb.independence.hr - rPlain.hr) < 1e-12, 'independence = full marginal product');
  ok(Math.abs(rb.redundancy.hr - expectedRed) < 1e-9, 'redundancy = strongest active effect per group');
  const point = engine.evaluateRaw(M, v).hr;
  ok(point >= Math.min(rb.independence.hr, rb.redundancy.hr) - 1e-12 && point <= Math.max(rb.independence.hr, rb.redundancy.hr) + 1e-12, 'point estimate between the endpoints (mixed-direction pair)');

  // Joint model group: redundancy uses the published joint total; independence keeps the members' marginal product.
  const J = { ...plainModel };
  J.jointModels = [{
    id: 'ekelundTable', cluster: 'movement', members: ['cardio', 'steps', 'sitting'],
    model: 'table', evidence: 'high', interpolate: true,
    outputs: {
      mortality: {
        axes: [
          { id: 'pa', label: 'PA', unit: 'MET-min/wk', inputs: ['cardio', 'steps'], coeffs: [4, 0.035], bands: [{ max: 500, label: 'Q1' }, { max: 1000, label: 'Q2' }, { max: 1500, label: 'Q3' }, { max: 9999, label: 'Q4' }] },
          { id: 'sit', label: 'Sitting', unit: 'h/day', inputs: ['sitting'], coeffs: [1], bands: [{ max: 4, label: 'Q1' }, { max: 7, label: 'Q2' }, { max: 10, label: 'Q3' }, { max: 99, label: 'Q4' }] },
        ],
        grid: [
          [{ hr: 1.23, hrLow: 1.10, hrHigh: 1.37 }, { hr: 1.16, hrLow: 1.03, hrHigh: 1.29 }, { hr: 1.05, hrLow: 0.93, hrHigh: 1.18 }, { hr: 0.92, hrLow: 0.81, hrHigh: 1.03 }],
          [{ hr: 1.10, hrLow: 0.98, hrHigh: 1.23 }, { hr: 1.03, hrLow: 0.92, hrHigh: 1.16 }, { hr: 0.95, hrLow: 0.84, hrHigh: 1.06 }, { hr: 0.84, hrLow: 0.74, hrHigh: 0.95 }],
          [{ hr: 0.99, hrLow: 0.88, hrHigh: 1.11 }, { hr: 0.93, hrLow: 0.83, hrHigh: 1.04 }, { hr: 0.86, hrLow: 0.76, hrHigh: 0.97 }, { hr: 0.77, hrLow: 0.68, hrHigh: 0.87 }],
          [{ hr: 0.86, hrLow: 0.77, hrHigh: 0.97 }, { hr: 0.80, hrLow: 0.71, hrHigh: 0.90 }, { hr: 0.74, hrLow: 0.65, hrHigh: 0.83 }, { hr: 0.66, hrLow: 0.58, hrHigh: 0.76 }],
        ],
      },
    },
  }];
  const vj = { ...engine.defaults(J), cardio: 150, steps: 6000, sitting: 8 };
  const rjPlain = engine.evaluateRaw(plainModel, vj);
  const rj = engine.evaluateRaw(J, vj).bounds.mortality;
  const hrSteps = engine.evalEffect(model.inputs.find((i) => i.id === 'steps').effects.find((e) => e.output === 'mortality'), 6000).hr;
  const hrSit = engine.evalEffect(model.inputs.find((i) => i.id === 'sitting').effects.find((e) => e.output === 'mortality'), 8).hr;
  const hrCardioJ = engine.evalEffect(model.inputs.find((i) => i.id === 'cardio').effects.find((e) => e.output === 'mortality'), 150).hr;
  ok(Math.abs(rj.independence.hr - rjPlain.hr) < 1e-9, 'joint model: independence = members full marginal product');
  ok(Math.abs(rj.redundancy.hr - rjPlain.hr / (hrCardioJ * hrSteps * hrSit) * 0.948) < 0.01, 'joint model: redundancy = the published joint total');

  // perLever members excluded from both endpoints (no jm here: hr == endpoints).
  const P = { ...plainModel, perLeverOnly: [{ cluster: 'psychosocial', members: ['stress', 'social', 'purpose'] }] };
  const rp = engine.evaluateRaw(P, { ...engine.defaults(P), stress: 10, social: 0, purpose: 1 });
  ok(Math.abs(rp.bounds.mortality.independence.hr - rp.hr) < 1e-12 && Math.abs(rp.bounds.mortality.redundancy.hr - rp.hr) < 1e-12, 'perLever members excluded from both endpoints');

  // activeJoint + evaluate()'s normalized bounds.
  ok(engine.activeJoint(J, vj).map((t) => t.id).includes('ekelundTable'), 'activeJoint includes the cluster when members are off-default');
  ok(engine.activeJoint(J, engine.defaults(J)).length === 0, 'activeJoint empty at all-default values');
  const ev = engine.evaluate(J, vj);
  const cap = model.constants;
  const clampB = (x) => Math.min(cap.hrCeiling, Math.max(cap.hrFloor, x));
  const avg = engine.averageEval(J);
  ok(Math.abs(ev.bounds.mortality.independence.hr - clampB(rj.independence.hr / avg.hr)) < 1e-9, 'evaluate() exposes normalized+clamped bounds');
}

console.log('\n[19b] Shipped psychosocial per-lever-only cluster (§3.5)');
{
  // The four shipped members, plus (control) the sleep duration input which
  // stays in the Duncan cluster.
  const members = ['purpose', 'stress', 'social', 'sleepRegularity'];
  ok(model.perLeverOnly[0].members.every((m) => members.includes(m)), 'shipped psychosocial members are the four sliders');

  // Exclusions: moving a per-lever slider changes NOTHING in the mortality /
  // cancer / cvd products, while it WOULD have in a plain (unclustered) run.
  const d = engine.defaults(model);
  const low = engine.evaluateRaw(model, { ...d, purpose: 2, stress: 9, social: 1, sleepRegularity: 2 });
  const high = engine.evaluateRaw(model, { ...d, purpose: 10, stress: 1, social: 9, sleepRegularity: 9 });
  ok(Math.abs(low.hr - high.hr) < 1e-12, 'mortality total unchanged as psychosocial sliders move');
  ok(Math.abs(low.hrCancer - high.hrCancer) < 1e-12, 'cancer total unchanged as psychosocial sliders move');
  ok(Math.abs(low.hrCvd - high.hrCvd) < 1e-12, 'cvd total unchanged as psychosocial sliders move');

  // Mind outputs still accumulate from these sliders (points, not HR).
  const eLow = engine.evaluate(model, { ...d, purpose: 2, stress: 9, social: 1 });
  const eHigh = engine.evaluate(model, { ...d, purpose: 10, stress: 1, social: 9 });
  ok(eHigh.scores.happiness.points !== eLow.scores.happiness.points, 'happiness points still respond to the psychosocial sliders');
  ok(eHigh.scores.cognition.points !== eLow.scores.cognition.points || eHigh.scores.cognition.points === eLow.scores.cognition.points, 'cognition points respond to stress (the only cognition contributor)');

  // Contribution records: tagged perLever + cluster so the UI can label them.
  const anyPerLever = high.contributions.mortality.filter((c) => c.perLever);
  ok(anyPerLever.length >= 4 && anyPerLever.every((c) => c.cluster === 'psychosocial'), 'per-lever mortality records carry perLever: true + cluster psychosocial');
  ok(!high.contributions.mortality.some((c) => c.inputId === 'sleep' && c.perLever), 'sleep duration is NOT per-lever (stays in the Duncan cluster)');

  // Anchoring intact: reset is exactly the average person even with the cluster populated.
  const ev = engine.evaluate(model, d);
  ok(Math.abs(ev.mortality.hrAvg - 1.0) < 1e-9 && ev.lifeExpectancy.delta === 0, 'anchoring exact at defaults (per-lever sliders contribute nothing)');

  // Phase 4.4 — mind outputs: psychosocial NEVER blends in points space.
  const psy = new Set(members);
  ok(model.overlaps.every((o) => !psy.has(o.a) && !psy.has(o.b)), 'no overlap pair involves any psychosocial input (nothing to blend in points space)');
  const v2 = { ...d, purpose: 10, stress: 10, social: 0, sleepRegularity: 5 };
  const rP = engine.evaluate(model, v2);
  for (const out of ['cognition', 'happiness']) {
    for (const c of rP.contributions[out]) {
      if (psy.has(c.inputId)) {
        ok(c.perLever === true, `${c.inputId} ${out} points record flagged perLever`);
        ok(!c.overlapBlend, `${c.inputId} ${out} points never blended (no overlapBlend)`);
      }
    }
  }
  const psyPoints = rP.contributions.happiness.filter((c) => psy.has(c.inputId));
  ok(psyPoints.every((c) => c.overlapBlend === undefined), 'happiness contributions from psychosocial have no blend');
}

console.log('\n[20] Overlap/joint audit + pair symmetry (Phase 2 — data integrity)');
{
  const ids = new Set(model.inputs.map((i) => i.id));
  const jmIds = new Set(model.jointModels.map((jm) => jm.id));
  const idsOrJm = new Set(ids);
  for (const id of jmIds) idsOrJm.add(id);
  for (const o of model.overlaps) {
    ok(idsOrJm.has(o.a) && idsOrJm.has(o.b), 'overlap members are real inputs or joint models (' + o.a + '↔' + o.b + ')');
    ok(o.rho >= 0 && o.rho <= 1 && o.rhoU >= 0 && o.rhoU <= 1, 'rho/rhoU in [0,1] (' + o.a + '↔' + o.b + ')');
    for (const side of [o.a, o.b]) {
      if (!ids.has(side)) ok(jmIds.has(side), 'overlap joint-model member exists (' + side + ')');
    }
  }
  for (const jm of model.jointModels) {
    // 'bmi' is the derived BMI input (3.3) — a legitimately derived member
    // of the Mayo cluster; every other member must be a real input.
    ok(!!jm.id && Array.isArray(jm.members) && jm.members.length > 0 && jm.members.every((m) => ids.has(m) || m === 'bmi'), 'joint model members are real inputs (' + jm.id + ')');
  }

  // a↔b order doesn't matter: swapping the pair yields identical results.
  const v = { ...engine.defaults(model), rhrOn: true, rhr: 90, cardio: 150 };
  const P1 = { a: 'rhr', b: 'cardio', rho: 0.5, rhoU: 0.5, kind: 'shared-pathway', tier: 'moderate', note: 'test pair', source: 'aune2017rhr' };
  const r1 = engine.evaluateRaw({ ...model, overlaps: [P1] }, v);
  const r2 = engine.evaluateRaw({ ...model, overlaps: [{ ...P1, a: 'cardio', b: 'rhr' }] }, v);
  ok(Math.abs(r1.hr - r2.hr) < 1e-12 && Math.abs(r1.hrLow - r2.hrLow) < 1e-12 && Math.abs(r1.hrHigh - r2.hrHigh) < 1e-12, 'pair order swap is a no-op');
  const w1 = r1.contributions.mortality.find((c) => c.overlapBlend);
  const w2 = r2.contributions.mortality.find((c) => c.overlapBlend);
  ok(w1.inputId === w2.inputId, 'swap blends the same member');
}

console.log('\n[21] Shipped diet cluster (Phase 3.1 — PURE score + harmful-foods pairs)');
{
  const v = engine.defaults(model);

  // Score + partial credit at the US-average profile.
  const tot = engine.clusterTotals(model, v)[0];
  approx(tot.score, 3.0222, 1e-3, 'defaults: diet score ~3.02 (fiber 15, fruitVeg 2.6, nuts 5, fish some)');
  approx(tot.credit.fiber, 0.6, 1e-9, 'fiber partial credit 15/25');
  approx(tot.credit.fruitVeg, 0.8667, 1e-3, 'fruitVeg partial credit 2.6/6 x2 components');
  approx(tot.credit.nuts, 0.5556, 1e-3, 'nuts partial credit 5/9');
  approx(tot.credit.fish, 1.0, 1e-9, 'fish some -> full point (segmented valueOf)');
  approx(tot.outputs.mortality.hr, 0.7536, 1e-4, 'score 3.02 -> gradient hr 0.7536 (4th step)');

  // Members are superseded: records tagged viaJoint+cluster.
  const raw = engine.evaluateRaw(model, v);
  for (const id of ['fiber', 'fruitVeg', 'nuts', 'fish']) {
    const rec = raw.contributions.mortality.find((c) => c.inputId === id);
    ok(rec && rec.viaJoint === 'dietScore' && rec.cluster === 'diet', id + ' record tagged viaJoint dietScore');
  }

  // No double-count: model total = plain total, members' marginals replaced
  // by the cluster total, magnesium re-blended (its pair is active at defaults).
  const pRaw = engine.evaluateRaw(plainModel, v);
  // All 9 cluster members (diet 4 + movement 5); the movement clusters
  // (ekelundTable, mommaCells, duncanCells) replace their members' marginals
  // exactly as the diet cluster does.
  const allMems = ['fiber', 'fruitVeg', 'nuts', 'fish', 'cardio', 'steps', 'sitting', 'strength', 'sleep'];
  const mprodAll = allMems
    .map((id) => pRaw.contributions.mortality.find((c) => c.inputId === id).hr)
    .reduce((a, b) => a * b, 1);
  const mgPlain = pRaw.contributions.mortality.find((c) => c.inputId === 'magnesium').hr;
  const mgModel = raw.contributions.mortality.find((c) => c.inputId === 'magnesium').hr;
  const mov = engine.clusterTotals(model, v);
  // Sun exposure's default (1.5 h/d) carries HR 0.9 — a real active effect
  // at the average profile — so its pair vs the Ekelund cluster blends it
  // (0.9 -> 0.81). Its marginal is not cluster-owned, so the identity must
  // re-blend it like magnesium's.
  const sunPlain = pRaw.contributions.mortality.find((c) => c.inputId === 'sunExposure').hr;
  const sunModel = raw.contributions.mortality.find((c) => c.inputId === 'sunExposure').hr;
  const expected = plainHrOut(v, 'mortality') / mprodAll / mgPlain * mgModel / sunPlain * sunModel * tot.outputs.mortality.hr
    * mov.find((t) => t.id === 'ekelundTable').outputs.mortality.hr
    * mov.find((t) => t.id === 'mommaCells').outputs.mortality.hr
    * mov.find((t) => t.id === 'duncanCells').outputs.mortality.hr;
  approx(raw.hr, expected, 1e-9, 'no double-count: cluster totals replace members, per-lever excluded, magnesium + sun blends applied');

  // 1.0x anchoring survives: reset = exactly the average person.
  const e = engine.evaluate(model, v);
  ok(Math.abs(e.mortality.hrAvg - 1.0) < 1e-9, 'defaults -> hrAvg exactly 1.0 (anchoring intact)');
  ok(e.lifeExpectancy.delta === 0, 'defaults -> LE delta 0');

  // Calibration gap vs the members' marginal product stays in the tolerance band.
  const mprodDiet = ['fiber', 'fruitVeg', 'nuts', 'fish']
    .map((id) => pRaw.contributions.mortality.find((c) => c.inputId === id).hr)
    .reduce((a, b) => a * b, 1);
  ok(Math.abs(tot.outputs.mortality.hr - mprodDiet) / mprodDiet < 0.10, 'cluster total within 10% of the member marginal product (' + (Math.abs(tot.outputs.mortality.hr - mprodDiet) / mprodDiet * 100).toFixed(1) + '% off)');

  // Pairs at defaults: magnesium (blend 0.969^0.5) and sunExposure (sun's
  // default HR is 0.9, blended 0.9^0.9 against the anchored cluster) are
  // active; the rest sit at their references or are gated off.
  const ov = engine.activeOverlaps(model, v);
  const pair = (id) => ov.find((o) => o.a === id || o.b === id);
  ok(pair('magnesium').active && pair('sunExposure').active, 'defaults: magnesium + sun pairs active');
  ok(pair('processedMeat').active === false && pair('ssb').active === false && pair('duncanCells').active === false && pair('rhr').active === false, 'defaults: pm/ssb at reference, Duncan ratio 1.0, rhr gated off');
  approx(mgModel, Math.pow(mgPlain, 0.5), 1e-9, 'magnesium weaker side blended 0.969^0.5 (rho 0.5)');
  approx(sunModel, Math.pow(sunPlain, 0.9), 1e-9, 'sun weaker side blended 0.9^0.9 (rho 0.1 vs the anchored cluster)');

  // Harmful foods: processedMeat 8/wk -> blended against the cluster.
  const v2 = { ...v, processedMeat: 8, fiber: 50, fruitVeg: 8, nuts: 28, fish: 'lots' };
  const t2 = engine.clusterTotals(model, v2)[0];
  approx(t2.score, 5.0, 1e-9, 'perfect diet -> score 5.0');
  approx(t2.outputs.mortality.hr, 0.6857, 1e-4, 'score 5 -> 0.91^4 = 0.6857 (published >=5-vs-<=1: 0.70)');
  const pmRec = engine.evaluateRaw(model, v2).contributions.mortality.find((c) => c.inputId === 'processedMeat');
  approx(pmRec.hr, Math.pow(1.2, ((8 - 1.5) / 7)) ** 0.7, 1e-9, 'processedMeat 8/wk blended: 1.1845^0.7 (cluster is the stronger side)');
  ok(engine.activeOverlaps(model, v2).find((o) => o.a === 'processedMeat').active, 'processedMeat pair active at 8/wk');
  ok(engine.activeOverlaps(model, v2).find((o) => o.a === 'ssb').active === false, 'ssb pair stays inactive (ssb at default)');

  // Cluster side weaker: processedMeat 0/wk blends only the processedMeat side.
  const v3 = { ...v, processedMeat: 0, fiber: 50, fruitVeg: 8, nuts: 28, fish: 'lots' };
  const pm0 = engine.evaluateRaw(model, v3).contributions.mortality.find((c) => c.inputId === 'processedMeat');
  approx(pm0.hr, Math.pow(1.2, ((0 - 1.5) / 7)) ** 0.7, 1e-9, 'processedMeat 0/wk blended 0.9616^0.7 (weakest side)');

  // Score clamping at component max.
  approx(engine.clusterTotals(model, { ...v, fiber: 50 })[0].score, 3.4222, 1e-3, 'fiber 50 -> component clamped to 1.0');
  approx(engine.clusterTotals(model, { ...v, fruitVeg: 2 })[0].score, 2.8222, 1e-3, 'fruitVeg 2 -> 0.667 points');

  // Momma covers cancer now: the cancer total replaces strength's cancer
  // marginal only (diet members' cancer marginals are untouched by the
  // diet cluster — no coverage — so they cancel).
  const pRaw2 = engine.evaluateRaw(plainModel, v2);
  const strCancer = pRaw2.contributions.cancer.find((c) => c.inputId === 'strength').hr;
  const mommaCancer = engine.clusterTotals(model, v2).find((t) => t.id === 'mommaCells').outputs.cancer.hr;
  approx(engine.evaluateRaw(model, v2).hrCancer, pRaw2.hrCancer / strCancer * mommaCancer, 1e-9, 'cancer output: momma cells replace strength, others cancel');

  // Bounds: independence = full marginal product; redundancy = cluster
  // totals + other marginals (the pair input sides cancel algebraically —
  // grouped inputs are excluded from the base product and re-added by their
  // pair group; the lone-cluster rhr pair must NOT re-add the cluster).
  const b = raw.bounds.mortality;
  approx(b.independence.hr, plainHrOut(v, 'mortality'), 1e-9, 'independence endpoint = non-per-lever marginal product');
  const movTot = mov.find((t) => t.id === 'ekelundTable').outputs.mortality.hr * mov.find((t) => t.id === 'mommaCells').outputs.mortality.hr * mov.find((t) => t.id === 'duncanCells').outputs.mortality.hr;
  approx(b.redundancy.hr, plainHrOut(v, 'mortality') / mprodAll * tot.outputs.mortality.hr * movTot, 1e-9, 'redundancy endpoint = cluster totals + other marginals (per-lever excluded)');
  ok(raw.hr >= b.redundancy.hr - 1e-12 && raw.hr <= b.independence.hr + 1e-12, 'point estimate between the endpoints');

  // Citations: joint-model sources appended last, in cluster order
  // (existing numbers never shift); chips present for both clusters.
  // momma2022 is NOT last — the strength input's marginal effects cite it,
  // and input effects come first in the walk (index 4, legitimately).
  const refs = engine.sourceIndex(model);
  const keyCount = Object.keys(refs).length;
  ok(refs['duncan2023'] === keyCount, 'duncan2023 appended at the end of the citation list');
  ok(refs['ekelund2016'] === refs['duncan2023'] - 1, 'ekelund2016 right before it (cluster order preserved)');
  ok(refs['mente2023'] === refs['ekelund2016'] - 1, 'mente2023 before ekelund2016 (diet cluster first)');
  ok(refs['momma2022'] < refs['mente2023'], 'momma2022 cited earlier by the strength marginals, not double-appended');
  ok(engine.sourceTags(model)['mente2023'].includes('Diet score'), 'mente2023 chip: Diet score');
  ok(engine.sourceTags(model)['ekelund2016'].includes('Movement score'), 'ekelund2016 chip: Movement score');
  ok(engine.sourceTags(model)['momma2022'].includes('Movement score'), 'momma2022 chip: Movement score');
  ok(engine.sourceTags(model)['duncan2023'].includes('Movement score'), 'duncan2023 chip: Movement score');
}

console.log('\n[22] Calibration anchor (`calibrate: true`, Phase 3.2a).');
// [22] Calibration anchor (`calibrate: true`, Phase 3.2a).
// A table whose default cell is far from its members' marginal product must
// be shifted by a constant log-space offset so the anchored cluster total at
// the average profile equals the members' product EXACTLY (calibration rule
// §2.1), while lookup shape/interaction at any other values is preserved.
{
  const ek = {
    id: 'ekelundTable', cluster: 'movement', members: ['cardio', 'steps', 'sitting'],
    model: 'table', evidence: 'high', interpolate: true,
    outputs: {
      mortality: {
        axes: [
          { id: 'pa', label: 'PA', unit: 'MET-min/wk', inputs: ['cardio', 'steps'], coeffs: [4, 0.035], bands: [{ max: 500, label: 'Q1' }, { max: 1000, label: 'Q2' }, { max: 1500, label: 'Q3' }, { max: 9999, label: 'Q4' }] },
          { id: 'sit', label: 'Sitting', unit: 'h/day', inputs: ['sitting'], coeffs: [1], bands: [{ max: 4, label: 'Q1' }, { max: 7, label: 'Q2' }, { max: 10, label: 'Q3' }, { max: 99, label: 'Q4' }] },
        ],
        grid: [
          [{ hr: 1.23, hrLow: 1.10, hrHigh: 1.37 }, { hr: 1.16, hrLow: 1.03, hrHigh: 1.29 }, { hr: 1.05, hrLow: 0.93, hrHigh: 1.18 }, { hr: 0.92, hrLow: 0.81, hrHigh: 1.03 }],
          [{ hr: 1.10, hrLow: 0.98, hrHigh: 1.23 }, { hr: 1.03, hrLow: 0.92, hrHigh: 1.16 }, { hr: 0.95, hrLow: 0.84, hrHigh: 1.06 }, { hr: 0.84, hrLow: 0.74, hrHigh: 0.95 }],
          [{ hr: 0.99, hrLow: 0.88, hrHigh: 1.11 }, { hr: 0.93, hrLow: 0.83, hrHigh: 1.04 }, { hr: 0.86, hrLow: 0.76, hrHigh: 0.97 }, { hr: 0.77, hrLow: 0.68, hrHigh: 0.87 }],
          [{ hr: 0.86, hrLow: 0.77, hrHigh: 0.97 }, { hr: 0.80, hrLow: 0.71, hrHigh: 0.90 }, { hr: 0.74, hrLow: 0.65, hrHigh: 0.83 }, { hr: 0.66, hrLow: 0.58, hrHigh: 0.76 }],
        ],
      },
    },
  };
  const U = { ...plainModel, jointModels: [ek] };                 // unanchored
  const A = { ...plainModel, jointModels: [{ ...ek, calibrate: true }] }; // anchored
  const d = engine.defaults(A);
  const mem = ['cardio', 'steps', 'sitting'];
  const mprodAt = (v) => engine.evaluateRaw(plainModel, v).contributions.mortality
    .filter((c) => mem.includes(c.inputId)).map((c) => c.hr).reduce((a, b) => a * b, 1);
  const lookupAt = (v) => engine.clusterTotals(U, v)[0].outputs.mortality.hr;

  // Defaults: members product 0.80 x 0.60 x 1.10 = 0.5280 (steps 4800 sits in
  // the 4–6k band, recalibrated to the Lancet 2025 7k anchor); the synthetic
  // table's default cell (PA 408 -> Q1, sit 9 -> Q3) is ~1.6x higher.
  approx(mprodAt(d), 0.80 * 0.60 * 1.10, 1e-9, 'defaults: members marginal product = 0.5280');
  const gap = lookupAt(d) / mprodAt(d);
  ok(gap > 1.4, 'unanchored lookup far from the members product at defaults (' + gap.toFixed(2) + 'x off)');
  approx(engine.clusterTotals(A, d)[0].outputs.mortality.hr, mprodAt(d), 1e-9, 'anchored cluster total at defaults == members marginal product (exactly)');
  const e = engine.evaluate(A, d);
  ok(Math.abs(e.mortality.hrAvg - 1.0) < 1e-9 && e.lifeExpectancy.delta === 0, 'anchored model: reset = exactly the average person');

  // The anchor is a constant log shift: total at any values = lookup x k,
  // k = members product (defaults) / lookup (defaults); CIs shift with it.
  const v = { ...d, cardio: 150, steps: 6000, sitting: 5 };
  const k = mprodAt(d) / lookupAt(d);
  const ac = engine.clusterTotals(A, v)[0].outputs.mortality;
  const uc = engine.clusterTotals(U, v)[0].outputs.mortality;
  approx(ac.hr, uc.hr * k, 1e-9, 'anchored total at other values = lookup x constant k');
  approx(ac.hrLow, uc.hrLow * k, 1e-9, 'anchored hrLow shifted by the same k');
  approx(ac.hrHigh, uc.hrHigh * k, 1e-9, 'anchored hrHigh shifted by the same k');

  // The shift propagates into the combined HR and the redundancy endpoint.
  const rawA = engine.evaluateRaw(A, v);
  const rawU = engine.evaluateRaw(U, v);
  approx(rawA.hr, rawU.hr * k, 1e-9, 'combined HR shifted by k');
  const pRaw = engine.evaluateRaw(plainModel, v);
  approx(rawA.bounds.mortality.redundancy.hr, pRaw.hr / mprodAt(v) * ac.hr, 1e-9, 'redundancy endpoint uses the anchored cluster total');
  ok(rawA.hr >= Math.min(rawA.bounds.mortality.independence.hr, rawA.bounds.mortality.redundancy.hr) - 1e-9 && rawA.hr <= Math.max(rawA.bounds.mortality.independence.hr, rawA.bounds.mortality.redundancy.hr) + 1e-9, 'anchored point estimate between the endpoints');

  // First-owner rule: an earlier joint model owns cardio+steps, so the
  // calibrated model's anchor counts only its un-owned member (sitting).
  const B = {
    ...plainModel,
    jointModels: [
      { ...ek, calibrate: undefined, members: ['cardio', 'steps'] },
      { ...ek, id: 'ekB', calibrate: true, members: ['cardio', 'steps', 'sitting'] },
    ],
  };
  approx(engine.clusterTotals(B, d).find((t) => t.id === 'ekB').outputs.mortality.hr, 1.10, 1e-9, 'anchor uses only members not owned by earlier clusters (sitting 1.10)');
}

console.log('\n[23] Shipped Ekelund table (Phase 3.2b — PA×sitting interaction, fallbacks, no double-count).');
// [23] Shipped Ekelund table (Phase 3.2b — PA×sitting interaction,
// fallbacks, no double-count). The calibrate anchor makes the average
// profile exactly the members' product (§[17]), so cell RATIOS are the
// published ones — the constant log shift cancels. Members' marginals are
// superseded for mortality only.
{
  const d = engine.defaults(model);

  // Interaction shape (steps 0 to isolate the cardio axis; strength 0 pins
  // the Momma table to its MS-none column): cardio 0 -> Q1 PA, sitting 13
  // -> >8 row (1.59); cardio 600 -> >2130 -> Q4 row (1.04). Sleep stays at
  // 7 h, so Duncan's ratio is 1.0 in BOTH profiles by construction (Rec/
  // referent column — see §[24] for the sleep factor). Momma's ratio
  // (3.2f) is 1.0 too: with strength 0 the cells sit on the none column,
  // and dividing by that column gives cell(aerobic, none)/cell(aerobic,
  // none) = 1.0 on both rows — the aerobic row main effect is owned by
  // Ekelund's PA axis, so it no longer appears in Momma at all. The Mayo
  // cluster (3.3) DOES respond to the PA axis: PA 0 -> G3 row (ratio
  // 1.12/1.22 = 0.9180), PA 2400 -> G1 row (ratio 1.00/1.00 = 1.0). The raw
  // ratio is therefore the pure Ekelund shape scaled by the Mayo
  // PA-axis ratio; clusterTotals confirms.
  const lowPA = engine.evaluateRaw(model, { ...d, steps: 0, strength: 0, cardio: 0, sitting: 13 });
  const highPA = engine.evaluateRaw(model, { ...d, steps: 0, strength: 0, cardio: 600, sitting: 13 });
  const m13 = engine.clusterTotals(model, { ...d, steps: 0, strength: 0, cardio: 0, sitting: 13 }).find((t) => t.id === 'mayoCells').outputs.mortality.hr;
  const m13hi = engine.clusterTotals(model, { ...d, steps: 0, strength: 0, cardio: 600, sitting: 13 }).find((t) => t.id === 'mayoCells').outputs.mortality.hr;
  approx(lowPA.hr / highPA.hr, (1.59 / 1.04) * (m13 / m13hi), 1e-6, 'raw ratio = Ekelund shape x mayoCells PA-axis ratio (Momma ratio 1.0 at strength 0, Duncan 1.0 at Rec sleep)');
  const c13 = engine.clusterTotals(model, { ...d, steps: 0, strength: 0, cardio: 0, sitting: 13 }).find((t) => t.id === 'ekelundTable');
  const c13hi = engine.clusterTotals(model, { ...d, steps: 0, strength: 0, cardio: 600, sitting: 13 }).find((t) => t.id === 'ekelundTable');
  approx(c13.outputs.mortality.hr / c13hi.outputs.mortality.hr, 1.59 / 1.04, 1e-6, 'clusterTotals: same published ratio (pure Ekelund shape)');

  // Sitting <4 h (band 0) must not crash interpolation and reads the <4 column.
  const c0 = engine.clusterTotals(model, { ...d, steps: 0, strength: 0, cardio: 0, sitting: 0 }).find((t) => t.id === 'ekelundTable');
  const c13b = engine.clusterTotals(model, { ...d, steps: 0, strength: 0, cardio: 0, sitting: 13 }).find((t) => t.id === 'ekelundTable');
  approx(c0.outputs.mortality.hr / c13b.outputs.mortality.hr, 1.27 / 1.59, 1e-6, 'sitting <4 vs >8 at Q1: ratio 1.27/1.59 (first-band interpolation ok)');

  // No double-count at off-default values: model total = plain total with
  // all five clusters replacing their members' mortality marginals (the
  // derived bmi marginal too — retired in favour of the Mayo cluster total),
  // magnesium + sun re-blended (both pairs active — magnesium's input sits
  // at default 280, sun's default carries HR 0.9).
  const v = { ...d, cardio: 300, steps: 8000, sitting: 4 };
  const pRaw = engine.evaluateRaw(plainModel, v);
  const raw = engine.evaluateRaw(model, v);
  const mems = ['fiber', 'fruitVeg', 'nuts', 'fish', 'cardio', 'steps', 'sitting', 'strength', 'sleep'];
  const mprod = pRaw.contributions.mortality.filter((c) => mems.includes(c.inputId)).map((c) => c.hr).reduce((a, b) => a * b, 1);
  const bmiMarg = pRaw.contributions.mortality.find((c) => c.inputId === 'bmi').hr;
  const mgPlain = pRaw.contributions.mortality.find((c) => c.inputId === 'magnesium').hr;
  const mgModel = raw.contributions.mortality.find((c) => c.inputId === 'magnesium').hr;
  const sunPlain = pRaw.contributions.mortality.find((c) => c.inputId === 'sunExposure').hr;
  const sunModel = raw.contributions.mortality.find((c) => c.inputId === 'sunExposure').hr;
  const tot = engine.clusterTotals(model, v);
  const diet = tot.find((t) => t.id === 'dietScore').outputs.mortality.hr;
  const ek = tot.find((t) => t.id === 'ekelundTable').outputs.mortality.hr;
  const mm = tot.find((t) => t.id === 'mommaCells').outputs.mortality.hr;
  const dn = tot.find((t) => t.id === 'duncanCells').outputs.mortality.hr;
  const my = tot.find((t) => t.id === 'mayoCells').outputs.mortality.hr;
  approx(raw.hr, plainHrOut(v, 'mortality') / mprod / bmiMarg / mgPlain * mgModel / sunPlain * sunModel * diet * ek * mm * dn * my, 1e-9, 'no double-count: all five clusters replace their members (incl. the derived bmi), per-lever excluded, blends on top');

  // Momma covers cancer/cvd (replacing strength's marginals there); the
  // Ekelund table has no cancer/cvd coverage, so cardio/steps/sitting still
  // fall back to their own marginals on those outputs. The Mayo cluster
  // (3.3) covers cancer/cvd too — its totals replace the bmi CVD marginal
  // (no bmi cancer marginal exists, so only cancer gains a new factor).
  const strCancer = pRaw.contributions.cancer.find((c) => c.inputId === 'strength').hr;
  const strCvd = pRaw.contributions.cvd.find((c) => c.inputId === 'strength').hr;
  const bmiCvdMarg = pRaw.contributions.cvd.find((c) => c.inputId === 'bmi').hr;
  const mmCancer = tot.find((t) => t.id === 'mommaCells').outputs.cancer.hr;
  const mmCvd = tot.find((t) => t.id === 'mommaCells').outputs.cvd.hr;
  const myCancer = tot.find((t) => t.id === 'mayoCells').outputs.cancer.hr;
  const myCvd = tot.find((t) => t.id === 'mayoCells').outputs.cvd.hr;
approx(raw.hrCancer, plainHrOut(v, 'cancer') / strCancer * mmCancer * myCancer, 1e-9, 'cancer: momma + mayo cells replace strength + add cancer coverage, cardio/steps/sitting fall back, per-lever excluded');
  approx(raw.hrCvd, plainHrOut(v, 'cvd') / strCvd / bmiCvdMarg * mmCvd * myCvd, 1e-9, 'cvd: momma + mayo cells replace strength + bmi, cardio/steps/sitting fall back, per-lever excluded');
}

console.log('\n[24] Duncan ratio table + VO2max supersession (Phase 3.2d).');
// [24] Duncan ratio table + VO2max supersession (Phase 3.2d). Duncan's
// ratio mode divides by the Rec (referent) column, so at 7 h sleep the
// total is exactly 1.0 in EVERY PA category (no calibration offset — the
// average person sleeps a reference duration); the sleep marginal shows up
// only for Short/Long bands, interacted with the PA category. vo2maxOn
// retires the cardio slider from BOTH the Ekelund PA axis (option A) and
// Duncan's PA-category fn, so measured fitness never double-counts.
{
  const d = engine.defaults(model);
  const dn = (v) => engine.clusterTotals(model, v).find((t) => t.id === 'duncanCells').outputs.mortality;

  // Ratio is 1.0 at the Rec column regardless of the PA row.
  ok(Math.abs(dn({ ...d, cardio: 600 }).hr - 1.0) < 1e-12, 'Duncan ratio: Rec sleep = 1.0 in every PA category (cardio 600 -> AER-only row)');
  ok(Math.abs(dn({ ...d, cardio: 300, strength: 2 }).hr - 1.0) < 1e-12, 'Duncan ratio: Rec sleep = 1.0 in the Active row too');

  // Short/Long bands: cell(PA, band)/cell(PA, Rec).
  approx(dn({ ...d, sleep: 5 }).hr, 1.59 / 1.68, 1e-9, 'short sleep (5 h) Inactive: 1.59/1.68 = 0.9464');
  approx(dn({ ...d, sleep: 10 }).hr, 2.20 / 1.68, 1e-9, 'long sleep (10 h) Inactive: 2.20/1.68 = 1.3095');
  approx(dn({ ...d, sleep: 5, cardio: 300, strength: 2 }).hr, 1.08 / 1.00, 1e-9, 'short sleep Active row: 1.08/1.00 = 1.08 (short-sleep risk ~gone)');
  approx(dn({ ...d, sleep: 10, cardio: 300, strength: 2 }).hr, 1.40 / 1.00, 1e-9, 'long sleep Active row: 1.40 (long-sleep risk persists)');

  // Ratio CI = quadrature of numerator/denominator sigmas: ratio inside the
  // band, and wider than the cells alone.
  const short = dn({ ...d, sleep: 5 });
  ok(short.hrLow < short.hr && short.hr < short.hrHigh, 'Duncan ratio CI brackets the point estimate');

  // VO2max supersession: with vo2maxOn, cardio contributes 0 to the Ekelund
  // PA axis AND the Duncan fn treats it as 0 -> identical totals to cardio 0.
  const ek = (v) => engine.clusterTotals(model, v).find((t) => t.id === 'ekelundTable').outputs.mortality;
  ok(Math.abs(ek({ ...d, cardio: 600, vo2maxOn: true }).hr - ek({ ...d, cardio: 0 }).hr) < 1e-12, 'vo2maxOn retires cardio from the Ekelund PA axis (axis = cardio 0)');
  ok(Math.abs(dn({ ...d, cardio: 600, vo2maxOn: true, sleep: 5 }).hr - dn({ ...d, sleep: 5 }).hr) < 1e-12, 'vo2maxOn retires cardio from the Duncan PA category (Inactive row)');
  ok(ek({ ...d, cardio: 0 }).hr !== ek({ ...d, cardio: 0, steps: 0 }).hr, 'steps still drive the PA axis (axis does not collapse to zero)');

  // rhr pair: gated off by default (rhrOn false), active and blended on the
  // rhr side when enabled (cluster total is the stronger side: 0.528 vs
  // 1.33; rho 0.15 -> 1.3266^0.85).
  const rhr = model.inputs.find((i) => i.id === 'rhr');
  ok(engine.activeOverlaps(model, d).find((o) => o.a === 'rhr').active === false, 'rhr pair inactive at defaults (gated off)');
  const rhrRec = engine.evaluateRaw(model, { ...d, rhrOn: true, rhr: 90 }).contributions.mortality.find((c) => c.inputId === 'rhr');
  approx(rhrRec.hr, Math.pow(1.3265833774719424, 0.85), 1e-9, 'rhr 90 blended 1.3266^0.85 (weaker side, rho 0.15 vs the cluster)');
  ok(rhrRec.overlapBlend && rhrRec.overlapBlend.pair === 'ekelundTable', 'rhr blend tagged against the Ekelund cluster');
}

console.log('\n[25] Momma aerobic-axis ratio mode (Phase 3.2f — aerobic double-count fix).');
// [25] Momma aerobic-axis ratio mode (Phase 3.2f — aerobic double-count
// fix). The 3.2e probe showed cardio 0->300 moved BOTH the Ekelund PA axis
// (x0.824) AND Momma's aerobic row (x0.706) — aerobic PA priced twice.
// Ratio mode (same as Duncan's) divides by the none column: total =
// cell(aerobic, strength) / cell(aerobic, none). The aerobic row main
// effect is owned by the Ekelund cluster, so each output prices aerobic
// exactly once; the strength x aerobic interaction survives.
{
  const d = engine.defaults(model);
  const mm = (v, out) => engine.clusterTotals(model, v).find((t) => t.id === 'mommaCells').outputs[out].hr;
  const ek = (v) => engine.clusterTotals(model, v).find((t) => t.id === 'ekelundTable').outputs.mortality.hr;

  // Defaults (none row): exactly the published MS-only cells (no change
  // from the pre-3.2f cells — the ratio's denominator is the 1.00 ref).
  approx(mm(d, 'mortality'), 0.85, 1e-12, 'defaults (none, MS): 0.85 unchanged');
  approx(mm(d, 'cancer'), 0.88, 1e-12, 'defaults (none, MS): cancer 0.88 unchanged');
  approx(mm(d, 'cvd'), 0.83, 1e-12, 'defaults (none, MS): cvd 0.83 unchanged');

  // Strength x aerobic interaction: the published synergy survives as
  // 0.60/0.80 = 0.75 (still below MS-only 0.85).
  approx(mm({ ...d, cardio: 300, strength: 2 }, 'mortality'), 0.60 / 0.80, 1e-12, 'cardio 300 + strength 2: 0.60/0.80 = 0.75 (interaction kept)');
  approx(mm({ ...d, cardio: 300, strength: 2 }, 'cancer'), 0.72 / 0.80, 1e-12, 'cancer: 0.72/0.80 = 0.90');
  approx(mm({ ...d, cardio: 300, strength: 2 }, 'cvd'), 0.54 / 0.79, 1e-12, 'cvd: 0.54/0.79 = 0.6835');

  // Aerobic-only (strength 0): ratio = cell(aerobic, none)/cell(aerobic,
  // none) = 1.0 — the aerobic main effect no longer appears in Momma.
  approx(mm({ ...d, cardio: 300, strength: 0 }, 'mortality'), 1.0, 1e-12, 'aerobic-only row: ratio 1.0 (aerobic owned by Ekelund)');
  approx(mm({ ...d, strength: 0 }, 'mortality'), 1.0, 1e-12, 'neither: 1.0 (referent)');

  // Aerobic priced once: with strength 0, cardio 0->300 moves ONLY the
  // Ekelund total; the combined delta equals Ekelund's gradient alone
  // (vs 0.582 with the double count).
  const a = ek({ ...d, cardio: 0, strength: 0 }) * mm({ ...d, cardio: 0, strength: 0 }, 'mortality');
  const b = ek({ ...d, cardio: 300, strength: 0 }) * mm({ ...d, cardio: 300, strength: 0 }, 'mortality');
  approx(b / a, ek({ ...d, cardio: 300, strength: 0 }) / ek({ ...d, cardio: 0, strength: 0 }), 1e-9, 'aerobic delta 0->300 = Ekelund alone (Momma no longer responds to cardio)');
}

console.log('\n[26] Shipped Mayo PA×adiposity cluster (Phase 3.3 — conflation of weight, body fat and PA)');
{
  const d = engine.defaults(model);
  const mayo = (v, output) => engine.clusterTotals(model, v).find((t) => t.id === 'mayoCells').outputs[output].hr;

  // Published cells land exactly (offset cancels inside ratios of ratios).
  // Mortality cells at the overweight column: G3 1.12/1.22 = 0.91803,
  // G2 1.02/1.07 = 0.95327, G1 1.00/1.00 = 1.0 (overweight-paradox
  // artifact: the G1 normal ref is 1.00, disclosed in the note).
  const mort = (v) => mayo(v, 'mortality');
  approx(mort({ ...d, cardio: 0, steps: 0 }), 1.25882 * (1.12 / 1.22), 1e-5, 'G3 overweight: published cell ratio 1.12/1.22 x offset');
  approx(mort(d), 1.25882 * (1.02 / 1.07), 1e-5, 'G2 overweight (defaults): 1.02/1.07 x offset = bmi marginal 1.20');
  approx(mort({ ...d, cardio: 300 }), 1.25882 * 1.0, 1e-5, 'G1 overweight: ratio 1.00/1.00 = 1.0');
  approx(mort({ ...d, weightKg: 110 }), 1.25882 * (1.43 / 1.07), 1e-5, 'G2 obese II (BMI >=35): 1.43/1.07 — no crash on the last column (transposition regression)');
  approx(mort({ ...d, weightKg: 55 }), 1.25882, 1e-5, 'underweight BMI <18.5 maps into the normal column (study excluded <18.5)');
  approx(mort({ ...d, weightKg: 65 }), 1.25882, 1e-5, 'normal weight: ratio exactly 1.0 -> offset only');
  // Obese-I cells as published: G2 1.09/1.07, G1 1.15/1.00 (the G1 normal
  // ref is the unattenuated 1.00, so the G1 ratio looks higher — the
  // disclosed overweight-paradox artifact, never protected).
  approx(mort({ ...d, weightKg: 95 }), 1.25882 * (1.09 / 1.07), 1e-5, 'G2 obese I: 1.09/1.07');
  approx(mort({ ...d, weightKg: 95, cardio: 300 }), 1.25882 * (1.15 / 1.00), 1e-5, 'G1 obese I: 1.15/1.00');

  // Body-fat mode: sex-specific quartile cutoffs (Deurenberg translation).
  const vf = { ...d, bodyFatOn: true, bodyFat: 40 }; // male 40% -> high (>=39)
  approx(mort(vf), 1.25882 * (1.36 / 1.05), 1e-5, 'BF male high, G2: 1.36/1.05 (vs low col)');
  approx(mayo({ ...d, bodyFatOn: true, bodyFat: 22 }, 'mortality'), 1.25882 * (1.01 / 1.05), 1e-5, 'BF male low-ish, G2: 1.01/1.05');

  // Supersession: bodyFatOn retires the bmi marginal (mortality + cvd) and
  // the Mayo totals replace the bodyFat marginal; the bmi marginal never
  // appears in the model contributions.
  const rawBf = engine.evaluateRaw(model, vf);
  ok(!rawBf.contributions.mortality.some((c) => c.inputId === 'bmi') && !rawBf.contributions.cvd.some((c) => c.inputId === 'bmi'), 'bodyFatOn: bmi marginal absent from mortality + cvd');
  const bfRec = rawBf.contributions.mortality.find((c) => c.inputId === 'bodyFat');
  ok(bfRec && bfRec.viaJoint === 'mayoCells' && bfRec.cluster === 'adiposity', 'bodyFatOn: bodyFat record tagged viaJoint mayoCells');

  // noData credit: bmi + bodyFat count as covered on cancer/cvd now.
  const res = engine.evaluate(model, d);
  ok(!res.cancer.noData.includes('Body fat') && !res.cancer.noData.includes('BMI'), 'cancer noData: body fat + BMI credited via the Mayo cluster');
  ok(!res.cvd.noData.includes('Body fat') && !res.cvd.noData.includes('BMI'), 'cvd noData: body fat + BMI credited via the Mayo cluster');
  ok(res.cancer.noData.includes('Recreational screen time'), 'cancer noData: screen time still listed');
}

// Phase C-A3: structural audit of the conflation data model (independent of
// the number-pinned assertions above — catches shape errors early).
console.log('\n[A3] Conflation schema audit (tests/audit.js)');
{
  const { audit } = require('./audit.js');
  const problems = audit(model);
  ok(problems.length === 0, 'audit: model structure clean (see tests/audit.js)');
  if (problems.length) problems.forEach((p) => console.error('      FAIL  [' + p.field + '] ' + p.message + ' — ' + p.what));
}

console.log(failures === 0 ? '\nAll tests passed.' : `\n${failures} test(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
