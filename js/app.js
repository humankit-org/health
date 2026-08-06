/*
 * app.js — DOM rendering and wiring. All computation lives in engine.js;
 * all numbers live in factors.js. This file only draws them.
 *
 * Privacy: state is held in a plain in-memory object. Nothing is persisted,
 * logged, or transmitted. There is no analytics in this project.
 *
 * MODE CONVENTION (Phase 5.5, see AGENTS.md): this page is an ADVANCED-mode
 * surface. The Simple/Advanced toggle (id="mode-toggle") swaps the model
 * object passed to engine.evaluate (advanced = globalThis.HEALTH_MODEL,
 * simple = globalThis.SIMPLE_HEALTH_MODEL) — slider values carry across, refs
 * stay the advanced numbering, and every conflation disclosure renders from
 * engine tags that only exist when the conflation structures are non-empty.
 * Any NEW UI that explains HOW inputs combine (cluster notes, per-lever
 * labels, overlap tags, bounds display) is an advanced-mode feature: gate it
 * on `mode === 'advanced'` or on the engine tags; simple mode stays the flat
 * naive-independence look.
 */

(function () {
  "use strict";

  const model = globalThis.HEALTH_MODEL;
  const simpleModel = globalThis.SIMPLE_HEALTH_MODEL;
  const engine = globalThis.HEALTH_ENGINE;
  const schema = globalThis.HEALTH_SCHEMA; // output ids + display helpers (single source, js/schema.js)
  const state = engine.defaults(model);
  const refs = engine.sourceIndex(model); // shared citation numbering (sources.html uses the same)

  // Two-mode model (Phase 5.5): `model` (advanced) drives one-time data-derived
  // structures (GROUPS, conflationInputs, jmById, renderInputs) — the inputs
  // are identical in both modes. `activeModel` is the object `evaluate` runs,
  // swapped by the toggle WITHOUT resetting `state` (slider values carry
  // across). `refs` stays the advanced numbering so chip [n] links never
  // renumber. The engine is a superset: on `simpleModel` (no conflation keys)
  // it degrades to plain marginal multiplication, so every disclosure renders
  // from engine tags and needs zero mode branches here — only the copy that is
  // itself a conflation claim (cluster notes / More-panel note) is gated on
  // mode. Default = Advanced (the honest one).
  let activeModel = model;
  let mode = "advanced";

  const GROUPS = [
    { id: "you", title: "About you" },
    { id: "movement", title: "Movement" },
    { id: "diet", title: "Diet" },
    { id: "substances", title: "Substances" },
    { id: "mind", title: "Recovery & mind" },
    { id: "extras", title: "Extras" },
    { id: "environment", title: "Environment" },
    { id: "advanced", title: "Advanced — if you've measured these" },
  ];

  const EVIDENCE_TITLE = {
    high: "High confidence: large, consistent meta-analyses / pooled cohorts (still mostly observational).",
    moderate:
      "Moderate confidence: meta-analytic but heterogeneous, small trials, or approximate conversions.",
    low: "Low confidence: single cohorts, cross-sectional or indirect evidence. Directionally suggestive only.",
  };

  // -------------------------------------------------- conflation disclosure
  // Per-slider / per-lever notes generated from the engine's tags — the same
  // fields the conflation table on sources.html renders (overlaps + joint
  // models), so the copy can never drift from the data.
  // Label helpers live in js/schema.js — single source shared with
  // sources.js and the engine (see HEALTH_SCHEMA.displayName/esc).
  const displayName = (id) => schema.displayName(model, id);
  const esc = schema.esc;
  const blendPct = (rho) => Math.max(0, Math.round((1 - Number(rho)) * 100));

  // Card-level cluster notes (4.5.2). When a joint model covers an output,
  // its members are counted as ONE published estimate — the product of their
  // chips would double-count. activeJoint() returns each cluster's calibrated
  // total per covered output; dividing by the same total at the average
  // profile (clusterTotals at defaults) puts it on the "vs the average
  // person" scale the card and chips already use (1.0 = average).
  const { jmById } = schema.conflationGroups(model);
  const avgClusters = new Map(
    engine
      .clusterTotals(model, engine.defaults(model))
      .map((c) => [c.id, c.outputs]),
  );
  const clusterNote = (t, outputId) => {
    const jm = jmById.get(t.id);
    if (!jm) return "";
    const o = t.outputs[outputId];
    const avgOut = avgClusters.get(t.id) && avgClusters.get(t.id)[outputId];
    if (!o || !o.hr || !avgOut || !avgOut.hr) return "";
    const scale = avgOut.hr;
    const members = (jm.members || []).map(displayName).join(" + ");
    const title = displayName(t.id);
    return `<p class="cluster-note" title="These ${members} share a causal pathway, so the model prices them from one published study instead of multiplying each slider's effect separately.">
      <strong>${esc(members)} are counted as ONE joint estimate</strong>
      (${esc(title)} ${refLink(jm.source)}): combined effect
      ${(o.hr / scale).toFixed(3)} (range ${(o.hrLow / scale).toFixed(3)}–${(o.hrHigh / scale).toFixed(3)}).
      Each slider's chip still shows its independent effect; multiplying those
      chips together would double-count the shared pathway — the combined
      effect above prices it once.</p>`;
  };
  const updateClusterNotes = (active) => {
    for (const outputId of schema.HR_OUTPUTS) {
      const host = document.getElementById("cluster-note-" + outputId);
      if (!host) continue;
      host.innerHTML = active
        .filter((t) => t.outputs[outputId])
        .map((t) => clusterNote(t, outputId))
        .join("");
    }
  };

  // More-panel header note + output-grid footer link (4.5.3): one shared note
  // ("already adjusted for overlaps…") shown in every contrib panel, and a
  // link to sources.html#conflation from the output grid — both only while a
  // conflation adjustment is actually live. The trigger is "any
  // conflation-relevant input (a joint-model member, overlap member or
  // per-lever member) moved off its default" — false at reset by construction.
  // It is NOT driven by engine.activeOverlaps(): the overlap blend runs on raw
  // marginals, so some inputs report as blended even at all-defaults (e.g. the
  // magnesium/dietScore pair — magnesium's raw marginal at its average intake
  // is 0.969), which would light the note up at reset. The cluster notes above
  // use the same member-off-default semantics (engine.activeJoint), so the two
  // disclosures stay in sync. Copy is output-agnostic so it stays true on the
  // points panels (cognition/happiness) as well as the HR cards.
  const conflationInputs = new Set();
  for (const jm of model.jointModels || [])
    for (const m of jm.members || []) conflationInputs.add(m);
  for (const o of model.overlaps || []) {
    conflationInputs.add(o.a);
    conflationInputs.add(o.b);
  }
  for (const g of model.perLeverOnly || [])
    for (const m of g.members || []) conflationInputs.add(m);
  const defaultById = {};
  for (const input of model.inputs) defaultById[input.id] = input.default;
  const conflationActive = () => {
    for (const id of conflationInputs) {
      if (defaultById[id] === undefined) continue; // joint-model / derived-bmi ids
      if (state[id] !== defaultById[id]) return true;
    }
    return false;
  };
  const updateMoreNotes = (on) => {
    const note = on
      ? `The values below already account for overlapping effects: joint-model members are shares of one published estimate, overlap pairs are counted at partial strength, and psychosocial factors are shown per lever only. <a href="sources.html#conflation">Full breakdown: how inputs are combined →</a>`
      : "";
    for (const outputId of schema.OUTPUTS) {
      const host = document.getElementById("confl-more-" + outputId);
      if (host) host.innerHTML = note;
    }
    const foot = document.getElementById("confl-foot");
    if (foot)
      foot.innerHTML = on
        ? '<a href="sources.html#conflation">How these inputs are combined (overlaps &amp; joint estimates) →</a>'
        : "";
  };

  // "counted at X% — overlaps Y"; only present on the weaker side of an
  // active overlap pair (engine sets c.overlapBlend).
  const overlapNote = (c) => {
    const b = c.overlapBlend;
    if (!b) return "";
    const other = displayName(b.pair);
    return {
      pct: blendPct(b.rho),
      other,
      title: `Overlaps ${other} — its effect is shared, so the weaker one is counted at ${blendPct(b.rho)}% instead of being added in full.`,
    };
  };
  // "counted with the … joint model" — the input's marginal is replaced by
  // its cluster's published joint estimate (never multiplied separately).
  const jointNote = (c) => {
    if (!c.viaJoint) return "";
    const name = displayName(c.viaJoint);
    return {
      name,
      title: `Counted via the published ${name} joint model — this slider does not get multiplied separately.`,
    };
  };

  // Chip footnotes: "counted at 70% — overlaps cardio" (blend) and "counted
  // via the PURE diet-score joint model" — the disclosure copy for a single
  // contribution. psychosocial per-lever chips get their own tag in updateChips.
  const chipTags = (c) => {
    const ov = overlapNote(c);
    const jn = jointNote(c);
    const parts = [];
    if (jn)
      parts.push(
        `<span class="confl-tag" title="${esc(jn.title)}">via ${esc(jn.name)}</span>`,
      );
    if (ov)
      parts.push(
        `<span class="confl-tag" title="${esc(ov.title)}">counted at ${ov.pct}% — overlaps ${esc(ov.other)}</span>`,
      );
    return parts.join(" ");
  };

  // ------------------------------------------------------------- rendering

  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function renderInputs() {
    const host = document.getElementById("inputs");
    for (const group of GROUPS) {
      const primary = model.inputs.filter(
        (i) => i.group === group.id && !i.extra,
      );
      const extra = model.inputs.filter((i) => i.group === group.id && i.extra);
      if (!primary.length && !extra.length) continue;
      const section = el(
        `<section class="group"><h2>${group.title}</h2></section>`,
      );
      for (const input of primary) section.appendChild(renderInput(input));
      if (extra.length) {
        const details = el(`<details class="advanced-toggle">
        <summary>More inputs</summary>`);
        for (const input of extra) details.appendChild(renderInput(input));
        section.appendChild(details);
      }
      if (group.id === "you") {
        const bmi = el(
          '<div class="bmi-readout" id="bmi-readout" aria-live="polite"></div>',
        );
        section.appendChild(bmi);
      }
      host.appendChild(section);
    }
  }

  function renderInput(input) {
    const card = el(`<div class="input" id="card-${input.id}"></div>`);
    if (input.gatedBy) card.classList.add("gated");
    card.dataset.gate = input.gatedBy || "";
    let control = "";
    if (input.kind === "slider") {
      control = `
        <div class="input-head">
          <label for="in-${input.id}">${input.label}</label>
          <output class="input-value" id="val-${input.id}"></output>
        </div>
        <input type="range" id="in-${input.id}" data-id="${input.id}"
               min="${input.min}" max="${input.max}" step="${input.step}" value="${input.default}"
               aria-describedby="hint-${input.id}">`;
    } else if (input.kind === "segmented") {
      const opts = input.options
        .map(
          (o) => `
        <label class="seg-option">
          <input type="radio" name="in-${input.id}" data-id="${input.id}" value="${o.value}"
                 ${o.value === input.default ? "checked" : ""}>
          <span>${o.label}</span>
        </label>`,
        )
        .join("");
      control = `
        <div class="input-head"><span class="input-label">${input.label}</span></div>
        <div class="segmented" role="radiogroup" aria-label="${input.label}">${opts}</div>`;
    } else if (input.kind === "toggle") {
      control = `
        <div class="input-head toggle-head">
          <label for="in-${input.id}">${input.label}</label>
          <label class="switch">
            <input type="checkbox" id="in-${input.id}" data-id="${input.id}" ${input.default ? "checked" : ""}>
            <span class="switch-track" aria-hidden="true"></span>
          </label>
        </div>`;
    }
    card.innerHTML = `${control}
      <p class="input-hint" id="hint-${input.id}">${input.hint || ""}</p>
      <div class="chips" id="chips-${input.id}"></div>`;
    return card;
  }

  function renderOutputs() {
    const host = document.getElementById("outputs");
    const tpl = document.getElementById("outputs-template");
    host.innerHTML = "";
    host.appendChild(tpl.content.cloneNode(true));
    for (const output of model.outputs) {
      const card = host.querySelector("#out-" + output.id);
      const blurb = card && card.querySelector(".output-blurb");
      if (blurb) blurb.textContent = output.blurb;
    }
    host.querySelectorAll(".ev").forEach((badge) => {
      badge.title = EVIDENCE_TITLE[badge.dataset.ev];
    });
  }

  // ------------------------------------------------------------- formatting

  function fmtSigned(x, digits = 1) {
    return (x > 0 ? "+" : x < 0 ? "−" : "±") + Math.abs(x).toFixed(digits);
  }

  function fmtPctFromHr(hr) {
    const pct = Math.round((1 - hr) * 100);
    if (pct > 0) return "−" + pct + "%";
    if (pct < 0) return "+" + Math.abs(pct) + "%";
    return "±0%";
  }

  function refLink(sourceKeys) {
    const keys = Array.isArray(sourceKeys) ? sourceKeys : [sourceKeys];
    return keys
      .map((key) => {
        const n = refs[key];
        return `<a class="chip-ref" href="sources.html#ref-${n}">[${n}]</a>`;
      })
      .join(" ");
  }

  // ------------------------------------------------------------- updating

  function update(result) {
    const activeClusters = engine.activeJoint(activeModel, state);
    updateInputReadouts(result);
    updateChips(result);
    updateClusterNotes(activeClusters);
    updateMoreNotes(mode === "advanced" && conflationActive());
    updateLifeExpectancy(result);
    updateMortality(result);
    updateCancer(result);
    updateCvd(result);
    updateBand("cognition", result.scores.cognition);
    updateBand("happiness", result.scores.happiness);
    updateContrib(
      "mortality",
      result.contributions.mortality,
      "hr",
      activeClusters,
    );
    updateContrib("cancer", result.contributions.cancer, "hr", activeClusters);
    updateContrib("cvd", result.contributions.cvd, "hr", activeClusters);
    updateContrib("cognition", result.contributions.cognition, "points");
    updateContrib("happiness", result.contributions.happiness, "points");
    updateFindings(result.findings);
    updateGates();
  }

  // Dim advanced inputs whose enabling toggle is off.
  function updateGates() {
    document.querySelectorAll(".input.gated").forEach((card) => {
      const gate = card.dataset.gate;
      const open = !!state[gate];
      card.classList.toggle("gate-closed", !open);
      const slider = card.querySelector('input[type="range"]');
      if (slider) slider.disabled = !open;
    });
  }

  function updateFindings(findings) {
    const host = document.getElementById("findings-list");
    if (!findings.length) {
      host.innerHTML =
        '<li class="findings-empty">Nothing yet — findings appear here as your inputs match sourced effects.</li>';
      return;
    }
    const ICON = { good: "↓", bad: "↑", neutral: "↔" };
    host.innerHTML = findings
      .map(
        (f) => `
      <li class="finding ${f.dir}">
        <span class="finding-icon" aria-hidden="true">${ICON[f.dir] || "±"}</span>
        <span class="finding-text">${f.text}</span>
        <span class="finding-meta">${f.input} ${refLink(f.source)}</span>
      </li>`,
      )
      .join("");
  }

  function updateInputReadouts(result) {
    for (const input of model.inputs) {
      if (input.kind !== "slider") continue;
      const out = document.getElementById("val-" + input.id);
      if (out) out.textContent = `${result.values[input.id]} ${input.unit}`;
    }
    const bmi = document.getElementById("bmi-readout");
    if (bmi && result.bmi) {
      const contrib = result.contributions.mortality.find(
        (c) => c.inputId === "bmi",
      );
      if (contrib) {
        bmi.innerHTML = `→ BMI ${result.bmi.toFixed(1)} (mortality ${fmtPctFromHr(contrib.hrDelta)} ${refLink(contrib.source)})`;
      } else if (state.bodyFatOn) {
        bmi.innerHTML = `→ BMI ${result.bmi.toFixed(1)} (not used — measured body fat % supplied instead)`;
      } else {
        // The bmi marginal retires when the PA×adiposity cluster covers
        // mortality (mayoCells) — the cluster total carries the weight
        // effect together with activity.
        bmi.innerHTML = `→ BMI ${result.bmi.toFixed(1)} (counted together with activity via the PA×adiposity cluster ${refLink("sanchezlastra2021")})`;
      }
    }
  }

  // HR chip content (4.6.1). A joint-model member's chip drops the flat %
  // in favour of a direction arrow + the cluster name in parens — the
  // cluster total (not this marginal) is what the card prices, so a lone %
  // would mislead. Non-members keep today's flat % + confl tags. Driven by
  // the engine's `viaJoint` tag, which only exists when jointModels are
  // non-empty — simple mode renders the flat form with zero branches here.
  const hrChip = (c, which) => {
    const lever = c.perLever ? " chip-lever" : "";
    const title = c.perLever
      ? `Psychosocial: no reliable way to combine these yet — shown individually. It does NOT count into the ${which} total. ${c.note}`
      : c.note;
    const base = `<span class="chip ${c.hrDelta < 1 ? "good" : "bad"}${lever}" title="${esc(title)}">`;
    const leverTag = c.perLever
      ? ' <span class="chip-lever-tag" title="Not counted into the card total — psychosocial factors can\'t be combined yet, so this is shown per slider only.">(shown individually)</span>'
      : "";
    if (c.viaJoint) {
      const arrow = c.hrDelta < 1 ? "↓" : "↑";
      return `${base}${which} ${arrow} <span class="chip-group">(${esc(displayName(c.viaJoint))})</span> ${refLink(c.source)}${leverTag}</span>`;
    }
    return `${base}${which} ${fmtPctFromHr(c.hrDelta)} ${refLink(c.source)}${leverTag}${chipTags(c)}</span>`;
  };

  function updateChips(result) {
    for (const input of model.inputs) {
      const host = document.getElementById("chips-" + input.id);
      if (!host) continue;
      const mine = schema.OUTPUTS.map((o) => result.contributions[o])
        .flat()
        .filter((c) => c.inputId === input.id);
      const chips = [];
      for (const c of mine) {
        if (c.hrDelta !== undefined && Math.abs(c.hrDelta - 1) > 0.005) {
          const which = result.contributions.cancer.includes(c)
            ? "cancer"
            : result.contributions.cvd.includes(c)
              ? "cvd"
              : "mortality";
          chips.push(hrChip(c, which));
        }
        if (c.pointsDelta !== undefined && Math.abs(c.pointsDelta) > 0.001) {
          const out = result.contributions.cognition.includes(c)
            ? "cognition"
            : "happiness";
          const lever = c.perLever ? " chip-lever" : "";
          const title = c.perLever
            ? `Psychosocial: no reliable way to combine these yet — shown individually. Points still count into the ${out} band. ${c.note}`
            : c.note;
          chips.push(
            `<span class="chip ${c.pointsDelta > 0 ? "good" : "bad"}${lever}" title="${esc(title)}">${out} ${fmtSigned(c.pointsDelta)} ${refLink(c.source)}${c.perLever ? ' <span class="chip-lever-tag">(shown individually)</span>' : ""}${chipTags(c)}</span>`,
          );
        }
      }
      host.innerHTML = chips.join("");
    }
  }

  function updateLifeExpectancy(result) {
    const le = result.lifeExpectancy;
    document.getElementById("le-estimate").textContent = le.estimate.toFixed(1);
    const delta = le.delta;
    document.getElementById("le-delta").innerHTML =
      `${fmtSigned(delta)} years vs. baseline ${le.baseline.toFixed(1)}` +
      (result.mortality.clamped
        ? ' <span class="clamp-note" title="Combined effects overlap, so the model refuses to overclaim. See methodology.">(capped)</span>'
        : "");
    document.getElementById("le-range").textContent =
      `plausible range ${le.low.toFixed(1)}–${le.high.toFixed(1)}`;
  }

  // Log-scale gauge updater shared by the mortality and cancer cards.
  function updateHrCard(ids, hrAvg, hrAvgLow, hrAvgHigh, subText) {
    document.getElementById(ids.estimate).textContent = hrAvg.toFixed(2);
    document.getElementById(ids.sub).textContent = subText;
    const lo = Math.log(0.3),
      hi = Math.log(3.0);
    const pos = (x) =>
      Math.min(100, Math.max(0, ((Math.log(x) - lo) / (hi - lo)) * 100));
    document.querySelector("#" + ids.gauge + " .gauge-ref").style.left =
      pos(1) + "%";
    document.getElementById(ids.marker).style.left = pos(hrAvg) + "%";
    const band = document.getElementById(ids.band);
    band.style.left = pos(hrAvgLow) + "%";
    band.style.width = pos(hrAvgHigh) - pos(hrAvgLow) + "%";
    document
      .getElementById(ids.gauge)
      .setAttribute(
        "aria-label",
        `Hazard ratio ${hrAvg.toFixed(2)} vs average, range ${hrAvgLow.toFixed(2)} to ${hrAvgHigh.toFixed(2)}`,
      );
  }

  function updateMortality(result) {
    const m = result.mortality;
    updateHrCard(
      {
        estimate: "hr-estimate",
        sub: "hr-sub",
        gauge: "hr-gauge",
        marker: "hr-marker",
        band: "hr-band",
      },
      m.hrAvg,
      m.hrAvgLow,
      m.hrAvgHigh,
      `${fmtPctFromHr(m.hrAvg)} · plausible range ${m.hrAvgLow.toFixed(2)}–${m.hrAvgHigh.toFixed(2)}`,
    );
  }

  function updateCancer(result) {
    const c = result.cancer;
    updateHrCard(
      {
        estimate: "cancer-estimate",
        sub: "cancer-sub",
        gauge: "cancer-gauge",
        marker: "cancer-marker",
        band: "cancer-band",
      },
      c.hrAvg,
      c.hrAvgLow,
      c.hrAvgHigh,
      `${fmtPctFromHr(c.hrAvg)} · plausible range ${c.hrAvgLow.toFixed(2)}–${c.hrAvgHigh.toFixed(2)}`,
    );
    const cancerCoverage = document.getElementById("cancer-coverage");
    if (c.noData.length) {
      cancerCoverage.textContent =
        "No cancer-specific data yet for: " +
        c.noData.join(", ") +
        " — those still count in all-cause mortality above.";
      cancerCoverage.style.display = "";
    } else {
      cancerCoverage.style.display = "none";
    }
  }

  function updateCvd(result) {
    const c = result.cvd;
    updateHrCard(
      {
        estimate: "cvd-estimate",
        sub: "cvd-sub",
        gauge: "cvd-gauge",
        marker: "cvd-marker",
        band: "cvd-band",
      },
      c.hrAvg,
      c.hrAvgLow,
      c.hrAvgHigh,
      `${fmtPctFromHr(c.hrAvg)} · plausible range ${c.hrAvgLow.toFixed(2)}–${c.hrAvgHigh.toFixed(2)}`,
    );
    const cvdCoverage = document.getElementById("cvd-coverage");
    if (c.noData.length) {
      cvdCoverage.textContent =
        "No CVD-specific data yet for: " +
        c.noData.join(", ") +
        " — those still count in all-cause mortality above.";
      cvdCoverage.style.display = "";
    } else {
      cvdCoverage.style.display = "none";
    }
  }

  function updateBand(id, score) {
    // Map points vs the average person (-3..+3) to marker position. Marker
    // width = engine-computed fuzz: wider when contributing evidence is shakier.
    const p = Math.min(3, Math.max(-3, score.relPoints));
    const pct = ((p + 3) / 6) * 100;
    const fuzz = ((score.fuzz || 0.5) / 6) * 100;
    const marker = document.getElementById("marker-" + id);
    marker.style.left = `calc(${pct}% - ${fuzz}%)`;
    marker.style.width = fuzz * 2 + "%";
    document.getElementById("band-" + id).textContent = `${score.label}`;
    document
      .getElementById("meter-" + id)
      .setAttribute("aria-label", score.label);
  }

  // Citation anchors for one contribution (source is a single key or array).
  const citeLinks = (c) => {
    const keys = Array.isArray(c.source) ? c.source : [c.source];
    return keys
      .map(
        (key) =>
          `<a class="contrib-ref" href="sources.html#ref-${refs[key]}" title="${c.note}">[${refs[key]}]</a>`,
      )
      .join(" ");
  };

  // Conflation disclosure notes for one contribution row: overlap blend
  // ("counted at X% — overlaps Y"), joint-model membership ("counted via …"),
  // and psychosocial per-lever exclusions. Same copy as the chips + the
  // sources.html table, generated from the same engine tags. 4.6.5: only the
  // mind panels (cognition/happiness) still use these inline — the HR cards'
  // More rows dropped them in favour of the grouped cluster list.
  const contribNotes = (c, outputId, field) => {
    const ov = overlapNote(c);
    const jn = jointNote(c);
    const conflNote = ov
      ? `<span class="contrib-lever" title="${esc(ov.title)}">counted at ${ov.pct}% — overlaps ${esc(ov.other)}</span>`
      : jn
        ? `<span class="contrib-lever" title="${esc(jn.title)}">counted via ${esc(jn.name)}</span>`
        : "";
    const leverNote =
      c.perLever && field === "hr"
        ? `<span class="contrib-lever" title="Psychosocial: no reliable way to combine these yet — the research can't separate this effect from the other factors on this card, so it is shown individually and is NOT counted into the ${outputId} total.">psychosocial — shown individually, not in the total</span>`
        : c.perLever
          ? `<span class="contrib-lever" title="Psychosocial: no reliable way to combine these yet — shown individually. Points from these sliders still count into this band.">psychosocial — points only</span>`
          : conflNote;
    return { conflNote, leverNote };
  };

  // One More-row (4.6.4): effect + label + citation + evidence badge. Inline
  // conflation tags render ONLY on the mind panels (field === 'points'); the
  // HR cards replace them with the grouped cluster list below.
  const contribRow = (c, outputId, field) => {
    const effect =
      field === "hr"
        ? `${outputId} ${fmtPctFromHr(c.hrDelta)}`
        : fmtSigned(c.pointsDelta);
    const dir =
      field === "hr"
        ? c.hrDelta < 1
          ? "good"
          : "bad"
        : c.pointsDelta > 0
          ? "good"
          : "bad";
    const { conflNote, leverNote } =
      field === "points"
        ? contribNotes(c, outputId, field)
        : { conflNote: "", leverNote: "" };
    return `<li>
      <span class="contrib-effect ${dir}">${effect}</span>
      <span class="contrib-label">${c.label}</span>
      ${citeLinks(c)}
      <span class="ev small" data-ev="${c.evidence}" title="${EVIDENCE_TITLE[c.evidence]}">${c.evidence}</span>
      ${conflNote}
      ${leverNote}
    </li>`;
  };

  // Grouped HR More list (4.6.4): cluster groups first (each expands to its
  // member rows), then the unclustered inputs flat. A group header shows the
  // cluster's COMBINED % — normalized to the average person via avgClusters,
  // the same math as the 4.5.2 cluster note — because that total (not the
  // members' marginals) is what the card prices. Grouping is driven by the
  // engine's `viaJoint` tag, which only exists when jointModels are non-empty,
  // so simple mode falls straight through to the flat list (zero branch code).
  // activeJoint(model, state) is empty on the base model, so the grouped path
  // is also gated implicitly. `viaJoint` is only set on records for outputs
  // the cluster actually covers (engine.js mark()), so a group's members are
  // always meaningful for the current card.
  const groupedContribRows = (outputId, nonzero, activeClusters, field) => {
    const groups = new Map(); // cluster id -> { ratio, members }
    const unclustered = [];
    for (const c of nonzero) {
      if (c.viaJoint) {
        let g = groups.get(c.viaJoint);
        if (!g) {
          const t = activeClusters.find((x) => x.id === c.viaJoint);
          const avgOut =
            avgClusters.get(c.viaJoint) &&
            avgClusters.get(c.viaJoint)[outputId];
          const ratio =
            t && t.outputs[outputId] && avgOut && avgOut.hr
              ? t.outputs[outputId].hr / avgOut.hr
              : null;
          g = { ratio, members: [] };
          groups.set(c.viaJoint, g);
        }
        g.members.push(c);
      } else {
        unclustered.push(c);
      }
    }
    const byMagnitude = (a, b) => Math.abs(Math.log(b)) - Math.abs(Math.log(a));
    const clusterList = [];
    for (const [id, g] of groups) {
      if (g.ratio === null) continue; // cluster doesn't cover this card (defensive)
      clusterList.push({ id, ratio: g.ratio, members: g.members });
    }
    clusterList.sort((a, b) => byMagnitude(a.ratio, b.ratio));
    const groupHtml = clusterList
      .map((g) => {
        const members = [...g.members].sort((a, b) =>
          byMagnitude(a.hrDelta, b.hrDelta),
        );
        const jm = jmById.get(g.id);
        const jmSrc = jm && jm.source ? refLink(jm.source) : "";
        const ev =
          jm && jm.evidence
            ? `<span class="ev small" data-ev="${jm.evidence}" title="${EVIDENCE_TITLE[jm.evidence]}">${jm.evidence}</span>`
            : "";
        return `<li class="contrib-cluster">
        <details>
          <summary class="contrib-cluster-head">
            <span class="contrib-effect ${g.ratio < 1 ? "good" : "bad"}">${fmtPctFromHr(g.ratio)}</span>
            <span class="contrib-label">${esc(displayName(g.id))}</span>
            ${jmSrc}
            ${ev}
          </summary>
          <ul class="contrib-members">${members.map((c) => contribRow(c, outputId, field)).join("")}</ul>
        </details>
      </li>`;
      })
      .join("");
    const flat = unclustered
      .sort((a, b) => byMagnitude(a.hrDelta, b.hrDelta))
      .map((c) => contribRow(c, outputId, field))
      .join("");
    return groupHtml + flat;
  };

  function updateContrib(outputId, contribs, field, activeClusters) {
    const host = document.getElementById("contrib-" + outputId);
    const nonzero = contribs
      .filter((c) =>
        field === "hr"
          ? Math.abs(c.hrDelta - 1) > 0.005
          : Math.abs(c.pointsDelta) > 0.001,
      )
      .sort((a, b) =>
        field === "hr"
          ? Math.abs(Math.log(b.hrDelta)) - Math.abs(Math.log(a.hrDelta))
          : Math.abs(b.pointsDelta) - Math.abs(a.pointsDelta),
      );
    if (!nonzero.length) {
      host.innerHTML =
        '<li class="contrib-empty">Nothing pushing this yet — move some sliders.</li>';
      return;
    }
    if (field === "hr" && activeClusters && activeClusters.length) {
      host.innerHTML = groupedContribRows(
        outputId,
        nonzero,
        activeClusters,
        field,
      );
      return;
    }
    host.innerHTML = nonzero
      .map((c) => contribRow(c, outputId, field))
      .join("");
  }

  // ------------------------------------------------------------- events

  // Phase 5.5: swap the model driving the outputs + gate the conflation-clarity
  // copy. `state` is NOT reset — slider values carry across modes (the inputs
  // are identical in both models, so every value stays valid).
  function setMode(next) {
    mode = next;
    activeModel = next === "simple" ? simpleModel : model;
    updateModeUI();
    update(engine.evaluate(activeModel, state));
  }

  // Mode caption copy (6.6). No numbers — copy only. Sits under the tagline
  // (id="mode-caption"). Simple mode gets a reminder that the numbers are naive.
  function updateModeUI() {
    const caption = document.getElementById("mode-caption");
    if (caption) {
      caption.innerHTML =
        mode === "simple"
          ? 'Simple: each factor\'s effect is multiplied as if independent — it overstates combinations. Advanced corrects overlapping effects using published joint studies. <a href="sources.html#conflation">Full method →</a>'
          : 'Advanced: overlapping effects are priced from published joint studies, so the combined estimate doesn\'t overclaim. <a href="sources.html#conflation">How inputs are combined →</a>';
      caption.classList.toggle("simple-mode", mode === "simple");
    }
  }

  function wireEvents() {
    document.getElementById("inputs").addEventListener("input", (e) => {
      const id = e.target.dataset && e.target.dataset.id;
      if (!id) return;
      if (e.target.type === "checkbox") state[id] = e.target.checked;
      else if (e.target.type === "radio") state[id] = e.target.value;
      else state[id] = parseFloat(e.target.value);
      update(engine.evaluate(activeModel, state));
    });
    document.getElementById("reset").addEventListener("click", () => {
      Object.assign(state, engine.defaults(model));
      for (const input of model.inputs) {
        if (input.kind === "slider") {
          document.getElementById("in-" + input.id).value = input.default;
        } else if (input.kind === "segmented") {
          const radio = document.querySelector(
            `input[name="in-${input.id}"][value="${input.default}"]`,
          );
          if (radio) radio.checked = true;
        } else if (input.kind === "toggle") {
          document.getElementById("in-" + input.id).checked = input.default;
        }
      }
      update(engine.evaluate(activeModel, state));
    });
    const modeToggles = document.querySelectorAll(
      "#mode-toggle input[data-mode]",
    );
    for (const radio of modeToggles) {
      radio.addEventListener("change", (e) => setMode(e.target.value));
    }
  }

  // ------------------------------------------------------------- init

  renderInputs();
  renderOutputs();
  wireEvents();
  update(engine.evaluate(activeModel, state));
  updateModeUI();

  const versionEl = document.getElementById("model-version");
  if (versionEl) versionEl.textContent = model.meta.version;
})();
