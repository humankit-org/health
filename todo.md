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
- [x] 0.9a SWEEP-local: every source key in the sources map must be attached
      to >=1 rendered citation (effect/finding/joint/bmi/baseline walk).
      Review pass (2026-08-01) found 7 dead entries (defined, cited only in
      comments, never rendered): blochibenfeldt2025, moore2012, kundu2025,
      mandsager2018, cillekens2022, aune2016grain, zhai2015. Fix: attach
      each to the effect/finding its comment already describes (kundu2025
      gets a vaping-cancer finding card) or delete. Then 93/93 sources
      indexed and tests green.
      DONE 2026-08-01: all 7 attached — moore2012 → cardio mortality effect
      (also cited in index.html LE-method copy), aune2016grain → fiber
      mortality effect (note now states the overlap rule), zhai2015 →
      screenTime happiness effect (was already named in its note), kundu2025
      → NEW vaping-cancer finding card (neutral, shows when vaping=current),
      mandsager2018 → vo2max mortality effect, blochibenfeldt2025 → strength
      osteoporosis finding, cillekens2022 → OPA paradox finding. Sources
      count now 93/93 both directions (no dead keys, no undefined cites);
      meta.updated bumped to 2026-08-01. Suite green.
- [x] 0.9b SWEEP-movement: web-verify every movement-cluster effect column
      (mortality/cancer/cvd) against its cited source: cardio (arem2015 —
      incl. CVD column), steps (lancet2025steps — incl. cancer/cvd columns),
      strength (momma2022/gordon2018/coelhojunior2020), sitting (biswas2015),
      vo2max (kodama2009), grip (leong2015), rhr (aune2017rhr). occupationalPA
      + bodyFat CVD columns already nulled (0.2/0.3). Fix or null per working
      agreement; tests after each fix.
      PROGRESS 2026-08-01 (fixes applied, tests green):
      + sitting cvd FIXED: Biswas 2015 (PMID 25599350) CVD mortality is
        1.179 (1.106–1.257) — our 1.150 (1.107–1.195) was a garbled
        transcription (looked like CVD incidence 1.143). Now max step
        1.18/1.106/1.257, middle steps re-interpolated. Mortality (1.24,
        1.09–1.41) and cancer (1.173, 1.108–1.242) columns verified exact.
      + grip cvd FIXED: Leong 2015 (PMID 25982160) CVD mortality per 5 kg
        lower is 1.17 (1.11–1.24), not 1.19 (1.15–1.23). Inverse now
        hr 0.855 (0.807–0.901); mortality column (0.8621 = 1/1.16,
        CI 1/1.20–1/1.13) verified exact.
      + rhr cvd FIXED: Aune 2017 (PMID 28552551) CVD is 1.15 (1.11–1.18) —
        lower CI was 1.12, now 1.11. Mortality 1.17 (1.14–1.19) and cancer
        1.14 (1.06–1.23) verified exact.
      + cardio FIXED: Arem 2015 Table 3 (PMC4451435, n=661k) cause-specific
        columns now EXACT: cancer 1.00 / 0.87 (0.83–0.90) / 0.79 (0.75–0.82)
        / 0.75 (0.72–0.79) / 0.74 (0.71–0.77) / 0.69 (0.55–0.87) (was an
        all-cause reuse, evidence now high); CVD 1.00 / 0.80 (0.77–0.84) /
        0.67 (0.65–0.70) / 0.59 (0.57–0.63) / 0.58 (0.56–0.61) / 0.71
        (0.56–0.91) with threshold note; all-cause Infinity step 0.69 ->
        0.68 (0.59–0.78) per published 75+ MET-h/wk HR.
      + steps FIXED (all three HR columns + cognition/happiness notes):
        verified the FULL Lancet 2025 abstract (PMID 40713949, pages
        e668–e681 — entry had wrong pages + null pmid; both fixed; banach
        2023 pmid corrected 37555447 -> 37555441). Published anchors at
        7,000 vs 2,000 steps/day: all-cause 0.53 (0.46–0.60) NON-LINEAR
        (inflection 5–7k -> all-cause now plateaus at 0.53 from 7k up,
        old tail 0.46/0.42 at 15k+/Inf overclaimed); CVD mortality 0.53
        (0.37–0.77) LINEAR (GRADE low, was 'high'; bands 10k/15k follow
        the linear slope 0.36/0.19, held flat >15k); cancer mortality
        0.63 (0.55–0.72) LINEAR (10k/15k 0.48/0.30, held flat >15k; old
        0.48@15k overclaimed). Intermediate 4k/6k bands re-interpolated
        in log space to the verified anchor (mortality 0.78/0.60, cvd
        0.78/0.60, cancer 0.83/0.69 — old cancer CIs 0.65–0.98 were
        invented). Notes: honest null added (cancer INCIDENCE 0.94
        [0.87–1.01] NS — benefit is mortality-side), dementia note
        corrected (0.62 [0.53–0.73] at 7k, was ~0.58@12k), depression
        note now cites 0.78 (0.73–0.83), CVD incidence 0.75 disclosed,
        Paluch 2022 (Q2 5,801 -> 0.60) + Banach per-increment cross-check
        documented. Tests: steps pins 0.52/0.67 -> 0.53/0.60, 1.00/0.67 ->
        1.00/0.60, 15k cvd 0.50 -> 0.19, 15k cancer 0.48 -> 0.30; §[22]
        members product 0.5896 -> 0.5280; §[3] avg raw sanity bound 0.4 ->
        0.3. PROBE re-run (live model): movement cluster -72.2% -> -38.4%,
        steps per-input -48% -> -17.7% (via Ekelund PA axis), naive ratio
        -93.6% -> -77.9%, pre-clamp -86.2% -> -69.0% — the joint tables are
        visibly deflating the movement overclaim.
      + strength FIXED (all three HR columns, evidence, notes; tests green):
        Momma 2022 full text verified (PMC9209691). Two-group any vs none:
        all-cause 0.85 (0.79–0.93) [old 0.92 invented CI], CVD 0.83
        (0.73–0.93) [old 0.90 not in paper], total cancer 0.88 (0.80–0.97)
        [old 0.81 (0.71–0.93) NOT in the paper — invented; paper's 2-group
        is 0.88]. Non-linear dose-response minima: all-cause 0.83
        (0.79–0.86) at ~40 min/wk, CVD 0.82 (0.76–0.90) at ~60, cancer
        0.91 (0.85–0.97) at ~30; RR <1.00 up to ~130–140 min/wk. New
        columns: 0 / 1sess = two-group / 2sess = published min / 3+ = our
        interpolation (geometric midpoint of min->1.0, CI spans min–1.0 —
        exact values >60 min/wk not published, disclosed). Evidence
        moderate -> low (paper GRADE very low, I² 59–85%) — now matches
        mommaCells 'low'. mommaCells note updated: marginal 1-session band
        now EXACTLY matches the MS-only cells (0.85/0.88/0.83, was ~8%
        off). Also removed a DUPLICATE momma2022 source key (bare entry at
        ~2665 shadowed the rich note entry — the last duplicate wins in JS
        object literals, so sources.html lost the PMC/GRADE note; rich
        entry now effective). gordon2018 (happiness) + coelhojunior2020
        (cognition) points untouched. Tests: §[5] pin 0.63*0.85 ->
        0.63*0.83. PROBE: movement cluster still -38.4%, strength per-input
        naive 0.85 (-15.0%) — marginal now matches the mommaCells cell.
      + vo2max VERIFIED EXACT, no changes: Kodama 2009 abstract (PMID
        19454641, JAMA 301(19):2024–35) confirms per 1-MET higher CRF —
        all-cause RR 0.87 (0.84–0.90) [102,980 participants, 6,910 deaths,
        33 studies] and CHD/CVD RR 0.85 (0.82–0.88) [84,323 participants,
        4,485 cases]; both columns + CIs match to the digit. 1 MET ≈ 1 km/h
        running speed; low vs high CRF all-cause 1.70 (1.51–1.92). Notes
        enriched with the verified counts; low->low-vs-high contrast added.
  DONE — movement cluster fully verified/fixed.
- [x] 0.9c SWEEP-diet: fiber (yang2015/reynolds2019), fruitVeg (wang2014),
      magnesium (fang2016), fish (kwok2019/li2020), nuts (aune2016),
      omega3/vitaminD (manson2019 pair), ironDeficiency (houston2018),
      creatine (no-data). Coffee/processedMeat/ssb already audited (0.4/1.4).
      DONE 2026-08-01 — every input checked against its primary source:
      + fiber: Yang 2015 VERIFIED EXACT (PMID 25552267 — mortality perUnit
        0.90 [0.86–0.94] per 10 g; 17 cohorts, 982,411 people, 67,260 deaths,
        I² 77%; note enriched). Reynolds 2019 full text (mirror PDF, Lancet
        blocks bots): cancer steps -> 1.19 (1.12–1.27) / 1.00 / 0.84
        (0.78–0.89) = published colorectal-incidence highest-vs-lowest
        (22 studies); <9 g band = disclosed log-inverse. cvd steps ->
        1.35 (0.92–2.00) / 1.00 / 0.74 (0.50–1.09) = paper publishes NO
        single CVD composite, so >24 g band = geometric-mean of published
        CHD mortality 0.69 (0.60–0.81) x stroke mortality 0.80 (0.56–1.14,
        NS) with CI in quadrature, <9 g its log-inverse — both disclosed.
      + fruitVeg: wang2014 VERIFIED (PMC4115152): mortality 0.95 (0.92–0.98)
        exact (16 cohorts/833,234 people/56,423 deaths). CVD hrLow corrected
        0.93 -> 0.92 (published 0.92–0.99). CANCER FIXED: old 1.00
        (0.97–1.03) invented -> published 0.97 (0.90–1.03, P=0.31), the
        "not appreciably associated" null. Test pin -> 0.97^2.4 (cap 5).
      + magnesium: fang2016 VERIFIED (PMID 27927203): mortality 0.90
        (0.81–0.99) per 100 mg/day EXACT (40 cohorts, >1M people, 10,983
        deaths). CVD FIXED: old 0.85 (0.77–0.93) NOT in paper — total CVD is
        NULL (RR 0.99, 0.88–1.10, NS; CHD 0.92 [0.85–1.01] NS). Now 0.99
        (0.88–1.10); note explains protection is component-specific (stroke
        0.93 [0.89–0.97], heart failure 0.78 [0.69–0.89]).
      + fish: TWO FABRICATED/DEAD CITATIONS FOUND AND FIXED: "li2020" (Heart)
        does not exist (DOI unresolvable; PMID 31451418 is a pharmacogenomics
        paper). Replaced with the real dose-response meta: jayedi2018
        (Jayedi A et al., Public Health Nutr 21(7):1297–1306, PMID 29317009):
        all-cause 0.98 (0.97–1.00) per 20 g/day (I² 82%), CVD mortality 0.96
        (0.94–0.98) per 20 g/day (I² 0%), 14 cohorts/911,348 people. kwok2019
        verified real (EJPC review; fish all-cause 0.98 [0.97–1.00]) but it
        covers NO cancer — fish cancer column re-sourced to zhang2018
        (NIH-AARP, 421,309 people, PMID 30019399): men top-vs-bottom
        quintile 6% lower cancer mortality (0.94 [0.90–0.99]), women null.
        Bands rebuilt as disclosed constructions from the per-20-g linear
        slope (0.7x / 1.8x dose): mortality some 0.98 (0.98–1.00) / lots
        0.96 (0.95–1.00); cvd some 0.97 (0.96–0.99) / lots 0.93 (0.89–0.96);
        cancer some 0.99 (0.96–1.02) / lots 0.97 (0.94–1.00). U-shape caveat
        in Western cohorts noted. Test pin 0.95 -> 0.96.
      + nuts: aune2016 VERIFIED EXACT (PMID 27916000): all-cause 0.78
        (0.72–0.84), CVD 0.79 (0.70–0.88), total cancer 0.85 (0.76–0.94)
        per 28 g/day; resp 0.48 / diabetes 0.61 match findings. Notes
        enriched, no value changes.
      + omega3: VITAL VERIFIED EXACT vs NEJM abstract (PMID 30415637):
        mortality 1.02 (0.90–1.15), CVD 0.92 (0.80–1.06), cancer 1.03
        (0.93–1.13), cancer death 0.97 (0.79–1.20), MI 0.72 (0.59–0.90).
        Notes marked VERIFIED; no changes.
      + vitaminD: VITAL vit-D VERIFIED (PMID 30415629): cancer death 0.83
        (0.67–1.02) EXACT; supplement mortality 0.99 (0.87–1.12) EXACT; CVD
        supplement 0.97 (0.85–1.12) EXACT. FIXED: comment+note claimed cancer
        incidence "null (1.03)" — that is omega-3's number; vit-D cancer
        incidence is 0.96 (0.88–1.06). CVD deficient FIXED 1.45 (1.25–1.65)
        -> 1.41 (1.18–1.68) = Schöttker 2014 published CVD-free quintile
        contrast (full text, PMC4061380; with-prior-CVD 1.65 [1.22–2.22]);
        all-cause 1.57 (1.36–1.81) EXACT. (schottker2014 PMID 24938302 was
        already correct in the source map.)
      + ironDeficiency: houston2018 VERIFIED EXACT (PMID 29626044: fatigue
        SMD −0.38 [−0.52 to −0.23], physical capacity null) and
        falkingham2010 VERIFIED EXACT (PMID 20100340: attention SMD 0.59
        [0.29–0.90], IQ +2.5 pts [1.24–3.76], no RCTs in men). Notes
        enriched.
      + creatine: avgerinos2018 VERIFIED (PMID 29704637, only 6 studies /
        281 people — 6 not the "several" implied). Evidence moderate -> low
        (thin evidence, conflicting domains, unchanged in young adults).
      Tests green after every fix. NOTE: two dead/fabricated citations
      killed this round (li2020, plus the earlier wrong-pmid guesses) —
      always verify citation identity before numbers.
