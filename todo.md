# TODO — v0.9 conflation fix: Plan option #3 "joint-estimate-first" (PLAN.md)

Status markers: `[ ]` not started · `[~]` in progress · `[x]` done.
**One step at a time.** After every change to `js/factors.js` or `js/engine.js`
run `node tests/engine.test.js`. Update this file the moment a step finishes;
when you hit an unanticipated issue, write a new step (or sub-steps) about it
and work from there instead of improvising.

Context: PLAN.md contains three candidate plans for the conflation problem.
Plan option #3 (the joint-estimate-first model) is the final candidate and the
one being implemented here. Its verified evidence base and weaknesses
(assessed 2026-07-31) are recorded at the end of the Plan #3 section in
PLAN.md. Where a step below references "record in PLAN.md", append to the
relevant plan-3 subsection so the document stays the source of truth.

## Phase 0 — data audit + attribution probe (no engine change)

The flagged-number audit is from the roadmap's "Next (needs verification pass
first)" list — do it BEFORE the probe so we don't measure a knowingly-wrong
data file. Each audit item: read the primary source, confirm or fix the
number in `js/factors.js`, update the `note` (drop the "verify me" flag), run
tests.

- [x] 0.0 Audit: sauna all-cause HRs vs paper Table 2 (Laukkanen). Find the
      sauna entry in js/factors.js (id `sauna`, ~line 1471), fetch the paper,
      check every step HR/CI against Table 2, fix + update note, tests.
      DONE 2026-07-31: verified vs JAMA full-text Table 2 (multivariable-
      adjusted). Mortality 2-3/wk 0.76 (0.66-0.88), 4-7/wk 0.60 (0.46-0.80);
      CVD 2-3/wk 0.73 (0.59-0.89), 4-7/wk 0.50 (0.33-0.77). Old CIs were
      invented. Note now flags that the 0-session step is an assumption
      (study reference = 1 session/wk). Test hardcode updated 0.48 -> 0.50.
- [x] 0.1 Audit: NCHS 2023 baseline life-expectancy figures (js/factors.js
      `baseline`). CDC blocks automated fetch — try alternate mirrors /
      NCHS press releases; if unverifiable from a primary source, say so in
      the note and move on (documented, not silently kept).
      DONE 2026-07-31: all three numbers confirmed EXACT (78.4 / 81.1 /
      75.8) against NCHS Data Brief No. 521 full text (restoredcdc.org
      mirror of the official PDF). Fixed the nchs2023 source entry (was
      mislabeled "Deaths: Final Data"; it is Data Brief 521, DOI
      10.15620/cdc/170564). Note now documents that 2024 final data (79.0 /
      81.4 / 76.5, Data Brief 548) exists but 2023 stays the anchor.
- [x] 0.2 Audit: body-fat steps vs Jayedi 2022 (id `bodyFat`, ~line 1840).
      DONE: verified via abstract + Europe PMC access (35 cohorts, 923,295
      people, 68,389 deaths; J-shape, nadir 25% BF, P nonlinearity <0.001;
      HR 1.11 (1.02-1.20) per +10% BF in general adults). CRITICAL FINDING:
      paper is ALL-CAUSE ONLY — no CVD analysis exists; the old bodyFat/cvd
      steps were unsourced (likely scaled copies of the all-cause curve with
      a false citation) and have been REMOVED. CVD card now lists body fat as
      no-data. Mortality note rewritten to state steps are hand-fitted to the
      published curve (right arm ~+11% per +10% matches the paper) and
      anchored US avg ~35% = 1.0x. Search for a BF%-to-CVD meta-analysis came
      up empty (closest: central-fatness BMJ 2020, Aune sudden cardiac death
      2018) — recorded as a roadmap gap, honest null chosen per working
      agreement. Tests green.
- [x] 0.3 Audit: occupational-PA middle step (id `occupationalPA`, ~line 330).
      DONE: verified Coenen 2018 full text (BJSM 52(20):1320, PMID 29760168,
      PDF via Amsterdam UMC repository). High step HR 1.18 (1.05-1.34) EXACT.
      CRITICAL FINDING: paper is ALL-CAUSE ONLY — the old occupationalPA/cvd
      column was unsourced (its 1.15 matches Cillekens 2022's IHD analysis —
      likely a garbled copy) and has been REMOVED. Real OPA->CVD evidence is
      a published NULL: cillekens2022 (23 studies, 655,892 workers; men HR
      1.00 (0.87-1.15), women 0.95 (0.82-1.09), IHD 1.15 (0.88-1.49) NS) —
      cited in the comment + CVD card no-data. Middle step is our
      interpolation (paper binary low/high only): kept, explicitly labeled,
      CI widened to 1.05-1.34. Women's estimate 0.90 (0.80-1.01) = "no
      association" per authors (not "NS"); sex caveat noted. Added finding
      card: paradox contested — dalene2021 (437k Norwegians, full adjustment)
      found men in active jobs lived 0.4-1.7 y longer; new sources
      cillekens2022 + dalene2021 added. Tests green.
- [ ] 0.9 SWEEP: systematically cross-check EVERY effect (mortality/cancer/cvd,
      all ~50 inputs) against its cited source for existence + direction.
      Two consecutive audits (bodyFat cvd, occupationalPA cvd) found invented
      CVD columns copied from all-cause curves. Verify each CVD-column source
      key actually contains a CVD analysis. Fix or null per working agreement;
      run tests after each fix.
