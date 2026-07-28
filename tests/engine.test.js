/*
 * engine.test.js — dependency-free smoke tests. Run: `node tests/engine.test.js`
 *
 * These check the model math AND audit the data file (every effect must cite
 * an existing source, steps must be sorted, bounds must bracket the central
 * estimate). If you edit js/factors.js, run this.
 */

const model = require('../js/factors.js');
const engine = require('../js/engine.js');

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
    fiber: 0, fruitVeg: 0, processedMeat: 1.5, ssb: 0, fish: 'none', nuts: 0,
    alcohol: 0, coffee: 0, magnesium: 250,
    sleep: 7.5, stress: 2, social: 5, purpose: 5,
    occupationalPA: 0,
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
  const r1 = engine.evaluate(model, { ...neutralValues(), cardio: 150 });
  approx(r1.mortality.hr, 0.69, 1e-9, 'cardio 150 min/wk -> HR 0.69 (arem2015)');

  const r2 = engine.evaluate(model, { ...neutralValues(), fiber: 40 });
  approx(r2.mortality.hr, Math.pow(0.9, 3), 1e-9, 'fiber 40 g/d capped at 30 g -> HR 0.9^3');

  const r3 = engine.evaluate(model, { ...neutralValues(), fruitVeg: 10 });
  approx(r3.mortality.hr, Math.pow(0.95, 5), 1e-9, 'fruit/veg capped at 5 servings');

  const r4 = engine.evaluate(model, { ...neutralValues(), alcohol: 30 });
  approx(r4.mortality.hr, 1.56, 1e-9, 'alcohol >25 drinks/wk -> HR 1.56 (wood2018)');

  const r5 = engine.evaluate(model, { ...neutralValues(), sleep: 5 });
  approx(r5.mortality.hr, 1.12, 1e-9, 'short sleep -> HR 1.12 (cappuccio2010)');
  ok(r5.scores.cognition.points < 0, 'short sleep hurts cognition score');

  const r6 = engine.evaluate(model, { ...neutralValues(), creatine: true });
  const r6base = engine.evaluate(model, { ...neutralValues(), creatine: false });
  approx(r6.scores.cognition.points - r6base.scores.cognition.points, 0.5, 1e-9,
    'creatine -> +0.5 cognition (avgerinos2018)');
  approx(r6.mortality.hr, 1.0, 1e-9, 'creatine has no mortality claim');
}

console.log('\n[3] Reference profile = raw HR 1.0');
{
  const r = engine.evaluate(model, referenceValues());
  approx(r.mortality.hr, 1.0, 0.02, 'reference profile raw HR ~ 1.0');
  // The per-study reference strata are NOT a coherent "worst lifestyle":
  // they mix no-exercise/no-fiber with lean/calm/connected. So we don't
  // assert a direction vs the average person — just document the gap.
  ok(Math.abs(r.mortality.hrAvg - 1) > 0.01, 'reference profile differs from average person (hrAvg ' + r.mortality.hrAvg.toFixed(2) + ')');
  const avg = engine.averageEval(model);
  ok(avg.hr > 0.5 && avg.hr < 2.0, 'average profile raw HR is sane (' + avg.hr.toFixed(3) + ')');
}

console.log('\n[4] Calibration cross-checks (Gompertz vs published year-estimates)');
{
  // Single factor changed from the AVERAGE profile: the average cancels, so
  // the vs-average ratio equals the factor's own HR.
  const smoker = engine.evaluate(model, { ...engine.defaults(model), smoking: 'current' });
  approx(smoker.mortality.hrAvg, 2.9, 1e-9, 'smoker ratio vs average = 2.9 (avg cancels)');
  approx(smoker.lifeExpectancy.delta, -10.8, 1.5, 'current smoker ~ -11 years (jha2013: >10 y lost)');

  // Moore 2012 compared 0 vs 450+ min/wk: model must reproduce +4.5-5 y for that swing
  const d0 = engine.evaluate(model, { ...engine.defaults(model), cardio: 0 });
  const d500 = engine.evaluate(model, { ...engine.defaults(model), cardio: 500 });
  approx(d500.lifeExpectancy.delta - d0.lifeExpectancy.delta, 5.0, 1.0, '0 -> 500 min/wk cardio ~ +5 years (moore2012: +4.5 y)');

  // hrToYears / yearsToHr round-trip
  approx(engine.hrToYears(model, engine.yearsToHr(model, -4.5)), -4.5, 1e-9, 'years<->hr round-trip');
}

