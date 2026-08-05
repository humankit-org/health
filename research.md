# Research — the verified evidence base

The scientific research behind the model. Every number in `js/factors.js`
carries its own `source` + `note` + `evidence` next to it (golden rule); this
file is the deeper record: exact cells, adjustment sets, caveats, and the
reasoning behind the ρ values. Read the relevant section **before changing any
number, ρ, or joint model** — and always re-check the primary source (these
records were verified against PubMed/EuropePMC/full text on the dates shown;
a "verify" flag means it still needs the project's standard pass).

Organisation: the file is sorted by research topic (calibration → diet →
movement → adiposity → psychosocial → substances → residual pairs → the sweep
audit), mirroring the model's clusters.

## 1. Calibration anchors & the independence qualifier

### 1.1 Ezzati 2003 — when multiplying risks is valid

Ezzati M, et al. *Lancet* 362:271–80, PMID 12892956. Combining risk factors
under an independence assumption is a published WHO/GBD-family method,
*valid when the factors are weakly correlated and do not share pathways* —
that qualifier is the entire conflation problem in one sentence. Verified
web 2026-08-02.

### 1.2 Li 2018 — 5-factor lifestyle score (US) — primary calibration anchor

**Li Y, et al. *Circulation* 138:345–55, DOI 10.1161/CIRCULATIONAHA.117.032047,
PMID 29712712, PMC6207481** (verified at the paper). NHS 1980–2014 n=78,865 +
HPFS 1986–2014 n=44,354; 42,167 deaths, ≤34 y follow-up. 5-vs-0 low-risk
factors:

- All-cause **HR 0.26 (0.22–0.31)**; cancer 0.35 (0.27–0.45); CVD 0.18
  (0.12–0.26).
- Life expectancy at age 50, 5 vs 0 factors: **+14.0 y women (11.8–16.2),
  +12.2 y men (10.1–14.2)**. (A pre-registration draft said 14.9/12.4 — wrong;
  the published deltas are 14.0/12.2.)
- Absolute LE at 50: 0 factors 29.0 y F / 25.5 y M; 5 factors 43.1 y F /
  37.6 y M.
- Low-risk definitions: never smoking; BMI 18.5–24.9; ≥30 min/d MVPA
  (≈ ≥210 min/wk); moderate alcohol 5–15 g/d F / 5–30 g/d M; diet upper-40%
  AHEI. HRs mutually adjusted.

### 1.3 Sun 2022 — 5-factor lifestyle score (China) — cross-check anchor

**Sun Q, et al. *Lancet Public Health* 7(12):e994–e1004, DOI
10.1016/S2468-2667(22)00110-4, PMID 35926549** (CKB n=487,209 primary, 42,496
deaths, median 11.1 y follow-up; verified at the paper):

- 5 vs 0–1 low-risk factors: **aHR 0.38 (0.34–0.43)**; CVD 0.37 (0.30–0.46);
  cancer 0.47 (0.39–0.56); CRD 0.30 (0.14–0.64).
- LE at age 30, 5 vs 0–1: **+8.8 y men (6.8–10.7), +8.1 y women (6.5–9.9)**.
- Factors: never smoking or quit-not-for-illness; no excessive alcohol;
  physically active; healthy eating; healthy body shape (waist-based, NOT
  BMI-only). NOTE: reference is 0–1 factors and LE is at age 30, not 50.

### 1.4 Pre-registered profile mapping + tolerance bands (frozen)

Pre-registered 2026-07-31 so Phase 3.6 could not tune the mapping to pass.
Both profiles: height 170 cm; everything not listed at default (cancels in the
ratio); sex run separately (baseline LE only).

| Factor (Li 2018) | Profile A ("5") | Profile B ("0") |
|---|---|---|
| Smoking | `never` | `current` |
| BMI (via weight) | 22.0 (63.6 kg) | 30.0 (86.7 kg) |
| PA ≥30 min/d MVPA | cardio 210 min/wk | cardio 0 |
| Diet (AHEI top 40%) | fiber 30, fruitVeg 5, fish `lots`, nuts 30, Mg 350, processedMeat 0, ssb 0, coffee 2 | fiber 5, fruitVeg 0, fish `none`, nuts 0, Mg 100, processedMeat 7, ssb 3, coffee 0 |
| Alcohol | **2.5 drinks/wk (held)** | **2.5 drinks/wk (held)** |

Mapping decisions: (1) alcohol held at 2.5 both sides — our reference stratum
is light drinkers ≤7/wk (HR 1.0), any value in [0,7] cancels; Li's "0"
category mixes abstainers + heavy drinkers and we don't penalize abstainers.
(2) strength/steps/sitting/occupationalPA/sleep/mind inputs stay at defaults
(not in Li's score). (3) Metric = RAW ratio `raw.hr(A)/raw.hr(B)` from
`engine.evaluateRaw`; years via `engine.hrToYears` (Gompertz, mrrtYears=7 —
an approximation, documented caveat).

Tolerance bands (falsifiable, NOT widen-able): primary Li 2018 **ratio in
[0.22, 0.31]** (target 0.26); years 11.8–16.2 F / 10.1–14.2 M. Cross-check Sun
2022 **[0.34, 0.43]** (target 0.38). Failure → debug mapping/engine machinery,
never the band; coefficients frozen during the calibration run.

**Baseline probe (pre-refactor, 2026-07-31):** ratio 0.041 (target 0.26,
~6× too strong), 32.3 y — the expected-fail evidence of the conflation
problem.

**Phase 3.6 result (2026-08-02, after all machinery shipped):** ratio 0.112
(A 0.2204 / B 1.9722) — ~2.7× better but still BELOW both bands. Per the
pre-registration this is an honest FAIL: coefficients, mapping, bands frozen;
**no ρ or coefficient change was made to force the band**; the consequence is
a widened uncertainty range for extreme profiles (bounds endpoints spread),
not a relaxed coefficient set. Live attribution at the anchor contrast: the
residual overclaim sits in the cross-cluster "fair zone" — smoking alone 0.345
(Jha's never-vs-current 2.9 marginal vs the 5-factor cohort's mutually-adjusted
estimate), diet 0.423, cardio 0.88 (ekelundTable partial gradient), BMI ~flat
0.98 (Mayo reads ~1.0 between BMI 22 and 30 at these activity levels).

## 2. Diet cluster

### 2.1 PURE diet score — Mente 2023 (verified 2026-07-31)

**Mente A, et al. *Eur Heart J* 2023;44(28):2560–80. DOI
10.1093/eurheartj/ehad269 (PMID 37414411**; full text read).

- **6 components:** fruit, vegetables, nuts, legumes, fish, dairy (mainly
  whole-fat). One point per component above the cohort median; score 0–6.
  PURE cohort median daily intakes: fruit 145 g, vegetables 250 g, legumes
  38 g, nuts 9 g, fish 12 g, dairy 113 g.
- Development: 147,642 people, 21 countries, median follow-up 9.3 y.
  Replication: ONTARGET/TRANSCEND/ORIGIN + INTERHEART/INTERSTROKE — total
  244,597 people, 80 countries, ~50,000 events.
- **Gradient, score ≥5 vs ≤1 (all-cause mortality): HR 0.70 (0.63–0.77).**
  CVD 0.82 (0.75–0.91); MI 0.86; stroke 0.81; CVD mortality 0.72
  (0.60–0.85); non-CVD mortality 0.68 (0.60–0.78).
- **Per-20-percentile (1-quintile) increment:** total mortality HR 0.91
  (0.89–0.93); major CVD 0.94 (0.92–0.97); CVD mortality 0.91 (0.88–0.95);
  non-CVD mortality 0.91 (0.88–0.93). This is the engine keying: component
  count → per-point HR 0.91.
- Independent confirmation (3 vascular-patient cohorts): mortality HR 0.73
  (0.66–0.81); CVD 0.79 (0.72–0.87); stroke 0.87 (0.73–1.03, NS).
- **Adjustment set:** age, sex, centre (RE), energy, waist-to-hip, education,
  wealth, current smoking, urban/rural, physical activity (low <600 / mod
  600–3000 / high >3000 MET-min/wk), diabetes, statin/BP meds. → PA and
  smoking are adjusted for: the diet cluster multiplies across to
  movement/substances without a ρ on those axes.
- Sensitivity: removing potential mediators (BMI, WHR, diabetes, hypertension)
  held direction. Regional interaction: stronger in lower-GNI countries
  (P heterogeneity <0.0001) — the LMIC-gradient caveat is real; the US-fit
  check decided the score family (2.2).
- Component balance: removing any single component slightly weakens the
  association (Appendix S8) — supports per-component partial credit.
- Score comparison: PURE slightly stronger than Mediterranean/HEI-2010/HEI-2015/
  DASH (P<0.001 each), markedly stronger than EAT-Lancet Planetary (which was
  neutral — disqualified).

**Additivity test (npj Sci Food 2026, verified 2026-07-31):** Su X, et al.,
DOI 10.1038/s41538-026-00829-0 (CHNS, 3106 Chinese older adults, cognition
outcome). Likelihood-ratio test of 6 components vs + total score: **P = 0.304**
(no improvement); fruit–veg and fish–veg interactions NS (P>0.05); PA subgroup
P=0.016 nominal but FDR-adjusted P=0.128 NS. Supports additive combination.
Caveat: *cognition* outcome — extending "no multiplicative interaction" to
mortality is an assumption (stated in methodology copy).

### 2.2 Score-family selection — decision 2026-07-31

Rule: prefer the score with the most slider overlap + documented
component-removal robustness; a US-fitted alternative (HEI-2015 family) wins
only if PURE components fit poorly.

**Decision: PURE 6-component score, run as the 5 mappable components (dairy
excluded).** (a) 5/6 PURE components map to our sliders vs ~4/13 HEI-2015
(whose unmapped 9 include major ones); (b) PURE's component-removal robustness
is published (Appendix S8) — the dairy-less variant is evidence-supported,
whereas a half-mapped HEI-2015 silently changes meaning; (c) whole-grain/red-
meat sensitivity (Appendix 9) further supports leaving unmapped foods out.
Dairy exclusion stated on the card. Fallback pre-committed: if users cannot
reach the top gradient, the anchor shifts to the 5-component span from the
same paper's per-quintile curve — never a different score family swapped in
silently.

Slider-overlap comparison:

| Slider | PURE (6 comps) | HEI-2015 (13 comps) |
|--------|----------------|----------------------|
| fruitVeg | fruit + vegetables (2 pts) | total fruit, whole fruit, total veg (3 pts) |
| fiber | legumes (partial; 1 pt) | greens & beans (partial; 1 pt) |
| nuts | nuts (1 pt) | seafood & plant proteins (partial; 1 pt) |
| fish | fish (1 pt) | seafood & plant proteins (partial) |
| magnesium / coffee / processedMeat / ssb | — | — (ssb partial via added sugars) |
| **mappable** | **5/6 (dairy unmapped)** | **~4/13** |

### 2.3 Slider→component mapping (recorded 2026-07-31)

Each slider contributes 0–1 points (fruitVeg can earn 2). Thresholds
calibrated so the US-average person scores ~1/5 (PURE medians are above
US-average intake); normalization by the average profile absorbs the absolute
level — deltas are what the engine displays.

| Slider | Score component | Point rule | Overlap annotation |
|--------|-----------------|------------|---------------------|
| fruitVeg | fruit + vegetables | ≥6 servings/d → 2 pts; 3–5.5 → 1; ≤2.5 → 0 | Single point source for both components. |
| fiber | legumes (+ whole-grain fiber) | ≥25 g/d → 1 pt | **ρ(fiber, fruitVeg) ≈ 0.3** — fruit/veg already carry their own fiber; card discloses "the fiber point counts legume + whole-grain fiber; fruit/veg fiber is not billed twice". |
| nuts | nuts | ≥9 g/d → 1 pt | PURE nut median 9 g exactly; US avg ~5 g. Clean. |
| fish | fish | 'some'/'lots' → 1; 'none' → 0 | PURE median ≈ 1 serving/wk. Clean. |
| magnesium | — | marginal HR (fang2016), **ρ(mg, score) ≈ 0.5** | Mg's food sources ARE the score foods (nuts, legumes, veg, whole grains) — same-pathway overlap, heavily pre-billed by the score. |
| coffee | — | marginal HR (poole2017/grosso2016), ρ ≈ 0 | No food-level overlap; separate pathway. |
| processedMeat, ssb | — | handled by 2.4 | |

Point-count keying: each point ≈ one 20-percentile increment → per-point HR
0.91 (0.89–0.93) multiplicatively over the user's score vs the average
person's score; the 0.70 gradient and 0.73 confirmation are calibration
anchors. Score spans 0–5 for users (5 mappable components) vs 0–6 in PURE.

### 2.4 Harmful foods — Pan 2012 + Malik 2019 (verified 2026-07-31)

**Pan 2012** (Arch Intern Med 172(7):555–63, DOI 10.1001/archinternmed.2011.2287,
PMID 22412075). Adjustment includes **total energy + whole grains + fruit +
vegetables in quintiles** — the score's foods ARE in the adjustment set.
Additional foods/nutrients didn't appreciably change HRs; no BMI/PA
interaction (P ≥ .10). Substitution (1 serving/d processed red meat →): fish
10%, poultry 17%, nuts 22%, legumes 13%, low-fat dairy 13%, whole grains 16%
lower all-cause mortality; same foods for total red meat give 7–19%.

**Malik 2019** (Circulation 139(18):2113–25, DOI 10.1161/CIRCULATIONAHA.118.037401,
PMID 30882235). MV2 adjusted for **whole grains + fruit + vegetables +
red/processed meat + energy + BMI** (score foods + processed meat + BMI all in
the adjustment set); modified-AHEI secondary held. SSB association independent
of diet quality, PA, BMI, age (P interaction > 0.10). Per-1-serving/d pooled
MV2 total mortality 1.05 (1.02–1.08). Substitution: SSB → ASB ≈ 4% lower
(0.96 [0.94–0.98]).

**Decision: keep both as marginals with substitution ρ, NOT per-lever.**
Both marginal HRs are already mutually adjusted for the score's foods in the
primary papers — residual overlap is intake-behavioral, not statistical.
ρ(processedMeat, dietScore) ≈ 0.3 (Pan Table 1 intake correlation +
substitution bounds); ρ(ssb, dietScore) ≈ 0.15 (independence P>.10 + BMI
already adjusted). Substitution numbers → findings on the card.

## 3. Movement cluster

### 3.1 Ekelund 2016 — PA×sitting joint table (verified 2026-07-31)

**Ekelund et al. *Lancet* 388(10051):1302–10, DOI 10.1016/S0140-6736(16)30370-1,
PMID 27475271** (full text + supp Table 4). Harmonised meta-analysis, 16
studies, 1,005,791 people / 84,609 deaths (13 studies on sitting), follow-up
2–18.1 y. PA quartiles (MET-h/w): Q1 ≤2.5 (≈5 min/d), Q2 16 (25–35 min/d),
Q3 30 (50–65 min/d), Q4 >35.5 (60–75 min/d). Sitting: <4 / 4–6 / 6–8 / >8 h/d.
Referent = <4 h/d × Q4.

Joint all-cause HRs (supp Table 4), sitting × PA:

| sitting \ PA | Q1 ≤2.5 | Q2 16 | Q3 30 | Q4 >35.5 |
|---|---|---|---|---|
| <4 h/d | 1.27 (1.22–1.30) | 1.12 (1.08–1.16) | 1.03 (0.99–1.07) | 1.00 REF |
| 4–6 h/d | 1.35 (1.30–1.40) | 1.15 (1.11–1.20) | 1.08 (1.04–1.13) | 1.00 (0.96–1.04) |
| 6–8 h/d | 1.40 (1.35–1.46) | 1.22 (1.16–1.27) | 1.06 (1.01–1.11) | 1.01 (0.96–1.06) |
| >8 h/d | 1.59 (1.52–1.66) | 1.27 (1.21–1.33) | 1.13 (1.07–1.19) | 1.04 (0.99–1.10) |

Key properties: (1) sitting×PA interaction — high PA eliminates sitting risk
(>8 h + Q4 = 1.04 NS vs 1.59 + Q1, p<0.0001); (2) I² = 38%; (3) cells
"minimally adjusted (sex, age)" + each study's originals — diet NOT uniformly
adjusted (the ρ-vs-diet caveat); (4) cancer mortality: sitting risk only in
the least-active quartile (+12–22%); CVD similar to all-cause; (5) TV >5 h/d
retains risk even at Q4 (1.16) — the `sitting` slider tracks total sitting, TV
nuance goes to a finding; (6) units map directly onto our sliders (min/wk →
MET-h/w via MET intensities, sitting h/d).

**Engine notes (live as `ekelundTable`):** PA axis = cardio min/wk × 4 MET +
steps/d × 7 × 0.03 MET-min/step, bands Q1 ≤150 / Q2 ≤960 / Q3 ≤1800 / Q4 ≤2130
(MET-h/w × 60; Q4 open-ended clamps flat); sitting bands <4 / 4–6 / ≥6 (the
published 6–8 row is NOT stored — its values interpolate between 4–6 and >8;
the >8 row is the last band so ≥8 clamps flat). `calibrate: true` re-anchors
the default cell to the members' marginal product (reset ⇒ exactly 1.0×).

### 3.2 Momma 2022 — aerobic×strength combined cells (verified 2026-07-31)

**Momma H, Kawakami R, Honda T, Sawada SS. *BJSM* 56(13):755–63, DOI
10.1136/bjsports-2021-105061, PMID 35228201, PMC9209691** (full text).

| Outcome | RR (95% CI) | I² | Studies | GRADE |
|---|---|---|---|---|
| All-cause | 0.60 (0.54–0.67) | 59.3% | 3 | very low |
| CVD mortality | 0.54 (0.41–0.70) | 62.6% | 3 | very low |
| Total cancer mortality | 0.72 (0.53–0.98) | 84.8% | 3 | very low |

(CIs corrected from a pre-audit 0.49–0.72 etc.) Single-activity (aerobic-
adjusted): MS any vs none all-cause 0.85 (0.79–0.93), CVD 0.83 (0.73–0.93),
total cancer 0.88 (0.80–0.97). MS dose-response J-shaped: min RR 0.82
(0.76–0.90) at 60 min/wk, RR <1.00 to ~130 min/wk → the `strength` slider
should not reward past ~2–3 sessions/wk (a clamp, not a linear term).
Adjustment: most adjusted age, BMI, alcohol, smoking; all adjusted for aerobic
PA; diet partly handled.

**Engine notes (live as `mommaCells`):** 2×2 grids per output, axes aerobic
(cardio read-only, ≥150 min/wk → AER) × strength (≥1 session/wk → MS); the
aerobic-only cells use Arem 2015 ≥150 bands (Momma's is graphical only).
Runs in **ratio mode** (see PLAN.md design decision 3): total =
cell(aerobic, strength) / cell(aerobic, none) — the aerobic row main effect
is divided away because Ekelund's PA axis owns it (3.2e probe measured the
double count: cardio 0→300 moved Ekelund ×0.824 AND Momma ×0.706, combined
×0.582 vs Arem's 0.63). The strength×aerobic interaction survives (0.60/0.80
= 0.75 < MS-only 0.85 — the published synergy). No `calibrate` (default cell
0.85 ≈ 8% off the members' product, within band; calibration would destroy
the synergy contrast).

### 3.3 Duncan 2023 — PA×strength×sleep cells (verified 2026-07-31)

**Duncan MJ, et al. *J Sport Health Sci* 12(1):65–72, DOI
10.1016/j.jshs.2022.07.003, PMID 35872092, PMC9923431** (full text + Table 2).
NHIS 2004–2014, n=282,473 US adults 18–84, 18,793 deaths, mean follow-up
5.4 y, NDI to Dec 2015; deaths within 1 y of baseline excluded. PA categories:
Active (aerobic ≥150 min/wk mod or ≥75 vig + MSA ≥2/wk), AER only, MSA only,
Inactive. Sleep: Rec 7–9 h (18–64) / 7–8 h (>64), Short ≤6, Long ≥10 (≥9
for >64). 12 joint cells, referent Active-Rec:

| | Rec | Short | Long |
|---|---|---|---|
| Active | 1.00 REF | 1.08 (0.92–1.26) | 1.40 (1.11–1.77) |
| AER only | 1.21 (1.09–1.34) | 1.28 (1.14–1.44) | 1.54 (1.34–1.76) |
| MSA only | 1.56 (1.36–1.80) | 1.43 (1.17–1.76) | 2.32 (1.85–2.91) |
| Inactive | 1.68 (1.53–1.84) | 1.59 (1.43–1.76) | 2.20 (1.99–2.44) |

Model 3 adjustment: age, age², sex, education, race/ethnicity, work status,
BMI, alcohol, smoking, self-rated health, chronic disease. **Diet and
sedentary behaviour NOT adjusted** (explicitly stated) — so
ρ(sleep cells, diet) and ρ(sleep cells, sitting) must be modest-positive, not
zero. **No significant multiplicative/additive interactions** (MSA-Long
synergy index 1.37, NS) → cells used directly. Key patterns: short-sleep risk
eliminated in Active (1.08 NS); long-sleep risk persists at every PA level
(1.40–2.32; worst MSA-only 2.32 / Inactive 2.20 — the long-sleep synergy lives
in low-PA+long-sleep cells). Sleep DURATION only — the `sleepRegularity`
slider is orthogonal (stays mind-only).

**Engine notes (live as `duncanCells`):** PA-category axis is a data `fn`
(cardio ≥150 → AER, strength ≥2 → MSA, both → Active); sleep axis Short ≤6.9 /
Rec ≤9.4 / Long ≤11, NO interpolation (the study's sleep groups are discrete
categories); grid stored in band order, cols Short/Rec/Long =
[[1.59,1.68,2.20],[1.43,1.56,2.32],[1.28,1.21,1.54],[1.08,1.00,1.40]] with
published CIs. Runs in **ratio mode**: total = cell(PA, sleep)/cell(PA, Rec) —
the PA-row main effect is divided away (owned by Ekelund/Momma); the sleep
effect is the study's contribution. Defaults ratio exactly 1.0 (no calibrate).
Ratio CI = quadrature of the two cells' sigmas (referent 1.00 has no published
CI — slight understatement, disclosed).

## 4. Adiposity cluster

### 4.1 Mayo 2021 (Sanchez-Lastra) — PA×adiposity cells (verified 2026-07-31, re-extracted 2026-08-01)

**Sanchez-Lastra MA, Ding D, Dalene KE, Ekelund U, Tarp J. *Mayo Clin Proc*
96(1):105–19, DOI 10.1016/j.mayocp.2020.06.049, PMID 33309181** (open access).
UK Biobank, n=295,917, median follow-up 8.9 y, 6,684 deaths. PA =
sex/age-stratified quintiles of self-reported MET-min/wk collapsed to 3 groups:
**G1 = Q4+Q5** (median ≈2,800–3,700 MET-min/wk), **G2 = Q2+Q3** (≈925–2,230),
**G3 = Q1 least active** (≈340–490). NOTE: G3 is much higher than Ekelund's
harmonized Q1 ≤2.5 MET-h/wk — UKB self-report overreports, the two tables are
NOT on the same PA scale (the engine maps rank-preserving onto Ekelund's
cutoffs; disclosed as rank- not value-preserving). Adiposity: BMI 4 categories
(18.5–24.9 / 25–29.9 / 30–34.9 / ≥35), WC 2, BF 4 groups (impedance;
sex-specific distribution-matched).

All-cause HRs (Model 3), referent G1 × lowest-adiposity:

| BMI | G1 (Q4+Q5) | G2 (Q2+Q3) | G3 (Q1) |
|---|---|---|---|
| 18.5–24.9 | 1.00 REF | 1.07 (0.96–1.18) | 1.22 (1.07–1.38) |
| 25–29.9 | 1.00 (0.90–1.10) | 1.02 (0.93–1.11) | 1.12 (1.00–1.24) |
| 30–34.9 | 1.15 (1.02–1.29) | 1.09 (0.97–1.23) | 1.38 (1.22–1.56) |
| ≥35 | 1.45 (1.21–1.73) | 1.43 (1.21–1.67) | 1.52 (1.30–1.78) |

| WC | G1 | G2 | G3 |
|---|---|---|---|
| low | 1.00 REF | 1.03 (0.96–1.10) | 1.10 (1.01–1.20) |
| high | 1.19 (1.10–1.30) | 1.19 (1.10–1.29) | 1.44 (1.32–1.57) |

| BF | G1 | G2 | G3 |
|---|---|---|---|
| low | 1.00 REF | 1.05 (0.94–1.16) | 1.11 (0.96–1.28) |
| medium-low | 1.02 (0.93–1.12) | 1.01 (0.92–1.11) | 1.13 (1.01–1.25) |
| medium-high | 1.12 (0.99–1.25) | 1.13 (1.01–1.26) | 1.38 (1.22–1.55) |
| high | 1.24 (1.04–1.49) | 1.36 (1.17–1.59) | 1.54 (1.33–1.79) |

Key properties: (1) **no significant interaction** (LR tests P>0.18 Model 3)
but cells used directly; (2) high PA attenuates but does not eliminate
high-adiposity risk — and **no attenuation at BMI ≥35** (G1 1.45 vs G3 1.52,
the "fat-but-fit" limit); (3) never-smoker restriction (supp Table 6, n=
168,654 — NOT Table 4) attenuates to NS: smoking is a major confounder of
PA×adiposity; (4) **Model 3 includes diet pattern** + salt, alcohol, smoking,
screen time, depression, diabetes, hypertension, statins — unlike Ekelund's
cells, diet IS adjusted, so ρ(adiposity cells, dietScore) ≈ 0; (5) BMI↔BF
correlation 0.85 W / 0.79 M, BMI↔WC 0.87/0.81 — near-collinear, must never
stack (bodyFat supersedes BMI ✓).

**CVD-mortality cells (Model 3, supp Table 9, rows BMI × cols G1/G2/G3;**
verified at source 2026-08-01):

| CVD | G1 | G2 | G3 |
|---|---|---|---|
| 18.5–24.9 | 1.00 REF | **0.89 (0.68–1.15)** | 1.31 (0.97–1.78) |
| 25–29.9 | 1.03 (0.83–1.29) | 0.99 (0.79–1.23) | 1.10 (0.85–1.42) |
| 30–34.9 | 1.15 (0.87–1.51) | 1.12 (0.86–1.48) | 1.71 (1.30–2.24) |
| ≥35 | 1.37 (0.90–2.06) | 1.99 (1.44–2.76) | 1.55 (1.08–2.23) |

The 0.89 (< REF 1.00) anomaly is REAL (confirmed at source; sparse CVD deaths
n=128 in the ref cell; non-monotone ≥35 row G2>G1>G3) — transcribe as-is.

**Cancer-mortality cells (Model 3, supp Table 10):**

| Cancer | G1 | G2 | G3 |
|---|---|---|---|
| 18.5–24.9 | 1.00 REF | 1.10 (0.97–1.24) | 1.12 (0.94–1.32) |
| 25–29.9 | 1.07 (0.95–1.20) | 1.09 (0.97–1.22) | 1.20 (1.05–1.38) |
| 30–34.9 | 1.29 (1.11–1.49) | 1.21 (1.04–1.40) | 1.30 (1.10–1.54) |
| ≥35 | 1.57 (1.25–1.97) | 1.30 (1.05–1.63) | 1.48 (1.19–1.84) |

WC/BF CVD + cancer rows (Table 1 of the 3.3a addendum): CVD WC high 1.12 /
1.29 (1.07–1.54) / 1.53 (1.26–1.86); CVD BF high 1.20 / **1.71 (1.24–2.36)** /
1.58 (1.13–2.21); cancer WC high 1.29 (1.16–1.43) / 1.21 / 1.35; cancer BF high
1.31 / 1.25 / 1.45.

**Methods facts (from main text, verified 2026-08-01):** BMI <18.5 was
**EXCLUDED** at baseline (illness-related weight loss; n=35,094 with chronic
conditions + pregnant) — the 18.5–24.9 row is true normal-weight only;
follow-up lagged 2 y; prevalent cancer/CVD excluded (63,193); missing
covariates excluded (14,687); **CVD/cancer tables are Fine-Gray competing-risk
subdistribution HRs** (mortality = Cox). **BF % band cutoffs NOT published**
anywhere — the four BF groups are sex-specific distribution-matched quartiles;
the engine's bodyFatOn → BF-rows axis uses DISCLOSED translated cutoffs
(Deurenberg 1991 age/sex BF%-BMI equation), the note says "our translation,
not the paper's".

**Engine notes (live as `mayoCells`):** rows PA G-bands (G3 ≤150 / G2 ≤1800 /
G1 >1800 MET-min/wk via the same cardio×4 + steps×0.21 axis), cols adiposity
(BMI bands, or BF bands when bodyFatOn; BMI <18.5 maps to the normal row —
Di Angelantonio's underweight left arm is LOST, disclosed + a finding, never
invented), `ratio {axis:1, referent:0}` (total = cell(PA, adj)/cell(PA,
normal) — the PA-row main effect divides away, owned by Ekelund on mortality),
`calibrate: true` (defaults ratio total 0.9533 vs the bmi marginal 1.20 ≈ 26%
off → constant log-space offset; cancels in the page's normalization, matters
for clusterTotals/bounds displays). Covers all three HR outputs; bmi/bodyFat
marginals retire on all three (bodyFat gains CVD+cancer data, bmi gains cancer
data — noData lists shrink). UK-Biobank overweight-paradox artifact: the
normal-weight-low-PA cell (1.22) is elevated by reverse causality + smoking;
the ratio can read <1 for overweight at low PA (e.g. G3×overweight
1.12/1.22 = 0.92) — a source artifact, NEVER a protective claim; card copy
says so.

### 4.2 Weeldreyer 2025 — CRF×BMI meta (verified 2026-07-31)

**Weeldreyer NR, et al. *Br J Sports Med* 59(5):339–46, DOI
10.1136/bjsports-2024-108748, PMID 39537313, PMC11874340** (full text).
20 studies, 398,716 observations, three-level REML + robust variance. CRF
dichotomised: fit = top group (often merely >20th percentile of age-adjusted
CRF — a low bar), unfit = bottom; referent normal weight-fit.

| Group | All-cause HR (95% CI) | CVD HR (95% CI) |
|---|---|---|
| Normal weight-fit | 1.00 REF | 1.00 REF |
| Overweight-fit | 0.96 (0.61–1.50) NS | 1.50 (0.82–2.76) NS |
| Obese-fit | 1.11 (0.88–1.40) NS | 1.62 (0.87–3.01) NS |
| Normal weight-unfit | 1.92 (1.43–2.57) | 2.04 (1.32–3.14) |
| Overweight-unfit | 1.82 (1.47–2.24) | 2.58 (1.48–4.52) |
| Obese-unfit | 2.04 (1.54–2.71) | 3.35 (1.17–9.61) |

Claim verified: **fitness (measured CRF) absorbs BMI's all-cause mortality
association** — fit at any BMI ≈ normal-weight fit; unfit ~2× all-cause,
~2–3× CVD. CVD attenuated not eliminated (fit CVD cells elevated but NS);
CVD obese-unfit is FRAGILE (NS on influential-cluster removal).

**Decision — Mayo 2021 is the adiposity joint model, NOT this one.** Reasons:
(1) Mayo's PA axis = self-reported PA (our `cardio` slider); CRF needs age/sex
norm tables; (2) Mayo covers BMI+BF+WC; Weeldreyer is BMI-only; (3) Mayo is
diet-adjusted with a ≥35 no-attenuation row (conservative); (4) Weeldreyer's
fit/unfit dichotomy + clinical populations fit no slider. Role of 4.2 in the
model: **finding card** "fitness absorbs fatness" + engine cross-check (Mayo
G1×≥35 1.45 vs obese-fit 1.11 — discrepancy = measured CRF ≠ self-reported PA,
goes in the finding's note).

### 4.3 Mediation shares (PA→mortality through BMI/CRP) — verified 2026-07-31

- **CHARLS (point estimate):** Wei J, et al. *Chin J Public Health*
  2024;40(6):730–6, DOI 10.11847/zgggws1143020 (n=5,727 ≥45 y, 509 deaths).
  Fully adjusted (incl. mediators) Q4-vs-Q1: **37.22% of the PA–all-cause
  association via BMI, 39.60% via CRP**. Caveats: extreme Q4-vs-Q1 contrast
  (≥12,264 MET-min/wk), time-varying-mediator bias, Chinese ≥45, not
  MEDLINE-indexed.
- **MSSE 2025 (exists but direction REVERSED):** Zhao L, et al. *Med Sci
  Sports Exerc* 57(7):1326–32, DOI 10.1249/MSS.0000000000003668 (NHANES
  n=35,406, four-way decomposition + MR): the 22.2% is the proportion of the
  **BMI→CVD** association mediated BY PA — the mirror of what an upstream
  PA discount needs. Role: causal-support evidence for the BMI↔PA pathway,
  NOT a discount coefficient.
- **Counterpoint (low-mediation end):** Long et al. *Eur J Epidemiol*
  30:71–9, PMC4356894 (ADNFS, England): adding baseline BMI changed PA–HRs
  <8% (change-in-estimate). Mediation estimates are method-dependent.

**Band fix:** point estimate **37%** (CHARLS, the only directionally-correct
causal-mediation number), sensitivity range **8–40%** (ADNFS <8% to CHARLS
37%); MSSE 22.2% dropped from the band. Since Mayo's joint cells cover
cardio↔BMI/bodyFat, the discount survives only for pairs without joint cells
(steps↔BMI, strength↔BMI).

## 5. Psychosocial evidence

### 5.1 Joint-model search pass — no joint model exists (2026-07-31)

Searches (terms recorded in git history): "joint association purpose in life
perceived stress social connection mortality…", "perceived stress social
support… sleep regularity index mortality". **Conclusion: NO joint
purpose×stress×social mortality model exists** — the per-lever-only default
stands, advertised as such. Closest adjacent literature (all verified to
exist):

- Purpose alone: Alimujiang 2019 (JAMA Netw Open, HRS, lowest vs highest HR
  2.43 [1.57–3.75]); Boyle 2009 (Rush, per-unit 0.60); definitive pooled
  estimate Sutin 2026 (IPD meta 488,765 / 25 samples / 32 y, PMID 42417009).
- Purpose×SES joint (AJPM 2021) — the only purpose JOINT cells found; with
  SES, not stress/social.
- Loneliness→purpose→mortality mediation ~88% (Soc Sci Med 2026) — mediator
  evidence for purpose↔social (discount modest; loneliness ≠ our social
  slider).
- Social components: UKB social connection (BMC Med 2023) interactions are
  internal to social; H-EPESE support trajectories (Res Aging 2016).
- Stress: only mutual adjustment found (Japanese ikigai studies); no joint
  cells with purpose or social.

**Sleep regularity — the search found MORE than expected:**
- **Windred 2024** (Sleep 47(1):zsad253, PMC10782501, UKB n=60,977
  accelerometer SRI): top vs bottom quintile all-cause HR **0.70 (0.59–0.83)**,
  mutually adjusted for sleep DURATION — regularity's effect is duration-
  independent and predicted mortality MORE strongly than duration.
- **Duration×regularity joint cells** exist (Sci Rep 2025, Ansung-Ansan Korean
  cohort n=9,641): <7 h irregular HR 1.28 [1.04–1.55]-area; women >8 h
  irregular 1.78 [1.05–3.02].
- Consequence: `sleepRegularity` could get a mortality effect (Windred
  marginal + Korean cells) with ρ(sleepReg, sleep-duration cells) ≈
  moderate-high (correlate ~0.3–0.5 in actigraphy; Windred's mutual adjustment
  means the HRs don't double count, but the covariance layer should still
  share σ). **NOT implemented** — recorded Phase-2/3 candidate, out of scope
  of the conflation pass.

## 6. Substance mutual adjustment (done 2026-07-31)

**Pairs VERIFIED — no ρ needed (mutually adjusted or excluded by design):**

- **alcohol↔smoking — both directions adjusted.** Wood 2018 (Lancet 391:
  1513–23) adjusts smoking status; Jha 2013 (NEJM 368:341–50) adjusts alcohol
  (nondrinker/former/light/mod-heavy) + adiposity. The classic smoking×alcohol
  double count does not exist → plain multiplication is honest.
- snus↔smoking: byhamre2021 pooled 169,103 never-smoking men (excluded by
  restriction, not adjustment).
- vaping↔smoking: berlowitz2022 (PATH, Circulation 145:1557–9) mutually
  exclusive categories + pack-years + pack-years² adjustment.
- vaping↔cannabis: berlowitz2022 adjusts for ever-use of marijuana.
- cannabis↔smoking and cannabis↔alcohol: sidney1997 (Kaiser n=65,171)
  adjusts both, interactions NS, nonsmoker-sensitivity stable.

**Pairs FAILING — became ρ pairs (live in factors.js):**

1. **ρ(snus, alcohol) = 0.15 (ρU 0.10), tier moderate, residual-confounding**
   — byhamre2021's main aHRs adjust for attained age + BMI ONLY; alcohol not
   in the main model. Sensitivity (+education +alcohol +PA) "yielded similar
   results" — double count real but small. Source: byhamre2021.
2. **ρ(vaping, alcohol) = 0.10 (ρU 0.05), tier low, unmeasured-confounding**
   — PATH collects no alcohol data. Numerically MOOT while the vaping CVD
   estimate is a null (HR 1.00 [0.69–1.45]): a 1.0 HR raised to (1−ρ) is
   still 1.0, so the blend is a no-op today — kept for structure, activates
   automatically if a future vaping HR turns non-null. Source: berlowitz2022.

**Correction (applied in the data):** factors.js snus CVD byOption CI was
1.20–1.35 but the paper publishes 1.27 (1.15–1.41) — fixed + pinned by a test.
All-cause 1.28 (1.20–1.35) and cancer 1.12 (1.00–1.26) matched exactly.

Bottom line: substance multiplication is mostly honest — two small ρ pairs
only; no ρ(smoking, alcohol).

## 7. Cross-category residual pairs — ρ justifications (done 2026-07-31)

Method: targeted searches for direct correlations; where no direct r exists,
an assumption band is derived from directional causal evidence and flagged.
All six are RESIDUAL — neither marginal HR was mutually adjusted in its
primary source. New source keys added when the pairs shipped:
`gonzales2023`, `munjal2025`, `burns2021`, `zhang2026` (Nazeeh 2025 =
`adventist2025`, already present).

1. **ρ(rhr, cardio) = 0.20 (ρU 0.10), moderate, shared-pathway.** Fenland
   (Gonzales 2023, PLoS ONE 18(5):e0285272, n=10,865): age-adjusted
   RHR↔VO2max β ≈ −0.26/−0.29; PAEE adjustment attenuates ~50%; fully
   adjusted r ≈ 0.16; longitudinal Δr −0.20. Our cardio slider is noisier
   self-report → ρ 0.20 ± 0.10. Direction NEGATIVE. Nuance: aune2017rhr's
   association "survived activity adjustment in most studies" — the residual
   double count sits mostly on the cardio side.
2. **ρ(rhr, vo2max) = 0.15 (ρU 0.10), moderate, shared-pathway.** Same
   source; with measured VO2max this is the direct physiological correlation.
3. **ρ(meditation, stress) = 0.28 (ρU 0.13), moderate, shared-pathway.**
   DIRECT: Munjal 2025 (Front Psychiatry 16:1573407, n=145): PSS-10↔frequency
   rₛ = −0.27, ↔weekly minutes rₛ = −0.29. Both sliders map directly onto
   these constructs. Single small COVID-era sample; both also share
   negative-affect variance on the happiness POINTS pathway (a points-blend
   analogue is a noted gap).
4. **ρ(grip, strength) = 0.25 (ρU 0.15), moderate, ASSUMPTION BAND 0.10–0.40.**
   No direct population r found. RT→grip causal direction established
   (Frontiers in Physiology 2025 network meta: RT 2–5×/wk raises grip,
   optimum 3×/wk MD 7.02 kg [4.62–9.42]); grip is dominated by age/sex/body
   size and only a minority of gripOn users train → weak-to-moderate.
5. **ρ(sunExposure, sleep) = 0.05 (ρU 0.10), low, shared-pathway.** Burns 2021
   (UKB, J Affect Disord 295:347–52, n≈400k): per hour of daytime outdoor
   light, effects on TIMING/QUALITY, duration-adjusted ORs null; Zhang 2026
   (RQES, UKB n=100k): light minutes NEGATIVELY associated with duration
   (B = −0.617) — more outdoor time accompanies slightly SHORTER sleep.
6. **ρ(sunExposure, sleepRegularity) = 0.15 (ρU 0.15), low, ASSUMPTION BAND
   0–0.30.** No direct data; daylight is the primary circadian entrainer
   (implies more regular timing), but our self-rated slider proxies an SRI.
7. **ρ(sunExposure, cardio) = 0.10 (ρU 0.05), moderate, shared-pathway.**
   DIRECT r from the same cohort as our HRs: Nazeeh 2025 (AHS-2, Environ
   Epidemiol 9(3):e401): time-outdoors↔PA r = 0.09/0.10, HRs already
   PA-adjusted → the sun marginal is net of activity; the "outdoor time is
   really exercise" fear is empirically unfounded. Burns 2021 model 3
   corroborates.
8. **ρ(sunExposure, steps) = 0.10 (ρU 0.05), moderate, shared-pathway.** Same
   source (steps is another PA measure).
9. **ρ(sunExposure, vitaminD) = 0.15 (ρU 0.15), low, mediator, ASSUMPTION
   BAND 0–0.30.** Sources silent on % mediated. Sun is upstream of vitamin D
   status (UV-B photosynthesis; avoiders have markedly lower 25(OH)D,
   lindqvist2014) and the vitamin D marginal (schottker2014 bottom-vs-top RR
   1.57) is not sun-adjusted — but the sun benefit is largely non-vitamin-D
   (NO-mediated BP, circadian), and the VITAL RCT null caps vitamin D's
   causality → small residual overlap. Re-evaluate if a % mediated appears.

**Not paired (and why):** meditation↔sleep / meditation↔social — shared
outcomes limited to happiness points; defer to a points-conflation pass.
Note: pairwise ρ does NOT compose in dense clusters (triangles double-discount;
chains can discount twice) — that is why the psychosocial triangle is a
per-lever-only structural removal, not three ρ pairs.

## 8. The 0.9 sweep — every effect column vs its primary source (done 2026-08-01)

Four passes (0.9a–d) web-verified EVERY rendered effect column in
`js/factors.js` against its cited primary source (PubMed/EuropePMC abstract or
full text). Verdicts: "fixed" = a number/CI changed to match the published
estimate (or re-sourced), "verified" = matched, "nulled" = set to the published
null/NS result, "no-data" = honest null kept.

| Input | Verdict | What changed |
|---|---|---|
| cardio (Arem 2015) | fixed | CVD/cancer columns now exact Table-3 figures (were all-cause reuse); 75+ step 0.69→0.68 |
| steps (Lancet 2025) | fixed | all 3 HR columns re-anchored to published 7k/2k anchors (all-cause plateau 0.53, CVD 0.53 linear, cancer 0.63 linear); invented 15k tails removed; GRADE high→low for CVD |
| strength (Momma 2022) | fixed | all-cause 0.85 (0.79–0.93), CVD 0.83, cancer 0.88 (old cancer 0.81 invented); evidence→low; duplicate source key merged |
| sitting (Biswas 2015) | fixed | CVD mortality 1.179 (1.106–1.257) (old 1.150 garbled); mortality/cancer verified |
| vo2max (Kodama 2009) | verified | per-MET 0.87/0.85 exact, both columns |
| grip (Leong 2015) | fixed | CVD per-5-kg 1.17 (1.11–1.24), inverse 0.855 |
| rhr (Aune 2017) | fixed | CVD lower CI 1.12→1.11; other columns verified |
| occupationalPA / bodyFat CVD | nulled | no CVD analysis in sources |
| fiber (Yang 2015/Reynolds 2019) | fixed | cancer + CVD steps rebuilt to published colorectal/CHD×stroke figures (constructions disclosed) |
| fruitVeg (Wang 2014) | fixed | CVD hrLow 0.93→0.92; cancer 1.00 invented→0.97 (0.90–1.03) published null |
| magnesium (Fang 2016) | fixed | CVD 0.85 invented→0.99 (0.88–1.10) published null; mortality verified |
| fish (Kwok 2019/li2020) | rebuilt | FABRICATED citation "li2020" removed; re-sourced to jayedi2018 (per-20-g) + zhang2018 (cancer); all bands rebuilt, disclosed |
| nuts (Aune 2016) | verified | all three columns exact |
| omega3 (VITAL) | verified | all columns exact |
| vitaminD (VITAL/Schöttker) | fixed | CVD deficient 1.45→1.41 (1.18–1.68) published quintile contrast; wrong "1.03 incidence" copy fixed→0.96 |
| ironDeficiency (Houston/Falkingham) | verified | fatigue/attention/IQ effect sizes exact |
| creatine (Avgerinos 2018) | fixed | evidence moderate→low (6 studies/281 people) |
| sleep (Cappuccio 2010/2011) | fixed | CVD column MIS-SOURCED (was all-cause paper) → cappuccio2011 total-CVD short 1.03 / long 1.41 (1.19–1.68) |
| stress (Russ 2012) | fixed | aggarwal2014 PMID wrong→24367123; steps = published GHQ-tier HRs ÷ 1.20 (disclosed) |
| social (Holt-Lunstad 2010) | fixed | "CVD particularly strong" comment corrected (consistent across causes) |
| purpose (Cohen 2016) | fixed | CVD CI 0.91→0.92 |
| snus (Byhamre 2021) | fixed | CVD CI was copy-pasted from all-cause → 1.15–1.41 |
| cannabis (Sidney 1997) | fixed | band = published men's RR 1.12 (0.89–1.39), interpolation disclosed |
| pm25 (Di 2017) | fixed | CVD column had NO source → orellano2024 (WHO AQG update): circulatory 1.13 (1.10–1.15); mortality verified 7.3% (7.1–7.5) |
| meditation (Goyal 2014) | verified | anxiety 0.38 / depression 0.30 exact |
| cognitiveTraining (Edwards 2017) | verified | HR 0.71 (0.50–0.998) dementia, memory/reasoning NS |
| smoking/alcohol/screenTime/sleepRegularity/sauna/vaping/coffee/processedMeat/ssb | audited | earlier passes (0.4/1.4/1.12/v0.6) |
| **sunExposure** (Nazeeh 2025 AHS-2 + Stevenson 2024 + Sun-BEEM 2026) | rebuilt | all three null PMIDs filled; mortality/CVD steps corrected to published AHS-2 HRs; CANCER column flipped from invented benefit (0.96) to published AHS-2 elevation (3h 1.08 NS, 5h 1.15 sig) — the only peer-reviewed quantitative cohort; latitude conflict disclosed; uncited "Sun-BEEM" numbers traced to a real medRxiv preprint + source key (preprint status disclosed); uncited "bright-light d=0.48" dropped; 0h bands disclosed as interpolations; evidence low for cancer |

**Verdict tally:** 25 inputs swept: 5 verified exact, 19 fixed, 1 rebuilt,
2 nulled. **2 fabricated/wrong citations killed** (li2020; aggarwal2014 PMID).
Every disclosed construction is labelled in its `note`.

**Sources integrity:** sources map = 97 entries, `engine.sourceIndex` = 97
indexed — zero dead keys, zero undefined cites, 1:1 both directions. Remaining
null PMIDs are non-PubMed by nature (CDC Data Brief, JSCP not indexed, AER,
Nielsen/DataReportal, medRxiv preprint) — each verified real via Crossref.