- [x] 0.4 Audit: coffee 1–2 and 5+ steps (id `coffee`, ~line 785).
      DONE: verified vs Poole 2017 umbrella review full text (BMJ 359:j5024,
      PMC5696634). The 3-4 cup steps are EXACT published estimates: all-cause
      0.83 (0.79-0.88), CVD mortality 0.81 (0.72-0.90), cancer 0.82
      (0.74-0.89). The flagged 1-2 and 5+ steps are NOT published categories
      but are consistent with the underlying Grosso 2016 non-linear
      dose-response curve: ~0.90 at 2 cups; 7 cups = 0.90 (0.85-0.96) — our
      5+ step 0.88 (0.82-0.95) sits on that curve. Rewrote notes to say
      "approximate the Grosso curve (verified)" instead of "verify against
      the paper"; added primary dose-response source grosso2016 (PMID
      27699514) to the three HR effects. CVD/cancer 5+ steps remain
      interpolations (no published dose-response categories) — labeled as
      such. Tests green.
- [x] 0.5 Audit: smoking all-cancer HR — replace approximation with Carter
      2015 site-specific figures (id `smoking`, ~line 668).
      DONE 2026-07-31: Jha 2013 Table 2 (NHIS-linked US, 25-79 y, current vs
      never) is the direct source: all-cancer mortality HR 3.2 (2.6-3.9)
      women / 3.8 (3.1-4.8) men; lung cancer alone 17.8 (11.4-27.8) women /
      14.6 (9.1-23.4) men. Old 3.0 (2.5-3.5) was unsourced/approx and sat
      below the men's CI. Now: current 3.50 (2.60-4.80) = unisex midpoint
      with CI spanning both sex intervals; source switched thun2013 ->
      jha2013 (thun2013 still backs the ~25x lung-cancer finding card);
      note documents Carter 2015 site-specific for former. Test hardcode
      3.0 -> 3.5. Tests green.
- [x] 0.6 Audit: screen-time default average (~5 h/day, id `screenTime`,
      ~line 1365) — BLS ATUS blocks automated fetch; use DataReportal/GWI
      social-media time as fallback with the source noted.
      DONE 2026-07-31: default 5 h/day confirmed defensible. TV: ~3–4 h/day
      incl. streaming (Nielsen, 2024–25; 3.5 h 18–34 up to 6.5 h 65+);
      social media ~2 h/day (GWI, DataReportal Digital 2025; global 2 h
      21 m). TV + social ≈ 5.8 h minus second-screen overlap ≈ 5 h.
      Hint rewritten with the breakdown + citations; new sources
      nielsenGauge2024 + datareportal2025 added to the sources map and
      cited on the screenTime/happiness effect (its note now documents
      the default-anchoring). Tests green.
- [x] 0.7 Attribution probe: write `tests/attribution.probe.js` (node script,
      requires js/factors.js + js/engine.js). Evaluate the PLAN.md probe
      profile ("regular healthy person": 300 min/wk cardio, 2×/wk strength,
      10k steps, decent diet, good sleep, low stress) and decompose the
      normalized log-HR into per-cluster naive products: movement (cardio,
      steps, strength, sitting), diet (fiber, fruitVeg, nuts, magnesium, fish,
      processedMeat, ssb, coffee), mind (purpose, social, stress, sleepReg),
      substances, sleep. Print per-cluster deltas + total + whether the
      clamped floor/cap is pinned. Run it.
      DONE 2026-07-31: tests/attribution.probe.js written + run. Results
      (2026-07-31, current factors.js): naive ratio vs reference 0.0643
      (-93.6%), normalized pre-clamp 0.1382 (-86.2%), clamp pinned at FLOOR
      0.45, LE delta pinned at +8 y cap. Per-cluster (each alone):
      movement 0.2785 (-72.2%), diet 0.3554 (-64.5%), mind 0.6500 (-35.0%),
      substances 1.0000 (0.0%), sleep 1.0000 (0.0%). Cluster product =
      exactly the naive total (0.2785 x 0.3554 x 0.6500 = 0.0643), BMI-only
      delta 1.0 (probe keeps reference build). Per-input worst: steps 0.52
      (-48%), fiber 0.729 (-27%), nuts 0.766 (-23%), sleepReg 0.78 (-22%).
      NOTE vs PLAN.md's v0.1.2 probe (movement 0.513 / diet 0.447 /
      mind 0.469, total -95%): same story, movement worse now because the
      probe profile is fully documented here and steps/cardio steps were
      re-verified since (lancet2025steps).
