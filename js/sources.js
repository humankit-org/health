/*
 * sources.js — renders the reference list on sources.html.
 *
 * Citation numbers come from engine.sourceIndex, the same function the main
 * page uses, so a "[7]" link on index.html always lands on the same source
 * here (index.html links to sources.html#ref-7).
 */

(function () {
  'use strict';

  const model = globalThis.HEALTH_MODEL;
  const refs = globalThis.HEALTH_ENGINE.sourceIndex(model);
  const tags = globalThis.HEALTH_ENGINE.sourceTags(model);

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

  const versionEl = document.getElementById('model-version');
  if (versionEl) versionEl.textContent = model.meta.version;
})();
