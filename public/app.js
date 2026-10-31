import { parseSelection, pickRandom } from "./selection.js";
import { $, el, externalLink, hostOf, request } from "./dom.js";
import {
  articleLinks,
  compareCounts,
  countsOf,
  disagreements,
  groupClaims,
  isVerified,
  nice,
  ratedBy,
  toCsv,
  toWikitext,
} from "./summary.js";
import {
  decisionText,
  differenceChip,
  provenanceLine,
  ratingBadge,
  sourceList,
  statusTag,
  verdictsFor,
} from "./views.js";
import { askForAiReply, askForSources, decideDialog, detailsDialog, rateDialog } from "./dialogs.js";

const state = {
  config: null,
  article: null,
  tab: "claims",
  filter: "all",
  checked: new Set(),
  reviewNumbers: [],
  busy: false,
};

const claimAt = (number) => state.article.claims[number - 1];
const byNumber = (a, b) => a - b;

function setMessage(text, isError = false) {
  const box = $("#message");
  box.textContent = text;
  box.className = isError ? "message error" : "message";
}

function addProblem(number, text) {
  $("#problems").append(el("div", { class: "alert alert-error" }, `Claim #${number}: ${text}`));
}

function renderHeader() {
  const { title, revid } = state.article;
  const links = articleLinks(title, revid);
  $("#article-heading").textContent = `${title} (revision ${revid})`;
  $("#article-links").replaceChildren(
    externalLink(links.revision, "Open this revision on Wikipedia"),
    externalLink(links.latest, "Open the latest version")
  );
}

function renderStats() {
  const counts = countsOf(state.article.claims);
  const items = [
    ["total", "Claims"],
    ["verified", "Verified"],
    ["review", "AI suggestions to review"],
    ["unverified", "Unverified"],
  ];
  $("#stats").replaceChildren(
    ...items.map(([key, label]) =>
      el(
        "div",
        { class: "stat", id: `stat-${key}` },
        el("span", { class: "stat-number" }, String(counts[key])),
        el("span", { class: "stat-label" }, label)
      )
    )
  );
}

function passesFilter(claim) {
  const status = claim.view.status;
  if (state.filter === "unverified") return status === "unverified";
  if (state.filter === "review") return status === "ai_pending";
  if (state.filter === "verified") return isVerified(claim.view);
  return true;
}

function claimCard(claim) {
  const view = claim.view;
  return el(
    "article",
    { class: "module claim", id: `claim-${claim.number}` },
    el(
      "div",
      { class: "claim-head" },
      el(
        "label",
        { class: "check" },
        el("input", {
          type: "checkbox",
          checked: state.checked.has(claim.number),
          onchange: (event) => {
            if (event.target.checked) state.checked.add(claim.number);
            else state.checked.delete(claim.number);
          },
        }),
        `Claim #${claim.number}`
      ),
      el("div", { class: "tags" }, isVerified(view) ? ratingBadge(view.rating) : null, statusTag(view))
    ),
    el("p", { class: "sentence" }, claim.sentence),
    provenanceLine(view),
    differenceChip(view),
    sourceList(claim, state.article),
    el(
      "div",
      { class: "actions" },
      el("button", { class: "button", onclick: () => verifyMany([claim.number]) }, "Verify"),
      el("button", { class: "button secondary", onclick: () => openDetails(claim.number) }, "Details")
    )
  );
}

function renderClaims() {
  const list = $("#claims");
  list.replaceChildren();
  const shown = state.article.claims.filter(passesFilter);
  $("#count").textContent = `${shown.length} of ${state.article.claims.length} claims shown`;
  for (const claim of shown) list.append(claimCard(claim));
}

function reviewCard(claim) {
  const view = claim.view;
  return el(
    "article",
    { class: "module claim" },
    el(
      "div",
      { class: "claim-head" },
      el("strong", {}, `Claim #${claim.number}`),
      el("div", { class: "tags" }, isVerified(view) ? ratingBadge(view.rating) : null, statusTag(view))
    ),
    el("p", { class: "sentence" }, claim.sentence),
    verdictsFor(view),
    el(
      "div",
      { class: "actions" },
      view.ai && view.ai.review === "pending"
        ? el("button", { class: "button", onclick: () => refreshAfter(() => accept(claim)) }, "Accept AI rating")
        : null,
      view.needsDecision
        ? el("button", { class: "button", onclick: () => refreshAfter(() => decide(claim)) }, "Decide between them")
        : null,
      el("button", { class: "button secondary", onclick: () => refreshAfter(() => verifyOne(claim.number)) }, "Verify again"),
      el("button", { class: "button secondary", onclick: () => refreshAfter(() => rerate(claim)) }, "Rate it myself"),
      el("button", { class: "button secondary", onclick: () => openDetails(claim.number) }, "Details")
    )
  );
}