- [x] 0.8 Record probe results + the fair/unfair boundary table draft
      (fair multiplication / unfair multiplication / no combination zones
      per PLAN.md Plan #3 part 2) in PLAN.md Phase 0.
      DONE 2026-07-31: added "Phase 0 — results" block under the roadmap
      Phase 0 entry: full probe transcript, findings (overclaim
      concentrates 93.6% in movement+diet+mind; floor pinned by a
      merely-good profile; fix set = joint models for movement+diet +
      psychosocial per-lever-only), and the fair/unfair boundary table
      (3 zones x status) for the methodology page. Also updated the
      stale v0.1.2 probe numbers in the honesty sizing section.

## Phase 1 — verification passes (sources-first; the real work)

Each pass: read the primary source, extract exact numbers, record the
verification note. Where the number enters the model, edit js/factors.js in
the same step + run tests.

- [x] 1.1 PURE diet score (Mente 2023, Eur Heart J 44:2560–80): verify the 6
      components (fruit, vegetables, nuts, legumes, fish, whole-fat dairy),
      per-20-percentile-increment HRs, gradient HR 0.70 (0.63–0.77) for ≥5 vs
      ≤1, independent-cohort confirmation HR 0.73 (0.66–0.81), full adjustment
      set (age, sex, centre, energy, waist-to-hip, education, wealth, smoking,
      urban/rural, PA, diabetes, statins/BP meds), and the LMIC-gradient
      caveat. Also verify the additivity-test source (npj Sci Food 2026 —
      cognition outcome, LR p=0.304). Record in PLAN.md.
      DONE 2026-07-31: full text read (sochob.cl PDF mirror). All numbers
      verified EXACT: 6 components, 0.70 (0.63–0.77) ≥5 vs ≤1, per-quintile
      mortality 0.91 (0.89–0.93), confirmation 0.73 (0.66–0.81),
      adjustment set incl. PA + smoking, LMIC heterogeneity P<0.0001,
      component-balance (Appendix S8), score-family comparison
      (Med/HEI-2010/HEI-2015/DASH slightly weaker, Planetary much weaker).
      npj Sci Food 2026 (Su et al., 10.1038/s41538-026-00829-0, CHNS
      cognition): LR test P=0.304 exact, fruit-veg + fish-veg interactions
      NS, PA interaction FDR P=0.128 NS. Recorded in PLAN.md under new
      "Phase 1 — verification records" section.
- [x] 1.2 Score-family selection: from the same paper, compare PURE vs
      HEI-2010/2015, DASH, Mediterranean, Planetary gradients; apply the
      US-fit decision rule (US-cohort validation + slider overlap; if PURE
      components fit poorly e.g. dairy, a US-fitted alternative wins).
      Record decision + rationale in PLAN.md.
      DONE 2026-07-31: PURE wins on slider overlap (5/6 comps mappable vs
      ~4/13 HEI-2015, whose unmapped 9 include major ones) + PURE's
      component-removal robustness is documented in-paper (Appendix S8) —
      the dairy-less subset is evidence-supported. Planetary disqualified
      (neutral in this global analysis); Mediterranean/DASH weaker; PURE
      ~HEI-2010/15 (slightly stronger HRs). Decision + overlap table +
      pre-committed fallback recorded in PLAN.md. No code change (decision
      only; numbers enter with the 1.3 mapping).
- [ ] 1.3 Slider→component mapping: for each protective diet slider (fiber,
      fruitVeg, nuts, fish; decide magnesium + coffee), define the mapping to
      score components with ρ-annotated overlaps (fiber↔fruitVeg
      double-counting risk is explicit); record in PLAN.md, prepare for
      js/factors.js.
- [x] 1.4 Harmful foods: verify Pan 2012 (processed meat) and Malik 2019
      (SSB) adjustment sets — are they adjusted for other diet-quality
      indicators? Hunt published substitution analyses (red meat → plant
      protein/fish replacements). Decide: marginal + substitution ρ vs
      per-lever with conflation label. Record decision in PLAN.md.
      DONE 2026-07-31: both full texts read (Pan 2012 PMC3712342 + full
      PDF; Malik 2019 AHA PDF). Pan: adjusted for energy + whole grains +
      fruit + veg in quintiles; further foods/nutrients didn't move HRs;
      no BMI/PA interaction (P≥.10); substitution 1 serving/d processed
      meat → fish/poultry/nuts/legumes/whole grains = 10–22% lower all-
      cause. Malik MV2: adjusted for whole grains/fruit/veg/red+processed
      meat/energy/BMI + AHEI secondary (held); SSB×diet-quality P>.10.
      DECISION: keep both marginal + substitution ρ (NOT conflation-label):
      HRs already mutually adjusted for the score's foods — statistical
      double-charge is gone; ρ(processedMeat, dietScore)≈0.3 (Table 1
      intake correlation + substitution bounds), ρ(ssb, dietScore)≈0.15
      (independence P>.10 + BMI already adjusted). Substitution numbers →
      card findings (Phase 3). No factors.js changes (HRs already match).
- [x] 1.5 Ekelund 2016 PA×sitting: verify exact cell HRs, reference
      category, units (PA level in MET-min/wk; sitting h/day), and whether
      cells are adjusted for diet/BMI. Record in PLAN.md.
      DONE 2026-07-31: full text + supp Table 4 read (Lancet 388:1302–10,
      PMID 27475271). All 16 joint cells extracted and recorded in PLAN.md
      (Q1≤2.5/Q2 16/Q3 30/Q4>35.5 MET-h/w × <4/4-6/6-8/>8 h/d; ref = Q4×<4h:
      1.27/1.35/1.40/1.59 down the Q1 column; 1.04 at Q4×>8h). High PA
      eliminates sitting risk (1.04 NS); I² 38%; cells adjusted per-study
      originals (age/sex + BMI/smoking/alcohol; diet NOT uniformly —
      noted as the ρ-vs-diet caveat). Sitting slider → cells model in
      Phase 2, replacing the sitting marginal; cardio slider feeds the PA
      quartile.
- [x] 1.6 Momma 2022 (BJSM 56:755–63) aerobic×strength combined cells:
      verify RR 0.60 (0.49–0.72) all-cause / 0.54 CVD / 0.72 cancer, number
      of studies (3 for CVD), I², the paper's 'very low' quality rating, and
      adjustment sets. Record in PLAN.md.
      DONE 2026-07-31: full text read (Kyushu PDF). Joint cells VERIFIED
      with CI corrections: all-cause 0.60 (0.54–0.67) I²59.3% / CVD 0.54
      (0.41–0.70) I²62.6% / cancer 0.72 (0.53–0.98) I²84.8%, 3 studies each,
      GRADE 'very low' all. Pre-audit CIs (0.49–0.72) were wrong — fixed
      in PLAN.md record. Single-activity: MS vs none 0.85 (0.79–0.93)
      all-cause, aerobic-adjusted; MS J-shaped dose-response min 0.82 at
      60 min/wk → strength slider clamp at ~2–3 sessions/wk (Phase 2).
      4-cell contrast: both 0.60 < 0.85×0.80 multiplicative — combination
      is synergistic; aerobic-only cell is graphical-only in Fig 5 (noted
      for Phase 2, use Arem 2015 ~0.80 as that cell).
- [x] 1.7 NHIS 2023 PA×strength×sleep cells (282,473 US adults): verify
      joint cell HRs, the long-sleep synergy, adjustment sets. Record.
      DONE 2026-07-31: Duncan et al. J Sport Health Sci 12(1):65-72, PMID
      35872092, PMC9923431, Table 2 read. 12 cells verified (table in
      PLAN.md 1.7): Active×Short 1.08 NS (short-sleep risk eliminated by
      PA), long-sleep risk persists at ALL PA levels (1.40-2.32; MSA-only
      2.32 and Inactive 2.20 worst = the synergy lives in low-PA+long-sleep
      cells). No significant multiplicative/additive interactions -> use
      cells directly, no interaction term. Model 3 adjusts age/sex/BMI/
      smoking/alcohol/self-rated health/chronic disease; DIET AND SITTING
      NOT adjusted (explicit limitation; cells absorb diet/sitting
      correlation -> rho(sleep, diet) and rho(sleep, sitting) must be
      modest-positive, not zero). Sleep duration 3-band: Rec 7-9 (7-8 for
      >64), Short <=6, Long >=10 (>=9 for >64). Phase-2 dispatch: sleep
      duration becomes a cells model consuming the movement-model state
      (Active/AER/MSA/Inactive via cardio+strength), replacing the current
      sleep marginal; sleepRegularity stays mind-only.
- [x] 1.8 Mayo 2021 (Mayo Clin Proc 96:108–21) PA×BMI/BF/WC joint cells
      (UK Biobank 295,917): verify cells (e.g. HR 1.54 low-PA/high-BF vs
      high-PA/low-BF referent), attenuation pattern, adjustment sets. Record.
      DONE 2026-07-31: Sanchez-Lastra, Ding, Dalene, Ekelund, Tarp. Mayo Clin
      Proc 96(1):105-19, DOI 10.1016/j.mayocp.2020.06.049, PMID 33309181,
      open access. Supp Tables 3/9/10 read (all-cause/CVD/cancer joint
      cells, Model 3) - full tables in PLAN.md 1.8. Abstract numbers
      confirmed: G3(low PA)xHigh BF 1.54 (1.33-1.79); G1xHigh BF 1.24
      (1.04-1.49) - attenuation but not elimination; BMI>=35: G1 1.45 vs
      G3 1.52 (NO PA attenuation at BMI>=35). No significant interaction
      (P>0.18 Model 3) but cells used directly. Model 3 INCLUDES diet
      pattern adjustment -> rho(adiposity cells, dietScore) ~= 0 (contrast
      Ekelund 1.5). PA groups: G1=Q4+Q5 (>=~47 MET-h/wk self-report), G2=
      Q2+Q3, G3=Q1 (~6-8 MET-h/wk) - NOT on Ekelund's harmonized PA scale
      (Q1<=2.5); separate axes/rescaling needed in Phase 2. Never-smoker
      restriction attenuates to NS (smoking confound; card copy). BMI/BF/WC
      near-collinear (r 0.79-0.87) - supersession enforced. Phase-2
      dispatch: candidate ADIPOSITY joint model replacing Di Angelantonio
      BMI marginal; final pick vs 1.9 CRF×BMI deferred.
- [x] 1.9 BJSM 2025 CRF×BMI joint meta-analysis: verify the claim that
      fitness absorbs BMI's mortality association; decide Mayo vs CRF×BMI as
      the adiposity joint model. Record.
      DONE 2026-07-31: Weeldreyer, De Guzman, Paterson, Allen, Gaesser,
      Angadi. BJSM 59(5):339-46, DOI 10.1136/bjsports-2024-108748, PMID
      39537313, PMCID PMC11874340, full text read. 20 studies, 398,716 obs,
      three-level REML + robust variance (nested ACLS/CCLS cluster
      accounted). Claim VERIFIED: fit at any BMI ≈ normal-weight fit
      (overweight-fit 0.96 [0.61-1.50], obese-fit 1.11 [0.88-1.40], both
      NS); unfit 2-3x (normal-unfit 1.92 [1.43-2.57], over-unfit 1.82,
      obese-unfit 2.04 all-cause; CVD 2.04/2.58/3.35). CVD attenuated not
      eliminated (fit CVD cells 1.50/1.62 NS but elevated); CVD obese-unfit
      FRAGILE (NS on sensitivity). "Fit" bar = top CRF group per study,
      mostly just >20th percentile age-adjusted (authors' discussion).
      DECISION: Mayo 2021 (1.8) is the adiposity joint model, NOT CRF×BMI:
      (a) Mayo PA axis = self-reported PA (our cardio slider); CRF needs
      age/sex norm tables; (b) Mayo covers BMI+BF+WC rows (bmi/bodyFat
      sliders), Weeldreyer BMI-only; (c) Mayo diet-adjusted, 4 BMI rows
      incl. >=35 no-attenuation (conservative); (d) Weeldreyer dichotomy +
      clinical populations fit no slider. Weeldreyer role: finding card
      "fitness absorbs fatness" + engine cross-check (Mayo G1×BMI>=35 1.45
      vs obese-fit 1.11 - discrepancy = measured CRF ≠ self-report PA, goes
      in note) + vo2maxOn: Mayo PA axis takes vo2max-derived state
      (Phase-2 detail).
- [x] 1.10 Mediation shares: verify CHARLS (37.2% BMI / 39.6% CRP) and MSSE
      2025 (22.2% BMI, PA–CVD); fix the 20–40% band reference. Record.
      DONE 2026-07-31: CHARLS VERIFIED — Wei J et al., Chin J Public Health
      2024;40(6):730-6, DOI 10.11847/zgggws1143020 (CHARLS 2011-18, n=5,727
      >=45y, 509 deaths): 37.22% of PA-all-cause through BMI, 39.60% via
      CRP, highest-vs-lowest PA quartile (Q4 >=12,264 MET-min/wk, total PA
      incl. occupational); fully-adjusted HRs already include mediators
      (direct effects). MSSE 2025 EXISTS BUT DIRECTION REVERSED — Zhao L et
      al., MSSE 57(7):1326-32, DOI 10.1249/MSS.0000000000003668 (NHANES
      n=35,406, four-way decomposition + MR): 22.2% = proportion of the
      BMI->CVD association mediated BY PA, NOT PA->CVD through BMI. Not a
      discount coefficient; role = causal-support evidence for BMI<->PA
      pathway (Mayo attenuation copy). Counterpoint: Long et al. Eur J
      Epidemiol 2015;30:71-9 (PMC4356894, ADNFS): BMI adjustment changed
      PA-mortality HRs <8% (change-in-estimate) - mediation estimates are
      method-dependent. BAND FIXED in PLAN.md (both refs): point estimate
      37% (CHARLS, only directionally-correct causal-mediation number),
      sensitivity 8-40% (ADNFS<8% to CHARLS 37%); MSSE 22.2% dropped from
      band. Discount now applies only to steps~BMI and strength~BMI
      (cardio~BMI/bodyFat covered by Mayo joint cells per 1.8).
- [x] 1.11 Psychosocial search pass: search for joint mortality models
      covering purpose + stress + social (+ sleep regularity); confirm none
      exists; record search terms + conclusion in PLAN.md (this is the
      "per-lever only" default's justification).
      DONE 2026-07-31: searches "joint association purpose in life perceived
      stress social connection mortality ..." + "perceived stress social
      support ... sleep regularity index mortality". CONCLUSION: NO joint
      purpose×stress×social mortality model exists - per-lever default
      stands. Closest: purpose×SES joint (AJPM 2021 PMC8319073); purpose
      alone (Alimujiang 2019 HRS HR 2.43 lowest vs highest; Boyle 2009;
      Sutin 2026 IPD meta 488,765/25 samples/32 y, PMID 42417009); social
      components interactions only (BMC Med 2023 UKB 458,146 - internal to
      social, no purpose/stress); loneliness->purpose->mortality mediation
      ~88% (Soc Sci Med 2026) = mediator-pair evidence for purpose<->social
      (discount modest; loneliness != social slider). SLEEP REGULARITY:
      expected "none" WRONG - mortality data EXISTS: Windred 2024 (Sleep
      47(1):zsad253, UKB n=60,977 actigraphy SRI, top vs bottom quintile HR
      0.70 [0.59-0.83], mutually adjusted for duration, stronger than
      duration) + Korean duration×regularity joint cells (Sci Rep 2025,
      n=9,641: <7h irregular 1.28, women >8h irregular 1.78). 1.7's "no
      mortality joint data" for sleepReg is outdated; Phase-2/3 candidate
      to give sleepReg a mortality effect with rho(sleepReg, sleepCells)
      moderate-high + covariance share; NOT in this pass (scope). Full
      record in PLAN.md 1.11.
- [x] 1.12 Substance mutual adjustment: verify Wood 2018 (alcohol adjusts
      for smoking); check snus, vaping, cannabis sources for mutual
      adjustment with smoking/alcohol; any failing pair becomes a ρ pair.
      Record. DONE 2026-07-31. Wood 2018 adjusts for smoking status ✓;
      Jha 2013 adjusts for alcohol consumption (4 categories) ✓; snus
      never-smoking men by design ✓ but main model = age+BMI only (no
      alcohol) → ρ(snus, alcohol) 0.15 (0.05–0.25) sensitivity-stable;
      PATH (berlowitz2022) mutually exclusive categories + pack-years²,
      no alcohol collected → ρ(vaping, alcohol) 0.10; PATH adjusts ever
      marijuana ✓; sidney1997 adjusts smoking+alcohol, interactions NS,
      nonsmoker-sensitivity stable ✓. CORRECTION: snus CVD CI must be
      1.15–1.41 not 1.20–1.35 (factors.js edit in application pass).
      Full record in PLAN.md §1.12.
- [x] 1.13 Calibration anchors: verify Li 2018 (Circulation 138:345–55:
      HR 0.26 (0.22–0.31) for 5-vs-0; +14.9 y women / +12.4 y men at 50) and
      Sun 2022 China (HR 0.38); pre-register the anchors + tolerance band in
      PLAN.md. DONE 2026-07-31. Verified at primary sources: Li 2018 =
      HR 0.26 (0.22–0.31); LE deltas are +14.0 (11.8–16.2) F / +12.2
      (10.1–14.2) M at 50 (todo draft's 14.9/12.4 was WRONG, corrected).
      Sun 2022 = Lancet Public Health 7(12):e994–1004 (NOT BMJ), aHR 0.38
      (0.34–0.43) vs 0–1 factors, +8.8 y M / +8.1 y F at age 30. Fully
      pre-registered in PLAN.md §1.13: slider→factor profile mapping table,
      raw-ratio metric via evaluateRaw, bands [0.22, 0.31] primary /
      [0.34, 0.43] cross-check, mapping decisions (alcohol held, non-score
      factors at defaults), no-band-widening rule. Baseline probe
      (pre-refactor): ratio 0.041 (target 0.26), 32.3 y — expected-fail
      evidence of the conflation problem; script /tmp/opencode/anchor_probe.js.
- [x] 1.14 Cross-category residual pairs (option #2 list): sun↔sleep↔
      outdoor, RHR↔cardio/VO2max, meditation↔stress, grip↔strength —
      justify each ρ (or assumption band) with sources. Record.
      DONE 2026-07-31. Six pairs recorded in PLAN.md §1.14:
      (1) ρ(rhr, cardio) 0.20 (ρU 0.10), tier moderate — Fenland
      (Gonzales 2023 PLoS ONE 18(5):e0285272): RHR↔VO2max β −0.26/−0.29
      age-adjusted, ~50% attenuated by PA (PAEE 30–40% + MVPA 5–15%),
      fully-adjusted β −0.13 (≈r 0.16), longitudinal Δr −0.20;
      direction NEGATIVE; aune2017rhr already mostly net of activity.
      (2) ρ(rhr, vo2max) 0.15 (ρU 0.10), same source (fully-adjusted
      r≈0.16). (3) ρ(meditation, stress) 0.28 (ρU 0.13), DIRECT r:
      Munjal 2025 (Front Psychiatry 16:1573407): PSS-10↔frequency
      rₛ −0.27, ↔min/week rₛ −0.29; caveat: points-pathway overlap
      needs a points analogue in 2.2 (log-space blend is HR-only).
      (4) ρ(grip, strength) 0.25 (ρU 0.15), assumption band 0.10–0.40 —
      no direct r found; RT→grip causal (Front Physiol 2025 network
      meta MD 7.02 kg at 3×/wk). (5) ρ(sunExposure, sleep) 0.05
      (ρU 0.10) tier low — Burns 2021 (UKB, J Affect Disord 295:347–52)
      effects on timing/quality NOT duration (fully-adjusted ORs);
      Zhang 2026 (RQES, UKB n=100k): light exposure ↔ sleep duration
      NEGATIVE B −0.617. (6) ρ(sunExposure, sleepRegularity) 0.15
      (ρU 0.15) tier low, assumption band 0–0.30 (entrainer logic).
      (7) ρ(sunExposure, cardio) 0.10 (ρU 0.05) — DIRECT r from
      Nazeeh 2025 AHS-2 (Environ Epidemiol 9(3):e401), the same cohort
      as our HRs: time-outdoors↔PA r = 0.09/0.10 (warmer/cooler),
      HRs already PA-adjusted → sun marginal is net of activity;
      Burns 2021 model 3 (incl. exercise) corroborates. (8) ρ(sun
      Exposure, steps) 0.10 (ρU 0.05), same source. (The earlier
      roadmap "sun↔outdoor activity" note = pairs 7–8, not a
      duplicate input.) Not paired: meditation↔sleep/social
      (defer 3.5). New source keys needed in application pass:
      gonzales2023, munjal2025, burns2021, zhang2026. Full record in
      PLAN.md §1.14.
- [x] 1.15 js/factors.js schema: add `jointModels: []` (documented schema:
      { id, cluster, model: 'score'|'table'|'cells', source, steps, units })
      and `overlaps: []` (documented schema: { a, b, rho, rhoU, kind, tier,
      note, source }) — empty → no-ops; write the Phase-1 silent-sources
      paragraph into PLAN.md. Run tests.
      DONE 2026-07-31. Both arrays added to HEALTH_MODEL between `findings`
      and `sources` with full schema comments (model shapes 'score'/'table'/
      'cells'; overlap kinds 'shared-pathway'/'residual-confounding'/
      'mediator'; rho = magnitude 0..1, sign in note; rhoU feeds the
      2·rhoU·σᵢ·σⱼ covariance term). meta.version bumped 0.1.2 → 0.1.3.
      Phase-1 silent-sources paragraph written into PLAN.md (after the
      "Deliverable" line of the Phase-1 section): resolved-by-sources,
      resolved-by-joint-models, assumption-band, structural-treatment, and
      diet-score groupings, with pointers to §1.3/§1.5–1.8/§1.12/§1.14.
      Population of the arrays happens in Phase 3 (values already recorded
      in PLAN.md §1.12 = 2 pairs, §1.14 = 9 pairs incl. new
      ρ(sunExposure, vitaminD) 0.15 (ρU 0.15) mediator band 0–0.30 added
      during this step). `node tests/engine.test.js` — all tests pass
      (empty arrays are no-ops; citation/topic tests unaffected).
      New-source keys to add when populating: gonzales2023, munjal2025,
      burns2021, zhang2026 (+ Frontiers 2025 RT network meta if cited).

## Phase 2 — engine machinery (no behavior change; empty structures → no-ops)

- [x] 2.1 engine.js cluster dispatch: for each cluster with a jointModels
      entry, compute the cluster total from the lookup (score gradient →
      per-component partial credit; table/cell interpolation); else marginal
      product; else per-lever-only flag (cluster excluded from the total
      product; contributions listed, not multiplied).
      DONE 2026-07-31. Per-cluster dispatch in engine.js (bandIndex/indexGrid/
      axisValue/lerpLog/gridTotal/scoreTotal/clusterTotalFor/makeResolver +
      clusterTotals export). Score lookup: components [{input,max,weight}] →
      score = Σ weight·clamp(v/max,0,1) → gradient steps (lookupSteps walk);
      partialCredit per input recorded on contribution records. Table/cells:
      unified {axes:[{inputs,coeffs,bands}], grid, interpolate} — axes sum
      coeff·input (read-only inputs), banded by max cutoffs; grid indexed by
      band indices; interpolate:true → bilinear on log HR between adjacent
      band cutoffs (2 axes; edge-clamped, no extrapolation). evaluateRaw now
      accumulates per-joint-model products/sigmas (first-members-match
      ownership; perLeverOnly entries {cluster,members} excluded from product
      and sigma; outputs without lookup coverage fall back to marginal; joint
      totals get their own widened CI via jm.evidence). Contribution records
      tagged cluster/viaJoint/partialCredit/perLever for Phase-4 UI. Schemas
      documented in factors.js jointModels/perLeverOnly comments (meta.version
      0.1.4); design decisions + Phase-3 calibration requirement recorded in
      PLAN.md §2.1. No behavior change: shipped structures empty → suite green
      byte-identical; tests/engine.test.js §[17] exercises the machinery with
      synthetic lookups. Note: JSON deep-clones corrupt max:Infinity steps
      (JSON→null) — tests must shallow-copy models.
- [x] 2.2 engine.js residual overlap handling: for `overlaps` pairs, blend
      the weaker effect in log space by `rho` (point estimate) and add
      2·rhoU·σᵢ·σⱼ to the covariance; rho=0 reproduces today's math.
      DONE 2026-07-31. evaluateRaw restructured into three passes:
      evalEffects (fx map: input→output→{hr,logHr,hrLow,hrHigh,sigma2,
      points,record,rdHr}) → applyOverlaps (blend: both members active per
      output |log HR|>1e-6 / |points|>1e-6 → weaker ×(1−ρ) in log space;
      ρ=1 collapses weaker to exactly 1.0 → combined = stronger alone;
      records tagged overlapBlend {pair,rho}) → accumulate (per-lever/
      joint-model/marginal routing on blended values; hrDelta from blended
      vs unblended-default). Covariance: per ACTIVE pair,
      2·rhoU·σᵢ·σⱼ (widened, pre-blend sigmas) into the output's global
      sumΣ² — placement irrelevant to the final total (documented).
      activeOverlaps(model, values) exported (reuses applyOverlaps —
      drift-proof for the Phase-5 conflation table). Shared factory-level
      sigma2() replaces the inline closure. Design + retirement rule
      (pairs fully inside a live cluster are removed from `overlaps`;
      rhr↔cardio, sun↔cardio, sun↔steps affected at 3.2) recorded in
      PLAN.md §2.2. Tests §[18]: ρ=0+rhoU=0 identical central+bounds;
      ρ=1 → stronger alone; ρ=0.5 log-space discount; covariance widens,
      rhoU doesn't move central; inactive pair no-op; points blend.
- [x] 2.3 engine.js bounds endpoints: independence (full product) vs
      within-cluster redundancy (strongest active effect per cluster) per
      output; exposed as labeled fields for the UI.
      DONE 2026-07-31. boundsEndpoints(model, values) exported + attached
      to evaluateRaw's return as `bounds`; evaluate() re-exposes it
      normalized (÷ average profile) and clamped to [hrFloor, hrCeiling]
      (compare against hrAvgRaw). Both endpoints use RAW unblended effects;
      perLever-only members excluded from both; derived BMI effect included
      (found via failing tests — bounds missed BMI until it was added).
      Conflation groups = joint models + overlap pairs (first-match
      ownership, same as dispatch); pairs need ≥2 active members to count
      (single-active pairs multiply like unclustered inputs); joint models
      with lookup coverage use the joint total as their redundancy
      contribution. Tests §[19]: empty structures → both endpoints = plain
      product; independence = full marginal product; redundancy = strongest
      × others; point between endpoints (mixed-direction pair); joint total
      as redundancy; perLever excluded; activeJoint; evaluate() bounds.
      PLAN.md §2.3 note corrected mid-flight: blend is monotone so pair
      groups ALWAYS bracket the point (any direction); joint totals are
      lookups that can fall outside — endpoints are assumption-space
      labels, not hard brackets.
- [x] 2.4 engine.js exports `activeJoint(model, values)` +
      `activeOverlaps(model, values)` (mirror sourceIndex/sourceTags
      drift-proof pattern).
      DONE 2026-07-31. activeOverlaps landed in 2.2; activeJoint landed
      here: clusterTotals shape filtered to clusters with ≥1 member off
      its default value (all-defaults cluster = average profile = 1.0x by
      calibration, so the UI skips it). Tests in §[19].
- [x] 2.5 Tests (tests/engine.test.js): lookups keyed correctly;
      interpolation bounds; ρ=0 reproduces today's math; ρ=1 pair → stronger
      alone; bounds ordering (independence ≥ point ≥ redundancy); per-lever-
      only clusters never enter the product; covariance widens; symmetry;
      ρ,ρU ∈ [0,1]; ids exist. All green with empty data structures.
      DONE 2026-07-31. §[17] lookups+bilinear+clamping+perLever; §[18]
      ρ=0/ρ=1/ρ=0.5, covariance, inactive pairs, points blend; §[19]
      endpoints (bracketing asserted as min/max containment — strict
      "independence ≥ point ≥ redundancy" ordering does not hold for
      mixed-direction groups, per §2.3 note); §[20] symmetry (a↔b swap
      no-op, same member blended) + data audit (members are real input ids,
      ρ,ρU ∈ [0,1], joint models well-formed). Suite: 20 sections, all
      green, shipped structures empty → byte-identical.

## Phase 3 — live per cluster (order: diet → movement → adiposity → substances → psychosocial)

- [x] 3.1 Diet cluster live: PURE-style score lookup wired (gradient →
      partial credit per slider), harmful-foods decision applied (1.4), probe
      shows diet delta ≈ the published gradient equivalent; tests + first
      calibration checks green.
      DONE 2026-07-31. factors.js v0.1.5: jointModels dietScore (members
      fiber/fruitVeg/nuts/fish, score model, fractional components with
      valueOf on fish, per-point gradient 0.91^k exact powers 1.0/0.91/
      0.8281/0.7536/0.6857 with 0.89^k/0.93^k CIs, evidence high, source
      mente2023); overlaps processedMeat↔dietScore ρ0.3, ssb↔dietScore
      ρ0.15, magnesium↔dietScore ρ0.5 (ρU = 0.5·ρ; notes cite pan2012/
      malik2019/fang2016). Golden-rule walk extended: sourceIndex/sourceTags
      append jointModels[].source + overlaps[].source AFTER the baseline
      (existing [n] numbers never shift; mente2023 = last #84, chip "Diet
      score"). Tests: §[2] marginal tests + §[17]/[18]/[19] machinery tests
      now use a stripped plainModel; §[17] asserts shipped cluster at
      defaults (score 3.0222, hr 0.7536); NEW §[21] ships the full
      verification: credit sums 0.6/0.8667/0.5556/1.0, no-double-count
      identity, hrAvg 1.0 at defaults, blend directions (processedMeat 8/wk
      → 1.1845^0.7; 0/wk → 0.9616^0.7; magnesium 0.969^0.5), score clamp,
      cancer marginal fallback, bounds option A (redundancy = cluster total
      + input side only), citation append + chip. Suite: 21 sections all
      green (870 assertions). NOTE: ssb default is 4.9 (reference-anchored,
      HR 1.0) — at defaults only the magnesium pair is active; ssb default
      is NOT 0. PLAN.md §3.1 implementation notes extended with "Shipped
      2026-07-31" addendum.
- [ ] 3.2 Movement cluster live: Ekelund table + Momma/NHIS cells (verified
      subset); supersession (VO2max replaces cardio → moves PA level) still
      works; probe vs cells.
      SUB-STEPS (created 2026-07-31 after §3.1 shipped):
      - [ ] 3.2-plan: record §3.2 implementation notes in PLAN.md — Ekelund
        axis coeffs (cardio min/wk + steps/d → MET-h/w), sitting bands;
        Momma 4-cell grids for mortality/cancer/cvd incl. aerobic-only cell
        sources; Duncan PA-category mapping (fn axis), sleep bands, and the
        cluster-cluster overlap decision (Duncan's PA dimension vs Ekelund/
        Momma — options: anchor-only vs ρ-pair vs sleep-only table; RECOMMEND
        decision required, do not hand-wave); `calibrate` anchor mechanism
        (log-space offset at defaults; needed because Ekelund default cell
        1.27 vs members' product 0.59 is ~115% off); VO2max↔PA-axis
        supersession (gatedBy resolution in axisValue — currently the axis
        resolver ignores toggles → vo2maxOn would double-count cardio in the
        axis); rhr/sun pair retirement (rhr↔cardio, sun↔cardio, sun↔steps —
        cardio/steps now cluster-owned; decide: pair vs cluster total ρ or
        drop, and whether to ADD them at all since overlaps currently has
        only the 3 diet pairs).
      - [x] 3.2a engine: `calibrate: true` on a joint model → log-space
        offset so the lookup total at DEFAULTS == the members' marginal
        product at defaults (per HR output; CIs shifted by the same offset);
        shared by computeJmTotals/activeJoint/clusterTotals/bounds; tests.
        DONE 2026-07-31: `calibrateOffsets()` (cached per model object;
        first-owner filter — members owned by an earlier jm excluded from
        the anchor sum) + `shifted()` applied in computeJmTotals (evaluateRaw
        /bounds/overlap-blends see anchored totals) and clusterTotals
        (sources.html conflation table sees anchored numbers). `calibrate`
        is a no-op for un-calibrated models — suite green before movement
        data shipped. Schema comment in factors.js documents the field.
        NEW §[22] (synthetic Ekelund fixture): default cell 1.78x off the
        members' 0.5896 product → anchored total equals it at 1e-9; constant
        shift k at other values incl. hrLow/hrHigh; combined HR and
        redundancy endpoint shift by k; reset → hrAvg exactly 1.0; earlier-
        cluster ownership exclusion (sitting-only anchor = 1.10). Suite:
        all green. PLAN.md §3.2 anchor bullet extended with the shipped
        note.
      - [ ] 3.2b Ekelund table wired: members [cardio, steps, sitting],
        PA axis (cardio+steps read-only), sitting axis, interpolate true,
        evidence high, source ekelund2016 (NEW source entry), calibrate:
        true, note disclosing the re-anchor; mortality only (cancer/CVD fall
        back to members' marginals); §[22] tests.
      - [ ] 3.2c Momma cells wired: members [strength], axes aerobic
        (cardio read-only, ≥150 min/wk) × strength (any ≥1); grids
        mortality [[1.0, 0.85],[0.80, 0.60]], cancer [[1.0, 0.88],[0.80,
        0.72]], cvd [[1.0, 0.83],[0.79, 0.54]]; aerobic-only cells from the
        existing Arem 2015 bands (disclose); NO calibrate (8% off, within
        band; keeps the published 0.60); §[22] tests.
      - [ ] 3.2d Duncan cells + supersession: sleep becomes a cells model
        (members [sleep], PA axis consumes movement state via an axis fn or
        decision from 3.2-plan); VO2max supersession: gatedBy-aware axis
        resolution (vo2maxOn → PA axis reads vo2max→MET-h/w instead of
        cardio); rhr/sun pair decisions applied; §[23] tests.
      - [ ] 3.2e probe vs cells + calibration checks (movement probe within
        band; anchoring exact at defaults; suite green); mark 3.2 [x] DONE.
- [ ] 3.3 Adiposity live: Mayo joint cells or %-mediated band; supersession
      (bodyFat replaces BMI) keys in.
- [ ] 3.4 Substances: ρ pairs applied where 1.12 failed verification;
      multiplication elsewhere.
- [ ] 3.5 Psychosocial per-lever-only flag live: no combined number;
      contributions shown individually with the conflation label ("cannot be
      separated from the other factors on this card").
- [ ] 3.6 Completion: Phase-0 regression test ("regular healthy person" not
      pinned at floor/cap) green; calibration suite green (PURE gradient,
      Ekelund cells, Momma cells, Li 2018 anchor within tolerance band);
      attribution probe re-run, results recorded in PLAN.md.

## Phase 4 — presentation

- [ ] 4.1 js/sources.js: render joint models (components, gradient, cells)
      + conflation table (pairs, ρ, classification, citation) generated from
      `jointModels`/`overlaps`.
- [ ] 4.2 js/app.js + index.html: per-slider disclosures ("counted at X% —
      overlaps Y"); psychosocial card copy ("no reliable way to combine these
      yet — shown individually"); per-lever "what this lever does" section.
- [ ] 4.3 Methodology copy (sources.html): fair/unfair boundary table
      verbatim; Ezzati 2003 independence qualifier; bounds labeled as
      assumption-space; ρ named as a model parameter.
- [ ] 4.4 Mind outputs: psychosocial blends nothing in points space; fuzz +
      badges unchanged; copy updated.

## Phase 5 — deferred (not now)

GBD pathway layer (H), age-conditional actuarial engine (E), own-cohort
analysis (P), full Q1/Q2 split (I), Monte Carlo default.
