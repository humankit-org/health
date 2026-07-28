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
    version: '0.1.0',
    updated: '2026-07-28',
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
    // US life expectancy at birth, 2023. VERIFY against the NCHS report below.
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
      min: 130, max: 210, step: 1, default: 170,
      hint: 'Combined with weight to compute BMI.',
      effects: [], // feeds the derived BMI effect below
    },
    {
      id: 'weightKg',
      group: 'you',
      label: 'Weight',
      kind: 'slider',
      unit: 'kg',
      min: 40, max: 180, step: 1, default: 87,
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
          output: 'cognition', type: 'steps', evidence: 'low', source: ['momma2022'],
          steps: [
            { max: 1, points: 0 },
            { max: Infinity, points: 0.2 },
          ],
          note: 'Weak/small effects on executive function in meta-analyses of older adults; indirect citation — replace with a dedicated source.',
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
      ],
    },

    {
      id: 'occupationalPA',
      group: 'movement',
      extra: true,
      label: 'Physical activity at work',
      kind: 'slider',
      unit: 'hours/day',
      min: 0, max: 10, step: 1, default: 1,
      hint: 'Heavy physical work (construction, nursing, warehouse…). Not the same as leisure exercise!',
      effects: [
        {
          output: 'mortality', type: 'steps', evidence: 'moderate', source: ['coenen2018'],
          steps: [
            { max: 2, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 6, hr: 1.10, hrLow: 1.03, hrHigh: 1.20 },
            { max: Infinity, hr: 1.18, hrLow: 1.05, hrHigh: 1.34 },
          ],
          note: 'The "physical activity paradox": meta-analysis (194k workers) found HIGH occupational activity → HR 1.18 in MEN (women: HR 0.90, NS). Middle step interpolated. Leisure activity benefits don\'t transfer to heavy work.',
        },
        {
          output: 'cvd', type: 'steps', evidence: 'moderate', source: ['coenen2018'],
          steps: [
            { max: 2, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 6, hr: 1.08, hrLow: 1.01, hrHigh: 1.18 },
            { max: Infinity, hr: 1.15, hrLow: 1.03, hrHigh: 1.30 },
          ],
          note: 'Same meta-analysis: CVD mortality showed a similar pattern in men — higher risk with heavy occupational activity, driven by elevated blood pressure and incomplete recovery.',
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
      extra: true,
      label: 'Dietary fiber',
      kind: 'slider',
      unit: 'g/day',
      min: 0, max: 50, step: 1, default: 15,
      hint: 'Vegetables, fruit, legumes, whole grains. US average ≈ 15 g/day.',
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
      min: 0, max: 10, step: 0.5, default: 3,
      hint: 'One serving ≈ 80 g: a fist-sized portion.',
      effects: [
        {
          output: 'mortality', type: 'perUnit', per: 1, capAt: 5,
          hr: 0.95, hrLow: 0.92, hrHigh: 0.98,
          evidence: 'high', source: ['wang2014'],
          note: 'Dose-response meta-analysis (16 cohorts): HR 0.95 (0.92–0.98) per serving/day, plateauing around 5 servings.',
        },
        {
          output: 'happiness', type: 'steps', evidence: 'low', source: ['wang2014'],
          steps: [
            { max: 4.9, points: 0 },
            { max: Infinity, points: 0.15 },
          ],
          note: 'Fruit/veg intake correlates with wellbeing in observational data; causal effect unproven. Indirect citation — replace with a dedicated source.',
        },
        {
          output: 'cancer', type: 'perUnit', per: 1, capAt: 5,
          hr: 1.00, hrLow: 0.97, hrHigh: 1.03,
          evidence: 'moderate', source: ['wang2014'],
          note: 'Same meta-analysis: fruit & veg were "not appreciably associated" with cancer mortality — studied, honestly null (unlike cardiovascular mortality).',
        },
        {
          output: 'cvd', type: 'perUnit', per: 1, capAt: 5,
          hr: 0.96, hrLow: 0.93, hrHigh: 0.99,
          evidence: 'high', source: ['wang2014'],
          note: 'Same meta-analysis, cardiovascular mortality: HR 0.96 (0.93–0.99) per serving/day — small, graded, and robust across cohorts.',
        },
      ],
    },
    {
      id: 'alcohol',
      group: 'diet',
      label: 'Alcohol',
      kind: 'slider',
      unit: 'drinks/week',
      min: 0, max: 30, step: 1, default: 3,
      hint: 'One drink ≈ 14 g ethanol (a beer, glass of wine, or shot).',
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
          output: 'cognition', type: 'steps', evidence: 'moderate', source: ['wood2018'],
          steps: [
            { max: 14, points: 0 },
            { max: Infinity, points: -0.4 },
          ],
          note: 'Heavy drinking is associated with worse cognitive outcomes; moderate intake effects unclear. Indirect citation — replace with a dedicated source.',
        },
        {
          output: 'happiness', type: 'steps', evidence: 'low', source: ['wood2018'],
          steps: [
            { max: 14, points: 0 },
            { max: Infinity, points: -0.3 },
          ],
          note: 'Heavy alcohol use co-occurs with lower wellbeing; direction of causality unclear. Indirect citation — replace with a dedicated source.',
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
      group: 'diet',
      label: 'Smoking',
      kind: 'segmented',
      default: 'never',
      options: [
        { value: 'never', label: 'Never' },
        { value: 'former', label: 'Former' },
        { value: 'current', label: 'Current' },
      ],
    //hint: 'Cigarettes.',
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
          output: 'cognition', type: 'byOption', evidence: 'low', source: ['jha2013'],
          byOption: { never: { points: 0 }, former: { points: -0.05 }, current: { points: -0.2 } },
          note: 'Smoking is associated with faster cognitive decline in cohort studies. Indirect citation — replace with a dedicated source.',
        },
        {
          output: 'happiness', type: 'byOption', evidence: 'low', source: ['jha2013'],
          byOption: { never: { points: 0 }, former: { points: -0.05 }, current: { points: -0.2 } },
          note: 'Smokers report lower wellbeing on average, but causality is entangled with dependence and withdrawal. Indirect citation — replace with a dedicated source.',
        },
        {
          output: 'cancer', type: 'byOption', evidence: 'moderate', source: ['thun2013'],
          byOption: {
            never: { hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            former: { hr: 1.40, hrLow: 1.20, hrHigh: 1.60 },
            current: { hr: 3.00, hrLow: 2.50, hrHigh: 3.50 },
          },
          note: 'Approximate all-cancer mortality for current smokers. The striking verified number is organ-specific: lung-cancer DEATH ~25× never-smokers in contemporary US cohorts (Thun 2013). Replace with Carter 2015 site-specific figures in a later pass.',
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
      id: 'coffee',
      group: 'diet',
      extra: true,
      label: 'Coffee',
      kind: 'slider',
      unit: 'cups/day',
      min: 0, max: 6, step: 1, default: 2,
      hint: 'Decaf also counts.',
      effects: [
        {
          output: 'mortality', type: 'steps', evidence: 'moderate', source: ['poole2017'],
          steps: [
            { max: 0, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 2, hr: 0.90, hrLow: 0.86, hrHigh: 0.95 },
            { max: 4, hr: 0.83, hrLow: 0.79, hrHigh: 0.88 },
            { max: Infinity, hr: 0.88, hrLow: 0.82, hrHigh: 0.95 },
          ],
          note: 'Umbrella review: largest all-cause risk reduction at 3–4 cups/day (RR 0.83, 0.79–0.88). The 1–2 and 5+ steps are interpolated/U-shaped approximations — verify against the paper.',
        },
        {
          output: 'cancer', type: 'steps', evidence: 'moderate', source: ['poole2017'],
          steps: [
            { max: 0, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 2, hr: 0.92, hrLow: 0.85, hrHigh: 1.00 },
            { max: 4, hr: 0.82, hrLow: 0.74, hrHigh: 0.89 },
            { max: Infinity, hr: 0.85, hrLow: 0.76, hrHigh: 0.95 },
          ],
          note: 'Same umbrella review, incident cancer: 18% lower at high vs low consumption (0.82, 0.74–0.89). 1–2 and 5+ steps interpolated.',
        },
        {
          output: 'cvd', type: 'steps', evidence: 'moderate', source: ['poole2017'],
          steps: [
            { max: 0, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 2, hr: 0.88, hrLow: 0.80, hrHigh: 0.96 },
            { max: 4, hr: 0.81, hrLow: 0.72, hrHigh: 0.90 },
            { max: Infinity, hr: 0.85, hrLow: 0.74, hrHigh: 0.96 },
          ],
          note: 'Same umbrella review, CVD mortality: RR 0.81 (0.72–0.90) at 3–4 cups/day — the strongest of all outcomes in the review. 1–2 and 5+ steps interpolated.',
        },
      ],
    },

    {
      id: 'snus',
      group: 'diet',
      extra: true,
      label: 'Snus / smokeless tobacco',
      kind: 'segmented',
      default: 'no',
      options: [
        { value: 'no', label: 'No' },
        { value: 'yes', label: 'Yes' },
      ],
     // hint: 'Swedish-style snus has the best data. Less harmful than smoking — not harmless.',
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
      group: 'diet',
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
      group: 'mind',
      extra: true,
      label: 'Sense of purpose',
      kind: 'slider',
      unit: '/ 10',
      min: 1, max: 10, step: 1, default: 6,
      hint: '"My life has direction and meaning." 1 = not at all, 10 = completely.',
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
      extra: true,
      label: 'Processed meat',
      kind: 'slider',
      unit: 'servings/week',
      min: 0, max: 14, step: 0.5, default: 1.5,
      hint: 'Bacon, sausages, deli meats, hot dogs. US average ≈ 1–2 servings/week.',
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
      min: 0, max: 21, step: 1, default: 3,
      hint: 'Soda, sweetened juices, energy drinks. One serving = 355 ml',
      effects: [
        {
          output: 'mortality', type: 'steps', evidence: 'high', source: ['malik2019'],
          steps: [
            { max: 0.2, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 1, hr: 1.01, hrLow: 0.98, hrHigh: 1.04 },
            { max: 6, hr: 1.06, hrLow: 1.03, hrHigh: 1.09 },
            { max: 13, hr: 1.14, hrLow: 1.09, hrHigh: 1.19 },
            { max: Infinity, hr: 1.21, hrLow: 1.13, hrHigh: 1.28 },
          ],
          note: 'NHS + HPFS: graded dose-response vs <1/month — 1–4/mo 1.01, 2–6/wk 1.06, 1–2/day 1.14, ≥2/day 1.21 (1.13–1.28); CVD mortality 1.31 and cancer mortality 1.16 at the extremes. Artificially sweetened drinks: mostly null (unconfirmed signal in women only).',
        },
        {
          output: 'cancer', type: 'steps', evidence: 'moderate', source: ['malik2019'],
          steps: [
            { max: 0.2, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 6, hr: 1.05, hrLow: 1.00, hrHigh: 1.12 },
            { max: 13, hr: 1.10, hrLow: 1.02, hrHigh: 1.20 },
            { max: Infinity, hr: 1.16, hrLow: 1.04, hrHigh: 1.29 },
          ],
          note: 'Same cohorts, cancer mortality: 1.16 (1.04–1.29) at ≥2/day; lower steps interpolated.',
        },
        {
          output: 'cvd', type: 'steps', evidence: 'high', source: ['malik2019'],
          steps: [
            { max: 0.2, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 1, hr: 1.01, hrLow: 0.97, hrHigh: 1.05 },
            { max: 6, hr: 1.06, hrLow: 1.01, hrHigh: 1.12 },
            { max: 13, hr: 1.17, hrLow: 1.10, hrHigh: 1.26 },
            { max: Infinity, hr: 1.31, hrLow: 1.20, hrHigh: 1.43 },
          ],
          note: 'Same cohorts, CVD mortality: stronger than all-cause — 1.31 (1.20–1.43) at ≥2/day, driven by the metabolic effects of fructose (insulin resistance, hypertension, dyslipidaemia).',
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
          output: 'cognition', type: 'steps', evidence: 'low', source: ['cappuccio2010'],
          steps: [
            { max: 6.4, points: -0.5 },
            { max: 9.4, points: 0 },
            { max: Infinity, points: -0.2 },
          ],
          note: 'Sleep loss acutely impairs attention and memory (well-established experimentally); points here are a qualitative extrapolation. Replace with a dedicated source.',
        },
        {
          output: 'happiness', type: 'steps', evidence: 'low', source: ['cappuccio2010'],
          steps: [
            { max: 6.4, points: -0.4 },
            { max: 9.4, points: 0 },
            { max: Infinity, points: -0.1 },
          ],
          note: 'Short sleep is strongly tied to same-day mood; bidirectional. Indirect citation — replace with a dedicated source.',
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
      min: 1, max: 10, step: 1, default: 5,
      hint: '1 = calm, 10 = overwhelmed, most days.',
      effects: [
        {
          output: 'mortality', type: 'steps', evidence: 'high', source: ['russ2012'],
          steps: [
            { max: 3, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 6, hr: 1.20, hrLow: 1.13, hrHigh: 1.27 },
            { max: 8, hr: 1.43, hrLow: 1.31, hrHigh: 1.56 },
            { max: Infinity, hr: 1.94, hrLow: 1.66, hrHigh: 2.26 },
          ],
          note: 'Pooled 68k adults: psychological distress (GHQ-12) predicted mortality dose-dependently — HR 1.20 / 1.43 / 1.94 for rising distress tiers. Our 1–10 slider is mapped onto those tiers.',
        },
        {
          output: 'cognition', type: 'steps', evidence: 'low', source: ['russ2012'],
          steps: [
            { max: 7, points: 0 },
            { max: Infinity, points: -0.4 },
          ],
          note: 'Chronic stress impairs working memory and attention experimentally; points are a qualitative extrapolation. Replace with a dedicated source.',
        },
        {
          output: 'happiness', type: 'steps', evidence: 'low', source: ['russ2012'],
          steps: [
            { max: 3, points: 0 },
            { max: 7, points: -0.2 },
            { max: Infinity, points: -0.8 },
          ],
          note: 'Near-tautological (stress and unhappiness overlap by definition); included so the slider visibly does something.',
        },
        {
          output: 'cvd', type: 'steps', evidence: 'moderate', source: ['russ2012'],
          steps: [
            { max: 3, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 6, hr: 1.18, hrLow: 1.08, hrHigh: 1.28 },
            { max: 8, hr: 1.38, hrLow: 1.22, hrHigh: 1.55 },
            { max: Infinity, hr: 1.80, hrLow: 1.50, hrHigh: 2.10 },
          ],
          note: 'Russ 2012: psychological distress showed a similar dose–response for CVD mortality as for all-cause — with hypertension, arrhythmia and atherosclerosis as proposed mechanisms. High distress ~1.8× CVD death risk.',
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
          note: 'Social connection is among the strongest correlates of life satisfaction; correlational. Indirect citation — replace with a dedicated source.',
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
      hint: 'TV, social media, doomscrolling, gaming. Not work screens. US average ≈ 4–6 h/day (TV ~3 h + social media ~2 h).',
      effects: [
        {
          output: 'happiness', type: 'steps', evidence: 'low', source: ['hunt2018'],
          steps: [
            { max: 1, points: 0 },
            { max: 3, points: -0.05 },
            { max: 5, points: -0.15 },
            { max: 7, points: -0.30 },
            { max: Infinity, points: -0.45 },
          ],
          note: 'Direction is consistent across designs: an RCT limiting social media to ~30 min/day reduced loneliness and depression (Hunt 2018); 4-week Facebook deactivation improved subjective wellbeing (Allcott 2020); meta-analysis RR 1.22 depression for prolonged computer/internet use (Zhai 2015). But population associations are tiny (≤0.4% of wellbeing variance, Orben 2019), non-users ≈ low users (Twenge 2018), and reverse causality is plausible — points are deliberately small. The mortality/CVD pathways of screen time run through sitting and low fitness and are NOT double-counted here (see findings; Stamatakis 2011, Celis-Morales 2018).',
        },
      ],
    },
    {
      id: 'meditation',
      group: 'mind',
      extra: true,
      label: 'Meditation',
      kind: 'slider',
      unit: 'min/week',
      min: 0, max: 300, step: 15, default: 0,
      //hint: 'Mindfulness-style practice.',
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
      effects: [
        {
          output: 'mortality', type: 'steps', evidence: 'low', source: ['laukkanen2015'],
          steps: [
            { max: 1, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 3, hr: 0.75, hrLow: 0.64, hrHigh: 0.90 },
            { max: Infinity, hr: 0.60, hrLow: 0.45, hrHigh: 0.81 },
          ],
          note: 'Single Finnish cohort of 2315 men: 4–7 vs 1 session/wk → ~40% lower all-cause mortality (unadjusted deaths 30.8% vs 49.1%). Observational, one population, likely residual confounding — treat as speculative. Exact adjusted all-cause HRs to be verified against paper Table 2.',
        },
        {
          output: 'cvd', type: 'steps', evidence: 'low', source: ['laukkanen2015'],
          steps: [
            { max: 1, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 3, hr: 0.72, hrLow: 0.58, hrHigh: 0.88 },
            { max: Infinity, hr: 0.48, hrLow: 0.31, hrHigh: 0.68 },
          ],
          note: 'Same cohort — the CVD-specific signal was even stronger: 4–7 sessions/wk associated with ~63% lower sudden cardiac death and ~50% lower fatal CVD. The effect is attributed to improved endothelial function, lower BP and reduced sympathetic tone.',
        },
      ],
    },
    {
      id: 'creatine',
      group: 'extras',
      extra: true,
      label: 'Creatine (~5 g/day)',
      kind: 'toggle',
      default: false,
      hint: 'Creatine monohydrate supplementation.',
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
      group: 'extras',
      extra: true,
      label: 'Fish oil / omega-3 supplements',
      kind: 'toggle',
      default: false,
      //hint: 'A lot of people take these hoping for the benefits of eating fish. The best trial says they don\'t work.',
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
      group: 'extras',
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
          output: 'cognition', type: 'byOption', evidence: 'low', source: ['schottker2014'],
          byOption: { deficient: { points: -0.2 }, sufficient: { points: 0 }, supplement: { points: 0 } },
          note: 'Deficiency is associated with worse cognitive outcomes observationally; supplementation trials show no clear cognitive benefit. Indirect citation — replace with a dedicated source.',
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
      group: 'extras',
      extra: true,
      label: 'Untreated iron deficiency',
      kind: 'toggle',
      default: false,
      hint: 'Common in menstruating women, vegetarians, endurance athletes.',
      effects: [
        {
          output: 'happiness', type: 'toggle', points: -0.4,
          evidence: 'moderate', source: ['houston2018'],
          note: 'RCT meta-analysis: correcting non-anaemic iron deficiency REDUCES fatigue (SMD −0.38) — so leaving it untreated costs you that. No effect on measured physical capacity.',
        },
        {
          output: 'cognition', type: 'toggle', points: -0.2,
          evidence: 'low', source: ['houston2018'],
          note: 'Iron deficiency is linked to reduced attention/cognitive performance, mostly studied in children and anaemic patients; effect size in non-anaemic adults unclear. Indirect citation — replace with a dedicated source.',
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
      id: 'vo2maxOn',
      group: 'advanced',
      extra: true,
      label: 'I know my VO2 max',
      kind: 'toggle',
      default: false,
      hint: 'From a lab test or a good wearable estimate.',
      effects: [],
    },
    {
      id: 'vo2max',
      group: 'advanced',
      extra: true,
      label: 'VO2 max',
      kind: 'slider',
      unit: 'ml/kg/min',
      min: 20, max: 60, step: 1, default: 35,
      gatedBy: 'vo2maxOn',
      //hint: 'When enabled, this REPLACES the cardio estimate — measured fitness predicts mortality better than reported activity.',
      effects: [
        {
          output: 'mortality', type: 'perUnit', per: 3.5, ref: 28, capAt: 56,
          hr: 0.87, hrLow: 0.84, hrHigh: 0.90,
          evidence: 'high', source: ['kodama2009'],
          note: 'Meta-analysis (33 studies): RR 0.87 (0.84–0.90) per 1-MET (3.5 ml/kg/min) higher fitness, anchored at 28 (low-average) and capped at 56. Corroborated by Mandsager 2018: elite vs low fitness HR 0.20.',
        },
        {
          output: 'cvd', type: 'perUnit', per: 3.5, ref: 28, capAt: 56,
          hr: 0.85, hrLow: 0.82, hrHigh: 0.88,
          evidence: 'high', source: ['kodama2009'],
          note: 'Same meta-analysis, CVD events: RR 0.85 (0.82–0.88) per 1-MET — the CVD effect is slightly stronger than all-cause, consistent with cardiorespiratory fitness being a direct measure of cardiovascular health.',
        },
      ],
    },
    {
      id: 'bodyFatOn',
      group: 'advanced',
      extra: true,
      label: 'I know my body fat %',
      kind: 'toggle',
      default: false,
      hint: 'From DEXA, impedance scale, or calipers.',
      effects: [],
    },
    {
      id: 'bodyFat',
      group: 'advanced',
      extra: true,
      label: 'Body fat',
      kind: 'slider',
      unit: '%',
      min: 5, max: 55, step: 1, default: 22,
      gatedBy: 'bodyFatOn',
      //hint: 'When enabled, this REPLACES the BMI estimate.',
      effects: [
        {
          output: 'mortality', type: 'steps', evidence: 'moderate', source: ['jayedi2022'],
          steps: [
            { max: 18, hr: 1.15, hrLow: 1.05, hrHigh: 1.30 },
            { max: 28, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 38, hr: 1.11, hrLow: 1.02, hrHigh: 1.20 },
            { max: Infinity, hr: 1.23, hrLow: 1.04, hrHigh: 1.44 },
          ],
          note: 'Dose-response meta-analysis (35 cohorts, 923k people): J-shaped, lowest risk near 25%; HR ~1.11 per +10% BF above that. Sex-specific ideal ranges differ; our steps are unisex approximations — verify against the paper.',
        },
        {
          output: 'cvd', type: 'steps', evidence: 'moderate', source: ['jayedi2022'],
          steps: [
            { max: 18, hr: 1.12, hrLow: 1.02, hrHigh: 1.25 },
            { max: 28, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 38, hr: 1.15, hrLow: 1.05, hrHigh: 1.25 },
            { max: Infinity, hr: 1.28, hrLow: 1.08, hrHigh: 1.50 },
          ],
          note: 'Same meta-analysis — CVD-specific effect of body fat is steeper than all-cause above the nadir, consistent with visceral adiposity driving hypertension, diabetes and inflammatory pathways.',
        },
      ],
    },
    {
      id: 'gripOn',
      group: 'advanced',
      extra: true,
      label: 'I know my grip strength',
      kind: 'toggle',
      default: false,
      hint: 'From a hand dynamometer (cheap ones work fine).',
      effects: [],
    },
    {
      id: 'grip',
      group: 'advanced',
      extra: true,
      label: 'Grip strength',
      kind: 'slider',
      unit: 'kg',
      min: 10, max: 70, step: 1, default: 35,
      gatedBy: 'gripOn',
      hint: 'Best of a few squeezes, dominant hand. Rough averages: ~40 kg men, ~25 kg women.',
      effects: [
        {
          output: 'mortality', type: 'perUnit', per: 5, ref: 35, minDose: 15, capAt: 60,
          hr: 0.8621, hrLow: 0.8333, hrHigh: 0.8850,
          evidence: 'moderate', source: ['leong2015'],
          note: 'PURE study (17 countries, 140k people): HR 1.16 (1.13–1.20) per 5 kg LOWER grip — expressed as 0.862 per +5 kg, anchored at 35 kg. Grip predicted mortality more strongly than systolic blood pressure. Probably a marker of overall strength (overlaps the strength-training input); whether improving grip itself helps is untested.',
        },
        {
          output: 'cvd', type: 'perUnit', per: 5, ref: 35, minDose: 15, capAt: 60,
          hr: 0.84, hrLow: 0.81, hrHigh: 0.87,
          evidence: 'moderate', source: ['leong2015'],
          note: 'PURE study, CVD mortality: HR 1.19 (1.15–1.23) per 5 kg LOWER grip — expressed as 0.84 per +5 kg. Grip predicted CVD mortality even more strongly than all-cause in the PURE cohort. Marker, not necessarily modifiable lever.',
        },
      ],
    },
    {
      id: 'rhrOn',
      group: 'advanced',
      extra: true,
      label: 'I know my resting heart rate',
      kind: 'toggle',
      default: false,
      hint: 'After sitting quietly for 5 minutes. Most wearables report it.',
      effects: [],
    },
    {
      id: 'rhr',
      group: 'advanced',
      extra: true,
      label: 'Resting heart rate',
      kind: 'slider',
      unit: 'bpm',
      min: 40, max: 110, step: 1, default: 70,
      gatedBy: 'rhrOn',
      hint: 'Typical adult average ≈ 60–80 bpm.',
      effects: [
        {
          output: 'mortality', type: 'perUnit', per: 10, ref: 70, minDose: 45, capAt: 100,
          hr: 1.17, hrLow: 1.14, hrHigh: 1.19,
          evidence: 'moderate', source: ['aune2017rhr'],
          note: 'Dose-response meta-analysis (87 studies): +17% (1.14–1.19) all-cause mortality per +10 bpm. RHR is partly a proxy for cardiorespiratory fitness — it overlaps the cardio/VO2max inputs, though the association survived activity adjustment in most studies.',
        },
        {
          output: 'cancer', type: 'perUnit', per: 10, ref: 70, minDose: 45, capAt: 100,
          hr: 1.14, hrLow: 1.06, hrHigh: 1.23,
          evidence: 'moderate', source: ['aune2017rhr'],
          note: 'Same meta-analysis, total cancer: +14% (1.06–1.23) per +10 bpm.',
        },
        {
          output: 'cvd', type: 'perUnit', per: 10, ref: 70, minDose: 45, capAt: 100,
          hr: 1.15, hrLow: 1.12, hrHigh: 1.18,
          evidence: 'moderate', source: ['aune2017rhr'],
          note: 'Same meta-analysis, CVD-specific: +15% (12–18%) per +10 bpm — the RHR–CVD association is the best-established of all, reflecting the direct relationship between heart rate and myocardial oxygen demand.',
        },
      ],
    },
  ],

  // Derived input: BMI computed from heightCm/weightKg, then this effect applies.
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
   */
  findings: [
    {
      when: (v) => v.smoking === 'current', dir: 'bad', input: 'Smoking', source: ['jha2013'],
      text: 'markedly increased risk of lung cancer, COPD and vascular disease — most of the excess mortality in smokers comes from these causes',
    },
    {
      when: (v) => v.smoking === 'current', dir: 'bad', input: 'Smoking', source: ['thun2013'],
      text: 'current smokers have ~25× the lung-cancer death rate of never-smokers (and ~23× the COPD death rate) in contemporary US cohorts',
    },
    {
      when: (v) => v.strength < 1, dir: 'bad', input: 'Strength', source: ['sherrington2019'],
      text: 'no strength/balance training → more falls later in life: exercise cuts fall rates ~23% and fall-related fractures ~27% in adults 60+ (high-certainty Cochrane evidence)',
    },
    {
      when: (v) => v.strength < 1 && v.sex === 'female', dir: 'bad', input: 'Strength', source: ['howe2011'],
      text: 'increased chance of osteoporosis for inactive lifestyles: in postmenopausal women, resistance training preserves bone density (femoral neck +1%, spine +3% vs controls) — disuse accelerates bone loss',
    },
    {
      when: (v) => v.strength < 1 && v.sex !== 'female', dir: 'bad', input: 'Strength', source: ['howe2011'],
      text: 'increased chance of osteoporosis for inactive lifestyles: mechanical loading is what keeps bone — without resistance exercise, bone density declines with age',
    },
    {
      when: (v) => v.cardio >= 150 && v.sex === 'female', dir: 'good', input: 'Cardio', source: ['rong2016'],
      text: 'leisure-time physical activity was associated with ~7% lower hip-fracture risk per activity increment in older women',
    },
    {
      when: (v) => v.gripOn, dir: 'neutral', input: 'Grip', source: ['leong2015'],
      text: 'honest null: grip strength predicted death but NOT falls or fractures in PURE — a mortality marker, not an injury marker',
    },
    {
      when: (v) => v.alcohol > 14, dir: 'bad', input: 'Alcohol', source: ['gbd2016'],
      text: 'alcohol is a Group 1 carcinogen: cancer risk rises with every level of consumption, and ~19–27% of alcohol-attributable deaths after 50 are cancers',
    },
    {
      when: (v) => v.smoking === 'former', dir: 'good', input: 'Smoking', source: ['jha2013'],
      text: 'quitting before ~40 avoids about 90% of the excess mortality of continued smoking',
    },
    {
      when: (v) => v.cardio >= 150, dir: 'good', input: 'Cardio', source: ['arem2015'],
      text: 'similar dose–response for cardiovascular and cancer mortality, not just all-cause',
    },
    {
      when: (v) => v.vo2maxOn && v.vo2max >= 42, dir: 'good', input: 'Fitness', source: ['mandsager2018'],
      text: 'elite-fitness patients had ~80% lower adjusted mortality than low-fitness ones — fitness is one of the strongest modifiable mortality markers, with no observed upper limit of benefit',
    },
    {
      when: (v) => v.alcohol > 14, dir: 'bad', input: 'Alcohol', source: ['wood2018'],
      text: 'higher risk of stroke (HR ≈ 1.14 per 100 g/week), heart failure and fatal hypertensive disease',
    },
    {
      when: (v) => v.alcohol > 0 && v.alcohol <= 14, dir: 'neutral', input: 'Alcohol', source: ['wood2018'],
      text: 'light-to-moderate intake was associated with slightly lower myocardial infarction risk (HR 0.94 per 100 g/week) — but no net all-cause benefit above ~7 drinks/week',
    },
    {
      when: (v) => v.coffee >= 3, dir: 'good', input: 'Coffee', source: ['poole2017'],
      text: 'associated with lower cardiovascular mortality (RR 0.81 at 3–4 cups/day)',
    },
    {
      when: (v) => v.coffee >= 5 && v.sex === 'female', dir: 'bad', input: 'Coffee', source: ['poole2017'],
      text: 'high intake was associated with increased fracture risk in women (not men)',
    },
    {
      when: (v) => v.sauna >= 4, dir: 'good', input: 'Sauna', source: ['laukkanen2015'],
      text: '4–7 sessions/week was associated with ~63% lower sudden cardiac death risk in Finnish men',
    },
    {
      when: (v) => v.strength >= 1, dir: 'good', input: 'Strength', source: ['momma2022'],
      text: 'associated with lower type-2 diabetes risk (L-shaped, strongest up to ~60 min/week)',
    },
    {
      when: (v) => v.fruitVeg >= 5, dir: 'good', input: 'Fruit & veg', source: ['wang2014'],
      text: 'lower cardiovascular mortality (HR ≈ 0.96 per serving/day); no clear cancer-mortality effect',
    },
    {
      when: (v) => v.social <= 1, dir: 'bad', input: 'Social', source: ['holtlunstad2010'],
      text: 'weak social ties carry a mortality risk comparable to well-established behavioural risk factors',
    },
    {
      when: (v) => v.magnesium >= 400, dir: 'good', input: 'Magnesium', source: ['fang2016'],
      text: 'higher dietary magnesium associated with lower heart-failure (RR 0.78 per 100 mg/day) and type-2 diabetes risk (RR 0.81)',
    },
    {
      when: (v) => v.cannabis === 'regular', dir: 'bad', input: 'Cannabis', source: ['moore2007'],
      text: 'regular use is associated with roughly doubled odds of psychotic outcomes (dose-dependent); evidence for depression/anxiety is weaker',
    },
    {
      when: (v) => v.cannabis !== 'never', dir: 'neutral', input: 'Cannabis', source: ['sidney1997'],
      text: 'no clear all-cause mortality increase in long-term cohorts — but "no mortality signal" is not the same as safe',
    },
    {
      when: (v) => v.vitaminD === 'supplement', dir: 'neutral', input: 'Vitamin D', source: ['manson2019'],
      text: 'VITAL RCT (26k people): 2000 IU/day did not reduce cancer, cardiovascular events or mortality in generally healthy adults',
    },
    {
      when: (v) => v.snus === 'yes', dir: 'bad', input: 'Snus', source: ['byhamre2021'],
      text: 'pooled Swedish cohorts: ~28% higher all-cause and ~27% higher cardiovascular mortality — safer than smoking, not safe',
    },
    {
      when: (v) => v.occupationalPA >= 6 && v.sex === 'male', dir: 'bad', input: 'Occupational PA', source: ['coenen2018'],
      text: 'the "physical activity paradox": heavy occupational activity tracked ~18% higher mortality in men — work strain and leisure exercise are not interchangeable',
    },
    {
      when: (v) => v.cognitiveTraining >= 1, dir: 'good', input: 'Brain training', source: ['edwards2017'],
      text: 'speed-of-processing training cut 10-year dementia risk ~29% in the ACTIVE trial — but gains are mostly domain-specific (you get better at the task itself)',
    },
    {
      when: (v) => v.ironDeficiency, dir: 'neutral', input: 'Iron', source: ['houston2018'],
      text: 'correcting non-anaemic iron deficiency reduced fatigue in RCTs (SMD −0.38) without improving measured physical capacity',
    },
    {
      when: (v) => v.stress >= 8, dir: 'bad', input: 'Stress', source: ['russ2012'],
      text: 'distress this severe tracks mortality even after adjusting for somatic illness, behaviour and socioeconomic factors',
    },
    {
      when: (v) => v.creatine && v.fruitVeg <= 2, dir: 'neutral', input: 'Creatine', source: ['avgerinos2018'],
      text: 'the cognitive effect is clearest in vegetarians and older/stressed individuals — meat eaters already get dietary creatine',
    },
    {
      when: (v) => v.processedMeat >= 7, dir: 'bad', input: 'Processed meat', source: ['pan2012'],
      text: 'each daily serving of processed meat tracked ~16% higher cancer mortality; IARC classifies processed meat as carcinogenic to humans (Group 1)',
    },
    {
      when: (v) => v.processedMeat >= 3, dir: 'good', input: 'Processed meat', source: ['pan2012'],
      text: 'swapping 1 daily serving of red meat for fish, poultry, nuts or legumes was associated with 7–19% lower mortality',
    },
    {
      when: (v) => v.ssb >= 7, dir: 'bad', input: 'Sugary drinks', source: ['malik2019'],
      text: 'driven mostly by cardiovascular mortality (HR 1.31 at ≥2/day); artificially sweetened drinks showed no clear association',
    },
    {
      when: (v) => v.fish !== 'none', dir: 'neutral', input: 'Fish', source: ['manson2019omega3'],
      text: 'omega-3 SUPPLEMENTS did not reduce major cardiovascular events, cancer or mortality in the VITAL RCT (a −28% heart-attack signal was secondary) — eating fish and taking pills are not the same experiment',
    },
    {
      when: (v) => v.omega3 === true, dir: 'neutral', input: 'Omega-3 supplements', source: ['manson2019omega3'],
      text: 'The VITAL RCT (26k people, 5.3 years) found that omega-3 supplements had no effect on mortality (HR 1.02, 0.90–1.15), cardiovascular events (HR 0.92, 0.80–1.06), or cancer (HR 1.03, 0.93–1.13) in generally healthy adults — all CIs include 1.0. The small benefits seen with eating fish do not replicate in a pill; the fish benefit appears to be about replacing meat, not about omega-3.',
    },
    {
      when: (v) => v.fish === 'lots' && v.processedMeat >= 3, dir: 'good', input: 'Fish', source: ['pan2012'],
      text: 'part of the fish benefit is likely substitution — fish on the plate often means processed meat off it',
    },
    {
      when: (v) => v.sitting >= 10 && v.cardio < 150, dir: 'bad', input: 'Sitting', source: ['biswas2015'],
      text: 'sedentary time hits hardest when leisure activity is low; its mortality association shrinks substantially in active people',
    },
    {
      when: (v) => v.purpose <= 3, dir: 'bad', input: 'Purpose', source: ['cohen2016'],
      text: 'a low sense of purpose tracks higher mortality in prospective cohorts — treat it as a signal worth taking seriously, not a diagnosis',
    },
    {
      when: (v) => v.gripOn && v.grip <= 25, dir: 'bad', input: 'Grip', source: ['leong2015'],
      text: 'in PURE, grip strength predicted all-cause mortality more strongly than systolic blood pressure did',
    },
    {
      when: (v) => v.nuts >= 20, dir: 'good', input: 'Nuts', source: ['aune2016nuts'],
      text: 'a handful a day was also associated with ~50% lower respiratory-disease and ~40% lower diabetes mortality',
    },
    {
      when: (v) => v.fiber >= 25, dir: 'good', input: 'Fiber', source: ['aune2016grain'],
      text: 'whole grains are likely part of your fiber benefit: RR 0.83 (0.77–0.90) per 3 servings/day — we don\'t count them separately to avoid double-counting',
    },
    {
      when: (v) => v.sleepRegularity <= 3, dir: 'bad', input: 'Sleep regularity', source: ['windred2024'],
      text: 'an irregular schedule predicted mortality more strongly than short sleep did in UK Biobank — a fixed wake time is a real lever, even before more hours',
    },
    {
      when: (v) => v.pm25 > 12, dir: 'bad', input: 'Air pollution', source: ['di2017'],
      text: 'above the US annual standard (12 µg/m³); WHO\'s guideline is 5 — HEPA purifiers, masks and route/location choices measurably reduce exposure',
    },
    {
      when: (v) => v.pm25 <= 5, dir: 'good', input: 'Air pollution', source: ['di2017'],
      text: 'at or below the WHO guideline for PM2.5 — but mortality risk keeps falling with every µg/m³, there\'s no clear safe floor',
    },
    {
      when: (v) => v.screenTime >= 6, dir: 'bad', input: 'Screen time', source: ['stamatakis2011'],
      text: 'screen-based entertainment ≥4 h/day tracked 1.5× all-cause mortality and 2.3× cardiovascular events in a Scottish cohort — that physical pathway is sitting and low fitness, which we count in those sliders rather than twice here',
    },
    {
      when: (v) => v.screenTime >= 4 && (v.cardio >= 150 || (v.vo2maxOn && v.vo2max >= 35)), dir: 'good', input: 'Screen time', source: ['celis2018'],
      text: 'UK Biobank (390k people): the screen-time–mortality association (HR 1.31 per 2 h/day in the least strong/fit) was null in people with high grip strength, fitness or activity (HR 1.04, NS) — the harm is largely the sitting, and fitness attenuates it',
    },
    {
      when: (v) => v.screenTime >= 5 && v.sleep < 7, dir: 'bad', input: 'Screen time', source: ['hale2015'],
      text: 'screens near bedtime displace and delay sleep — 90% of studies in a 67-study review found shorter or later sleep; if your sleep slider is set honestly, this is already counted there',
    },
    {
      when: (v) => v.screenTime <= 1, dir: 'neutral', input: 'Screen time', source: ['orben2019'],
      text: 'context: across 355k adolescents, digital-technology use explained at most 0.4% of wellbeing variation — at low-to-moderate use the measurable association is tiny either way',
    },
    {
      when: (v) => v.screenTime >= 3 && v.screenTime < 6, dir: 'neutral', input: 'Screen time', source: ['allcott2020'],
      text: 'in a randomized experiment, deactivating Facebook for 4 weeks improved subjective wellbeing — and reduced factual news knowledge; lower use persisted after the experiment',
    },
    {
      when: (v) => v.screenTime >= 7, dir: 'bad', input: 'Screen time', source: ['twenge2018'],
      text: 'in a US national sample, 7+ vs 1 h/day screen time tracked 2.4× diagnosed depression and 2.3× diagnosed anxiety in adolescents (cross-sectional — causality unclear)',
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
      authors: 'National Center for Health Statistics (CDC)',
      year: 2024,
      title: 'Deaths: Final Data for 2023 — life expectancy at birth 78.4 (male 75.8, female 81.1)',
      journal: 'National Vital Statistics Reports. VERIFY exact figures against the published report.',
      url: 'https://www.cdc.gov/nchs/fastats/life-expectancy.htm',
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
  },
};

// Dual export: browser global + CommonJS (for the node smoke tests).
if (typeof module !== 'undefined' && module.exports) module.exports = HEALTH_MODEL;
if (typeof globalThis !== 'undefined') globalThis.HEALTH_MODEL = HEALTH_MODEL;
