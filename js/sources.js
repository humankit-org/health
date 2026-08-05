/*
 * sources.js — renders the reference list on sources.html, plus the
 * conflation tables: joint models (components, gradient, cells) and the
 * overlap pairs (inputs and their ρ discounts).
 *
 * Citation numbers come from engine.sourceIndex, the same function the main
 * page uses, so a "[7]" link on index.html always lands on the same source
 * here (index.html links to sources.html#ref-7).
 */

(function () {
  'use strict';

  const model = globalThis.HEALTH_MODEL;
  const engine = globalThis.HEALTH_ENGINE;
  const schema = globalThis.HEALTH_SCHEMA; // display helpers (single source, js/schema.js)
  const refs = engine.sourceIndex(model);
  const tags = engine.sourceTags(model);

  // Display helpers shared with the main page (single source in js/schema.js):
  // displayName resolves an input OR joint model id to its readable title;
  // esc HTML-escapes.
  const displayName = schema.displayName;
  const esc = schema.esc;

  const refLink = (key) => `<a class="contrib-ref" href="#ref-${refs[key]}" title="Source ${refs[key]}">[${refs[key]}]</a>`;
  const citeKeys = (keys) => (Array.isArray(keys) ? keys : [keys]).map(refLink).join(' ');
  const evBadge = (ev) => `<span class="ev small" data-ev="${ev}">${ev}</span>`;

  const outTitle = (out) => out[0].toUpperCase() + out.slice(1);

  const howText = (out, h) => {
    const title = outTitle(out);
    const gated = h.gated ? ` — only when "${esc(h.gateLabel)}" is on` : '';
    switch (h.how) {
      case 'share':
        return `${title}: counted as part of the ${displayName(model, h.detail)} joint estimate${gated}`;
      case 'marginal':
        return `${title}: counted independently${gated}`;
      case 'overlap':
        return `${title}: discounted ρ ${num(h.rho)} against ${displayName(model, h.detail)}${gated}`;
      case 'per-lever':
        return `${title}: psychosocial — not part of the total${gated}`;
      case 'per-lever-points':
        return `${title}: psychosocial — points count into the band${gated}`;
      case 'via-bmi':
        return `${title}: via the derived BMI${gated}`;
      case 'replaces':
        return `${title}: ${h.detail}${gated}`;
      case 'enables':
        return `${title}: unlocks the ${h.detail}${gated}`;
      case 'no-data':
        return `${title}: no data yet${gated}`;
      default:
        return `${title}: —`;
    }
  };

  const num = (x, d) => Number(x).toFixed(d !== undefined ? d : 2);
  const hr = (c) => `${num(c.hr)} (${num(c.hrLow)}–${num(c.hrHigh)})`;

  function renderJointModels() {
    const host = document.getElementById('jm-list');
    if (!host) return;
    const blocks = (model.jointModels || []).map((jm) => {
      // outputs: name -> { components+gradient | axes+grid/grids }.
      const outputRows = Object.keys(jm.outputs || {}).map((out) => {
        const o = jm.outputs[out];
        const head = `<h5>${out[0].toUpperCase() + out.slice(1)}</h5>`;
        if (o.components) {
          // PURE-style score: component list + gradient.
          const comps = o.components.map((c) => {
            const sub = c.valueOf
              ? ` (${Object.entries(c.valueOf).map(([k, v]) => `${k} → ${v}`).join(', ')})`
              : '';
            return `<li><code>${displayName(model, c.input)}</code>${sub} · ≤ ${num(c.max, 0)} pt${c.weight !== 1 ? ' ×' + c.weight : ''}</li>`;
          }).join('');
          const rows = (o.gradient || []).map((g) => {
            const lo = g.hrLow !== undefined ? `${num(g.hrLow)}–${num(g.hrHigh)}` : '—';
            return `<tr><td>${num(g.max, 0)}</td><td>${num(g.hr)} (${lo})</td></tr>`;
          }).join('');
          return `${head}<h4>Components</h4><ul class="jm-comps">${comps}</ul>
            <h4>Score → HR</h4><table class="jm-tbl"><thead><tr><th>Score</th><th>HR (CI)</th></tr></thead>
            <tbody>${rows}</tbody></table>`;
        }
        if (o.grid || o.grids) {
          if (o.grid) return `${head}${gridCells(o, o.grid)}`;
          // mayoCells stores a grids map (bmi / bodyFat) with a chooser fn.
          const body = Object.entries(o.grids).map(([key, g]) =>
            `<h4>${key === 'bodyFat' ? 'body-fat' : 'BMI'} mode</h4>${gridCells(o, g)}`).join('');
          return `${head}${body}`;
        }
        return `${head}<p>No joint estimate — treated as independent.</p>`;
      }).join('');
      const members = (jm.members || []).map((m) => displayName(model, m)).join(', ');
      return `<details class="jm-block" open>
        <summary><strong>${esc(displayName(model, jm.id))}</strong>
          — ${esc(members)}
          ${evBadge(jm.evidence)}
          ${citeKeys(jm.source)}</summary>
        <p class="jm-note">${esc(jm.note)}</p>
        ${outputRows}
      </details>`;
    }).join('');
    host.innerHTML = blocks || '<p>No joint models.</p>';
  }

  function gridCells(o, cellGrid) {
    const cols = Math.max.apply(null, cellGrid.map((r) => r.length));
    const g = o.axes || [];
    const shape = g.length
      ? `<p class="jm-axes">${g.map((ax) => `${esc(ax.label)}${ax.unit ? ' (' + esc(ax.unit) + ')' : ''}`).join(' × ')}</p>`
      : '';
    // Compress each cell to 2 sig figs for a readable table.
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

  function renderOverlaps() {
    const body = document.querySelector('#overlap-list tbody');
    if (!body) return;
    const rows = (model.overlaps || []).map((o) => {
      const a = displayName(model, o.a);
      const b = displayName(model, o.b);
      const note = o.note ? ` <span class="jm-note">— ${esc(o.note)}</span>` : '';
      return `<tr>
        <td><code>${esc(a)}</code> ↔ <code>${esc(b)}</code>${note}</td>
        <td>ρ ${num(o.rho)}${o.rhoU !== undefined ? ` <span class="rho-small">(ρU ${num(o.rhoU)})</span>` : ''}</td>
        <td>${evBadge(o.tier || 'low')} <span class="classif">${esc((o.kind || 'overlap').replace(/-/g, ' '))}</span></td>
        <td>${citeKeys(o.source)}</td>
      </tr>`;
    }).join('');
    body.innerHTML = rows || '<tr><td colspan="4">No overlap pairs.</td></tr>';
  }

  function renderInputTable() {
    const body = document.querySelector('#input-transparency tbody');
    if (!body) return;
    const OUTS = engine.OUTPUTS || ['mortality', 'cancer', 'cvd', 'cognition', 'happiness'];
    const rows = engine.inputDisclosure(model).map((r) => {
      const feeds = OUTS.filter((out) => {
        const h = r.hows[out];
        return h && h.how !== 'none' && h.how !== 'no-data';
      });
      const hows = OUTS.map((out) => {
        const h = r.hows[out];
        return h ? `<li>${howText(out, h)}</li>` : '';
      }).join('');
      const evidence = [];
      for (const out of OUTS) {
        const h = r.hows[out];
        if (h && h.evidence && !evidence.includes(h.evidence)) evidence.push(h.evidence);
      }
      const evCells = evidence.map(evBadge).join(' ') || '—';
      return `<tr>
        <td><strong>${esc(displayName(model, r.id))}</strong><br><span class="group-sub">${esc(r.group || '')}</span></td>
        <td>${feeds.map((o) => esc(outTitle(o))).join(', ') || '—'}</td>
        <td><ul class="how-list">${hows}</ul></td>
        <td>${evCells}</td>
        <td>${citeKeys(r.sources)}</td>
      </tr>`;
    }).join('');
    body.innerHTML = rows || '<tr><td colspan="5">No inputs.</td></tr>';
  }

  const items = Object.entries(refs)
    .sort((a, b) => a[1] - b[1])
    .map(([key, n]) => {
      const s = model.sources[key];
      const pmid = s.pmid ? ` · <a href="https://pubmed.ncbi.nlm.nih.gov/${s.pmid}/">PubMed</a>` : '';
      const chips = (tags[key] || [])
        .map((t) => `<span class="chip topic" title="Relates to: ${t}">${t}</span>`)
        .join('');
      const tagRow = chips ? `<span class="ref-tags">${chips}</span>` : '';
      return `<li id="ref-${n}" value="${n}">${s.authors} (${s.year}). <em>${s.title}</em>. ${s.journal}.
        <a href="${s.url}">DOI</a>${pmid}${tagRow}</li>`;
    });
  document.getElementById('ref-list').innerHTML = items.join('');

  renderJointModels();
  renderOverlaps();
  renderInputTable();

  // 4.5.4 — tie the main page's disclosures to these tables (same engine
  // data, drift-proof). Also the intro of the per-input table (4.5.7).
  const tie = document.getElementById('conflation-tie');
  if (tie) tie.textContent =
    'Every chip and More-row on the calculator gets its overlap discount and its joint-model share from the tables below — the main page and this page read the same data.';

  const versionEl = document.getElementById('model-version');
  if (versionEl) versionEl.textContent = model.meta.version;
})();