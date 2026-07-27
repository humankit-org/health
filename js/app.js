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
    { id: 'diet', title: 'Diet & substances' },
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

  // ------------------------------------------------------------- rendering

  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function renderInputs() {
    const host = document.getElementById('inputs');
    for (const group of GROUPS) {
      const inputs = model.inputs.filter((i) => i.group === group.id && !i.extra);
      if (!inputs.length) continue;
      const section = el(`<section class="group"><h2>${group.title}</h2></section>`);
      for (const input of inputs) section.appendChild(renderInput(input));
      if (group.id === 'you') {
        const bmi = el('<div class="bmi-readout" id="bmi-readout" aria-live="polite"></div>');
        section.appendChild(bmi);
      }
      host.appendChild(section);
    }

    for (const group of GROUPS) {
      if (group.id === 'advanced') continue;
      let inputs;
      if (group.id === 'movement') {
        inputs = model.inputs.filter((i) => (i.group === 'movement' || i.group === 'advanced') && i.extra);
      } else {
        inputs = model.inputs.filter((i) => i.group === group.id && i.extra);
      }
      if (!inputs.length) continue;
      const details = el(`<details class="extra-toggle"><summary>${group.title}</summary></details>`);
      const section = el(`<section class="group"></section>`);
      for (const input of inputs) section.appendChild(renderInput(input));
      details.appendChild(section);
      host.appendChild(details);
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
      <p class="input-hint" id="hint-${input.id}">${input.hint}</p>
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
            <p class="output-blurb"></p>
          </div>
        </div>
      </div>
      <hr class="output-divider">
      <div class="output-card" id="out-mortality">
        <h3>All-cause mortality risk <!-- <span class="ev" data-ev="high">high</span></h3> --> </h3>
        <div class="mort-top">
          <div class="output-highlight">
            <div class="hr-big"><output id="hr-estimate">–</output><span class="hr-unit">× average</span></div>
          </div>
          <p class="output-blurb"></p>
        </div>
        <div class="gauge" id="hr-gauge" role="img" aria-label="Mortality hazard gauge">
          <div class="gauge-band" id="hr-band"></div>
          <div class="gauge-marker" id="hr-marker"></div>
          <div class="gauge-ref" title="Reference lifestyle = 1.0"></div>
        </div>
        <div class="gauge-scale"><span>0.3×</span><span>1.0×</span><span>3.0×</span></div>
        <div class="hr-sub" id="hr-sub"></div>
        <details><summary>More</summary><ul class="contrib" id="contrib-mortality"></ul><p class="ci-note">Ranges combine 95% CI, widened where evidence is thin.</p></details>
      </div>
      <div class="output-row split">
      <div class="output-card" id="out-cancer">
        <h3>Cancer mortality risk <!-- <span class="ev" data-ev="moderate">moderate</span></h3> --> </h3>
        <div class="hr-big"><output id="cancer-estimate">–</output><span class="hr-unit">× average</span></div>
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
        <div class="hr-big"><output id="cvd-estimate">–</output><span class="hr-unit">× average</span></div>
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
        <h3>Cognitive function <!-- <span class="ev" data-ev="low">low</span></h3> --> </h3>
        <div class="band-meter" id="meter-cognition" role="img">
          <div class="band-ref" title="Average"></div>
          <div class="band-marker" id="marker-cognition"></div>
        </div>
        <div class="band-label" id="band-cognition">–</div>
        <p class="output-blurb"></p>
        <details><summary>More</summary><ul class="contrib" id="contrib-cognition"></ul></details>
      </div>
      <div class="output-card" id="out-happiness">
        <h3>Happiness / wellbeing <!-- <span class="ev" data-ev="low">low</span></h3> --> </h3>
        <div class="band-meter" id="meter-happiness" role="img">
          <div class="band-ref" title="Average"></div>
          <div class="band-marker" id="marker-happiness"></div>
        </div>
        <div class="band-label" id="band-happiness">–</div>
        <p class="output-blurb"></p>
        <details><summary>More</summary><ul class="contrib" id="contrib-happiness"></ul></details>
      </div>
      </div>
      </div>
      <hr class="output-divider">
      <div class="output-card findings-card" id="out-findings">
        <h3>More findings from the same sources</h3>
        <p class="findings-blurb">Disease-specific effects and honest nulls that don't fit on a slider — shown when they apply to your current inputs.</p>
        <ul class="findings" id="findings-list"></ul>
      </div>`;
    for (const output of model.outputs) {
      const card = host.querySelector('#out-' + output.id);
      if (card) card.querySelector('.output-blurb').textContent = output.blurb;
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

  function refLink(sourceKey) {
    const n = refs[sourceKey];
    return `<a class="chip-ref" href="sources.html#ref-${n}">[${n}]</a>`;
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
      bmi.innerHTML = contrib
        ? `→ BMI ${result.bmi.toFixed(1)} (mortality ${fmtPctFromHr(contrib.hrDelta)} ${refLink(contrib.source)})`
        : `→ BMI ${result.bmi.toFixed(1)} (not used — measured body fat % supplied instead)`;
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
          chips.push(`<span class="chip ${c.hrDelta < 1 ? 'good' : 'bad'}" title="${c.note}">${which} ${fmtPctFromHr(c.hrDelta)} ${refLink(c.source)}</span>`);
        }
        if (c.pointsDelta !== undefined && Math.abs(c.pointsDelta) > 0.001) {
          const out = result.contributions.cognition.includes(c) ? 'cognition' : 'happiness';
          chips.push(`<span class="chip ${c.pointsDelta > 0 ? 'good' : 'bad'}" title="${c.note}">${out} ${fmtSigned(c.pointsDelta)} ${refLink(c.source)}</span>`);
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
      `${fmtPctFromHr(m.hrAvg)} vs. the average person · plausible range ${m.hrAvgLow.toFixed(2)}–${m.hrAvgHigh.toFixed(2)}`
    );
  }

  function updateCancer(result) {
    const c = result.cancer;
    updateHrCard(
      { estimate: 'cancer-estimate', sub: 'cancer-sub', gauge: 'cancer-gauge', marker: 'cancer-marker', band: 'cancer-band' },
      c.hrAvg, c.hrAvgLow, c.hrAvgHigh,
      `${fmtPctFromHr(c.hrAvg)} vs. the average person · plausible range ${c.hrAvgLow.toFixed(2)}–${c.hrAvgHigh.toFixed(2)}`
    );
    const cancerCoverage = document.getElementById('cancer-coverage');
    if (c.noData.length) {
      //cancerCoverage.textContent = 'No cancer-specific data yet for: ' + c.noData.join(', ') + ' — those still count in all-cause mortality above.';
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
      `${fmtPctFromHr(c.hrAvg)} vs. the average person · plausible range ${c.hrAvgLow.toFixed(2)}–${c.hrAvgHigh.toFixed(2)}`
    );
    const cvdCoverage = document.getElementById('cvd-coverage');
    if (c.noData.length) {
      //cvdCoverage.textContent = 'No CVD-specific data yet for: ' + c.noData.join(', ') + ' — those still count in all-cause mortality above.';
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
      `${score.label} (qualitative estimate)`;
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
      return `<li>
        <span class="contrib-effect ${dir}">${effect}</span>
        <span class="contrib-label">${c.label}</span>
        <a class="contrib-ref" href="sources.html#ref-${refs[c.source]}" title="${c.note}">[${refs[c.source]}]</a>
        <span class="ev small" data-ev="${c.evidence}" title="${EVIDENCE_TITLE[c.evidence]}">${c.evidence}</span>
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
