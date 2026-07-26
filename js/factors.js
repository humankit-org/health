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
    updated: '2026-07-24',
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
    source: 'nchs2023',
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
      blurb: 'Population-average baseline for your sex, shifted by your combined mortality risk. A statistical sketch, not a prediction.',
      evidence: 'moderate',
    },
    {
      id: 'mortality',
      title: 'All-cause mortality risk',
      kind: 'hr',
      blurb: 'Relative mortality hazard vs. the reference lifestyle (HR 1.0). Ranges combine published 95% CIs assuming independence.',
      evidence: 'high',
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
      hint: 'Only used to pick the baseline life table.',
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
      min: 40, max: 180, step: 1, default: 68,
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
      min: 0, max: 600, step: 15, default: 0,
      hint: 'Brisk walking, cycling, jogging… count vigorous minutes double.',
      effects: [
        {
          output: 'mortality', type: 'steps', evidence: 'high', source: 'arem2015',
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
          output: 'happiness', type: 'steps', evidence: 'low', source: 'chekroud2018',
          steps: [
            { max: 0, points: 0 },
            { max: 149, points: 0.3 },
            { max: 449, points: 0.6 },
            { max: Infinity, points: 0.5 },
          ],
          note: '1.2M-person cross-sectional study: exercisers reported 43% fewer poor-mental-health days; best at ~45 min, 3–5x/week. Correlational.',
        },
        {
          output: 'cognition', type: 'steps', evidence: 'moderate', source: 'erickson2011',
          steps: [
            { max: 0, points: 0 },
            { max: 149, points: 0.2 },
            { max: Infinity, points: 0.4 },
          ],
          note: 'RCT in 120 older adults: 1 year of aerobic exercise grew hippocampal volume ~2% and improved spatial memory.',
        },
      ],
    },
    {
      id: 'strength',
      group: 'movement',
      label: 'Strength training',
      kind: 'slider',
      unit: 'sessions/week',
      min: 0, max: 5, step: 1, default: 0,
      hint: 'Lifting, bodyweight training… assume ~30 min per session.',
      effects: [
        {
          output: 'mortality', type: 'steps', evidence: 'moderate', source: 'momma2022',
          steps: [
            { max: 0, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 1, hr: 0.92, hrLow: 0.88, hrHigh: 0.96 },
            { max: 2, hr: 0.85, hrLow: 0.80, hrHigh: 0.90 },
            { max: Infinity, hr: 0.88, hrLow: 0.82, hrHigh: 0.95 },
          ],
          note: 'Meta-analysis: 10–17% lower all-cause mortality, max benefit ~30–60 min/week; J-shaped (more is not clearly better). CI bounds approximate — verify against paper Fig. 2.',
        },
        {
          output: 'happiness', type: 'steps', evidence: 'moderate', source: 'gordon2018',
          steps: [
            { max: 0, points: 0 },
            { max: Infinity, points: 0.3 },
          ],
          note: 'Meta-analysis of 33 RCTs: resistance training reduced depressive symptoms (effect size 0.66, NNT 4).',
        },
        {
          output: 'cognition', type: 'steps', evidence: 'low', source: 'momma2022',
          steps: [
            { max: 1, points: 0 },
            { max: Infinity, points: 0.2 },
          ],
          note: 'Weak/small effects on executive function in meta-analyses of older adults; indirect citation — replace with a dedicated source.',
        },
      ],
    },

    {
      id: 'occupationalPA',
      group: 'movement',
      label: 'Physical activity at work',
      kind: 'slider',
      unit: 'hours/day',
      min: 0, max: 10, step: 1, default: 0,
      hint: 'Heavy physical work (construction, nursing, warehouse…). Not the same as leisure exercise!',
      effects: [
        {
          output: 'mortality', type: 'steps', evidence: 'moderate', source: 'coenen2018',
          steps: [
            { max: 2, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 6, hr: 1.10, hrLow: 1.03, hrHigh: 1.20 },
            { max: Infinity, hr: 1.18, hrLow: 1.05, hrHigh: 1.34 },
          ],
          note: 'The "physical activity paradox": meta-analysis (194k workers) found HIGH occupational activity → HR 1.18 in MEN (women: HR 0.90, NS). Middle step interpolated. Leisure activity benefits don\'t transfer to heavy work.',
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
      min: 0, max: 50, step: 1, default: 0,
      hint: 'Vegetables, fruit, legumes, whole grains. US average ≈ 15 g/day.',
      effects: [
        {
          output: 'mortality', type: 'perUnit', per: 10, capAt: 30,
          hr: 0.90, hrLow: 0.86, hrHigh: 0.94,
          evidence: 'high', source: 'yang2015',
          note: 'Meta-analysis (17 cohorts, ~1M people): RR 0.90 (0.86–0.94) per +10 g/day. Benefit capped at 30 g/day in this model; the top-vs-bottom-tertile comparison (RR 0.84) suggests the linear dose may overstate at high intakes.',
        },
      ],
    },
    {
      id: 'fruitVeg',
      group: 'diet',
      label: 'Fruit & vegetables',
      kind: 'slider',
      unit: 'servings/day',
      min: 0, max: 10, step: 0.5, default: 0,
      hint: 'One serving ≈ 80 g — a fist-sized portion.',
      effects: [
        {
          output: 'mortality', type: 'perUnit', per: 1, capAt: 5,
          hr: 0.95, hrLow: 0.92, hrHigh: 0.98,
          evidence: 'high', source: 'wang2014',
          note: 'Dose-response meta-analysis (16 cohorts): HR 0.95 (0.92–0.98) per serving/day, plateauing around 5 servings.',
        },
        {
          output: 'happiness', type: 'steps', evidence: 'low', source: 'wang2014',
          steps: [
            { max: 4.9, points: 0 },
            { max: Infinity, points: 0.15 },
          ],
          note: 'Fruit/veg intake correlates with wellbeing in observational data; causal effect unproven. Indirect citation — replace with a dedicated source.',
        },
      ],
    },
    {
      id: 'alcohol',
      group: 'diet',
      label: 'Alcohol',
      kind: 'slider',
      unit: 'drinks/week',
      min: 0, max: 30, step: 1, default: 0,
      hint: 'One drink ≈ 14 g ethanol (a beer, glass of wine, or shot).',
      effects: [
        {
          output: 'mortality', type: 'steps', evidence: 'high', source: 'wood2018',
          steps: [
            { max: 7, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 14, hr: 1.05, hrLow: 1.03, hrHigh: 1.07 },
            { max: 25, hr: 1.16, hrLow: 1.10, hrHigh: 1.22 },
            { max: Infinity, hr: 1.56, hrLow: 1.49, hrHigh: 1.64 },
          ],
          note: '83 studies, 600k drinkers: minimum risk ≤100 g/wk (~7 drinks); above that, life expectancy at 40 fell ~0.5 y (>100–200 g/wk), 1–2 y (200–350), 4–5 y (>350). HRs here are those published year-losses converted via the Gompertz constant. Reference is light drinkers; abstainer-bias debate noted.',
        },
        {
          output: 'cognition', type: 'steps', evidence: 'moderate', source: 'wood2018',
          steps: [
            { max: 14, points: 0 },
            { max: Infinity, points: -0.4 },
          ],
          note: 'Heavy drinking is associated with worse cognitive outcomes; moderate intake effects unclear. Indirect citation — replace with a dedicated source.',
        },
        {
          output: 'happiness', type: 'steps', evidence: 'low', source: 'wood2018',
          steps: [
            { max: 14, points: 0 },
            { max: Infinity, points: -0.3 },
          ],
          note: 'Heavy alcohol use co-occurs with lower wellbeing; direction of causality unclear. Indirect citation — replace with a dedicated source.',
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
      hint: 'Cigarettes. The single biggest lever in this model.',
      effects: [
        {
          output: 'mortality', type: 'byOption', evidence: 'high', source: 'jha2013',
          byOption: {
            never: { hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            former: { hr: 1.30, hrLow: 1.15, hrHigh: 1.45 },
            current: { hr: 2.90, hrLow: 2.40, hrHigh: 3.30 },
          },
          note: 'US nationally representative: current smokers HR ≈ 2.8 (men)–3.0 (women), >10 years of life lost. Quitting before 40 avoids ~90% of the excess risk; the "former" value is an average — it depends heavily on quit age and dose.',
        },
        {
          output: 'cognition', type: 'byOption', evidence: 'low', source: 'jha2013',
          byOption: { never: { points: 0 }, former: { points: -0.05 }, current: { points: -0.2 } },
          note: 'Smoking is associated with faster cognitive decline in cohort studies. Indirect citation — replace with a dedicated source.',
        },
        {
          output: 'happiness', type: 'byOption', evidence: 'low', source: 'jha2013',
          byOption: { never: { points: 0 }, former: { points: -0.05 }, current: { points: -0.2 } },
          note: 'Smokers report lower wellbeing on average, but causality is entangled with dependence and withdrawal. Indirect citation — replace with a dedicated source.',
        },
      ],
    },
    {
      id: 'coffee',
      group: 'diet',
      label: 'Coffee',
      kind: 'slider',
      unit: 'cups/day',
      min: 0, max: 6, step: 1, default: 0,
      hint: 'Regular or decaf — the umbrella review covers both.',
      effects: [
        {
          output: 'mortality', type: 'steps', evidence: 'moderate', source: 'poole2017',
          steps: [
            { max: 0, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 2, hr: 0.90, hrLow: 0.86, hrHigh: 0.95 },
            { max: 4, hr: 0.83, hrLow: 0.79, hrHigh: 0.88 },
            { max: Infinity, hr: 0.88, hrLow: 0.82, hrHigh: 0.95 },
          ],
          note: 'Umbrella review: largest all-cause risk reduction at 3–4 cups/day (RR 0.83, 0.79–0.88). The 1–2 and 5+ steps are interpolated/U-shaped approximations — verify against the paper.',
        },
      ],
    },

    {
      id: 'snus',
      group: 'diet',
      label: 'Snus / smokeless tobacco',
      kind: 'segmented',
      default: 'no',
      options: [
        { value: 'no', label: 'No' },
        { value: 'yes', label: 'Yes' },
      ],
      hint: 'Swedish-style snus has the best data. Less harmful than smoking — not harmless.',
      effects: [
        {
          output: 'mortality', type: 'byOption', evidence: 'moderate', source: 'byhamre2021',
          byOption: {
            no: { hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            yes: { hr: 1.28, hrLow: 1.20, hrHigh: 1.35 },
          },
          note: 'Pooled 8 Swedish cohorts, 169k never-smoking men: exclusive current snus use → aHR 1.28 all-cause, 1.27 cardiovascular, 1.12 cancer mortality. Men-only data; other smokeless products may differ.',
        },
      ],
    },
    {
      id: 'cannabis',
      group: 'diet',
      label: 'Cannabis',
      kind: 'segmented',
      default: 'never',
      options: [
        { value: 'never', label: 'Never' },
        { value: 'occasional', label: 'Occasional' },
        { value: 'regular', label: 'Regular' },
      ],
      hint: 'Smoked or otherwise. Honest summary: mortality data weak, mental-health data concerning.',
      effects: [
        {
          output: 'mortality', type: 'byOption', evidence: 'low', source: 'sidney1997',
          byOption: {
            never: { hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            occasional: { hr: 1.05, hrLow: 0.90, hrHigh: 1.25 },
            regular: { hr: 1.12, hrLow: 0.89, hrHigh: 1.39 },
          },
          note: 'Kaiser Permanente cohort (65k): current use NOT significantly associated with mortality (men RR 1.12, CI crosses 1.0). An honest null — but "no mortality signal" ≠ safe; see findings below. Smoked cannabis likely shares combustion harms with tobacco (not yet quantified).',
        },
        {
          output: 'cognition', type: 'byOption', evidence: 'low', source: 'moore2007',
          byOption: { never: { points: 0 }, occasional: { points: -0.1 }, regular: { points: -0.3 } },
          note: 'Systematic review: psychosis risk rises dose-dependently (ever-use OR 1.41; heavy use OR 2.09). Evidence for depression/anxiety outcomes less consistent. Cognitive points are qualitative.',
        },
        {
          output: 'happiness', type: 'byOption', evidence: 'low', source: 'moore2007',
          byOption: { never: { points: 0 }, occasional: { points: -0.05 }, regular: { points: -0.25 } },
          note: 'Affective outcomes (depression, anxiety) associated in some cohorts but confounding is substantial — the review calls the evidence "less strong" than for psychosis.',
        },
      ],
    },
    {
      id: 'magnesium',
      group: 'diet',
      label: 'Dietary magnesium',
      kind: 'slider',
      unit: 'mg/day',
      min: 0, max: 600, step: 10, default: 250,
      hint: 'Nuts, legumes, whole grains, leafy greens. Typical intake ≈ 250–350 mg/day.',
      effects: [
        {
          output: 'mortality', type: 'perUnit', per: 100, ref: 250, capAt: 450,
          hr: 0.90, hrLow: 0.81, hrHigh: 0.99,
          evidence: 'moderate', source: 'fang2016',
          note: 'Dose-response meta-analysis (40 cohorts, >1M people): RR 0.90 (0.81–0.99) per +100 mg/day, anchored here at 250 mg and capped at 450 mg. Dietary intake — partly a marker of overall diet quality; supplement trials are weaker.',
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
      min: 4, max: 11, step: 0.5, default: 7.5,
      hint: 'Habitual sleep duration.',
      effects: [
        {
          output: 'mortality', type: 'steps', evidence: 'high', source: 'cappuccio2010',
          steps: [
            { max: 6.9, hr: 1.12, hrLow: 1.06, hrHigh: 1.18 },
            { max: 9.0, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: Infinity, hr: 1.30, hrLow: 1.22, hrHigh: 1.38 },
          ],
          note: 'Meta-analysis (16 studies, 1.4M people): short sleep RR 1.12, long sleep RR 1.30. U-shaped; long sleep may partly reflect illness (reverse causation).',
        },
        {
          output: 'cognition', type: 'steps', evidence: 'low', source: 'cappuccio2010',
          steps: [
            { max: 6.4, points: -0.5 },
            { max: 9.4, points: 0 },
            { max: Infinity, points: -0.2 },
          ],
          note: 'Sleep loss acutely impairs attention and memory (well-established experimentally); points here are a qualitative extrapolation. Replace with a dedicated source.',
        },
        {
          output: 'happiness', type: 'steps', evidence: 'low', source: 'cappuccio2010',
          steps: [
            { max: 6.4, points: -0.4 },
            { max: 9.4, points: 0 },
            { max: Infinity, points: -0.1 },
          ],
          note: 'Short sleep is strongly tied to same-day mood; bidirectional. Indirect citation — replace with a dedicated source.',
        },
      ],
    },
    {
      id: 'stress',
      group: 'mind',
      label: 'Perceived stress',
      kind: 'slider',
      unit: '/ 10',
      min: 1, max: 10, step: 1, default: 2,
      hint: '1 = calm, 10 = overwhelmed, most days.',
      effects: [
        {
          output: 'mortality', type: 'steps', evidence: 'high', source: 'russ2012',
          steps: [
            { max: 3, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 6, hr: 1.20, hrLow: 1.13, hrHigh: 1.27 },
            { max: 8, hr: 1.43, hrLow: 1.31, hrHigh: 1.56 },
            { max: Infinity, hr: 1.94, hrLow: 1.66, hrHigh: 2.26 },
          ],
          note: 'Pooled 68k adults: psychological distress (GHQ-12) predicted mortality dose-dependently — HR 1.20 / 1.43 / 1.94 for rising distress tiers. Our 1–10 slider is mapped onto those tiers.',
        },
        {
          output: 'cognition', type: 'steps', evidence: 'low', source: 'russ2012',
          steps: [
            { max: 7, points: 0 },
            { max: Infinity, points: -0.4 },
          ],
          note: 'Chronic stress impairs working memory and attention experimentally; points are a qualitative extrapolation. Replace with a dedicated source.',
        },
        {
          output: 'happiness', type: 'steps', evidence: 'low', source: 'russ2012',
          steps: [
            { max: 3, points: 0 },
            { max: 7, points: -0.2 },
            { max: Infinity, points: -0.8 },
          ],
          note: 'Near-tautological (stress and unhappiness overlap by definition); included so the slider visibly does something.',
        },
      ],
    },
    {
      id: 'social',
      group: 'mind',
      label: 'Time with friends & family',
      kind: 'slider',
      unit: 'days/week',
      min: 0, max: 7, step: 1, default: 5,
      hint: 'Days with meaningful in-person social contact.',
      effects: [
        {
          output: 'mortality', type: 'steps', evidence: 'moderate', source: 'holtlunstad2010',
          steps: [
            { max: 1, hr: 1.35, hrLow: 1.25, hrHigh: 1.45 },
            { max: 3, hr: 1.15, hrLow: 1.08, hrHigh: 1.22 },
            { max: Infinity, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
          ],
          note: 'Meta-analysis (148 studies): stronger social relationships → 50% higher survival odds (OR 1.50, 1.42–1.59). HRs here approximate that OR; strongest for complex social integration (OR 1.91).',
        },
        {
          output: 'happiness', type: 'steps', evidence: 'low', source: 'holtlunstad2010',
          steps: [
            { max: 1, points: -0.5 },
            { max: 3, points: -0.1 },
            { max: Infinity, points: 0 },
          ],
          note: 'Social connection is among the strongest correlates of life satisfaction; correlational. Indirect citation — replace with a dedicated source.',
        },
      ],
    },

    {
      id: 'meditation',
      group: 'mind',
      label: 'Meditation',
      kind: 'slider',
      unit: 'min/week',
      min: 0, max: 300, step: 15, default: 0,
      hint: 'Mindfulness-style practice.',
      effects: [
        {
          output: 'happiness', type: 'steps', evidence: 'moderate', source: 'goyal2014',
          steps: [
            { max: 0, points: 0 },
            { max: 59, points: 0.1 },
            { max: Infinity, points: 0.3 },
          ],
          note: 'Meta-analysis of 47 RCTs with active controls: mindfulness meditation gave small-moderate reductions in anxiety (effect size 0.38) and depression (0.30) — but no evidence it beats other active treatments (exercise, therapy).',
        },
      ],
    },

    // -------------------------------------------------------------- Extras
    {
      id: 'sauna',
      group: 'extras',
      label: 'Sauna',
      kind: 'slider',
      unit: 'sessions/week',
      min: 0, max: 7, step: 1, default: 0,
      hint: 'Finnish-style sauna.',
      effects: [
        {
          output: 'mortality', type: 'steps', evidence: 'low', source: 'laukkanen2015',
          steps: [
            { max: 1, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 3, hr: 0.75, hrLow: 0.64, hrHigh: 0.90 },
            { max: Infinity, hr: 0.60, hrLow: 0.45, hrHigh: 0.81 },
          ],
          note: 'Single Finnish cohort of 2315 men: 4–7 vs 1 session/wk → ~40% lower all-cause mortality (unadjusted deaths 30.8% vs 49.1%). Observational, one population, likely residual confounding — treat as speculative. Exact adjusted all-cause HRs to be verified against paper Table 2.',
        },
      ],
    },
    {
      id: 'creatine',
      group: 'extras',
      label: 'Creatine (~5 g/day)',
      kind: 'toggle',
      default: false,
      hint: 'Creatine monohydrate supplementation.',
      effects: [
        {
          output: 'cognition', type: 'toggle', points: 0.5,
          evidence: 'moderate', source: 'avgerinos2018',
          note: 'Systematic review of RCTs: creatine improved short-term memory and reasoning; effect clearer in vegetarians, older and stressed individuals. Other domains unclear.',
        },
      ],
    },
    {
      id: 'vitaminD',
      group: 'extras',
      label: 'Vitamin D status',
      kind: 'segmented',
      default: 'sufficient',
      options: [
        { value: 'deficient', label: 'Deficient' },
        { value: 'sufficient', label: 'Sufficient' },
        { value: 'supplement', label: 'I supplement' },
      ],
      hint: 'Best guess of your 25(OH)D level if you haven\'t measured it.',
      effects: [
        {
          output: 'mortality', type: 'byOption', evidence: 'moderate', source: 'schottker2014',
          byOption: {
            deficient: { hr: 1.57, hrLow: 1.36, hrHigh: 1.81 },
            sufficient: { hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            supplement: { hr: 0.99, hrLow: 0.87, hrHigh: 1.12 },
          },
          note: 'Deficiency (bottom vs top quintile) → RR 1.57 in pooled cohorts — BUT the VITAL RCT (26k people) found supplements did NOT reduce cancer, CVD or mortality (HR 0.99). Deficiency likely marks poor health; whether correcting it helps is unresolved.',
        },
        {
          output: 'cognition', type: 'byOption', evidence: 'low', source: 'schottker2014',
          byOption: { deficient: { points: -0.2 }, sufficient: { points: 0 }, supplement: { points: 0 } },
          note: 'Deficiency is associated with worse cognitive outcomes observationally; supplementation trials show no clear cognitive benefit. Indirect citation — replace with a dedicated source.',
        },
      ],
    },
    {
      id: 'ironDeficiency',
      group: 'extras',
      label: 'Untreated iron deficiency',
      kind: 'toggle',
      default: false,
      hint: 'Low ferritin without anaemia — common in menstruating women, vegetarians, endurance athletes. Ask for a ferritin test.',
      effects: [
        {
          output: 'happiness', type: 'toggle', points: -0.4,
          evidence: 'moderate', source: 'houston2018',
          note: 'RCT meta-analysis: correcting non-anaemic iron deficiency REDUCES fatigue (SMD −0.38) — so leaving it untreated costs you that. No effect on measured physical capacity.',
        },
        {
          output: 'cognition', type: 'toggle', points: -0.2,
          evidence: 'low', source: 'houston2018',
          note: 'Iron deficiency is linked to reduced attention/cognitive performance, mostly studied in children and anaemic patients; effect size in non-anaemic adults unclear. Indirect citation — replace with a dedicated source.',
        },
      ],
    },
    {
      id: 'cognitiveTraining',
      group: 'extras',
      label: 'Brain training (puzzles, sudoku)',
      kind: 'slider',
      unit: 'sessions/week',
      min: 0, max: 7, step: 1, default: 0,
      hint: 'Sudoku, crosswords, brain-training apps.',
      effects: [
        {
          output: 'cognition', type: 'steps', evidence: 'low', source: 'edwards2017',
          steps: [
            { max: 0, points: 0 },
            { max: Infinity, points: 0.15 },
          ],
          note: 'ACTIVE trial: speed-of-processing training cut 10-year dementia risk ~29% — but gains are mostly domain-specific (you get better at the task). Broad "brain boost" from puzzles is unproven.',
        },
      ],
    },

    // ------------------- Advanced (measured values, optional) -------------
    {
      id: 'vo2maxOn',
      group: 'advanced',
      label: 'I know my VO2 max',
      kind: 'toggle',
      default: false,
      hint: 'From a lab test or a good wearable estimate.',
      effects: [],
    },
    {
      id: 'vo2max',
      group: 'advanced',
      label: 'VO2 max',
      kind: 'slider',
      unit: 'ml/kg/min',
      min: 20, max: 60, step: 1, default: 35,
      gatedBy: 'vo2maxOn',
      hint: 'When enabled, this REPLACES the cardio estimate — measured fitness predicts mortality better than reported activity.',
      effects: [
        {
          output: 'mortality', type: 'perUnit', per: 3.5, ref: 28, capAt: 56,
          hr: 0.87, hrLow: 0.84, hrHigh: 0.90,
          evidence: 'high', source: 'kodama2009',
          note: 'Meta-analysis (33 studies): RR 0.87 (0.84–0.90) per 1-MET (3.5 ml/kg/min) higher fitness, anchored at 28 (low-average) and capped at 56. Corroborated by Mandsager 2018: elite vs low fitness HR 0.20.',
        },
      ],
    },
    {
      id: 'bodyFatOn',
      group: 'advanced',
      label: 'I know my body fat %',
      kind: 'toggle',
      default: false,
      hint: 'From DEXA, impedance scale, or calipers.',
      effects: [],
    },
    {
      id: 'bodyFat',
      group: 'advanced',
      label: 'Body fat',
      kind: 'slider',
      unit: '%',
      min: 5, max: 55, step: 1, default: 22,
      gatedBy: 'bodyFatOn',
      hint: 'When enabled, this REPLACES the BMI estimate.',
      effects: [
        {
          output: 'mortality', type: 'steps', evidence: 'moderate', source: 'jayedi2022',
          steps: [
            { max: 18, hr: 1.15, hrLow: 1.05, hrHigh: 1.30 },
            { max: 28, hr: 1.00, hrLow: 1.00, hrHigh: 1.00 },
            { max: 38, hr: 1.11, hrLow: 1.02, hrHigh: 1.20 },
            { max: Infinity, hr: 1.23, hrLow: 1.04, hrHigh: 1.44 },
          ],
          note: 'Dose-response meta-analysis (35 cohorts, 923k people): J-shaped, lowest risk near 25%; HR ~1.11 per +10% BF above that. Sex-specific ideal ranges differ; our steps are unisex approximations — verify against the paper.',
        },
      ],
    },
  ],

  // Derived input: BMI computed from heightCm/weightKg, then this effect applies.
  bmi: {
    label: 'BMI (derived)',
    evidence: 'high',
    source: 'diangelantonio2016',
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
  },

  /*
   * Findings: sourced facts that don't fit on a slider (disease-specific
   * outcomes, honest nulls, caveats). Shown only when `when(values)` is true,
   * so the list reacts to the current inputs. dir: good | bad | neutral.
   */
  findings: [
    {
      when: (v) => v.smoking === 'current', dir: 'bad', input: 'Smoking', source: 'jha2013',
      text: 'markedly increased risk of lung cancer, COPD and vascular disease — most of the excess mortality in smokers comes from these causes',
    },
    {
      when: (v) => v.smoking === 'former', dir: 'good', input: 'Smoking', source: 'jha2013',
      text: 'quitting before ~40 avoids about 90% of the excess mortality of continued smoking',
    },
    {
      when: (v) => v.cardio >= 150, dir: 'good', input: 'Cardio', source: 'arem2015',
      text: 'similar dose–response for cardiovascular and cancer mortality, not just all-cause',
    },
    {
      when: (v) => v.vo2maxOn && v.vo2max >= 42, dir: 'good', input: 'Fitness', source: 'mandsager2018',
      text: 'elite-fitness patients had ~80% lower adjusted mortality than low-fitness ones — fitness is one of the strongest modifiable mortality markers, with no observed upper limit of benefit',
    },
    {
      when: (v) => v.alcohol > 14, dir: 'bad', input: 'Alcohol', source: 'wood2018',
      text: 'higher risk of stroke (HR ≈ 1.14 per 100 g/week), heart failure and fatal hypertensive disease',
    },
    {
      when: (v) => v.alcohol > 0 && v.alcohol <= 14, dir: 'neutral', input: 'Alcohol', source: 'wood2018',
      text: 'light-to-moderate intake was associated with slightly lower myocardial infarction risk (HR 0.94 per 100 g/week) — but no net all-cause benefit above ~7 drinks/week',
    },
    {
      when: (v) => v.coffee >= 3, dir: 'good', input: 'Coffee', source: 'poole2017',
      text: 'associated with lower cardiovascular mortality (RR 0.81 at 3–4 cups/day)',
    },
    {
      when: (v) => v.coffee >= 5 && v.sex === 'female', dir: 'bad', input: 'Coffee', source: 'poole2017',
      text: 'high intake was associated with increased fracture risk in women (not men)',
    },
    {
      when: (v) => v.sauna >= 4, dir: 'good', input: 'Sauna', source: 'laukkanen2015',
      text: '4–7 sessions/week was associated with ~63% lower sudden cardiac death risk in Finnish men',
    },
    {
      when: (v) => v.strength >= 1, dir: 'good', input: 'Strength', source: 'momma2022',
      text: 'associated with lower type-2 diabetes risk (L-shaped, strongest up to ~60 min/week)',
    },
    {
      when: (v) => v.fruitVeg >= 5, dir: 'good', input: 'Fruit & veg', source: 'wang2014',
      text: 'lower cardiovascular mortality (HR ≈ 0.96 per serving/day); no clear cancer-mortality effect',
    },
    {
      when: (v) => v.social <= 1, dir: 'bad', input: 'Social', source: 'holtlunstad2010',
      text: 'weak social ties carry a mortality risk comparable to well-established behavioural risk factors',
    },
    {
      when: (v) => v.magnesium >= 400, dir: 'good', input: 'Magnesium', source: 'fang2016',
      text: 'higher dietary magnesium associated with lower heart-failure (RR 0.78 per 100 mg/day) and type-2 diabetes risk (RR 0.81)',
    },
    {
      when: (v) => v.cannabis === 'regular', dir: 'bad', input: 'Cannabis', source: 'moore2007',
      text: 'regular use is associated with roughly doubled odds of psychotic outcomes (dose-dependent); evidence for depression/anxiety is weaker',
    },
    {
      when: (v) => v.cannabis !== 'never', dir: 'neutral', input: 'Cannabis', source: 'sidney1997',
      text: 'no clear all-cause mortality increase in long-term cohorts — but "no mortality signal" is not the same as safe',
    },
    {
      when: (v) => v.vitaminD === 'supplement', dir: 'neutral', input: 'Vitamin D', source: 'manson2019',
      text: 'VITAL RCT (26k people): 2000 IU/day did not reduce cancer, cardiovascular events or mortality in generally healthy adults',
    },
    {
      when: (v) => v.snus === 'yes', dir: 'bad', input: 'Snus', source: 'byhamre2021',
      text: 'pooled Swedish cohorts: ~28% higher all-cause and ~27% higher cardiovascular mortality — safer than smoking, not safe',
    },
    {
      when: (v) => v.occupationalPA >= 6 && v.sex === 'male', dir: 'bad', input: 'Occupational PA', source: 'coenen2018',
      text: 'the "physical activity paradox": heavy occupational activity tracked ~18% higher mortality in men — work strain and leisure exercise are not interchangeable',
    },
    {
      when: (v) => v.cognitiveTraining >= 1, dir: 'good', input: 'Brain training', source: 'edwards2017',
      text: 'speed-of-processing training cut 10-year dementia risk ~29% in the ACTIVE trial — but gains are mostly domain-specific (you get better at the task itself)',
    },
    {
      when: (v) => v.ironDeficiency, dir: 'neutral', input: 'Iron', source: 'houston2018',
      text: 'correcting non-anaemic iron deficiency reduced fatigue in RCTs (SMD −0.38) without improving measured physical capacity',
    },
    {
      when: (v) => v.stress >= 8, dir: 'bad', input: 'Stress', source: 'russ2012',
      text: 'distress this severe tracks mortality even after adjusting for somatic illness, behaviour and socioeconomic factors',
    },
    {
      when: (v) => v.creatine && v.fruitVeg <= 2, dir: 'neutral', input: 'Creatine', source: 'avgerinos2018',
      text: 'the cognitive effect is clearest in vegetarians and older/stressed individuals — meat eaters already get dietary creatine',
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
  },
};

// Dual export: browser global + CommonJS (for the node smoke tests).
if (typeof module !== 'undefined' && module.exports) module.exports = HEALTH_MODEL;
if (typeof globalThis !== 'undefined') globalThis.HEALTH_MODEL = HEALTH_MODEL;
