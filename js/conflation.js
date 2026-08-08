/*
 * conflation.js — renders the Conflation explainer page (conflation.html).
 *
 * Reads the assembled ADVANCED model (globalThis.HEALTH_MODEL) + engine +
 * schema and renders:
 *   - the live worked-example boxes in #problem and #math (step 8.4),
 *   - the cluster card grid in #clusters (step 8.5),
 *   - the per-cluster dialogs with the exact per-output math tables
 *     (step 8.6).
 *
 * NO numbers live here: every figure is computed at render time from the
 * model via engine helpers, so the page can never drift from the calculator.
 * The only literals are the illustrative profiles in the worked examples
 * (PLAN.md Phase 8). The table markup intentionally mirrors js/sources.js's
 * components/gradient/gridCells renderers — presentational duplication is a
 * deliberate trade-off (the DATA comes from the model, so it can't drift; a
 * shared module would mean touching the working sources.js page).
 *
 * Page-only script (IIFE like app.js/sources.js); loads LAST on conflation.html.
 */

(function () {
  'use strict';

  const model = globalThis.HEALTH_MODEL;
  const engine = globalThis.HEALTH_ENGINE;
  const schema = globalThis.HEALTH_SCHEMA;
  if (!model || !engine || !schema) return;

  // The naive "before conflation" comparison uses the base SIMPLE model — a
  // plain marginal product. On conflation.html both globals are loaded
  // (js/joint/index.js sets SIMPLE_HEALTH_MODEL); fall back to the advanced
  // model defensively (member marginals equal the simple model's there).
  const simpleModel = globalThis.SIMPLE_HEALTH_MODEL || model;

  const refs = engine.sourceIndex(model);
  const defaults = engine.defaults(model);
  const displayName = schema.displayName;
  const esc = schema.esc;

  // ---------------------------------------------------------------- helpers

  const outTitle = (o) => o[0].toUpperCase() + o.slice(1);
  const num = (x, d) => Number(x).toFixed(d !== undefined ? d : 2);
  const hr = (c) => `${num(c.hr)} (${num(c.hrLow)}–${num(c.hrHigh)})`;
  const riskRead = (hrv) => {
    const p = (hrv - 1) * 100;
    const s = Math.abs(p).toFixed(0);
    if (p < 0) return `${s}% lower`;
    if (p > 0) return `${s}% higher`;
    return 'no change';
  };
  const lead = (s, n) => {
    const parts = String(s).split('. ');
    return parts.slice(0, n).join('. ') + (parts.length > n ? '…' : '');
  };

  const refLink = (key) =>
    `<a class="contrib-ref" href="sources.html#ref-${refs[key]}" title="Source ${refs[key]}">[${refs[key]}]</a>`;
  const citeKeys = (keys) => (Array.isArray(keys) ? keys : [keys]).map(refLink).join(' ');
  const citeText = (keys) => (Array.isArray(keys) ? keys : [keys]).map((k) => `[${refs[k]}]`).join(' ');
  const evBadge = (ev) => `<span class="ev small" data-ev="${ev}">${ev}</span>`;

  // --------------------------------------------------- worked examples (8.4)

  // A joint-model example: the naive member product (SIMPLE model) vs the
  // cluster total normalized to the average person (advanced model), both
  // computed live. The profiles below are the page's only literals.
  const EXAMPLES = [
    {
      jm: 'ekelundTable', out: 'mortality',
      profile: { cardio: 300, steps: 10000, sitting: 5 },
      title: 'Worked example — the movement cluster',
      setup: 'cardio 300 min/wk · steps 10,000/day · sitting 5 h/day',
      takeaway: 'The naive product counts "physical activity" three times. The published PA × sitting table prices it once — the joint number is the honest one.',
    },
    {
      jm: 'dietScore', out: 'mortality',
      profile: { fiber: 40, fruitVeg: 6, nuts: 30, fish: 'lots' },
      title: 'Worked example — the diet cluster',
      setup: 'fiber 40 g/day · fruit & veg 6 servings/day · nuts 30 g/day · fish regularly',
      takeaway: 'Four sliders, one "diet quality" trait. The PURE-style score counts the benefit once instead of four times.',
    },
    {
      jm: 'mommaCells', out: 'mortality',
      profile: { strength: 2, cardio: 300 },
      title: 'Worked example — the aerobic × strength cluster',
      setup: 'strength 2 sessions/wk · cardio 300 min/wk',
      takeaway: 'Strength looks nearly flat on its own, but inside the published aerobic × strength cells it contributes to a genuinely synergistic joint estimate.',
    },
    {
      jm: 'duncanCells', out: 'mortality',
      profile: { sleep: 9.5 },
      title: 'Worked example — the PA × sleep cluster',
      setup: 'sleep 9.5 h/day (long sleep)',
      takeaway: 'Long sleep is the harmful end of the sleep curve; the joint table prices the sleep effect given your activity level instead of using a standalone number.',
    },
    {
      jm: 'mayoCells', out: 'mortality',
      profile: { weightKg: 100 },
      title: 'Worked example — the PA × body weight cluster',
      setup: (prof) => `weight 100 kg → BMI ${num(engine.computeBmi(prof), 1)}`,
      takeaway: 'The joint table lets high activity attenuate (not erase) the weight risk — the naive BMI number alone overstates it.',
    },
  ];

  function naiveProduct(memberIds, out, prof) {
    const r = engine.evaluate(simpleModel, prof);
    const rows = memberIds
      .map((id) => {
        const c = (r.contributions[out] || []).find((x) => x.inputId === id);
        return c ? { id, hrDelta: c.hrDelta } : null;
      })
      .filter(Boolean);
    return { rows, product: rows.reduce((p, x) => p * x.hrDelta, 1) };
  }

  function clusterNorm(id, out, prof) {
    const t = engine.clusterTotals(model, prof).find((x) => x.id === id);
    const a = engine.clusterTotals(model, defaults).find((x) => x.id === id);
    if (!t || !a || !t.outputs || !t.outputs[out] || !a.outputs || !a.outputs[out]) return null;
    return t.outputs[out].hr / a.outputs[out].hr;
  }

  function jointExampleHtml(cfg) {
    const jm = (model.jointModels || []).find((j) => j.id === cfg.jm);
    if (!jm) return '';
    const prof = Object.assign({}, defaults, cfg.profile);
    const naive = naiveProduct(jm.members || [], cfg.out, prof);
    const norm = clusterNorm(cfg.jm, cfg.out, prof);
    if (norm === null) return '';
    const naiveExpr = naive.rows.length > 1
      ? naive.rows.map((r) => num(r.hrDelta, 2)).join(' × ') + ' = ' + num(naive.product, 2)
      : num(naive.product, 2);
    return `<div class="worked-example">
      <h4>${esc(cfg.title)}</h4>
      <p class="we-setup">${esc(typeof cfg.setup === 'function' ? cfg.setup(prof) : cfg.setup)}</p>
      <ul class="we-compare">
        <li><span class="we-label">${naive.rows.length > 1 ? 'Independent sliders' : 'Standalone effect'}</span><code>${esc(naiveExpr)}</code></li>
        <li><span class="we-label">Joint estimate</span><code>${num(norm, 2)} <span class="we-read">(${riskRead(norm)})</span></code></li>
      </ul>
      <p class="we-takeaway">${esc(cfg.takeaway)}</p>
    </div>`;
  }

  // Overlap worked examples. `weak` is the input side that gets discounted at
  // the given profile (input-blended pairs show marginal vs discounted
  // numbers); `clusterSide` pairs land the discount on the cluster total and
  // are described qualitatively; `null` pairs are honest no-ops.
  const OVERLAP_EXAMPLES = [
    {
      pair: ['processedMeat', 'dietScore'],
      profile: { processedMeat: 7, fruitVeg: 0, fiber: 0, nuts: 0, fish: 'none' }, weak: 'processedMeat',
      setup: 'processed meat 7 servings/wk · no fiber, fruit & veg, nuts or fish',
      note: 'Both are harmful and they overlap (a meat-heavy diet tends to be a worse diet overall), so the weaker one — processed meat — is counted at 70% strength.',
    },
    {
      pair: ['ssb', 'dietScore'],
      profile: { ssb: 7, fruitVeg: 0, fiber: 0, nuts: 0, fish: 'none' }, weak: 'ssb',
      setup: 'sugar-sweetened drinks 7/wk · no fiber, fruit & veg, nuts or fish',
      note: 'Both are harmful and they overlap (frequent sugary-drink drinkers tend to have worse diets), so the weaker one — SSBs — is counted at 85% strength.',
    },
    {
      pair: ['magnesium', 'dietScore'],
      profile: { magnesium: 0, fruitVeg: 0, fiber: 0, nuts: 0, fish: 'none' }, weak: 'magnesium',
      setup: 'no magnesium (0 mg/day) · no fiber, fruit & veg, nuts or fish',
      note: "Magnesium's food sources ARE the healthy-diet foods, so the overlap is heavy (ρ 0.5) — the weaker deviation, magnesium, is counted at 50% strength.",
    },
    {
      pair: ['snus', 'alcohol'],
      profile: { snus: 'yes', alcohol: 15 }, weak: 'alcohol',
      setup: 'snus: current user · alcohol 15 drinks/wk',
      note: 'Both are harmful and the snus studies barely adjust for alcohol, so the weaker deviation — alcohol — is counted at 85% strength.',
    },
    {
      pair: ['duncanCells', 'dietScore'],
      profile: { sleep: 9.5, fruitVeg: 0, fiber: 0, nuts: 0, fish: 'none' }, weak: 'duncanCells', clusterSide: true,
      setup: 'sleep 9.5 h/day · no fiber, fruit & veg, nuts or fish',
      note: 'Duncan 2023 does not adjust for diet, so the sleep-cell contribution overlaps the diet score. Here the cluster total is the weaker deviation and receives the discount (ρ 0.1).',
    },
    {
      pair: ['rhr', 'ekelundTable'],
      profile: { rhr: 90, cardio: 0 }, weak: 'ekelundTable', clusterSide: true,
      setup: 'resting heart rate 90 bpm · no cardio',
      note: 'Resting heart rate is a rough mirror of fitness. When the PA × sitting cluster total is the weaker deviation it receives the discount (ρ 0.15); at typically active values the input side (RHR) is the weaker one instead.',
    },
    {
      pair: ['sunExposure', 'ekelundTable'],
      profile: { sunExposure: 0, cardio: 0 }, weak: 'ekelundTable', clusterSide: true,
      setup: 'no sun exposure · no cardio',
      note: 'Exercisers get more sun, so the sun effect overlaps the PA cluster. Here the cluster total is the weaker deviation and receives the discount (ρ 0.1).',
    },
    {
      pair: ['vaping', 'alcohol'],
      profile: { vaping: 'current', alcohol: 15 }, weak: null, null: true,
      setup: 'vaping: current user · alcohol 15 drinks/wk',
      note: 'The vaping effect is a published null (HR 1.00) today — a 1.0 HR has no deviation, so the pair is a no-op. It stays in the model for honest structure and activates automatically if a future vaping estimate turns non-null.',
    },
  ];

  function overlapExampleHtml(o) {
    const cfg = OVERLAP_EXAMPLES.find((e) => e.pair[0] === o.a && e.pair[1] === o.b);
    if (!cfg) return '';
    const prof = Object.assign({}, defaults, cfg.profile);
    if (cfg.null) {
      return `<div class="worked-example">
        <h4>Worked example</h4>
        <p class="we-setup">${esc(cfg.setup)}</p>
        <p class="we-takeaway">${esc(cfg.note)}</p>
      </div>`;
    }
    const ov = engine.activeOverlaps(model, prof).find((e) => e.a === o.a && e.b === o.b);
    const mort = ov && ov.outputs && ov.outputs.mortality;
    if (!(mort && mort.active)) {
      return `<div class="worked-example">
        <h4>Worked example</h4>
        <p class="we-setup">${esc(cfg.setup)}</p>
        <p class="we-takeaway">At this profile no shared deviation fired — the discount is off. Blends only fire when both sides move the same way from their average level.</p>
      </div>`;
    }
    if (cfg.clusterSide) {
      return `<div class="worked-example">
        <h4>Worked example</h4>
        <p class="we-setup">${esc(cfg.setup)}</p>
        <p class="we-takeaway">${esc(cfg.note)}</p>
      </div>`;
    }
    const s = engine.evaluate(simpleModel, prof).contributions.mortality.find((c) => c.inputId === cfg.weak);
    const a = engine.evaluate(model, prof).contributions.mortality.find((c) => c.inputId === cfg.weak);
    if (!s || !a) return '';
    return `<div class="worked-example">
      <h4>Worked example</h4>
      <p class="we-setup">${esc(cfg.setup)}</p>
      <ul class="we-compare">
        <li><span class="we-label">Standalone marginal</span><code>HR ${num(s.hrDelta, 2)}</code></li>
        <li><span class="we-label">Counted at (1−ρ) = ${num(1 - o.rho, 2)}</span><code>HR ${num(a.hrDelta, 2)}</code></li>
      </ul>
      <p class="we-takeaway">${esc(cfg.note)}</p>
    </div>`;
  }

  function renderMathExamples() {
    const ekelund = EXAMPLES.find((e) => e.jm === 'ekelundTable');
    if (ekelund) {
      const html = jointExampleHtml(ekelund);
      const problem = document.getElementById('example-problem');
      const joint = document.getElementById('example-joint');
      if (problem) problem.innerHTML = html;
      if (joint) joint.innerHTML = html;
    }
    const magnesium = (model.overlaps || []).find((o) => o.a === 'magnesium' && o.b === 'dietScore');
    const overlap = document.getElementById('example-overlap');
    if (magnesium && overlap) overlap.innerHTML = overlapExampleHtml(magnesium);
  }

  // -------------------------------------------------------- cluster cards (8.5)

  function jointCard(jm) {
    const members = (jm.members || []).map((m) => esc(displayName(model, m))).join(' · ');
    const outs = Object.keys(jm.outputs || {}).map((o) => `<span class="chip topic">${esc(outTitle(o))}</span>`).join(' ');
    return `<button type="button" class="cluster-card" data-kind="joint" data-id="${esc(jm.id)}">
      <span class="cluster-card-top">
        <span class="cluster-card-title">${esc(displayName(model, jm.id))}</span>
        ${evBadge(jm.evidence)}
      </span>
      <span class="cluster-card-members">${members}</span>
      <span class="cluster-card-outputs">${outs}</span>
      <span class="cluster-card-summary">${jm.note ? esc(lead(jm.note, 2)) : ''}</span>
      <span class="cluster-card-foot">
        <span class="cluster-card-more">How it works →</span>
        <span class="cluster-card-ref">${citeText(jm.source)}</span>
      </span>
    </button>`;
  }

  function overlapCard(o) {
    const pair = `${esc(displayName(model, o.a))} ↔ ${esc(displayName(model, o.b))}`;
    const meta = `ρ ${num(o.rho)} · ${esc((o.kind || 'overlap').replace(/-/g, ' '))}`;
    return `<button type="button" class="cluster-card" data-kind="overlap" data-id="${esc(o.a)}" data-b="${esc(o.b)}">
      <span class="cluster-card-top"><span class="cluster-card-title">${pair}</span></span>
      <span class="cluster-card-meta">${meta}</span>
      <span class="cluster-card-summary">${o.note ? esc(lead(o.note, 2)) : ''}</span>
      <span class="cluster-card-foot">
        <span class="cluster-card-more">How it works →</span>
        <span class="cluster-card-ref">${citeText(o.source)}</span>
      </span>
    </button>`;
  }

  function perLeverCard(g) {
    const members = g.members.map((m) => esc(displayName(model, m))).join(' · ');
    return `<button type="button" class="cluster-card" data-kind="perlever" data-id="${esc(g.cluster)}">
      <span class="cluster-card-top"><span class="cluster-card-title">Psychosocial — per lever only</span></span>
      <span class="cluster-card-members">${members}</span>
      <span class="cluster-card-outputs"><span class="chip topic">happiness</span><span class="chip topic">cognition</span></span>
      <span class="cluster-card-summary">No published study combines these four, and their correlations are too tangled to model — each is shown individually, never combined into a total.</span>
      <span class="cluster-card-foot"><span class="cluster-card-more">How it works →</span></span>
    </button>`;
  }

  function renderClusters() {
    const jointHost = document.getElementById('cluster-grid-joint');
    const overlapHost = document.getElementById('cluster-grid-overlap');
    const perLeverHost = document.getElementById('cluster-grid-perlever');
    if (jointHost) jointHost.innerHTML = (model.jointModels || []).map(jointCard).join('') || '<p class="contrib-empty">No joint models.</p>';
    if (overlapHost) overlapHost.innerHTML = (model.overlaps || []).map(overlapCard).join('') || '<p class="contrib-empty">No overlap pairs.</p>';
    if (perLeverHost) perLeverHost.innerHTML = (model.perLeverOnly || []).map(perLeverCard).join('') || '<p class="contrib-empty">None.</p>';
  }

  // ------------------------------------------------------- dialogs (8.6)

  function gridCells(o, cellGrid) {
    const cols = Math.max.apply(null, cellGrid.map((r) => r.length));
    const g = o.axes || [];
    const shape = g.length
      ? `<p class="jm-axes">${g.map((ax) => `${esc(ax.label)}${ax.unit ? ' (' + esc(ax.unit) + ')' : ''}`).join(' × ')}</p>`
      : '';
    const rows = cellGrid.map((row, i) => {
      const cells = Array.from({ length: cols }, (_, j) => {
        const c = row[j];
        return `<td>${c ? hr(c) : ''}</td>`;
      }).join('');
      return `<tr><th>${g.length ? esc(g[0].bands[i].label) : i}</th>${cells}</tr>`;
    }).join('');
    const head = `<tr><th></th>${(g.length ? g[1].bands : []).map((b) => `<th>${esc(b.label)}</th>`).join('')}</tr>`;
    return `${shape}<table class="jm-tbl cells"><thead>${head}</thead><tbody>${rows}</tbody></table>`;
  }

  function outputSection(jm, out) {
    const o = jm.outputs[out];
    const head = `<h4>Output — ${esc(outTitle(out))}</h4>`;
    const extras = [];
    if (o.ratio) {
      const ax = o.axes[o.ratio.axis];
      const ref = ax.bands[o.ratio.referent].label;
      extras.push(`<p class="jm-note">Ratio mode: the table divides by the “${esc(ax.label)} = ${esc(ref)}” row/column, so the activity main effect — owned by the movement cluster — is priced exactly once and what remains is the interaction.</p>`);
    }
    if (o.interpolate) extras.push(`<p class="jm-note">Values between the band cutoffs are interpolated on the log scale.</p>`);
    if (o.components) {
      const comps = o.components.map((c) => {
        const sub = c.valueOf
          ? ` (${Object.entries(c.valueOf).map(([k, v]) => `${k} → ${v}`).join(', ')})`
          : '';
        return `<li><code>${esc(displayName(model, c.input))}</code>${sub} · ≤ ${num(c.max, 0)} pt${c.weight !== 1 ? ' ×' + c.weight : ''}</li>`;
      }).join('');
      const rows = (o.gradient || []).map((g) => {
        const lo = g.hrLow !== undefined ? `${num(g.hrLow)}–${num(g.hrHigh)}` : '—';
        return `<tr><td>${num(g.max, 0)}</td><td>${num(g.hr)} (${lo})</td></tr>`;
      }).join('');
      return `${head}<h5>Components</h5><ul class="jm-comps">${comps}</ul>
        <h5>Score → HR</h5><table class="jm-tbl"><thead><tr><th>Score</th><th>HR (CI)</th></tr></thead>
        <tbody>${rows}</tbody></table>${extras.join('')}`;
    }
    if (o.grid || o.grids) {
      if (o.grid) return `${head}${gridCells(o, o.grid)}${extras.join('')}`;
      const body = Object.entries(o.grids).map(([key, g]) =>
        `<h5>${key === 'bodyFat' ? 'Body-fat mode' : 'BMI mode'}</h5>${gridCells(o, g)}`).join('');
      return `${head}${body}${extras.join('')}`;
    }
    return `${head}<p class="jm-note">No joint estimate — treated as independent on this output.</p>`;
  }

  function jointDialog(jm) {
    const outs = Object.keys(jm.outputs || {});
    const members = (jm.members || []).map((m) => `<code>${esc(displayName(model, m))}</code>`).join(' · ');
    const readOnly = new Set();
    for (const out of outs) {
      const o = jm.outputs[out];
      for (const ax of (o.axes || [])) for (const p of (ax.inputs || [])) readOnly.add(p);
    }
    for (const m of jm.members || []) readOnly.delete(m);
    const readOnlyTxt = readOnly.size
      ? `<p class="jm-note">It also reads <strong>${[...readOnly].map((p) => esc(displayName(model, p))).join(', ')}</strong> to pick its row/column in the tables below — that input's own effect is still counted by its owning cluster.</p>`
      : '';
    const tables = outs.map((out) => outputSection(jm, out)).join('');
    const cfg = EXAMPLES.find((e) => e.jm === jm.id);
    const example = cfg ? jointExampleHtml(cfg) : '';
    return `
      <p class="dialog-meta">${evBadge(jm.evidence)} ${citeKeys(jm.source)}</p>
      <p class="jm-note">${esc(jm.note)}</p>
      <h4>What feeds it</h4>
      <p>Members — counted as one estimate: ${members}</p>
      ${readOnlyTxt}
      <h4>What it drives</h4>
      <p>${outs.map((o) => `<span class="chip topic">${esc(outTitle(o))}</span>`).join(' ')}</p>
      ${tables}
      ${example}
      <p class="dialog-link"><a href="sources.html#conflation">Raw data table on the method page →</a></p>`;
  }

  function overlapDialog(o) {
    const kind = (o.kind || 'overlap').replace(/-/g, ' ');
    const ex = overlapExampleHtml(o);
    return `
      <p class="dialog-meta">ρ ${num(o.rho)}${o.rhoU !== undefined ? ` · ρU ${num(o.rhoU)}` : ''} · ${esc(kind)} · ${evBadge(o.tier || 'low')} ${citeKeys(o.source)}</p>
      <p class="jm-note">${esc(o.note)}</p>
      <h4>The rule</h4>
      <p>When <strong>both</strong> sides move away from their average level in the <strong>same direction</strong>, the smaller deviation is discounted: in log space the weaker effect is multiplied by (1 − ρ). ρ 0 = independent (no discount); ρ 1 = the same thing (the weaker effect collapses to its average level).</p>
      <div class="formula">excess = ln(HR) − ln(HR at the average level)<br>
      discounted = ln(HR at the average level) + (1 − ρ) × excess</div>
      ${ex}
      <p class="jm-note">ρ is a model parameter, not a published number — its plausible range widens the uncertainty band. Blends only fire when both sides deviate the same way; opposite directions share nothing to discount.</p>
      <p class="dialog-link"><a href="sources.html#conflation">Raw data table on the method page →</a></p>`;
  }

  function perLeverDialog(g) {
    const members = g.members.map((m) => `<code>${esc(displayName(model, m))}</code>`).join(' · ');
    return `
      <p class="dialog-meta">${evBadge('low')}</p>
      <p class="jm-note">No published study combines these four into one number, and their pairwise correlations are too tangled to model — purpose, stress and social connection all pull on each other, so even pairwise discounts would double-count.</p>
      <h4>What happens instead</h4>
      <p>Each slider is shown <strong>per lever — individually</strong> on the calculator (labelled “shown individually”). None of them enter the mortality, cancer or CVD totals; only their weak, correlational points count into the happiness &amp; cognition bands.</p>
      <h4>Members</h4>
      <p>${members}</p>
      <p class="dialog-link"><a href="sources.html#conflation">Full methodology →</a></p>`;
  }

  function buildDialog(kind, id, b) {
    let title = '';
    let body = '';
    if (kind === 'joint') {
      const jm = (model.jointModels || []).find((j) => j.id === id);
      if (jm) { title = displayName(model, jm.id); body = jointDialog(jm); }
    } else if (kind === 'overlap') {
      const o = (model.overlaps || []).find((x) => x.a === id && x.b === b);
      if (o) { title = `${displayName(model, o.a)} ↔ ${displayName(model, o.b)}`; body = overlapDialog(o); }
    } else if (kind === 'perlever') {
      const g = (model.perLeverOnly || []).find((x) => x.cluster === id);
      if (g) { title = 'Psychosocial — per lever only'; body = perLeverDialog(g); }
    }
    if (!body) return;
    const dlg = document.getElementById('cluster-dialog');
    if (!dlg) return;
    const t = document.getElementById('dialog-title');
    const bodyEl = document.getElementById('dialog-body');
    if (t) t.innerHTML = esc(title);
    if (bodyEl) bodyEl.innerHTML = body;
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  }

  let lastCard = null;

  function wireDialogs() {
    const dlg = document.getElementById('cluster-dialog');
    if (!dlg) return;
    document.addEventListener('click', (e) => {
      const card = e.target.closest ? e.target.closest('.cluster-card') : null;
      if (card) {
        lastCard = card;
        const kind = card.getAttribute('data-kind');
        const id = card.getAttribute('data-id');
        const b = card.getAttribute('data-b');
        buildDialog(kind, id, b);
        return;
      }
      if (e.target.closest && e.target.closest('.dialog-close')) { dlg.close(); return; }
      if (e.target === dlg) dlg.close();
    });
    dlg.addEventListener('close', () => { if (lastCard && lastCard.focus) lastCard.focus(); });
  }

  // ------------------------------------------------------------------ boot

  renderMathExamples();
  renderClusters();
  wireDialogs();

  const versionEl = document.getElementById('model-version');
  if (versionEl) versionEl.textContent = model.meta.version;
})();