console.log('\n[5] Combination + clamping');
{
  const allHealthy = engine.evaluate(model, {
    ...referenceValues(),
    cardio: 500, strength: 3, fiber: 40, fruitVeg: 8,
    coffee: 4, sauna: 5, social: 7, stress: 2, sleep: 8,
    heightCm: 176, weightKg: 68,
  });
  ok(allHealthy.mortality.clamped, 'all-healthy profile hits the humility floor (hrAvg ' + allHealthy.mortality.hrAvg + ')');
  approx(allHealthy.mortality.hrAvg, model.constants.hrFloor, 1e-9, 'hrAvg clamped at floor');
  ok(allHealthy.lifeExpectancy.delta <= model.constants.yearsCapGain + 1e-9, 'LE gain capped');

  const mixed = engine.evaluate(model, { ...referenceValues(), cardio: 300, strength: 2 });
  approx(mixed.mortality.hr, 0.63 * 0.85, 1e-9, 'cardio x strength multiply');
  ok(mixed.mortality.hrLow < mixed.mortality.hr && mixed.mortality.hr < mixed.mortality.hrHigh,
    'uncertainty range brackets central estimate');
}

console.log('\n[6] Mind bands');
{
  const low = engine.evaluate(model, { ...neutralValues(), stress: 10, sleep: 5, social: 0 });
  ok(low.scores.happiness.points < -1.25, 'bad profile -> happiness well below average');
  ok(/below average/.test(low.scores.happiness.label), 'happiness band label below average');

  const neutral = engine.evaluate(model, neutralValues());
  ok(/average/.test(neutral.scores.cognition.label), 'neutral cognition lands on an "average" band');

  const boost = engine.evaluate(model, { ...neutralValues(), cardio: 300, creatine: true, strength: 3 });
  ok(boost.scores.cognition.points > 0.35, 'creatine + exercise lifts cognition band');
}

console.log('\n[7] BMI derivation');
{
  const obese = engine.evaluate(model, { ...neutralValues(), heightCm: 170, weightKg: 110 });
  approx(obese.bmi, 38.1, 0.2, 'BMI computed');
  approx(obese.mortality.hr, 1.94, 1e-9, 'BMI 38 -> HR 1.94 (diangelantonio2016)');
}

console.log('\n[8] Defaults = population average (the "reset" contract)');
{
  const r = engine.evaluate(model, engine.defaults(model));
  approx(r.mortality.hrAvg, 1.0, 1e-9, 'defaults -> exactly 1.0x the average person');
  approx(r.lifeExpectancy.delta, 0, 1e-9, 'defaults -> LE delta 0 (average person = baseline)');
  approx(r.lifeExpectancy.estimate, model.baseline.lifeExpectancy.unspecified, 1e-9, 'defaults -> baseline LE');
  approx(r.scores.cognition.relPoints, 0, 1e-9, 'defaults -> cognition 0 vs average');
  approx(r.scores.happiness.relPoints, 0, 1e-9, 'defaults -> happiness 0 vs average');
  ok(r.scores.cognition.label === 'about average', 'defaults -> "about average" bands');
}

console.log('\n[9] Uncertainty widening (less certain evidence = wider range)');
{
  const r = engine.evaluate(model, { ...neutralValues(), sauna: 5 }); // low evidence
  const m = r.mortality;
  ok(m.hrLow < 0.45, 'low-evidence lower bound widened beyond published CI (got ' + m.hrLow.toFixed(3) + ' < 0.45)');
  ok(m.hrHigh > 0.81, 'low-evidence upper bound widened beyond published CI (got ' + m.hrHigh.toFixed(3) + ' > 0.81)');
  approx(m.hr, 0.60, 1e-9, 'central estimate unchanged by widening');

  const r2 = engine.evaluate(model, { ...neutralValues(), cardio: 300 }); // high evidence
  approx(r2.mortality.hrLow, 0.62, 0.01, 'high evidence keeps ~published CI (0.62, quadrature-symmetrized)');
}