function renderReview() {
  const panel = $("#review");
  const numbers = state.reviewNumbers;
  panel.hidden = numbers.length === 0;
  if (numbers.length === 0) return panel.replaceChildren();

  const pending = numbers.filter((number) => claimAt(number).view.ai?.review === "pending");
  panel.replaceChildren(
    el("div", { class: "section-header" }, el("h3", {}, "Results")),
    el(
      "div",
      { class: "module-body" },
      el(
        "p",
        { class: "note" },
        "Check each rating, its evidence and its reasoning. Accept the AI's rating, verify again, or rate it yourself."
      ),
      el(
        "div",
        { class: "actions" },
        pending.length
          ? el(
              "button",
              { id: "accept-all", class: "button", onclick: () => refreshAfter(() => acceptMany(pending)) },
              `Accept all ${pending.length} AI rating(s)`
            )
          : null,
        el(
          "button",
          {
            class: "button secondary",
            onclick: () => {
              state.reviewNumbers = [];
              renderReview();
            },
          },
          "Close results"
        )
      ),
      ...numbers.map((number) => reviewCard(claimAt(number)))
    )
  );
}

function summaryClaim(claim) {
  return el(
    "div",
    { class: "summary-claim" },
    el("button", { class: "link-button", onclick: () => openDetails(claim.number) }, `#${claim.number}`),
    " \u00b7 ",
    claim.sources.map((source, position) => [
      position ? ", " : "",
      source.url ? externalLink(source.url, hostOf(source.url)) : "no web address",
    ]),
    el("span", { class: "note" }, ratedBy(claim.view) ? ` \u00b7 ${ratedBy(claim.view)}` : "")
  );
}

function downloadCsv() {
  const { title, revid, claims } = state.article;
  const blob = new Blob([toCsv(claims)], { type: "text/csv" });
  const link = el("a", {
    href: URL.createObjectURL(blob),
    download: `${title.replaceAll(" ", "_")}-revision-${revid}.csv`,
  });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 2000);
}

function renderSummary() {
  const { title, revid, claims } = state.article;
  const groups = groupClaims(claims, state.config.labels);
  const rows = groups.map((group) =>
    el(
      "tr",
      { class: `row-${group.tone}`, id: `group-${group.key}` },
      el(
        "td",
        {},
        el("strong", {}, group.title),
        el("br"),
        `${group.claims.length} claim${group.claims.length === 1 ? "" : "s"}`
      ),
      el(
        "td",
        {},
        group.claims.length ? group.claims.map(summaryClaim) : el("span", { class: "note" }, "None")
      )
    )
  );
  const output = el("textarea", { id: "wikitext-output", rows: 10, readonly: true, hidden: true });
  const copyWikitext = async () => {
    output.value = toWikitext({ title, revid, groups });
    output.hidden = false;
    try {
      await navigator.clipboard.writeText(output.value);
    } catch {
      output.select();
    }
  };

  $("#tab-summary").replaceChildren(
    el(
      "div",
      { class: "module" },
      el("div", { class: "section-header" }, el("h3", {}, "Claims by rating")),
      el(
        "div",
        { class: "module-body" },
        el(
          "p",
          { class: "note" },
          "Only verified claims are listed under a rating. AI suggestions that no human has reviewed are listed separately."
        ),
        el(
          "div",
          { class: "overflow" },
          el(
            "table",
            { class: "table table--hoverable", id: "summary-table" },
            el("thead", {}, el("tr", {}, el("th", {}, "Rating"), el("th", {}, "Claim numbers and sources"))),
            el("tbody", {}, rows)
          )
        ),
        el(
          "div",
          { class: "actions" },
          el("button", { id: "copy-wikitext", class: "button", onclick: copyWikitext }, "Copy for Wikipedia (wikitext)"),
          el("button", { id: "download-csv", class: "button secondary", onclick: downloadCsv }, "Download CSV")
        ),
        output
      )
    )
  );
}

const DIFFERENCE_TEXT = { close: "differ by one step", differ: "disagree" };

function compareRow(claim) {
  const view = claim.view;
  return el(
    "tr",
    { class: view.needsDecision ? "row-warning" : "" },
    el(
      "td",
      {},
      el("button", { class: "link-button", onclick: () => openDetails(claim.number) }, `#${claim.number}`),
      el("br"),
      el("span", { class: "note" }, claim.sentence)
    ),
    el("td", {}, ratingBadge(view.human.rating)),
    el("td", {}, ratingBadge(view.ai.rating)),
    el("td", {}, DIFFERENCE_TEXT[view.agreement.state]),
    el("td", {}, view.decision ? decisionText(view.decision) : "Waiting for a decision"),
    el(
      "td",
      {},
      view.needsDecision
        ? el("button", { class: "button decide-button", onclick: () => refreshAfter(() => decide(claim)) }, "Decide")
        : null
    )
  );
}

