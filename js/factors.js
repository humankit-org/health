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
    version: '0.1.2',
    updated: '2026-07-31',
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
      // HR 0.80 at 150 min/wk, 0.63 at 449, 0.61 at 749, 0.69 at 10x guideline (no harm even at extremes)
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
          output: 'mortality', type: 'steps', evidence: 'high', source: ['arem2015'],
          supersededBy: 'vo2maxOn', // measured fitness is the better predictor — use it instead when available
          steps: [
            { max: 0, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 149, hr: 0.80, hrLow: 0.78, hrHigh: 0.82 },
            { max: 299, hr: 0.69, hrLow: 0.67, hrHigh: 0.70 },
            { max: 449, hr: 0.63, hrLow: 0.62, hrHigh: 0.65 },
            { max: 749, hr: 0.61, hrLow: 0.59, hrHigh: 0.62 },
            { max: Infinity, hr: 0.69, hrLow: 0.59, hrHigh: 0.78 },
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
          output: 'cancer', type: 'steps', evidence: 'moderate', source: ['arem2015'],
          supersededBy: 'vo2maxOn',
          steps: [
            { max: 0, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 149, hr: 0.80, hrLow: 0.78, hrHigh: 0.82 },
            { max: 299, hr: 0.69, hrLow: 0.67, hrHigh: 0.70 },
            { max: 449, hr: 0.63, hrLow: 0.62, hrHigh: 0.65 },
            { max: 749, hr: 0.61, hrLow: 0.59, hrHigh: 0.62 },
            { max: Infinity, hr: 0.69, hrLow: 0.59, hrHigh: 0.78 },
          ],
          note: 'Arem 2015 reports a similar dose–response for cancer mortality as for all-cause; we reuse those HRs (marked moderate evidence for the extrapolation).',
        },
        {
          output: 'cvd', type: 'steps', evidence: 'high', source: ['arem2015'],
          supersededBy: 'vo2maxOn',
          steps: [
            { max: 0, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 149, hr: 0.79, hrLow: 0.76, hrHigh: 0.82 },
            { max: 299, hr: 0.67, hrLow: 0.64, hrHigh: 0.70 },
            { max: 449, hr: 0.58, hrLow: 0.55, hrHigh: 0.61 },
            { max: 749, hr: 0.56, hrLow: 0.52, hrHigh: 0.60 },
            { max: Infinity, hr: 0.63, hrLow: 0.54, hrHigh: 0.72 },
          ],
          note: 'Arem 2015: CVD mortality shows a slightly stronger dose–response than all-cause — the same pooled analysis found CVD HR ~0.56 at high volumes (750+ min/wk). CVD benefit may be the dominant driver of the all-cause mortality reduction.',
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
      // momma2022 says 10-17% lower all-cause, cvd and cancer
      // but no effect on colon, kidney, bladder or pancreatic cancer
      // Optimal risk reduction at about 30-60 min of muscle strengthening activities
      // but it was J-shaped
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
          output: 'mortality', type: 'steps', evidence: 'moderate', source: ['momma2022'],
          steps: [
            { max: 0, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 1, hr: 0.92, hrLow: 0.88, hrHigh: 0.96 },
            { max: 2, hr: 0.85, hrLow: 0.80, hrHigh: 0.90 },
            { max: Infinity, hr: 0.88, hrLow: 0.82, hrHigh: 0.95 },
          ],
          note: 'Meta-analysis: 10–17% lower all-cause mortality, max benefit ~30–60 min/week; J-shaped (more is not clearly better). CI bounds approximate — verify against paper Fig. 2.',
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
          output: 'cvd', type: 'steps', evidence: 'moderate', source: ['momma2022'],
          steps: [
            { max: 0, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 1, hr: 0.90, hrLow: 0.81, hrHigh: 0.99 },
            { max: 2, hr: 0.82, hrLow: 0.72, hrHigh: 0.92 },
            { max: Infinity, hr: 0.85, hrLow: 0.74, hrHigh: 0.97 },
          ],
          note: 'Meta-analysis: any vs no strength training → CVD mortality RR 0.90; J-shaped with maximum ~30–60 min/week. HRs approximate — non-linear curve from paper Fig. 4.',
        },
        {
          output: 'cancer', type: 'steps', evidence: 'moderate', source: ['momma2022'],
          steps: [
            { max: 0, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 1, hr: 0.87, hrLow: 0.76, hrHigh: 0.98 },
            { max: 2, hr: 0.81, hrLow: 0.71, hrHigh: 0.93 },
            { max: Infinity, hr: 0.85, hrLow: 0.74, hrHigh: 0.98 },
          ],
          note: 'Same meta-analysis: any vs no strength training → total cancer mortality RR 0.81 (0.71–0.93). J-shaped, strongest at ~30–60 min/week. Our step values approximate the non-linear pattern from paper Fig. 3.',
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
      // lancet2025steps: largest and most comprehensive meta-analysis — 57 studies, 35 cohorts
      // All-cause: HR ~0.45 at 12,000 vs 2,000 steps/day, non-linear, steepest gains 2,000→6,000
      // CVD: linear dose-response, HR ~0.50 at 12,000. Cancer: HR 0.48 at 12,000 (wider CI)
      // Dementia: cognition points from HR ~0.58 at 12,000 steps — observational
      // banach2023 cross-checks: 14 studies, HR ~0.51 for higher vs lower quartile
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
          output: 'mortality', type: 'steps', evidence: 'high', source: ['lancet2025steps', 'banach2023'],
          steps: [
            { max: 2000, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 4000, hr: 0.78, hrLow: 0.70, hrHigh: 0.86 },
            { max: 6000, hr: 0.67, hrLow: 0.59, hrHigh: 0.75 },
            { max: 8000, hr: 0.58, hrLow: 0.50, hrHigh: 0.67 },
            { max: 10000, hr: 0.52, hrLow: 0.44, hrHigh: 0.61 },
            { max: 15000, hr: 0.46, hrLow: 0.38, hrHigh: 0.55 },
            { max: Infinity, hr: 0.42, hrLow: 0.34, hrHigh: 0.51 },
          ],
          note: 'Lancet 2025 dose-response meta-analysis (57 studies): all-cause mortality HR ~0.45 at 12,000 vs 2,000 steps/day. Non-linear dose–response — steepest gains from 2,000→6,000 steps, diminishing above 10,000. Cross-checked against Banach 2023 (14 studies) and Paluch 2022 (15 cohorts).',
        },
        {
          output: 'cvd', type: 'steps', evidence: 'high', source: ['lancet2025steps', 'banach2023'],
          steps: [
            { max: 2000, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 4000, hr: 0.78, hrLow: 0.68, hrHigh: 0.88 },
            { max: 6000, hr: 0.69, hrLow: 0.60, hrHigh: 0.79 },
            { max: 8000, hr: 0.62, hrLow: 0.53, hrHigh: 0.72 },
            { max: 10000, hr: 0.55, hrLow: 0.46, hrHigh: 0.65 },
            { max: 15000, hr: 0.50, hrLow: 0.41, hrHigh: 0.60 },
            { max: Infinity, hr: 0.47, hrLow: 0.38, hrHigh: 0.57 },
          ],
          note: 'Lancet 2025: CVD mortality shows a linear dose-response association with steps — HR ~0.50 at 12,000 steps. Banach 2023 found similar HR ~0.51 for Q2 vs Q1 (5,537 vs 3,967 steps). The CVD benefit is partly independent of the all-cause effect (different mediators: BP, lipids, endothelial function).',
        },
        {
          output: 'cancer', type: 'steps', evidence: 'moderate', source: ['lancet2025steps'],
          steps: [
            { max: 2000, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 4000, hr: 0.80, hrLow: 0.65, hrHigh: 0.98 },
            { max: 6000, hr: 0.70, hrLow: 0.55, hrHigh: 0.88 },
            { max: 8000, hr: 0.62, hrLow: 0.47, hrHigh: 0.80 },
            { max: 10000, hr: 0.55, hrLow: 0.40, hrHigh: 0.75 },
            { max: 15000, hr: 0.48, hrLow: 0.33, hrHigh: 0.71 },
            { max: Infinity, hr: 0.46, hrLow: 0.30, hrHigh: 0.70 },
          ],
          note: 'Lancet 2025: cancer mortality HR 0.48 (0.33–0.71) at 12,000 vs 2,000 steps — wider CI than all-cause, reflecting fewer events and heterogeneity by cancer type. The mechanism is thought to be through adiposity, inflammation and insulin sensitivity.',
        },
        {
          output: 'cognition', type: 'steps', evidence: 'moderate', source: ['lancet2025steps'],
          steps: [
            { max: 2000, points: 0 },
            { max: 5000, points: 0.1 },
            { max: 10000, points: 0.25 },
            { max: Infinity, points: 0.35 },
          ],
          note: 'Lancet 2025: dementia risk HR ~0.58 at 12,000 steps. For cognitive function (not just dementia), observational studies show slower decline with higher step counts, but RCT evidence is thin. Points here are modest and based on the dementia HR being consistent across cohorts.',
        },
        {
          output: 'happiness', type: 'steps', evidence: 'low', source: ['lancet2025steps'],
          steps: [
            { max: 2000, points: 0 },
            { max: 5000, points: 0.1 },
            { max: 10000, points: 0.2 },
            { max: Infinity, points: 0.25 },
          ],
          note: 'Lancet 2025 found a linear inverse association with depressive symptoms. The happiness/wellbeing link is largely correlational (more active people report higher wellbeing; reverse causality plausible). Points are small.',
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
      // Cancer: HR 1.17, CVD: HR 1.15 at high vs low sedentary time
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
            { max: 9, hr: 1.06, hrLow: 1.03, hrHigh: 1.10 },
            { max: 12, hr: 1.12, hrLow: 1.07, hrHigh: 1.17 },
            { max: Infinity, hr: 1.15, hrLow: 1.107, hrHigh: 1.195 },
          ],
          note: 'Same meta-analysis, CVD mortality: HR 1.150 (1.107–1.195) for high vs low sedentary time; middle steps interpolated.',
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
      // yang2015 meta-analysis (17 cohorts, ~1M people): RR 0.90 per +10g/day for all-cause mortality
      // Benefit capped at 30g/day; top-vs-bottom-tertile RR 0.84 — linear dose may overstate at high intakes
      //
      // reynolds2019 Lancet series (185 prospective studies): 15-30% lower colorectal cancer incidence
      // 25-29 g/day optimal for cancer; 10-20% lower CVD mortality driven by cholesterol/BP effects
      // CVD pathway: soluble fiber lowers LDL, insoluble fiber improves glycaemic control
      //
      // aune2016grain (finding): whole grains are part of the fiber benefit — RR 0.83 per 3 servings/day
      // We don't count whole grains separately to avoid double-counting (overlap rule)
      effects: [
        {
          output: 'mortality', type: 'perUnit', per: 10, capAt: 30,
          hr: 0.90, hrLow: 0.86, hrHigh: 0.94,
          evidence: 'high', source: ['yang2015'],
          note: 'Meta-analysis (17 cohorts, ~1M people): RR 0.90 (0.86–0.94) per +10 g/day. Benefit capped at 30 g/day in this model; the top-vs-bottom-tertile comparison (RR 0.84) suggests the linear dose may overstate at high intakes.',
        },
        {
          output: 'cancer', type: 'steps', evidence: 'moderate', source: ['reynolds2019'],
          steps: [
            { max: 9, hr: 1.15, hrLow: 1.05, hrHigh: 1.25 },
            { max: 24, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: Infinity, hr: 0.82, hrLow: 0.75, hrHigh: 0.92 },
          ],
          note: 'Lancet series (185 prospective studies): 15–30% lower colorectal cancer incidence for high vs low fiber consumers, with dose–response for colorectal and breast cancer; 25–29 g/day looked optimal. Our step mapping is approximate.',
        },
        {
          output: 'cvd', type: 'steps', evidence: 'moderate', source: ['reynolds2019'],
          steps: [
            { max: 9, hr: 1.12, hrLow: 1.03, hrHigh: 1.22 },
            { max: 24, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: Infinity, hr: 0.85, hrLow: 0.77, hrHigh: 0.93 },
          ],
          note: 'Lancet series: higher fiber intake was associated with 10–20% lower CVD mortality — similar dose–response to the cancer effect, driven partly by cholesterol-lowering and blood-pressure effects.',
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
          note: 'Dose-response meta-analysis (16 cohorts): HR 0.95 (0.92–0.98) per serving/day, plateauing around 5 servings. Calibrated: US average 2.6 servings/day = 1.0×.',
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
          hr: 1.00, hrLow: 0.97, hrHigh: 1.03,
          evidence: 'moderate', source: ['wang2014'],
          note: 'Same meta-analysis: fruit & veg were "not appreciably associated" with cancer mortality — studied, honestly null (unlike cardiovascular mortality).',
        },
        {
          output: 'cvd', type: 'perUnit', per: 1, ref: 2.6, capAt: 5,
          hr: 0.96, hrLow: 0.93, hrHigh: 0.99,
          evidence: 'high', source: ['wang2014'],
          note: 'Same meta-analysis, cardiovascular mortality: HR 0.96 (0.93–0.99) per serving/day — small, graded, and robust across cohorts.',
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
      // All-cause: aHR 1.28 (1.20-1.35), CVD: aHR 1.27 (driven by stroke + ischaemic heart disease)
      // Cancer: aHR 1.12 (1.00-1.26) — weaker, borderline, mostly pancreatic in wider literature
      // Men-only data; other smokeless products (US, Indian) may differ substantially
      // Harm reduction relative to smoking (no combustion) but not harmless — ~28% higher all-cause
      effects: [
        {
          output: 'mortality', type: 'byOption', evidence: 'moderate', source: ['byhamre2021'],
          byOption: {
            no: { hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            yes: { hr: 1.28, hrLow: 1.20, hrHigh: 1.35 },
          },
          note: 'Pooled 8 Swedish cohorts, 169k never-smoking men: exclusive current snus use → aHR 1.28 all-cause, 1.27 cardiovascular, 1.12 cancer mortality. Men-only data; other smokeless products may differ.',
        },
        {
          output: 'cancer', type: 'byOption', evidence: 'moderate', source: ['byhamre2021'],
          byOption: {
            no: { hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            yes: { hr: 1.12, hrLow: 1.00, hrHigh: 1.26 },
          },
          note: 'Same pooled analysis, cancer mortality: aHR 1.12 (1.00–1.26) — weaker and borderline, mostly pancreatic in the wider literature.',
        },
        {
          output: 'cvd', type: 'byOption', evidence: 'moderate', source: ['byhamre2021'],
          byOption: {
            no: { hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            yes: { hr: 1.27, hrLow: 1.20, hrHigh: 1.35 },
          },
          note: 'Same pooled analysis, cardiovascular mortality: aHR 1.27 (1.20–1.35) — driven by stroke and ischaemic heart disease. The all-cause and CVD HRs are near-identical because CVD is ~half the excess.',
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
          note: 'Kaiser Permanente cohort (65k): current use NOT significantly associated with mortality (men RR 1.12, CI crosses 1.0). An honest null — but "no mortality signal" ≠ safe; see findings below. Smoked cannabis likely shares combustion harms with tobacco (not yet quantified).',
        },
        {
          output: 'cognition', type: 'byOption', evidence: 'low', source: ['moore2007'],
          byOption: { never: { points: 0 }, occasional: { points: -0.1 }, regular: { points: -0.3 } },
          note: 'Systematic review: psychosis risk rises dose-dependently (ever-use OR 1.41; heavy use OR 2.09). Evidence for depression/anxiety outcomes less consistent. Cognitive points are qualitative.',
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
      // fang2016 dose-response meta (40 cohorts, >1M people): RR 0.90 per +100mg/day all-cause
      // CVD stronger: RR 0.85 per +100mg/day — consistent with Mg's role in BP regulation + arrhythmia prevention
      // Dietary intake partly a marker of overall diet quality; supplement trials are weaker
      //
      // Finding (fang2016): higher Mg associated with lower heart-failure risk (RR 0.78 per 100mg/day)
      // and lower type-2 diabetes risk (RR 0.81) — both plausible mechanisms (electrolyte balance, insulin sensitivity)
      effects: [
        {
          output: 'mortality', type: 'perUnit', per: 100, ref: 250, minDose: 150, capAt: 450,
          hr: 0.90, hrLow: 0.81, hrHigh: 0.99,
          evidence: 'moderate', source: ['fang2016'],
          note: 'Dose-response meta-analysis (40 cohorts, >1M people): RR 0.90 (0.81–0.99) per +100 mg/day, anchored here at 250 mg and capped at 450 mg. Dietary intake — partly a marker of overall diet quality; supplement trials are weaker.',
        },
        {
          output: 'cvd', type: 'perUnit', per: 100, ref: 250, minDose: 150, capAt: 450,
          hr: 0.85, hrLow: 0.77, hrHigh: 0.93,
          evidence: 'moderate', source: ['fang2016'],
          note: 'Same meta-analysis, CVD-specific: RR 0.85 (0.77–0.93) per +100 mg/day — stronger than the all-cause effect, consistent with magnesium\'s role in blood-pressure regulation and arrhythmia prevention.',
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
          note: 'Meta-analysis (10 prospective studies, 136k people): high purpose → RR 0.83 (0.75–0.91) all-cause mortality and CV events. The low-purpose step is our approximation. Causality unproven — purpose may mark depression or circumstance.',
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
            { max: Infinity, hr: 0.83, hrLow: 0.75, hrHigh: 0.91 },
          ],
          note: 'Cohen 2016: purpose in life was associated with lower combined CVD event risk (RR 0.83, 0.75–0.91), similar to all-cause. The association is largely indirect — higher purpose tracks more activity, less smoking, better treatment adherence.',
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
      // kwok2019 + li2020 dose-response meta-analyses: RR ~0.97 per serving/week all-cause
      // CVD stronger: ~4-6% lower per 1-2 servings/week (RR 0.96) — consistent across cohorts
      // Mechanism: omega-3 (triglycerides, anti-inflammatory), substituting red meat
      //
      // Cancer (kwok2019): limited and inconsistent — no convincing association exists
      // Unlike red meat, fish fatty acids are neutral or beneficial; residual confounding with healthier diet
      //
      // li2016fish meta (21 studies, 260k): fish consumption → lower depression risk RR 0.88
      // Dose-response gradient, observational only. Omega-3 supplements DO NOT replicate this
      // (VITAL: null) — the fish benefit is partly about eating fish, not isolated omega-3
      effects: [
        {
          output: 'mortality', type: 'byOption', evidence: 'moderate', source: ['kwok2019', 'li2020'],
          byOption: {
            none: { hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            some: { hr: 0.97, hrLow: 0.93, hrHigh: 1.01 },
            lots: { hr: 0.95, hrLow: 0.91, hrHigh: 1.00 },
          },
          note: 'Dose-response meta-analyses find RR ≈ 0.97 (0.93–1.00) per serving/week; 3+/week corresponds to ~0.95 (0.91–1.00). Observational — residual confounding and substitution (fish replacing meat) likely drive part of the association, but the dose-response gradient is consistent across cohorts.',
        },
        {
          output: 'cancer', type: 'byOption', evidence: 'low', source: ['kwok2019'],
          byOption: {
            none: { hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            some: { hr: 1.00, hrLow: 0.94, hrHigh: 1.06 },
            lots: { hr: 1.00, hrLow: 0.93, hrHigh: 1.08 },
          },
          note: 'Limited and inconsistent evidence for fish intake and cancer incidence in general populations. Unlike red/processed meat, no convincing association exists between fish and cancer — possibly because the fatty acids in fish are neutral or beneficial, and the primary confounding is with healthier overall diet.',
        },
        {
          output: 'cvd', type: 'byOption', evidence: 'moderate', source: ['kwok2019'],
          byOption: {
            none: { hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            some: { hr: 0.96, hrLow: 0.92, hrHigh: 1.00 },
            lots: { hr: 0.94, hrLow: 0.90, hrHigh: 0.99 },
          },
          note: 'Dose-response: fish associated with ~4–6% lower CVD mortality per 1–2 servings/week (RR 0.96, 0.94–0.98 per serving in Li 2020 umbrella). The CVD association is stronger and more consistent than for all-cause mortality, consistent with plausible mechanisms (omega-3, substituting red meat).',
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
          note: 'Dose-response meta-analysis (20 studies): RR 0.78 (0.72–0.84) per 28 g/day; tree nuts = peanuts. Benefit capped at 35 g/day in this model.',
        },
        {
          output: 'cancer', type: 'perUnit', per: 28, capAt: 35,
          hr: 0.85, hrLow: 0.76, hrHigh: 0.94,
          evidence: 'high', source: ['aune2016nuts'],
          note: 'Same meta-analysis, total cancer: RR 0.85 (0.76–0.94) per 28 g/day.',
        },
        {
          output: 'cvd', type: 'perUnit', per: 28, capAt: 35,
          hr: 0.79, hrLow: 0.70, hrHigh: 0.88,
          evidence: 'high', source: ['aune2016nuts'],
          note: 'Same meta-analysis, CVD mortality: RR 0.79 (0.70–0.88) per 28 g/day — the lipid-lowering, anti-inflammatory and endothelial effects of nuts are clearest for CVD.',
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
      // CVD: short RR 1.07 (BP pathways), long RR 1.28 (weaker than all-cause, more confounded)
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
          note: 'Meta-analysis (16 studies, 1.4M people): short sleep RR 1.12, long sleep RR 1.30. U-shaped; long sleep may partly reflect illness (reverse causation).',
        },
        {
          output: 'cognition', type: 'steps', evidence: 'moderate', source: ['lowe2017'],
          steps: [
            { max: 6.4, points: -0.5 },
            { max: 9.4, points: 0 },
            { max: Infinity, points: -0.2 },
          ],
          note: 'Meta-analysis of 61 experimental studies: sleep restriction significantly impairs executive function (g=−0.324), sustained attention (g=−0.409) and long-term memory (g=−0.192). Effects are medium in magnitude and increase with age.',
        },
        {
          output: 'happiness', type: 'steps', evidence: 'moderate', source: ['bacaro2023'],
          steps: [
            { max: 6.4, points: -0.4 },
            { max: 9.4, points: 0 },
            { max: Infinity, points: -0.1 },
          ],
          note: 'Longitudinal meta-analysis (42 studies): good sleep (duration/quality) predicts higher subjective well-being over time (r=0.18) and higher psychological well-being (r=0.15). Bidirectional relationship with small-to-moderate effect sizes.',
        },
        {
          output: 'cvd', type: 'steps', evidence: 'high', source: ['cappuccio2010'],
          steps: [
            { max: 6.9, hr: 1.07, hrLow: 1.00, hrHigh: 1.15 },
            { max: 9.0, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: Infinity, hr: 1.28, hrLow: 1.16, hrHigh: 1.42 },
          ],
          note: 'Same meta-analysis, CVD mortality: short sleep RR 1.07 (1.00–1.15), long sleep RR 1.28 (1.16–1.42). The long-sleep association is weaker for CVD than for all-cause, possibly because short sleep affects CVD through BP pathways while long sleep is more confounded.',
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
          note: 'Pooled 68k adults: psychological distress (GHQ-12) predicted mortality dose-dependently. Calibrated: US avg stress ~3.5/10 = 1.0×. Our 1–10 slider is mapped onto those tiers.',
        },
        {
          output: 'cognition', type: 'steps', evidence: 'moderate', source: ['franks2021', 'aggarwal2014'],
          steps: [
            { max: 7, points: 0 },
            { max: Infinity, points: -0.4 },
          ],
          note: 'Meta-analysis: higher perceived stress → increased risk of MCI (HR 1.19) and dementia (HR 1.44) in prospective studies. Aggarwal 2014 CHAP cohort (6k older adults): higher stress → accelerated cognitive decline over 7 years, independent of depression and neuroticism.',
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
      // holtlunstad2010 meta (148 studies): stronger social relationships → 50% higher survival odds
      // OR 1.50 (1.42-1.59); strongest for complex social integration (OR 1.91)
      // CVD effect particularly strong, persists after adjusting for activity, smoking, BMI
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
          note: 'Meta-analysis (148 studies): stronger social relationships → 50% higher survival odds (OR 1.50, 1.42–1.59). HRs here approximate that OR; strongest for complex social integration (OR 1.91).',
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
          note: 'Same meta-analysis: social isolation has a particularly strong effect on CVD — the association persists after adjusting for activity, smoking and BMI. The HRs here mirror the all-cause pattern.',
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
          output: 'happiness', type: 'steps', evidence: 'low', source: ['hunt2018', 'nielsenGauge2024', 'datareportal2025'],
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
          note: 'Meta-analysis of 47 RCTs with active controls: mindfulness meditation gave small-moderate reductions in anxiety (effect size 0.38) and depression (0.30) — but no evidence it beats other active treatments (exercise, therapy).',
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
          evidence: 'moderate', source: ['avgerinos2018'],
          note: 'Systematic review of RCTs: creatine improved short-term memory and reasoning; effect clearer in vegetarians, older and stressed individuals. Other domains unclear.',
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
          note: 'VITAL RCT (n=26k, 5.3 y): all-cause mortality HR 1.02 (0.90–1.15) — 978 deaths, slightly MORE deaths in the omega-3 group. Not statistically significant and effectively null.',
        },
        {
          output: 'cvd', type: 'toggle', evidence: 'high', source: ['manson2019omega3'],
          hr: 0.92, hrLow: 0.80, hrHigh: 1.06,
          note: 'VITAL RCT: major cardiovascular events HR 0.92 (0.80–1.06) — null (CI includes 1.0). A secondary signal for MI (HR 0.72, 0.59–0.90) did not survive correction for multiplicity. Meta-analyses of all RCTs confirm no significant benefit for primary prevention.',
        },
        {
          output: 'cancer', type: 'toggle', evidence: 'high', source: ['manson2019omega3'],
          hr: 1.03, hrLow: 0.93, hrHigh: 1.13,
          note: 'VITAL RCT: invasive cancer incidence HR 1.03 (0.93–1.13) — null. Cancer mortality HR 0.97 — also null. The observational suggestion that omega-3 prevents cancer does not hold up in a trial.',
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
      // Cancer incidence null (1.03). CVD: observational 45% higher risk deficient vs sufficient, but
      // supplements null (0.97). The observational vs RCT gap means causality is unresolved.
      effects: [
        {
          output: 'mortality', type: 'byOption', evidence: 'moderate', source: ['schottker2014'],
          byOption: {
            deficient: { hr: 1.57, hrLow: 1.36, hrHigh: 1.81 },
            sufficient: { hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            supplement: { hr: 0.99, hrLow: 0.87, hrHigh: 1.12 },
          },
          note: 'Deficiency (bottom vs top quintile) → RR 1.57 in pooled cohorts — BUT the VITAL RCT (26k people) found supplements did NOT reduce cancer, CVD or mortality (HR 0.99). Deficiency likely marks poor health; whether correcting it helps is unresolved.',
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
          note: 'VITAL RCT, cancer DEATH with supplementation: HR 0.83 (0.67–1.02) — suggestive but not significant; cancer incidence was null (1.03).',
        },
        {
          output: 'cvd', type: 'byOption', evidence: 'moderate', source: ['schottker2014'],
          byOption: {
            deficient: { hr: 1.45, hrLow: 1.25, hrHigh: 1.65 },
            sufficient: { hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            supplement: { hr: 0.97, hrLow: 0.85, hrHigh: 1.12 },
          },
          note: 'CVD mortality shows a similar deficiency signal (observational, 45% higher risk in bottom quintile) but supplements were null in VITAL (HR 0.97 for major CVD events). As with all-cause, deficiency is likely a health marker, not a causal risk factor.',
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
          note: 'RCT meta-analysis: correcting non-anaemic iron deficiency REDUCES fatigue (SMD −0.38) — so leaving it untreated costs you that. No effect on measured physical capacity.',
        },
        {
          output: 'cognition', type: 'toggle', points: -0.2,
          evidence: 'low', source: ['falkingham2010'],
          note: 'RCT meta-analysis (14 studies): iron supplementation improved attention and concentration irrespective of baseline iron status (SMD 0.59, CI 0.29–0.90). In anaemic participants, IQ improved 2.5 points. No effect on memory or psychomotor skills. Cognition benefit clearest in children and women, understudied in men.',
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
          note: 'ACTIVE trial: speed-of-processing training cut 10-year dementia risk ~29% — but gains are mostly domain-specific (you get better at the task). Broad "brain boost" from puzzles is unproven.',
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
          note: 'Medicare open cohort (61M people, 460M person-years): +7.3% (7.1–7.5) all-cause mortality per +10 µg/m³ PM2.5 — and +13.6% even below the 12 µg/m³ US standard. Anchored at the US mean (8). Levers: location, HEPA purifiers, masks, avoiding high-traffic routes.',
        },
        {
          output: 'cvd', type: 'perUnit', per: 10, ref: 8, minDose: 3, capAt: 30,
          hr: 1.10, hrLow: 1.08, hrHigh: 1.12,
          evidence: 'high', source: ['di2017'],
          note: 'Same cohort, CVD mortality: +10% (8–12%) per +10 µg/m³ — CVD is the primary mechanism for PM2.5 mortality effects through inflammation, oxidative stress and plaque progression.',
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
      // adventist2025 (AHS-2, 83k): time outdoors shows reverse-J association with all-cause mortality
      // 2h HR 0.90, 3h HR 0.88, 5h HR 0.90 — benefit persists without attenuation
      // CVD: 0.87-0.86 at 3-5h. Cancer: modest net benefit or neutrality at all levels
      //
      // stevenson2024 UK Biobank: higher UV → lower all-cause + CVD mortality
      // Sun-BEEM 2026: medium UV HR 0.89, high UV HR 0.84 vs low
      // CVD benefit (NO-mediated BP reduction) stronger than all-cause
      //
      // lindqvist2014 Swedish women: sun avoiders had ~2× mortality vs highest exposure — striking
      //
      // maartense2024 meta (30 studies): light exposure → SM effect on wellbeing (d=0.46)
      // Sunlight stimulates serotonin, beta-endorphin, vitamin D; bright-light therapy d=0.48 for depression
      //
      // Cancer trade-off (findings): skin cancer incidence rises but NOT skin cancer MORTALITY in temperate
      // climates — non-skin cancer mortality benefits of UV appear to outweigh skin cancer mortality
      effects: [
        {
          output: 'mortality', type: 'steps', evidence: 'moderate', source: ['adventist2025', 'stevenson2024'],
          steps: [
            { max: 0.25, hr: 1.15, hrLow: 1.06, hrHigh: 1.25 },
            { max: 1.0,  hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 3.0,  hr: 0.90, hrLow: 0.86, hrHigh: 0.94 },
            { max: 5.0,  hr: 0.90, hrLow: 0.85, hrHigh: 0.95 },
            { max: Infinity, hr: 0.88, hrLow: 0.82, hrHigh: 0.94 },
          ],
          note: 'Adventist Health Study 2 (83k people, Nazeeh 2025): time outdoors shows a reverse-J association with all-cause mortality — risk drops from 0.5 h (ref) to 2 h (HR 0.90), 3 h (HR 0.88), and 5 h (HR 0.90). Benefit persists without attenuation at high exposure. Lindqvist 2014 Swedish women: avoiders had ~2× mortality vs highest sun group. Stevenson 2024 UK Biobank: higher UV — all-cause mortality lower. Sun-BEEM 2026 UK Biobank: medium UV HR 0.89, high UV HR 0.84 vs low.',
        },
        {
          output: 'cvd', type: 'steps', evidence: 'moderate', source: ['adventist2025', 'stevenson2024'],
          steps: [
            { max: 0.25, hr: 1.18, hrLow: 1.06, hrHigh: 1.32 },
            { max: 1.0,  hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 3.0,  hr: 0.88, hrLow: 0.83, hrHigh: 0.94 },
            { max: 5.0,  hr: 0.87, hrLow: 0.79, hrHigh: 0.95 },
            { max: Infinity, hr: 0.85, hrLow: 0.77, hrHigh: 0.94 },
          ],
          note: 'AHS-2 (Nazeeh 2025): CVD mortality HR 0.89 (2 h), 0.87 (3 h), 0.86 (5 h). Stevenson 2024: stronger inverse UV-CVD mortality association than all-cause — driven by nitric-oxide-mediated blood pressure reduction and improved endothelial function. Sun-BEEM 2026: high UV consistently associated with lower CVD mortality.',
        },
        {
          output: 'cancer', type: 'steps', evidence: 'moderate', source: ['stevenson2024', 'adventist2025'],
          steps: [
            { max: 0.25, hr: 1.06, hrLow: 0.97, hrHigh: 1.16 },
            { max: 1.0,  hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 3.0,  hr: 0.96, hrLow: 0.90, hrHigh: 1.02 },
            { max: 5.0,  hr: 0.96, hrLow: 0.89, hrHigh: 1.03 },
            { max: Infinity, hr: 0.96, hrLow: 0.88, hrHigh: 1.05 },
          ],
          note: 'Stevenson 2024 UK Biobank: UV inversely associated with cancer mortality — higher UV is beneficial at all levels examined. Sun-BEEM 2026: non-skin cancer mortality lower, skin cancer mortality flat at high UV. AHS-2 (Nazeeh 2025) found cancer mortality slightly elevated at 5 h (HR 1.15, 1.02–1.29) in a low-baseline-risk Adventist population, possibly driven by skin cancer incidence. Preponderance of evidence supports modest net benefit or neutrality at all sun exposure levels.',
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
          note: 'Meta-analysis of 30 studies (74 systematic): light exposure has a small-to-moderate positive effect on wellbeing (pooled d=0.46, CI 0.29–0.62; sensitivity d=0.53). Sunlight stimulates serotonin synthesis, beta-endorphin release, and vitamin D production. Bright-light therapy RCTs show d=0.48 for depression remission.',
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
          evidence: 'high', source: ['kodama2009'],
          note: 'Meta-analysis (33 studies): RR 0.87 (0.84–0.90) per 1-MET (3.5 ml/kg/min) higher fitness, calibrated to US average ~33 ml/kg/min. Corroborated by Mandsager 2018: elite vs low fitness HR 0.20.',
        },
        {
          output: 'cvd', type: 'perUnit', per: 3.5, ref: 33, capAt: 56,
          hr: 0.85, hrLow: 0.82, hrHigh: 0.88,
          evidence: 'high', source: ['kodama2009'],
          note: 'Same meta-analysis, CVD events: RR 0.85 (0.82–0.88) per 1-MET — calibrated to US average ~33 ml/kg/min. The CVD effect is slightly stronger than all-cause, consistent with cardiorespiratory fitness being a direct measure of cardiovascular health.',
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
      // CVD: HR 1.19 per 5kg LOWER — even stronger than all-cause
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
          hr: 0.84, hrLow: 0.81, hrHigh: 0.87,
          evidence: 'moderate', source: ['leong2015'],
          note: 'PURE study, CVD mortality: HR 1.19 (1.15–1.23) per 5 kg LOWER grip — expressed as 0.84 per +5 kg, calibrated to US average ~30 kg. Grip predicted CVD mortality even more strongly than all-cause in the PURE cohort. Marker, not necessarily modifiable lever.',
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
          hr: 1.15, hrLow: 1.12, hrHigh: 1.18,
          evidence: 'moderate', source: ['aune2017rhr'],
          note: 'Same meta-analysis, CVD-specific: +15% (12–18%) per +10 bpm — calibrated to US average RHR 72 bpm = 1.0×. The RHR–CVD association is the best-established of all, reflecting the direct relationship between heart rate and myocardial oxygen demand.',
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
      when: (v) => v.smoking === 'current', dir: 'bad', input: 'Smoking', source: ['thun2013', 'jha2013'],
      text: 'Current smokers have ~25× the lung-cancer death rate of never-smokers (and ~23× the COPD death rate). Significant increase in risk of COPD and vascular disease, also icnreasing mortality.',
    },
    {
      when: (v) => v.strength < 1, dir: 'bad', input: 'Strength', source: ['sherrington2019'],
      text: 'No strength/balance training → up to 25% more falls later in life.',
    },
    {
      when: (v) => v.strength < 1 && v.sex === 'female', dir: 'bad', input: 'Strength', source: ['howe2011'],
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
      when: (v) => v.occupationalPA >= 2, dir: 'neutral', input: 'Physical activity at work', source: ['dalene2021'],
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
    momma2022: {
      authors: 'Momma H, Kawakami R, Honda T, Sawada SS',
      year: 2022,
      title: 'Muscle-strengthening activities are associated with lower risk and mortality in major non-communicable diseases: a systematic review and meta-analysis of cohort studies',
      journal: 'British Journal of Sports Medicine, 56(13):755–763',
      url: 'https://doi.org/10.1136/bjsports-2021-105061',
      pmid: '35228201',
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
    li2020: {
      authors: 'Li Y, Guo L, He K, Fan L, Liang W, He Q',
      year: 2020,
      title: 'Fish intake and cardiovascular disease and all-cause mortality: a dose-response meta-analysis of prospective cohorts',
      journal: 'Heart, 106(2):124–130',
      url: 'https://doi.org/10.1136/heartjnl-2019-315087',
      pmid: '31451418',
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
      journal: 'The Lancet Public Health, 10(8):e610–e623',
      url: 'https://doi.org/10.1016/S2468-2667(25)00164-1',
      pmid: null,
    },
    banach2023: {
      authors: 'Banach M, Lewek J, Surma S, Penson PE, Sahebkar A, Martin SS, et al.',
      year: 2023,
      title: 'The association between daily step count and all-cause and cardiovascular mortality: a meta-analysis',
      journal: 'European Journal of Preventive Cardiology, 30(18):1975–1985',
      url: 'https://doi.org/10.1093/eurjpc/zwad229',
      pmid: '37555447',
    },
    stevenson2024: {
      authors: 'Stevenson AC, Clemens T, Pairo-Castineira E, Webb DJ, Weller RB, Dibben C',
      year: 2024,
      title: 'Higher ultraviolet light exposure is associated with lower mortality: an analysis of data from the UK Biobank cohort study',
      journal: 'Health & Place, 89:103328',
      url: 'https://doi.org/10.1016/j.healthplace.2024.103328',
      pmid: null,
    },
    adventist2025: {
      authors: 'Nazeeh N, Orlich MJ, Segovia-Siapco G, Fraser GE, Shavlik D',
      year: 2025,
      title: 'The association between time spent outdoors during daylight and mortality among participants of the Adventist Health Study 2 cohort',
      journal: 'Environmental Epidemiology, 9(3):e401',
      url: 'https://doi.org/10.1097/EE9.0000000000000401',
      pmid: null,
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
      pmid: null,
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
      journal: 'Psychosomatic Medicine, 76(1):80–88',
      url: 'https://doi.org/10.1097/PSY.0000000000000018',
      pmid: '24367124',
    },
    maartense2024: {
      authors: 'Maartense I, van Duijnhoven J, Smolders K, de Kort Y',
      year: 2024,
      title: 'The effect of light on wellbeing: a systematic review and meta-analysis',
      journal: 'Journal of Happiness Studies, 25:108',
      url: 'https://doi.org/10.1007/s10902-024-00838-4',
      pmid: null,
    },
    zhang2024vitd: {
      authors: 'Zhang XX, Yang YY, Liu D, et al.',
      year: 2024,
      title: 'Association of vitamin D levels with risk of cognitive impairment and dementia: a systematic review and meta-analysis of prospective studies',
      journal: 'Journal of Alzheimer\'s Disease, 99(1):31–45',
      url: 'https://doi.org/10.3233/JAD-231381',
      pmid: null,
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
