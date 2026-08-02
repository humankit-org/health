/*
 * factors.js — THE MODEL.
 *
 * Every number that drives an estimate lives here, right next to the study it
 * came from, so that (a) the website can render citations next to every figure
 * and (b) anyone can audit a number by reading the source beside it.
 *
 * If you change a number, update its `source` and `note` in the same commit.
 *
 * Conventions
 * -----------
 * - Mortality effects are hazard ratios (HR) vs. a reference level of the
 *   input. HR 0.80 = 20% lower mortality hazard. `hrLow`/`hrHigh` are the
 *   study's 95% CI bounds where published (else flagged approximate in `note`).
 * - Mind outputs (cognition, happiness) are unitless "points" on a latent
 *   scale — no pretense of clinical measurement. Bands, not numbers.
 * - `evidence`: high | moderate | low — see the methodology section in
 *   index.html for what these mean.
 * - `steps` effects: first entry whose `max` >= input value applies.
 * - `perUnit` effects: HR scales as hr^(value/per), benefit capped at `capAt`.
 * - `byOption` effects: lookup by the segmented control's option value.
 */

const HEALTH_MODEL = {
  meta: {
    name: 'HumanKit Health',
    version: '0.1.11',
    updated: '2026-08-01',
  },

  constants: {
    /*
     * Gompertz approximation used to translate a sustained hazard-ratio change
     * into years of life expectancy: adult mortality risk roughly doubles every
     * MRRT years, so ΔLE ≈ -ln(HR) / (ln2 / MRRT).
     * MRRT = 7 y is within the actuarially plausible ~6–8 y range and was
     * cross-checked against two published results:
     *   HR 0.61 (heavy exercise, arem2015) -> +5.0 y  (moore2012 measured +4.5 y)
     *   HR 2.9  (current smoker, jha2013)  -> -10.8 y (jha2013 measured ">10 y")
     */
    mrrtYears: 7,
    // Lifestyle effects overlap; multiplying many HRs would overstate the
    // combined benefit, so we refuse to claim more than a 55% reduction
    // (or a 4x increase) in mortality hazard.
    hrFloor: 0.45,
    hrCeiling: 4.0,
    // And we cap the resulting life-expectancy adjustment.
    yearsCapGain: 8,
    yearsCapLoss: 15,
    /*
     * The less certain the evidence, the WIDER the uncertainty range.
     * Published 95% CIs only capture sampling error of the original study —
     * they say nothing about confounding, extrapolation to other populations,
     * or our approximations. So each effect's CI bounds are widened around its
     * central estimate (in log space) by these factors before being combined.
     * High evidence keeps the published CI; low evidence more than doubles the
     * width — and its range will often cross 1.0 ("we genuinely don't know").
     */
    uncertaintyWiden: { high: 1.0, moderate: 1.5, low: 2.25 },
    // Base fuzz (half-width) of the mind-output markers, in points; grows by
    // fuzzPerLowEvidence for every active low-evidence contributor.
    bandFuzzBase: 0.5,
    bandFuzzPerLowEvidence: 0.15,
    bandFuzzMax: 1.25,
  },

  baseline: {
    // US life expectancy at birth, 2023 (final data). Verified 2026-07-31
    // against NCHS Data Brief No. 521 (Murphy et al., Dec 2024, DOI
    // 10.15620/cdc/170564): total 78.4, female 81.1, male 75.8. Final 2024
    // data (Data Brief 548, Jan 2026) is 79.0 / 81.4 / 76.5 — not adopted
    // (2023 is the model's stated anchor).
    lifeExpectancy: { female: 81.1, male: 75.8, unspecified: 78.4 },
    source: ['nchs2023'],
  },

  // Score bands for the mind outputs (points -> label).
  bands: [
    { max: -1.25, label: 'likely below average' },
    { max: -0.35, label: 'slightly below average' },
    { max: 0.35, label: 'about average' },
    { max: 1.25, label: 'slightly above average' },
    { max: Infinity, label: 'likely above average' },
  ],

  outputs: [
    {
      id: 'lifeExpectancy',
      title: 'Estimated life expectancy',
      kind: 'years',
      blurb: 'Baseline for your sex, shifted by your mortality risk.',
      evidence: 'moderate',
    },
    {
      id: 'mortality',
      title: 'All-cause mortality risk',
      kind: 'hr',
      blurb: 'Hazard vs. the average person (1.0× = population average). Ranges combine published 95% CIs — widened where evidence is thin — assuming independence.',
      evidence: 'high',
    },
    {
      id: 'cancer',
      title: 'Cancer mortality risk',
      kind: 'hr',
      blurb: 'Overlaps with all-cause mortality (cancer is roughly a fifth of it).',
      evidence: 'moderate',
    },
    {
      id: 'cvd',
      title: 'Cardiovascular mortality risk',
      kind: 'hr',
      blurb: 'CVD is the leading cause of death in most populations. The inputs driving it partly overlap with all-cause mortality.',
      evidence: 'moderate',
    },
    {
      id: 'cognition',
      title: 'Cognitive function',
      kind: 'band',
      blurb: 'Qualitative tendency only. Evidence here is thinner and largely about specific domains (memory, reasoning).',
      evidence: 'low',
    },
    {
      id: 'happiness',
      title: 'Happiness / wellbeing',
      kind: 'band',
      blurb: 'Qualitative tendency only. Almost entirely correlational evidence — treat as directional, not causal.',
      evidence: 'low',
    },
  ],

  inputs: [
    // ---------------------------------------------------------------- You
    {
      id: 'sex',
      group: 'you',
      label: 'Biological sex',
      kind: 'segmented',
      default: 'unspecified',
      options: [
        { value: 'female', label: 'Female' },
        { value: 'male', label: 'Male' },
        { value: 'unspecified', label: 'Unspecified' },
      ],
      hint: 'Used to get baseline life expectancy.',
      effects: [], // drives baseline.lifeExpectancy, not an effect
    },
    {
      id: 'heightCm',
      group: 'you',
      label: 'Height',
      kind: 'slider',
      unit: 'cm',
      min: 130, max: 210, step: 1, default: 168,
      hint: 'Combined with weight to compute BMI.',
      effects: [], // feeds the derived BMI effect below
    },
    {
      id: 'weightKg',
      group: 'you',
      label: 'Weight',
      kind: 'slider',
      unit: 'kg',
      min: 40, max: 180, step: 1, default: 84,
      hint: 'Combined with height to compute BMI.',
      effects: [],
    },

    // ----------------------------------------------------------- Movement
    {
      id: 'cardio',
      group: 'movement',
      label: 'Cardio (moderate-equivalent)',
      kind: 'slider',
      unit: 'min/week',
      min: 0, max: 600, step: 15, default: 60,
      hint: 'Brisk walking, cycling, jogging… count vigorous minutes double.',
      // arem2015 pooled 661k people from 6 cohorts: dose-response across all outcomes (all-cause, CVD, cancer)
      // HR 0.80 at 150 min/wk, 0.63 at 449, 0.61 at 749, 0.68 at 10x guideline (no harm even at extremes)
      // CVD mortality benefit (0.56 at 750+) is the dominant driver of all-cause reduction
      //
      // chekroud2018 cross-sectional 1.2M people: exercisers reported 43% fewer poor-mental-health days
      // Best at ~45 min, 3-5x/week. Correlational — reverse causality plausible.
      //
      // erickson2011 RCT in 120 older adults: 1 year aerobic exercise → hippocampal volume +2%, spatial memory improved
      //
      // rong2016: leisure-time PA → ~7% lower hip-fracture risk per activity increment in older women (finding)
      effects: [
        {
          output: 'mortality', type: 'steps', evidence: 'high', source: ['arem2015', 'moore2012'],
          supersededBy: 'vo2maxOn', // measured fitness is the better predictor — use it instead when available
          steps: [
            { max: 0, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 149, hr: 0.80, hrLow: 0.78, hrHigh: 0.82 },
            { max: 299, hr: 0.69, hrLow: 0.67, hrHigh: 0.70 },
            { max: 449, hr: 0.63, hrLow: 0.62, hrHigh: 0.65 },
            { max: 749, hr: 0.61, hrLow: 0.59, hrHigh: 0.62 },
            { max: Infinity, hr: 0.68, hrLow: 0.59, hrHigh: 0.78 },
          ],
          note: 'HRs vs. no leisure-time activity, pooled from 661k people. 7.5 MET-h/wk ≈ 150 min moderate. No harm seen even at 10x the guideline minimum.',
        },
        {
          output: 'happiness', type: 'steps', evidence: 'low', source: ['chekroud2018'],
          steps: [
            { max: 0, points: 0 },
            { max: 149, points: 0.3 },
            { max: 449, points: 0.6 },
            { max: Infinity, points: 0.5 },
          ],
          note: '1.2M-person cross-sectional study: exercisers reported 43% fewer poor-mental-health days; best at ~45 min, 3–5x/week. Correlational.',
        },
        {
          output: 'cognition', type: 'steps', evidence: 'moderate', source: ['erickson2011'],
          steps: [
            { max: 0, points: 0 },
            { max: 149, points: 0.2 },
            { max: Infinity, points: 0.4 },
          ],
          note: 'RCT in 120 older adults: 1 year of aerobic exercise grew hippocampal volume ~2% and improved spatial memory.',
        },
        {
          output: 'cancer', type: 'steps', evidence: 'high', source: ['arem2015'],
          supersededBy: 'vo2maxOn',
          steps: [
            { max: 0, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 149, hr: 0.87, hrLow: 0.83, hrHigh: 0.90 },
            { max: 299, hr: 0.79, hrLow: 0.75, hrHigh: 0.82 },
            { max: 449, hr: 0.75, hrLow: 0.72, hrHigh: 0.79 },
            { max: 749, hr: 0.74, hrLow: 0.71, hrHigh: 0.77 },
            { max: Infinity, hr: 0.69, hrLow: 0.55, hrHigh: 0.87 },
          ],
          note: 'Arem 2015 Table 3, cancer mortality (same 661k pooled analysis): monotonic inverse dose–response across activity categories — 0.87 below the guideline minimum down to 0.69 at 75+ MET-h/wk vs none.',
        },
        {
          output: 'cvd', type: 'steps', evidence: 'high', source: ['arem2015'],
          supersededBy: 'vo2maxOn',
          steps: [
            { max: 0, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 149, hr: 0.80, hrLow: 0.77, hrHigh: 0.84 },
            { max: 299, hr: 0.67, hrLow: 0.65, hrHigh: 0.70 },
            { max: 449, hr: 0.59, hrLow: 0.57, hrHigh: 0.63 },
            { max: 749, hr: 0.58, hrLow: 0.56, hrHigh: 0.61 },
            { max: Infinity, hr: 0.71, hrLow: 0.56, hrHigh: 0.91 },
          ],
          note: 'Arem 2015 Table 3, CVD mortality: benefit reaches a threshold at 3–5x the guideline minimum (HR 0.58 at 22.5-<40 MET-h/wk) with no additional benefit above (0.61 and 0.71 at 40–75+ MET-h/wk). CVD benefit dominates the all-cause reduction at moderate volumes.',
        },
      ],
    },
    {
      id: 'strength',
      group: 'movement',
      label: 'Strength training',
      kind: 'slider',
      unit: 'sessions/week',
      min: 0, max: 5, step: 1, default: 1,
			hint: 'Assume ~30 min per session.',
      // momma2022 (VERIFIED 2026-08-01 vs the paper, PMC9209691): any vs no
      // muscle strengthening -> all-cause 0.85 (0.79-0.93), CVD 0.83
      // (0.73-0.93), cancer 0.88 (0.80-0.97); J-shaped dose-response with
      // minima at ~40 min/wk (all-cause), ~60 (CVD), ~30 (cancer); RR <1.00
      // up to ~130-140 min/week. GRADE very low for all outcomes.
      // But no effect on colon, kidney, bladder or pancreatic cancer.
      //
      //
      // gordon2018 saw a moderate-sized mean effect delta of 0.66 reduction in depressive symptoms
      // gordon2018 concludes significantly reduced depressive symptoms regardless of physical outcomes of strength training
      //
      // coelhojunior2020 saw a significantly improved overall cognitive function for cognitively healthy and cognitively impaired OLDER adults
      // It also saw a short term memory improvement in only the cognitively healthy older adults.
      //
      // sherrington2019 tested on average 76-year olds of which 77% were women.
      // Control/balance/functional exercise reduced the rate of falls by 24% and the number of people experiencing one or more falls by 13%
      // balance/functional + resistance reduce the fall rate by 34% and the number of people experiencing one or more falls by 22%
      // Tai chi may reduce falls by 19%
      // They are uncertain about the effects of resistance-training only programs, or dance-only or walking-only.
      //
      // howe2011 concluded most effective intervention for neck of femur bone mineral density (BMD) was progressive resistance strength training for legs with a mean difference of 3%
      // Most effective intervention for the spine was combination exercise programmes with a mean difference of 222%
      // The quality of the reporting studies was lowe2017
      //
      // blochibenfeldt2025 had older adults resistance train for 1 year
      // At the end of the 1 year, they saw increased bone formation for heavy resistanace trainers, not in moderate intensity trainers or non-exercisers.
      // After 4 years (1 year training, 3 years without training) they saw no difference between resistance trainers vs non trainers.
      // In general, women had significantly lower BMD.
      //
      effects: [
        {
          output: 'mortality', type: 'steps', evidence: 'low', source: ['momma2022'],
          steps: [
            { max: 0, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 1, hr: 0.85, hrLow: 0.79, hrHigh: 0.93 },
            { max: 2, hr: 0.83, hrLow: 0.79, hrHigh: 0.86 },
            { max: Infinity, hr: 0.91, hrLow: 0.83, hrHigh: 1.00 },
          ],
          note: 'Momma 2022 meta-analysis: any vs no muscle strengthening -> all-cause mortality RR 0.85 (0.79-0.93); non-linear dose-response minimum RR 0.83 (0.79-0.86) at ~40 min/week, RR <1.00 up to ~140 min/week (J-shaped - more is not clearly better). Bands: 1 session/wk = the two-group estimate; 2 sessions = the published non-linear minimum; 3+ = our interpolation (geometric midpoint of min->1.0) - exact values above ~60 min/week are not published. GRADE very low (I² 83%).',
        },
        {
          output: 'happiness', type: 'steps', evidence: 'moderate', source: ['gordon2018'],
          steps: [
            { max: 0, points: 0 },
            { max: Infinity, points: 0.3 },
          ],
          note: 'Meta-analysis of 33 RCTs: resistance training reduced depressive symptoms (effect size 0.66, NNT 4).',
        },
        {
          output: 'cognition', type: 'steps', evidence: 'moderate', source: ['coelhojunior2020'],
          steps: [
            { max: 1, points: 0 },
            { max: Infinity, points: 0.2 },
          ],
          note: 'Meta-analysis of 18 RCTs: resistance training improved overall cognitive function in cognitively healthy older adults (SMD 0.54) and cognitively impaired (SMD 0.60), with benefits on short-term memory and executive function.',
        },
        {
          output: 'cvd', type: 'steps', evidence: 'low', source: ['momma2022'],
          steps: [
            { max: 0, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 1, hr: 0.83, hrLow: 0.73, hrHigh: 0.93 },
            { max: 2, hr: 0.82, hrLow: 0.76, hrHigh: 0.90 },
            { max: Infinity, hr: 0.91, hrLow: 0.82, hrHigh: 1.00 },
          ],
          note: 'Momma 2022: any vs no muscle strengthening -> CVD RR 0.83 (0.73-0.93); non-linear dose-response minimum RR 0.82 (0.76-0.90) at ~60 min/week, RR <1.00 up to ~130 min/week. 3+ session band = our interpolation (geometric midpoint of min->1.0); exact values above ~60 min/week are not published. GRADE very low.',
        },
        {
          output: 'cancer', type: 'steps', evidence: 'low', source: ['momma2022'],
          steps: [
            { max: 0, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 1, hr: 0.88, hrLow: 0.80, hrHigh: 0.97 },
            { max: 2, hr: 0.91, hrLow: 0.85, hrHigh: 0.97 },
            { max: Infinity, hr: 0.95, hrLow: 0.91, hrHigh: 1.00 },
          ],
          note: 'Momma 2022: any vs no muscle strengthening -> total cancer RR 0.88 (0.80-0.97) (two-group; analyses were mostly cancer mortality). Non-linear dose-response minimum RR 0.91 (0.85-0.97) at ~30 min/week, RR <1.00 up to ~130 min/week — the cancer curve peaks earliest, so 2+ sessions/week read slightly higher than the pooled "any" estimate. 3+ band = our interpolation (geometric midpoint of min->1.0). GRADE very low (I² 76%).',
        },
      ],
    },

    {
      id: 'occupationalPA',
      group: 'movement',
      extra: true,
      label: 'Physical activity at work',
      kind: 'slider',
      unit: 'hours/day',
      min: 0, max: 10, step: 0.5, default: 0.5,
      hint: 'Heavy physical work (construction, nursing, warehouse…). Not the same as leisure exercise!',
      // coenen2018 meta-analysis (17 studies, 193,696 workers): the "physical activity paradox"
      // High vs low occupational activity -> all-cause mortality HR 1.18 in MEN (1.05-1.34, I2=76%);
      // women HR 0.90 (0.80-1.01) - authors report no association (tendency toward lower risk).
      // ALL-CAUSE ONLY: the paper has no CVD analysis. OPA->CVD evidence is a published NULL
      // (cillekens2022, 23 studies, 655,892 workers: men HR 1.00, 0.87-1.15; women 0.95, 0.82-1.09;
      // IHD mortality 1.15, 0.88-1.49, NS) - so the CVD card lists OPA as no-data.
      // Middle step is OUR interpolation: the meta-analysis is binary (low vs high), no intermediate
      // category is published; CI widened to the high-exposure CI. Sex-specific: steps apply the
      // male estimate to all sexes (women's pooled estimate was inverse).
      // Evidence is contested: fully adjusted cohorts (dalene2021, 437k Norwegians) found men in
      // active occupations lived LONGER; Coenen pooled mostly crudely adjusted studies, so
      // healthy-worker selection may drive the higher risk (see finding card).
      effects: [
        {
          output: 'mortality', type: 'steps', evidence: 'moderate', source: ['coenen2018'],
          steps: [
            { max: 2, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 6, hr: 1.10, hrLow: 1.05, hrHigh: 1.34 },
            { max: Infinity, hr: 1.18, hrLow: 1.05, hrHigh: 1.34 },
          ],
          note: 'The "physical activity paradox": meta-analysis (17 studies, 193,696 workers) found HIGH occupational activity → all-cause mortality HR 1.18 (1.05–1.34) in MEN; women HR 0.90 (0.80–1.01) — authors report no association for women. Middle step is our interpolation (paper only reports low vs high; CI widened to the high-exposure CI). Steps apply the male estimate to all sexes. Leisure activity benefits don\'t transfer to heavy work. Caveat: evidence is contested — fully adjusted cohorts found the opposite (see finding card).',
        },
      ],
    },

    {
      id: 'steps',
      group: 'movement',
      extra: true,
      label: 'Daily step count',
      kind: 'slider',
      unit: 'steps/day',
      min: 0, max: 20000, step: 500, default: 4800,
      hint: 'Total steps per day from walking, errands, exercise. US average ≈ 4,500–5,000.',
      // lancet2025steps: largest and most comprehensive meta-analysis — 57 studies, 35 cohorts.
      // VERIFIED vs the published abstract (PMID 40713949, Lancet Public Health 10(8):e668–e681)
      // on 2026-07-31: at 7,000 vs 2,000 steps/day — all-cause HR 0.53 (0.46–0.60) NON-LINEAR
      // (inflection ~5,000–7,000 → gains flatten past ~7k); CVD mortality 0.53 (0.37–0.77)
      // LINEAR (3 studies, I² 78%, GRADE low); cancer mortality 0.63 (0.55–0.72) LINEAR;
      // dementia 0.62 (0.53–0.73); depressive symptoms 0.78 (0.73–0.83); cancer incidence
      // 0.94 (0.87–1.01) NS (honest null); CVD incidence 0.75 (0.67–0.85).
      // Intermediate bands (4k/6k) are log-space interpolations between the reference and the
      // verified 7k anchor; CVD/cancer tails follow the review's linear shape and are held flat
      // above 15k (no published support beyond).
      // Cross-checks: paluch2022 (Q2 median 5,801 steps → all-cause HR 0.60 [0.51–0.71]);
      // banach2023 (per-1,000-step HR 0.85 all-cause, HR 0.93 per 500 steps CV mortality —
      // forced-linear models, steeper tails than the review's non-linear fit, which is primary).
      //
      // OVERLAP with cardio (MVPA min/week) — both capture overlapping activity.
      // Effect is NOT additive with cardio; true combined benefit lies between each alone.
      // Steps captures total daily movement (light activity, errands) that the cardio slider misses.
      effects: [
        /*
         * OVERLAP NOTE: Steps and cardio (MVPA min/week) capture overlapping
         * aspects of physical activity. Under the overlap rule, their effects
         * should NOT be multiplied together. We keep cardio as the primary
         * dose-response (cleaner per-unit evidence) and let steps apply
         * independently — but the finding on this input warns that the two
         * estimates partially double-count the same movement. The true
         * combined benefit lies between each estimate alone.
         *
         * Data from: Lancet Public Health 2025 systematic review of 57
         * prospective studies, 35 cohorts — the largest and most comprehensive
         * meta-analysis of device-measured step count and health outcomes.
         */
        {
          output: 'mortality', type: 'steps', evidence: 'moderate', source: ['lancet2025steps', 'banach2023'],
          steps: [
            { max: 2000, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 4000, hr: 0.78, hrLow: 0.73, hrHigh: 0.82 },
            { max: 6000, hr: 0.60, hrLow: 0.54, hrHigh: 0.66 },
            { max: 7000, hr: 0.53, hrLow: 0.46, hrHigh: 0.60 },
            { max: 10000, hr: 0.53, hrLow: 0.46, hrHigh: 0.60 },
            { max: 15000, hr: 0.53, hrLow: 0.46, hrHigh: 0.60 },
            { max: Infinity, hr: 0.53, hrLow: 0.46, hrHigh: 0.60 },
          ],
          note: 'Lancet 2025 dose-response meta-analysis (57 studies, 35 cohorts): all-cause mortality HR 0.53 (0.46–0.60) at 7,000 vs 2,000 steps/day (14 studies, GRADE moderate). Non-linear — gains are steepest from 2,000→6,000 and flatten above ~7,000 (inflection 5,000–7,000), so 10,000+ steps read ~the same as 7,000. The 4,000/6,000 bands are our log-space interpolation between the reference and the verified 7,000-step anchor. Cross-checked against Paluch 2022 (median 5,801 steps → HR 0.60 [0.51–0.71]) and Banach 2023 (per-1,000-step HR 0.85 — forced-linear models give steeper tails than the review\'s non-linear fit, which is primary).',
        },
        {
          output: 'cvd', type: 'steps', evidence: 'low', source: ['lancet2025steps', 'banach2023'],
          steps: [
            { max: 2000, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 4000, hr: 0.78, hrLow: 0.67, hrHigh: 0.90 },
            { max: 6000, hr: 0.60, hrLow: 0.45, hrHigh: 0.81 },
            { max: 7000, hr: 0.53, hrLow: 0.37, hrHigh: 0.77 },
            { max: 10000, hr: 0.36, hrLow: 0.20, hrHigh: 0.66 },
            { max: 15000, hr: 0.19, hrLow: 0.08, hrHigh: 0.51 },
            { max: Infinity, hr: 0.19, hrLow: 0.08, hrHigh: 0.51 },
          ],
          note: 'Lancet 2025: CVD mortality follows a LINEAR dose-response — HR 0.53 (0.37–0.77) at 7,000 vs 2,000 steps/day (3 studies, I² 78%, GRADE low). Bands past 7,000 follow the review\'s linear shape (slope corroborated by Banach 2023: HR 0.93 per 500 steps) and are held flat above 15,000 (no published support beyond). CVD incidence is weaker: HR 0.75 (0.67–0.85) at 7,000. The CVD benefit is partly independent of the all-cause effect (different mediators: BP, lipids, endothelial function).',
        },
        {
          output: 'cancer', type: 'steps', evidence: 'moderate', source: ['lancet2025steps'],
          steps: [
            { max: 2000, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 4000, hr: 0.83, hrLow: 0.79, hrHigh: 0.88 },
            { max: 6000, hr: 0.69, hrLow: 0.62, hrHigh: 0.77 },
            { max: 7000, hr: 0.63, hrLow: 0.55, hrHigh: 0.72 },
            { max: 10000, hr: 0.48, hrLow: 0.38, hrHigh: 0.59 },
            { max: 15000, hr: 0.30, hrLow: 0.21, hrHigh: 0.43 },
            { max: Infinity, hr: 0.30, hrLow: 0.21, hrHigh: 0.43 },
          ],
          note: 'Lancet 2025: cancer mortality HR 0.63 (0.55–0.72) at 7,000 vs 2,000 steps/day (3 studies, GRADE moderate), linear dose-response; bands past 7,000 follow that linear shape, held flat above 15,000. Honest null: cancer INCIDENCE is essentially unaffected (HR 0.94 [0.87–1.01], non-significant, GRADE low) — the mortality benefit likely reflects better outcomes once cancer is diagnosed (adiposity, inflammation, insulin sensitivity), not fewer cancers.',
        },
        {
          output: 'cognition', type: 'steps', evidence: 'moderate', source: ['lancet2025steps'],
          steps: [
            { max: 2000, points: 0 },
            { max: 5000, points: 0.1 },
            { max: 10000, points: 0.25 },
            { max: Infinity, points: 0.35 },
          ],
          note: 'Lancet 2025: dementia risk HR 0.62 (0.53–0.73) at 7,000 vs 2,000 steps/day (2 studies, I² 0%), non-linear — gains flatten above ~7,000. For cognitive function (not just dementia), observational studies show slower decline with higher step counts, but RCT evidence is thin. Points here are modest and based on the dementia HR being consistent across cohorts.',
        },
        {
          output: 'happiness', type: 'steps', evidence: 'low', source: ['lancet2025steps'],
          steps: [
            { max: 2000, points: 0 },
            { max: 5000, points: 0.1 },
            { max: 10000, points: 0.2 },
            { max: Infinity, points: 0.25 },
          ],
          note: 'Lancet 2025: linear inverse association with depressive symptoms — HR 0.78 (0.73–0.83) at 7,000 vs 2,000 steps/day (3 studies, GRADE moderate). The happiness/wellbeing link is largely correlational (more active people report higher wellbeing; reverse causality plausible). Points are small.',
        },
      ],
    },
    {
      id: 'sitting',
      group: 'movement',
      extra: true,
      label: 'Sitting time',
      kind: 'slider',
      unit: 'hours/day',
      min: 4, max: 14, step: 0.5, default: 9,
      hint: 'Desk, commute and couch. US average ≈ 8–10 h/day.',
      // biswas2015 meta-analysis (47 studies): prolonged sitting → HR 1.24 all-cause, after activity adjustment
      // Cancer: HR 1.17, CVD: HR 1.18 (1.179) at high vs low sedentary time
      // BUT the effect ATTENUATES at higher activity levels — an interaction we don't model
      // Sedentary time hits hardest when leisure activity is low (finding: sitting >= 10 && cardio < 150)
      // CVD pathway: impaired endothelial function, reduced lipoprotein lipase activity, metabolic dysregulation
      effects: [
        {
          output: 'mortality', type: 'steps', evidence: 'moderate', source: ['biswas2015'],
          steps: [
            { max: 6, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 9, hr: 1.10, hrLow: 1.04, hrHigh: 1.22 },
            { max: 12, hr: 1.17, hrLow: 1.06, hrHigh: 1.32 },
            { max: Infinity, hr: 1.24, hrLow: 1.09, hrHigh: 1.41 },
          ],
          note: 'Meta-analysis (47 studies): prolonged sitting → HR 1.24 all-cause mortality, adjusted for activity. BUT the effect attenuates at higher activity levels — an interaction we do not model. Middle steps interpolated.',
        },
        {
          output: 'cancer', type: 'steps', evidence: 'moderate', source: ['biswas2015'],
          steps: [
            { max: 6, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 9, hr: 1.08, hrLow: 1.04, hrHigh: 1.15 },
            { max: 12, hr: 1.12, hrLow: 1.06, hrHigh: 1.20 },
            { max: Infinity, hr: 1.17, hrLow: 1.108, hrHigh: 1.242 },
          ],
          note: 'Same meta-analysis, cancer mortality: HR 1.173 (1.108–1.242); middle steps interpolated.',
        },
        {
          output: 'cvd', type: 'steps', evidence: 'moderate', source: ['biswas2015'],
          steps: [
            { max: 6, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 9, hr: 1.07, hrLow: 1.04, hrHigh: 1.12 },
            { max: 12, hr: 1.14, hrLow: 1.08, hrHigh: 1.20 },
            { max: Infinity, hr: 1.18, hrLow: 1.106, hrHigh: 1.257 },
          ],
          note: 'Same meta-analysis, CVD mortality: HR 1.179 (1.106–1.257) for high vs low sedentary time; middle steps interpolated.',
        },
      ],
    },

    // -------------------------------------------------- Diet & substances
    {
      id: 'fiber',
      group: 'diet',
      label: 'Dietary fiber',
      kind: 'slider',
      unit: 'g/day',
      min: 0, max: 50, step: 1, default: 15,
      hint: 'Vegetables, fruit, legumes, whole grains. US average ≈ 15 g/day.',
      // yang2015 meta-analysis (VERIFIED, PMID 25552267): 17 cohorts, 982,411
      // members, 67,260 deaths; RR 0.90 (0.86-0.94) per +10g/day, I2 77%;
      // top-vs-bottom-tertile RR 0.84 (0.80-0.87). Benefit capped at 30g/day;
      // the tertile contrast suggests the linear dose may overstate at high intakes
      //
      // reynolds2019 Lancet series (VERIFIED vs full text, PMID 30638909):
      // colorectal cancer RR 0.84 (0.78-0.89), cancer mortality 0.87
      // (0.79-0.95), CHD mortality 0.69 (0.60-0.81), CHD incidence 0.76,
      // stroke mortality 0.80 (NS), stroke incidence 0.78; optimal 25-29 g/day;
      // CVD composite is our geometric-mean construction (see cvd effect note)
      //
      // aune2016grain (finding): whole grains are part of the fiber benefit — RR 0.83 per 3 servings/day
      // We don't count whole grains separately to avoid double-counting (overlap rule)
      effects: [
        {
          output: 'mortality', type: 'perUnit', per: 10, capAt: 30,
          hr: 0.90, hrLow: 0.86, hrHigh: 0.94,
          evidence: 'high', source: ['yang2015', 'aune2016grain'],
          note: 'Meta-analysis (VERIFIED, PMID 25552267: 17 cohorts, 982,411 members, 67,260 deaths): RR 0.90 (0.86–0.94) per +10 g/day, I² 77%. Benefit capped at 30 g/day in this model; the top-vs-bottom-tertile comparison (RR 0.84, 0.80–0.87) suggests the linear dose may overstate at high intakes. Whole grains (Aune 2016: RR 0.83 per 3 servings/day) run the same pathway — not counted separately (overlap rule).',
        },
        {
          output: 'cancer', type: 'steps', evidence: 'moderate', source: ['reynolds2019'],
          steps: [
            { max: 9, hr: 1.19, hrLow: 1.12, hrHigh: 1.27 },
            { max: 24, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: Infinity, hr: 0.84, hrLow: 0.78, hrHigh: 0.89 },
          ],
          note: 'Reynolds 2019 (Lancet series, 185 prospective studies, ~135M person-years, VERIFIED vs full text): colorectal cancer incidence RR 0.84 (0.78–0.89) highest vs lowest fibre consumers (22 studies, GRADE moderate); cancer mortality RR 0.87 (0.79–0.95); per-8-g linear slope for colorectal incidence RR 0.92 (0.89–0.95). 25–29 g/day optimal with continued benefit at higher intakes. Our >24 g band = the published highest-vs-lowest RR; the <9 g band is the exact log-inverse construction (modeling choice, disclosed).',
        },
        {
          output: 'cvd', type: 'steps', evidence: 'moderate', source: ['reynolds2019'],
          steps: [
            { max: 9, hr: 1.35, hrLow: 0.92, hrHigh: 2.00 },
            { max: 24, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: Infinity, hr: 0.74, hrLow: 0.50, hrHigh: 1.09 },
          ],
          note: 'Reynolds 2019 (VERIFIED vs full text): the paper publishes no single CVD composite — its components are CHD mortality RR 0.69 (0.60–0.81), CHD incidence 0.76 (0.69–0.83), stroke incidence 0.78 (0.69–0.88), stroke mortality 0.80 (0.56–1.14, NS). Our >24 g band is the geometric-mean composite of the two mortality components (CHD + stroke, 0.74) with CI combined in quadrature — a disclosed construction; the <9 g band is its log-inverse.',
        },
      ],
    },
    {
      id: 'fruitVeg',
      group: 'diet',
      label: 'Fruit & vegetables',
      kind: 'slider',
      unit: 'servings/day',
      min: 0, max: 10, step: 0.5, default: 2.6,
      hint: 'One serving ≈ 80 g: a fist-sized portion.',
      // wang2014 dose-response meta-analysis (16 cohorts): HR 0.95 per serving/day, plateau ~5 servings
      // CVD: HR 0.96 per serving — small, graded, robust across cohorts
      // CANCER: "not appreciably associated" — honestly null (unlike CVD). Important negative result.
      //
      // ocean2019 UK Household Longitudinal Study (50k+, fixed effects): wellbeing +0.13 GHQ points
      // per additional portion of fruit/veg; dose-response, robust to time-invariant confounding
      // Correlational but prospective — reverse causality partly addressed by FE design
      effects: [
        {
          output: 'mortality', type: 'perUnit', per: 1, ref: 2.6, capAt: 5,
          hr: 0.95, hrLow: 0.92, hrHigh: 0.98,
          evidence: 'high', source: ['wang2014'],
          note: 'Dose-response meta-analysis (VERIFIED, PMID 25073782: 16 cohorts, 833,234 participants, 56,423 deaths): HR 0.95 (0.92–0.98) per serving/day, threshold ~5 servings after which risk does not reduce further. Calibrated: US average 2.6 servings/day = 1.0×.',
        },
        {
          output: 'happiness', type: 'steps', evidence: 'low', source: ['ocean2019'],
          steps: [
            { max: 4.9, points: 0 },
            { max: Infinity, points: 0.15 },
          ],
          note: 'UK Household Longitudinal Study (50k+ individuals, fixed effects): well-being rises ~0.13 GHQ points per additional portion of fruit/veg, dose-response, robust to time-invariant confounding. Correlational but prospective.',
        },
        {
          output: 'cancer', type: 'perUnit', per: 1, ref: 2.6, capAt: 5,
          hr: 0.97, hrLow: 0.90, hrHigh: 1.03,
          evidence: 'moderate', source: ['wang2014'],
          note: 'Same meta-analysis (VERIFIED vs full text, PMC4115152): cancer mortality HR 0.97 (0.90–1.03, P=0.31) per serving/day — "not appreciably associated", studied, honestly null (unlike cardiovascular mortality).',
        },
        {
          output: 'cvd', type: 'perUnit', per: 1, ref: 2.6, capAt: 5,
          hr: 0.96, hrLow: 0.92, hrHigh: 0.99,
          evidence: 'high', source: ['wang2014'],
          note: 'Same meta-analysis, cardiovascular mortality (VERIFIED vs full text): HR 0.96 (0.92–0.99) per serving/day — small, graded, and robust across cohorts.',
        },
      ],
    },
    {
      id: 'alcohol',
      group: 'substances',
      label: 'Alcohol',
      kind: 'slider',
      unit: 'drinks/week',
      min: 0, max: 30, step: 0.5, default: 2.5,
      hint: 'One drink ≈ 14 g ethanol (a beer, glass of wine, or shot).',
      // wood2018: 83 studies, 600k drinkers — the largest individual-participant analysis
      // Minimum mortality risk ≤100 g/wk (~7 drinks); above that, life expectancy at 40 fell progressively
      // CVD: J-shaped, but NO protective "J" for stroke (HR 1.14 per 100 g/wk throughout)
      // Low-dose CHD protection (HR 0.94 per 100 g/wk) does NOT translate to net all-cause benefit
      // Abstainer-bias debate noted: former/ill drinkers in the reference group inflate apparent benefit
      //
      // mewton2023 IPD meta (15 studies, 24k >60y): light-moderate → lower dementia HR 0.78 vs abstainers
      // J-shaped, but abstainer-bias may inflate the apparent benefit at low doses
      //
      // baumberg2016 (BCS70 10k, FE): alcohol problems → lower life satisfaction −0.18 on 0-10
      // Gronkjær 2022 Copenhagen midlife: abstainers AND heavy drinkers both lower life satisfaction
      // Mappiness app (31k): momentary happiness +3.9/100 when drinking, little overspill to overall life
      //
      // gbd2016 (finding): alcohol is Group 1 carcinogen — cancer risk rises with every level
      // todo: implement GBD2016 findings into model — DONE 2026-07-29
      effects: [
        {
          output: 'mortality', type: 'steps', evidence: 'high', source: ['wood2018'],
          steps: [
            { max: 7, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 14, hr: 1.05, hrLow: 1.03, hrHigh: 1.07 },
            { max: 25, hr: 1.16, hrLow: 1.10, hrHigh: 1.22 },
            { max: Infinity, hr: 1.56, hrLow: 1.49, hrHigh: 1.64 },
          ],
          note: '83 studies, 600k drinkers: minimum risk ≤100 g/wk (~7 drinks); above that, life expectancy at 40 fell ~0.5 y (>100–200 g/wk), 1–2 y (200–350), 4–5 y (>350). HRs here are those published year-losses converted via the Gompertz constant. Reference is light drinkers; abstainer-bias debate noted.',
        },
        {
          output: 'cognition', type: 'steps', evidence: 'moderate', source: ['mewton2023'],
          steps: [
            { max: 14, points: 0 },
            { max: Infinity, points: -0.4 },
          ],
          note: 'IPD meta-analysis of 15 studies (24k people, >60y): light-moderate drinking up to 40 g/day associated with lower dementia risk vs abstainers (HR 0.78); heavy intake cancels any benefit. J-shaped, but abstainer-bias may inflate the apparent benefit at low doses.',
        },
        {
          output: 'happiness', type: 'steps', evidence: 'low', source: ['baumberg2016', 'gronkjaer2022'],
          steps: [
            { max: 14, points: 0 },
            { max: Infinity, points: -0.3 },
          ],
          note: 'BCS70 (10k people, FE): alcohol problems → lower life satisfaction (−0.18 on 0–10 scale); Mappiness app (31k): momentary happiness higher when drinking (+3.9/100) but little overspill. Copenhagen midlife cohort: abstainers and heavy drinkers both had lower life satisfaction than moderate drinkers.',
        },
        {
          output: 'cancer', type: 'steps', evidence: 'high', source: ['gbd2016'],
          steps: [
            { max: 7, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 14, hr: 1.08, hrLow: 1.04, hrHigh: 1.12 },
            { max: 25, hr: 1.18, hrLow: 1.10, hrHigh: 1.26 },
            { max: Infinity, hr: 1.35, hrLow: 1.20, hrHigh: 1.50 },
          ],
          note: 'GBD 2016 systematic analysis: alcohol is causally associated with cancers of the oral cavity, pharynx, larynx, oesophagus, liver, colon, rectum and breast. Risk increases monotonically with consumption — there is no safe threshold for cancer. Our step values approximate the combined dose-response (all cancer sites, both sexes) from GBD 2016 per 10 g ethanol/day increments.',
        },
        {
          output: 'cvd', type: 'steps', evidence: 'high', source: ['wood2018'],
          steps: [
            { max: 7, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 14, hr: 1.04, hrLow: 1.01, hrHigh: 1.07 },
            { max: 25, hr: 1.12, hrLow: 1.06, hrHigh: 1.18 },
            { max: Infinity, hr: 1.46, hrLow: 1.36, hrHigh: 1.56 },
          ],
          note: 'Wood 2018: CVD mortality shows a similar J-shaped dose–response but without the protective "J" for stroke (HR 1.14 per 100 g/wk throughout). The "low-dose protective" effect is mostly coronary heart disease (HR 0.94). Net all-cause is neutral to harmful above ~7 drinks/wk.',
        },
      ],
    },
    {
      id: 'smoking',
      group: 'substances',
      label: 'Smoking',
      kind: 'segmented',
      default: 'never',
      options: [
        { value: 'never', label: 'Never' },
        { value: 'former', label: 'Former' },
        { value: 'current', label: 'Current' },
      ],
    //hint: 'Cigarettes.',
      // jha2013 US nationally representative: current smokers HR ~2.8 (men)–3.0 (women)
      // >10 years of life lost; quitting before 40 avoids ~90% of excess risk
      // CVD mortality is the LARGEST contributor to excess deaths — 2.5× vs never-smokers
      //
      // thun2013 50-year trends: lung-cancer DEATH rate ~25× never-smokers in contemporary US cohorts
      // jha2013 Table 2 (NHIS-linked US cohort, 25–79 y, current vs never): all-cancer mortality
      //   HR 3.2 (2.6–3.9) women / 3.8 (3.1–4.8) men; lung cancer alone HR 17.8 (11.4–27.8) / 14.6 (9.1–23.4)
      //   We use the unisex midpoint 3.5 with a CI spanning both sex-specific intervals.
      // carter2015 has site-specific RRs for former smokers (esp. lung) — see note below
      //
      // anstey2007 meta (19 studies, 26k): current vs never RR 1.79 Alzheimer's, 1.78 vascular dementia
      // Faster yearly MMSE decline β=−0.13; former smokers not at elevated dementia risk
      //
      // lappan2020 HRS cross-lagged panel: smoking → lower life satisfaction β=−0.25, optimism, positive affect
      // Bidirectional — higher wellbeing also predicts reduced likelihood of smoking (reciprocal)
      effects: [
        {
          output: 'mortality', type: 'byOption', evidence: 'high', source: ['jha2013'],
          byOption: {
            never: { hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            former: { hr: 1.30, hrLow: 1.15, hrHigh: 1.45 },
            current: { hr: 2.90, hrLow: 2.40, hrHigh: 3.30 },
          },
          note: 'US nationally representative: current smokers HR ≈ 2.8 (men)–3.0 (women), >10 years of life lost. Quitting before 40 avoids ~90% of the excess risk; the "former" value is an average — it depends heavily on quit age and dose.',
        },
        {
          output: 'cognition', type: 'byOption', evidence: 'moderate', source: ['anstey2007'],
          byOption: { never: { points: 0 }, former: { points: -0.05 }, current: { points: -0.2 } },
          note: 'Meta-analysis of 19 prospective studies (26k people): current vs never smokers had RR 1.79 for Alzheimer\'s, 1.78 for vascular dementia, and faster yearly MMSE decline (β=−0.13). Former smokers not at elevated dementia risk but showed accelerated cognitive decline.',
        },
        {
          output: 'happiness', type: 'byOption', evidence: 'low', source: ['lappan2020'],
          byOption: { never: { points: 0 }, former: { points: -0.05 }, current: { points: -0.2 } },
          note: 'HRS cross-lagged panel: smoking predicted lower life satisfaction (β=−0.25), optimism, positive affect, and purpose 4 years later. Bidirectional — higher PWB also predicted reduced likelihood of smoking. Ex-smokers do not show net SWB loss in most studies.',
        },
        {
          output: 'cancer', type: 'byOption', evidence: 'moderate', source: ['jha2013'],
          byOption: {
            never: { hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            former: { hr: 1.40, hrLow: 1.20, hrHigh: 1.60 },
            current: { hr: 3.50, hrLow: 2.60, hrHigh: 4.80 },
          },
          note: 'Jha 2013 Table 2 (US nationally representative, current vs never smokers): all-cancer mortality HR 3.2 (2.6–3.9) in women and 3.8 (3.1–4.8) in men; lung cancer alone HR 17.8 (11.4–27.8) women / 14.6 (9.1–23.4) men. We use the unisex midpoint 3.5 with a CI spanning both sex-specific intervals. "Former" is an approximation — it depends heavily on quit age and dose; Carter 2015 has site-specific figures (e.g. lung) for former smokers.',
        },
        {
          output: 'cvd', type: 'byOption', evidence: 'high', source: ['jha2013'],
          byOption: {
            never: { hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            former: { hr: 1.25, hrLow: 1.10, hrHigh: 1.40 },
            current: { hr: 2.50, hrLow: 2.10, hrHigh: 3.00 },
          },
          note: 'Jha 2013: CVD mortality is the largest single contributor to excess deaths from smoking — 2.5× vs never-smokers. Quitting before 40 avoids ~90% of the CVD excess, same as for all-cause.',
        },
      ],
    },
    {
      id: 'vaping',
      group: 'substances',
      label: 'Vaping (e-cigarettes)',
      kind: 'segmented',
      default: 'never',
      options: [
        { value: 'never', label: 'Never' },
        { value: 'current', label: 'Current' },
      ],
      hint: 'No dose–response data exists, so just "do you vape?" — most adult vapers are ex-smokers or dual users.',
      // Evidence, verified against primary sources 2026-07-31:
      //
      // MORTALITY: the only national cohort (NHIS 2014–2018, n=145,390, median 3.5 y FU)
      // SUPPRESSED the exclusive-vaping estimate — 480 never-smoker vapers, too few deaths.
      // No honest HR exists, so we show "no data yet" on the mortality card. Dual use
      // (smoke + vape) HR 2.44 (1.90–3.13) vs never/never and ≈ exclusive smoking
      // (1.06, 0.83–1.37); complete switchers (vape + former smoker) HR 0.64 (0.41–0.99)
      // vs continued smoking — the dual-use message lives in a finding.
      //
      // CVD: PATH cohort (n=24,027, 2013–2019): exclusive vapers vs nonusers — any CVD
      // HR 1.00 (0.69–1.45); MI/HF/stroke 1.35 (0.75–2.42) on just 15 events. Two
      // cross-sectional studies also null. We score the "any CVD" point estimate.
      //
      // CANCER: 39-study review: no significant incident/prevalent cancer in never-smoker
      // vapers; biomarker evidence (DNA damage, genotoxicity) is mostly acute-exposure.
      //
      // COGNITION: scoping review — acute effects minimal; self-reported memory,
      // concentration and decision-making impairments in smokers AND never-smokers.
      //
      // HAPPINESS: UKHLS n=19,706: initiation → worse general mental health (d=0.28),
      // social dysfunction & anhedonia (b=0.36, 0.18–0.54), loss of confidence (b=0.24).
      effects: [
        {
          output: 'cvd', type: 'byOption', evidence: 'low', source: ['berlowitz2022'],
          byOption: {
            never: { hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            current: { hr: 1.00, hrLow: 0.69, hrHigh: 1.45 },
          },
          note: 'PATH cohort (24k US adults, 2013–2019): exclusive e-cigarette users had CVD incidence not different from nonusers (any CVD HR 1.00, 0.69–1.45). MI/HF/stroke point estimate 1.35 but rests on 15 events (0.75–2.42). Incidence used as a proxy for CVD mortality; follow-up ≤4 y.',
        },
        {
          output: 'cognition', type: 'byOption', evidence: 'low', source: ['novak2024'],
          byOption: { never: { points: 0 }, current: { points: -0.1 } },
          note: 'Scoping review (7 experimental, 4 cross-sectional): acute cognitive effects in smokers minimal; self-reported impairments in memory, concentration and decision-making reported in both smokers and never-smokers. Long-term effects unclear.',
        },
        {
          output: 'happiness', type: 'byOption', evidence: 'low', source: ['kang2024'],
          byOption: { never: { points: 0 }, current: { points: -0.15 } },
          note: 'UKHLS (n=19,706, waves 9–10): e-cigarette initiation predicted worse general mental health (Cohen\'s d=0.28), social dysfunction & anhedonia (b=0.36, 0.18–0.54) and loss of confidence (b=0.24); no signal for depression/anxiety. One study, residual confounding plausible.',
        },
      ],
    },
    {
      id: 'coffee',
      group: 'diet',
      extra: true,
      label: 'Coffee',
      kind: 'slider',
      unit: 'cups/day',
      min: 0, max: 6, step: 1, default: 2,
      hint: 'Decaf also counts.',
      // poole2017 umbrella review (BMJ 359:j5024): largest all-cause reduction at 3-4 cups/day
      // (RR 0.83, 0.79-0.88) — our 3-4 cup step matches the published estimate EXACTLY
      // CVD mortality strongest of all outcomes: RR 0.81 (0.72-0.90) at 3-4 cups — exact match
      // Cancer incidence: 18% lower at high vs low (RR 0.82, 0.74-0.89) — exact match
      // 1-2 and 5+ steps: not published as categories; they approximate the Grosso 2016
      // non-linear dose-response curve (curve ~0.90 at 2 cups; 7 cups = 0.90, 0.85-0.96)
      // Cognition: lower Alzheimer's and cognitive decline in prospective studies (moderate evidence)
      // Depression: inverse dose-response association (RR ~0.85 at 3-4 cups) — observational, confounded
      //
      // Finding: CVD mortality benefit at 3+ cups; increased fracture risk in women at 5+ cups (poole2017)
      // Overall pattern: non-linear, largest benefit at 3-4 cups, slightly attenuated at 5+ cups
      effects: [
        {
          output: 'mortality', type: 'steps', evidence: 'moderate', source: ['poole2017', 'grosso2016'],
          steps: [
            { max: 0, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 2, hr: 0.90, hrLow: 0.86, hrHigh: 0.95 },
            { max: 4, hr: 0.83, hrLow: 0.79, hrHigh: 0.88 },
            { max: Infinity, hr: 0.88, hrLow: 0.82, hrHigh: 0.95 },
          ],
          note: 'Umbrella review: largest all-cause risk reduction at 3–4 cups/day (RR 0.83, 0.79–0.88) — exact published estimate. The 1–2 and 5+ steps approximate the non-linear dose-response curve (Grosso 2016): ~0.90 at 2 cups, and the published 7-cup estimate is 0.90 (0.85–0.96).',
        },
        {
          output: 'cancer', type: 'steps', evidence: 'moderate', source: ['poole2017', 'grosso2016'],
          steps: [
            { max: 0, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 2, hr: 0.92, hrLow: 0.85, hrHigh: 1.00 },
            { max: 4, hr: 0.82, hrLow: 0.74, hrHigh: 0.89 },
            { max: Infinity, hr: 0.85, hrLow: 0.76, hrHigh: 0.95 },
          ],
          note: 'Same umbrella review, incident cancer: 18% lower at high vs low consumption (0.82, 0.74–0.89) — exact published estimate. 1–2 and 5+ steps interpolated from the high-vs-low pattern (no published cancer dose-response categories).',
        },
        {
          output: 'cvd', type: 'steps', evidence: 'moderate', source: ['poole2017', 'grosso2016'],
          steps: [
            { max: 0, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 2, hr: 0.88, hrLow: 0.80, hrHigh: 0.96 },
            { max: 4, hr: 0.81, hrLow: 0.72, hrHigh: 0.90 },
            { max: Infinity, hr: 0.85, hrLow: 0.74, hrHigh: 0.96 },
          ],
          note: 'Same umbrella review, CVD mortality: RR 0.81 (0.72–0.90) at 3–4 cups/day — exact published estimate, the strongest outcome in the review. 1–2 and 5+ steps approximate the Grosso 2016 non-linear CVD curve (slightly less steep than all-cause).',
        },
        {
          output: 'cognition', type: 'steps', evidence: 'moderate', source: ['poole2017'],
          steps: [
            { max: 0, points: 0 },
            { max: 3, points: 0.15 },
            { max: Infinity, points: 0.25 },
          ],
          note: 'Umbrella review: coffee consumption associated with lower risk of cognitive decline and Alzheimer\'s disease in prospective cohorts; alertness effects are acute and well-established. Moderate evidence for dementia prevention, not all cognitive domains.',
        },
        {
          output: 'happiness', type: 'steps', evidence: 'low', source: ['poole2017'],
          steps: [
            { max: 0, points: 0 },
            { max: 3, points: 0.1 },
            { max: Infinity, points: 0.1 },
          ],
          note: 'Same umbrella review: coffee inversely associated with depression in dose-response meta-analyses (RR ~0.85 for depression at 3–4 cups/day). Observational — confounding by socioeconomic status is plausible. Effect on happiness is small and indirect.',
        },
      ],
    },

    {
      id: 'snus',
      group: 'substances',
      extra: true,
      label: 'Snus / smokeless tobacco',
      kind: 'segmented',
      default: 'no',
      options: [
        { value: 'no', label: 'No' },
        { value: 'yes', label: 'Yes' },
      ],
     // hint: 'Swedish-style snus has the best data. Less harmful than smoking — not harmless.',
      // byhamre2021 pooled 8 Swedish cohorts (169k never-smoking men): exclusive current snus use
      // All-cause: aHR 1.28 (1.20-1.35), CVD: aHR 1.27 (1.15-1.41), cancer: aHR 1.12 (1.00-1.26)
      // Risk increases with DURATION of use, not weekly amount. Men-only data.
      // Harm reduction relative to smoking (no combustion) but not harmless — ~28% higher all-cause
      effects: [
        {
          output: 'mortality', type: 'byOption', evidence: 'moderate', source: ['byhamre2021'],
          byOption: {
            no: { hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            yes: { hr: 1.28, hrLow: 1.20, hrHigh: 1.35 },
          },
          note: 'Pooled 8 Swedish cohorts (VERIFIED, PMID 33347584: 169,103 never-smoking men): exclusive current snus use → aHR 1.28 (1.20–1.35) all-cause, 1.27 (1.15–1.41) cardiovascular, 1.12 (1.00–1.26) cancer mortality. Risk rose with duration of use, not weekly amount. Men-only data; other smokeless products may differ.',
        },
        {
          output: 'cancer', type: 'byOption', evidence: 'moderate', source: ['byhamre2021'],
          byOption: {
            no: { hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            yes: { hr: 1.12, hrLow: 1.00, hrHigh: 1.26 },
          },
          note: 'Same pooled analysis (VERIFIED): cancer mortality aHR 1.12 (1.00–1.26) — weaker and borderline, mostly pancreatic in the wider literature.',
        },
        {
          output: 'cvd', type: 'byOption', evidence: 'moderate', source: ['byhamre2021'],
          byOption: {
            no: { hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            yes: { hr: 1.27, hrLow: 1.15, hrHigh: 1.41 },
          },
          note: 'Same pooled analysis (VERIFIED): cardiovascular mortality aHR 1.27 (1.15–1.41). The all-cause and CVD HRs are near-identical because CVD is a large share of the excess.',
        },
      ],
    },
    {
      id: 'cannabis',
      group: 'substances',
      extra: true,
      label: 'Cannabis',
      kind: 'segmented',
      default: 'never',
      options: [
        { value: 'never', label: 'Never' },
        { value: 'occasional', label: 'Occasional' },
        { value: 'regular', label: 'Regular' },
      ],
      //hint: 'Smoked or otherwise. Honest summary: mortality data weak, mental-health data concerning.',
      // sidney1997 Kaiser Permanente (65k): current use NOT significantly associated with mortality
      // RR 1.12 (CI crosses 1.0) — an honest null. But "no mortality signal" ≠ safe.
      // Smoked cannabis likely shares combustion harms with tobacco (not quantified here).
      //
      // moore2007 systematic review: psychosis risk rises dose-dependently
      // Ever-use OR 1.41; heavy use OR 2.09. Affective outcomes less consistent — depression/anxiety
      // evidence weaker, confounding substantial.
      //
      // Finding: no clear all-cause mortality increase in long-term cohorts (sidney1997)
      // Finding: ~doubled odds of psychotic outcomes at regular use (moore2007)
      effects: [
        {
          output: 'mortality', type: 'byOption', evidence: 'low', source: ['sidney1997'],
          byOption: {
            never: { hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            occasional: { hr: 1.05, hrLow: 0.90, hrHigh: 1.25 },
            regular: { hr: 1.12, hrLow: 0.89, hrHigh: 1.39 },
          },
          note: 'Kaiser Permanente cohort (VERIFIED, PMID 9146436: 65,171 people): men current marijuana use — non-AIDS mortality RR 1.12 (0.89–1.39, NOT significant); women 1.09 (0.80–1.48). The "regular" band is the published men\'s estimate; "occasional" is an interpolation between never and that estimate (disclosed). An honest null — but "no mortality signal" ≠ safe; see findings below. Smoked cannabis likely shares combustion harms with tobacco (not yet quantified).',
        },
        {
          output: 'cognition', type: 'byOption', evidence: 'low', source: ['moore2007'],
          byOption: { never: { points: 0 }, occasional: { points: -0.1 }, regular: { points: -0.3 } },
          note: 'Systematic review (VERIFIED, PMID 17662880): psychosis risk rises dose-dependently — ever-use OR 1.41 (1.20–1.65), most frequent use OR 2.09 (1.54–2.84). Evidence for depression/anxiety outcomes less consistent. Cognitive points are qualitative.',
        },
        {
          output: 'happiness', type: 'byOption', evidence: 'low', source: ['moore2007'],
          byOption: { never: { points: 0 }, occasional: { points: -0.05 }, regular: { points: -0.25 } },
          note: 'Affective outcomes (depression, anxiety) associated in some cohorts but confounding is substantial — the review calls the evidence "less strong" than for psychosis.',
        },
      ],
    },
    {
      id: 'magnesium',
      group: 'diet',
      extra: true,
      label: 'Dietary magnesium',
      kind: 'slider',
      unit: 'mg/day',
      min: 0, max: 600, step: 10, default: 280,
      hint: 'Nuts, legumes, whole grains, leafy greens. Typical intake ≈ 250–350 mg/day.',
      // fang2016 dose-response meta (VERIFIED, PMID 27927203: 40 cohorts,
      // >1M participants, 10,983 deaths): RR 0.90 (0.81-0.99) per +100mg/day
      // all-cause mortality. IMPORTANT: total CVD is NULL per the paper
      // (RR 0.99, 0.88-1.10, NS; CHD 0.92, 0.85-1.01, NS) — the old 0.85
      // cvd column was not in the paper. Protective components: stroke
      // 0.93 (0.89-0.97), heart failure 0.78 (0.69-0.89); T2D 0.81
      // (0.77-0.86). Dietary intake partly a marker of overall diet
      // quality; supplement trials are weaker.
      //
      // Finding (fang2016): higher Mg associated with lower heart-failure risk (RR 0.78 per 100mg/day)
      // and lower type-2 diabetes risk (RR 0.81) — both plausible mechanisms (electrolyte balance, insulin sensitivity)
      effects: [
        {
          output: 'mortality', type: 'perUnit', per: 100, ref: 250, minDose: 150, capAt: 450,
          hr: 0.90, hrLow: 0.81, hrHigh: 0.99,
          evidence: 'moderate', source: ['fang2016'],
          note: 'Dose-response meta-analysis (VERIFIED, PMID 27927203: 40 cohorts, >1M participants, 10,983 deaths): RR 0.90 (0.81–0.99) per +100 mg/day, anchored here at 250 mg and capped at 450 mg. Dietary intake — partly a marker of overall diet quality; supplement trials are weaker.',
        },
        {
          output: 'cvd', type: 'perUnit', per: 100, ref: 250, minDose: 150, capAt: 450,
          hr: 0.99, hrLow: 0.88, hrHigh: 1.10,
          evidence: 'moderate', source: ['fang2016'],
          note: 'Same meta-analysis (VERIFIED vs abstract): total CVD per 100 mg/day RR 0.99 (0.88–1.10) — NOT significant; CHD 0.92 (0.85–1.01, NS). The protection is component-specific: stroke 0.93 (0.89–0.97), heart failure 0.78 (0.69–0.89). The old 0.85 estimate was not in the paper; the composite CVD signal is effectively null.',
        },
      ],
    },
    {
      id: 'purpose',
      group: 'extras',
      extra: true,
      label: 'Sense of purpose',
      kind: 'slider',
      unit: '/ 10',
      min: 1, max: 10, step: 1, default: 6,
      hint: '"My life has direction and meaning." 1 = not at all, 10 = completely.',
      // cohen2016 meta-analysis (10 prospective, 136k people): high purpose → RR 0.83 all-cause + CV events
      // Association persisted after adjusting for depression, health behaviours, SES
      // But causality unproven — purpose may mark lower depression, higher activity, better adherence
      // Low-purpose finding: tracks higher mortality in prospective cohorts — a signal worth taking seriously
      // CVD mechanism largely indirect: higher purpose → more activity, less smoking, better treatment adherence
      // Happiness effect: purpose and wellbeing overlap almost by definition
      effects: [
        {
          output: 'mortality', type: 'steps', evidence: 'moderate', source: ['cohen2016'],
          steps: [
            { max: 3, hr: 1.10, hrLow: 1.00, hrHigh: 1.33 },
            { max: 7, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: Infinity, hr: 0.83, hrLow: 0.75, hrHigh: 0.91 },
          ],
          note: 'Meta-analysis (VERIFIED, PMID 26630073: 10 prospective studies, 136,265 people): high purpose → RR 0.83 (0.75–0.91) all-cause mortality and RR 0.83 (0.75–0.92) CV events. The low-purpose step is our approximation. Causality unproven — purpose may mark depression or circumstance.',
        },
        {
          output: 'happiness', type: 'steps', evidence: 'low', source: ['cohen2016'],
          steps: [
            { max: 3, points: -0.6 },
            { max: 7, points: 0 },
            { max: Infinity, points: 0.5 },
          ],
          note: 'Purpose and wellbeing overlap almost by definition; included so the slider visibly does something.',
        },
        {
          output: 'cvd', type: 'steps', evidence: 'moderate', source: ['cohen2016'],
          steps: [
            { max: 3, hr: 1.10, hrLow: 1.00, hrHigh: 1.30 },
            { max: 7, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: Infinity, hr: 0.83, hrLow: 0.75, hrHigh: 0.92 },
          ],
          note: 'Cohen 2016 (VERIFIED, PMID 26630073): purpose in life was associated with lower combined CVD event risk (RR 0.83, 0.75–0.92), similar to all-cause. The association is largely indirect — higher purpose tracks more activity, less smoking, better treatment adherence.',
        },
      ],
    },
    {
      id: 'processedMeat',
      group: 'diet',
      label: 'Processed meat',
      kind: 'slider',
      unit: 'servings/week',
      min: 0, max: 14, step: 0.5, default: 1.5,
      hint: 'Bacon, sausages, deli meats, hot dogs. US average ≈ 1–2 servings/week.',
      // pan2012 NHS+HPFS (124k people): HR 1.20 per daily serving processed red meat for all-cause
      // CVD mortality: HR 1.13 driven by stroke (sodium) and CHD (saturated fat)
      // Cancer mortality: HR 1.16 — IARC Group 1 carcinogen (colorectal cancer evidence strongest)
      // Unprocessed red meat: HR 1.13 (weaker, not separately modelled)
      //
      // Finding: swapping 1 daily serving for fish/poultry/nuts/legumes → 7-19% lower mortality
      // Substitution matters more than absolute intake — the benefit of reducing is partly about what replaces it
      effects: [
        {
          output: 'mortality', type: 'perUnit', per: 7, ref: 1.5, capAt: 14,
          hr: 1.20, hrLow: 1.15, hrHigh: 1.24,
          evidence: 'high', source: ['pan2012'],
          note: 'NHS + HPFS cohorts (124k people): HR 1.20 (1.15–1.24) per daily serving of processed red meat (unprocessed red meat: 1.13). Anchored at the US-average ~1.5 servings/week. Substituting 1 daily serving with fish/poultry/nuts/legumes → 7–19% lower mortality in the same study.',
        },
        {
          output: 'cancer', type: 'perUnit', per: 7, ref: 1.5, capAt: 14,
          hr: 1.16, hrLow: 1.09, hrHigh: 1.23,
          evidence: 'high', source: ['pan2012'],
          note: 'Same cohorts, cancer mortality: HR 1.16 (1.09–1.23) per daily serving of processed meat.',
        },
        {
          output: 'cvd', type: 'perUnit', per: 7, ref: 1.5, capAt: 14,
          hr: 1.13, hrLow: 1.08, hrHigh: 1.19,
          evidence: 'high', source: ['pan2012'],
          note: 'Same cohorts, CVD mortality: HR 1.13 (1.08–1.19) per daily serving — driven largely by stroke (sodium content) and coronary heart disease (saturated fat).',
        },
      ],
    },
    {
      id: 'ssb',
      group: 'diet',
      extra: true,
      label: 'Sugary drinks',
      kind: 'slider',
      unit: 'servings/week',
      min: 0, max: 21, step: 0.5, default: 4.9,
      hint: 'Soda, sweetened juices, energy drinks. One serving = 355 ml',
      // malik2019 NHS+HPFS: graded dose-response across all outcomes vs <1/month consumption
      // CVD mortality strongest: HR 1.31 at ≥2/day — driven by fructose metabolic effects
      // (insulin resistance, hypertension, dyslipidaemia, visceral adiposity)
      // Cancer: HR 1.16 at ≥2/day, mechanism through obesity and insulin pathways
      // Artificially sweetened drinks: mostly null (unconfirmed signal in women only — needs replication)
      effects: [
        {
          output: 'mortality', type: 'steps', evidence: 'high', source: ['malik2019'],
          steps: [
            { max: 0.2, hr: 0.9434, hrLow: 0.9434, hrHigh: 0.9434 },
            { max: 1, hr: 0.9528, hrLow: 0.9245, hrHigh: 0.9811 },
            { max: 6, hr: 1.0000, hrLow: 0.9717, hrHigh: 1.0283 },
            { max: 13, hr: 1.0755, hrLow: 1.0283, hrHigh: 1.1226 },
            { max: Infinity, hr: 1.1415, hrLow: 1.0660, hrHigh: 1.2075 },
          ],
          note: 'NHS + HPFS: graded dose-response vs <1/month. Calibrated: US average 4.9 servings/week = 1.0×. CVD mortality 1.31 and cancer mortality 1.16 at the extremes. Artificially sweetened drinks: mostly null (unconfirmed signal in women only).',
        },
        {
          output: 'cancer', type: 'steps', evidence: 'moderate', source: ['malik2019'],
          steps: [
            { max: 0.2, hr: 0.9434, hrLow: 0.9434, hrHigh: 0.9434 },
            { max: 6, hr: 0.9906, hrLow: 0.9434, hrHigh: 1.0566 },
            { max: 13, hr: 1.0377, hrLow: 0.9623, hrHigh: 1.1321 },
            { max: Infinity, hr: 1.0943, hrLow: 0.9811, hrHigh: 1.2169 },
          ],
          note: 'Same cohorts, cancer mortality: 1.16 (1.04–1.29) at ≥2/day originally. Calibrated: US average 4.9 servings/week = 1.0×.',
        },
        {
          output: 'cvd', type: 'steps', evidence: 'high', source: ['malik2019'],
          steps: [
            { max: 0.2, hr: 0.9434, hrLow: 0.9434, hrHigh: 0.9434 },
            { max: 1, hr: 0.9528, hrLow: 0.9151, hrHigh: 0.9906 },
            { max: 6, hr: 1.0000, hrLow: 0.9528, hrHigh: 1.0566 },
            { max: 13, hr: 1.1038, hrLow: 1.0377, hrHigh: 1.1887 },
            { max: Infinity, hr: 1.2358, hrLow: 1.1321, hrHigh: 1.3491 },
          ],
          note: 'Same cohorts, CVD mortality: stronger than all-cause — 1.31 at ≥2/day originally. Calibrated: US average 4.9 servings/week = 1.0×. Driven by the metabolic effects of fructose (insulin resistance, hypertension, dyslipidaemia).',
        },
      ],
    },
    {
      id: 'fish',
      group: 'diet',
      extra: true,
      label: 'Fish',
      kind: 'segmented',
      default: 'some',
      options: [
        { value: 'none', label: 'None' },
        { value: 'some', label: '1–2 / week' },
        { value: 'lots', label: '3+ / week' },
      ],
      //hint: 'Modest mortality benefit (~3–5% lower), slightly stronger for CVD (~4–6% lower). Observational — part of the benefit may be substitution (fish replacing red meat).',
      // jayedi2018 dose-response meta (VERIFIED, PMID 29317009: 14 cohorts, 911,348
      // participants, 75,451 deaths): all-cause RR 0.98 (0.97-1.00) per 20 g/day
      // (I2 82%); CVD mortality RR 0.96 (0.94-0.98) per 20 g/day (I2 0%).
      // kwok2019 review independently reports the same fish all-cause 0.98 (0.97-1.00).
      // Bands below = the published per-20-g linear slope at ~0.7x (1-2 servings/wk
      // ≈ 14 g/d) and ~1.8x (3+ servings/wk ≈ 36 g/d), log-scaled. Caveat: the
      // dose-response is U-shaped in Western cohorts (nadir ~20-60 g/d) — the 3+/week
      // band assumes intake stays in the beneficial window.
      //
      // Cancer (zhang2018, NIH-AARP 421,309 people): men highest-vs-lowest fish quintile
      // 6% lower cancer mortality (RR 0.94, 0.90-0.99); women null. Site-specific metas
      // are inconsistent — total-cancer signal is small and sex-dependent. Bands are a
      // conservative construction centered on the men's estimate, pulled toward null
      // for the null women's result (disclosed).
      //
      // li2016fish meta (21 studies, 260k): fish consumption → lower depression risk RR 0.88
      // Dose-response gradient, observational only. Omega-3 supplements DO NOT replicate this
      // (VITAL: null) — the fish benefit is partly about eating fish, not isolated omega-3
      effects: [
        {
          output: 'mortality', type: 'byOption', evidence: 'moderate', source: ['kwok2019', 'jayedi2018'],
          byOption: {
            none: { hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            some: { hr: 0.98, hrLow: 0.98, hrHigh: 1.00 },
            lots: { hr: 0.96, hrLow: 0.95, hrHigh: 1.00 },
          },
          note: 'Dose-response meta-analyses (VERIFIED): RR 0.98 (0.97–1.00) per 20 g/day all-cause mortality (Jayedi 2018, 14 cohorts/911,348 people; I² 82%) — independently confirmed by the Kwok 2019 review (0.98, 0.97–1.00). 1–2 servings/week ≈ 0.7×20 g → 0.98; 3+ servings/week ≈ 1.8×20 g → 0.96 (log-scaled construction, disclosed). Caveat: the curve is U-shaped in Western cohorts (nadir ~20–60 g/day) and part of the benefit is substitution for red/processed meat.',
        },
        {
          output: 'cancer', type: 'byOption', evidence: 'low', source: ['zhang2018'],
          byOption: {
            none: { hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            some: { hr: 0.99, hrLow: 0.96, hrHigh: 1.02 },
            lots: { hr: 0.97, hrLow: 0.94, hrHigh: 1.00 },
          },
          note: 'No consistent total-cancer signal (VERIFIED, Zhang 2018, NIH-AARP 421,309 people, 16 y): men highest-vs-lowest fish quintile had 6% lower cancer mortality (RR 0.94, 0.90–0.99); women null. Site-specific meta-analyses are inconsistent. Bands are a conservative construction centered on the men\'s estimate and pulled toward null for the null women\'s result (disclosed) — the honest bottom line is "fish ≈ neutral for total cancer".',
        },
        {
          output: 'cvd', type: 'byOption', evidence: 'moderate', source: ['jayedi2018'],
          byOption: {
            none: { hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            some: { hr: 0.97, hrLow: 0.96, hrHigh: 0.99 },
            lots: { hr: 0.93, hrLow: 0.89, hrHigh: 0.96 },
          },
          note: 'Dose-response (VERIFIED, Jayedi 2018): CVD mortality RR 0.96 (0.94–0.98) per 20 g/day, I² 0%, consistent across cohorts. Bands are the published per-20-g slope at ~0.7× (1–2 servings/week ≈ 14 g/day → 0.97) and ~1.8× (3+ servings/week ≈ 36 g/day → 0.93), log-scaled construction (disclosed). Omega-3 supplementation does not reproduce this in RCTs (VITAL: null) — part of the association is eating fish instead of meat.',
        },
        {
          output: 'happiness', type: 'byOption', evidence: 'low', source: ['li2016fish'],
          byOption: {
            none: { points: -0.05 },
            some: { points: 0 },
            lots: { points: 0.1 },
          },
          note: 'Meta-analysis of 21 studies (260k people): fish consumption associated with lower risk of depression — RR 0.88 (0.79–0.97) for highest vs lowest intake, dose-response relationship. Observational only; the pathway is likely through omega-3 fatty acids, but supplements do not replicate the effect (VITAL: null). The happiness effect here is small and correlational.',
        },
      ],
    },

    {
      id: 'nuts',
      group: 'diet',
      extra: true,
      label: 'Nuts',
      kind: 'slider',
      unit: 'g/day',
      min: 0, max: 50, step: 1, default: 5,
      hint: 'A small handful ≈ 25–30 g. US average is low (~5 g/day).',
      // aune2016nuts dose-response meta (20 studies): RR 0.78 per 28g/day all-cause — tree nuts = peanuts
      // CVD: RR 0.79 per 28g/day — lipid-lowering, anti-inflammatory, endothelial effects clearest here
      // Cancer: RR 0.85 per 28g/day — weaker but significant; antioxidants, fibre, phytosterols
      // Benefit capped at ~35g/day in this model
      //
      // Finding (aune2016nuts): also ~50% lower respiratory-disease and ~40% lower diabetes mortality
      // at a handful/day — the effect extends well beyond CVD, suggesting multiple pathways
      // (micronutrients, healthy fat profile, fibre, antioxidant content)
      effects: [
        {
          output: 'mortality', type: 'perUnit', per: 28, capAt: 35,
          hr: 0.78, hrLow: 0.72, hrHigh: 0.84,
          evidence: 'high', source: ['aune2016nuts'],
          note: 'Dose-response meta-analysis (VERIFIED vs abstract, PMID 27916000: 20 studies/29 publications, 15 on all-cause): RR 0.78 (0.72–0.84) per 28 g/day, I² 66%. Results similar for tree nuts and peanuts. Benefit capped at 35 g/day in this model.',
        },
        {
          output: 'cancer', type: 'perUnit', per: 28, capAt: 35,
          hr: 0.85, hrLow: 0.76, hrHigh: 0.94,
          evidence: 'high', source: ['aune2016nuts'],
          note: 'Same meta-analysis (VERIFIED, PMID 27916000): total cancer RR 0.85 (0.76–0.94) per 28 g/day, n=8 studies, I² 42%.',
        },
        {
          output: 'cvd', type: 'perUnit', per: 28, capAt: 35,
          hr: 0.79, hrLow: 0.70, hrHigh: 0.88,
          evidence: 'high', source: ['aune2016nuts'],
          note: 'Same meta-analysis (VERIFIED, PMID 27916000): CVD mortality RR 0.79 (0.70–0.88) per 28 g/day, n=12, I² 60% (CHD 0.71 [0.63–0.80]; stroke 0.93 [0.83–1.05], NS) — lipid-lowering, anti-inflammatory and endothelial effects are clearest for CVD.',
        },
      ],
    },

    // ----------------------------------------------------- Recovery & mind
    {
      id: 'sleep',
      group: 'mind',
      label: 'Sleep',
      kind: 'slider',
      unit: 'hours/night',
      min: 4, max: 11, step: 0.5, default: 7,
      hint: 'Habitual sleep duration.',
      // cappuccio2010 meta (16 studies, 1.4M): U-shaped — short sleep RR 1.12, long RR 1.30
      // Long sleep partly reflects illness/confounding (reverse causation — sick people sleep more)
      // CVD (cappuccio2011 EHJ, 15 studies/475k): total CVD short RR 1.03 (NS), long RR 1.41
      // — the short-sleep signal is in CHD (1.48) and stroke (1.15) individually, not the composite
      //
      // lowe2017 meta (61 experimental studies): sleep restriction impairs executive function (g=−0.324)
      // sustained attention (g=−0.409), long-term memory (g=−0.192) — medium effects, increase with age
      //
      // bacaro2023 longitudinal meta (42 studies): good sleep predicts higher well-being (r=0.18)
      // and psychological well-being (r=0.15). Bidirectional — small-to-moderate effect sizes
      effects: [
        {
          output: 'mortality', type: 'steps', evidence: 'high', source: ['cappuccio2010'],
          steps: [
            { max: 6.9, hr: 1.12, hrLow: 1.06, hrHigh: 1.18 },
            { max: 9.0, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: Infinity, hr: 1.30, hrLow: 1.22, hrHigh: 1.38 },
          ],
          note: 'Meta-analysis (VERIFIED vs abstract, PMID 20469800: 16 studies, 1,382,999 people, 112,566 deaths): short sleep RR 1.12 (1.06–1.18), long sleep RR 1.30 (1.22–1.38). U-shaped; long sleep may partly reflect illness (reverse causation).',
        },
        {
          output: 'cognition', type: 'steps', evidence: 'moderate', source: ['lowe2017'],
          steps: [
            { max: 6.4, points: -0.5 },
            { max: 9.4, points: 0 },
            { max: Infinity, points: -0.2 },
          ],
          note: 'Meta-analysis of 61 experimental studies (VERIFIED, PMID 28757454): sleep restriction significantly impairs executive function (g=−0.324), sustained attention (g=−0.409) and long-term memory (g=−0.192). Effects are medium in magnitude and increase with age.',
        },
        {
          output: 'happiness', type: 'steps', evidence: 'moderate', source: ['bacaro2023'],
          steps: [
            { max: 6.4, points: -0.4 },
            { max: 9.4, points: 0 },
            { max: Infinity, points: -0.1 },
          ],
          note: 'Longitudinal meta-analysis (VERIFIED, PMID 38125984, 42 studies in meta): good sleep (duration/quality) predicts higher subjective well-being over time (r=0.18) and higher psychological well-being (r=0.15). Bidirectional relationship with small-to-moderate effect sizes.',
        },
        {
          output: 'cvd', type: 'steps', evidence: 'high', source: ['cappuccio2011'],
          steps: [
            { max: 6.9, hr: 1.03, hrLow: 0.93, hrHigh: 1.15 },
            { max: 9.0, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: Infinity, hr: 1.41, hrLow: 1.19, hrHigh: 1.68 },
          ],
          note: 'Cappuccio 2011 EHJ meta (VERIFIED, 15 studies/474,684 people): total CVD — short sleep RR 1.03 (0.93–1.15, NOT significant), long sleep RR 1.41 (1.19–1.68). The short-sleep signal lives in the components, not the composite: CHD 1.48 (1.22–1.80), stroke 1.15 (1.00–1.31). The old 1.07/1.28 figures were not in the literature.',
        },
      ],
    },
    {
      id: 'stress',
      group: 'mind',
      label: 'Perceived stress',
      kind: 'slider',
      unit: '/ 10',
      min: 1, max: 10, step: 0.5, default: 3.5,
      hint: '1 = calm, 10 = overwhelmed, most days.',
      // russ2012 pooled 68k adults (GHQ-12): psychological distress predicts mortality dose-dependently
      // High distress ~62% higher all-cause mortality; CVD shows similar gradient
      // Effect persists after adjusting for somatic illness, behaviour and SES (finding)
      //
      // franks2021 meta + aggarwal2014 CHAP cohort (6k >65y): higher stress → MCI HR 1.19, dementia HR 1.44
      // Aggarwal: accelerated cognitive decline over 7 years, independent of depression and neuroticism
      //
      // Happiness: stress and unhappiness overlap by definition — our 1-10 slider calibrated to US avg ~3.5
      effects: [
        {
          output: 'mortality', type: 'steps', evidence: 'high', source: ['russ2012'],
          steps: [
            { max: 3, hr: 0.8333, hrLow: 0.8333, hrHigh: 0.8333 },
            { max: 6, hr: 1.0000, hrLow: 0.9417, hrHigh: 1.0583 },
            { max: 8, hr: 1.1917, hrLow: 1.0917, hrHigh: 1.3000 },
            { max: Infinity, hr: 1.6167, hrLow: 1.3833, hrHigh: 1.8833 },
          ],
          note: 'Pooled 68,222 adults, GHQ-12 (VERIFIED, PMID 22849956): distress scores 1–3 HR 1.20 (1.13–1.27), 4–6 HR 1.43 (1.31–1.56), 7–12 HR 1.94 (1.66–2.26), dose-response. Our 1–10 slider is mapped onto those tiers, normalized so the US-average ~3.5/10 = 1.0×: every step is the published HR ÷ 1.20 (e.g. 1.43/1.20 = 1.1917, 1.94/1.20 = 1.6167), disclosed construction.',
        },
        {
          output: 'cognition', type: 'steps', evidence: 'moderate', source: ['franks2021', 'aggarwal2014'],
          steps: [
            { max: 7, points: 0 },
            { max: Infinity, points: -0.4 },
          ],
          note: 'Meta-analysis (VERIFIED, PMID 34366334): higher perceived stress → increased risk of MCI (HR 1.19, 1.03–1.38) and all-cause dementia (HR 1.44, 1.07–1.95) in prospective studies. Aggarwal 2014 CHAP cohort (VERIFIED, PMID 24367123: 6,207 older adults, 6.8 y): higher stress → faster cognitive decline, independent of depression and neuroticism.',
        },
        {
          output: 'happiness', type: 'steps', evidence: 'low', source: ['russ2012'],
          steps: [
            { max: 3, points: 0.2 },
            { max: 7, points: 0.0 },
            { max: Infinity, points: -0.6 },
          ],
          note: 'Stress and unhappiness overlap by definition; calibrated so US avg ~3.5/10 = neutral. The effect here tracks the Russ 2012 dose–response: high distress (GHQ-12) predicted ~62% higher mortality, and the psychological cost of high stress is routinely reported in cohort studies.',
        },
        {
          output: 'cvd', type: 'steps', evidence: 'moderate', source: ['russ2012'],
          steps: [
            { max: 3, hr: 0.8475, hrLow: 0.8475, hrHigh: 0.8475 },
            { max: 6, hr: 1.0000, hrLow: 0.9153, hrHigh: 1.0847 },
            { max: 8, hr: 1.1695, hrLow: 1.0339, hrHigh: 1.3136 },
            { max: Infinity, hr: 1.5254, hrLow: 1.2712, hrHigh: 1.7797 },
          ],
          note: 'Russ 2012: psychological distress showed a similar dose–response for CVD mortality as for all-cause. Calibrated: US avg stress ~3.5/10 = 1.0×. High distress ~1.8× CVD death risk originally.',
        },
      ],
    },
    {
      id: 'social',
      group: 'mind',
      extra: true,
      label: 'Time with friends & family',
      kind: 'slider',
      unit: 'days/week',
      min: 0, max: 7, step: 1, default: 3,
      hint: 'Days with social contact.',
      // holtlunstad2010 meta (148 studies, 309k): stronger social relationships → 50% higher survival odds
      // OR 1.50 (1.42-1.59); strongest for complex social integration (OR 1.91)
      // Effect consistent across causes of death (incl. CVD) and after adjusting for activity, smoking, BMI
      // Effect size comparable to quitting smoking — social isolation is a major risk factor
      //
      // Happiness: strongest known correlate of wellbeing across cultures (same meta)
      // Reciprocal: happiness also predicts future social bond formation (Veenhoven 2023)
      // Finding: weak social ties carry mortality risk comparable to established behavioural risk factors
      effects: [
        {
          output: 'mortality', type: 'steps', evidence: 'moderate', source: ['holtlunstad2010'],
          steps: [
            { max: 1, hr: 1.35, hrLow: 1.25, hrHigh: 1.45 },
            { max: 3, hr: 1.15, hrLow: 1.08, hrHigh: 1.22 },
            { max: Infinity, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
          ],
          note: 'Meta-analysis (VERIFIED, PMID 20668659: 148 studies, 308,849 people): stronger social relationships → 50% higher survival odds (OR 1.50, 1.42–1.59). HRs here approximate that OR; strongest for complex social integration (OR 1.91, 1.63–2.23).',
        },
        {
          output: 'happiness', type: 'steps', evidence: 'low', source: ['holtlunstad2010'],
          steps: [
            { max: 1, points: -0.5 },
            { max: 3, points: -0.1 },
            { max: Infinity, points: 0 },
          ],
          note: 'Social connection is the strongest known correlate of happiness across cultures — the same Holt-Lunstad meta-analysis that found 50% survival benefit also reports robust links to wellbeing. Reciprocal: happiness also predicts future social bond formation (Veenhoven 2023 longitudinal review).',
        },
        {
          output: 'cvd', type: 'steps', evidence: 'moderate', source: ['holtlunstad2010'],
          steps: [
            { max: 1, hr: 1.30, hrLow: 1.18, hrHigh: 1.42 },
            { max: 3, hr: 1.12, hrLow: 1.05, hrHigh: 1.19 },
            { max: Infinity, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
          ],
          note: 'Same meta-analysis (VERIFIED): the survival effect was consistent across causes of death including CVD, and robust to adjustment. The HRs here mirror the all-cause pattern (disclosed approximation — the paper reports the overall OR 1.50, not cause-specific HRs).',
        },
      ],
    },
    {
      id: 'screenTime',
      group: 'mind',
      extra: true,
      label: 'Recreational screen time',
      kind: 'slider',
      unit: 'hours/day',
      min: 0, max: 12, step: 0.5, default: 5,
      hint: 'TV, social media, doomscrolling, gaming. Not work screens. US average ≈ 5 h/day (Nielsen: ~3–4 h TV incl. streaming; GWI/DataReportal Digital 2025: ~2 h social media; some second-screen overlap).',
      // hunt2018 RCT: limiting social media to ~30 min/day reduced loneliness and depression
      // allcott2020: 4-week Facebook deactivation improved subjective wellbeing (RCT)
      // zhai2015 meta: RR 1.22 depression for prolonged computer/internet use
      //
      // BUT effect sizes are tiny across populations: ≤0.4% of wellbeing variance (orben2019)
      // Non-users ≈ low users (twenge2018), reverse causality plausible — points deliberately small
      //
      // Mortality/CVD pathways run through sitting + low fitness — NOT double-counted here (overlap rule)
      // stamatakis2011: screen ≥4h/day → 1.5× all-cause, 2.3× CVD — captured by sitting/sedentary sliders
      // celis-morales2018 UK Biobank: screen-time-mortality association null in fit/strong people (HR 1.04 NS)
      // hale2015: screens near bedtime displace sleep — already counted in sleep slider if set honestly
      effects: [
        {
          output: 'happiness', type: 'steps', evidence: 'low', source: ['hunt2018', 'zhai2015', 'nielsenGauge2024', 'datareportal2025'],
          steps: [
            { max: 1, points: 0 },
            { max: 3, points: -0.05 },
            { max: 5, points: -0.15 },
            { max: 7, points: -0.30 },
            { max: Infinity, points: -0.45 },
          ],
          note: 'Direction is consistent across designs: an RCT limiting social media to ~30 min/day reduced loneliness and depression (Hunt 2018); 4-week Facebook deactivation improved subjective wellbeing (Allcott 2020); meta-analysis RR 1.22 depression for prolonged computer/internet use (Zhai 2015). But population associations are tiny (≤0.4% of wellbeing variance, Orben 2019), non-users ≈ low users (Twenge 2018), and reverse causality is plausible — points are deliberately small. The mortality/CVD pathways of screen time run through sitting and low fitness and are NOT double-counted here (see findings; Stamatakis 2011, Celis-Morales 2018). Input default = 5 h/day, the approximate US recreational-screen average: ~3–4 h/day TV incl. streaming (Nielsen, 2024–25; 3.5 h/day for 18–34, 6.5 h/day for 65+) plus ~2 h/day social media (GWI, via DataReportal Digital 2025), with some overlap from second-screening.',
        },
      ],
    },
    {
      id: 'meditation',
      group: 'extras',
      extra: true,
      label: 'Meditation',
      kind: 'slider',
      unit: 'min/week',
      min: 0, max: 300, step: 15, default: 0,
      //hint: 'Mindfulness-style practice.',
      // goyal2014 meta of 47 RCTs with active controls: mindfulness meditation reduces anxiety (ES 0.38)
      // and depression (ES 0.30) — small-to-moderate effects relative to no treatment
      // BUT no evidence it beats other active treatments (exercise, therapy) — specificity unclear
      // Effects on happiness/wellbeing are indirect: reducing negative affect rather than boosting positive
      effects: [
        {
          output: 'happiness', type: 'steps', evidence: 'moderate', source: ['goyal2014'],
          steps: [
            { max: 0, points: 0 },
            { max: 59, points: 0.1 },
            { max: Infinity, points: 0.3 },
          ],
          note: 'Meta-analysis of 47 RCTs / 3,515 people (VERIFIED, PMID 24395196): mindfulness meditation gave small-moderate reductions in anxiety (effect size 0.38, CI 0.12–0.64) and depression (0.30, 0.00–0.59) at 8 weeks — but no evidence it beats other active treatments (exercise, therapy).',
        },
      ],
    },

    {
      id: 'sleepRegularity',
      group: 'mind',
      extra: true,
      label: 'Sleep regularity',
      kind: 'slider',
      unit: '/ 10',
      min: 1, max: 10, step: 1, default: 6,
      hint: 'Same sleep/wake times day to day? 1 = all over the place, 10 = like clockwork.',
      // windred2024 UK Biobank accelerometer cohort (61k): top 4 SRI quintiles → 20-48% lower all-cause
      // Regularity predicted mortality BETTER than duration did — a striking finding
      // Cancer: 16-39% lower; CVD: similar gradient — likely through BP variability + autonomic regulation
      // Our 1-10 self-rating is an approximate mapping onto their accelerometer-derived quintiles
      //
      // Finding: irregular schedule predicted mortality more strongly than short sleep (same study)
      // Implication: a fixed wake time is a real lever, even before chasing more hours
      effects: [
        {
          output: 'mortality', type: 'steps', evidence: 'moderate', source: ['windred2024'],
          steps: [
            { max: 3, hr: 1.25, hrLow: 1.10, hrHigh: 1.45 },
            { max: 7, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: Infinity, hr: 0.78, hrLow: 0.60, hrHigh: 0.92 },
          ],
          note: 'UK Biobank accelerometer cohort (61k people): the top four Sleep Regularity Index quintiles had 20–48% lower all-cause mortality than the least-regular quintile — and regularity predicted mortality BETTER than duration did. Our 1–10 self-rating mapped onto their quintiles, approximate.',
        },
        {
          output: 'cancer', type: 'steps', evidence: 'moderate', source: ['windred2024'],
          steps: [
            { max: 3, hr: 1.15, hrLow: 1.05, hrHigh: 1.30 },
            { max: 7, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: Infinity, hr: 0.80, hrLow: 0.65, hrHigh: 0.95 },
          ],
          note: 'Same cohort, cancer mortality: 16–39% lower across the more-regular quintiles.',
        },
        {
          output: 'cvd', type: 'steps', evidence: 'moderate', source: ['windred2024'],
          steps: [
            { max: 3, hr: 1.20, hrLow: 1.08, hrHigh: 1.38 },
            { max: 7, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: Infinity, hr: 0.78, hrLow: 0.62, hrHigh: 0.90 },
          ],
          note: 'Same cohort: CVD mortality showed a similar gradient — regularity mattered as much for CVD as for all-cause, likely through blood-pressure variability and autonomic regulation.',
        },
      ],
    },
    {
      id: 'sauna',
      group: 'extras',
      extra: true,
      label: 'Sauna',
      kind: 'slider',
      unit: 'sessions/week',
      min: 0, max: 7, step: 1, default: 0,
      //hint: 'Finnish-style sauna.',
      // laukkanen2015 single Finnish cohort (2315 men, median f/up 20.7y), KIHD:
      // 4-7 vs 1 session/wk: all-cause HR 0.60 (0.46-0.80); fatal CVD HR 0.50 (0.33-0.77)
      // 2-3 vs 1: all-cause 0.76 (0.66-0.88); fatal CVD 0.73 (0.59-0.89)  [verified vs Table 2]
      // Reference is 1 session/wk (Finnish cultural baseline); 0 sessions is an assumption
      // Mechanism: improved endothelial function, lower BP, reduced sympathetic tone
      // Observational, one population (Finnish men), likely residual confounding — treat as speculative
      effects: [
        {
          output: 'mortality', type: 'steps', evidence: 'low', source: ['laukkanen2015'],
          steps: [
            { max: 1, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 3, hr: 0.76, hrLow: 0.66, hrHigh: 0.88 },
            { max: Infinity, hr: 0.60, hrLow: 0.46, hrHigh: 0.80 },
          ],
          note: 'Single Finnish cohort of 2315 middle-aged men (KIHD), median follow-up 20.7 y: multivariable-adjusted all-cause HR 0.76 (0.66–0.88) for 2–3 sessions/wk and 0.60 (0.46–0.80) for 4–7 vs 1 session/wk (P trend < .001; adjusted for age, BMI, BP, cholesterol, smoking, alcohol, PA, SES). Reference is 1 session/wk — the 0-session step (HR 1.00) is an assumption outside the study\'s range. Observational, one population, residual confounding — treat as speculative.',
        },
        {
          output: 'cvd', type: 'steps', evidence: 'low', source: ['laukkanen2015'],
          steps: [
            { max: 1, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 3, hr: 0.73, hrLow: 0.59, hrHigh: 0.89 },
            { max: Infinity, hr: 0.50, hrLow: 0.33, hrHigh: 0.77 },
          ],
          note: 'Same cohort — fatal CVD HR 0.73 (0.59–0.89) for 2–3 and 0.50 (0.33–0.77) for 4–7 sessions/wk vs 1; sudden cardiac death even stronger (0.37, 0.18–0.75). Session duration showed no all-cause association (P trend ≈ 0.9) — frequency is the lever. Effect attributed to improved endothelial function, lower BP and reduced sympathetic tone.',
        },
      ],
    },
    {
      id: 'creatine',
      group: 'diet',
      extra: true,
      label: 'Creatine (~5 g/day)',
      kind: 'toggle',
      default: false,
      hint: 'Creatine monohydrate supplementation.',
      // avgerinos2018 systematic review of RCTs: creatine improves short-term memory + reasoning
      // Effect clearer in vegetarians (lower baseline creatine), older adults, and stressed individuals
      // Other cognitive domains unclear — evidence strongest for tasks requiring speed of processing
      //
      // Finding: vegetarians/low-meat-eaters benefit most — meat eaters already get dietary creatine
      // No mortality/CVD/cancer signal — we only score cognition
      effects: [
        {
          output: 'cognition', type: 'toggle', points: 0.5,
          evidence: 'low', source: ['avgerinos2018'],
          note: 'Systematic review of RCTs (VERIFIED, PMID 29704637: only 6 studies, 281 individuals): creatine may improve short-term memory and reasoning; vegetarians responded better than meat-eaters on memory tasks; young healthy adults unchanged; other domains conflicting. Evidence is thin — low tier.',
        },
      ],
    },
    {
      id: 'omega3',
      group: 'diet',
      extra: true,
      label: 'Fish oil / omega-3 supplements',
      kind: 'toggle',
      default: false,
      //hint: 'A lot of people take these hoping for the benefits of eating fish. The best trial says they don\'t work.',
      // manson2019omega3 (VITAL RCT, n=26k, 5.3y): omega-3 supplements are essentially NULL
      // All-cause mortality: HR 1.02 (0.90-1.15) — slightly MORE deaths in the omega-3 group
      // CVD events: HR 0.92 (0.80-1.06) — CI includes 1.0; MI signal (HR 0.72) failed multiplicity correction
      // Cancer: HR 1.03 (0.93-1.13) — null. Cognition: no credible evidence from well-controlled trials
      // Happiness: no evidence in healthy adults
      //
      // The fish → health pathway is about eating fish (replacing meat, whole-food matrix), not isolated omega-3
      // Observational benefits of omega-3 rich diets do not replicate in supplement RCTs — important negative
      effects: [
        {
          output: 'mortality', type: 'toggle', evidence: 'high', source: ['manson2019omega3'],
          hr: 1.02, hrLow: 0.90, hrHigh: 1.15,
          note: 'VITAL RCT (n=26k, 5.3 y, VERIFIED vs abstract): all-cause mortality HR 1.02 (0.90–1.15) — 978 deaths overall, slightly MORE deaths in the omega-3 group. Not statistically significant and effectively null.',
        },
        {
          output: 'cvd', type: 'toggle', evidence: 'high', source: ['manson2019omega3'],
          hr: 0.92, hrLow: 0.80, hrHigh: 1.06,
          note: 'VITAL RCT (VERIFIED vs abstract): major cardiovascular events HR 0.92 (0.80–1.06), P=0.24 — null (CI includes 1.0). A secondary signal for total MI (HR 0.72, 0.59–0.90) did not survive correction for multiplicity. Meta-analyses of all RCTs confirm no significant benefit for primary prevention.',
        },
        {
          output: 'cancer', type: 'toggle', evidence: 'high', source: ['manson2019omega3'],
          hr: 1.03, hrLow: 0.93, hrHigh: 1.13,
          note: 'VITAL RCT (VERIFIED vs abstract): invasive cancer incidence HR 1.03 (0.93–1.13), P=0.56 — null. Cancer mortality HR 0.97 (0.79–1.20) — also null. The observational suggestion that omega-3 prevents cancer does not hold up in a trial.',
        },
        {
          output: 'cognition', type: 'toggle', points: 0,
          evidence: 'moderate', source: ['manson2019omega3'],
          note: 'No credible RCT evidence that omega-3 supplements improve cognition in healthy adults. VITAL did not test cognition directly, but smaller RCTs show null or trivial effects in the general population.',
        },
        {
          output: 'happiness', type: 'toggle', points: 0,
          evidence: 'moderate', source: ['manson2019omega3'],
          note: 'No evidence that omega-3 supplements measurably affect mood or wellbeing in generally healthy adults. The fish → happiness pathway runs through eating fish, not taking pills.',
        },
      ],
    },
    {
      id: 'vitaminD',
      group: 'diet',
      extra: true,
      label: 'Vitamin D status',
      kind: 'segmented',
      default: 'sufficient',
      options: [
        { value: 'deficient', label: 'Deficient' },
        { value: 'sufficient', label: 'Sufficient' },
        { value: 'supplement', label: 'I supplement' },
      ],
//      hint: 'Best guess of your 25(OH)D level if you haven\'t measured it.',
      // schottker2014 pooled cohorts: bottom vs top quintile → RR 1.57 for all-cause mortality
      // BUT VITAL RCT (26k, 2000 IU/day) found supplements did NOT reduce cancer, CVD or mortality (HR 0.99)
      // Deficiency likely marks poor health (sun exposure, outdoor activity, diet quality) rather than causing it
      //
      // zhang2024vitd meta (23 studies, 525k): deficiency → RR 1.42 dementia, 1.57 Alzheimer's
      // Optimal 25(OH)D ~77.5-100 nmol/L; supplementation RCTs show mixed/null results
      //
      // Cancer (manson2019 VITAL): cancer death HR 0.83 (0.67-1.02) — suggestive but not significant
      // Cancer incidence null (0.96, 0.88-1.06). CVD: observational ~41% higher risk deficient
      // vs sufficient (schottker2014: 1.41, 1.18-1.68), but supplements null (0.97).
      // The observational vs RCT gap means causality is unresolved.
      effects: [
        {
          output: 'mortality', type: 'byOption', evidence: 'moderate', source: ['schottker2014'],
          byOption: {
            deficient: { hr: 1.57, hrLow: 1.36, hrHigh: 1.81 },
            sufficient: { hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            supplement: { hr: 0.99, hrLow: 0.87, hrHigh: 1.12 },
          },
          note: 'Deficiency (bottom vs top quintile) → RR 1.57 (1.36–1.81) in pooled cohorts (Schöttker 2014 IPD meta, 26,018 people, VERIFIED) — BUT the VITAL RCT (26k people) found supplements did NOT reduce cancer, CVD or mortality (HR 0.99). Deficiency likely marks poor health; whether correcting it helps is unresolved.',
        },
        {
          output: 'cognition', type: 'byOption', evidence: 'moderate', source: ['zhang2024vitd'],
          byOption: { deficient: { points: -0.2 }, sufficient: { points: 0 }, supplement: { points: 0 } },
          note: 'Dose-response meta-analysis of 23 prospective studies (525k people): vitamin D deficiency → RR 1.42 for dementia, 1.57 for Alzheimer\'s, 1.34 for cognitive impairment. Optimal 25(OH)D ~77.5–100 nmol/L. Supplementation RCTs show mixed/null results — deficiency likely partly marks poor health.',
        },
        {
          output: 'cancer', type: 'byOption', evidence: 'moderate', source: ['manson2019'],
          byOption: {
            deficient: { hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            sufficient: { hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            supplement: { hr: 0.83, hrLow: 0.67, hrHigh: 1.02 },
          },
          note: 'VITAL RCT, cancer DEATH with supplementation: HR 0.83 (0.67–1.02) — suggestive but not significant; cancer incidence was null (0.96, 0.88–1.06). (Both VERIFIED vs the NEJM abstract.)',
        },
        {
          output: 'cvd', type: 'byOption', evidence: 'moderate', source: ['schottker2014'],
          byOption: {
            deficient: { hr: 1.41, hrLow: 1.18, hrHigh: 1.68 },
            sufficient: { hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            supplement: { hr: 0.97, hrLow: 0.85, hrHigh: 1.12 },
          },
          note: 'CVD mortality bottom-vs-top quintile: RR 1.41 (1.18–1.68) in people without prior CVD (Schöttker 2014, VERIFIED vs full text; 1.65 [1.22–2.22] in those with prior CVD) — but supplements were null in VITAL (HR 0.97, 0.85–1.12, for major CVD events). As with all-cause, deficiency is likely a health marker, not a causal risk factor.',
        },
      ],
    },
    {
      id: 'ironDeficiency',
      group: 'diet',
      extra: true,
      label: 'Untreated iron deficiency',
      kind: 'toggle',
      default: false,
      hint: 'Common in menstruating women, vegetarians, endurance athletes.',
      // houston2018 RCT meta: correcting non-anaemic iron deficiency REDUCES fatigue (SMD −0.38)
      // No effect on measured physical capacity — the benefit is subjective energy, not performance
      //
      // falkingham2010 RCT meta (14 studies): iron supplementation improved attention + concentration
      // irrespective of baseline iron status (SMD 0.59, 0.29-0.90)
      // In anaemic participants, IQ improved 2.5 points. No effect on memory or psychomotor skills.
      // Evidence clearest in children and women; understudied in men — generalisability unknown
      effects: [
        {
          output: 'happiness', type: 'toggle', points: -0.4,
          evidence: 'moderate', source: ['houston2018'],
          note: 'RCT meta-analysis (VERIFIED, PMID 29626044, 18 trials/1,170 people): correcting non-anaemic iron deficiency REDUCES fatigue (SMD −0.38, 0.52–0.23) — so leaving it untreated costs you that. No effect on measured physical capacity (VO2max SMD 0.11, NS).',
        },
        {
          output: 'cognition', type: 'toggle', points: -0.2,
          evidence: 'low', source: ['falkingham2010'],
          note: 'RCT meta-analysis (VERIFIED, PMID 20100340, 14 RCTs): iron supplementation improved attention and concentration irrespective of baseline iron status (SMD 0.59, CI 0.29–0.90, no heterogeneity). In anaemic participants, IQ improved 2.5 points (1.24–3.76). No effect on memory or psychomotor skills. All trials in children 6+/adolescents/women — no RCTs in men or older people, so generalisability is unknown.',
        },
      ],
    },
    {
      id: 'cognitiveTraining',
      group: 'extras',
      extra: true,
      label: 'Brain training (puzzles, sudoku)',
      kind: 'slider',
      unit: 'sessions/week',
      min: 0, max: 7, step: 1, default: 0,
      hint: 'Sudoku, crosswords, brain-training apps.',
      // edwards2017 ACTIVE trial: speed-of-processing training cut 10-year dementia risk ~29%
      // but gains are mostly DOMAIN-SPECIFIC — you get better at the trained task
      // Broad "brain boost" from crosswords/sudoku is unproven (near transfer only)
      // Effect size is small and uncertain — hence low evidence rating
      effects: [
        {
          output: 'cognition', type: 'steps', evidence: 'low', source: ['edwards2017'],
          steps: [
            { max: 0, points: 0 },
            { max: Infinity, points: 0.15 },
          ],
          note: 'ACTIVE trial (VERIFIED, PMID 29201994, N=2,802, 10 y): speed-of-processing training cut dementia risk 29% (HR 0.71, 0.50–0.998) — but memory/reasoning training did NOT (HR 0.79, NS), so gains are task-specific. Broad "brain boost" from puzzles is unproven.',
        },
      ],
    },

    // ------------------------------------------------------------ Environment
    {
      id: 'pm25',
      group: 'environment',
      extra: true,
      label: 'Air pollution (PM2.5 where you live)',
      kind: 'slider',
      unit: 'µg/m³',
      min: 2, max: 30, step: 1, default: 8,
      hint: 'Look it up by zip code/city. US mean ≈ 8, EPA standard 12, WHO guideline 5.',
      // di2017 Medicare open cohort (61M people, 460M person-years): +7.3% all-cause mortality
      // per +10 µg/m³ PM2.5 — and +13.6% even below the 12 µg/m³ US standard (no safe floor)
      // CVD: +10% per +10 µg/m³ — primary mechanism through inflammation, oxidative stress,
      // plaque progression. Evidence is exceptionally robust (largest-ever air pollution cohort)
      //
      // Finding: above 12 µg/m³ exceeds US standard; below 5 reaches WHO guideline
      // Levers: HEPA purifiers, masks, avoiding high-traffic routes — modest but real mitigation
      effects: [
        {
          output: 'mortality', type: 'perUnit', per: 10, ref: 8, minDose: 3, capAt: 30,
          hr: 1.073, hrLow: 1.071, hrHigh: 1.075,
          evidence: 'high', source: ['di2017'],
          note: 'Medicare open cohort (VERIFIED, PMID 28657878: 60.9M people, 460M person-years): +7.3% (7.1–7.5) all-cause mortality per +10 µg/m³ PM2.5 — and +13.6% even below the 12 µg/m³ US standard. Anchored at the US mean (8). Levers: location, HEPA purifiers, masks, avoiding high-traffic routes.',
        },
        {
          output: 'cvd', type: 'perUnit', per: 10, ref: 8, minDose: 3, capAt: 30,
          hr: 1.13, hrLow: 1.10, hrHigh: 1.15,
          evidence: 'high', source: ['di2017', 'orellano2024'],
          note: 'Circulatory-disease mortality: RR 1.13 (1.10–1.15) per +10 µg/m³ PM2.5 — the WHO 2021 guidelines review update, pooled 42 cohort studies (VERIFIED, PMID 39399882). CVD is the primary mechanism for PM2.5 mortality effects through inflammation, oxidative stress and plaque progression. (Di 2017 itself reports all-cause only.)',
        },
      ],
    },
    {
      id: 'sunExposure',
      group: 'environment',
      extra: true,
      label: 'Time outdoors in sun',
      kind: 'slider',
      unit: 'hours/day',
      min: 0, max: 10, step: 0.5, default: 1.5,
      hint: 'Time spent outside between ~9 am and 5 pm — walking, gardening, sitting in the park. This is about both daylight health effects (circadian rhythm, vitamin D) AND UV effects (skin cancer risk). US average ≈ 1–2 h/day.',
      // adventist2025 (AHS-2, 83,205 people, VERIFIED PMID 40444275): time outdoors
      // 9am–5pm (warmer months) vs 0.5 h ref, reverse-J: all-cause 2h 0.90 (0.86–0.93),
      // 3h 0.88 (0.84–0.93), 5h 0.90 (0.85–0.95); CVD 0.89/0.87/0.86; cancer ELEVATED
      // 1.02 (NS) / 1.08 (NS) / 1.15 (sig at 5h). >5 h not published — steps hold flat.
      // 0 h/day band is interpolated (AHS-2's lowest category is 0.5 h; lindqvist2014
      // avoiders ~2× vs highest — our bands are conservative; disclosed in notes).
      //
      // stevenson2024 UK Biobank (VERIFIED PMID 39094281, peer-reviewed): higher UV →
      // lower all-cause + CVD + cancer mortality — QUALITATIVE (no per-category HRs in
      // the abstract; not open access).
      //
      // sunbeem2026 (medRxiv PREPRINT, not peer-reviewed, 419,007 UKB, VERIFIED numbers):
      // all-cause medium 0.89 (0.87–0.91) / high 0.84 (0.82–0.87) vs low; CVD 0.82/0.77;
      // non-skin cancer 0.92/0.89; skin cancer mortality flat. Matches UK Stevenson;
      // CONFLICTS with US AHS-2 on cancer — latitude-dependent direction.
      //
      // lindqvist2014 Swedish women (VERIFIED PMID 24697969): sun avoiders ~2× all-cause
      // mortality vs highest-exposure group (composite habits, not hours) — backs the
      // low band; avoiders' excess was largely CVD + non-cancer deaths.
      //
      // maartense2024 meta (VERIFIED PMID 39664799): 30 of 74 studies pooled,
      // light → wellbeing d=0.46 (0.29–0.62), sensitivity 0.53 (0.35–0.72), I² 96%.
      // (The old "bright-light d=0.48 for depression" claim is NOT in this paper —
      // dropped per the golden rule.)
      //
      // Cancer trade-off: US cohort shows skin-cancer-driven elevation at high exposure;
      // UK evidence (low-sun country) inverse. Steps use the verified US numbers.
      effects: [
        {
          output: 'mortality', type: 'steps', evidence: 'moderate', source: ['adventist2025', 'stevenson2024', 'sunbeem2026'],
          steps: [
            { max: 0.25, hr: 1.15, hrLow: 1.06, hrHigh: 1.25 },
            { max: 1.0,  hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 3.0,  hr: 0.88, hrLow: 0.84, hrHigh: 0.93 },
            { max: 5.0,  hr: 0.90, hrLow: 0.85, hrHigh: 0.95 },
            { max: Infinity, hr: 0.90, hrLow: 0.85, hrHigh: 0.95 },
          ],
          note: 'AHS-2 (VERIFIED, PMID 40444275; 83,205 people, 11,515 deaths, warmer months vs 0.5 h ref): all-cause 2 h 0.90 (0.86–0.93), 3 h 0.88 (0.84–0.93), 5 h 0.90 (0.85–0.95) — reverse-J, benefit persists without attenuation. 0 h/day band (1.15) interpolated: AHS-2\'s lowest category is 0.5 h; Lindqvist 2014 (PMID 24697969) sun-avoiders had ~2× mortality vs the highest group, so our band is deliberately conservative. >5 h held flat at the 5 h estimate (no published category). Stevenson 2024 (UK Biobank, PMID 39094281) confirms the direction qualitatively. Sun-BEEM preprint (medRxiv 2026, 419k UK Biobank, NOT peer-reviewed): 0.89/0.84 vs low.',
        },
        {
          output: 'cvd', type: 'steps', evidence: 'moderate', source: ['adventist2025', 'stevenson2024', 'sunbeem2026'],
          steps: [
            { max: 0.25, hr: 1.18, hrLow: 1.06, hrHigh: 1.32 },
            { max: 1.0,  hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 3.0,  hr: 0.87, hrLow: 0.79, hrHigh: 0.94 },
            { max: 5.0,  hr: 0.86, hrLow: 0.79, hrHigh: 0.94 },
            { max: Infinity, hr: 0.86, hrLow: 0.79, hrHigh: 0.94 },
          ],
          note: 'AHS-2 (VERIFIED, PMID 40444275): CVD mortality 2 h 0.89 (0.83–0.95), 3 h 0.87 (0.79–0.94), 5 h 0.86 (0.79–0.94) vs 0.5 h ref. Stevenson 2024 (PMID 39094281): the inverse UV–CVD association is stronger than all-cause — nitric-oxide-mediated blood pressure reduction (qualitative). Sun-BEEM preprint (medRxiv 2026, not peer-reviewed): CVD 0.82/0.77 vs low. 0 h/day band interpolated (same disclosure as mortality).',
        },
        {
          output: 'cancer', type: 'steps', evidence: 'low', source: ['adventist2025', 'stevenson2024', 'sunbeem2026'],
          steps: [
            { max: 0.25, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 1.0,  hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 3.0,  hr: 1.08, hrLow: 0.97, hrHigh: 1.20 },
            { max: 5.0,  hr: 1.15, hrLow: 1.02, hrHigh: 1.29 },
            { max: Infinity, hr: 1.15, hrLow: 1.02, hrHigh: 1.29 },
          ],
          note: 'AHS-2 (VERIFIED, PMID 40444275 — the only peer-reviewed quantitative cohort): cancer MORTALITY rises with exposure — 2 h 1.02 (0.93–1.13, NS), 3 h 1.08 (0.97–1.20, NS), 5 h 1.15 (1.02–1.29, significant), possibly skin-cancer-incidence-driven. UK evidence finds the opposite in a low-sun country: Stevenson 2024 (PMID 39094281) qualitative inverse; Sun-BEEM preprint (medRxiv 2026, not peer-reviewed) non-skin cancer 0.92/0.89 vs low, skin-cancer mortality flat. Direction is latitude-dependent — steps use the verified US numbers; evidence low.',
        },
        {
          output: 'happiness', type: 'steps', evidence: 'moderate', source: ['maartense2024'],
          steps: [
            { max: 0.25, points: -0.3 },
            { max: 1.0,  points: 0 },
            { max: 3.0,  points: 0.3 },
            { max: 5.0,  points: 0.3 },
            { max: Infinity, points: 0.3 },
          ],
          note: 'Meta-analysis (VERIFIED, PMID 39664799; 30 studies of 74 from a systematic review): light exposure has a small-to-moderate positive effect on wellbeing — pooled d=0.46 (0.29–0.62), sensitivity 0.53 (0.35–0.72); high heterogeneity (I² 96%). Sunlight stimulates serotonin synthesis and beta-endorphin release.',
        },
      ],
    },
    {
      id: 'vo2maxOn',
      group: 'movement',
      extra: true,
      label: 'I know my VO2 max',
      kind: 'toggle',
      default: false,
      hint: 'From a lab test or a good wearable estimate.',
      effects: [],
    },
    {
      id: 'vo2max',
      group: 'movement',
      extra: true,
      label: 'VO2 max',
      kind: 'slider',
      unit: 'ml/kg/min',
      min: 20, max: 60, step: 1, default: 33,
      gatedBy: 'vo2maxOn',
      //hint: 'When enabled, this REPLACES the cardio estimate — measured fitness predicts mortality better than reported activity.',
      // kodama2009 meta (33 studies): RR 0.87 per 1-MET (3.5 ml/kg/min) higher fitness — calibrated to
      // US average ~33 ml/kg/min. CVD: RR 0.85 per 1-MET — slightly stronger than all-cause
      // cardiorespiratory fitness is a direct measure of cardiovascular health
      //
      // mandsager2018 corroboration: elite vs low fitness HR 0.20 — ~80% lower adjusted mortality
      // No observed upper limit of benefit (finding). Fitness is one of the strongest modifiable
      // mortality markers. When enabled, REPLACES the cardio estimate (supersession rule) —
      // measured fitness is the better predictor, never stack both.
      effects: [
        {
          output: 'mortality', type: 'perUnit', per: 3.5, ref: 33, capAt: 56,
          hr: 0.87, hrLow: 0.84, hrHigh: 0.90,
          evidence: 'high', source: ['kodama2009', 'mandsager2018'],
          note: 'Meta-analysis (33 studies; 102,980 participants, 6,910 deaths): RR 0.87 (0.84–0.90) per 1-MET (3.5 ml/kg/min) higher fitness, VERIFIED exact vs the paper (PMID 19454641, JAMA 301:2024–35). 1 MET ≈ 1 km/h higher running/jogging speed. Calibrated to US average ~33 ml/kg/min. Low vs high CRF contrast: RR 1.70 (1.51–1.92). Corroborated by Mandsager 2018: elite vs low fitness HR 0.20.',
        },
        {
          output: 'cvd', type: 'perUnit', per: 3.5, ref: 33, capAt: 56,
          hr: 0.85, hrLow: 0.82, hrHigh: 0.88,
          evidence: 'high', source: ['kodama2009'],
          note: 'Same meta-analysis, CHD/CVD events (84,323 participants, 4,485 cases): RR 0.85 (0.82–0.88) per 1-MET, VERIFIED exact vs the paper (PMID 19454641). Calibrated to US average ~33 ml/kg/min. The CVD effect is slightly stronger than all-cause, consistent with cardiorespiratory fitness being a direct measure of cardiovascular health. Low vs high CRF contrast: RR 1.56 (1.39–1.75).',
        },
      ],
    },
    {
      id: 'bodyFatOn',
      group: 'movement',
      extra: true,
      label: 'I know my body fat %',
      kind: 'toggle',
      default: false,
      hint: 'From DEXA, impedance scale, or calipers.',
      effects: [],
    },
    {
      id: 'bodyFat',
      group: 'movement',
      extra: true,
      label: 'Body fat',
      kind: 'slider',
      unit: '%',
      min: 5, max: 55, step: 1, default: 35,
      gatedBy: 'bodyFatOn',
      //hint: 'When enabled, this REPLACES the BMI estimate.',
      // jayedi2022 dose-response meta-analysis (35 cohorts, 923,295 people, 68,389 deaths):
      // ALL-CAUSE mortality only — the paper reports no CVD analysis (verified against abstract/full
      // text access; CVD body-fat curves in our older data were removed as unsourced).
      // Published facts: J-shaped, nadir ≈25% body fat, P nonlinearity <0.001; in general adult
      // populations HR 1.11 (1.02–1.20) per +10% body fat (11 studies).
      // Our steps are hand-fitted to that curve: nadir band 19–28%, right arm ≈ +11% per +10%
      // (matches the published increment), left arm modest elevation; anchored US avg ~35% = 1.0×.
      // Sex-specific ideal ranges differ; our steps are unisex approximations.
      // When enabled, REPLACES the BMI estimate — measured body fat % is the better adiposity
      // signal (supersession rule). CVD card shows body fat as no-data (no honest source found).
      effects: [
        {
          output: 'mortality', type: 'steps', evidence: 'moderate', source: ['jayedi2022'],
          steps: [
            { max: 18, hr: 1.0360, hrLow: 0.9459, hrHigh: 1.1712 },
            { max: 28, hr: 0.9009, hrLow: 0.9009, hrHigh: 0.9009 },
            { max: 38, hr: 1.0000, hrLow: 0.9189, hrHigh: 1.0811 },
            { max: Infinity, hr: 1.1081, hrLow: 0.9369, hrHigh: 1.2973 },
          ],
          note: 'Dose-response meta-analysis (35 cohorts, 923,295 people; 68,389 deaths): J-shaped, lowest risk ≈25% body fat, P nonlinearity <0.001; HR 1.11 (1.02–1.20) per +10% body fat in general adult populations. Our steps are hand-fitted to that curve and anchored so US average ~35% = 1.0×. Sex-specific ideal ranges differ; steps are unisex approximations. All-cause only — this paper reports no CVD effect, so the CVD card lists body fat as no-data.',
        },
      ],
    },
    {
      id: 'gripOn',
      group: 'movement',
      extra: true,
      label: 'I know my grip strength',
      kind: 'toggle',
      default: false,
      hint: 'From a hand dynamometer (cheap ones work fine).',
      effects: [],
    },
    {
      id: 'grip',
      group: 'movement',
      extra: true,
      label: 'Grip strength',
      kind: 'slider',
      unit: 'kg',
      min: 10, max: 70, step: 1, default: 30,
      gatedBy: 'gripOn',
      hint: 'Best of a few squeezes, dominant hand. Rough averages: ~40 kg men, ~25 kg women.',
      // leong2015 PURE study (17 countries, 140k): HR 1.16 per 5kg LOWER grip for all-cause mortality
      // CVD: HR 1.17 per 5kg LOWER — even stronger than all-cause
      // Grip predicted mortality more strongly than systolic blood pressure — remarkable for a simple test
      // However, it's a MARKER of overall strength, not necessarily a modifiable lever (overlaps
      // strength-training input). Whether improving grip itself helps is untested.
      // Finding: grip predicted death but NOT falls or fractures in PURE — a mortality marker not injury marker
      effects: [
        {
          output: 'mortality', type: 'perUnit', per: 5, ref: 30, minDose: 15, capAt: 60,
          hr: 0.8621, hrLow: 0.8333, hrHigh: 0.8850,
          evidence: 'moderate', source: ['leong2015'],
          note: 'PURE study (17 countries, 140k people): HR 1.16 (1.13–1.20) per 5 kg LOWER grip — expressed as 0.862 per +5 kg, calibrated to US average ~30 kg. Grip predicted mortality more strongly than systolic blood pressure. Probably a marker of overall strength (overlaps the strength-training input); whether improving grip itself helps is untested.',
        },
        {
          output: 'cvd', type: 'perUnit', per: 5, ref: 30, minDose: 15, capAt: 60,
          hr: 0.855, hrLow: 0.807, hrHigh: 0.901,
          evidence: 'moderate', source: ['leong2015'],
          note: 'PURE study, CVD mortality: HR 1.17 (1.11–1.24) per 5 kg LOWER grip — expressed as 0.855 per +5 kg, calibrated to US average ~30 kg. Grip predicted CVD mortality even more strongly than all-cause in the PURE cohort. Marker, not necessarily modifiable lever.',
        },
      ],
    },
    {
      id: 'rhrOn',
      group: 'movement',
      extra: true,
      label: 'I know my resting heart rate',
      kind: 'toggle',
      default: false,
      hint: 'After sitting quietly for 5 minutes. Most wearables report it.',
      effects: [],
    },
    {
      id: 'rhr',
      group: 'movement',
      extra: true,
      label: 'Resting heart rate',
      kind: 'slider',
      unit: 'bpm',
      min: 40, max: 110, step: 1, default: 72,
      gatedBy: 'rhrOn',
      hint: 'Typical adult average ≈ 60–80 bpm.',
      // aune2017rhr dose-response meta (87 studies): +17% all-cause mortality per +10 bpm
      // CVD: +15% per +10 bpm — best-established association, reflects direct HR-myocardial O2 demand
      // Cancer: +14% per +10 bpm — mechanism less clear, may reflect sympathetic activation
      // Calibrated: US average 72 bpm = 1.0×
      // RHR partly proxies cardiorespiratory fitness — overlaps cardio/VO2max inputs (overlap noted)
      // but the association survived activity adjustment in most studies
      effects: [
        {
          output: 'mortality', type: 'perUnit', per: 10, ref: 72, minDose: 45, capAt: 100,
          hr: 1.17, hrLow: 1.14, hrHigh: 1.19,
          evidence: 'moderate', source: ['aune2017rhr'],
          note: 'Dose-response meta-analysis (87 studies): +17% (1.14–1.19) all-cause mortality per +10 bpm. Calibrated: US average RHR 72 bpm = 1.0×. RHR is partly a proxy for cardiorespiratory fitness — it overlaps the cardio/VO2max inputs, though the association survived activity adjustment in most studies.',
        },
        {
          output: 'cancer', type: 'perUnit', per: 10, ref: 72, minDose: 45, capAt: 100,
          hr: 1.14, hrLow: 1.06, hrHigh: 1.23,
          evidence: 'moderate', source: ['aune2017rhr'],
          note: 'Same meta-analysis, total cancer: +14% (1.06–1.23) per +10 bpm. Calibrated: US average RHR 72 bpm = 1.0×.',
        },
        {
          output: 'cvd', type: 'perUnit', per: 10, ref: 72, minDose: 45, capAt: 100,
          hr: 1.15, hrLow: 1.11, hrHigh: 1.18,
          evidence: 'moderate', source: ['aune2017rhr'],
          note: 'Same meta-analysis, CVD-specific: +15% (11–18%) per +10 bpm — calibrated to US average RHR 72 bpm = 1.0×. The RHR–CVD association is the best-established of all, reflecting the direct relationship between heart rate and myocardial oxygen demand.',
        },
      ],
    },
  ],

  // Derived input: BMI computed from heightCm/weightKg, then this effect applies.
  // diangelantonio2016 individual-participant meta (239 studies, never-smokers): J-shaped mortality curve
  // Nadir BMI 20-25 for all-cause; CVD follows same J but with broader nadir (22-27) and steeper above 30
  // CVD above 30 driven by hypertension, dyslipidaemia and diabetes — direct adiposity effects
  // BMI ignores muscle mass and fat distribution — a crude proxy. When bodyFatOn is enabled,
  // measured body fat % replaces BMI (supersession rule: body fat is the better adiposity signal)
  bmi: {
    label: 'BMI (derived)',
    evidence: 'high',
    source: ['diangelantonio2016'],
    supersededBy: 'bodyFatOn', // measured body fat % is the better adiposity signal
    steps: [
      { max: 18.5, hr: 1.51, hrLow: 1.43, hrHigh: 1.59 },
      { max: 20.0, hr: 1.13, hrLow: 1.09, hrHigh: 1.17 },
      { max: 25.0, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
      { max: 27.5, hr: 1.07, hrLow: 1.07, hrHigh: 1.08 },
      { max: 30.0, hr: 1.20, hrLow: 1.18, hrHigh: 1.22 },
      { max: 35.0, hr: 1.45, hrLow: 1.41, hrHigh: 1.48 },
      { max: 40.0, hr: 1.94, hrLow: 1.87, hrHigh: 2.01 },
      { max: Infinity, hr: 2.76, hrLow: 2.60, hrHigh: 2.92 },
    ],
    note: 'Individual-participant meta-analysis of 239 studies (never-smokers): all-cause mortality minimal at BMI 20–25. BMI ignores muscle mass and fat distribution — a crude proxy.',
    cvd: {
      evidence: 'high',
      source: ['diangelantonio2016'],
      steps: [
        { max: 18.5, hr: 1.35, hrLow: 1.22, hrHigh: 1.48 },
        { max: 20.0, hr: 1.10, hrLow: 1.05, hrHigh: 1.15 },
        { max: 25.0, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
        { max: 27.5, hr: 1.10, hrLow: 1.08, hrHigh: 1.12 },
        { max: 30.0, hr: 1.25, hrLow: 1.20, hrHigh: 1.30 },
        { max: 35.0, hr: 1.55, hrLow: 1.45, hrHigh: 1.65 },
        { max: 40.0, hr: 2.10, hrLow: 1.95, hrHigh: 2.25 },
        { max: Infinity, hr: 2.85, hrLow: 2.60, hrHigh: 3.10 },
      ],
      note: 'Di Angelantonio 2016: CVD mortality follows a J-shaped curve. The nadir is broader (BMI 22–27) and the uptick above 30 is steeper than for all-cause — reflecting the direct effect of adiposity on hypertension, dyslipidaemia and diabetes.',
    },
  },

  /*
   * Findings: sourced facts that don't fit on a slider (disease-specific
   * outcomes, honest nulls, caveats). Shown only when `when(values)` is true,
   * so the list reacts to the current inputs. dir: good | bad | neutral.
   *
   * Only add extra findings that aren't already apparent in the outputs.
   */
  findings: [
    {
      when: (v) => v.smoking === 'current' && v.vaping === 'current', dir: 'bad', input: 'Vaping', source: ['xie2024'],
      text: 'Dual use of cigarettes + e-cigarettes gives ~6% increased mortality. Switching from smoking to e-cigarettes only reduced mortality by ~35% vs continued smoking.',
    },
    {
      when: (v) => v.vaping === 'current', dir: 'neutral', input: 'Vaping', source: ['kundu2025'],
      text: 'Cancer: no significant incident or prevalent cancer found in never-smoker vapers across a 39-study systematic review; DNA-damage biomarker evidence is mostly from acute exposure. The cancer card lists vaping as no-data for now.',
    },
    {
      when: (v) => v.smoking === 'current', dir: 'bad', input: 'Smoking', source: ['thun2013', 'jha2013'],
      text: 'Current smokers have ~25× the lung-cancer death rate of never-smokers (and ~23× the COPD death rate). Significant increase in risk of COPD and vascular disease, also icnreasing mortality.',
    },
    {
      when: (v) => v.strength < 1, dir: 'bad', input: 'Strength', source: ['sherrington2019'],
      text: 'No strength/balance training → up to 25% more falls later in life.',
    },
    {
      when: (v) => v.strength < 1 && v.sex === 'female', dir: 'bad', input: 'Strength', source: ['howe2011', 'blochibenfeldt2025'],
      text: 'Increased chance of osteoporosis. Resistance training preserves bone density, lack of training rapidly accelerates bone loss, especially in postmenopausal women.',
    },
    {
      when: (v) => v.strength >= 1, dir: 'good', input: 'Strength', source: ['momma2022'],
      text: 'Associated with lower type-2 diabetes risk',
    },
    {
      when: (v) => v.cardio >= 150 && v.sex === 'female', dir: 'good', input: 'Cardio', source: ['rong2016'],
      text: 'Leisure-time physical activity was associated with ~7% lower hip-fracture risk in older women',
    },
    {
      when: (v) => v.gripOn, dir: 'neutral', input: 'Grip', source: ['leong2015'],
      text: 'Grip strength is a surprisingly accurate indicator of health, but likely a proxy for overall strength.',
    },
    {
      when: (v) => v.alcohol > 14, dir: 'bad', input: 'Alcohol', source: ['wood2018'],
      text: 'Higher risk of stroke (~14% per 100 g/week), heart failure and fatal hypertensive disease',
    },
    {
      when: (v) => v.alcohol > 0 && v.alcohol <= 14, dir: 'neutral', input: 'Alcohol', source: ['wood2018'],
      text: 'light-to-moderate intake was associated with slightly lower myocardial infarction risk (~6% per 100 g/week), but no net all-cause benefit above ~7 drinks/week',
    },
    {
      when: (v) => v.coffee >= 5 && v.sex === 'female', dir: 'bad', input: 'Coffee', source: ['poole2017'],
      text: 'High intake was associated with increased fracture risk in women',
    },
    {
      when: (v) => v.magnesium >= 400, dir: 'good', input: 'Magnesium', source: ['fang2016'],
      text: 'Higher dietary magnesium associated with lower heart-failure (~22% per 100 mg/day) and type-2 diabetes risk (~19%)',
    },
    {
      when: (v) => v.cannabis === 'regular', dir: 'bad', input: 'Cannabis', source: ['moore2007'],
      text: 'Regular use is associated with roughly doubled odds of psychotic outcomes (dose-dependent). Evidence for depression/anxiety is weaker. No clear all-cause mortality long-term, but "no mortality signal" is not the same as safe.',
    },
    {
      when: (v) => v.cognitiveTraining >= 1, dir: 'good', input: 'Brain training', source: ['edwards2017'],
      text: 'Speed-of-processing training cut 10-year dementia risk ~29%, but gains are mostly domain-specific (you get better at the task itself)',
    },
    {
      when: (v) => v.ironDeficiency, dir: 'neutral', input: 'Iron', source: ['houston2018'],
      text: 'Correcting iron deficiency reduced fatigue without improving measured physical capacity',
    },
    {
      when: (v) => v.stress >= 8, dir: 'bad', input: 'Stress', source: ['russ2012'],
      text: 'Severe stress tracks mortality even after adjusting for somatic illness, behaviour and socioeconomic factors',
    },
    {
      when: (v) => v.creatine , dir: 'neutral', input: 'Creatine', source: ['avgerinos2018'],
      text: 'The cognitive effect is clearest in vegetarians and older/stressed individuals. Meat eaters already get dietary creatine',
    },
    {
      when: (v) => v.processedMeat >= 3, dir: 'good', input: 'Processed meat', source: ['pan2012'],
      text: 'Swapping 1 daily serving of red meat for fish, poultry, nuts or legumes was associated with 7–19% lower mortality',
    },
    {
      when: (v) => v.ssb >= 7, dir: 'neutral', input: 'Sugary drinks', source: ['malik2019'],
      text: 'Artificially sweetened drinks did not show the same negative effects as sugar-sweetened drinks',
    },
    {
      when: (v) => v.omega3 === true, dir: 'neutral', input: 'Omega-3 supplements', source: ['manson2019omega3'],
      text: 'The small benefits seen with eating fish do not replicate in a pill. The fish benefit appears to be about replacing meat, not about omega-3.',
    },
    {
      when: (v) => v.sitting >= 10 && v.cardio < 150, dir: 'bad', input: 'Sitting', source: ['biswas2015'],
      text: 'Sedentary (sitting) times mortality association shrinks substantially in active people',
    },
    {
      when: (v) => v.nuts >= 20, dir: 'good', input: 'Nuts', source: ['aune2016nuts'],
      text: 'A handful a day was also associated with ~50% lower respiratory-disease and ~40% lower diabetes mortality',
    },
    {
      when: (v) => v.sleepRegularity <= 3, dir: 'bad', input: 'Sleep regularity', source: ['windred2024'],
      text: 'An irregular schedule predicts mortality more strongly than short sleep did.',
    },
    {
      when: (v) => v.pm25 > 12, dir: 'bad', input: 'Air pollution', source: ['di2017'],
      text: 'above the US annual standard (12 µg/m³); WHO\'s guideline is 5 — HEPA purifiers, masks and route/location choices measurably reduce exposure',
    },
    {
      when: (v) => v.occupationalPA >= 2, dir: 'neutral', input: 'Physical activity at work', source: ['dalene2021', 'cillekens2022'],
      text: 'The "physical activity paradox" is contested: after full adjustment for socioeconomic and health factors, Norwegian men in active occupations lived 0.4–1.7 years LONGER (Dalene 2021). The Coenen 2018 meta-analysis pooled mostly crudely adjusted studies — healthy-worker selection may drive its higher-risk finding. Our effect uses Coenen (sex-specific), and this uncertainty is part of why the estimate is moderate evidence.',
    },
    {
      when: (v) => v.screenTime >= 6, dir: 'bad', input: 'Screen time', source: ['stamatakis2011', 'celis2018'],
      text: 'Screen-based entertainment ≥4 h/day tracked 1.5× all-cause mortality and 2.3× cardiovascular events, but seems to be because of the sitting and low fitness, which we count in those sliders rather than twice here',
    },

    {
      when: (v) => v.screenTime >= 5 && v.sleep < 7, dir: 'bad', input: 'Screen time', source: ['hale2015'],
      text: 'Screens near bedtime displace and delay sleep. The effects of poor sleep are counted with the sleep input',
    },
    {
      when: (v) => v.screenTime >= 3 && v.screenTime < 6, dir: 'neutral', input: 'Screen time', source: ['allcott2020', 'orben2019'],
      text: 'Deactivating Facebook for 4 weeks improved subjective wellbeing, and reduced factual news knowledge. Lower use persisted after the experiment.',
    },
    {
      when: (v) => v.screenTime >= 7, dir: 'bad', input: 'Screen time', source: ['twenge2018'],
      text: '7+ vs 1 h/day screen time tracks 2.4× diagnosed depression and 2.3× diagnosed anxiety in adolescents (whether screens are the cause is unclear)',
    },
    {
      when: (v) => v.sunExposure >= 3, dir: 'bad', input: 'Sun exposure', source: ['mahamat2020', 'stevenson2024', 'lindqvist2014', 'adventist2025'],
      text: 'High sun exposure increases skin cancer incidence, but the other benefits of the sun make it decrease mortality overall. It also boosts vitamin D and circadian entrainment, which may boost cognition',
    },
    {
      when: (v) => v.sunExposure <= 1, dir: 'bad', input: 'Sun exposure', source: ['lindqvist2014', 'stevenson2024'],
      text: 'Too little sun also misses vitamin D, nitric oxide and circadian benefits.',
    },
    {
      when: (v) => v.vo2maxOn, dir: 'good', input: 'VO2 max', source: ['weeldreyer2025'],
      text: 'Measured fitness absorbs most of BMI\'s mortality association: the unfit have ~2× all-cause mortality (and 2–3× CVD) at ANY BMI, while fit-at-any-BMI ≈ normal-weight fit. The bar is modest — better than the least-fit 20% is often enough. (The Mayo table\'s ≥35-BMI row still shows 1.45 at high self-reported PA — measured CRF ≠ self-reported PA.)',
    },
    {
      when: (v) => v.heightCm > 0 && (v.weightKg / Math.pow(v.heightCm / 100, 2)) < 18.5, dir: 'neutral', input: 'Weight', source: ['sanchezlastra2021'],
      text: 'Underweight caveat: the Mayo PA×adiposity study EXCLUDED BMI <18.5 at baseline (illness-related weight loss), so underweight maps into the normal-weight row here — the elevated mortality risk below BMI 18.5 seen in other studies (Di Angelantonio 2016) is NOT counted in the adiposity cluster.',
    },
  ],

  // ------------------------------------------------- Joint models (conflation)
  // When multiple inputs share a causal pathway, their marginal effects must
  // NOT be multiplied — the joint estimate replaces the product (see PLAN.md
  // §1.2–1.11 for the verified joint models). Each entry describes ONE
  // sub-model; the engine (Phase 2) dispatches per `cluster` and only applies
  // the joint model when at least one cluster member is active. Ownership
  // rule: an input's HR is counted by at most ONE joint model — the first
  // entry whose `members` include it (array order decides).
  //
  // Schema (documented; this array is EMPTY until Phase 3 populates it):
  //   {
  //     id:       string,            // unique joint-model id
  //     cluster:  string,            // cluster key (e.g. 'diet', 'movement',
  //                                  //   'adiposity', 'substances', 'psychosocial')
  //     members:  string[],          // input ids whose marginal HRs this
  //                                  //   entry REPLACES (each counted once)
  //     model:    'score'|'table'|'cells',
  //                                  // 'score': additive score built from
  //                                  //   per-input components (PURE-style);
  //                                  //   each component gets partial credit
  //                                  //   along the published gradient
  //                                  // 'table': grid of published joint
  //                                  //   categories (e.g. Ekelund PA×sitting,
  //                                  //   Mayo 2021 PA×adiposity) with
  //                                  //   bilinear interpolation
  //                                  // 'cells': published discrete cells
  //                                  //   (e.g. Momma 2022 aerobic×strength,
  //                                  //   Duncan 2023 PA×strength×sleep) —
  //                                  //   same shape as 'table', no
  //                                  //   interpolation
  //     lookup:   { components, gradient }  // 'score' model:
  //                                  //   components: [{ input, max, weight,
  //                                  //     valueOf? }]
  //                                  //     (read-only axis inputs; score =
  //                                  //     Σ weight·clamp(value/max, 0, 1);
  //                                  //     partialCredit per input =
  //                                  //     Σ weight·fraction over the
  //                                  //     slider's entries, for the UI;
  //                                  //     valueOf maps segmented values,
  //                                  //     e.g. fish {none:0, some:1, lots:1})
  //                                  //   gradient: [{ max, hr, hrLow, hrHigh }]
  //                                  //     (score -> HR steps, same walk as
  //                                  //     input `steps`)
   //              { axes, grid, interpolate, ratio }  // 'table'/'cells':
   //                                  //   axes: [{ id, label, unit,
   //                                  //     inputs: [ids], coeffs: [..],
   //                                  //     fn: (values, resolveValue) -> n,
   //                                  //     bands: [{ max, label }] }]
   //                                  //     (axis value = Σ coeffᵢ·inputᵢ,
   //                                  //     banded by `max` cutoffs; inputs
   //                                  //     are read-only — members decide
   //                                  //     whose HRs this replaces; `fn`
   //                                  //     replaces the sum for categorical
   //                                  //     axes (Duncan PA category — all
   //                                  //     thresholds live here, and the fn
   //                                  //     must mirror the engine's
   //                                  //     gated/superseded rule, e.g.
   //                                  //     vo2maxOn retires cardio);
   //                                  //     gated-off or superseded inputs
   //                                  //     contribute 0 automatically)
   //                                  //   grid: nested array by band index,
   //                                  //     entries { hr, hrLow, hrHigh };
   //                                  //     interpolate: true → bilinear on
   //                                  //     log HR between band cutoffs
   //                                  //     (2 axes only)
   //                                  //   ratio: { axis, referent } →
   //                                  //     total = cell(...)/cell(axis →
   //                                  //     referent band): the lookup
   //                                  //     contributes only the referent
   //                                  //     axis's main effect (interacted
   //                                  //     with the other axis); the other
   //                                  //     axis's row effect is divided away
   //                                  //     because a sibling cluster owns it
   //                                  //     (Duncan's PA rows are owned by
   //                                  //     Ekelund/Momma). CI = quadrature
   //                                  //     of the two cells' sigmas.
  //     outputs:  { mortality: lookup, cvd: lookup, ... }  // per-output
  //                                  //   lookups; outputs without coverage
  //                                  //   fall back to the members' marginal
  //                                  //   product
  //     evidence: 'high'|'moderate'|'low',  // widens the joint total's CI
  //     source:   string|string[],  // keys into `sources` below
  //     calibrate: true,  // OPTIONAL: shift this joint model's lookup
  //                                  //   (and CI) by a constant log-space
  //                                  //   offset per HR output so the total at
  //                                  //   the AVERAGE profile equals the owned
  //                                  //   members' marginal product exactly
  //                                  //   (calibration rule §2.1). Used when
  //                                  //   the published table's default cell
  //                                  //   is far from our members' frame
  //                                  //   (Ekelund ~92% off); skipped when it
  //                                  //   is within the tolerance band (Momma).
  //                                  //   Members already owned by an earlier
  //                                  //   joint model are excluded from the
  //                                  //   anchor sum (first-owner rule).
  //   }
  // While empty, the engine multiplies marginals exactly as before — this
  // structure is a no-op by design.
  jointModels: [
    {
      // PURE-style healthy diet score (Phase 3.1). One joint model per
      // cluster, here: the 4 inputs with PURE score components mapped onto
      // our sliders (fiber, fruitVeg, nuts, fish).
      id: 'dietScore',
      cluster: 'diet',
      members: ['fiber', 'fruitVeg', 'nuts', 'fish'],
      model: 'score',
      evidence: 'high',
      source: ['mente2023'],
      outputs: {
        mortality: {
          // Six PURE components, five mappable: fruit, vegetables, legumes,
          // nuts, fish (dairy excluded — the paper's Appendix S8 shows
          // dropping any single component barely changes the association).
          // fruitVeg feeds BOTH the fruit and the vegetables component:
          // 6 servings/d ≈ fruit (PURE median 145 g/d ≈ 1.8 servings) +
          // vegetables (250 g/d ≈ 3.1 servings); 3 servings/d = the
          // vegetables point. fiber stands in for legumes (PURE median
          // 38 g/d ≈ 6–8 g fiber → 25 g/d). fish max 1 (any regular
          // intake = the PURE fish median 12 g/d point).
          components: [
            { input: 'fruitVeg', max: 6, weight: 1 }, // fruit
            { input: 'fruitVeg', max: 6, weight: 1 }, // vegetables
            { input: 'fiber', max: 25, weight: 1 }, // legumes
            { input: 'nuts', max: 9, weight: 1 }, // nuts
            { input: 'fish', max: 1, weight: 1, valueOf: { none: 0, some: 1, lots: 1 } },
          ],
          // Per-point HR 0.91 (0.89–0.93) — the paper's per-20-percentile
          // increment, applied as exact powers. Cross-check: ≥5-vs-≤1 0.70
          // (0.63–0.77) vs our top step 0.91^4 = 0.6857 (0.6274–0.7481).
          gradient: [
            { max: 1, hr: 1.0, hrLow: 1.0, hrHigh: 1.0 },
            { max: 2, hr: 0.91, hrLow: 0.89, hrHigh: 0.93 },
            { max: 3, hr: 0.8281, hrLow: 0.7921, hrHigh: 0.8649 },
            { max: 4, hr: 0.7536, hrLow: 0.705, hrHigh: 0.8044 },
            { max: 5, hr: 0.6857, hrLow: 0.6274, hrHigh: 0.7481 },
          ],
        },
      },
      note: "PURE healthy diet score (Mente 2023, Eur Heart J 44:2560–79): one point per above-median component; scores here are FRACTIONAL (partial credit along each component), so the US-average profile scores ≈3.0 points and lands mid-gradient (≈0.75 HR). The paper's per-20-percentile increment 0.91 (0.89–0.93) is applied per point as exact powers; the published ≥5-vs-≤1 contrast 0.70 (0.63–0.77) matches our top step 0.686 (0.627–0.748) within ~2%. Members' own marginal effects (fiber Yang 2015, fruit/veg Wang 2014, nuts Aune 2016, fish Kwok 2019/Li 2020) are superseded for mortality; the joint total replaces the marginal product when the score lookup covers the output.",
    },
    {
      // PA×sitting joint table (Phase 3.2). Ekelund 2016 (Lancet): 16
      // studies, 1,005,791 people, 84,609 deaths; harmonised meta-analysis
      // of the sitting×PA interaction. Members' marginal effects (cardio
      // Arem 2015, steps Stamatakis 2011, sitting Biswas 2015) are
      // superseded for mortality; cancer/CVD have no coverage here and fall
      // back to the members' marginals.
      id: 'ekelundTable',
      cluster: 'movement',
      members: ['cardio', 'steps', 'sitting'],
      model: 'table',
      evidence: 'high',
      source: ['ekelund2016'],
      calibrate: true,
      outputs: {
        mortality: {
          axes: [
            // PA axis (MET-min/wk): cardio min/wk × 4 MET (moderate
            // equivalent) + steps/d × 7 × 0.03 MET-min (walking ≈ 3 MET at
            // ~100 steps/min). Quartile cutoffs from the paper (MET-h/w ×
            // 60): Q1 ≤150, Q2 ≤960, Q3 ≤1800, Q4 >2130 (above 2130 the
            // risk is flat per the paper, so Q4's cell clamps).
            { id: 'pa', label: 'PA', unit: 'MET-min/wk', inputs: ['cardio', 'steps'], coeffs: [4, 0.21], bands: [{ max: 150, label: 'Q1' }, { max: 960, label: 'Q2' }, { max: 1800, label: 'Q3' }, { max: 2130, label: 'Q4' }] },
            // Sitting axis (h/day): the paper's <4 and 4–6 rows are stored
            // as-is; the open-ended >8 row is the LAST band so ≥8 h clamps
            // flat to it, and 6–8 h values interpolate between the 4–6 and
            // >8 rows (the published 6–8 row is not stored separately — it
            // is close to that midpoint, disclosed in the note).
            { id: 'sit', label: 'Sitting', unit: 'h/day', inputs: ['sitting'], coeffs: [1], bands: [{ max: 4, label: '<4' }, { max: 6, label: '4–6' }, { max: 8, label: '≥6' }] },
          ],
          // Rows = PA quartile (Q1…Q4), cols = sitting (<4, 4–6, >8).
          // Referent = <4 h/d + Q4 (1.00, top-right). Grid rows hold the HR
          // AT each band cutoff; interpolate: true bilinears between them.
          grid: [
            [{ hr: 1.27, hrLow: 1.22, hrHigh: 1.30 }, { hr: 1.35, hrLow: 1.30, hrHigh: 1.40 }, { hr: 1.59, hrLow: 1.52, hrHigh: 1.66 }],
            [{ hr: 1.12, hrLow: 1.08, hrHigh: 1.16 }, { hr: 1.15, hrLow: 1.11, hrHigh: 1.20 }, { hr: 1.27, hrLow: 1.21, hrHigh: 1.33 }],
            [{ hr: 1.03, hrLow: 0.99, hrHigh: 1.07 }, { hr: 1.08, hrLow: 1.04, hrHigh: 1.13 }, { hr: 1.13, hrLow: 1.07, hrHigh: 1.19 }],
            [{ hr: 1.00, hrLow: 0.96, hrHigh: 1.04 }, { hr: 1.00, hrLow: 0.96, hrHigh: 1.04 }, { hr: 1.04, hrLow: 0.99, hrHigh: 1.10 }],
          ],
          interpolate: true,
        },
      },
      note: "Ekelund 2016 (Lancet 388:1302–10): harmonised meta-analysis of 16 studies (1,005,791 people), joint sitting×PA all-cause mortality. Sitting 9 h/d at the US-average profile lands in the paper's >8 h/d row and ≈Q3 PA (defaults → PA 1248 MET-min/wk), where the table reads ≈1.22 while the members' marginal product is 0.59 — the `calibrate: true` anchor shifts the whole table by a constant log-space offset so the average profile is exactly 1.0× (calibration rule), preserving the table's shape and the sitting×PA interaction. HRs between band cutoffs are interpolated on the log scale (rows/cols hold the HR at each cutoff); the open-ended >8 h/d row clamps flat (≥8 h), and the published 6–8 h/d row is not stored separately — 6–8 h values interpolate between the 4–6 and >8 rows (the paper's 6–8 cells sit near that midpoint; 9 h/d reads the flat >8 row). Cells are minimally adjusted (age, sex) plus each study's original covariates — diet is not uniformly adjusted, and the remaining cross-cluster overlap with the diet score is not modelled. Ref cell CI (0.96–1.04) approximated from the adjacent published cell (the paper gives no CI for the referent). Cancer/CVD outputs have no table coverage and use the members' marginal effects.",
    },
    {
      // Aerobic×strength cells (Phase 3.2). Momma 2022 (BJSM): systematic
      // review + meta-analysis; the both-cells are the published joint
      // estimates and are genuinely synergistic (0.60 < 0.85×0.80 ≈ 0.68).
      // The `strength` slider's marginal (0.85 at the US-average 1
      // session/wk, now exactly matching the MS-only cell) is superseded;
      // `cardio` stays owned by ekelundTable —
      // this axis only reads it to select the aerobic row.
      id: 'mommaCells',
      cluster: 'movement',
      members: ['strength'],
      model: 'table',
      evidence: 'low',
      source: ['momma2022'],
      outputs: {
        mortality: {
          axes: [
            // Aerobic axis (read-only, owned by ekelundTable): ≥150 min/wk
            // moderate-equivalent = "AER" (the paper's aerobic group).
            { id: 'aer', label: 'Aerobic', unit: 'min/wk', inputs: ['cardio'], coeffs: [1], bands: [{ max: 149, label: 'none' }, { max: 9999, label: 'AER' }] },
            // Strength axis (sessions/wk): any ≥1 = "MS" (the paper's
            // muscle-strengthening group; the J-shaped dose-response beyond
            // 2–3 sessions/wk is not modelled — binary band, disclosed).
            { id: 'ms', label: 'Strength', unit: 'sessions/wk', inputs: ['strength'], coeffs: [1], bands: [{ max: 0, label: 'none' }, { max: 99, label: 'MS' }] },
          ],
          // Rows = aerobic (none, AER), cols = strength (none, MS).
          // Referent = neither (1.00, top-left). Published cells used
          // directly (no interpolation — 'cells' semantics). `ratio`
          // divides by the none COLUMN (axis 1, referent 0): total =
          // cell(aerobic, strength) / cell(aerobic, none). The aerobic
          // ROW main effect is divided away because the Ekelund cluster's
          // PA axis (cardio+steps) owns aerobic PA on mortality — keeping
          // both would price the aerobic signal twice (3.2f probe: cardio
          // 0→300 moved Ekelund ×0.824 AND this row ×0.706, combined
          // ×0.582 vs Arem's single 0.63). What remains is the strength
          // main effect interacted with aerobic status (the published
          // synergy survives: both-cell 0.60/0.80 = 0.75 < MS-only 0.85).
          // At the default none row the ratio is exactly the published
          // MS-only cell (0.85) — no calibration change. On cancer/cvd
          // Ekelund has no coverage, so aerobic there falls back to the
          // cardio input's own marginal — still priced exactly once.
          grid: [
            [{ hr: 1.00, hrLow: 0.96, hrHigh: 1.04 }, { hr: 0.85, hrLow: 0.79, hrHigh: 0.93 }],
            [{ hr: 0.80, hrLow: 0.78, hrHigh: 0.82 }, { hr: 0.60, hrLow: 0.54, hrHigh: 0.67 }],
          ],
          ratio: { axis: 1, referent: 0 },
        },
        cancer: {
          axes: [
            { id: 'aer', label: 'Aerobic', unit: 'min/wk', inputs: ['cardio'], coeffs: [1], bands: [{ max: 149, label: 'none' }, { max: 9999, label: 'AER' }] },
            { id: 'ms', label: 'Strength', unit: 'sessions/wk', inputs: ['strength'], coeffs: [1], bands: [{ max: 0, label: 'none' }, { max: 99, label: 'MS' }] },
          ],
          grid: [
            [{ hr: 1.00, hrLow: 0.96, hrHigh: 1.04 }, { hr: 0.88, hrLow: 0.80, hrHigh: 0.97 }],
            [{ hr: 0.80, hrLow: 0.78, hrHigh: 0.82 }, { hr: 0.72, hrLow: 0.53, hrHigh: 0.98 }],
          ],
          ratio: { axis: 1, referent: 0 },
        },
        cvd: {
          axes: [
            { id: 'aer', label: 'Aerobic', unit: 'min/wk', inputs: ['cardio'], coeffs: [1], bands: [{ max: 149, label: 'none' }, { max: 9999, label: 'AER' }] },
            { id: 'ms', label: 'Strength', unit: 'sessions/wk', inputs: ['strength'], coeffs: [1], bands: [{ max: 0, label: 'none' }, { max: 99, label: 'MS' }] },
          ],
          grid: [
            [{ hr: 1.00, hrLow: 0.96, hrHigh: 1.04 }, { hr: 0.83, hrLow: 0.73, hrHigh: 0.93 }],
            [{ hr: 0.79, hrLow: 0.76, hrHigh: 0.82 }, { hr: 0.54, hrLow: 0.41, hrHigh: 0.70 }],
          ],
          ratio: { axis: 1, referent: 0 },
        },
      },
      note: "Momma 2022 (BJSM 56:755–63): systematic review + meta-analysis of prospective cohorts; all cells are 'minimally adjusted plus aerobic PA adjusted in every study' (several also adjusted diet — the diet overlap is partly handled in-study). MS-only cells are Momma's aerobic-adjusted single-activity contrasts (all-cause 0.85, cancer 0.88, CVD 0.83); aerobic-only cells are approximated from the existing Arem 2015 ≥150 min/wk bands (0.80 all-cause/cancer — the cardio cancer effect mirrors mortality — 0.79 CVD) because Momma's aerobic-only contrast is graphical only (Figure 5); the combined cells are Momma's published joint estimates and are SYNERGISTIC (all-cause 0.60 < 0.85×0.80 ≈ 0.68 — the interaction is the point of the cells). RATIO MODE (3.2f): total = cell(aerobic, strength) / cell(aerobic, none) — the aerobic ROW main effect is divided away because the Ekelund cluster's PA axis owns aerobic PA on mortality (keeping both double-priced the aerobic signal ~8–15%, found by the 3.2f probe); the strength main effect × aerobic interaction survives (both-cell 0.60/0.80 = 0.75, still < MS-only 0.85 — synergy intact). On cancer/cvd, Ekelund has no coverage and aerobic falls back to the cardio input's own marginal, so each output prices aerobic exactly once. NO `calibrate` anchor: the default none row is exactly the published MS-only cells (0.85/0.88/0.83) and matches the strength marginal's 1-session band exactly (0.85/0.88/0.83) — the published cells stay intact (unlike the Ekelund table, which is ~92% off at defaults). The strength band is binary (any ≥1 session/wk = MS) — the paper's J-shaped dose-response (min RR at ~60 min/wk, no benefit past ~130 min/wk) is not modelled. Referent = no AER + no MS. Evidence 'low' (GRADE very low, I² 59–85%).",
    },
    {
      // Sleep×PA category cells (Phase 3.2). Duncan 2023 (JSHS 12:65–72,
      // NHIS 2004–2014, n=282,473, 18,793 deaths): joint PA×sleep-duration
      // table, referent Active-Rec. `ratio: true` divides by the Rec column
      // so the table contributes ONLY the sleep main effect interacted with
      // PA category — the PA-row main effect is owned by the Ekelund/Momma
      // clusters and would double-count if multiplied. The `sleep` slider's
      // marginal (Cappuccio 2010) is superseded for mortality only.
      id: 'duncanCells',
      cluster: 'movement',
      members: ['sleep'],
      model: 'table',
      evidence: 'low',
      source: ['duncan2023'],
      outputs: {
        mortality: {
          axes: [
            // PA category (categorical, via `fn`): the paper's Active /
            // AER only / MSA only / Inactive groups. Thresholds: aerobic
            // ≥150 min/wk mod-equivalent flips AER on; strength ≥2
            // sessions/wk flips MSA on; both = Active; neither = Inactive.
            // Mirrors the engine's supersession rule: vo2maxOn retires the
            // cardio slider (the Ekelund PA axis does the same), so
            // measured fitness never double-counts. Returns the band index.
            {
              id: 'paCategory', label: 'PA category',
              fn: (v, r) => {
                const cardio = (v.vo2maxOn ? 0 : r('cardio')) || 0;
                const strength = r('strength') || 0;
                const aer = cardio >= 150, msa = strength >= 2;
                return aer && msa ? 3 : aer ? 2 : msa ? 1 : 0;
              },
              bands: [
                { max: 0, label: 'Inactive' },
                { max: 1, label: 'MSA only' },
                { max: 2, label: 'AER only' },
                { max: 3, label: 'Active' },
              ],
            },
            // Sleep duration (h/day): Short ≤6.9, Rec ≤9.4, Long ≤11. The
            // 9.1–9.9 range is ambiguous in the study itself (its Long
            // boundary is ≥10 for 18–64 y and ≥9 for >64 y) — 9.5 maps
            // Long, disclosed.
            { id: 'sleep', label: 'Sleep', unit: 'h/day', inputs: ['sleep'], coeffs: [1], bands: [{ max: 6.9, label: 'Short' }, { max: 9.4, label: 'Rec' }, { max: 11, label: 'Long' }] },
          ],
          // Rows = PA category in BAND order (Inactive, MSA only, AER only,
          // Active — note: NOT the paper's display order, which lists the
          // referent Active first); cols = sleep (Short, Rec, Long). The
          // paper's published cells, used directly — NO interpolation: the
          // study's sleep groups are discrete categories (Rec = 7–9 h), so
          // a slider value inside a band reads that band's cell (no
          // invented gradient; also keeps the defaults ratio exactly 1.0).
          // `ratio` divides by the Rec column (band 1) so at defaults
          // (Inactive, Rec) the total is 1.00 exactly — the average person
          // sleeps a reference duration, no calibration offset needed.
          grid: [
            [{ hr: 1.59, hrLow: 1.43, hrHigh: 1.76 }, { hr: 1.68, hrLow: 1.53, hrHigh: 1.84 }, { hr: 2.20, hrLow: 1.99, hrHigh: 2.44 }],
            [{ hr: 1.43, hrLow: 1.17, hrHigh: 1.76 }, { hr: 1.56, hrLow: 1.36, hrHigh: 1.80 }, { hr: 2.32, hrLow: 1.85, hrHigh: 2.91 }],
            [{ hr: 1.28, hrLow: 1.14, hrHigh: 1.44 }, { hr: 1.21, hrLow: 1.09, hrHigh: 1.34 }, { hr: 1.54, hrLow: 1.34, hrHigh: 1.76 }],
            [{ hr: 1.08, hrLow: 0.92, hrHigh: 1.26 }, { hr: 1.00, hrLow: 1.00, hrHigh: 1.00 }, { hr: 1.40, hrLow: 1.11, hrHigh: 1.77 }],
          ],
          ratio: { axis: 1, referent: 1 },
        },
      },
      note: "Duncan 2023 (J Sport Health Sci 12:65–72, NHIS 2004–2014, n=282,473): joint PA×sleep-duration all-cause mortality. Ratio mode: total = cell(PA, sleep) / cell(PA, Rec) — the PA-row main effect (Inactive 1.68 → Active 1.00 gradient) is divided away because Ekelund/Momma already own the PA risk; what remains is the sleep main effect interacted with PA category, which is the study's novel finding (short-sleep risk ~eliminated in the Active group, 1.08 NS; long-sleep risk persists at every PA level, worst with low PA 2.20–2.32). No multiplicative interaction is significant in the study, so the cells are used directly; the study's sleep groups are discrete categories, so there is NO interpolation on the sleep axis (a value inside a band reads that band's cell — the defaults ratio is then exactly 1.00, no `calibrate` anchor needed). Sleep slider 4–11 h, step 0.5; Rec = the 7–9 h (18–64 y) / 7–8 h (>64 y) reference; the 9.1–9.9 range is ambiguous in the study itself and 9.5 maps Long. The study does NOT adjust for diet or sedentary behaviour (stated limitation) — the diet overlap is priced by the `duncanCells ↔ dietScore` overlap pair (ρ 0.10), and sitting overlap by the Ekelund cluster's own sitting axis. The Active-Rec referent cell has no published CI (1.00 used as-is; the ratio's CI adds only the denominator's sigma — a slight understatement, disclosed). Evidence 'low' (self-reported PA/sleep, wide CIs in some cells).",
    },
    {
      // PA×adiposity joint table (Phase 3.3). Sanchez-Lastra 2021 (Mayo Clin
      // Proc 96:105–19; UK Biobank n=295,917, 6,684 deaths): joint PA×BMI
      // and PA×body-fat cells for ALL-CAUSE, CVD- and cancer-mortality
      // (Model 3). Replaces the Di Angelantonio BMI marginal on all three HR
      // outputs AND gives the body-fat slider real CVD + cancer data; the
      // bodyFat marginal (Jayedi 2022) retires on mortality too (first-owner
      // rule — one joint model per cluster, members counted once).
      // The PA axis is rank-preserving (Ekelund cutoffs, not Mayo's MET
      // medians — UK Biobank self-report overreports; keeping both tables'
      // axes on the same scale matters more, disclosed). The adiposity axis
      // reads derived BMI, or the measured body-fat slider when bodyFatOn;
      // the grid follows the axis mode (the BF quartile rows are a separate
      // published table — same study, different adiposity measure).
      id: 'mayoCells',
      cluster: 'adiposity',
      members: ['bmi', 'bodyFat'],
      model: 'table',
      evidence: 'high',
      source: ['sanchezlastra2021'],
      calibrate: true,
      outputs: {
        mortality: {
          // Axis 0 = grid ROWS, axis 1 = grid COLUMNS (indexGrid order; the
          // grids below are stored rows=PA, cols=adiposity). The ratio's
          // referent is column 0 of axis 1 — the normal/low adiposity column
          // — so the PA-row main effect divides away.
          axes: [
            // PA axis: rank-preserving mapping onto the Ekelund quartile
            // cutoffs the movement cluster already uses (G3 ≤150 / G2 ≤1800 /
            // G1 >1800 MET-min/wk from cardio min/wk × 4 + steps/d × 0.21) —
            // NOT the paper's MET medians (UKB overreports; the two tables
            // must stay on the same PA scale). vo2maxOn retires the cardio
            // slider here automatically (engine axis rule, same as Ekelund).
            { id: 'pa', label: 'PA', unit: 'MET-min/wk', inputs: ['cardio', 'steps'], coeffs: [4, 0.21], bands: [{ max: 150, label: 'G3' }, { max: 1800, label: 'G2' }, { max: Infinity, label: 'G1' }] },
            // Adiposity axis. BMI mode: the study's four BMI groups
            // (18.5–24.9 / 25–29.9 / 30–34.9 / ≥35); BMI <18.5 was EXCLUDED
            // from the study (illness-related weight loss), so underweight
            // maps into the normal-weight band (col 0) — the Di Angelantonio
            // left arm is not counted (finding + note). BF mode (bodyFatOn):
            // the study's sex-specific distribution-matched quartiles — the
            // paper publishes NO % cutoffs, so these bands are OUR disclosed
            // translation via the Deurenberg 1991 BF%-BMI equation at the UK
            // Biobank mean age (56 y): BF% at BMI 18.5/25/30/35 ≈ 30/37/43/49
            // (women), 19/27/33/39 (men). Returns the band INDEX (Duncan
            // paCategory pattern).
            {
              id: 'adip', label: 'Adiposity',
              fn: (v, r) => {
                if (v.bodyFatOn) {
                  const bf = r('bodyFat');
                  if (typeof bf !== 'number' || !isFinite(bf)) return 0;
                  const c = v.sex === 'female' ? [30, 37, 43, 49] : [19, 27, 33, 39];
                  const idx = c.findIndex((x) => bf <= x);
                  return idx < 0 ? 3 : idx;
                }
                const bmi = r('bmi');
                if (typeof bmi !== 'number' || !isFinite(bmi)) return 0;
                if (bmi < 18.5) return 0;
                if (bmi < 25) return 0;
                if (bmi < 30) return 1;
                if (bmi < 35) return 2;
                return 3;
              },
              bands: [
                { max: 0, label: 'Normal' },
                { max: 1, label: 'Overweight' },
                { max: 2, label: 'Obese I' },
                { max: 3, label: 'Obese II+' },
              ],
            },
          ],
          // Rows = PA group in BAND order (G3, G2, G1 — NOT the paper's
          // display order), cols = adiposity bands normal-first (normal /
          // overweight / obese I / ≥35 for BMI; low / med-low / med-high /
          // high for BF) so the ratio's referent col = 0. Published Model 3
          // cells used directly, NO interpolation (both axes are discrete
          // study categories — Duncan precedent). `ratio {axis: 1,
          // referent: 0}` divides by the normal column: the PA-row main
          // effect divides away (Ekelund's PA axis owns PA on mortality;
          // the cardio+steps marginals own it on cancer/cvd) and what
          // survives is the published PA×adiposity interaction
          // (attenuation: BF high 1.54 → 1.24 from G3 to G1; BMI ≥35 flat
          // 1.52 → 1.45). At defaults (G2, overweight) the ratio reads
          // 1.02/1.07 = 0.9533 — below 1.0 because the normal-weight G2
          // cell (1.07) is itself elevated (overweight-paradox artifact,
          // see note). `calibrate: true` anchors the table so the cluster
          // total at defaults equals the members' marginal product (the
          // bmi marginal ≈1.20; the ratio 0.9533 is ~26% off — Ekelund
          // anchor rule). CI for the referent cell: no published CI (1.00
          // used as-is — the ratio's CI then adds only the numerator's
          // sigma; slight understatement, disclosed, Duncan precedent).
          grids: {
            bmi: [
              [{ hr: 1.22, hrLow: 1.07, hrHigh: 1.38 }, { hr: 1.12, hrLow: 1.00, hrHigh: 1.24 }, { hr: 1.38, hrLow: 1.22, hrHigh: 1.56 }, { hr: 1.52, hrLow: 1.30, hrHigh: 1.78 }],
              [{ hr: 1.07, hrLow: 0.96, hrHigh: 1.18 }, { hr: 1.02, hrLow: 0.93, hrHigh: 1.11 }, { hr: 1.09, hrLow: 0.97, hrHigh: 1.23 }, { hr: 1.43, hrLow: 1.21, hrHigh: 1.67 }],
              [{ hr: 1.00, hrLow: 1.00, hrHigh: 1.00 }, { hr: 1.00, hrLow: 0.90, hrHigh: 1.10 }, { hr: 1.15, hrLow: 1.02, hrHigh: 1.29 }, { hr: 1.45, hrLow: 1.21, hrHigh: 1.73 }],
            ],
            bodyFat: [
              [{ hr: 1.11, hrLow: 0.96, hrHigh: 1.28 }, { hr: 1.13, hrLow: 1.01, hrHigh: 1.25 }, { hr: 1.38, hrLow: 1.22, hrHigh: 1.55 }, { hr: 1.54, hrLow: 1.33, hrHigh: 1.79 }],
              [{ hr: 1.05, hrLow: 0.94, hrHigh: 1.16 }, { hr: 1.01, hrLow: 0.92, hrHigh: 1.11 }, { hr: 1.13, hrLow: 1.01, hrHigh: 1.26 }, { hr: 1.36, hrLow: 1.17, hrHigh: 1.59 }],
              [{ hr: 1.00, hrLow: 1.00, hrHigh: 1.00 }, { hr: 1.02, hrLow: 0.93, hrHigh: 1.12 }, { hr: 1.12, hrLow: 0.99, hrHigh: 1.25 }, { hr: 1.24, hrLow: 1.04, hrHigh: 1.49 }],
            ],
          },
          gridForAxis: function (r, v) { return this.grids[v.bodyFatOn ? 'bodyFat' : 'bmi']; },
          ratio: { axis: 1, referent: 0 },
        },
        cvd: {
          // Same axis order as mortality: axis 0 = PA (grid ROWS), axis 1 =
          // adiposity (grid COLUMNS; ratio referent = normal col 0).
          axes: [
            { id: 'pa', label: 'PA', unit: 'MET-min/wk', inputs: ['cardio', 'steps'], coeffs: [4, 0.21], bands: [{ max: 150, label: 'G3' }, { max: 1800, label: 'G2' }, { max: Infinity, label: 'G1' }] },
            {
              id: 'adip', label: 'Adiposity',
              fn: (v, r) => {
                if (v.bodyFatOn) {
                  const bf = r('bodyFat');
                  if (typeof bf !== 'number' || !isFinite(bf)) return 0;
                  const c = v.sex === 'female' ? [30, 37, 43, 49] : [19, 27, 33, 39];
                  const idx = c.findIndex((x) => bf <= x);
                  return idx < 0 ? 3 : idx;
                }
                const bmi = r('bmi');
                if (typeof bmi !== 'number' || !isFinite(bmi)) return 0;
                if (bmi < 18.5) return 0;
                if (bmi < 25) return 0;
                if (bmi < 30) return 1;
                if (bmi < 35) return 2;
                return 3;
              },
              bands: [
                { max: 0, label: 'Normal' },
                { max: 1, label: 'Overweight' },
                { max: 2, label: 'Obese I' },
                { max: 3, label: 'Obese II+' },
              ],
            },
          ],
          // CVD-MORTALITY cells (supp Table 9, Model 3, Fine–Gray
          // competing-risk subdistribution HRs — stated on the card). Note
          // the real 0.89 anomaly: normal-weight G2 (0.89 [0.68–1.15] < REF)
          // is driven by sparse CVD deaths (n=128 in the ref cell) —
          // transcribed as published, disclosed. `ratio` + `calibrate`
          // identical to mortality (the bmi CVD marginal ≈1.25 at defaults
          // anchors the table).
          grids: {
            bmi: [
              [{ hr: 1.31, hrLow: 0.97, hrHigh: 1.78 }, { hr: 1.10, hrLow: 0.85, hrHigh: 1.42 }, { hr: 1.71, hrLow: 1.30, hrHigh: 2.24 }, { hr: 1.55, hrLow: 1.08, hrHigh: 2.23 }],
              [{ hr: 0.89, hrLow: 0.68, hrHigh: 1.15 }, { hr: 0.99, hrLow: 0.79, hrHigh: 1.23 }, { hr: 1.12, hrLow: 0.86, hrHigh: 1.48 }, { hr: 1.99, hrLow: 1.44, hrHigh: 2.76 }],
              [{ hr: 1.00, hrLow: 1.00, hrHigh: 1.00 }, { hr: 1.03, hrLow: 0.83, hrHigh: 1.29 }, { hr: 1.15, hrLow: 0.87, hrHigh: 1.51 }, { hr: 1.37, hrLow: 0.90, hrHigh: 2.06 }],
            ],
            bodyFat: [
              [{ hr: 1.20, hrLow: 0.85, hrHigh: 1.68 }, { hr: 1.24, hrLow: 0.96, hrHigh: 1.59 }, { hr: 1.30, hrLow: 0.97, hrHigh: 1.72 }, { hr: 1.58, hrLow: 1.13, hrHigh: 2.21 }],
              [{ hr: 1.00, hrLow: 0.77, hrHigh: 1.30 }, { hr: 0.88, hrLow: 0.70, hrHigh: 1.10 }, { hr: 1.12, hrLow: 0.86, hrHigh: 1.45 }, { hr: 1.71, hrLow: 1.24, hrHigh: 2.36 }],
              [{ hr: 1.00, hrLow: 1.00, hrHigh: 1.00 }, { hr: 1.03, hrLow: 0.83, hrHigh: 1.29 }, { hr: 1.01, hrLow: 0.76, hrHigh: 1.34 }, { hr: 1.20, hrLow: 0.80, hrHigh: 1.81 }],
            ],
          },
          gridForAxis: function (r, v) { return this.grids[v.bodyFatOn ? 'bodyFat' : 'bmi']; },
          ratio: { axis: 1, referent: 0 },
        },
        cancer: {
          // Same axis order as mortality: axis 0 = PA (grid ROWS), axis 1 =
          // adiposity (grid COLUMNS; ratio referent = normal col 0).
          axes: [
            { id: 'pa', label: 'PA', unit: 'MET-min/wk', inputs: ['cardio', 'steps'], coeffs: [4, 0.21], bands: [{ max: 150, label: 'G3' }, { max: 1800, label: 'G2' }, { max: Infinity, label: 'G1' }] },
            {
              id: 'adip', label: 'Adiposity',
              fn: (v, r) => {
                if (v.bodyFatOn) {
                  const bf = r('bodyFat');
                  if (typeof bf !== 'number' || !isFinite(bf)) return 0;
                  const c = v.sex === 'female' ? [30, 37, 43, 49] : [19, 27, 33, 39];
                  const idx = c.findIndex((x) => bf <= x);
                  return idx < 0 ? 3 : idx;
                }
                const bmi = r('bmi');
                if (typeof bmi !== 'number' || !isFinite(bmi)) return 0;
                if (bmi < 18.5) return 0;
                if (bmi < 25) return 0;
                if (bmi < 30) return 1;
                if (bmi < 35) return 2;
                return 3;
              },
              bands: [
                { max: 0, label: 'Normal' },
                { max: 1, label: 'Overweight' },
                { max: 2, label: 'Obese I' },
                { max: 3, label: 'Obese II+' },
              ],
            },
          ],
          // CANCER-MORTALITY cells (supp Table 10, Model 3, Fine–Gray
          // competing-risk subdistribution HRs). Flatter than all-cause; the
          // ≥35 row carries the published gradient (1.57 G1 → 1.48 G3).
          // `ratio` + `calibrate`: no bmi/bodyFat cancer marginal exists, so
          // the members' product at defaults is 1.0 and the calibration
          // anchors the table to exactly 1.0 at defaults (the old
          // no-data-free product).
          grids: {
            bmi: [
              [{ hr: 1.12, hrLow: 0.94, hrHigh: 1.32 }, { hr: 1.20, hrLow: 1.05, hrHigh: 1.38 }, { hr: 1.30, hrLow: 1.10, hrHigh: 1.54 }, { hr: 1.48, hrLow: 1.19, hrHigh: 1.84 }],
              [{ hr: 1.10, hrLow: 0.97, hrHigh: 1.24 }, { hr: 1.09, hrLow: 0.97, hrHigh: 1.22 }, { hr: 1.21, hrLow: 1.04, hrHigh: 1.40 }, { hr: 1.30, hrLow: 1.05, hrHigh: 1.63 }],
              [{ hr: 1.00, hrLow: 1.00, hrHigh: 1.00 }, { hr: 1.07, hrLow: 0.95, hrHigh: 1.20 }, { hr: 1.29, hrLow: 1.11, hrHigh: 1.49 }, { hr: 1.57, hrLow: 1.25, hrHigh: 1.97 }],
            ],
            bodyFat: [
              [{ hr: 1.01, hrLow: 0.84, hrHigh: 1.21 }, { hr: 1.13, hrLow: 0.99, hrHigh: 1.30 }, { hr: 1.43, hrLow: 1.23, hrHigh: 1.68 }, { hr: 1.45, hrLow: 1.18, hrHigh: 1.78 }],
              [{ hr: 1.03, hrLow: 0.91, hrHigh: 1.18 }, { hr: 1.10, hrLow: 0.98, hrHigh: 1.23 }, { hr: 1.21, hrLow: 1.04, hrHigh: 1.39 }, { hr: 1.25, hrLow: 1.02, hrHigh: 1.54 }],
              [{ hr: 1.00, hrLow: 1.00, hrHigh: 1.00 }, { hr: 1.07, hrLow: 0.95, hrHigh: 1.20 }, { hr: 1.27, hrLow: 1.09, hrHigh: 1.47 }, { hr: 1.31, hrLow: 1.04, hrHigh: 1.65 }],
            ],
          },
          gridForAxis: function (r, v) { return this.grids[v.bodyFatOn ? 'bodyFat' : 'bmi']; },
          ratio: { axis: 1, referent: 0 },
        },
      },
      note: "Sanchez-Lastra 2021 (Mayo Clin Proc 96:105–19, UK Biobank n=295,917, 6,684 deaths): joint PA×adiposity tables (Model 3). RATIO MODE: total = cell(PA, adiposity) / cell(PA, normal) — the PA-row main effect divides away because the movement cluster's Ekelund PA axis owns PA on mortality (and the cardio+steps marginals on cancer/CVD, where Ekelund has no coverage); what survives is the published PA×adiposity INTERACTION (high PA attenuates high-adiposity risk but does not eliminate it; at BMI ≥35 no attenuation: G1 1.45 vs G3 1.52). RANK-PRESERVING PA AXIS (disclosed): the paper's G1/G2/G3 are UK Biobank self-reported MET-min/wk quintiles (medians ≈2,800–3,700 / ≈925–2,230 / ≈340–490) — we do NOT reuse those medians; the axis maps cardio+steps onto the Ekelund quartile cutoffs (G3 ≤150 / G2 ≤1800 / G1 >1800 MET-min/wk) so both tables stay on the same PA scale. UKB overreports PA, so a given slider value lands in a higher activity group than the paper's median would suggest. `calibrate: true` (Ekelund anchor rule): at defaults (G2, overweight) the ratio reads 1.02/1.07 = 0.9533, the members' marginal product is the bmi marginal ≈1.20 (bodyFat gated off) — ~26% off, so a constant log-space offset anchors the cluster total to the members' product at defaults (it cancels in the page's evaluate() normalization anyway). OVERWEIGHT-PARADOX ARTIFACT (disclose, never 'protect'): the normal-weight cells (G3 1.22, G2 1.07) are elevated by reverse causality + smoking; the never-smoker restriction (supp Table 6, n=168,654) attenuates to NS — so the ratio can read <1 for overweight at low PA (G3×overweight 1.12/1.22 = 0.92), a source artifact, not a protective claim. UNDERWEIGHT: BMI <18.5 was EXCLUDED from the study, so underweight maps into the normal-weight row (the Di Angelantonio left arm is lost — disclosed, finding). BODY-FAT MODE: the BF rows are the study's sex-specific distribution-matched quartiles; NO % cutoffs are published, so the axis uses our disclosed translation via the Deurenberg 1991 equation at the UK Biobank mean age (56 y): BF% ≈ 30/37/43/49 (women), 19/27/33/39 (men) at BMI 18.5/25/30/35 — our translation, not the paper's. CVD and cancer tables are Fine–Gray COMPETING-RISK subdistribution HRs (mortality = Cox); the CVD 0.89 normal-weight-G2 anomaly is real (sparse deaths, n=128 in ref cell) and transcribed as-is. No significant multiplicative interactions in the study (P>0.18) — cells used directly, NO interpolation (discrete study categories). Diet pattern IS adjusted in Model 3 → ρ(mayoCells, dietScore) ≈ 0, no new overlap pair. Referent cell CI: not published (1.00 used as-is — the ratio's CI adds only the numerator's sigma; slight understatement, Duncan precedent).",
    },
  ],

  // --------------------------------------------------- Overlap pairs (ρ)
  // Residual correlations between inputs whose marginal effects were NOT
  // mutually adjusted in their primary sources (verified in PLAN.md §1.12
  // and §1.14). When both members of a pair are active on the same output,
  // the engine (Phase 2) discounts the weaker effect in log space by `rho`
  // and widens the combined uncertainty by the covariance term
  // 2·rhoU·σᵢ·σⱼ. rho = 0 reproduces today's plain multiplication.
  //
  // Schema (documented; this array is EMPTY until Phase 3 populates it —
  // the verified values live in PLAN.md §1.12/§1.14 until then):
  //   {
  //     a:       string,           // input id (first member) — may also be a
  //                                 //   joint-model id (Phase 3): the pair
  //                                 //   then prices the input against the
  //                                 //   cluster total, not the input alone
  //     b:       string,           // input id (second member), same rule
  //     rho:     number,           // 0..1 — input-correlation point estimate
  //                                 //   (magnitude; sign recorded in `note`)
  //     rhoU:    number,           // 0..1 — uncertainty half-width used in
  //                                 //   the covariance term (2·rhoU·σᵢ·σⱼ)
  //     kind:    'shared-pathway'|'residual-confounding'|'mediator',
  //     tier:    'high'|'moderate'|'low',  // evidence tier of rho itself
  //     note:    string,           // direction of the input correlation +
  //                                 //   what the source actually found
  //     source:  string|string[],  // keys into `sources` below
  //   }
  overlaps: [
    {
      // Harmful foods vs the diet score (PLAN §1.4): same intake channel —
      // people who eat more processed meat / drink more SSBs eat fewer
      // score foods. Pan 2012 and Malik 2019 already adjust for whole
      // grains/fruit/veg, so the HRs are not double-charged statistically;
      // the pair prices the residual intake correlation.
      a: 'processedMeat',
      b: 'dietScore', // joint-model id: pair vs the cluster total
      rho: 0.3,
      rhoU: 0.15,
      kind: 'residual-confounding',
      tier: 'moderate',
      note: 'Processed meat ↔ diet score. Pan 2012 adjusts for whole grains/fruit/veg; substitution estimates bound the residual correlation at 10–22%. rhoU = 0.5·rho convention (§3.1).',
      source: ['pan2012'],
    },
    {
      a: 'ssb',
      b: 'dietScore',
      rho: 0.15,
      rhoU: 0.075,
      kind: 'residual-confounding',
      tier: 'moderate',
      note: 'SSB ↔ diet score. Malik 2019 adjusts for whole grains/fruit/veg/BMI and reports no SSB×diet-quality interaction (P > .10), so the residual correlation is small. rhoU = 0.5·rho convention.',
      source: ['malik2019'],
    },
    {
      a: 'magnesium',
      b: 'dietScore',
      rho: 0.5,
      rhoU: 0.25,
      kind: 'shared-pathway',
      tier: 'moderate',
      note: 'Magnesium ↔ diet score: Mg food sources ARE the score foods (nuts, legumes, whole grains, vegetables) — same-pathway overlap, so the marginal HR is largely pre-billed by the score. rhoU = 0.5·rho convention.',
      source: ['fang2016'],
    },
    {
      // Cluster↔cluster pair (Phase 3.2): sleep's marginal is RETIRED into
      // duncanCells, so blending the marginal would discount a number that
      // is not in the model — the pair prices the sleep-cells total against
      // the diet total instead.
      a: 'duncanCells',
      b: 'dietScore',
      rho: 0.10,
      rhoU: 0.05,
      kind: 'residual-confounding',
      tier: 'low',
      note: 'Duncan cells ↔ diet score. Duncan 2023 explicitly does NOT adjust for diet (stated limitation) — the sleep cells partially absorb diet correlation, so the sleep-cell contribution gets a modest discount. rhoU = 0.5·rho convention.',
      source: ['duncan2023'],
    },
    {
      // Cluster-facing pair (Phase 3.2): the old rhr↔cardio pair (ρ 0.20,
      // verified) cannot exist as written — cardio is cluster-owned. The
      // cluster total includes steps+sitting too, which dilutes the shared
      // pathway, hence the discount from 0.20 to 0.15.
      a: 'rhr',
      b: 'ekelundTable',
      rho: 0.15,
      rhoU: 0.075,
      kind: 'shared-pathway',
      tier: 'low',
      note: 'Resting heart rate ↔ Ekelund PA×sitting cluster: the retired rhr↔cardio pair (ρ 0.20), rewritten against the cluster total and discounted to 0.15 because the total also carries steps+sitting. The engine discounts whichever side is weaker — at typical active values the input side (rhr) is the weaker one and gets the discount (e.g. 1.29 → 1.24); when the cluster total itself is weak (near 1.0) the small discount lands on the cluster side. rhoU = 0.5·rho convention.',
      source: ['aune2017rhr'],
    },
    {
      a: 'sunExposure',
      b: 'ekelundTable',
      rho: 0.10,
      rhoU: 0.05,
      kind: 'shared-pathway',
      tier: 'low',
      note: 'Sun exposure ↔ Ekelund PA×sitting cluster: absorbs the retired sun↔steps pair — steps contribute ~40% of the default PA axis — so no separate sun↔steps pair exists. Small, honest discount on whichever side is weaker. rhoU = 0.5·rho convention.',
      source: ['adventist2025', 'stevenson2024'],
    },
    {
      // PLAN §1.12 / §3.4: substance mutual-adjustment verification. Two
      // failing pairs only — everything else in the category is honestly
      // multiplied. Both pairs are silent at defaults (snus 'no', vaping
      // 'never', alcohol 2.5 → all HR 1.0).
      a: 'snus',
      b: 'alcohol',
      rho: 0.15,
      rhoU: 0.10,
      kind: 'residual-confounding',
      tier: 'moderate',
      note: 'Snus ↔ alcohol (PLAN §1.12): byhamre2021 main aHRs adjust for attained age + BMI ONLY — alcohol not in the main model. Sensitivity (+education +alcohol +physical activity) "yielded similar results", so the double count is real but small. Engine discounts whichever side is weaker per output. rhoU = 0.5·rho convention.',
      source: ['byhamre2021'],
    },
    {
      a: 'vaping',
      b: 'alcohol',
      rho: 0.10,
      rhoU: 0.05,
      kind: 'unmeasured-confounding',
      tier: 'low',
      note: 'Vaping ↔ alcohol (PLAN §1.12): PATH collects no alcohol data — unmeasured confounder. Numerically moot while the vaping CVD estimate is a null (HR 1.00 [0.69–1.45]): a 1.0 HR raised to (1−ρ) is still 1.0, so the blend is a no-op today; kept for honest structure, activates automatically if a future vaping HR turns non-null. rhoU = 0.5·rho convention.',
      source: ['berlowitz2022'],
    },
  ],

  // ---------------------------------------- Per-lever-only clusters (Phase 3)
  // Cluster keys whose combined HR must NOT be computed at all — no joint
  // model exists and the pairwise correlations are too entangled to model
  // (e.g. psychosocial: purpose↔stress↔social triangle). Their contributions
  // are shown individually with a conflation label; they never enter the
  // total product (engine sets `perLever: true` on their contribution
  // records). Populated by Phase 3.5.
  //
  // Schema (documented; entries are objects so members can be declared):
  //   {
  //     cluster: string,            // cluster key (e.g. 'psychosocial')
  //     members: string[],          // input ids shown individually
  //   }
  //
  // psychosocial (PLAN §1.11/§1.14): NO joint purpose×stress×social×
  // sleepReg mortality model exists — the per-lever-only landing is the fix
  // (structural, not ρ, so the purpose↔stress↔social triangle cannot
  // double-discount). The four sliders stop entering the mortality/cancer/
  // cvd products entirely; their happiness/cognition POINTS still
  // accumulate (points outputs have no accumulator entry). sleepReg loses
  // its marginal HR; sleep duration stays in the duncanCells joint model;
  // screenTime is already mind-only (happiness-only) by design. See PLAN
  // map at line ~850, "§3.5 implementation notes".
  perLeverOnly: [
    {
      cluster: 'psychosocial',
      members: ['purpose', 'stress', 'social', 'sleepRegularity'],
    },
  ],

  // ---------------------------------------------------------------- Sources
  // Single source of truth for the on-page reference list. Every effect above
  // points at one of these keys.
  sources: {
    yang2015: {
      authors: 'Yang Y, Zhao LG, Wu QJ, Ma X, Xiang YB',
      year: 2015,
      title: 'Association between dietary fiber and lower risk of all-cause mortality: a meta-analysis of cohort studies',
      journal: 'American Journal of Epidemiology, 181(2):83–91',
      url: 'https://doi.org/10.1093/aje/kwu257',
      pmid: '25552267',
		},
    mente2023: {
      authors: 'Mente A, Dehghan M, Rangarajan S, O\'Donnell M, et al. (PURE investigators)',
      year: 2023,
      title: 'Diet, cardiovascular disease, and mortality in 80 countries',
      journal: 'European Heart Journal, 44(28):2560–2579',
      url: 'https://doi.org/10.1093/eurheartj/ehad269',
      pmid: '37414411',
      note: 'Open access (CC BY-NC). PURE healthy diet score: 6 components (fruit, vegetables, legumes, nuts, fish, dairy), 1 point each for above-median intake; ≥5-vs-≤1 → HR 0.70 (0.63–0.77) for all-cause mortality; per-20-percentile increment HR 0.91 (0.89–0.93).',
    },
    duncan2023: {
      authors: 'Duncan MJ, Oftedal S, Kline CE, Plotnikoff RC, Holliday EG',
      year: 2023,
      title: 'Combined associations of physical activity and sleep duration with all-cause mortality: the National Health Interview Survey',
      journal: 'Journal of Sport and Health Science, 12(1):65–72',
      url: 'https://doi.org/10.1016/j.jshs.2022.07.003',
      pmid: '35872092',
      note: 'Open access (PMC9923431). NHIS 2004–2014, n=282,473, 18,793 deaths (follow-up 5.4 y mean, deaths within 1 y excluded). Joint PA×sleep-duration table (12 cells, referent Active + Rec sleep): Active rows eliminate the short-sleep association (1.08, NS) but not long-sleep risk (1.40–2.32, worst with MSA-only/Inactive); no significant multiplicative interaction. Model 3 adjusts age, sex, education, race/ethnicity, work status, BMI, alcohol, smoking, self-rated health, chronic disease — diet and sedentary behaviour NOT adjusted (stated limitation).',
    },
    ekelund2016: {
      authors: 'Ekelund U, Steene-Johannessen J, Brown WJ, Fagerland MW, et al.',
      year: 2016,
      title: 'Does physical activity attenuate, or even eliminate, the detrimental association of sitting time with mortality? A harmonised meta-analysis of data from more than 1 million men and women',
      journal: 'Lancet, 388(10051):1302–1310',
      url: 'https://doi.org/10.1016/S0140-6736(16)30370-1',
      pmid: '27475271',
      note: 'Harmonised meta-analysis, 16 studies, 1,005,791 participants, 84,609 deaths (13 studies on sitting), follow-up 2–18.1 y. Joint sitting×PA table (Supplementary Table 4): referent <4 h/d sitting + Q4 PA; high PA eliminates sitting risk (interaction p<0.0001). Cells minimally adjusted (sex, age) plus each study\'s original covariates.',
    },
    momma2022: {
      authors: 'Momma H, Kawakami R, Honda T, Sawada SS',
      year: 2022,
      title: 'Muscle-strengthening activities are associated with lower risk and mortality in major non-communicable diseases: a systematic review and meta-analysis of cohort studies',
      journal: 'British Journal of Sports Medicine, 56(13):755–763',
      url: 'https://doi.org/10.1136/bjsports-2021-105061',
      pmid: '35228201',
      note: 'Open access (PMC9209691). Systematic review + meta-analysis of prospective cohorts. Joint MS+aerobic vs neither: all-cause RR 0.60 (0.54–0.67), CVD 0.54 (0.41–0.70), cancer 0.72 (0.53–0.98); aerobic-adjusted single-activity: MS-only 0.85 (0.79–0.93) / 0.83 / 0.88. GRADE very low for all outcomes (I² 59–85%).',
    },
    sanchezlastra2021: {
      authors: 'Sanchez-Lastra MA, Ding D, Dalene KE, Ekelund U, Tarp J',
      year: 2021,
      title: 'Physical activity and mortality across levels of adiposity: a prospective cohort study from the UK Biobank',
      journal: 'Mayo Clinic Proceedings, 96(1):105–119',
      url: 'https://doi.org/10.1016/j.mayocp.2020.06.049',
      pmid: '33309181',
      note: 'Open access (CC BY; verified against the supplementary file mmc1.docx, Tables 2/3/6/9/10). UK Biobank, n=295,917, median follow-up 8.9 y (to Jan 31 2018), 6,684 deaths. Joint PA×adiposity Model 3 tables: all-cause mortality (Cox, Table 3), CVD- and cancer-mortality (Fine–Gray COMPETING-RISK subdistribution models, supplementary Tables 9/10). Referent = most-active PA group (G1) × lowest-adiposity cell. BMI <18.5 EXCLUDED at baseline (illness-related weight loss, with chronic conditions and pregnancy); follow-up began 2 y after baseline; prevalent cancer/CVD excluded. No significant multiplicative interactions (likelihood-ratio P>0.18, Model 3). High PA attenuates but does not eliminate high-adiposity risk (at BMI ≥35 no attenuation: G1 1.45 vs G3 1.52). Never-smoker restriction (n=168,654, supplementary Table 6) attenuates most cells to NS (0.75–1.11) — smoking is a major confounder of the PA×adiposity association. Model 3 adjusts for diet pattern (red/processed meat, fish, fruit+veg), salt, alcohol, smoking, screen time, depression, diabetes, hypertension, statins — diet IS adjusted, so ρ(mayoCells, dietScore) ≈ 0. PA = self-reported MET-min/wk quintiles collapsed to G1 (Q4+Q5, medians ≈2,800–3,700 MET-min/wk), G2 (Q2+Q3, ≈925–2,230), G3 (Q1, ≈340–490) — UK Biobank self-report overreports vs harmonised scales; our model maps these RANK-preserving onto the Ekelund cutoffs (see the mayoCells note). Body-fat % groups are sex-specific distribution-matched quartiles — NO % cutoffs published (our axis uses a disclosed translation, Deurenberg 1991).',
    },
    weeldreyer2025: {
      authors: 'Weeldreyer NR, De Guzman JC, Paterson C, Allen JD, Gaesser GA, Angadi SS',
      year: 2025,
      title: 'Cardiorespiratory fitness, body mass index and mortality: a systematic review and meta-analysis',
      journal: 'British Journal of Sports Medicine, 59(5):339–346',
      url: 'https://doi.org/10.1136/bjsports-2024-108748',
      pmid: '39537313',
      note: 'Open access (PMC11874340). Systematic review + meta-analysis of prospective cohorts with MEASURED cardiorespiratory fitness (maximal/VO2peak exercise tests): 20 studies, 398,716 observations, three-level REML random-effects + robust variance estimation (conservative SEs). Fit = top CRF group per study, unfit = bottom (often merely >20th percentile of age-adjusted CRF — a modest bar). Referent normal-weight fit: unfit ≈2× all-cause mortality and ~2–3× CVD at ANY BMI (normal-weight-unfit 1.92, obese-unfit 2.04 all-cause); fit at any BMI ≈ normal-weight fit (0.96–1.11, all NS) — measured fitness ABSORBS the BMI association. CVD attenuated but not eliminated (fit cells 1.50/1.62, NS). CVD obese-unfit cell fragile (sensitivity analysis). Mostly US/Caucasian, 67% male, mean age 42–64, includes clinical populations.',
    },
    blochibenfeldt2025: {
			authors: 'Bloch-Ibenfeldt M, Gates A, Joergensen N, Linneberg A, et al.',
			year: 2025,
			title: 'Heavy resistance training provides short-term benefits on bone formation in well-functioning older adults',
			journal: 'Bone Journal',
			url: 'https://doi.org/10.1016/j.bone.2025.117393',
			pmid: '38911477',
    },
    arem2015: {
      authors: 'Arem H, Moore SC, Patel A, et al.',
      year: 2015,
      title: 'Leisure time physical activity and mortality: a detailed pooled analysis of the dose-response relationship',
      journal: 'JAMA Internal Medicine, 175(6):959–967',
      url: 'https://doi.org/10.1001/jamainternmed.2015.0533',
      pmid: '25844730',
    },
    moore2012: {
      authors: 'Moore SC, Patel AV, Matthews CE, et al.',
      year: 2012,
      title: 'Leisure time physical activity of moderate to vigorous intensity and mortality: a large pooled cohort analysis',
      journal: 'PLoS Medicine, 9(11):e1001335',
      url: 'https://doi.org/10.1371/journal.pmed.1001335',
      pmid: '23139642',
    },
    cappuccio2011: {
      authors: 'Cappuccio FP, Cooper D, D’Elia L, Strazzullo P, Miller MA',
      year: 2011,
      title: 'Sleep duration predicts cardiovascular outcomes: a systematic review and meta-analysis of prospective studies',
      journal: 'European Heart Journal, 32(12):1484–1492',
      url: 'https://doi.org/10.1093/eurheartj/ehr007',
      pmid: '21300732',
    },
    cappuccio2010: {
      authors: 'Cappuccio FP, D’Elia L, Strazzullo P, Miller MA',
      year: 2010,
      title: 'Sleep duration and all-cause mortality: a systematic review and meta-analysis of prospective studies',
      journal: 'Sleep, 33(5):585–592',
      url: 'https://doi.org/10.1093/sleep/33.5.585',
      pmid: '20469800',
    },
    wood2018: {
      authors: 'Wood AM, Kaptoge S, Butterworth AS, et al.',
      year: 2018,
      title: 'Risk thresholds for alcohol consumption: combined analysis of individual-participant data for 599,912 current drinkers in 83 prospective studies',
      journal: 'The Lancet, 391(10129):1513–1523',
      url: 'https://doi.org/10.1016/S0140-6736(18)30134-X',
      pmid: '29676281',
    },
    jha2013: {
      authors: 'Jha P, Ramasundarahettige C, Landsman V, et al.',
      year: 2013,
      title: '21st-century hazards of smoking and benefits of cessation in the United States',
      journal: 'New England Journal of Medicine, 368(4):341–350',
      url: 'https://doi.org/10.1056/NEJMsa1211128',
      pmid: '23343063',
    },
    xie2024: {
      authors: 'Xie W, Berlowitz JB, Raquib R, Harlow AF, Benjamin EJ, Bhatnagar A, Stokes AC',
      year: 2024,
      title: 'Association of cigarette and electronic cigarette use patterns with all-cause mortality: a national cohort study of 145,390 US adults',
      journal: 'Preventive Medicine, 182:107943',
      url: 'https://doi.org/10.1016/j.ypmed.2024.107943',
      pmid: '38552720',
    },
    berlowitz2022: {
      authors: 'Berlowitz JB, Xie W, Harlow AF, Hamburg NM, Blaha MJ, Bhatnagar A, Benjamin EJ, Stokes AC',
      year: 2022,
      title: 'E-cigarette use and risk of cardiovascular disease: a longitudinal analysis of the PATH Study, 2013-2019',
      journal: 'Circulation, 145(20):1557–1559',
      url: 'https://doi.org/10.1161/CIRCULATIONAHA.121.057369',
      pmid: '35514292',
    },
    kundu2025: {
      authors: 'Kundu A, Sachdeva K, Feore A, Sanchez S, Sutton M, Seth S, Schwartz R, Chaiton M',
      year: 2025,
      title: 'Evidence update on the cancer risk of vaping e-cigarettes: a systematic review',
      journal: 'Tobacco Induced Diseases',
      url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11773639/',
      pmid: '39877383',
    },
    novak2024: {
      authors: 'Novak ML, Wang GY',
      year: 2024,
      title: 'The effect of e-cigarettes on cognitive function: a scoping review',
      journal: 'Psychopharmacology',
      url: 'https://doi.org/10.1007/s00213-024-06607-8',
      pmid: '38724716',
    },
    kang2024: {
      authors: 'Kang W, Malvaso A',
      year: 2024,
      title: 'Understanding the longitudinal associations between e-cigarette use and general mental health, social dysfunction and anhedonia, depression and anxiety, and loss of confidence in a sample from the UK: A linear mixed effect examination',
      journal: 'Journal of Affective Disorders, 346:200–205',
      url: 'https://doi.org/10.1016/j.jad.2023.11.013',
      pmid: '37956830',
    },
    diangelantonio2016: {
      authors: 'Global BMI Mortality Collaboration (Di Angelantonio E, et al.)',
      year: 2016,
      title: 'Body-mass index and all-cause mortality: individual-participant-data meta-analysis of 239 prospective studies in four continents',
      journal: 'The Lancet, 388(10046):776–786',
      url: 'https://doi.org/10.1016/S0140-6736(16)30175-1',
      pmid: '27423262',
    },
    chekroud2018: {
      authors: 'Chekroud SR, Gueorguieva R, Zheutlin AB, et al.',
      year: 2018,
      title: 'Association between physical exercise and mental health in 1.2 million individuals in the USA between 2011 and 2015: a cross-sectional study',
      journal: 'The Lancet Psychiatry, 5(9):739–746',
      url: 'https://doi.org/10.1016/S2215-0366(18)30227-X',
      pmid: '30099000',
    },
    holtlunstad2010: {
      authors: 'Holt-Lunstad J, Smith TB, Layton JB',
      year: 2010,
      title: 'Social relationships and mortality risk: a meta-analytic review',
      journal: 'PLoS Medicine, 7(7):e1000316',
      url: 'https://doi.org/10.1371/journal.pmed.1000316',
      pmid: '20668659',
    },
    poole2017: {
      authors: 'Poole R, Kennedy OJ, Roderick P, Fallowfield JA, Hayes PC, Parkes J',
      year: 2017,
      title: 'Coffee consumption and health: umbrella review of meta-analyses of multiple health outcomes',
      journal: 'BMJ, 359:j5024',
      url: 'https://doi.org/10.1136/bmj.j5024',
      pmid: '29167102',
    },
    laukkanen2015: {
      authors: 'Laukkanen T, Khan H, Zaccardi F, Laukkanen JA',
      year: 2015,
      title: 'Association between sauna bathing and fatal cardiovascular and all-cause mortality events',
      journal: 'JAMA Internal Medicine, 175(4):542–548',
      url: 'https://doi.org/10.1001/jamainternmed.2014.8187',
      pmid: '25705824',
    },
    avgerinos2018: {
      authors: 'Avgerinos KI, Spyrou N, Bougioukas KI, Kapogiannis D',
      year: 2018,
      title: 'Effects of creatine supplementation on cognitive function of healthy individuals: a systematic review of randomized controlled trials',
      journal: 'Experimental Gerontology, 108:166–173',
      url: 'https://doi.org/10.1016/j.exger.2018.04.013',
      pmid: '29704637',
    },
    wang2014: {
      authors: 'Wang X, Ouyang Y, Liu J, Zhu M, Zhao G, Bao W, Hu FB',
      year: 2014,
      title: 'Fruit and vegetable consumption and mortality from all causes, cardiovascular disease, and cancer: systematic review and dose-response meta-analysis of prospective cohort studies',
      journal: 'BMJ, 349:g4490',
      url: 'https://doi.org/10.1136/bmj.g4490',
      pmid: '25073782',
    },
    russ2012: {
      authors: 'Russ TC, Stamatakis E, Hamer M, Starr JM, Kivimäki M, Batty GD',
      year: 2012,
      title: 'Association between psychological distress and mortality: individual participant pooled analysis of 10 prospective cohort studies',
      journal: 'BMJ, 345:e4933',
      url: 'https://doi.org/10.1136/bmj.e4933',
      pmid: '22849956',
    },
    gordon2018: {
      authors: 'Gordon BR, McDowell CP, Hallgren M, Meyer JD, Lyons M, Herring MP',
      year: 2018,
      title: 'Association of efficacy of resistance exercise training with depressive symptoms: meta-analysis and meta-regression analysis of randomized clinical trials',
      journal: 'JAMA Psychiatry, 75(6):566–576',
      url: 'https://doi.org/10.1001/jamapsychiatry.2018.0572',
      pmid: '29800984',
    },
    erickson2011: {
      authors: 'Erickson KI, Voss MW, Prakash RS, et al.',
      year: 2011,
      title: 'Exercise training increases size of hippocampus and improves memory',
      journal: 'PNAS, 108(7):3017–3022',
      url: 'https://doi.org/10.1073/pnas.1015950108',
      pmid: '21282661',
    },
    nchs2023: {
      authors: 'Murphy SL, Kochanek KD, Xu JQ, Arias E. (National Center for Health Statistics)',
      year: 2024,
      title: 'Mortality in the United States, 2023 — life expectancy at birth 78.4 (male 75.8, female 81.1)',
      journal: 'NCHS Data Brief, no 521. Hyattsville, MD: National Center for Health Statistics. December 2024. DOI: 10.15620/cdc/170564',
      url: 'https://stacks.cdc.gov/view/cdc/170564',
      pmid: null,
    },
    kodama2009: {
      authors: 'Kodama S, Saito K, Tanaka S, et al.',
      year: 2009,
      title: 'Cardiorespiratory fitness as a quantitative predictor of all-cause mortality and cardiovascular events in healthy men and women: a meta-analysis',
      journal: 'JAMA, 301(19):2024–2035',
      url: 'https://doi.org/10.1001/jama.2009.681',
      pmid: '19454641',
    },
    mandsager2018: {
      authors: 'Mandsager K, Harb S, Cremer P, Phelan D, Nissen SE, Jaber W',
      year: 2018,
      title: 'Association of cardiorespiratory fitness with long-term mortality among adults undergoing exercise treadmill testing',
      journal: 'JAMA Network Open, 1(6):e183605',
      url: 'https://doi.org/10.1001/jamanetworkopen.2018.3605',
      pmid: '30646252',
    },
    jayedi2022: {
      authors: 'Jayedi A, Khan TA, Aune D, Emadi A, Shab-Bidar S',
      year: 2022,
      title: 'Body fat and risk of all-cause mortality: a systematic review and dose-response meta-analysis of prospective cohort studies',
      journal: 'International Journal of Obesity, 46(9):1573–1581',
      url: 'https://doi.org/10.1038/s41366-022-01165-5',
      pmid: '35717418',
    },
    byhamre2021: {
      authors: 'Byhamre ML, Araghi M, Alfredsson L, et al.',
      year: 2021,
      title: 'Swedish snus use is associated with mortality: a pooled analysis of eight prospective studies',
      journal: 'International Journal of Epidemiology, 49(6):2041–2050',
      url: 'https://doi.org/10.1093/ije/dyaa197',
      pmid: '33347584',
    },
    sidney1997: {
      authors: 'Sidney S, Beck JE, Tekawa IS, Quesenberry CP, Friedman GD',
      year: 1997,
      title: 'Marijuana use and mortality',
      journal: 'American Journal of Public Health, 87(4):585–590',
      url: 'https://doi.org/10.2105/AJPH.87.4.585',
      pmid: '9146436',
    },
    fang2016: {
      authors: 'Fang X, Wang K, Han D, et al.',
      year: 2016,
      title: 'Dietary magnesium intake and the risk of cardiovascular disease, type 2 diabetes, and all-cause mortality: a dose-response meta-analysis of prospective cohort studies',
      journal: 'BMC Medicine, 14(1):210',
      url: 'https://doi.org/10.1186/s12916-016-0742-z',
      pmid: '27927203',
    },
    houston2018: {
      authors: 'Houston BL, Hurrie D, Graham J, et al.',
      year: 2018,
      title: 'Efficacy of iron supplementation on fatigue and physical capacity in non-anaemic iron-deficient adults: a systematic review of randomised controlled trials',
      journal: 'BMJ Open, 8(4):e019240',
      url: 'https://doi.org/10.1136/bmjopen-2017-019240',
      pmid: '29626044',
    },
    coenen2018: {
      authors: 'Coenen P, Huysmans MA, Holtermann A, et al.',
      year: 2018,
      title: 'Do highly physically active workers die early? A systematic review with meta-analysis of data from 193,696 participants',
      journal: 'British Journal of Sports Medicine, 52(20):1320–1326',
      url: 'https://doi.org/10.1136/bjsports-2017-098540',
      pmid: '29760168',
    },
    grosso2016: {
      authors: 'Grosso G, Micek A, Godos J, et al.',
      year: 2016,
      title: 'Coffee consumption and risk of all-cause, cardiovascular, and cancer mortality in smokers and non-smokers: a dose-response meta-analysis',
      journal: 'European Journal of Epidemiology, 31(12):1191–1205',
      url: 'https://doi.org/10.1007/s10654-016-0202-2',
      pmid: '27699514',
    },
    cillekens2022: {
      authors: 'Cillekens B, Huysmans MA, Holtermann A, et al.',
      year: 2022,
      title: 'Physical activity at work may not be health enhancing. A systematic review with meta-analysis on the association between occupational physical activity and cardiovascular disease mortality covering 23 studies with 655,892 participants',
      journal: 'Scandinavian Journal of Work, Environment & Health, 48(2):86–98',
      url: 'https://doi.org/10.5271/sjweh.3993',
      pmid: '34656067',
    },
    dalene2021: {
      authors: 'Dalene KE, Tarp J, Selmer RM, et al.',
      year: 2021,
      title: 'Occupational physical activity and longevity in working men and women in Norway: a prospective cohort study',
      journal: 'The Lancet Public Health, 6(6):e386–e395',
      url: 'https://doi.org/10.1016/S2468-2667(21)00032-3',
      pmid: '33932334',
    },
    moore2007: {
      authors: 'Moore TH, Zammit S, Lingford-Hughes A, et al.',
      year: 2007,
      title: 'Cannabis use and risk of psychotic or affective mental health outcomes: a systematic review',
      journal: 'The Lancet, 370(9584):319–328',
      url: 'https://doi.org/10.1016/S0140-6736(07)61162-3',
      pmid: '17662880',
    },
    schottker2014: {
      authors: 'Schöttker B, Jorde R, Peasey A, et al.',
      year: 2014,
      title: 'Vitamin D and mortality: meta-analysis of individual participant data from a large consortium of cohort studies from Europe and the United States',
      journal: 'BMJ, 348:g3656',
      url: 'https://doi.org/10.1136/bmj.g3656',
      pmid: '24938302',
    },
    manson2019: {
      authors: 'Manson JE, Cook NR, Lee IM, et al. (VITAL Research Group)',
      year: 2019,
      title: 'Vitamin D supplements and prevention of cancer and cardiovascular disease',
      journal: 'New England Journal of Medicine, 380(1):33–44',
      url: 'https://doi.org/10.1056/NEJMoa1809944',
      pmid: '30415629',
    },
    edwards2017: {
      authors: 'Edwards JD, Xu H, Clark DO, Guey LT, Ross LA, Unverzagt FW',
      year: 2017,
      title: 'Speed of processing training results in lower risk of dementia',
      journal: 'Alzheimer’s & Dementia: Translational Research & Clinical Interventions, 3(4):603–611',
      url: 'https://doi.org/10.1016/j.trci.2017.09.002',
      pmid: '29201994',
    },
    goyal2014: {
      authors: 'Goyal M, Singh S, Sibinga EM, et al.',
      year: 2014,
      title: 'Meditation programs for psychological stress and well-being: a systematic review and meta-analysis',
      journal: 'JAMA Internal Medicine, 174(3):357–368',
      url: 'https://doi.org/10.1001/jamainternmed.2013.13018',
      pmid: '24395196',
    },
    pan2012: {
      authors: 'Pan A, Sun Q, Bernstein AM, et al.',
      year: 2012,
      title: 'Red meat consumption and mortality: results from 2 prospective cohort studies',
      journal: 'Archives of Internal Medicine, 172(7):555–563',
      url: 'https://doi.org/10.1001/archinternmed.2011.2287',
      pmid: '22412075',
    },
    malik2019: {
      authors: 'Malik VS, Li Y, Pan A, et al.',
      year: 2019,
      title: 'Long-term consumption of sugar-sweetened and artificially sweetened beverages and risk of mortality in US adults',
      journal: 'Circulation, 139(18):2113–2125',
      url: 'https://doi.org/10.1161/CIRCULATIONAHA.118.037401',
      pmid: '30882235',
    },
    kwok2019: {
      authors: 'Kwok CS, Gulati M, Michos ED, et al.',
      year: 2019,
      title: 'Dietary components and risk of cardiovascular disease and all-cause mortality: a review of evidence from meta-analyses',
      journal: 'European Journal of Preventive Cardiology, 26(13):1415–1429',
      url: 'https://doi.org/10.1177/2047487319843667',
      pmid: '30971126',
    },
    jayedi2018: {
      authors: 'Jayedi A, Shab-Bidar S, Eimeri S, Djafarian K',
      year: 2018,
      title: 'Fish consumption and risk of all-cause and cardiovascular mortality: a dose-response meta-analysis of prospective observational studies',
      journal: 'Public Health Nutrition, 21(7):1297–1306',
      url: 'https://doi.org/10.1017/S1368980017003834',
      pmid: '29317009',
    },
    zhang2018: {
      authors: 'Zhang Y, Zhuang P, He W, Chen J, Wang W, Freedman ND, Abnet CC, Wang J, Jiao J',
      year: 2018,
      title: 'Association of fish and long-chain omega-3 fatty acids intakes with total and cause-specific mortality: prospective analysis of 421,309 individuals',
      journal: 'Journal of Internal Medicine, 284(4):399–417',
      url: 'https://doi.org/10.1111/joim.12786',
      pmid: '30019399',
    },
    manson2019omega3: {
      authors: 'Manson JE, Cook NR, Lee IM, et al. (VITAL Research Group)',
      year: 2019,
      title: 'Marine n-3 fatty acids and prevention of cardiovascular disease and cancer',
      journal: 'New England Journal of Medicine, 380(1):23–32',
      url: 'https://doi.org/10.1056/NEJMoa1811403',
      pmid: '30415637',
    },
    biswas2015: {
      authors: 'Biswas A, Oh PI, Faulkner GE, et al.',
      year: 2015,
      title: 'Sedentary time and its association with risk for disease incidence, mortality, and hospitalization in adults: a systematic review and meta-analysis',
      journal: 'Annals of Internal Medicine, 162(2):123–132',
      url: 'https://doi.org/10.7326/M14-1651',
      pmid: '25599350',
    },
    cohen2016: {
      authors: 'Cohen R, Bavishi C, Rozanski A',
      year: 2016,
      title: 'Purpose in life and its relationship to all-cause mortality and cardiovascular events: a meta-analysis',
      journal: 'Psychosomatic Medicine, 78(2):122–133',
      url: 'https://doi.org/10.1097/PSY.0000000000000274',
      pmid: '26630073',
    },
    leong2015: {
      authors: 'Leong DP, Teo KK, Rangarajan S, et al. (PURE Study)',
      year: 2015,
      title: 'Prognostic value of grip strength: findings from the Prospective Urban Rural Epidemiology (PURE) study',
      journal: 'The Lancet, 386(9990):266–273',
      url: 'https://doi.org/10.1016/S0140-6736(14)62000-6',
      pmid: '25982160',
    },
    thun2013: {
      authors: 'Thun MJ, Carter BD, Feskanich D, et al.',
      year: 2013,
      title: '50-year trends in smoking-related mortality in the United States',
      journal: 'New England Journal of Medicine, 368(4):351–364',
      url: 'https://doi.org/10.1056/NEJMsa1211127',
      pmid: '23343064',
    },
    reynolds2019: {
      authors: 'Reynolds A, Mann J, Cummings J, Winter N, Mete E, Te Morenga L',
      year: 2019,
      title: 'Carbohydrate quality and human health: a series of systematic reviews and meta-analyses',
      journal: 'The Lancet, 393(10170):434–445',
      url: 'https://doi.org/10.1016/S0140-6736(18)31809-9',
      pmid: '30638909',
    },
    howe2011: {
      authors: 'Howe TE, Shea B, Dawson LJ, et al.',
      year: 2011,
      title: 'Exercise for preventing and treating osteoporosis in postmenopausal women',
      journal: 'Cochrane Database of Systematic Reviews, 2011(7):CD000333',
      url: 'https://doi.org/10.1002/14651858.CD000333.pub2',
      pmid: '21735380',
    },
    sherrington2019: {
      authors: 'Sherrington C, Fairhall NJ, Wallbank GK, et al.',
      year: 2019,
      title: 'Exercise for preventing falls in older people living in the community',
      journal: 'Cochrane Database of Systematic Reviews, 2019(1):CD012424',
      url: 'https://doi.org/10.1002/14651858.CD012424.pub2',
      pmid: '30703272',
    },
    rong2016: {
      authors: 'Rong K, Liu XY, Wu XH, Li XL, Xia QQ, Chen J, Yin XF',
      year: 2016,
      title: 'Increasing level of leisure physical activity could reduce the risk of hip fracture in older women: a dose-response meta-analysis of prospective cohort studies',
      journal: 'Medicine (Baltimore), 95(11):e2984',
      url: 'https://doi.org/10.1097/MD.0000000000002984',
      pmid: '26986111',
    },
    gbd2016: {
      authors: 'GBD 2016 Alcohol Collaborators',
      year: 2018,
      title: 'Alcohol use and burden for 195 countries and territories, 1990–2016: a systematic analysis for the Global Burden of Disease Study 2016',
      journal: 'The Lancet, 392(10152):1015–1035',
      url: 'https://doi.org/10.1016/S0140-6736(18)31310-2',
      pmid: '30146330',
    },
    aune2016nuts: {
      authors: 'Aune D, Keum N, Giovannucci E, et al.',
      year: 2016,
      title: 'Nut consumption and risk of cardiovascular disease, total cancer, all-cause and cause-specific mortality: a systematic review and dose-response meta-analysis of prospective studies',
      journal: 'BMC Medicine, 14(1):207',
      url: 'https://doi.org/10.1186/s12916-016-0730-3',
      pmid: '27916000',
    },
    aune2016grain: {
      authors: 'Aune D, Keum N, Giovannucci E, et al.',
      year: 2016,
      title: 'Whole grain consumption and risk of cardiovascular disease, cancer, and all cause and cause specific mortality: systematic review and dose-response meta-analysis of prospective studies',
      journal: 'BMJ, 353:i2716',
      url: 'https://doi.org/10.1136/bmj.i2716',
      pmid: '27301975',
    },
    aune2017rhr: {
      authors: 'Aune D, Sen A, ó’Hartaigh B, Janszky I, Romundstad PR, Tonstad S, Vatten LJ',
      year: 2017,
      title: 'Resting heart rate and the risk of cardiovascular disease, total cancer, and all-cause mortality: a systematic review and dose-response meta-analysis of prospective studies',
      journal: 'Nutrition, Metabolism and Cardiovascular Diseases, 27(6):504–517',
      url: 'https://doi.org/10.1016/j.numecd.2017.04.004',
      pmid: '28552551',
    },
    windred2024: {
      authors: 'Windred DP, Burns AC, Lane JM, Saxena R, Rutter MK, Cain SW, Phillips AJK',
      year: 2024,
      title: 'Sleep regularity is a stronger predictor of mortality risk than sleep duration: a prospective cohort study',
      journal: 'Sleep, 47(1):zsad253',
      url: 'https://doi.org/10.1093/sleep/zsad253',
      pmid: '37738616',
    },
    orellano2024: {
      authors: 'Orellano P, Kasdagli MI, Pérez Velasco R, Samoli E',
      year: 2024,
      title: 'Long-term exposure to particulate matter and mortality: an update of the WHO global air quality guidelines systematic review and meta-analysis',
      journal: 'International Journal of Public Health, 69:1607683',
      url: 'https://doi.org/10.3389/ijph.2024.1607683',
      pmid: '39399882',
    },
    di2017: {
      authors: 'Di Q, Wang Y, Zanobetti A, Wang Y, Koutrakis P, Choirat C, Dominici F, Schwartz JD',
      year: 2017,
      title: 'Air pollution and mortality in the Medicare population',
      journal: 'New England Journal of Medicine, 376(26):2513–2522',
      url: 'https://doi.org/10.1056/NEJMoa1702747',
      pmid: '28657878',
    },
    hunt2018: {
      authors: 'Hunt MG, Marx R, Lipson C, Young J',
      year: 2018,
      title: 'No More FOMO: limiting social media decreases loneliness and depression',
      journal: 'Journal of Social and Clinical Psychology, 37(10):751–768',
      url: 'https://doi.org/10.1521/jscp.2018.37.10.751',
      pmid: null,
    },
    allcott2020: {
      authors: 'Allcott H, Braghieri L, Eichmeyer S, Gentzkow M',
      year: 2020,
      title: 'The welfare effects of social media',
      journal: 'American Economic Review, 110(3):629–676',
      url: 'https://doi.org/10.1257/aer.20190658',
      pmid: null,
    },
    zhai2015: {
      authors: 'Zhai L, Zhang Y, Zhang D',
      year: 2015,
      title: 'Sedentary behaviour and the risk of depression: a meta-analysis',
      journal: 'British Journal of Sports Medicine, 49(11):705–709',
      url: 'https://doi.org/10.1136/bjsports-2014-093613',
      pmid: '25183627',
    },
    stamatakis2011: {
      authors: 'Stamatakis E, Hamer M, Dunstan DW',
      year: 2011,
      title: 'Screen-based entertainment time, all-cause mortality, and cardiovascular events: population-based study with ongoing mortality and hospital events follow-up',
      journal: 'Journal of the American College of Cardiology, 57(3):292–299',
      url: 'https://doi.org/10.1016/j.jacc.2010.05.065',
      pmid: '21232666',
    },
    celis2018: {
      authors: 'Celis-Morales CA, Lyall DM, Steell L, et al.',
      year: 2018,
      title: 'Associations of discretionary screen time with mortality, cardiovascular disease and cancer are attenuated by strength, fitness and physical activity: findings from the UK Biobank study',
      journal: 'BMC Medicine, 16(1):97',
      url: 'https://doi.org/10.1186/s12916-018-1063-1',
      pmid: '29792209',
    },
    hale2015: {
      authors: 'Hale L, Guan S',
      year: 2015,
      title: 'Screen time and sleep among school-aged children and adolescents: a systematic literature review',
      journal: 'Sleep Medicine Reviews, 21:50–58',
      url: 'https://doi.org/10.1016/j.smrv.2014.07.007',
      pmid: '25193149',
    },
    nielsenGauge2024: {
      authors: 'Nielsen',
      year: 2024,
      title: 'The Gauge (TV usage): US adults average roughly 3–4 h/day of TV viewing across broadcast, cable and streaming (≈3.5 h/day for ages 18–34, ≈6.5 h/day for 65+)',
      journal: 'Nielsen media measurement data, 2024–2025',
      url: 'https://www.nielsen.com/data-center/the-gauge/',
      pmid: null,
    },
    datareportal2025: {
      authors: 'Kemp S',
      year: 2025,
      title: 'Digital 2025: United States of America (GWI survey data: ~2 h/day on social media; global average 2 h 21 min/day)',
      journal: 'DataReportal / Kepios',
      url: 'https://datareportal.com/reports/digital-2025-united-states-of-america',
      pmid: null,
    },
    orben2019: {
      authors: 'Orben A, Przybylski AK',
      year: 2019,
      title: 'The association between adolescent well-being and digital technology use',
      journal: 'Nature Human Behaviour, 3(2):173–182',
      url: 'https://doi.org/10.1038/s41562-018-0506-1',
      pmid: '30944443',
    },
     twenge2018: {
      authors: 'Twenge JM, Campbell WK',
      year: 2018,
      title: 'Associations between screen time and lower psychological well-being among children and adolescents: evidence from a population-based study',
      journal: 'Preventive Medicine Reports, 12:271–283',
      url: 'https://doi.org/10.1016/j.pmedr.2018.10.003',
      pmid: '30406005',
    },
    lancet2025steps: {
      authors: 'Liu F, Ding C, Zhu Z, et al. (Lancet Public Health 2025 Step Count Collaboration)',
      year: 2025,
      title: 'Daily steps and health outcomes in adults: a systematic review and dose-response meta-analysis',
      journal: 'The Lancet Public Health, 10(8):e668–e681',
      url: 'https://doi.org/10.1016/S2468-2667(25)00164-1',
      pmid: '40713949',
    },
    banach2023: {
      authors: 'Banach M, Lewek J, Surma S, Penson PE, Sahebkar A, Martin SS, et al.',
      year: 2023,
      title: 'The association between daily step count and all-cause and cardiovascular mortality: a meta-analysis',
      journal: 'European Journal of Preventive Cardiology, 30(18):1975–1985',
      url: 'https://doi.org/10.1093/eurjpc/zwad229',
      pmid: '37555441',
    },
    stevenson2024: {
      authors: 'Stevenson AC, Clemens T, Pairo-Castineira E, Webb DJ, Weller RB, Dibben C',
      year: 2024,
      title: 'Higher ultraviolet light exposure is associated with lower mortality: an analysis of data from the UK Biobank cohort study',
      journal: 'Health & Place, 89:103328',
      url: 'https://doi.org/10.1016/j.healthplace.2024.103328',
      pmid: '39094281',
    },
    sunbeem2026: {
      authors: 'Gu J, Stevenson AC, Brady AR, Cowan GJM, Dibben C, Weller RB',
      year: 2026,
      title: 'Risk–benefit balance of habitual ultraviolet exposure for cardiovascular, cancer, and skin cancer mortality: UK Biobank cohort study',
      journal: 'medRxiv preprint 2026.01.08.26343592 (not peer-reviewed)',
      url: 'https://doi.org/10.64898/2026.01.08.26343592',
      pmid: null,
    },
    adventist2025: {
      authors: 'Nazeeh N, Orlich MJ, Segovia-Siapco G, Fraser GE, Shavlik D',
      year: 2025,
      title: 'The association between time spent outdoors during daylight and mortality among participants of the Adventist Health Study 2 cohort',
      journal: 'Environmental Epidemiology, 9(3):e401',
      url: 'https://doi.org/10.1097/EE9.0000000000000401',
      pmid: '40444275',
    },
    mahamat2020: {
      authors: 'Mahamat-Saleh Y, Aune D, Schlesinger S',
      year: 2020,
      title: '25-Hydroxyvitamin D status, vitamin D intake, and skin cancer risk: a systematic review and dose-response meta-analysis of prospective studies',
      journal: 'Scientific Reports, 10:13151',
      url: 'https://doi.org/10.1038/s41598-020-70078-y',
      pmid: '32753685',
    },
    lindqvist2014: {
      authors: 'Lindqvist PG, Epstein E, Landin-Olsson M, et al.',
      year: 2014,
      title: 'Avoidance of sun exposure is a risk factor for all-cause mortality: results from the Melanoma in Southern Sweden cohort',
      journal: 'Journal of Internal Medicine, 276(1):77–86',
      url: 'https://doi.org/10.1111/joim.12251',
      pmid: '24697969',
    },
    li2016fish: {
      authors: 'Li F, Liu X, Zhang D',
      year: 2016,
      title: 'Fish consumption and risk of depression: a meta-analysis',
      journal: 'Journal of Epidemiology & Community Health, 70(3):299–304',
      url: 'https://doi.org/10.1136/jech-2015-206278',
      pmid: '26359502',
    },
    // --- Sources added 2026-07-29 to replace indirect citations ---
    ocean2019: {
      authors: 'Ocean N, Howley P, Ensor J',
      year: 2019,
      title: 'Lettuce be happy: A longitudinal UK study on the relationship between fruit and vegetable consumption and well-being',
      journal: 'Social Science & Medicine, 222:335–345',
      url: 'https://doi.org/10.1016/j.socscimed.2018.12.012',
      pmid: '30606639',
    },
    coelhojunior2020: {
      authors: 'Coelho-Junior HJ, Uchida MC, Gonçalves IO, et al.',
      year: 2020,
      title: 'Resistance training improves cognitive function in older adults with different cognitive status: a systematic review and meta-analysis',
      journal: 'Aging & Mental Health, 26(2):213–225',
      url: 'https://doi.org/10.1080/13607863.2020.1857691',
      pmid: '33295791',
    },
    mewton2023: {
      authors: 'Mewton L, Visontay R, Hoy N, et al.',
      year: 2023,
      title: 'The relationship between alcohol use and dementia in adults aged more than 60 years: a combined analysis of prospective, individual-participant data from 15 international studies',
      journal: 'Addiction, 118(3):517–528',
      url: 'https://doi.org/10.1111/add.16035',
      pmid: '36161770',
    },
    baumberg2016: {
      authors: 'Baumberg B, MacKerron G',
      year: 2016,
      title: 'Can alcohol make you happy? A subjective wellbeing approach',
      journal: 'Social Science & Medicine, 156:184–195',
      url: 'https://doi.org/10.1016/j.socscimed.2016.03.034',
      pmid: '27046649',
    },
    anstey2007: {
      authors: 'Anstey KJ, von Sanden C, Salim A, O\'Kearney R',
      year: 2007,
      title: 'Smoking as a risk factor for dementia and cognitive decline: a meta-analysis of prospective studies',
      journal: 'American Journal of Epidemiology, 166(4):367–378',
      url: 'https://doi.org/10.1093/aje/kwm116',
      pmid: '17573335',
    },
    lappan2020: {
      authors: 'Lappan S, Thorne CB, Long DM, Hendricks PS',
      year: 2020,
      title: 'Longitudinal and reciprocal relationships between psychological well-being and smoking',
      journal: 'Nicotine & Tobacco Research, 22(1):18–26',
      url: 'https://doi.org/10.1093/ntr/nty185',
      pmid: '30239820',
    },
    lowe2017: {
      authors: 'Lowe CJ, Safati A, Hall PA',
      year: 2017,
      title: 'The neurocognitive consequences of sleep restriction: a meta-analytic review',
      journal: 'Neuroscience & Biobehavioral Reviews, 80:586–603',
      url: 'https://doi.org/10.1016/j.neubiorev.2017.07.010',
      pmid: '28757454',
    },
    bacaro2023: {
      authors: 'Bacaro V, Miletic K, Crocetti E',
      year: 2023,
      title: 'A meta-analysis of longitudinal studies on the interplay between sleep, mental health, and positive well-being in adolescents',
      journal: 'International Journal of Clinical and Health Psychology, 24(1):100424',
      url: 'https://doi.org/10.1016/j.ijchp.2023.100424',
      pmid: '38125984',
    },
    franks2021: {
      authors: 'Franks KH, Rowsthorn E, Bransby L, Lim YY, Chong TTJ, Pase MP',
      year: 2021,
      title: 'Association of stress with risk of dementia and mild cognitive impairment: a systematic review and meta-analysis',
      journal: 'Journal of Alzheimer\'s Disease, 82(4):1573–1590',
      url: 'https://doi.org/10.3233/JAD-210094',
      pmid: '34366334',
    },
    aggarwal2014: {
      authors: 'Aggarwal NT, Wilson RS, Beck TL, et al.',
      year: 2014,
      title: 'Perceived stress and change in cognitive function among adults aged 65 and older',
      journal: 'Psychosomatic Medicine, 76(1):80–85',
      url: 'https://doi.org/10.1097/PSY.0000000000000016',
      pmid: '24367123',
    },
    maartense2024: {
      authors: 'Maartense I, van Duijnhoven J, Smolders K, de Kort Y',
      year: 2024,
      title: 'The effect of light on wellbeing: a systematic review and meta-analysis',
      journal: 'Journal of Happiness Studies, 25:108',
      url: 'https://doi.org/10.1007/s10902-024-00838-4',
      pmid: '39664799',
    },
    zhang2024vitd: {
      authors: 'Zhang XX, Yang YY, Liu D, et al.',
      year: 2024,
      title: 'Association of vitamin D levels with risk of cognitive impairment and dementia: a systematic review and meta-analysis of prospective studies',
      journal: 'Journal of Alzheimer\'s Disease, 99(1):31–45',
      url: 'https://doi.org/10.3233/JAD-231381',
      pmid: '38461506',
    },
    falkingham2010: {
      authors: 'Falkingham M, Abdelhamid A, Curtis P, et al.',
      year: 2010,
      title: 'The effects of oral iron supplementation on cognition in older children and adults: a systematic review and meta-analysis',
      journal: 'Nutrition Journal, 9:4',
      url: 'https://doi.org/10.1186/1475-2891-9-4',
      pmid: '20100340',
    },
    gronkjaer2022: {
      authors: 'Grønkjær M, Wimmelmann CL, Mortensen EL, Flensborg-Madsen T',
      year: 2022,
      title: 'Prospective associations between alcohol consumption and psychological well-being in midlife',
      journal: 'BMC Public Health, 22:204',
      url: 'https://doi.org/10.1186/s12889-021-12463-4',
      pmid: '35090442',
    },
  },
};

// Dual export: browser global + CommonJS (for the node smoke tests).
if (typeof module !== 'undefined' && module.exports) module.exports = HEALTH_MODEL;
if (typeof globalThis !== 'undefined') globalThis.HEALTH_MODEL = HEALTH_MODEL;
