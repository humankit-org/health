// anchor_probe.js — Li 2018 / Sun 2022 calibration ratio (PLAN §1.13).
// Reusable completion probe for Phase 3.6. Run: node /tmp/opencode/anchor_probe.js
const model = require('../js/factors.js');
const engine = require('../js/engine.js');
const d = engine.defaults(model);

// Plan §1.13 pre-registered profiles. Everything not listed stays at defaults
// in BOTH profiles (cancels in the ratio). Alcohol held at 2.5.
const profileA = { // "5" low-risk factors
  ...d,
  smoking: 'never',
  heightCm: 170, weightKg: 63.6,           // BMI 22.0
  cardio: 210,                              // PA >= 30 min/d MVPA
  fiber: 30, fruitVeg: 5, fish: 'lots', nuts: 30, magnesium: 350,
  processedMeat: 0, ssb: 0, coffee: 2,
  alcohol: 2.5,
};
const profileB = { // "0" low-risk factors
  ...d,
  smoking: 'current',
  heightCm: 170, weightKg: 86.7,           // BMI 30.0
  cardio: 0,
  fiber: 5, fruitVeg: 0, fish: 'none', nuts: 0, magnesium: 100,
  processedMeat: 7, ssb: 3, coffee: 0,
  alcohol: 2.5,
};

const rA = engine.evaluateRaw(model, profileA);
const rB = engine.evaluateRaw(model, profileB);
const ratio = rA.hr / rB.hr;
const yearsF = engine.hrToYears(model, ratio);
console.log('hr(A) =', rA.hr.toFixed(4));
console.log('hr(B) =', rB.hr.toFixed(4));
console.log('ratio  =', ratio.toFixed(4));
console.log('Gompertz years delta (mortality only approx):', yearsF.toFixed(1));

console.log('\nTolerance bands (PLAN §1.13):');
console.log('  Li 2018 ratio  [0.22, 0.31] target 0.26  ->', ratio >= 0.22 && ratio <= 0.31 ? 'PASS' : 'FAIL');
console.log('  Sun 2022 ratio [0.34, 0.43] target 0.38  ->', ratio >= 0.34 && ratio <= 0.43 ? 'PASS' : 'FAIL');
console.log('  Li years    F [11.8,16.2] M [10.1,14.2] ->', yearsF.toFixed(1), '(approx)');

// --- per-cluster decomposition: start from profileB, swap in A's values for
// --- the given keys, record the A/B hr ratio contributed by that cluster.
console.log('\n--- per-cluster A/B ratios (swap cluster A into baseline B) ---');
const CL = {
  smoking: ['smoking'], bmi: ['heightCm', 'weightKg'], cardio: ['cardio'],
  steps: ['steps'], strength: ['strength'], sitting: ['sitting'],
  diet: ['fiber', 'fruitVeg', 'fish', 'nuts', 'magnesium', 'processedMeat', 'ssb', 'coffee'],
  mind: ['purpose', 'stress', 'social', 'sleepRegularity'], sleep: ['sleep'],
};
const into = (base, src, keys) => { const o = { ...base }; keys.forEach((k) => { o[k] = src[k]; }); return o; };
let product = 1;
for (const [name, keys] of Object.entries(CL)) {
  const r = engine.evaluateRaw(model, into(profileB, profileA, keys));
  const cratio = r.hr / rB.hr;
  product *= cratio;
  console.log('  ' + name.padEnd(10) + cratio.toFixed(4));
}
console.log('  product of per-cluster ratios:', product.toFixed(4), '(vs full ratio', ratio.toFixed(4) + ')');

// --- contributions within clusters: same harness at input granularity in
// profile-A order, to see which single factors dominate the spread ---
console.log('\n--- per-input A/B ratios (swap input A into baseline B) ---');
for (const input of model.inputs) {
  if (!input.effects.some((e) => e.output === 'mortality')) continue;
  const r = engine.evaluateRaw(model, into(profileB, profileA, [input.id]));
  const ir = r.hr / rB.hr;
  if (Math.abs(ir - 1) > 0.005) console.log('  ' + (input.label + ':').padEnd(42) + ir.toFixed(4));
}