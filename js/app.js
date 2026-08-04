/*
 * app.js — DOM rendering and wiring. All computation lives in engine.js;
 * all numbers live in factors.js. This file only draws them.
 *
 * Privacy: state is held in a plain in-memory object. Nothing is persisted,
 * logged, or transmitted. There is no analytics in this project.
 */

(function () {
  'use strict';

  const model = globalThis.HEALTH_MODEL;
  const engine = globalThis.HEALTH_ENGINE;
  const state = engine.defaults(model);
  const refs = engine.sourceIndex(model); // shared citation numbering (sources.html uses the same)

  const GROUPS = [
    { id: 'you', title: 'About you' },
    { id: 'movement', title: 'Movement' },
    { id: 'diet', title: 'Diet' },
    { id: 'substances', title: 'Substances' },
    { id: 'mind', title: 'Recovery & mind' },
    { id: 'extras', title: 'Extras' },
    { id: 'environment', title: 'Environment' },
    { id: 'advanced', title: 'Advanced — if you\'ve measured these' },
  ];

const EVIDENCE_TITLE = {
    high: 'High confidence: large, consistent meta-analyses / pooled cohorts (still mostly observational).',
    moderate: 'Moderate confidence: meta-analytic but heterogeneous, small trials, or approximate conversions.',
    low: 'Low confidence: single cohorts, cross-sectional or indirect evidence. Directionally suggestive only.',
  };

  // -------------------------------------------------- conflation disclosure
  // Per-slider / per-lever notes generated from the engine's tags — the same
  // fields the conflation table on sources.html renders (overlaps + joint
  // models), so the copy can never drift from the data.
  const inputLabels = {};
  for (const input of model.inputs) inputLabels[input.id] = input.label;
  if (model.bmi && model.bmi.label) inputLabels.bmi = model.bmi.label;
  const jmById = new Map();
  for (const jm of model.jointModels || []) jmById.set(jm.id, jm);

  const shortName = (s) => {
    const stripped = String(s || '').replace(/\(.*?\)/g, '').trim();
    return stripped || s;
  };
  // A pair may name an input OR a joint model (e.g. `dietScore`,
  // `ekelundTable`) — resolve both.
  const nameOf = (id) => {
    if (inputLabels[id]) return shortName(inputLabels[id]);
    const jm = jmById.get(id);
    if (jm) return jm.title || shortName(jm.cluster || jm.id);
    return id;
  };
  const blendPct = (rho) => Math.max(0, Math.round((1 - Number(rho)) * 100));

  // "counted at X% — overlaps Y"; only present on the weaker side of an
  // active overlap pair (engine sets c.overlapBlend).
  const overlapNote = (c) => {
    const b = c.overlapBlend;
    if (!b) return '';
    const other = nameOf(b.pair);
    return {
      pct: blendPct(b.rho),
      other,
      title: `Overlaps ${other} — its effect is shared, so the weaker one is counted at ${blendPct(b.rho)}% instead of being added in full.`,
    };
  };
  // "counted with the … joint model" — the input's marginal is replaced by
  // its cluster's published joint estimate (never multiplied separately).
  const jointNote = (c) => {
    if (!c.viaJoint) return '';
    const name = nameOf(c.viaJoint);
    return {
      name,
      title: `Counted via the published ${name} joint model — this slider does not get multiplied separately.`,
    };
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  // Chip footnotes: "counted at 70% — overlaps cardio" (blend) and "counted
  // via the PURE diet-score joint model" — the disclosure copy for a single
  // contribution. psychosocial per-lever chips get their own tag in updateChips.
  const chipTags = (c) => {
    const ov = overlapNote(c);
    const jn = jointNote(c);
    const parts = [];
    if (jn) parts.push(`<span class="confl-tag" title="${esc(jn.title)}">via ${esc(jn.name)}</span>`);
    if (ov) parts.push(`<span class="confl-tag" title="${esc(ov.title)}">counted at ${ov.pct}% — overlaps ${esc(ov.other)}</span>`);
    return parts.join(' ');
  };

  // ------------------------------------------------------------- rendering

  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function renderInputs() {
    const host = document.getElementById('inputs');
    for (const group of GROUPS) {
      const primary = model.inputs.filter((i) => i.group === group.id && !i.extra);
      const extra = model.inputs.filter((i) => i.group === group.id && i.extra);
      if (!primary.length && !extra.length) continue;
      const section = el(`<section class="group"><h2>${group.title}</h2></section>`);
      for (const input of primary) section.appendChild(renderInput(input));
      if (extra.length) {
        const details = el(`<details class="advanced-toggle">
        <summary>More inputs</summary>`);
        for (const input of extra) details.appendChild(renderInput(input));
        section.appendChild(details);
      }
      if (group.id === 'you') {
        const bmi = el('<div class="bmi-readout" id="bmi-readout" aria-live="polite"></div>');
        section.appendChild(bmi);
      }
      host.appendChild(section);
    }
  }

  function renderInput(input) {
    const card = el(`<div class="input" id="card-${input.id}"></div>`);
    if (input.gatedBy) card.classList.add('gated');
    card.dataset.gate = input.gatedBy || '';
    let control = '';
    if (input.kind === 'slider') {
      control = `
        <div class="input-head">
          <label for="in-${input.id}">${input.label}</label>
          <output class="input-value" id="val-${input.id}"></output>
        </div>
        <input type="range" id="in-${input.id}" data-id="${input.id}"
               min="${input.min}" max="${input.max}" step="${input.step}" value="${input.default}"
               aria-describedby="hint-${input.id}">`;
    } else if (input.kind === 'segmented') {
      const opts = input.options.map((o) => `
        <label class="seg-option">
          <input type="radio" name="in-${input.id}" data-id="${input.id}" value="${o.value}"
                 ${o.value === input.default ? 'checked' : ''}>
          <span>${o.label}</span>
        </label>`).join('');
      control = `
        <div class="input-head"><span class="input-label">${input.label}</span></div>
        <div class="segmented" role="radiogroup" aria-label="${input.label}">${opts}</div>`;
    } else if (input.kind === 'toggle') {
      control = `
        <div class="input-head toggle-head">
          <label for="in-${input.id}">${input.label}</label>
          <label class="switch">
            <input type="checkbox" id="in-${input.id}" data-id="${input.id}" ${input.default ? 'checked' : ''}>
            <span class="switch-track" aria-hidden="true"></span>
          </label>
        </div>`;
    }
    card.innerHTML = `${control}
      <p class="input-hint" id="hint-${input.id}">${input.hint || ''}</p>
      <div class="chips" id="chips-${input.id}"></div>`;
    return card;
  }

  function renderOutputs() {
    const host = document.getElementById('outputs');
    host.innerHTML = `
      <div class="output-tiles">
      <div class="output-card" id="out-lifeExpectancy">
        <h3>Estimated life expectancy</h3>
        <div class="output-main">
          <div class="output-highlight">
            <div class="le-big"><output id="le-estimate">–</output><span class="le-unit">years</span></div>
          </div>
          <div class="output-info">
            <div class="le-delta" id="le-delta"></div>
            <div class="le-range" id="le-range"></div>
          </div>
        </div>
        <details><summary>More</summary><p class="output-blurb"></p><p class="le-method">Life expectancy is estimated from a US sex-specific baseline (NCHS 2023) shifted by your combined mortality risk. The translation uses a Gompertz approximation in which adult mortality risk doubles every ~7 years: ΔLE ≈ −ln(HR) / (ln2 / 7). This approach reproduces published estimates such as +4.5 years for high exercise (Moore 2012) and −10 years for smoking (Jha 2013). These are rough population-level associations, not individual predictions.</p></details>
      </div>
      <hr class="output-divider">
      <div class="output-card" id="out-mortality">
        <h3>All-cause mortality risk <!-- <span class="ev" data-ev="high">high</span></h3> --> </h3>
        <div class="mort-top">
          <div class="output-highlight">
            <div class="hr-big"><output id="hr-estimate">–</output><span class="hr-unit">× reference</span></div>
          </div>
          <div class="mort-right">
            <div class="hr-sub" id="hr-sub"></div>
            <div class="gauge" id="hr-gauge" role="img" aria-label="Mortality hazard gauge">
              <div class="gauge-band" id="hr-band"></div>
              <div class="gauge-marker" id="hr-marker"></div>
              <div class="gauge-ref" title="Reference lifestyle = 1.0"></div>
            </div>
            <div class="gauge-scale"><span>0.3×</span><span>1.0×</span><span>3.0×</span></div>
          </div>
        </div>
        <details><summary>More</summary><ul class="contrib" id="contrib-mortality"></ul><p class="ci-note">Ranges combine 95% CI, widened where evidence is thin.</p></details>
      </div>
      <div class="output-row split">
      <div class="output-card" id="out-cancer">
        <h3>Cancer mortality risk <!-- <span class="ev" data-ev="moderate">moderate</span></h3> --> </h3>
        <div class="hr-big"><output id="cancer-estimate">–</output><span class="hr-unit">× reference</span></div>
        <div class="hr-sub" id="cancer-sub"></div>
        <div class="gauge" id="cancer-gauge" role="img" aria-label="Cancer mortality hazard gauge">
          <div class="gauge-band" id="cancer-band"></div>
          <div class="gauge-marker" id="cancer-marker"></div>
          <div class="gauge-ref" title="Average person = 1.0"></div>
        </div>
        <div class="gauge-scale"><span>0.3×</span><span>1.0×</span><span>3.0×</span></div>
        <details><summary>More</summary><ul class="contrib" id="contrib-cancer"></ul><p class="ci-note">Ranges combine 95% CI, widened where evidence is thin.</p><p class="output-blurb"></p><p class="coverage-note" id="cancer-coverage"></p></details>
      </div>
      <div class="output-card" id="out-cvd">
        <h3>Cardiovascular mortality risk <!-- <span class="ev" data-ev="moderate">moderate</span></h3> --> </h3>
        <div class="hr-big"><output id="cvd-estimate">–</output><span class="hr-unit">× reference</span></div>
        <div class="hr-sub" id="cvd-sub"></div>
        <div class="gauge" id="cvd-gauge" role="img" aria-label="Cardiovascular mortality hazard gauge">
          <div class="gauge-band" id="cvd-band"></div>
          <div class="gauge-marker" id="cvd-marker"></div>
          <div class="gauge-ref" title="Average person = 1.0"></div>
        </div>
        <div class="gauge-scale"><span>0.3×</span><span>1.0×</span><span>3.0×</span></div>
        <details><summary>More</summary><ul class="contrib" id="contrib-cvd"></ul><p class="ci-note">Ranges combine 95% CI, widened where evidence is thin.</p><p class="output-blurb"></p><p class="coverage-note" id="cvd-coverage"></p></details>
      </div>
      </div>
      <hr class="output-divider">
      <div class="output-row split">
      <div class="output-card" id="out-cognition">
        <h3>Cognitive function</h3>
        <div class="band-meter" id="meter-cognition" role="img">
          <div class="band-ref" title="Average"></div>
          <div class="band-marker" id="marker-cognition"></div>
        </div>
        <div class="band-label" id="band-cognition">–</div>
        <p class="qual-text" style="margin-top:0.01cm;">qualitative estimate, generally thin evidence</p>
        <details><summary>More</summary><p class="output-blurb"></p><ul class="contrib" id="contrib-cognition"></ul></details>
      </div>
      <div class="output-card" id="out-happiness">
        <h3>Happiness / wellbeing</h3>
        <div class="band-meter" id="meter-happiness" role="img">
          <div class="band-ref" title="Average"></div>
          <div class="band-marker" id="marker-happiness"></div>
        </div>
        <div class="band-label" id="band-happiness">–</div>
        <p class="qual-text" style="margin-top:0.01cm;">qualitative estimate, generally thin evidence</p>
        <details><summary>More</summary><p class="output-blurb"></p><ul class="contrib" id="contrib-happiness"></ul></details>
      </div>
      </div>
      </div>
      <hr class="output-divider">
      <div class="output-card findings-card" id="out-findings">
        <h3>More findings</h3>
        <ul class="findings" id="findings-list"></ul>
      </div>`;
    for (const output of model.outputs) {
      const card = host.querySelector('#out-' + output.id);
      const blurb = card && card.querySelector('.output-blurb');
      if (blurb) blurb.textContent = output.blurb;
    }
    host.querySelectorAll('.ev').forEach((badge) => {
      badge.title = EVIDENCE_TITLE[badge.dataset.ev];
    });
  }

  // ------------------------------------------------------------- formatting

  function fmtSigned(x, digits = 1) {
    return (x > 0 ? '+' : x < 0 ? '−' : '±') + Math.abs(x).toFixed(digits);
  }

  function fmtPctFromHr(hr) {
    const pct = Math.round((1 - hr) * 100);
    if (pct > 0) return '−' + pct + '%';
    if (pct < 0) return '+' + Math.abs(pct) + '%';
    return '±0%';
  }

  function refLink(sourceKeys) {
    const keys = Array.isArray(sourceKeys) ? sourceKeys : [sourceKeys];
    return keys.map((key) => {
      const n = refs[key];
      return `<a class="chip-ref" href="sources.html#ref-${n}">[${n}]</a>`;
    }).join(' ');
  }

  // ------------------------------------------------------------- updating

  function update(result) {
    updateInputReadouts(result);
    updateChips(result);
    updateLifeExpectancy(result);
    updateMortality(result);
    updateCancer(result);
    updateCvd(result);
    updateBand('cognition', result.scores.cognition);
    updateBand('happiness', result.scores.happiness);
    updateContrib('mortality', result.contributions.mortality, 'hr');
    updateContrib('cancer', result.contributions.cancer, 'hr');
    updateContrib('cvd', result.contributions.cvd, 'hr');
    updateContrib('cognition', result.contributions.cognition, 'points');
    updateContrib('happiness', result.contributions.happiness, 'points');
    updateFindings(result.findings);
    updateGates();
  }

  // Dim advanced inputs whose enabling toggle is off.
  function updateGates() {
    document.querySelectorAll('.input.gated').forEach((card) => {
      const gate = card.dataset.gate;
      const open = !!state[gate];
      card.classList.toggle('gate-closed', !open);
      const slider = card.querySelector('input[type="range"]');
      if (slider) slider.disabled = !open;
    });
  }

  function updateFindings(findings) {
    const host = document.getElementById('findings-list');
    if (!findings.length) {
      host.innerHTML = '<li class="findings-empty">Nothing yet — findings appear here as your inputs match sourced effects.</li>';
      return;
    }
    const ICON = { good: '↓', bad: '↑', neutral: '↔' };
    host.innerHTML = findings.map((f) => `
      <li class="finding ${f.dir}">
        <span class="finding-icon" aria-hidden="true">${ICON[f.dir] || '±'}</span>
        <span class="finding-text">${f.text}</span>
        <span class="finding-meta">${f.input} ${refLink(f.source)}</span>
      </li>`).join('');
  }

  function updateInputReadouts(result) {
    for (const input of model.inputs) {
      if (input.kind !== 'slider') continue;
      const out = document.getElementById('val-' + input.id);
      if (out) out.textContent = `${result.values[input.id]} ${input.unit}`;
    }
    const bmi = document.getElementById('bmi-readout');
    if (bmi && result.bmi) {
      const contrib = result.contributions.mortality.find((c) => c.inputId === 'bmi');
      if (contrib) {
        bmi.innerHTML = `→ BMI ${result.bmi.toFixed(1)} (mortality ${fmtPctFromHr(contrib.hrDelta)} ${refLink(contrib.source)})`;
      } else if (state.bodyFatOn) {
        bmi.innerHTML = `→ BMI ${result.bmi.toFixed(1)} (not used — measured body fat % supplied instead)`;
      } else {
        // The bmi marginal retires when the PA×adiposity cluster covers
        // mortality (mayoCells) — the cluster total carries the weight
        // effect together with activity.
        bmi.innerHTML = `→ BMI ${result.bmi.toFixed(1)} (counted together with activity via the PA×adiposity cluster ${refLink('sanchezlastra2021')})`;
      }
    }
  }

  function updateChips(result) {
    for (const input of model.inputs) {
      const host = document.getElementById('chips-' + input.id);
      if (!host) continue;
      const mine = result.contributions.mortality
        .concat(result.contributions.cancer, result.contributions.cvd, result.contributions.cognition, result.contributions.happiness)
        .filter((c) => c.inputId === input.id);
      const chips = [];
      for (const c of mine) {
        if (c.hrDelta !== undefined && Math.abs(c.hrDelta - 1) > 0.005) {
          const which = result.contributions.cancer.includes(c) ? 'cancer' : result.contributions.cvd.includes(c) ? 'cvd' : 'mortality';
          const lever = c.perLever ? ' chip-lever' : '';
          const title = c.perLever
            ? `Psychosocial: no reliable way to combine these yet — shown individually. It does NOT count into the ${which} total. ${c.note}`
            : c.note;
          chips.push(`<span class="chip ${c.hrDelta < 1 ? 'good' : 'bad'}${lever}" title="${esc(title)}">${which} ${fmtPctFromHr(c.hrDelta)} ${refLink(c.source)}${c.perLever ? ' <span class="chip-lever-tag" title="Not counted into the card total — psychosocial factors can\'t be combined yet, so this is shown per slider only.">(shown individually)</span>' : ''}${chipTags(c)}</span>`);
        }
        if (c.pointsDelta !== undefined && Math.abs(c.pointsDelta) > 0.001) {
          const out = result.contributions.cognition.includes(c) ? 'cognition' : 'happiness';
          const lever = c.perLever ? ' chip-lever' : '';
          const title = c.perLever
            ? `Psychosocial: no reliable way to combine these yet — shown individually. Points still count into the ${out} band. ${c.note}`
            : c.note;
          chips.push(`<span class="chip ${c.pointsDelta > 0 ? 'good' : 'bad'}${lever}" title="${esc(title)}">${out} ${fmtSigned(c.pointsDelta)} ${refLink(c.source)}${c.perLever ? ' <span class="chip-lever-tag">(shown individually)</span>' : ''}${chipTags(c)}</span>`);
        }
      }
      host.innerHTML = chips.join('');
    }
  }

  function updateLifeExpectancy(result) {
    const le = result.lifeExpectancy;
    document.getElementById('le-estimate').textContent = le.estimate.toFixed(1);
    const delta = le.delta;
    document.getElementById('le-delta').innerHTML =
      `${fmtSigned(delta)} years vs. baseline ${le.baseline.toFixed(1)}` +
      (result.mortality.clamped ? ' <span class="clamp-note" title="Combined effects overlap, so the model refuses to overclaim. See methodology.">(capped)</span>' : '');
    document.getElementById('le-range').textContent =
      `plausible range ${le.low.toFixed(1)}–${le.high.toFixed(1)}`;
  }

  // Log-scale gauge updater shared by the mortality and cancer cards.
  function updateHrCard(ids, hrAvg, hrAvgLow, hrAvgHigh, subText) {
    document.getElementById(ids.estimate).textContent = hrAvg.toFixed(2);
    document.getElementById(ids.sub).textContent = subText;
    const lo = Math.log(0.3), hi = Math.log(3.0);
    const pos = (x) => Math.min(100, Math.max(0, ((Math.log(x) - lo) / (hi - lo)) * 100));
    document.querySelector('#' + ids.gauge + ' .gauge-ref').style.left = pos(1) + '%';
    document.getElementById(ids.marker).style.left = pos(hrAvg) + '%';
    const band = document.getElementById(ids.band);
    band.style.left = pos(hrAvgLow) + '%';
    band.style.width = pos(hrAvgHigh) - pos(hrAvgLow) + '%';
    document.getElementById(ids.gauge).setAttribute('aria-label',
      `Hazard ratio ${hrAvg.toFixed(2)} vs average, range ${hrAvgLow.toFixed(2)} to ${hrAvgHigh.toFixed(2)}`);
  }

  function updateMortality(result) {
    const m = result.mortality;
    updateHrCard(
      { estimate: 'hr-estimate', sub: 'hr-sub', gauge: 'hr-gauge', marker: 'hr-marker', band: 'hr-band' },
      m.hrAvg, m.hrAvgLow, m.hrAvgHigh,
      `${fmtPctFromHr(m.hrAvg)} · plausible range ${m.hrAvgLow.toFixed(2)}–${m.hrAvgHigh.toFixed(2)}`
    );
  }

  function updateCancer(result) {
    const c = result.cancer;
    updateHrCard(
      { estimate: 'cancer-estimate', sub: 'cancer-sub', gauge: 'cancer-gauge', marker: 'cancer-marker', band: 'cancer-band' },
      c.hrAvg, c.hrAvgLow, c.hrAvgHigh,
      `${fmtPctFromHr(c.hrAvg)} · plausible range ${c.hrAvgLow.toFixed(2)}–${c.hrAvgHigh.toFixed(2)}`
    );
    const cancerCoverage = document.getElementById('cancer-coverage');
    if (c.noData.length) {
      cancerCoverage.textContent = 'No cancer-specific data yet for: ' + c.noData.join(', ') + ' — those still count in all-cause mortality above.';
      cancerCoverage.style.display = '';
    } else {
      cancerCoverage.style.display = 'none';
    }
  }

  function updateCvd(result) {
    const c = result.cvd;
    updateHrCard(
      { estimate: 'cvd-estimate', sub: 'cvd-sub', gauge: 'cvd-gauge', marker: 'cvd-marker', band: 'cvd-band' },
      c.hrAvg, c.hrAvgLow, c.hrAvgHigh,
      `${fmtPctFromHr(c.hrAvg)} · plausible range ${c.hrAvgLow.toFixed(2)}–${c.hrAvgHigh.toFixed(2)}`
    );
    const cvdCoverage = document.getElementById('cvd-coverage');
    if (c.noData.length) {
      cvdCoverage.textContent = 'No CVD-specific data yet for: ' + c.noData.join(', ') + ' — those still count in all-cause mortality above.';
      cvdCoverage.style.display = '';
    } else {
      cvdCoverage.style.display = 'none';
    }
  }

  function updateBand(id, score) {
    // Map points vs the average person (-3..+3) to marker position. Marker
    // width = engine-computed fuzz: wider when contributing evidence is shakier.
    const p = Math.min(3, Math.max(-3, score.relPoints));
    const pct = ((p + 3) / 6) * 100;
    const fuzz = ((score.fuzz || 0.5) / 6) * 100;
    const marker = document.getElementById('marker-' + id);
    marker.style.left = `calc(${pct}% - ${fuzz}%)`;
    marker.style.width = fuzz * 2 + '%';
    document.getElementById('band-' + id).textContent =
      `${score.label}`;
    document.getElementById('meter-' + id).setAttribute('aria-label', score.label);
  }

  function updateContrib(outputId, contribs, field) {
    const host = document.getElementById('contrib-' + outputId);
    const nonzero = contribs
      .filter((c) => field === 'hr' ? Math.abs(c.hrDelta - 1) > 0.005 : Math.abs(c.pointsDelta) > 0.001)
      .sort((a, b) => field === 'hr'
        ? Math.abs(Math.log(b.hrDelta)) - Math.abs(Math.log(a.hrDelta))
        : Math.abs(b.pointsDelta) - Math.abs(a.pointsDelta));
    if (!nonzero.length) {
      host.innerHTML = '<li class="contrib-empty">Nothing pushing this yet — move some sliders.</li>';
      return;
    }
    host.innerHTML = nonzero.map((c) => {
      const effect = field === 'hr' ? `mortality ${fmtPctFromHr(c.hrDelta)}` : fmtSigned(c.pointsDelta);
      const dir = field === 'hr' ? (c.hrDelta < 1 ? 'good' : 'bad') : (c.pointsDelta > 0 ? 'good' : 'bad');
const ov = overlapNote(c);
      const jn = jointNote(c);
      const conflNote = ov ? `<span class="contrib-lever" title="${esc(ov.title)}">counted at ${ov.pct}% — overlaps ${esc(ov.other)}</span>`
        : jn ? `<span class="contrib-lever" title="${esc(jn.title)}">counted via ${esc(jn.name)}</span>`
        : '';
      const leverNote = c.perLever && field === 'hr'
        ? `<span class="contrib-lever" title="Psychosocial: no reliable way to combine these yet — the research can't separate this effect from the other factors on this card, so it is shown individually and is NOT counted into the ${outputId} total.">psychosocial — shown individually, not in the total</span>`
        : c.perLever
          ? `<span class="contrib-lever" title="Psychosocial: no reliable way to combine these yet — shown individually. Points from these sliders still count into this band.">psychosocial — points only</span>`
          : conflNote;
      return `<li>
        <span class="contrib-effect ${dir}">${effect}</span>
        <span class="contrib-label">${c.label}</span>
        ${Array.isArray(c.source) ? c.source.map((key) => `<a class="contrib-ref" href="sources.html#ref-${refs[key]}" title="${c.note}">[${refs[key]}]</a>`).join(' ') : `<a class="contrib-ref" href="sources.html#ref-${refs[c.source]}" title="${c.note}">[${refs[c.source]}]</a>`}
        <span class="ev small" data-ev="${c.evidence}" title="${EVIDENCE_TITLE[c.evidence]}">${c.evidence}</span>
        ${conflNote}
        ${leverNote}
      </li>`;
    }).join('');
  }

  // ------------------------------------------------------------- events

  function wireEvents() {
    document.getElementById('inputs').addEventListener('input', (e) => {
      const id = e.target.dataset && e.target.dataset.id;
      if (!id) return;
      if (e.target.type === 'checkbox') state[id] = e.target.checked;
      else if (e.target.type === 'radio') state[id] = e.target.value;
      else state[id] = parseFloat(e.target.value);
      update(engine.evaluate(model, state));
    });
    document.getElementById('reset').addEventListener('click', () => {
      Object.assign(state, engine.defaults(model));
      for (const input of model.inputs) {
        if (input.kind === 'slider') {
          document.getElementById('in-' + input.id).value = input.default;
        } else if (input.kind === 'segmented') {
          const radio = document.querySelector(`input[name="in-${input.id}"][value="${input.default}"]`);
          if (radio) radio.checked = true;
        } else if (input.kind === 'toggle') {
          document.getElementById('in-' + input.id).checked = input.default;
        }
      }
      update(engine.evaluate(model, state));
    });
  }

  // ------------------------------------------------------------- init

  renderInputs();
  renderOutputs();
  wireEvents();
  update(engine.evaluate(model, state));

  const versionEl = document.getElementById('model-version');
  if (versionEl) versionEl.textContent = model.meta.version;
})();