- [x] 0.9d SWEEP-mind/substances/environment: sleep (cappuccio2010/lowe2017),
      stress (russ2012), social (holtLunstad2010), purpose (cohen2016),
      snus (aune2017snus), cannabis (sidney1997), pm25 (di2017),
      meditation (goyal2014), cognitiveTraining (ngandu2015).
      Smoking/alcohol/screenTime/sleepRegularity/sauna/vaping already audited.
      (note: cognitiveTraining input cites edwards2017 ACTIVE trial, not
      ngandu2015 — confirmed correct during the sweep.)
      DONE, tests green after every fix. Audit trail:
      - sleep: cappuccio2010 VERIFIED exact (PMID 20469800, 16 studies /
        1,382,999 people / 112,566 deaths): all-cause short 1.12 (1.06-1.18),
        long 1.30 (1.22-1.38). CVD column was MIS-SOURCED (cited cappuccio2010
        which is all-cause-only): re-sourced to cappuccio2011 (EHJ, PMID
        21300732, 15 studies / 474,684 people): total CVD short 1.03
        (0.93-1.15, NS) / long 1.41 (1.19-1.68) — old 1.07/1.28 matched
        nothing; CHD 1.48 (1.22-1.80), stroke 1.15 (1.00-1.31). New source
        entry added. lowe2017 VERIFIED exact (PMID 28757454, g=-0.324/-0.409/
        -0.192, 61 studies); bacaro2023 VERIFIED + filled null pmid ->
        38125984 (PMC10730350, r=0.18/0.15, 42 studies).
      - stress: russ2012 VERIFIED (PMID 22849956, 68,222 people): GHQ 1-3 HR
        1.20 (1.13-1.27), 4-6 HR 1.43 (1.31-1.56), 7-12 HR 1.94 (1.66-2.26).
        Model steps = published HR ÷ 1.20 (1.1917/1.6167) — disclosed
        construction in note. franks2021 VERIFIED exact (PMID 34366334: MCI
        1.19 [1.03-1.38], dementia 1.44 [1.07-1.95]). aggarwal2014 PMID was
        WRONG (24367124 = IMPACT depression-CVD paper) -> real 24367123
        (CHAP, 6,207 older adults), DOI 10.1097/PSY.0000000000000016, pages
        80-85 fixed.
      - social: holtlunstad2010 VERIFIED (PMID 20668659, 148 studies /
        308,849 people): OR 1.50 (1.42-1.59), integration OR 1.91 (1.63-2.23).
        Comment fixed: paper says effect consistent across causes of death
        (not "particularly strong" for CVD); cvd note discloses
        mirror-the-all-cause approximation.
      - purpose: cohen2016 VERIFIED (PMID 26630073, 10 prospective /
        136,265 people): all-cause 0.83 (0.75-0.91), CV events 0.83
        (0.75-0.92) — CVD CI was 0.91, corrected to 0.92 in steps + note.
      - snus: byhamre2021 VERIFIED (PMID 33347584, 169,103 never-smoking men,
        8 cohorts): all-cause 1.28 (1.20-1.35), cancer 1.12 (1.00-1.26). CVD
        CI FIXED 1.20-1.35 -> 1.15-1.41 (was copy-pasted from all-cause). Risk
        rose with duration, not weekly amount; men-only (note says so).
      - cannabis: sidney1997 VERIFIED (PMID 9146436, 65,171 people): men
        current-use non-AIDS RR 1.12 (0.89-1.39) = the regular band; women
        1.09 (0.80-1.48). Note enriched: "regular" = published men's
        estimate, "occasional" = disclosed interpolation. moore2007 VERIFIED
        exact (PMID 17662880: psychosis ever-use OR 1.41 [1.20-1.65],
        frequent 2.09 [1.54-2.84]).
      - pm25: mortality VERIFIED exact (di2017, PMID 28657878: +7.3%
        [7.1-7.5] per 10 µg/m³; 60.9M people / 460.3M person-years; +13.6%
        even below the 12 µg/m³ US standard). CVD column had NO source — Di
        2017 abstract publishes no CVD figure. Re-sourced to orellano2024
        (WHO AQG-update meta, Int J Public Health 69:1607683, PMID 39399882):
        circulatory mortality 1.127 (1.102-1.152) per 10 µg/m³ (42 studies,
        high certainty) — now 1.13 (1.10-1.15); IHD 1.143 (1.102-1.186),
        cerebrovascular 1.146 (1.101-1.192) noted in comment. New source
        entry added.
      - meditation: goyal2014 VERIFIED exact (PMID 24395196, 47 RCTs /
        3,515 people): anxiety ES 0.38 (0.12-0.64), depression 0.30
        (0.00-0.59) at 8 weeks. No value changes.
      - cognitiveTraining: edwards2017 VERIFIED exact (PMID 29201994,
        ACTIVE, N=2,802, 10 y): speed training HR 0.71 (0.50-0.998) = 29%
        dementia reduction; memory/reasoning NS (0.79, P=.177/.163);
        per-session HR 0.90 (0.85-0.95). Note now cites exact numbers.
- [x] 0.9f SWEEP-sunExposure + left-behinds: sunExposure (id `sunExposure`)
      was NOT in any sweep — its sources adventist2025, stevenson2024,
      maartense2024 all have `pmid: null`, and its notes quote uncited
      "Sun-BEEM 2026" HR numbers (0.89/0.84 vs low) that must get a source
      key or be dropped (golden rule: every number cites). lindqvist2014
      (PMID 24697969) verified present. Also grep the sources map for any
      remaining `pmid: null` entries and fill or flag them.
      DONE 2026-08-01, tests green after every edit:
      + adventist2025 VERIFIED against full text (OA, PMC12122178, PMID
        40444275 filled): 83,205 people / 11,515 deaths, warmer months vs
        0.5 h ref. All-cause 2h 0.90 (0.86-0.93), 3h 0.88 (0.84-0.93),
        5h 0.90 (0.85-0.95); CVD 0.89 (0.83-0.95) / 0.87 (0.79-0.94) /
        0.86 (0.79-0.94); CANCER ELEVATED 1.02 (0.93-1.13) NS / 1.08
        (0.97-1.20) NS / 1.15 (1.02-1.29) SIG at 5h. Cooler-month
        associations weaker (noted).
      + mortality steps FIXED: 3h step was 0.90 (a garbled 2h number;
        note text said 0.88 — the note was right) -> 0.88 (0.84-0.93);
        Inf step was 0.88 (0.82-0.94, unsourced) -> held flat at the
        published 5h 0.90 (0.85-0.95), disclosed. 0h band 1.15 (1.06-1.25)
        kept but now explicitly disclosed as interpolation (AHS-2's lowest
        category is 0.5h; lindqvist2014 avoiders ~2x, verified abstract
        PMID 24697969, 29,518 women / 2,545 deaths).
      + CVD steps FIXED: 3h 0.88 -> 0.87 (0.79-0.94); 5h 0.87 -> 0.86
        (0.79-0.94); Inf 0.85 -> held 0.86; 0h band disclosed.
      + CANCER column REBUILT — old steps (0.96 benefit at 3h/5h/Inf)
        CONTRADICTED the only peer-reviewed quantitative cohort (AHS-2
        elevation) and matched neither source. New steps = published AHS-2
        numbers: 1.08 (0.97-1.20) at 3h, 1.15 (1.02-1.29) at 5h+, 0-1h ref
        zone 1.00; evidence moderate -> low; note discloses the latitude
        conflict (UK Stevenson 2024 qualitative inverse; Sun-BEEM preprint
        non-skin cancer 0.92/0.89, skin flat).
      + Sun-BEEM 2026 IS REAL: Gu J et al., medRxiv preprint
        2026.01.08.26343592 (NOT peer-reviewed), 419,007 UKB. Verified
        exact: all-cause medium 0.89 (0.87-0.91) / high 0.84 (0.82-0.87);
        CVD 0.82/0.77; non-skin cancer 0.92/0.89; skin-cancer mortality
        flat. Added sunbeem2026 source key (preprint disclosure in journal
        field), cited on all three sun effects.
      + stevenson2024 PMID 39094281 filled; abstract verified (qualitative
        inverse all-cause/CVD/cancer; no per-category HRs — notes now say
        qualitative, not invented numbers).
      + maartense2024 PMID 39664799 filled; full text verified (d=0.46
        [0.29-0.62], sensitivity 0.53 [0.35-0.72], 30 of 74 studies,
        I2 96%). DROPPED the uncited "bright-light d=0.48 for depression"
        sentence (not in this paper) + added I2 disclosure.
      + null-pmid census: kundu2025 -> 39877383, kang2024 -> 37956830,
        zhang2024vitd -> 38461506 filled. Remaining nulls are all
        legitimately non-PubMed (nchs2023 CDC brief, hunt2018 JSCP not
        indexed [DOI verified via Crossref], allcott2020 AER, market
        reports, sunbeem2026 preprint).
      + Tests: §[11] pins updated (mortality 2.5h 0.90->0.88, 6h 0.88->
        0.90; CVD 2.5h 0.88->0.87, 6h 0.85->0.86; cancer 2.5h 0.96->1.08,
        6h 0.96->1.15); blend/pair tests unaffected (dynamic values).
        Suite green. Sources 96 -> 97 (sunbeem2026), 97/97 both directions.
      + PLAN.md §1.16 row updated: sunExposure swept (rebuilt).
