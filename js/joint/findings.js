/*
 * findings.js — the 2 cluster-referencing findings (vo2maxOn/weeldreyer2025, underweight/sanchezlastra2021)
 *
 * Part of the assembled ADVANCED model — see js/joint/index.js; the
 * base SIMPLE model lives in js/factors.js.
 *
 * Dual export (same pattern as factors.js/schema.js/engine.js):
 *   CommonJS  module.exports
 *   browser   globalThis.HEALTH_JOINT_FINDINGS  (<script> loaded before js/joint/index.js)
 */
(function (root) {
  'use strict';

const jointFindings = [
    {
      when: (v) => v.vo2maxOn, dir: 'good', input: 'VO2 max', source: ['weeldreyer2025'],
      text: 'Measured fitness absorbs most of BMI\'s mortality association: the unfit have ~2× all-cause mortality (and 2–3× CVD) at ANY BMI, while fit-at-any-BMI ≈ normal-weight fit. The bar is modest — better than the least-fit 20% is often enough. (The Mayo table\'s ≥35-BMI row still shows 1.45 at high self-reported PA — measured CRF ≠ self-reported PA.)',
    },
    {
      when: (v) => v.heightCm > 0 && (v.weightKg / Math.pow(v.heightCm / 100, 2)) < 18.5, dir: 'neutral', input: 'Weight', source: ['sanchezlastra2021'],
      text: 'Underweight caveat: the Mayo PA×adiposity study EXCLUDED BMI <18.5 at baseline (illness-related weight loss), so underweight maps into the normal-weight row here — the elevated mortality risk below BMI 18.5 seen in other studies (Di Angelantonio 2016) is NOT counted in the adiposity cluster.',
    },
];

  if (typeof module !== 'undefined' && module.exports) module.exports = jointFindings;
  if (root) root.HEALTH_JOINT_FINDINGS = jointFindings;
})(typeof self !== 'undefined' ? self : globalThis);