console.log('\n[10] Advanced inputs: gating + supersession');
{
  const off = engine.evaluate(model, { ...neutralValues(), vo2maxOn: false, vo2max: 50 });
  approx(off.mortality.hr, 1.0, 1e-9, 'VO2max ignored while its toggle is off');

  const on = engine.evaluate(model, { ...neutralValues(), vo2maxOn: true, vo2max: 42, cardio: 300 });
  approx(on.mortality.hr, Math.pow(0.87, 4), 1e-9, 'VO2max 42 -> 0.87^4 (kodama2009), cardio superseded');
  ok(!on.contributions.mortality.some((c) => c.inputId === 'cardio'), 'cardio contribution removed when VO2max enabled');

  const bf = engine.evaluate(model, { ...neutralValues(), bodyFatOn: true, bodyFat: 35, heightCm: 170, weightKg: 110 });
  approx(bf.mortality.hr, 1.11, 1e-9, 'body fat 35% -> HR 1.11 (jayedi2022), BMI superseded');
  ok(!bf.contributions.mortality.some((c) => c.inputId === 'bmi'), 'BMI contribution removed when body fat % enabled');
}

console.log('\n[11] New inputs');
{
  const r1 = engine.evaluate(model, { ...neutralValues(), magnesium: 450 });
  approx(r1.mortality.hr, Math.pow(0.9, 2), 1e-9, 'magnesium 450 mg/d -> 0.90^2 (fang2016, anchored at 250)');

  const r2 = engine.evaluate(model, { ...neutralValues(), magnesium: 600 });
  approx(r2.mortality.hr, Math.pow(0.9, 2), 1e-9, 'magnesium capped at 450 mg');

  const r3 = engine.evaluate(model, { ...neutralValues(), occupationalPA: 8 });
  approx(r3.mortality.hr, 1.18, 1e-9, 'heavy occupational PA -> HR 1.18 (coenen2018)');

  const r4 = engine.evaluate(model, { ...neutralValues(), snus: 'yes' });
  approx(r4.mortality.hr, 1.28, 1e-9, 'snus -> HR 1.28 (byhamre2021)');

  const r5 = engine.evaluate(model, { ...neutralValues(), vitaminD: 'deficient' });
  approx(r5.mortality.hr, 1.57, 1e-9, 'vitamin D deficiency -> HR 1.57 (schottker2014)');

  const r6 = engine.evaluate(model, { ...neutralValues(), vitaminD: 'supplement' });
  approx(r6.mortality.hr, 0.99, 1e-9, 'vitamin D supplement -> HR 0.99 (manson2019, honest null)');

  const r7 = engine.evaluate(model, { ...neutralValues(), processedMeat: 8 });
  approx(r7.mortality.hr, Math.pow(1.2, (8 - 1.5) / 7), 1e-9, 'processed meat 8/wk -> 1.2^((8-1.5)/7) (pan2012)');

  const r8 = engine.evaluate(model, { ...neutralValues(), ssb: 14 });
  approx(r8.mortality.hr, 1.21, 1e-9, 'SSB 14/wk -> HR 1.21 (malik2019)');

  const r9 = engine.evaluate(model, { ...neutralValues(), fish: 'lots' });
  approx(r9.mortality.hr, 0.95, 1e-9, 'fish 3+/wk -> HR 0.95 (kwok2019, li2020)');

  const r10 = engine.evaluate(model, { ...neutralValues(), sitting: 13 });
  approx(r10.mortality.hr, 1.24, 1e-9, 'sitting 13 h/d -> HR 1.24 (biswas2015)');

  const r11 = engine.evaluate(model, { ...neutralValues(), purpose: 9 });
  approx(r11.mortality.hr, 0.83, 1e-9, 'high purpose -> HR 0.83 (cohen2016)');

  const r12 = engine.evaluate(model, { ...neutralValues(), gripOn: true, grip: 25 });
  approx(r12.mortality.hr, Math.pow(0.8621, -2), 1e-9, 'grip 25 kg (10 below anchor) -> 0.8621^-2 (leong2015)');

  const r13 = engine.evaluate(model, { ...neutralValues(), gripOn: false, grip: 15 });
  approx(r13.mortality.hr, 1.0, 1e-9, 'grip ignored while its toggle is off');

  const r14 = engine.evaluate(model, { ...neutralValues(), nuts: 30 });
  approx(r14.mortality.hr, Math.pow(0.78, 30 / 28), 1e-9, 'nuts 30 g/d -> 0.78^(30/28) (aune2016nuts)');
  const base14 = engine.evaluateRaw(model, neutralValues());
  approx(engine.evaluateRaw(model, { ...neutralValues(), nuts: 30 }).hrCancer / base14.hrCancer,
    Math.pow(0.85, 30 / 28), 1e-9, 'nuts 30 g/d -> cancer 0.85^(30/28)');

  const r15 = engine.evaluate(model, { ...neutralValues(), nuts: 50 });
  approx(r15.mortality.hr, Math.pow(0.78, 35 / 28), 1e-9, 'nuts capped at 35 g');

  const r16 = engine.evaluate(model, { ...neutralValues(), rhrOn: false, rhr: 90 });
  approx(r16.mortality.hr, 1.0, 1e-9, 'resting HR ignored while its toggle is off');

  const r17 = engine.evaluate(model, { ...neutralValues(), rhrOn: true, rhr: 90 });
  approx(r17.mortality.hr, Math.pow(1.17, 2), 1e-9, 'RHR 90 (20 above anchor) -> 1.17^2 (aune2017rhr)');
  approx(engine.evaluateRaw(model, { ...neutralValues(), rhrOn: true, rhr: 90 }).hrCancer / base14.hrCancer,
    Math.pow(1.14, 2), 1e-9, 'RHR 90 -> cancer 1.14^2');

  const r18 = engine.evaluate(model, { ...neutralValues(), sleepRegularity: 9 });
  approx(r18.mortality.hr, 0.78, 1e-9, 'regular sleep schedule -> HR 0.78 (windred2024)');

  const r19 = engine.evaluate(model, { ...neutralValues(), sleepRegularity: 2 });
  approx(r19.mortality.hr, 1.25, 1e-9, 'irregular sleep schedule -> HR 1.25');

  const r20 = engine.evaluate(model, { ...neutralValues(), pm25: 18 });
  approx(r20.mortality.hr, 1.073, 1e-9, 'PM2.5 18 (10 above anchor) -> 1.073 (di2017)');

  const r21 = engine.evaluate(model, { ...neutralValues(), pm25: 2 });
  approx(r21.mortality.hr, Math.pow(1.073, -0.5), 1e-9, 'PM2.5 clamped at minDose 3');

  // Step count tests (neutralValues has steps=2000 = study reference)
  const stepsRef = engine.evaluate(model, neutralValues());
  const stepsAtDefault = engine.evaluate(model, { ...neutralValues(), steps: 5000 });
  const stepsHigh = engine.evaluate(model, { ...neutralValues(), steps: 10000 });
  approx(stepsHigh.mortality.hr / stepsAtDefault.mortality.hr, 0.52 / 0.67, 1e-9, 'steps 10k -> mortality raw HR 0.52/0.67 vs 5k default (lancet2025steps)');
  approx(stepsRef.mortality.hr / stepsAtDefault.mortality.hr, 1.00 / 0.67, 1e-9, 'steps 2k -> mortality raw HR 1.0/0.67 vs 5k default');

  const stepsBase = engine.evaluateRaw(model, neutralValues());
  const stepsHighRaw = engine.evaluateRaw(model, { ...neutralValues(), steps: 15000 });
  approx(stepsHighRaw.hrCvd / stepsBase.hrCvd, 0.50, 1e-9, 'steps 15k -> CVD HR 0.50 (lancet2025steps)');
  approx(stepsHighRaw.hrCancer / stepsBase.hrCancer, 0.48, 1e-9, 'steps 15k -> cancer HR 0.48 (lancet2025steps)');

  // Use defaults so all non-step inputs cancel with the average
  const stepsHappy = engine.evaluate(model, { ...engine.defaults(model), steps: 10000 });
  ok(stepsHappy.scores.happiness.relPoints > 0, 'steps 10k -> positive happiness delta');
  ok(stepsHappy.scores.cognition.relPoints > 0, 'steps 10k -> positive cognition delta');
}