- [x] 0.9e SWEEP-record: append a "0.9 sweep" subsection to PLAN.md with
      per-input verdicts (verified / fixed / nulled / no-data), final test
      run, sources count = indexed count.
      DONE: PLAN.md §1.16 "The 0.9 sweep" — 25 inputs tabulated (5 verified /
      19 fixed / 1 rebuilt / 2 pre-sweep nulled), the 2 fabricated citations
      documented, disclosed-construction policy restated, final test run
      "All tests passed" (2026-08-01, post-sunExposure), sources integrity
      97/97 both directions (defined-but-unrendered: none, cited-but-
      undefined: none; remaining null PMIDs = non-PubMed by nature, all
      Crossref-verified).
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
- [x] 1.3 Slider→component mapping: for each protective diet slider (fiber,
      fruitVeg, nuts, fish; decide magnesium + coffee), define the mapping to
      score components with ρ-annotated overlaps (fiber↔fruitVeg
      double-counting risk is explicit); record in PLAN.md, prepare for
      js/factors.js.
      DONE 2026-08-01: mapping table recorded in PLAN.md §1.3 (fiber → legume
      + whole-grain fiber, fruitVeg → fruit+veg score, nuts → nuts score,
      fish → fish score with valueOf fraction, magnesium marginal ρ≈0.3 with
      veg score, coffee kept as clean marginal ρ≈0). Diet cluster went live
      under 3.1; this step's substance was absorbed there.
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

- [x] 2.6 REVIEW-response: refactor the triplicated mortality/cancer/cvd
      block inside `evaluateRaw` (engine.js ~line 619, three near-identical
      ~60-line passes) into a shared closure keyed by output. No behavior
      change — Phase 3.3/3.4/3.5 will touch this code, and the user review
      flagged it as the top expandability blocker. Tests green.
      DONE 2026-08-01: single `totals` map (HR_OUTPUTS -> {hr, sigma2}) —
      accumulation loop, covariance loop, joint-model totals loop and the
      final bounds all keyed by output; BMI derived effect routes through
      totals.mortality/totals.cvd; withBounds() helper replaces the three
      duplicated sigma blocks. Return shape unchanged (hr/hrCancer/hrCvd
      fields identical). Suite green byte-identical (25 sections).
