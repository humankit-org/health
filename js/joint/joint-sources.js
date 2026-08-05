/*
 * joint-sources.js — the 5 joint-only citations (mente2023, duncan2023, ekelund2016, sanchezlastra2021, weeldreyer2025)
 *
 * Part of the assembled ADVANCED model — see js/joint/index.js; the
 * base SIMPLE model lives in js/factors.js.
 *
 * Dual export (same pattern as factors.js/schema.js/engine.js):
 *   CommonJS  module.exports
 *   browser   globalThis.HEALTH_JOINT_SOURCES  (<script> loaded before js/joint/index.js)
 */
(function (root) {
  'use strict';

const jointSources = {
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
};

  if (typeof module !== 'undefined' && module.exports) module.exports = jointSources;
  if (root) root.HEALTH_JOINT_SOURCES = jointSources;
})(typeof self !== 'undefined' ? self : globalThis);