console.log('\n[12] Findings react to inputs');
{
  const r = engine.evaluate(model, { ...neutralValues(), smoking: 'current' });
  ok(r.findings.some((f) => f.source.includes('jha2013') && /lung cancer/.test(f.text)), 'smoker sees lung-cancer finding');

  const r0 = engine.evaluate(model, neutralValues());
  ok(!r0.findings.some((f) => f.source.includes('jha2013')), 'reference profile -> no smoking findings');
  ok(!r0.findings.some((f) => f.dir === 'bad' && f.source.includes('pan2012')), 'reference profile -> no processed-meat findings');

  const r2 = engine.evaluate(model, { ...neutralValues(), vitaminD: 'supplement' });
  ok(r2.findings.some((f) => f.source.includes('manson2019') && f.dir === 'neutral'), 'supplementing vitamin D shows the honest-null finding');

  const r3 = engine.evaluate(model, { ...neutralValues(), processedMeat: 8 });
  ok(r3.findings.some((f) => f.source.includes('pan2012') && f.dir === 'bad'), 'daily processed meat shows cancer finding');

  const r4 = engine.evaluate(model, engine.defaults(model));
  ok(r4.findings.some((f) => f.source.includes('manson2019omega3')), 'average profile (fish 1-2/wk) shows the omega-3 honest null');

  const r4b = engine.evaluate(model, engine.defaults(model));
  ok(r4b.findings.some((f) => f.source.includes('lancet2025steps') && /partially capture/.test(f.text)), 'defaults (steps + cardio >0) shows steps-cardio overlap finding');
}