function renderCompare() {
  const counts = compareCounts(state.article.claims);
  const items = [
    ["compared", "Rated by both"],
    ["agree", "Agree"],
    ["close", "Differ by one step"],
    ["differ", "Disagree"],
    ["waiting", "Waiting for a decision"],
  ];
  const rows = disagreements(state.article.claims).map(compareRow);

  $("#tab-compare").replaceChildren(
    el(
      "div",
      { class: "module" },
      el("div", { class: "section-header" }, el("h3", {}, "Human rating compared with AI rating")),
      el(
        "div",
        { class: "module-body" },
        el(
          "p",
          { class: "note" },
          "The app cannot know which rating is correct, because it has no answer key. It shows where the two differ so a person can read the source again and decide. For important claims, ask a second person."
        ),
        el(
          "div",
          { class: "stats" },
          ...items.map(([key, label]) =>
            el(
              "div",
              { class: "stat", id: `compare-${key}` },
              el("span", { class: "stat-number" }, String(counts[key])),
              el("span", { class: "stat-label" }, label)
            )
          )
        ),
        rows.length
          ? el(
              "div",
              { class: "overflow" },
              el(
                "table",
                { class: "table table--striped table--hoverable", id: "compare-table" },
                el(
                  "thead",
                  {},
                  el(
                    "tr",
                    {},
                    ["Claim", "Human", "AI", "Difference", "Decision", ""].map((heading) => el("th", {}, heading))
                  )
                ),
                el("tbody", {}, rows)
              )
            )
          : el("p", {}, "No disagreements. Every claim rated by both a human and an AI agrees.")
      )
    )
  );
}

function renderAll() {
  if (!state.article) return;
  renderHeader();
  renderStats();
  renderClaims();
  renderReview();
  renderSummary();
  renderCompare();
}

function showTab(name) {
  state.tab = name;
  for (const button of document.querySelectorAll(".tab")) {
    const active = button.dataset.tab === name;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  }
  for (const key of ["claims", "summary", "compare"]) $(`#tab-${key}`).hidden = key !== name;
  renderAll();
}

async function refreshAfter(task) {
  try {
    await task();
  } catch (error) {
    setMessage(error.message, true);
  }
  renderAll();
}

const base = (claim) => ({ revid: state.article.revid, number: claim.number });

async function accept(claim) {
  claim.view = (await request("/api/accept", base(claim))).view;
}

async function acceptMany(numbers) {
  for (const number of numbers) await accept(claimAt(number));
}

async function saveRating(claim, rating) {
  claim.view = (await request("/api/rate", { ...base(claim), ...rating })).view;
}

async function rerate(claim) {
  const answer = await rateDialog(claim, state.config.labels);
  if (answer) await saveRating(claim, answer);
}

async function applyDecision(claim, answer) {
  if (answer.choice === "human") {
    claim.view = (await request("/api/decide", { ...base(claim), reason: answer.reason })).view;
    return;
  }

  const adopted = answer.choice === "ai";
  claim.view = (
    await request("/api/rate", {
      ...base(claim),
      rating: adopted ? claim.view.ai.rating : answer.rating,
      reasoning: answer.reason,
      evidence: adopted ? claim.view.ai.evidence.map((item) => item.quote).filter(Boolean) : [],
      resolution: adopted ? "ai" : "new",
      reason: answer.reason,
    })
  ).view;
}

async function decide(claim) {
  const answer = await decideDialog(claim, state.config.labels);
  if (answer) await applyDecision(claim, answer);
}

async function openDetails(number) {
  for (;;) {
    const claim = claimAt(number);
    const action = await detailsDialog(claim, state.article);
    if (!action) break;
    await refreshAfter(async () => {
      if (action === "accept") await accept(claim);
      if (action === "decide") await decide(claim);
      if (action === "reverify") await verifyOne(number);
      if (action === "rerate") await rerate(claim);
    });
  }
  renderAll();
}

async function verifyOne(number, extra = {}) {
  const claim = claimAt(number);
  const first = Object.keys(extra).length === 0;
  let data;
  try {
    data = await request("/api/verify", { ...base(claim), ...extra });
  } catch (error) {
    addProblem(number, error.message);
    return false;
  }
  if (data.sources) claim.sources = data.sources;

  if (data.outcome === "verified") {
    claim.view = data.view;
    return true;
  }

  if (data.outcome === "needs_source") {
    const answer = await askForSources(claim, data);
    if (!answer) return false;
    if (answer.action === "unavailable") {
      await saveRating(claim, { rating: "source_unavailable", reasoning: "", evidence: [] });
      return true;
    }
    return verifyOne(number, { sourceTexts: answer.texts, allowMissing: true });
  }

  if (data.outcome === "needs_ai_reply") {
    const answer = await askForAiReply(claim, data.prompt);
    if (!answer) return false;
    return verifyOne(number, { allowMissing: first ? false : extra.allowMissing, aiReply: answer.reply });
  }

  addProblem(number, data.error || "Something went wrong.");
  return false;
}

