/*
 * attribution.probe.js — Phase 0 diagnostic: decompose the "regular healthy
 * person" profile's naive product into per-cluster contributions, so the
 * conflation problem can be measured before it is fixed.
 *
 * Run: `node tests/attribution.probe.js`
 *
 * Reads js/factors.js + js/engine.js only. No DOM, no network.
 *
 * Profile (PLAN.md Phase 0): 300 min/wk cardio, 2x/wk strength, 10k steps,
 * decent diet, good sleep, low stress. Everything else sits at its
 * study-reference (no-effect) level.
 */

const model = require('../js/factors.js');
const engine = require('../js/engine.js');

// Reference profile: every input at its study-reference (no-effect) level.
function referenceValues() {
  return {
    ...engine.defaults(model),
    steps: 2000, cardio: 0, strength: 0, sitting: 4,
    fiber: 0, fruitVeg: 2.6, processedMeat: 1.5, ssb: 4.9, fish: 'none', nuts: 0,
    alcohol: 0, coffee: 0, magnesium: 250,
    sleep: 7.5, sleepRegularity: 6, stress: 3.5, social: 5, purpose: 5,
    vaping: 'never', smoking: 'never', snus: 'no', cannabis: 'never',
    occupationalPA: 0,
    sunExposure: 0.5, // HR 1.0 step (reference level)
    heightCm: 170, weightKg: 68, // BMI ~23.5 -> HR 1.0 band
  };
}

// The PLAN.md probe profile ("regular healthy person"). Deliberately modest:
// no extremes, no gated inputs (VO2 max / body fat off), no supplements.
function probeValues() {
  const v = referenceValues();
  Object.assign(v, {
    // movement
    cardio: 300, steps: 10000, strength: 2, sitting: 5,
    // diet
    fiber: 30, fruitVeg: 5, nuts: 30, magnesium: 400,
    fish: 'some', processedMeat: 2, ssb: 1, coffee: 2,
    // mind
    purpose: 6, social: 6, stress: 2.5, sleepRegularity: 8,
    // substances
    alcohol: 5, smoking: 'never', snus: 'no', cannabis: 'never', vaping: 'never',
    // sleep (7.5 = reference level, kept)
    sleep: 7.5,
  });
  return v;
}

// Cluster definitions (todo.md 0.7 / PLAN.md Phase 0 sizing). These are the
// naive-multiplication clusters the engine currently multiplies through.
const CLUSTERS = {
  movement: ['cardio', 'steps', 'strength', 'sitting'],
  diet: ['fiber', 'fruitVeg', 'nuts', 'magnesium', 'fish', 'processedMeat', 'ssb', 'coffee'],
  mind: ['purpose', 'social', 'stress', 'sleepRegularity'],
  substances: ['alcohol', 'smoking', 'snus', 'cannabis', 'vaping'],
  sleep: ['sleep'],
};

const pct = (x) => (100 * (x - 1)).toFixed(1) + '%';

const ref = engine.evaluateRaw(model, referenceValues());
const prof = engine.evaluateRaw(model, probeValues());
const norm = engine.evaluate(model, probeValues());

console.log('\n=== Attribution probe: "regular healthy person" ===');
console.log('profile: cardio 300 min/wk, strength 2x/wk, 10k steps, sitting 5 h,');
console.log('         fiber 30 g, fruit/veg 5, nuts 30 g, Mg 400 mg, fish 1-2/wk,');
console.log('         proc meat 2/wk, SSB 1/wk, coffee 2/d, purpose 6, social 6,');
console.log('         stress 2.5, sleep regularity 8, alcohol 5/wk, sleep 7.5 h');
console.log('reference raw HR (all study-reference levels): ' + ref.hr.toFixed(4));
console.log('naive raw product at probe:                   ' + prof.hr.toFixed(4));
console.log('  => naive ratio vs reference:                ' + (prof.hr / ref.hr).toFixed(4) + '  (' + pct(prof.hr / ref.hr) + ')');
const rawNorm = prof.hr / ref.hr * (ref.hr / engine.averageEval(model).hr);
console.log('  => normalized pre-clamp:                    ' + rawNorm.toFixed(4) + '  (' + pct(rawNorm) + ')');
console.log('normalized + clamped:                         ' + norm.mortality.hrAvg.toFixed(4) + '  (floor ' + model.constants.hrFloor + ', cap ' + model.constants.hrCeiling + ')');
console.log('  => clamp pinned: ' + norm.mortality.clamped +
  (norm.mortality.clamped ? (rawNorm < model.constants.hrFloor ? ' (FLOOR)' : ' (CAP)') : ''));
console.log('  => LE delta displayed: ' + norm.lifeExpectancy.delta.toFixed(1) + ' y (gain cap ' + model.constants.yearsCapGain + ' y)');

console.log('\n--- per-cluster naive deltas (cluster alone vs reference, pre-multiplied) ---');
const product = { hr: 1 };
const rows = [];
let total = 1;
for (const [name, ids] of Object.entries(CLUSTERS)) {
  const vals = referenceValues();
  ids.forEach((id) => { vals[id] = probeValues()[id]; });
  const r = engine.evaluateRaw(model, vals);
  const delta = r.hr / ref.hr;
  rows.push({ name, delta, members: ids });
  total *= delta;
  console.log(`  ${name.padEnd(11)} ${delta.toFixed(4)}  (${pct(delta)})  [${ids.join(', ')}]`);
}
const unaccounted = prof.hr / ref.hr / total;
console.log(`  product of cluster deltas: ${total.toFixed(4)}  (${pct(total)})`);
console.log(`  unaccounted (BMI via height/weight + anything outside clusters): ${unaccounted.toFixed(4)}  (${pct(unaccounted)})`);
const bmiVals = referenceValues();
bmiVals.heightCm = probeValues().heightCm;
bmiVals.weightKg = probeValues().weightKg;
const bmiOnly = engine.evaluateRaw(model, bmiVals);
console.log(`  BMI-only delta (probe height/weight vs reference): ${(bmiOnly.hr / ref.hr).toFixed(4)}  (${pct(bmiOnly.hr / ref.hr)})`);

console.log('\n--- per-input naive deltas (input alone vs reference, pre-multiplied) ---');
for (const input of model.inputs) {
  if (!input.effects.some((e) => e.output === 'mortality')) continue;
  const vals = referenceValues();
  vals[input.id] = probeValues()[input.id];
  const r = engine.evaluateRaw(model, vals);
  const delta = r.hr / ref.hr;
  if (Math.abs(delta - 1) > 0.001) {
    console.log(`  ${(input.label + ':').padEnd(42)} ${delta.toFixed(4)}  (${pct(delta)})`);
  }
}

console.log('\n--- notes ---');
console.log('All deltas are ratios vs the study-reference profile (not vs the');
console.log('average person). The clusters above are the naive-multiplication');
console.log('units of the current engine: within a cluster, marginal HRs are');
console.log('multiplied, which is where the conflation problem concentrates.');
console.log('Clamp floor ' + model.constants.hrFloor + ' / cap ' + model.constants.hrCeiling + ',');
console.log('uncertainty widening ' + JSON.stringify(model.constants.uncertaintyWiden) + '.');