console.log('\n[13] Cancer output');
{
  const def = engine.evaluate(model, engine.defaults(model));
  approx(def.cancer.hrAvg, 1.0, 1e-9, 'defaults -> cancer 1.0x the average person');

  // Ratio vs the reference profile cancels inputs whose cancer reference
  // stratum differs from their mortality one (e.g. fiber).
  const base = engine.evaluateRaw(model, neutralValues());
  const pm = engine.evaluateRaw(model, { ...neutralValues(), processedMeat: 8 });
  approx(pm.hrCancer / base.hrCancer, Math.pow(1.16, (8 - 1.5) / 7), 1e-9, 'processed meat 8/wk -> cancer HR 1.16^((8-1.5)/7) (pan2012)');

  const sm = engine.evaluateRaw(model, { ...neutralValues(), smoking: 'current' });
  approx(sm.hrCancer / base.hrCancer, 3.0, 1e-9, 'current smoker -> cancer HR 3.0 (thun2013)');

  const fv = engine.evaluateRaw(model, { ...neutralValues(), fruitVeg: 8 });
  approx(fv.hrCancer / base.hrCancer, 1.0, 1e-9, 'fruit & veg: honest null on cancer (wang2014)');

  ok(def.cancer.noData.length > 5, 'coverage note lists no-data inputs');
  ok(def.cancer.noData.includes('VO2 max'), 'VO2 max listed as no-cancer-data');
  ok(def.cancer.noData.includes('Grip strength'), 'grip listed as no-cancer-data');
}

console.log('\n[14] Functional-independence findings');
{
  const f = engine.evaluate(model, { ...neutralValues(), strength: 0, sex: 'female' });
  ok(f.findings.some((x) => x.source.includes('howe2011')), 'no strength training + female -> osteoporosis finding');
  ok(f.findings.some((x) => x.source.includes('sherrington2019')), 'no strength training -> falls finding');

  const g = engine.evaluate(model, { ...neutralValues(), strength: 2 });
  ok(!g.findings.some((x) => x.source.includes('sherrington2019')), 'strength training on -> no falls finding');

  const grip = engine.evaluate(model, { ...neutralValues(), gripOn: true, grip: 30 });
  ok(grip.findings.some((x) => x.source.includes('leong2015') && x.dir === 'neutral'), 'grip enabled -> honest-null injury finding');

  const nuts = engine.evaluate(model, { ...neutralValues(), nuts: 25 });
  ok(nuts.findings.some((x) => x.source.includes('aune2016nuts') && x.dir === 'good'), 'nuts >= 20 g -> respiratory/diabetes finding');

  const reg = engine.evaluate(model, { ...neutralValues(), sleepRegularity: 2 });
  ok(reg.findings.some((x) => x.source.includes('windred2024') && x.dir === 'bad'), 'irregular sleep -> regularity-over-duration finding');

  const pm = engine.evaluate(model, { ...neutralValues(), pm25: 15 });
  ok(pm.findings.some((x) => x.source.includes('di2017') && x.dir === 'bad'), 'PM2.5 > 12 -> exposure finding');

  const grains = engine.evaluate(model, { ...neutralValues(), fiber: 30 });
  ok(grains.findings.some((x) => x.source.includes('aune2016grain')), 'high fiber -> whole-grains-not-double-counted finding');
}