async function verifyMany(numbers) {
  if (state.busy) return setMessage("Already verifying. Please wait.", true);
  if (numbers.length === 0) return setMessage("There are no claims to verify.", true);
  if (numbers.length > 10 && !confirm(`This will ask the AI about ${numbers.length} claims. Continue?`)) return;

  state.busy = true;
  setMessage("");
  const progress = $("#progress");
  progress.hidden = false;
  const finished = [];

  try {
    for (const [index, number] of numbers.entries()) {
      const started = Date.now();
      const label = () =>
        `Verifying ${index + 1} of ${numbers.length} (claim #${number}) \u00b7 ` +
        `${Math.round((Date.now() - started) / 1000)} s`;
      progress.textContent = label();
      const timer = setInterval(() => {
        progress.textContent = label();
      }, 1000);
      try {
        if (await verifyOne(number)) finished.push(number);
      } finally {
        clearInterval(timer);
      }
    }
    progress.textContent = `Done. ${finished.length} of ${numbers.length} claims have a result.`;
  } finally {
    state.busy = false;
  }

  state.reviewNumbers = finished;
  renderAll();
}

const unverifiedNumbers = () =>
  state.article.claims.filter((claim) => claim.view.status === "unverified").map((claim) => claim.number);

async function runSelection(getNumbers) {
  if (!state.article) return;
  let numbers;
  try {
    numbers = getNumbers();
  } catch (error) {
    return setMessage(error.message, true);
  }
  await verifyMany(numbers);
}

async function loadArticle() {
  const title = $("#title").value.trim();
  const oldid = $("#oldid").value.trim();
  if (!title && !oldid) return setMessage("Type an article title or a revision id.", true);

  setMessage("Loading the article\u2026");
  const query = oldid ? `oldid=${encodeURIComponent(oldid)}` : `title=${encodeURIComponent(title)}`;
  try {
    state.article = await request(`/api/article?${query}`);
  } catch (error) {
    return setMessage(error.message, true);
  }

  state.checked.clear();
  state.reviewNumbers = [];
  $("#workspace").hidden = false;
  $("#progress").hidden = true;
  $("#problems").replaceChildren();

  if (state.article.searchedFor) {
    setMessage(
      `No article is called "${state.article.searchedFor}". Showing the closest match: ${state.article.title}.`
    );
  } else {
    setMessage(state.article.claims.length ? "" : "No sentences with citations were found in this article.");
  }
  showTab("claims");
}

function watchTitleSuggestions() {
  let timer;
  $("#title").addEventListener("input", (event) => {
    clearTimeout(timer);
    const query = event.target.value.trim();
    if (query.length < 2) return;
    timer = setTimeout(async () => {
      try {
        const titles = await request(`/api/suggest?q=${encodeURIComponent(query)}`);
        $("#title-suggestions").replaceChildren(...titles.map((title) => el("option", { value: title })));
      } catch {
        return;
      }
    }, 250);
  });
}

async function start() {
  state.config = await request("/api/config");
  $("#ai-status").textContent = state.config.manual
    ? "AI: not connected. You will paste the AI's reply yourself (manual mode)."
    : `AI: ${state.config.aiChoice}${state.config.aiModel ? ` \u00b7 ${state.config.aiModel}` : ""}`;

  watchTitleSuggestions();
  $("#load-btn").onclick = loadArticle;
  $("#title").addEventListener("keydown", (event) => event.key === "Enter" && loadArticle());
  for (const button of document.querySelectorAll(".tab")) {
    button.onclick = () => showTab(button.dataset.tab);
  }
  $("#verify-range").onclick = () =>
    runSelection(() => parseSelection($("#range").value, state.article.claims.length));
  $("#verify-checked").onclick = () => runSelection(() => [...state.checked].sort(byNumber));
  $("#verify-random").onclick = () =>
    runSelection(() => pickRandom(unverifiedNumbers(), Number($("#random-count").value) || 1));
  $("#verify-all").onclick = () => runSelection(unverifiedNumbers);
  $("#clear-checked").onclick = () => {
    state.checked.clear();
    renderClaims();
  };
  $("#filter").onchange = (event) => {
    state.filter = event.target.value;
    renderClaims();
  };
}

start().catch((error) => setMessage(error.message, true));
