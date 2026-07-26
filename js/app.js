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

  const GROUPS = [
    { id: 'you', title: 'About you' },
    { id: 'movement', title: 'Movement' },
    { id: 'diet', title: 'Diet & substances' },
    { id: 'mind', title: 'Recovery & mind' },
    { id: 'extras', title: 'Extras' },
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
      const inputs = model.inputs.filter((i) => i.group === group.id);
      if (!inputs.length) continue;
      const section = el(`<section class="group"><h2>${group.title}</h2></section>`);
      for (const input of inputs) section.appendChild(renderInput(input));
      if (group.id === 'you') {
        const bmi = el('<div class="bmi-readout" id="bmi-readout" aria-live="polite"></div>');
        section.appendChild(bmi);
      }
      host.appendChild(section);
    }
  }

  function renderInput(input) {
    const card = el(`<div class="input" id="card-${input.id}"></div>`);
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
      <div class="output-card" id="out-lifeExpectancy">
        <h3>Estimated life expectancy</h3>
        <div class="le-big"><output id="le-estimate">–</output><span class="le-unit">years</span></div>
        <div class="le-delta" id="le-delta"></div>
        <div class="le-range" id="le-range"></div>
        <p class="output-blurb"></p>
      </div>
      <div class="output-card" id="out-mortality">
        <h3>All-cause mortality risk <span class="ev" data-ev="high">high</span></h3>
        <div class="hr-big"><output id="hr-estimate">–</output><span class="hr-unit">× reference</span></div>
        <div class="hr-sub" id="hr-sub"></div>
        <div class="gauge" id="hr-gauge" role="img" aria-label="Mortality hazard gauge">
          <div class="gauge-band" id="hr-band"></div>
          <div class="gauge-marker" id="hr-marker"></div>
          <div class="gauge-ref" title="Reference lifestyle = 1.0"></div>
        </div>
        <div class="gauge-scale"><span>0.3×</span><span>1.0×</span><span>3.0×</span></div>
        <p class="output-blurb"></p>
        <details><summary>What drives this?</summary><ul class="contrib" id="contrib-mortality"></ul></details>
      </div>
      <div class="output-card" id="out-cognition">
        <h3>Cognitive function <span class="ev" data-ev="low">low</span></h3>
        <div class="band-meter" id="meter-cognition" role="img">
          <div class="band-marker" id="marker-cognition"></div>
        </div>
        <div class="band-label" id="band-cognition">–</div>
        <p class="output-blurb"></p>
        <details><summary>What drives this?</summary><ul class="contrib" id="contrib-cognition"></ul></details>
      </div>
      <div class="output-card" id="out-happiness">
        <h3>Happiness / wellbeing <span class="ev" data-ev="low">low</span></h3>
        <div class="band-meter" id="meter-happiness" role="img">
          <div class="band-marker" id="marker-happiness"></div>
        </div>
        <div class="band-label" id="band-happiness">–</div>
        <p class="output-blurb"></p>
        <details><summary>What drives this?</summary><ul class="contrib" id="contrib-happiness"></ul></details>
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

  function refIndex() {
    // Number sources in order of first use: inputs, bmi, baseline.
    if (refIndex.cache) return refIndex.cache;
    const order = [];
    const push = (s) => { if (s && !order.includes(s)) order.push(s); };
    for (const input of model.inputs) for (const e of input.effects) push(e.source);
    push(model.bmi.source);
    push(model.baseline.source);
    const map = {};
    order.forEach((key, i) => (map[key] = i + 1));
    refIndex.cache = map;
    return map;
  }

  function renderReferences() {
    const map = refIndex();
    const items = Object.entries(map)
      .sort((a, b) => a[1] - b[1])
      .map(([key, n]) => {
        const s = model.sources[key];
        const pmid = s.pmid ? ` · <a href="https://pubmed.ncbi.nlm.nih.gov/${s.pmid}/">PubMed</a>` : '';
        return `<li value="${n}">${s.authors} (${s.year}). <em>${s.title}</em>. ${s.journal}.
          <a href="${s.url}">DOI</a>${pmid}</li>`;
      });
    document.getElementById('ref-list').innerHTML = items.join('');
  }

  // ------------------------------------------------------------- updating

  function update(result) {
    updateInputReadouts(result);
    updateChips(result);
    updateLifeExpectancy(result);
    updateMortality(result);
    updateBand('cognition', result.scores.cognition);
    updateBand('happiness', result.scores.happiness);
    updateContrib('mortality', result.contributions.mortality, 'hr');
    updateContrib('cognition', result.contributions.cognition, 'points');
    updateContrib('happiness', result.contributions.happiness, 'points');
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
      bmi.textContent = `→ BMI ${result.bmi.toFixed(1)} (mortality ${fmtPctFromHr(contrib.hr)} [${refIndex()[contrib.source]}])`;
    }
  }

  function updateChips(result) {
    for (const input of model.inputs) {
      const host = document.getElementById('chips-' + input.id);
      if (!host) continue;
      const mine = result.contributions.mortality
        .concat(result.contributions.cognition, result.contributions.happiness)
        .filter((c) => c.inputId === input.id);
      const chips = [];
      for (const c of mine) {
        if (c.hr !== undefined && Math.abs(c.hr - 1) > 0.005) {
          chips.push(`<span class="chip ${c.hr < 1 ? 'good' : 'bad'}" title="${c.note}">mortality ${fmtPctFromHr(c.hr)} [${refIndex()[c.source]}]</span>`);
        }
        if (c.points !== undefined && Math.abs(c.points) > 0.001) {
          const out = result.contributions.cognition.includes(c) ? 'cognition' : 'happiness';
          chips.push(`<span class="chip ${c.points > 0 ? 'good' : 'bad'}" title="${c.note}">${out} ${fmtSigned(c.points)} [${refIndex()[c.source]}]</span>`);
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

  function updateMortality(result) {
    const m = result.mortality;
    document.getElementById('hr-estimate').textContent = m.hr.toFixed(2);
    document.getElementById('hr-sub').textContent =
      `${fmtPctFromHr(m.hr)} vs. reference · plausible range ${m.hrLow.toFixed(2)}–${m.hrHigh.toFixed(2)}`;
    // Log-scale gauge from 0.3x to 3.0x.
    const lo = Math.log(0.3), hi = Math.log(3.0);
    const pos = (x) => Math.min(100, Math.max(0, ((Math.log(x) - lo) / (hi - lo)) * 100));
    document.querySelector('#hr-gauge .gauge-ref').style.left = pos(1) + '%';
    document.getElementById('hr-marker').style.left = pos(m.hr) + '%';
    const band = document.getElementById('hr-band');
    band.style.left = pos(m.hrLow) + '%';
    band.style.width = pos(m.hrHigh) - pos(m.hrLow) + '%';
    document.getElementById('hr-gauge').setAttribute('aria-label',
      `Mortality hazard ratio ${m.hr.toFixed(2)}, range ${m.hrLow.toFixed(2)} to ${m.hrHigh.toFixed(2)}`);
  }

  function updateBand(id, score) {
    // Map points (-3..+3) to marker position. Marker width shows +-0.5 fuzz.
    const p = Math.min(3, Math.max(-3, score.points));
    const pct = ((p + 3) / 6) * 100;
    const fuzz = (0.5 / 6) * 100;
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
      .filter((c) => field === 'hr' ? Math.abs(c.hr - 1) > 0.005 : Math.abs(c.points) > 0.001)
      .sort((a, b) => field === 'hr'
        ? Math.abs(Math.log(b.hr)) - Math.abs(Math.log(a.hr))
        : Math.abs(b.points) - Math.abs(a.points));
    if (!nonzero.length) {
      host.innerHTML = '<li class="contrib-empty">Nothing pushing this yet — move some sliders.</li>';
      return;
    }
    host.innerHTML = nonzero.map((c) => {
      const effect = field === 'hr' ? `mortality ${fmtPctFromHr(c.hr)}` : fmtSigned(c.points);
      return `<li>
        <span class="contrib-effect ${field === 'hr' ? (c.hr < 1 ? 'good' : 'bad') : (c.points > 0 ? 'good' : 'bad')}">${effect}</span>
        <span class="contrib-label">${c.label}</span>
        <a class="contrib-ref" href="#ref-list" title="${c.note}">[${refIndex()[c.source]}]</a>
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
  renderReferences();
  wireEvents();
  update(engine.evaluate(model, state));
})();