console.log('\n[15] CVD output');
{
  const def = engine.evaluate(model, engine.defaults(model));
  approx(def.cvd.hrAvg, 1.0, 1e-9, 'defaults -> cvd 1.0x the average person');

  const base = engine.evaluateRaw(model, neutralValues());
  const pm = engine.evaluateRaw(model, { ...neutralValues(), processedMeat: 8 });
  approx(pm.hrCvd / base.hrCvd, Math.pow(1.13, (8 - 1.5) / 7), 1e-9, 'processed meat 8/wk -> cvd HR 1.13^((8-1.5)/7) (pan2012)');

  const sm = engine.evaluateRaw(model, { ...neutralValues(), smoking: 'current' });
  approx(sm.hrCvd / base.hrCvd, 2.5, 1e-9, 'current smoker -> cvd HR 2.5 (jha2013)');

  const ssb = engine.evaluateRaw(model, { ...neutralValues(), ssb: 14 });
  approx(ssb.hrCvd / base.hrCvd, 1.31, 1e-9, 'SSB 14/wk -> cvd HR 1.31 (malik2019)');

  const nuts = engine.evaluateRaw(model, { ...neutralValues(), nuts: 30 });
  approx(nuts.hrCvd / base.hrCvd, Math.pow(0.79, 30 / 28), 1e-9, 'nuts 30 g/d -> cvd 0.79^(30/28) (aune2016nuts)');

  const sauna = engine.evaluateRaw(model, { ...neutralValues(), sauna: 5 });
  approx(sauna.hrCvd / base.hrCvd, 0.48, 1e-9, 'sauna 5/wk -> cvd HR 0.48 (laukkanen2015)');

  const vo2 = engine.evaluateRaw(model, { ...neutralValues(), vo2maxOn: true, vo2max: 42 });
  approx(vo2.hrCvd / base.hrCvd, Math.pow(0.85, 4), 1e-9, 'vo2max 42 -> cvd 0.85^4 (kodama2009)');

  const rhr = engine.evaluateRaw(model, { ...neutralValues(), rhrOn: true, rhr: 90 });
  approx(rhr.hrCvd / base.hrCvd, Math.pow(1.15, 2), 1e-9, 'RHR 90 -> cvd 1.15^2 (aune2017rhr)');

  const sleepReg = engine.evaluateRaw(model, { ...neutralValues(), sleepRegularity: 9 });
  approx(sleepReg.hrCvd / base.hrCvd, 0.78, 1e-9, 'regular sleep schedule -> cvd 0.78 (windred2024)');

  ok(def.cvd.noData.length > 3, 'coverage note lists no-data inputs');
  ok(def.cvd.noData.includes('Cannabis'), 'cannabis listed as no-cvd-data');
  ok(def.cvd.noData.includes('Meditation'), 'meditation listed as no-cvd-data');
  ok(def.cvd.noData.includes('Untreated iron deficiency'), 'iron deficiency listed as no-cvd-data');

  // BMI CVD contribution
  const obese = engine.evaluate(model, { ...neutralValues(), heightCm: 170, weightKg: 110 });
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
  addAll(model.bmi.source);
  addAll(model.baseline.source);
  ok(Object.keys(refs).length === cited.size, 'sourceIndex covers every cited source');
  const nums = Object.values(refs).sort((a, b) => a - b);
  ok(nums.every((n, i) => n === i + 1), 'citation numbers contiguous from 1');
}

console.log(failures === 0 ? '\nAll tests passed.' : `\n${failures} test(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
