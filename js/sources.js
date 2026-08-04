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
  const refs = engine.sourceIndex(model);
  const tags = engine.sourceTags(model);

  // Short readable name of an input by id (drops parentheticals, mirrors
  // engine.sourceTags' shortLabel). Falls back to the id so a new input
  // never breaks rendering.
  const shortLabel = (s) => {
    const stripped = String(s || '').replace(/\(.*?\)/g, '').trim();
    return stripped || s;
  };
  const inputById = {};
  for (const input of model.inputs) inputById[input.id] = input.label;
  if (model.bmi && model.bmi.label) inputById.bmi = model.bmi.label;
  const inputName = (id) => (inputById[id] ? shortLabel(inputById[id]) : id);

  const refLink = (key) => `<a class="contrib-ref" href="#ref-${refs[key]}" title="Source ${refs[key]}">[${refs[key]}]</a>`;
  const citeKeys = (keys) => (Array.isArray(keys) ? keys : [keys]).map(refLink).join(' ');
  const evBadge = (ev) => `<span class="ev small" data-ev="${ev}">${ev}</span>`;

  const num = (x, d) => Number(x).toFixed(d !== undefined ? d : 2);
  const hr = (c) => `${num(c.hr)} (${num(c.hrLow)}–${num(c.hrHigh)})`;

  const jmById = {};
  for (const jm of model.jointModels || []) jmById[jm.id] = jm;

  // Display title for a joint model — from the data (jm.title), falling back
  // to the cluster name so a new model never breaks. presentation only.
  const jmTitle = (id) => {
    const jm = jmById[id];
    if (!jm) return id;
    return jm.title || (jm.cluster ? jm.cluster + ' cluster' : id);
  };

  // A classifier used on the overlap table and (optionally) joint models.
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

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
            return `<li><code>${inputName(c.input)}</code>${sub} · ≤ ${num(c.max, 0)} pt${c.weight !== 1 ? ' ×' + c.weight : ''}</li>`;
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
      const members = (jm.members || []).map(inputName).join(', ');
      return `<details class="jm-block" open>
        <summary><strong>${esc(jmTitle(jm.id))}</strong>
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
      const a = jmById[o.a] ? jmTitle(o.a) : inputName(o.a);
      const b = jmById[o.b] ? jmTitle(o.b) : inputName(o.b);
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

  const versionEl = document.getElementById('model-version');
  if (versionEl) versionEl.textContent = model.meta.version;
})();