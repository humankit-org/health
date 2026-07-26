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

// Neutral profile: every input at its no-effect reference level.
function neutralValues() {
  return {
    sex: 'unspecified',
    heightCm: 176, // BMI ~22.6 -> HR 1.0 band
    weightKg: 70,
    cardio: 0, strength: 0, fiber: 0, fruitVeg: 0, alcohol: 0,
    smoking: 'never', coffee: 0, sleep: 7.5, stress: 1, social: 7,
    sauna: 0, creatine: false,
  };
}

console.log('\n[1] Data integrity');
{
  const ids = new Set();
  for (const input of model.inputs) {
    ok(!ids.has(input.id), `input id unique: ${input.id}`);
    ids.add(input.id);
    for (const effect of input.effects) {
      ok(!!model.sources[effect.source], `${input.id}/${effect.output} cites existing source "${effect.source}"`);
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
  ok(!!model.sources[model.bmi.source], 'bmi cites existing source');
  ok(!!model.sources[model.baseline.source], 'baseline cites existing source');
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

console.log('\n[3] Neutral profile ~ no change');
{
  const r = engine.evaluate(model, neutralValues());
  approx(r.mortality.hr, 1.0, 0.02, 'neutral profile HR ~ 1.0');
  approx(r.lifeExpectancy.delta, 0, 0.3, 'neutral profile LE delta ~ 0');
  approx(r.lifeExpectancy.estimate, model.baseline.lifeExpectancy.unspecified, 0.3, 'neutral LE ~ baseline');
}

console.log('\n[4] Calibration cross-checks (Gompertz vs published year-estimates)');
{
  const smoker = engine.evaluate(model, { ...neutralValues(), smoking: 'current' });
  approx(smoker.lifeExpectancy.delta, -10.8, 1.5, 'current smoker ~ -11 years (jha2013: >10 y lost)');

  const heavyExercise = engine.evaluate(model, { ...neutralValues(), cardio: 500 });
  approx(heavyExercise.lifeExpectancy.delta, 5.0, 1.0, 'heavy cardio ~ +5 years (moore2012: +4.5 y)');

  // hrToYears / yearsToHr round-trip
  approx(engine.hrToYears(model, engine.yearsToHr(model, -4.5)), -4.5, 1e-9, 'years<->hr round-trip');
}

console.log('\n[5] Combination + clamping');
{
  const allHealthy = engine.evaluate(model, {
    ...neutralValues(),
    cardio: 500, strength: 3, fiber: 40, fruitVeg: 8,
    coffee: 4, sauna: 5, social: 7, stress: 2, sleep: 8,
    heightCm: 176, weightKg: 68,
  });
  ok(allHealthy.mortality.clamped, 'all-healthy profile hits the humility floor (HR ' + allHealthy.mortality.hr + ')');
  approx(allHealthy.mortality.hr, model.constants.hrFloor, 1e-9, 'HR clamped at floor');
  ok(allHealthy.lifeExpectancy.delta <= model.constants.yearsCapGain + 1e-9, 'LE gain capped');

  const mixed = engine.evaluate(model, { ...neutralValues(), cardio: 300, strength: 2 });
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

console.log(failures === 0 ? '\nAll tests passed.' : `\n${failures} test(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