- [x] 2.7 REVIEW-response: remove app.js dead code found in review pass
      (unused constants EZCATI/DEATH_HR/DEATH_LE/SIM_M, evalParams,
      EKELUND_SOURCE + its aeneas 0x04 code, `noData` if unreferenced,
      canRun-fetch if unused). Verify each symbol is truly unused first
      (grep app.js + index.html). Tests unaffected (no engine change).
      DONE 2026-08-01: grep audit — EZCATI, DEATH_HR, DEATH_LE, SIM_M,
      evalParams, EKELUND_SOURCE, aeneas 0x04, canRun all have ZERO
      matches in app.js/index.html/sources.js (already removed in earlier
      refactors; nothing to delete). The only remnant was the two
      commented-out `noData` coverage-text assignments in updateCancer/
      updateCvd. RESTORED instead of removed: AGENTS.md documents the
      feature ("all others are listed on the card as 'no data yet'"),
      the engine tests assert it ("coverage note lists no-data inputs",
      tests/engine.test.js:362/421), and the `<p class="coverage-note">`
      slots exist in the DOM template — the comment-out was a refactor
      accident, so the card now lists non-covered inputs again. No engine
      change; suite green.

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
- [x] 3.2 Movement cluster live: Ekelund table + Momma/NHIS cells (verified
      subset); supersession (VO2max replaces cardio → moves PA level) still
      works; probe vs cells. DONE 2026-08-01 (all sub-steps shipped;
      conflation checks green: no double-count identities on all outputs,
      aerobic priced once per output post-3.2f, anchoring exact at
      defaults).
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
      - [x] 3.2b Ekelund table wired: members [cardio, steps, sitting],
        PA axis (cardio+steps read-only), sitting axis, interpolate true,
        evidence high, source ekelund2016 (NEW source entry), calibrate:
        true, note disclosing the re-anchor; mortality only (cancer/CVD fall
        back to members' marginals); tests.
        DONE 2026-07-31: factors.js v0.1.6 — ekelundTable joint model
        (PA coeffs [4, 0.21], bands Q1 ≤150/Q2 ≤960/Q3 ≤1800/Q4 ≤2130
        flat-clamped; sitting bands <4/4–6/≥6 — published 6–8 row folded
        into interpolation, >8 open-ended clamps flat after a fake 99 h/d
        cutoff was caught distorting ratios ~5–12% at 13–20 h/d);
        ekelund2016 source entry (idx 85, after mente2023 — chips "Diet
        score"/"Movement score"); note discloses re-anchor + interpolation +
        ref-CI approximation + diet non-adjustment + cancer/CVD fallback.
        ENGINE BUG FIXED: gridTotal computed bands[i-1] unconditionally →
        crash when an axis value lands in band 0 (sitting 0–4 h); has0/has1
        now guard the index; regression-tested in §[23].
        TEST RESTRUCTURE: §[2]–§[15] (all pre-cluster single-factor tests)
        rerouted to plainModel (sed, lines 78–430) — they were passing only
        because the diet cluster cancels in the evaluate() normalization
        when diet stays at defaults; the Ekelund table legitimately changes
        cardio/steps/sitting absolute readings; §[17] ships-2-clusters
        assertions + anchored-defaults check (0.5896); §[21] citation
        assertions updated (ekelund2016 last, mente2023 one before).
        NEW §[23] "Shipped Ekelund table": cell ratios 1.59/1.04 and
        1.27/1.59 preserved (shape survives the anchor), sitting 0
        regression, no-double-count identity with both clusters +
        magnesium blend (mg default is 280, NOT 250 — pair active at
        defaults), cancer/CVD fallbacks. Smoke: active 0.82× (+2.0 y),
        sedentary 1.28× (−2.5 y), low-PA+low-sit 1.03× (table attenuates
        the marginals' overclaim — naive product 1.86×). Suite all green.
        PLAN.md §3.2 Ekelund bullet extended with the shipped note.
        VO2max supersession still pending (3.2d).
      - [x] 3.2c Momma cells wired: members [strength], axes aerobic
        (cardio read-only, ≥150 min/wk) × strength (any ≥1); grids
        mortality [[1.0, 0.85],[0.80, 0.60]], cancer [[1.0, 0.88],[0.80,
        0.72]], cvd [[1.0, 0.83],[0.79, 0.54]]; aerobic-only cells from the
        existing Arem 2015 bands (disclose); NO calibrate (8% off, within
        band; keeps the published 0.60); §[23] tests.
        DONE 2026-08-01: factors.js v0.1.7 — mommaCells joint model
        (3 outputs: mortality/cancer/cvd, each a 2×2 grid; aerobic axis
        {≤149 none, ≤9999 AER} reads cardio read-only, ms axis {≤0 none,
        ≤99 MS} reads strength; grids [[1.0, 0.85 (0.79–0.93)],[0.80
        (0.78–0.82), 0.60 (0.54–0.67)]] / [[1.0, 0.88 (0.80–0.97)],[0.80,
        0.72 (0.53–0.98)]] / [[1.0, 0.83 (0.73–0.93)],[0.79 (0.76–0.82),
        0.54 (0.41–0.70)]] — aerobic-only cells approximated from Arem 2015
        ≥150 bands because Momma's aerobic-only contrast is graphical only
        (disclosed in the note); momma2022 source entry (BJSM 56(13):755–63,
        DOI 10.1136/bjsports-2021-105061, PMID 35228201, PMCID PMC9209691).
        NO calibrate — default cell 0.85 vs members' 0.92 product ≈ 8% off,
        within the band, keeps the published synergy (0.60 < 0.85×0.80 ≈
        0.68). Smoke: defaults (none,MS) 0.85/0.88/0.83; strength 0 →
        1.0/1.0/1.0; cardio 300 no strength → 0.80/0.80/0.79; cardio 300 +
        strength 2 → 0.60/0.72/0.54; hrAvg still exactly 1.0 at defaults.
        SUITE FIXED (was 10 red): §[17] → 3 clusters + momma defaults
        assertion; §[21] no-double-count identity extends to all 8 members
        (allMems incl. strength) × 3 cluster totals + magnesium blend;
        redundancy endpoint = pRaw / mprodAll × diet × ekelund × momma;
        cancer identity replaces the old "identical to plain" (diet members'
        cancer marginals cancel, momma replaces strength's 0.87); citation
        assertions corrected — momma2022 is at index 4, NOT last (strength
        input marginals cite it first in the walk; only ekelund2016 last +
        mente2023 one before hold); §[23] ratio tests pin strength: 0 so
        only the Ekelund shape moves — raw ratio is now Ekelund 1.59/1.04
        × momma aerobic 1.0/0.80 = 1.9111, clusterTotals keeps the pure
        1.59/1.04; no-double-count identity now 3 clusters; cancer/cvd
        fallback assertions → momma replaces strength's marginals
        (0.87/0.9), cardio/steps/sitting still fall back. Suite all green.
        PLAN.md §3.2 Momma bullet extended with the shipped note.
      - [x] 3.2d Duncan cells + supersession: sleep becomes a cells model
        (members [sleep], PA axis consumes movement state via an axis fn);
        VO2max supersession (PLAN option A: gatedBy-aware axisValue —
        superseded/gated axis inputs contribute 0, so vo2maxOn → cardio
        contributes 0, steps stay, Kodama marginal carries fitness; option B
        vo2max→MET-h/w rejected as unfalsifiable); rhr/sun pair decisions
        applied; §[23]/§[24] tests. DONE 2026-08-01 (factors.js v0.1.8,
        engine.js unchanged v0.1.8): SHIPPED — duncanCells joint model
        (members [sleep], model 'table', evidence 'low', source duncan2023
        NEW JSHS 12(1):65–72 DOI 10.1016/j.jshs.2022.07.003 PMID 35872092
        PMC9923431, appended last in sources); PA-category axis is a data
        fn (v.vo2maxOn ? 0 : r(cardio)) ≥150 → AER, r(strength) ≥2 → MSA,
        both → Active, returning the band index 0–3 (thresholds live in
        factors.js, golden rule); sleep axis bands ≤6.9 Short / ≤9.4 Rec /
        ≤11 Long, NO interpolation (study's sleep groups are discrete
        categories; interpolation broke the defaults ratio 1.0); grid rows
        in BAND order (Inactive, MSA only, AER only, Active — NOT the
        paper's display order), cols (Short, Rec, Long):
        [[1.59,1.68,2.20],[1.43,1.56,2.32],[1.28,1.21,1.54],[1.08,1.00,1.40]]
        with published CIs; ratio {axis:1, referent:1} — total =
        cell(PA,sleep)/cell(PA,Rec): the PA-row main effect is divided away
        (Ekelund/Momma own PA), the sleep effect is the study's novel
        finding (short-sleep risk ~eliminated in Active 1.08 NS; long-sleep
        risk persists everywhere 1.40–2.32); defaults ratio exactly 1.0 →
        NO calibrate needed; CI = quadrature of numerator/denominator
        sigmas (referent cell 1.00 has no published CI — slight
        understatement, disclosed). OVERLAP PAIRS (factors.js): duncanCells
        ↔ dietScore ρ0.10/ρU0.05 tier low (Duncan doesn't adjust for diet —
        residual confounding; sleep marginal RETIRED into duncanCells so
        the pair blends the cluster total); rhr ↔ ekelundTable ρ0.15/ρU0.075
        (replaces retired rhr↔cardio 0.20 — discounted because the cluster
        total carries steps+sitting, diluting the shared pathway);
        sunExposure ↔ ekelundTable ρ0.10/ρU0.05 (absorbs retired sun↔steps;
        steps ≈40% of the default PA axis). Engine extends axisValue to fn
        axes + gated/superseded-aware sums, gridTotal threads values/model/
        output, NEW ratioTotal, clusterTotalFor 5-arg — applied in
        computeJmTotals/evaluateRaw/clusterTotals. ENG BUG FIXED
        (boundsEndpoints): lone cluster side of a pair was re-multiplied
        when the input side was gated off (rhr pair latent) — now `if
        (c.cluster) continue` (cluster already counted by its own group).
        SUITE: 9 red expected → fixed — §[17] 4 clusters + duncan defaults
        1.0; §[18] shipped pairs 6 (3 vs dietScore incl. duncanCells +
        rhr/sun vs ekelundTable); §[21] identity + sun blend (sun 0.9 →
        0.9^0.9 at defaults — sun's default HR is 0.9, a real active
        effect, so it re-blends like magnesium) + duncan total + redundancy
        + citations (duncan2023 last, ekelund2016 second-last); §[23] raw
        ratio unchanged 1.9111 — Duncan ratio is 1.0 at Rec sleep in every
        PA row BY CONSTRUCTION (referent column), the Duncan factor belongs
        in §[24]; new §[24]: ratio = 1.0 at 7 h in every PA category;
        sleep 5 → 1.59/1.68 = 0.9464 (Inactive) and 1.08/1.00 = 1.08
        (Active); sleep 10 → 2.20/1.68 = 1.3095 and 1.40/1.00 = 1.40
        (Active); CI brackets; vo2maxOn retires cardio from the Ekelund PA
        axis AND the Duncan fn (totals == cardio 0) while steps still drive
        the axis; rhr pair gated off by default, active + blended 1.3266^0.85
        (weaker side) when rhrOn. Suite all green. axisValues are internal
        to gridTotal (clusterTotals strips them — assertions use HR
        equality instead). PLAN.md §3.2 Duncan + ratio + rhr/sun pair
        shipped notes appended.
      - [x] 3.2e probe vs cells + calibration checks (movement probe within
        band; anchoring exact at defaults; suite green); mark 3.2 [x] DONE.
        DONE 2026-08-01: probe recorded in PLAN.md §3.2 (defaults 0.5012
        = 0.5896×0.85×1.0 — the earlier 0.543 used the strength MARGINAL
        0.92 and predates the no-calibrate Momma decision; ~9% below the
        0.55–0.6 aspirational band, fully explained by the Momma gap;
        moderate profile 0.2899 vs naive 0.3402 — Momma's published
        synergy cell drives it). Anchoring exact at defaults (hrAvg 1.0,
        LE delta 0); suite green. **SURFACED 3.2f**: the moderate probe
        exposed an aerobic-PA double-count — Ekelund's PA axis (cardio+
        steps) AND Momma's aerobic row (cardio read-only, Arem ≥150 cell)
        both price aerobic PA: cardio 0→300 moves Ekelund ×0.824 AND Momma
        ×0.706 (combined ×0.582 for aerobic alone vs Arem's 0.63). The
        "read-only axis" note only prevents the cardio MARGINAL double
        count; the two tables' shared aerobic signal is unpriced. DECISION
        RECORDED in PLAN.md: fix via ratio-mode on Momma's aerobic axis
        (Duncan precedent) — total = cell(aerobic, strength)/cell(aerobic,
        none) divides the aerobic main effect away (owned by Ekelund's PA
        axis on mortality, by cardio's marginal fallback on cancer/cvd);
        the strength×aerobic interaction survives (0.60/0.80 = 0.75 < 0.85
        synergy intact); defaults (none row) identical to shipped
        (0.85/0.88/0.83) → no anchoring/test churn on defaults.
      - [x] 3.2f FIX the aerobic double-count: mommaCells gains
        ratio {axis: 1 (strength), referent: 0 (none)} on all three
        outputs (mortality/cancer/cvd grids; aerobic-only cells become
        denominators); update the Momma notes (§1.6 engine-use + factors.js
        note) to the ratio-mode disclosure; §[23] raw ratio expectation
        changes (Momma's aerobic factor 1.0/0.80 vanishes — the ratio at
        strength 0 is 1.0 on both rows → raw ratio = Ekelund 1.59/1.04 =
        1.5288); §[23] cancer/cvd identities recompute from the new cells
        (0.72→0.72/0.80=0.90, 0.54→0.54/0.79≈0.6835 — assertions read the
        totals, only comments/expectations update); smoke records updated
        (cardio 300 + strength 2 → 0.75/0.90/0.6835); verify: aerobic
        priced once per output (cardio 0→300 delta ≈ Arem alone), defaults
        totals unchanged (0.85/0.88/0.83), suite green; mark 3.2 [x] DONE.
        DONE 2026-08-01 (factors.js v0.1.9, engine unchanged): ratio
        {axis:1, referent:0} on all three mommaCells outputs. Verified:
        defaults (none,MS) 0.85/0.88/0.83 EXACTLY unchanged (denominator
        = the 1.00 ref); cardio 300 + strength 2 → 0.75/0.90/0.6835
        (0.60/0.80, 0.72/0.80, 0.54/0.79 — the published synergy survives
        as the interaction: 0.75 < MS-only 0.85); aerobic-only (strength 0)
        → 1.0/1.0/1.0 (aerobic main effect gone from Momma); aerobic
        priced once: cardio 0→300 with strength 0 moves ONLY the Ekelund
        total (combined delta = Ekelund's gradient 0.8244, vs 0.582 with
        the double count). Suite: §[23] raw ratio updated (now pure
        Ekelund 1.5288 with both Momma and Duncan ratios at 1.0 in that
        profile); new §[25] locks in: defaults unchanged, interaction
        cells, aerobic-only ratio 1.0, once-priced aerobic identity. All
        green. PLAN.md §3.2 probe bullet rewritten with shipped values +
        3.2f finding & decision; Momma bullet amended; §1.6 engine-use
        note amended.
- [x] 3.3 Adiposity live: Mayo joint cells or %-mediated band; supersession
      (bodyFat replaces BMI) keys in.
      SUB-STEPS (created 2026-08-01; design ready in PLAN.md §1.8/§1.9):
      - [x] 3.3-plan: record §3.3 implementation notes in PLAN.md — PA-axis
        mapping decision (Mayo's UKB self-reported quintiles G1/G2/G3 are
        NOT on Ekelund's harmonized scale — map rank-preserving onto
        Ekelund's quartile cutoffs: G3 ≤150, G2 ≤1800, G1 >1800 MET-min/wk,
        disclosed as rank- not value-preserving); ratio-mode decision
        ({axis: 1, referent: 0} on a rows=PA × cols=adiposity grid: total =
        cell(PA, adj)/cell(PA, normal) — PA main effect divided away
        because Ekelund owns it, exactly the Duncan pattern; the published
        PA×adiposity interaction survives); the UK-Biobank overweight-
        paradox artifact disclosure (normal-weight-low-PA cell 1.22 is
        elevated by reverse causality/smoking; supp Table 4 never-smoker
        restriction → NS; the ratio can read <1 for overweight at low PA —
        disclose as a source artifact, NOT a protective claim);
        `calibrate: true` (defaults: ratio total 0.9533 vs members' product
        1.20 = bmi marginal at BMI 29.76, ~26% off — beyond Momma's 8%
        tolerance band, so Ekelund's anchor rule applies; the constant
        log-space shift preserves the cells' interaction; cancels in the
        page's evaluate() normalization anyway, matters for clusterTotals/
        bounds/attribution displays); underweight clamp decision (BMI <18.5
        maps into the 18.5–24.9 row — the Mayo table has no underweight
        category, so Di Angelantonio's left arm is lost: DISCLOSE in the
        note + a finding, never invent a left arm); supersession keys
        (vo2maxOn retires cardio from the Mayo PA axis automatically via
        the engine's supersededBy check — steps still drive it, exactly the
        Ekelund treatment; bodyFatOn switches the adiposity axis fn to the
        BF rows); no new overlap pairs needed (Mayo is diet-adjusted →
        ρ(mayoCells, dietScore) ≈ 0 per §1.8(4); the ratio already removes
        the PA share of the Ekelund overlap); BF % band cutoffs gap (the
        paper's BF groups are sex-specific distribution-matched quartiles —
        exact % cutoffs needed from the supp tables, else sex-averaged
        disclosure); CVD grid layout anomaly in §1.8 (normal-BMI × G2 =
        0.89 < REF 1.00 — verify columns/rows at source) + cancer grid
        incomplete (only ≥35 row recorded) → both gated on 3.3a.
        DONE 2026-08-01: `**§3.3 implementation notes — adiposity cluster
        (planned 2026-08-01; cells verified in §1.8, model decision in
        §1.9; implementation in 3.3a–d).**` written into PLAN.md after the
        §3.2 notes (was line 659, before the "Phase 3 — ρs live" heading) —
        full decision record: PA-axis rank-preserving mapping (Ekelund
        quartile cutoffs, disclosed), ratio mode (Duncan/3.2f precedent;
        defaults ratio = 1.02/1.07 = 0.9533), calibrate:true (k =
        ln 1.20 − ln 0.9533 ≈ +0.23, ~26% gap > Momma's 8% band),
        overweight-paradox artifact disclosure (never "protect"),
        underweight clamp + left-arm disclosure (diangelantonio2016 stays
        cited via the sourceIndex input-effects walk — no dead key),
        supersession keys (no engine change needed), no-new-pairs (diet-
        adjusted; ratio removes the Ekelund PA share), bands
        (G3/G2/G1 rows, normal-first cols, interpolate:false — both axes
        discrete study categories), all-cause grid transcribed
        [[1.22,1.12,1.38,1.52],[1.07,1.02,1.09,1.43],[1.00,1.00,1.15,1.45]],
        retirement + noData shrink, 3.3a gates (CVD 0.89 anomaly, cancer
        grid, BF % cutoffs), Weeldreyer finding role. NOTE: the earlier
        todo draft's "calibrate: true REQUIRED" wording is now precise —
        the anchor is on the RATIO total vs the bmi marginal, not vs a
        raw cell.
      - [x] 3.3a: verify Mayo supp Tables 3/9/10 at source (open access CC
        BY, PMID 33309181): full 4×3 cancer grid, CVD grid layout (0.89
        anomaly — confirm G1/G2/G3 column order + referent), BF % band
        cutoffs (sex-specific low/med-low/med-high/high), underweight
        handling; record exact cells in PLAN.md §1.8 addendum; add source
        key sanchezlastra2021.
        DONE 2026-08-01 — every cell verified at source. Download route:
        ScienceDirect article page is bot-gated (tdm-reservation meta,
        NOARCHIVE, no article text in HTML; PII S0025619620307564);
        mayoclinicproceedings.org fulltext + PDF → 403; researchgate → 403;
        not in PMC; unpaywall: no OA location. WIN: Elsevier supplementary
        files download directly — `https://ars.els-cdn.com/content/image/
        1-s2.0-S0025619620307564-mmc1.docx` (mmc2/mmc3 → 404) → extracted
        to /tmp/opencode/mayo_docx/word/document.xml (10 w:tbl).
        Table→token mapping confirmed via captions (token 25 = Table 3,
        47 = Table 6, 73 = Table 9, 90 = Table 10; list-of-tables at
        tokens 2–11). Findings:
        + Table 3 all-cause Model 3 EXACTLY matches §1.8 (all 3 sections:
          BMI/WC/BF; e.g. 18.5–24.9 G2 1.07 (0.96–1.18), ≥35 G1 1.45
          (1.21–1.73); BF high G3 1.54 (1.33–1.79) = the abstract's 1.54).
        + Table 9 CVD Model 3: 0.89 ANOMALY CONFIRMED REAL — 18.5–24.9 row
          G1 1.00 REF / G2 0.89 (0.68–1.15) / G3 1.31 (0.97–1.78); column
          order G1/G2/G3 + referent verified; sparse deaths (128/100/61 in
          that row); ≥35 row 1.37 / 1.99 (1.44–2.76) / 1.55 (G2 > G1 > G3
          — non-monotone; transcribe as-is). Full grid in §1.8 addendum.
        + Table 10 cancer Model 3: full 4×3 grid extracted (18.5–24.9
          1.00/1.10 (0.97–1.24)/1.12 (0.94–1.32); ≥35 1.57 (1.25–1.97)/
          1.30/1.48) — completes §1.8's partial record. WC/BF rows too.
        + Table 2 PA quintile medians verified (Q1 339–490 / Q2 924–1268
          / Q3 1644–2226 / Q4 2799–3734 / Q5 5466–7284) → G1/G2/G3 medians
          in §1.8 confirmed.
        + NEVER-SMOKER = supp Table 6, NOT Table 4 (§1.8 citation slip —
          fixed in PLAN.md). Table 6 (n=168,654, quintiles within BMI/WC/
          BF strata, Model 3): ALL NS (0.75–1.11) — attenuation confirmed.
        + MAIN TEXT (ScienceDirect search snippet + UK Biobank page):
          BMI <18.5 EXCLUDED at baseline (illness-related weight loss,
          n=35,094 bucket with chronic conditions + pregnant); follow-up
          lagged 2 y (n=1,204); prevalent cancer/CVD excluded (63,193);
          missing covariates excluded (14,687); CVD/cancer tables are
          Fine-Gray COMPETING-RISK subdistribution HRs.
        + BF % CUTOFFS NOT PUBLISHED (main text nor supp): four BF groups
          are sex-specific distribution-matched quartiles to the BMI
          category distribution. → 3.3b must use DISCLOSED translated
          cutoffs (e.g. via a published age/sex BF%-BMI equation), never
          invented study numbers; note says "our translation, not the
          paper's".
        PLAN.md: §1.8 "Verification addendum 2026-08-01 (3.3a)" with full
        CVD/cancer grids + methods facts + Table-6 correction; §3.3 notes
        updated (Table 6 fix, underweight EXCLUDED not absent, gated→
        verified bullet). Source key sanchezlastra2021 added in 3.3b.
      - [x] 3.3b: factors.js: `mayoCells` joint model (members [bmi,
        bodyFat], cluster 'adiposity', rows = PA G-bands via regular axis
        {inputs: [cardio, steps], coeffs [4, 0.21], bands G3 ≤150 / G2
        ≤1800 / G1 >1800}, cols = adiposity via axis fn (v.bodyFatOn ?
        r('bodyFat') BF band : r('bmi') BMI band), ratio {axis: 1,
        referent: 0}, calibrate: true, evidence high, mortality+cvd+cancer
        grids from the verified tables); bmi/bodyFat marginals retire on
        covered outputs (cluster-owned; bmi/bodyFat gain cancer data, bodyFat
        gains CVD data — noData lists shrink); the fitness-absorbs-fatness
        finding (weeldreyer2025 source key, §1.9 decision (a)) + underweight
        finding; notes with all disclosures. BF band fn: bodyFatOn must map
        bodyFat% → 4 BF bands via DISCLOSED translated cutoffs (paper
        publishes none — sex-specific distribution-matched quartiles; use a
        published age/sex BF%-BMI equation, e.g. Deurenberg 1991, and say in
        the note "our translation, not the paper's").
        DONE 2026-08-01 (factors.js v0.1.10, engine.js v0.1.10): mayoCells
        shipped as designed — members [bmi, bodyFat], cluster 'adiposity',
        PA-axis regular {inputs:[cardio,steps], coeffs [4,0.21], bands G3
        ≤150/G2 ≤1800/G1 >1800}, adiposity-axis fn (bodyFatOn ? BF bands
        (Deurenberg 1991 translation, disclosed "our translation, not the
        paper's") : BMI bands incl. underweight→normal-row clamp), ratio
        {axis:1, referent:0}, calibrate:true, evidence high, source
        sanchezlastra2021 (verified cells, 3 outputs), interpolate:false;
        weeldreyer2025 + underweight findings; note carries the
        overweight-paradox + rank-preserving-PA disclosures. RETIREMENT +
        COVERAGE: bmi/bodyFat marginals retire on all three outputs;
        bodyFat gains CVD + cancer coverage and bmi gains cancer coverage
        via the cluster → noData lists shrink (engine `clusterCovered()`
        in evaluate() now credits joint-model-covered inputs per output).
        TWO BUGS FOUND + FIXED in the shakedown (see 3.3e below): Mayo
        axes transposition + boundsEndpoints dead-JM-group. app.js bmi
        readout third branch: "counted together with activity via the
        PA×adiposity cluster (sanchezlastra2021)" when mayoCells covers
        mortality.
      - [x] 3.3c: tests — NEW §[26] "Shipped Mayo cells": defaults anchored
        (raw cluster total == members' product 1.20 at 1e-9 via calibrate),
        normal-BMI ratio exactly 1.0 at any PA, ratio values at G1×≥35 /
        G3×≥35 (1.45 / 1.246 after the same shift), bodyFatOn switches to
        BF rows (cluster total changes), vo2maxOn retires cardio (steps-
        only PA), cancer/cvd coverage present, no-double-count identity
        extends to all members incl. bmi+bodyFat × 5 cluster totals; §[17]
        → 5 clusters at defaults; §[21] member list + redundancy endpoint +
        citation assertions (sanchezlastra2021 last, duncan2023 second-
        last); smoke records (lean-active ≈ 1.0, obese-inactive elevated,
        paradox note); suite green.
        DONE 2026-08-01: Mayo assertions landed in the EXISTING §[25]
        ("Shipped Mayo PA×adiposity cluster") rather than a new §[26] —
        suite still ends at §[25], 1009 ok all green. Coverage: defaults
        anchored (raw total == 1.20 at 1e-9), ratio values at G1×≥35 /
        G3×≥35 after the shift, bodyFatOn → BF rows (record tagged
        viaJoint mayoCells), vo2maxOn retires cardio (steps-only PA),
        cancer/cvd coverage + noData credit, no-double-count identity
        incl. bmi+bodyFat × 5 cluster totals, redundancy endpoint, screen
        time still listed as cancer no-data. §[17]: 5 clusters (diet/
        ekelund/momma/duncan/mayo) + mayoCells defaults 1.20/1.25/1.00.
        §[20]: bmi allowed as a DERIVED member (not a real input id).
        §[23]: formulas retire the bmi marginal (÷) and multiply in the
        mayo total (mortality/cancer/cvd identities); raw-ratio test now
        = Ekelund shape × mayoCells PA-axis ratio; redundancy endpoint =
        pRaw.hr / mprodAll / bmiMarg × diet × ek × mm × dn × mayo.
        screenTime label assertion fixed ("Recreational screen time").
      - [x] 3.3d: probe + calibration checks (Mayo default == bmi marginal;
        anchoring exact at defaults; no double count: cardio 0→300 moves
        Ekelund + Mayo PA axis — verify the ratio removes the PA share);
        PLAN.md §3.3 shipped note; mark 3.3 [x] DONE.
        DONE 2026-08-01: probe re-run + recorded in PLAN.md §3.3 shipped
        addendum — defaults mayoCells mort/cvd/cancer 1.200000/1.250000/
        1.000000 (= the retired bmi marginals on mort/cvd; cancer anchors
        to identity, no bmi cancer marginal existed); calibrate offset
        constant 1.25882 (= k: 1.25882×1.02/1.07 = 1.20); surface:
        G3×overweight 1.1556, G2×overweight 1.20, G1×overweight 1.2588,
        G2×obese-I 1.25882×(1.09/1.07), G1×obese-I 1.25882×1.15 = 1.4476,
        G2×obese-II 1.25882×(1.43/1.07) = 1.6824, G1×≥35 1.25882×1.45 =
        1.8253 (no crash), underweight→normal col, BF 40% male
        1.25882×(1.36/1.05) = 1.6305; anchoring exact
        (hrAvg 1.0, LE delta 0); PA priced once per output — the ratio
        divides the PA-row main effect (Mayo contributes interaction +
        adiposity main effect only; Ekelund owns the PA gradient on
        mortality; band crossings move the ratio as designed). PLAN.md
        §3.3 "Shipped 2026-08-01" addendum appended. Marked 3.3 DONE.
      - [x] 3.3e ENGINE FIXES (surfaced during the 3.3b shakedown, both
        pre-shipped): (1) mayoCells axes transposition — grids stored rows
        = PA × cols = adiposity but axes initially declared [adip, pa], so
        indexGrid walked the transposed grid: wrong cells AND a crash at
        BMI ≥35 (row index 3 exceeded the 3-row grid) → axes swapped to
        [pa, adip] on all three outputs (ratio {axis: 1, referent: 0}
        semantics unchanged — divide by the normal-adiposity column);
        (2) boundsEndpoints dead-JM-group — mayoCells at defaults has
        zero ACTIVE candidates (bmi derived, bodyFat gated off) so
        `candidates.length === 0 → continue` skipped the group and the
        cluster total never entered the redundancy endpoint (defaults red
        was 0.2985, ÷1.20 short of the §[23] formula) → dead groups now
        contribute their cluster total (same pre-seeding as evaluateRaw's
        jmAcc); defaults red endpoint = 0.3582 = pRaw/mprodAll/bmiMarg×
        diet×ek×mm×dn×mayo. Both covered by §[23]/§[25] assertions.
        DONE 2026-08-01.
- [x] 3.4 Substances: ρ pairs applied where 1.12 failed verification;
      multiplication elsewhere.
      SUB-STEPS (created 2026-08-01; §1.12 verification complete):
      - [x] 3.4-plan: record §3.4 implementation notes in PLAN.md — two ρ
        pairs only (snus↔alcohol 0.15/ρU0.10 tier moderate — byhamre2021
        adjusts for age+BMI only; vaping↔alcohol 0.10/ρU0.05 tier low —
        PATH collects no alcohol data, numerically moot while vaping CVD is
        a null); NO ρ(smoking, alcohol) — both sources mutually adjust
        (Wood 2018 adjusts smoking, Jha 2013 adjusts alcohol); snus CI
        CORRECTION (factors.js snus CVD byOption 1.20–1.35 → published
        1.15–1.41); multiplication elsewhere (no new pairs).
        DONE 2026-08-01: §3.4 implementation notes written into PLAN.md
        after the §3.3 shipped addendum (full decision record incl. the
        silent-at-defaults property: snus 'no' / vaping 'never' / alcohol
        2.5 all → HR 1.0, so both pairs are inactive at defaults — no
        anchoring churn; the vaping blend is a no-op on a 1.0 HR —
        "kept for structure, activates if a future vaping HR turns
        non-null"). VERIFIED: the snus CVD CI correction is ALREADY in
        the working tree (factors.js ~line 912: 1.27 (1.15–1.41) —
        applied during the v0.1.9 verification pass) — 3.4a needs only a
        pinning test assertion, no data edit.
      - [x] 3.4a: factors.js — add the two overlaps (snus↔alcohol,
        vaping↔alcohol, notes citing §1.12), fix the snus CVD CI;
        nothing else changes (substance marginals stay independent).
        DONE 2026-08-01 (factors.js v0.1.10): both overlaps appended to
        the array (snus↔alcohol ρ0.15/ρU0.10 kind residual-confounding
        tier moderate source byhamre2021; vaping↔alcohol ρ0.10/ρU0.05
        kind unmeasured-confounding tier low source berlowitz2022 — the
        no-op-while-null structure is documented in the note); the snus
        CVD CI was ALREADY corrected in the working tree (no data edit
        needed — §1.12 correction landed during the v0.1.9 pass).
        Source walk unchanged: byhamre2021/berlowitz2022 already cited
        by the snus/vaping input effects → no citation index shift.
      - [x] 3.4b: tests — §[18] shipped-pairs count 6 → 8 (or new §[26]);
        blend checks: snus at 0 boxes (HR 1.0, inactive) vs user value +
        alcohol drinker → weaker side ×(1−ρ); vaping blend; CI correction
        assertion; suite green.
        DONE 2026-08-01: §[18] shipped count 6 → 8 + pair-shape pins
        (rho/rhoU) + NEW 3.4 block: substance pairs inactive at defaults
        (activeOverlaps filter .active — the raw list carries all pairs,
        only some flagged active); snus↔alcohol blend via plainModel
        fixture with the base raw product divided out (plainModel keeps
        all single-factor marginals at their default values — raw HR ≠
        1.0 at defaults); alcohol 20 → 1.16 discounted ^0.85 × snus 1.28
        full; vaping↔alcohol no-op on mortality (no vaping mortality
        effect) and CVD (1.00^0.9 = 1.00); snus CVD CI pinned to the
        published 1.27 (1.15–1.41). Suite: 1020 ok, all green.
      - [x] 3.4c: probe + calibration checks (substance deltas still
        sensible: smoking −10 y preserved, alcohol curve unchanged;
        anchoring exact at defaults); PLAN.md §3.4 shipped note; mark
        3.4 [x] DONE.
        DONE 2026-08-01: probe recorded in PLAN.md §3.4 shipped addendum
        — anchoring exact (hrAvg 1.0, LE delta 0); smoker 2.90×/−10.75 y
        (Jha preserved); alcohol 30 → 1.56×/−4.49 y (Wood unchanged);
        snus yes + alcohol 20 → 1.4521× = 1.28×1.16^0.85 (weaker side
        discounted — matches the §[18] synthetic math); smoker+snus+
        alcohol 20 → 4.21× clamped at ceiling 4.0 (expected);
        vaper+alcohol 20 → 1.16× mort / 1.12× CVD (pair no-op while
        vaping is a null — structurally inert, activates if a future HR
        turns non-null). Marked 3.4 DONE.
- [x] 3.5 Psychosocial per-lever-only flag live: no combined number;
      contributions shown individually with the conflation label ("cannot be
      separated from the other factors on this card").
      SUB-STEPS (created 2026-08-01; engine machinery already exists — §2.1
      per-Lever-only routing + §2.3 bounds exclusion, both EMPTY until now):
      - [x] 3.5-plan: record §3.5 implementation notes in PLAN.md — members
        {purpose, stress, social, sleepRegularity} (PLAN §1.14 line 1305/
        1456; sleep stays in duncanCells; sleepReg stays per-lever, sleep
        stays cluster-owned); per-lever-only → blocked from ALL HR products
        (mortality/cancer/cvd totals) but mind POINTS still accumulate
        (points outputs have no `acc` entry in the §2.2 accumulation loop);
        records tagged perLever: true; bounds endpoints exclude them
        (already, §2.3); chips + contrib list label them individually with
        the conflation label.
- [x] 3.5a: factors.js perLeverOnly = [{ cluster: 'psychosocial',
        members: ['purpose', 'stress', 'social', 'sleepRegularity'] }];
        annotation comments (PLAN §1.14; purpose↔stress↔social triangle has
        no joint data — pairwise ρ would double-discount, §1.14 bottom).
        engine.js needs no change — verify the per-lever points path.
- [x] 3.5b: tests — per-lever members excluded from the mortality/
        cancer/cvd totals (HR unchanged when they move), happiness/cognition
        points still accumulate, contribution records perLever: true, bounds
        endpoints exclude them, anchoring exact at defaults; no-double-count
        identity still holds. (plainModel now strips perLeverOnly so single-
        factor marginals still work; new §[19b] shipped cluster test; the
        §21/§23 identities use the new plainHrOut() helper that divides the
        per-lever members out of the plain reference — suite 1020→1029 ok.)
      - [x] 3.5c: app.js — render the conflation label on per-lever
        contributions ("per slider — not in the total" on HR cards +
        "psychosocial slider (points only)" on mind-output cards) + chip
        treatment (dashed chip-lever border + tag); sources.html "How it
        works" bullet explains the per-slider-only rule; css for
        .contrib-lever/.chip-lever. Suite green.
      - [x] 3.5d: probe + calibration checks (psychosocial levers shut off
        from the totals; happiness still moves +1.65/−0.75; cognition still
        moves via stress; anchoring exact at defaults; bounds endpoints
        exclude the members); PLAN.md §3.5 shipped/probe notes recorded;
        factors.js v0.1.11; suite 1029 green. 3.5 marked DONE below.
- [x] 3.6 Completion: Phase-0 regression test ("regular healthy person" not
      pinned at floor/cap) GREEN — attribution probe re-run: naive ratio
      pre-clamp 0.3401 (−66%), NO clamp pinning (pre-fix 0.064/−93.6% +
      floor-pinned 0.45), LE delta +3.5 y. PURE/Ekelund/Momma cluster
      endpoints verified green. Li 2018 anchor: ratio 0.112 vs
      pre-registered band [0.22,0.31], Sun 2022 [0.34,0.43] — recorded as
      honest FAIL per §1.13 rule (record + widen, never silently tuned;
      coefficients/mapping/bands frozen). Attribution: smoking 0.345, diet
      0.423, cardio 0.88, BMI ~flat 0.98 (Mayo disclosed) — residual sits
      in the "fair zone" cross-cluster ρ that §Weaknesses declares
      not-sourced. Recorded in PLAN.md §1.13 + §3.6; probe moved into
      `tests/anchor.probe.js`. 3.6 marked done WITH the deviation note.

## Phase 4 — presentation

- [x] 4.1 js/sources.js: render joint models (name, components, gradient, cells)
      + conflation table (pairs, ρ, classification, citation) generated from
      `jointModels`/`overlaps`.
- [x] 4.2 js/app.js + index.html: per-slider disclosures ("counted at X% —
      overlaps Y"); psychosocial card copy ("no reliable way to combine these
      yet — shown individually"); per-lever "what this lever does" section.
      SUB-STEPS:
      - [x] 4.2a app.js helpers: input-jm-backed `nameOf(id)` (input label
        or joint-model title) + disclosure builders — chip tags + contrib
        notes for: `overlapBlend` ("counted at X% — overlaps Y"), `viaJoint`
        ("counted via the … joint model"), and perLever (psychosocial).
        (No partialCredit chip needed — the diet-score chips already show
        the per-input delta; the joint "via" tag covers it.)
      - [x] 4.2b updateChips: emitted the tags (`.chip-tags` as `.confl-tag`
        spans); perLever tooltips + eyebrow now say "no reliable way to
        combine these yet — shown individually" / "(shown individually)".
      - [x] 4.2c updateContrib: same disclosure in the lever note; HR cards
        get "psychosocial — shown individually, not in the total" and
        points cards "psychosocial — points only".
      - [x] 4.2d index.html: static "What each lever does" note (per-lever
        framing, the "counted at … overlaps …" language, psychosocial
        no-combination rule); css `.lever-note` + `.confl-tag` added.
      - [x] 4.2e checks: `node --check` on app.js/sources.js/factors.js, full
        suite green, sources conflation render re-verified (5 blocks / 8
        rows via the shared DOM-stub script), app boot smoke-passed in a
        stub DOM. NOTE: joint-model titles now come from `jm.title`
        (presentation metadata added to each jointModel in factors.js) so
        sources.html and index chips share one source of truth.
      DONE 2026-08-02 (4.2 complete).
- [x] 4.3 Methodology copy (sources.html): fair/unfair boundary table
      verbatim; Ezzati 2003 independence qualifier; bounds labeled as
      assumption-space; ρ named as a model parameter.
      SUB-STEPS:
      - [x] 4.3a read the current sources.html methodology section in full.
      - [x] 4.3b fair/unfair boundary table verbatim (PLAN.md draft).
      - [x] 4.3c Ezzati 2003 independence qualifier + bounds=assumption-space.
      - [x] 4.3d ρ named as a model parameter (not a published number).
      - [x] 4.3e checks: `node --check` + suite green.
      DONE 2026-08-02: "How it works" rewritten around the joint-estimate
      first / multiplicative-fallback framing with the clamp; new subsection
      "Where multiplying risks is fair — and where it isn't" carrying the
      verbatim 4-row fair/unfair boundary table (`#fair-boundary`, styled
      with the existing `.jm-tbl.conflation`), the Ezzati 2003 qualifier
      paragraph (Lancet 362:271–80, DOI link; web-verified 2026-08-02:
      PMID 12892956, text reads "valid when the factors are weakly
      correlated and do not share pathways"), the ρ-as-model-parameter
      sentence, and range/band wording relabeled "assumption-space bounds".
      Old psychosocial bullet updated to "per lever — shown individually,
      not in the total" to match 4.2 language. No JS changed; `node --check`
      green, full suite green, sources_check.js still 5 jm blocks + 8
      overlap rows.
- [x] 4.4 Mind outputs: psychosocial blends nothing in points space; fuzz +
      badges unchanged; copy updated.
      DONE 2026-08-02: verified no overlap pair involves any psychosocial
      input (`members` check), so the points-space ρ blend (engine
      POINTS_OUTPUTS loop) can never fire on purpose/stress/social/
      sleepRegularity — psychosocial points accumulate individually and
      unblended. FIX: engine now sets `record.perLever = true` for PER-LEVER
      records regardless of output (previously only the HR branch at the
      old line 748 set it), so the psychological-points contributions in
      cognition/happiness carry the flag — the app.js "psychosocial — shown
      individually / points only" chip + contribution disclosures now
      actually render for mind outputs instead of silently never firing.
      COPY: index.html "What each lever does" now says psychological factors
      never multiply into mortality/cancer/CVD totals but still nudge their
      band individually (old "never summed into a total" overclaimed, since
      points DO accumulate into the/ bands); sources.html psychosocial bullet
      reconciled to the same nuance. Tests: [19b] extended with overlap-
      exclusion + points perLever/no-blend assertions. Suite green,
      `node --check` green, app boot smoke green.

## Phase 4.5 — UI disclosure of conflation (chips / More panels)

- [x] 4.5.1 Audit current main-page disclosure (probe 2026-08-03,
      `/tmp/opencode/ui_probe.js`). Findings: (a) per-slider chips and the
      More-panel contribution rows already render CONFLATION-ADJUSTED values
      (never raw study marginals): overlap-blended inputs show the ρ-discount
      value tagged "counted at X% — overlaps Y" (app.js:481), joint-model
      members show their attributed share tagged "counted via JointName"
      (app.js:482), psychosocial per-lever rows are tagged "shown
      individually, not in the total". (b) Member shares are consistent with
      the isolated marginal (cardio 300 alone = 0.787 = cardio inside the
      ekelundTable cluster). (c) GAP: when a joint model is live, the output
      total is the cluster's joint estimate, NOT the product of the member
      chips — probe: chips 0.787 × 0.883 × 0.909 = 0.632 naive vs cluster
      total 0.433; that redundancy is invisible on the main page. (d) The
      More panel has no header explaining values are already adjusted, and
      the output area never links to sources.html#conflation (anchor exists,
      sources.html:127; `activeJoint` already exports per-cluster totals and
      is tested at tests/engine.test.js:735).
- [ ] 4.5.2 Card-level cluster note (js/app.js): for each output card, when
      `engine.activeJoint(model, state)` returns a cluster covering that
      output, render inside the card's More panel (above the contrib list) a
      note of the form: "cardio + steps + sitting are counted as ONE joint
      estimate (Ekelund 2019): combined effect 0.433 (range 0.415–0.433).
      Each slider's chip is a share of this one estimate — they don't
      multiply." Data: activeJoint() per-output {hr, hrLow, hrHigh}, jmById
      for label/ref (app.js:42), member labels from the cluster definition.
      No engine change needed.
- [ ] 4.5.3 More-panel header note (js/app.js): one shared note (build once,
      reuse in all five contrib panels) — "The percentages below are already
      adjusted for overlaps: joint-model members are shares of one estimate,
      overlap pairs are counted at partial strength. Full breakdown:
      conflation on the methodology page." Link to sources.html#conflation.
      Also add a footer link to that anchor from the output grid whenever any
      overlap/cluster is active.
- [ ] 4.5.4 sources.html copy (js/sources.js): one sentence at the top of
      the conflation section tying it to the main page ("every chip and
      More-row on the main page gets its overlap discount / joint-model
      share from the tables below") — doubles as the intro of the new
      per-input table from 4.5.7. No new tables beyond 4.5.7; ids
      #conflation, #overlap-list, #fair-boundary already exist.
- [ ] 4.5.7 sources.html per-input transparency table — the "what we use,
      where, why" ask. New section under #conflation, generated from the
      model (drift-proof, like everything else): one row per input, columns:
      input; which outputs it feeds (mortality / cancer / cvd / cognition /
      happiness); HOW it is counted per output (marginal HR / share of
      <joint model> / overlap ρ with <pair> / per-lever only, not in total /
      no data yet / none); evidence tier; source [n]. Implement:
      (a) engine helper `engine.inputDisclosure(model)` (pure, node-
      testable, in engine.js): for each input nudge it off-default,
      evaluateRaw once, collect its records per output from
      contributions (viaJoint / overlapBlend / perLever / evidence /
      source) and mark outputs listed in result.noData as "no data yet";
      gate inputs (vo2maxOn / bodyFatOn) marked "replaces X when enabled";
      (b) rendering in sources.js reusing inputName / evBadge / citeKeys /
      refLink / jmTitle (sources.js:22-47); (c) tests: rows == model.inputs
      length, every row has a source, no-data outputs only appear where
      engine says so.
- [ ] 4.5.5 Tests (tests/engine.test.js): assert the note's premise — with a
      joint model active, the naive product of the member hrDeltas differs
      from the cluster total (redundancy exists and is carried by the
      cluster, not hidden in member shares). Suite: `node tests/engine.test.js`.
- [ ] 4.5.6 Verification: `node --check js/app.js` (+ js/sources.js),
      full suite green, serve and manually check four scenarios: (a) PA
      cluster active (cardio+steps+sitting) → cluster note + header note
      visible; (b) overlap pair active (magnesium + diet) → "counted at X%"
      tags on chip and row, header note visible; (c) all defaults → no
      conflation UI rendered anywhere; (d) sources.html per-input table
      renders every input with a where/how/why for each output.

## Phase 5.5 — Simple/Advanced model toggle (created 2026-08-04)

Feature: a toggle at the top of the calculator switching between the ADVANCED
model (current, conflation-corrected: joint models, overlap ρ blends,
per-lever-only psychosocial) and a SIMPLE model ("without any conflation
fixing, approx commit ee1c3a4"). The toggle swaps the model driving the
outputs AND gates the upcoming conflation-clarity UI (cluster notes,
subcategorised More panels, per-lever labels) so future presentation work
knows which mode it belongs to.

### Design decisions (from the planning pass — read before coding)

- **SIMPLE = same audited data, pre-conflation combination math. NOT a data
  rollback.** ee1c3a4's factors.js contains numbers the 0.9 sweep has since
  FIXED or nulled (fabricated citations like li2020, unsourced CVD columns,
  invented CIs). Restoring them would break the sources-first hard rule. The
  simple model uses today's corrected marginals multiplied naively — which is
  what the site did before the conflation fix. The toggle's caption says so.
- **The engine already implements both modes.** `js/engine.js` is a superset:
  with `jointModels: [], overlaps: [], perLeverOnly: []` every number is
  byte-identical to the old engine (engine.js:115–121 header; the suite's
  `plainModel` proves it, tests/engine.test.js:15). Do NOT restore the old
  engine.js file — its `evaluate()` return shape lacks `bounds` and other
  fields app.js now reads. Current engine + empty structures IS the simple
  model. **No engine math change needed.**
- **Mode = which model object is active.** factors.js exports the canonical
  `HEALTH_MODEL` plus a derived `SIMPLE_HEALTH_MODEL = { ...HEALTH_MODEL,
  jointModels: [], overlaps: [], perLeverOnly: [] }` (shallow spread only —
  nested inputs/sources are read-only; a distinct object identity is REQUIRED
  because `calibrateCache`/`_avgCache` are WeakMaps keyed by model object).
  `engine.evaluate(model, state)` does all the work; no mode flag is threaded
  through the engine.
- **The UI self-neutralises.** Every conflation disclosure in app.js
  (chipTags, overlapNote, jointNote, per-lever labels) renders from flags the
  engine sets on contribution records (`viaJoint`, `overlapBlend`, `perLever`)
  — those flags only appear when the structures are non-empty, so the simple
  model renders the flat pre-conflation look with ZERO branch code.
- **Citation numbering stays canonical.** Both pages compute
  `refs = engine.sourceIndex(HEALTH_MODEL)` (advanced) regardless of mode.
  The joint-model/overlap-only sources (mente2023, ekelund2016, duncan2023,
  sanchezlastra2021) sit at the END of the numbering (sourceIndex appends them
  after the baseline), so simple mode simply never links to them and nothing
  renumbers. sources.html keeps rendering the full advanced reference list.
- **Cluster-referencing findings get a `mode` field.** Two findings reference
  the Mayo adiposity cluster and mislead in simple mode: the vo2maxOn
  "fitness absorbs fatness" finding (weeldreyer2025, factors.js:2183) and the
  underweight/Mayo caveat (factors.js:2187). Add `mode: 'advanced'` to them;
  the engine's `evaluateFindings` passes the field through (one-line change at
  engine.js:1088) and app.js filters by active mode. Numbers/behavior stay in
  factors.js (golden rule).
- **sources.html stays advanced-only.** It is the methodology page for the
  conflation model. Simple mode's "Full method" link still lands there; the
  toggle's caption covers the mismatch.
- **Mode is session-only** (in-memory, no localStorage) — consistent with the
  site's nothing-is-stored ethos. Default mode = Advanced (the honest one).
- **Future-dev convention (record in AGENTS.md + file headers):** any UI that
  explains HOW inputs combine (cluster notes, subcategorised More panels,
  per-lever labels, bounds display) is an ADVANCED-mode feature; SIMPLE mode is
  the flat, naive-independence look. When adding UI, ask "does this describe
  conflation?" — if yes, gate it on advanced mode. This is the requirement
  "future development needs to know whether a change is advanced or simple".

### Steps

- [ ] 6.0 Record the design above in PLAN.md (new note after the Phase 4.5
      section, "§5.5 — Simple/Advanced mode toggle"). No code.
- [ ] 6.1 factors.js: add `SIMPLE_HEALTH_MODEL` + a comment block explaining
      the two-mode architecture (decisions above). Dual export: keep
      `module.exports = HEALTH_MODEL` (tests require it directly) and attach
      `module.exports.SIMPLE_HEALTH_MODEL = SIMPLE_HEALTH_MODEL`; browser:
      `globalThis.SIMPLE_HEALTH_MODEL = SIMPLE_HEALTH_MODEL`. Run tests —
      suite must stay green (advanced model untouched).
- [ ] 6.2 factors.js: add `mode: 'advanced'` to the two cluster-referencing
      findings (factors.js:2183 weeldreyer2025/vo2maxOn, factors.js:2187
      underweight/Mayo). All other findings stay mode-agnostic. Tests green.
- [ ] 6.3 index.html: add the toggle to the `.topbar` (or a new row under the
      tagline) — a labelled segmented control `Simple | Advanced` (use the
      same radiogroup pattern as `.segmented`, id="mode-toggle"), default
      Advanced, plus a one-line caption: "Simple multiplies each factor's
      effect as if independent — it overstates combinations. Advanced
      corrects overlapping effects using published joint studies." Place it
      ABOVE the calculator inputs so it reads as a site-level control.
- [ ] 6.4 css/style.css: `.mode-toggle` styles reusing the existing
      `.segmented`/`.switch` aesthetic (css/style.css:179–221); a clear
      "active mode" state so the current mode is obvious.
- [ ] 6.5 app.js: two-model refactor.
      (a) Keep `const model = HEALTH_MODEL` for one-time data-derived
      structures (GROUPS, inputLabels, jmById, renderInputs, updateGates) —
      inputs are identical in both modes.
      (b) Add `let activeModel = HEALTH_MODEL; let mode = 'advanced';` and a
      `recompute()` that runs `engine.evaluate(activeModel, state)` + the
      existing `update()`.
      (c) Wire the toggle: on change set `activeModel`/`mode` then
      `recompute()`. Do NOT reset `state` — slider values carry across modes.
      (d) `refs` stays `engine.sourceIndex(HEALTH_MODEL)` (canonical).
      (e) `updateFindings`: filter records with `mode === 'advanced'` when
      `mode === 'simple'` (needs the engine pass-through from 6.2).
      (f) `updateChips`/`updateContrib` need NO branch code — the missing
      flags render the flat look automatically; verify rather than add code.
      (g) engine.js: `evaluateFindings` map gains `mode: f.mode` (engine.js:
      1088). `node --check js/app.js js/engine.js`.
- [ ] 6.6 app.js copy: render the mode caption + a small mode badge near the
      outputs so a viewer in simple mode is reminded the numbers are naive
      (honesty rule). No new numbers — copy only.
- [ ] 6.7 tests (tests/engine.test.js): new §[27] "Simple vs advanced mode":
      (a) SIMPLE_HEALTH_MODEL at defaults → hrAvg exactly 1.0, LE delta 0
      (same invariant as advanced);
      (b) on a healthy profile the simple total == the naive marginal product
      (no cluster replacement; recompose via plainModel if needed) and DIFFERS
      from the advanced total (redundancy really removed);
      (c) no contribution record in simple mode carries `viaJoint`,
      `overlapBlend`, or `perLever`;
      (d) `sourceIndex(SIMPLE_HEALTH_MODEL)` is a subset of
      `sourceIndex(HEALTH_MODEL)` with identical numbers for shared keys
      (append-order invariant);
      (e) the two `mode: 'advanced'` findings exist, are the only findings
      flagged, and their `when()` matches the original (data audit);
      (f) a findings-mode filter check (engine passes mode through). Suite green.
- [ ] 6.8 Verification: `node --check` on all JS, full suite green, serve and
      manually check: defaults show 1.0× in BOTH modes; a healthy profile
      shows advanced LESS protective than simple (overclaim removed) with
      conflation tags in advanced and absent in simple; toggle preserves
      slider values; the two cluster findings vanish in simple; simple-mode
      chip [n] links still resolve on sources.html (canonical numbering); no
      console errors toggling rapidly.
- [ ] 6.9 AGENTS.md + file headers: add the mode convention line to AGENTS.md's
      design decisions and a short note atop js/app.js and js/factors.js so
      future work tags its feature's mode (advanced = conflation-clarity UI /
      simple = flat naive). Human reviews this diff.

## Phase C — Cleanup: agent-navigation work (created 2026-08-04)

Goal: self-documenting, de-tangled code so future AI workers can navigate the
conflation machinery WITHOUT carrying the 1659-line PLAN/todo history. Every
step is behavior-identical (suite + probes green) UNLESS the step is the
stricter-schema audit (A3/D1), which may surface data edits but never behavior
changes or citation renumbering.

Working rules for every step:
- `node tests/engine.test.js` after ANY change to js/factors.js / js/engine.js.
- Run `node --check` on every edited JS file (browser global + CommonJS dual
  export must still parse).
- Do NOT move citation order, renumber sources, or change the `evaluate()`
  return shape (in-flight Phase 4.5 and the future Phase 5.5
  `SIMPLE_HEALTH_MODEL` read them).
- Out of scope (flag, don't do): splitting factors.js per-cluster;
  de-prose-ifying PLAN.md/todo.md.
- NOTE (2026-08-04): todo.md reverted once mid-session (concurrent process?);
  if edits vanish, re-apply and continue — the code edits (js/*) are the
  source of truth and survive.

### Phase A — navigation & discoverability (zero behavior change)

- [x] A1: top-of-file manifest comments in js/factors.js and js/engine.js
      naming each structure and its line region (inputs / bmi / findings /
      jointModels / overlaps / perLeverOnly / sources / constants / baseline /
      outputs). Keeps the giant object literal findable. `node --check` + suite.
      DONE 2026-08-04: manifest + "THE CENTRAL DATA FLOW" walkthrough added
      to both files (explicitly flagging applyOverlaps' in-place mutation as
      pre-B1 and the Maps as ephemeral per-call). Suite green.
- [x] A2: add `OUTPUTS = ['mortality','cancer','cvd','cognition','happiness']`
      to engine.js, export it, and replace hard-coded output-name string
      literals in engine.js internals, app.js, and sources.js. PRESERVE ARRAY
      ORDER (matters for sourceIndex/clusterTotals iteration order — do not
      sort).

      Replaces the private `HR_OUTPUTS`/`POINTS_OUTPUTS`? NO — leave those
      (matters for which loop keys on private subsets); `OUTPUTS` is the FULL
      ordered list used by the DOM/copy layers. Only use `OUTPUTS` where the
      old code hard-coded the full 5-output sequence.
      DONE 2026-08-04: `OUTPUTS = HR_OUTPUTS.concat(POINTS_OUTPUTS)` + export;
      `evalEffects` builds `contributions` from OUTPUTS; app.js `updateChips`
      flattens `engine.OUTPUTS`. Per-output card renderers keep explicit keys.
      Suite green.
- [x] A3: tests/audit.js — read-only structural validator against the
      conflation schema (fail LOUDLY early instead of relying on fragile
      number-pinned tests in engine.test.js):
      + every `overlaps` member id is a real input id OR a live jointModels id;
      + every `jointModels[].members[]` is a real input id (bmi allowed as
        derived member);
      + rho/rhoU ∈ [0,1];
      + `outputs.grid` vs `outputs.grids` well-formed; `axes` bands non-empty;
        axis inputs resolve to real input ids;
      + `outputs` shorthand (`lookup`) valid; `model` field is score|table;
      + findings `when(v)` callable; sources keys all defined.
      Wired into the existing test entry (or run standalone) — suite STAYS green.
      DONE 2026-08-04: `tests/audit.js` (dual-export, standalone
      `node tests/audit.js` -> exit 0/1; factory `{ audit }`). Covers: overlap
      members real-id-or-jm, rho/rhoU ∈ [0,1], source+note presence; joint
      model id/model∈{score,table}/members/`outputs`-or-`lookup` shorthand,
      per-output shape (score: components inputs real + max>0, gradient steps
      numeric; table: axes each either real-input `inputs` OR a data `fn`
      [bmi/bodyFat allowed as derived axis inputs], non-empty bands; grid vs
      grids, rectangular cells with numeric hr; ratio shape; calibrate bool);
      perLeverOnly members real; findings when-callable + input + source;
      sources entries are objects. Wired into engine.test.js as `[A3]` section
      (audit(model) must be clean — one ok line). Negative-tested: broken
      member / bad axis / bad model-type all caught. Suite green.

### Phase B — de-tangle the conflation engine (behavior-identical, suite green)

- [x] B1: applyOverlaps -> pure `blendOverlaps(model, fx, jmTotals)` returning
      `{ blended, jmBlend, report }` (returns copies; does NOT mutate fx/
      jmTotals in place). Update activeOverlaps + evaluateRaw callers. Add a
      short data-flow header + ASCII diagram above it (eval -> blend ->
      accumulate). Behavior identical.
      DONE 2026-08-04: `blendOverlaps(model, fx, jmTotals)` added (engine.js)
      — shallow-copies the fx effect objects + the jmTotals map so the
      overlap discount is applied to COPIES and returned as
      `{ blended, jmTotals, jmBlend, report }`; the internal mutating core is
      renamed path (applyOverlaps still exists as the internal engine, NOT
      exported, called only by blendOverlaps). `activeOverlaps` reads
      `blendOverlaps(...).report`; `evaluateRaw` destructures the return and
      reads `blended`/`blendedJmTotals` in the accumulate + covariance loops
      (previously it read the mutated fx). `record` objects are SHARED by
      reference between the copy and the contribution records, so the
      overlapBlend tag still lands on the UI records. Engine header manifest +
      central-data-flow comment updated (blend now pure). Suite green
      byte-identical.
- [x] B2: extract one `conflationGroups(model)` -> { groups, groupOf,
      perLeverSet } (joint models + overlap pairs + per-lever) and have
      evaluateRaw, boundsEndpoints, and activeOverlaps ALL consume it —
      removing boundsEndpoints' hand-rolled re-derivation.
      DONE 2026-08-04: `conflationGroups(model)` (engine.js) returns
      { jmById, jmForInput, groups, groupOf, perLeverSet, perLeverKeys,
      perLeverOf } — the ONE walk over jointModels+overlaps+perLeverOnly
      (first-match ownership preserved). evaluateRaw's dispatch setup and
      boundsEndpoints' groups/groupOf/perLever construction both replaced by
      it (activeOverlaps reads overlap report directly, unchanged). Manifest
      updated. Suite green byte-identical.
- [x] B3: extract `accumulateHr(model, fx, jmTotals)` -> { totals, accMeta }
      from evaluateRaw so the ~90-line pass becomes a named sequence of steps.
      DONE 2026-08-04: `accumulateHr(model, values, blended, jmTotals,
      covJmTotals, jmBlend, overlapReport, contributions)` -> { totals, points,
      jmMeta, bmi } (engine.js, ~line 811). Holds the whole accumulation pass:
      per-lever exclusion, joint-model per-cluster product, marginal product,
      quadrature sigma, covariance (reads covJmTotals = post-blend cluster
      totals; jmMeta replacement reads unblended jmTotals), and the derived BMI
      effect. evaluateRaw now: evalEffects -> computeJmTotals -> blendOverlaps
      -> accumulateHr -> mark(viaJoint/partialCredit) -> bounds. Dead
      `resolveValue`/`widen`/`superseded` consts dropped with the old inline
      block (their 18 global refs were all in computeJmTotals/boundsEndpoints).
      Manifest updated (FOUR passes; accumulateHr:811). Suite green
      byte-identical.

### Phase C — de-duplicate drift-prone helpers (single source)

- [x] C1: engine exports `shortLabel(s)`, `esc(s)`, `displayName(id)` (input
      or joint-model title). app.js + sources.js call these instead of
      redefining shortName/esc/nameOf/jmTitle/inputName. Verify rendered HTML
      identical (`node --check` + app/sources boot smoke).
      DONE 2026-08-04: engine.js now exports `shortLabel(s)` (drops
      parentheticals), `esc(s)` (HTML-escape), and `displayName(model, id)`
      (resolves input id -> shortLabel(label), bmi -> shortLabel(bmi.label),
      joint-model id -> jm.title || shortLabel(cluster||id), else id — all the
      fallbacks the two pages used, single source ~line 1239). app.js dropped
      its local shortName/nameOf/esc + inputLabels/jmById maps (uses
      engine.esc + displayName); sources.js dropped its local
      shortLabel/inputName/jmTitle/esc/jmById/inputById and calls
      engine.displayName directly at all call sites (incl. overlap table,
      which now resolves both members via one fn). Verified: all 50 ids
      (inputs + 5 joint models + bmi + overlap members) produce identical
      strings to BOTH old paths; sources.html render (jm-list 15873b /
      ref-list 48767b / overlap 5384b / version) byte-identical to HEAD under
      a DOM-stub boot smoke. app.js boot smoke fails identically on HEAD and
      current (missing DOM pieces in stub — not a C1 regression). Suite green.

### Phase D — shared schema/API module (single place agents read the model)

- [x] D1: js/schema.js (dual-export like factors.js/engine.js) owning OUTPUTS,
      conflationGroups, displayName/esc/shortLabel, and auditModel(model)
      (hosted from A3). engine.js/app.js/sources.js/tests/audit.js import it.
      Move the conflation schema comment from PLAN.md to schema.js (PLAN.md
      keeps a short pointer). Citation order + evaluate() shape unchanged.
      DONE 2026-08-04: see D1a–D1f below. Suite green, sources render
      byte-identical, standalone audit runs.
  - [x] D1a: create js/schema.js — dual-export IIFE (browser global
        `HEALTH_SCHEMA` + `module.exports`) owning HR_OUTPUTS/POINTS_OUTPUTS/
        OUTPUTS, conflationGroups(model), shortLabel/esc/displayName(model,id),
        auditModel(model) (moved verbatim from tests/audit.js), plus the
        conflation schema doc comment (distilled from PLAN.md §2.1).
        DONE: js/schema.js created; exports all 8 names; auditModel clean
        against factors.js.
  - [x] D1b: engine.js — at IIFE top resolve schema via
        `(module.exports ? require('./schema.js') : globalThis.HEALTH_SCHEMA)`;
        delete local HR_OUTPUTS/POINTS_OUTPUTS/OUTPUTS, conflationGroups,
        shortLabel/esc/displayName; destructure from schema; re-export the
        same names (aliases to schema refs, so no consumer breaks). Update
        manifest. Suite green byte-identical.
        DONE: engine.js imports schema at IIFE top; local copies deleted
        (incl. sourceTags' inner shortLabel, now uses the schema one);
        manifest rewritten with a schema.js imports row. Engine still
        re-exports OUTPUTS/shortLabel/esc/displayName as the SAME objects
        (=== checked). Suite green.
  - [x] D1c: index.html + sources.html — add `<script src="js/schema.js">`
        AFTER factors.js, BEFORE engine.js.
        DONE: both pages load factors → schema → engine → page script.
  - [x] D1d: app.js + sources.js — read displayName/esc/OUTPUTS from
        `globalThis.HEALTH_SCHEMA` instead of engine; sources render still
        byte-identical under boot smoke.
        DONE: both pages add `const schema = globalThis.HEALTH_SCHEMA` and use
        schema.displayName/esc/OUTPUTS. sources.html boot smoke: jm-list
        15873b / ref-list 48767b / overlap 5384b / version 6b — byte-identical
        to HEAD. (app.js boot smoke fails identically on HEAD — stub too thin,
        not a regression.)
  - [x] D1e: tests/audit.js — thin wrapper re-exporting schema.auditModel as
        `{ audit }` + standalone runner (require.main === module) stays;
        tests/engine.test.js [A3] unchanged (requires './audit.js').
        DONE: tests/audit.js now requires ../js/schema.js; standalone
        `node tests/audit.js` → "model structure OK", exit 0; [A3] green.
  - [x] D1f: PLAN.md — replace the §2.1 conflation schema section with a
        pointer to js/schema.js; AGENTS.md file list + manifest mentions get
        a schema.js row. Final verification: `node --check` all, full suite
        green, sources boot-smoke byte-identical, node standalone audit runs.
        DONE: PLAN.md §2.1 has a blockquote pointer to js/schema.js as the
        authoritative schema; AGENTS.md file list + dual-export/load-order
        line updated (js/schema.js + tests/audit.js rows). Final verify:
        all 7 files `node --check` OK, `node tests/engine.test.js` green,
        `node tests/audit.js` exit 0, browser-style vm boot (factors→schema→
        engine) exposes HEALTH_MODEL/HEALTH_SCHEMA/HEALTH_ENGINE with
        engine.OUTPUTS === schema.OUTPUTS.

## Phase 5 — deferred (not now)

GBD pathway layer (H), age-conditional actuarial engine (E), own-cohort
analysis (P), full Q1/Q2 split (I), Monte Carlo default.
