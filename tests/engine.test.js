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

// Neutral profile: the model's own defaults ARE the reference profile —
// every input at its no-effect level (so "reset" gives HR 1.0, band points 0).
function neutralValues() {
  return engine.defaults(model);
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

console.log('\n[8] Defaults = reference profile (the "reset" contract)');
{
  const r = engine.evaluate(model, engine.defaults(model));
  approx(r.mortality.hr, 1.0, 1e-9, 'defaults -> HR exactly 1.0x reference');
  approx(r.scores.cognition.points, 0, 1e-9, 'defaults -> cognition points 0');
  approx(r.scores.happiness.points, 0, 1e-9, 'defaults -> happiness points 0');
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
  approx(r2.mortality.hrLow, 0.62, 1e-9, 'high evidence keeps published CI (0.62)');
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
}

console.log('\n[12] Findings react to inputs');
{
  const r = engine.evaluate(model, { ...neutralValues(), smoking: 'current' });
  ok(r.findings.some((f) => f.source === 'jha2013' && /lung cancer/.test(f.text)), 'smoker sees lung-cancer finding');

  const r0 = engine.evaluate(model, neutralValues());
  ok(r0.findings.length === 0, 'reference profile -> no findings');

  const r2 = engine.evaluate(model, { ...neutralValues(), vitaminD: 'supplement' });
  ok(r2.findings.some((f) => f.source === 'manson2019' && f.dir === 'neutral'), 'supplementing vitamin D shows the honest-null finding');
}

console.log('\n[13] Citation numbering (index.html <-> sources.html)');
{
  const refs = engine.sourceIndex(model);
  const cited = new Set();
  for (const input of model.inputs) for (const e of input.effects) cited.add(e.source);
  cited.add(model.bmi.source);
  cited.add(model.baseline.source);
  ok(Object.keys(refs).length === cited.size, 'sourceIndex covers every cited source');
  const nums = Object.values(refs).sort((a, b) => a - b);
  ok(nums.every((n, i) => n === i + 1), 'citation numbers contiguous from 1');
}

console.log(failures === 0 ? '\nAll tests passed.' : `\n${failures} test(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
