import { el, externalLink, formatTime, hostOf } from "./dom.js";
import { RATING_TONES, nice, ratedBy, referenceLink } from "./summary.js";

const TAGS = {
  unverified: ["Unverified", "tag-none", "No rating has been saved for this claim."],
  ai_pending: [
    "AI suggestion \u00b7 needs review",
    "tag-pending",
    "An AI rated this claim. A human has not reviewed it yet.",
  ],
  ai_accepted: ["Verified", "tag-verified", "An AI rated this claim and a human accepted its rating."],
  human: ["Verified", "tag-verified", "A human rated this claim."],
};

export function statusTag(view) {
  const [text, className, tip] = TAGS[view.status];
  return el("span", { class: `tag ${className}`, "data-tip": tip, tabindex: "0" }, text);
}

export function ratingBadge(rating) {
  return el("span", { class: `badge badge-${RATING_TONES[rating] ?? "info"}` }, nice(rating));
}

export function provenanceLine(view) {
  const by = ratedBy(view);
  return by ? el("p", { class: "note" }, `Rated by: ${by}`) : null;
}

export function differenceChip(view) {
  if (!view.agreement || view.agreement.state === "agree") return null;

  const what =
    view.agreement.state === "close"
      ? "Human and AI differ by one step"
      : "Human and AI disagree";
  return el(
    "span",
    { class: `chip ${view.needsDecision ? "chip-warning" : "chip-done"}` },
    view.needsDecision ? `${what} \u00b7 needs a decision` : `${what} \u00b7 decided`
  );
}

export function decisionText(decision) {
  const choices = {
    human: "kept the human rating",
    ai: "adopted the AI's rating",
    new: "chose a different rating",
  };
  return `Decision: a human ${choices[decision.choice]}. Reason: ${decision.reason}`;
}

function evidenceItem(item) {
  const where = [item.source ? `Source ${item.source}` : "", item.location]
    .filter(Boolean)
    .join(", ");
  return el(
    "li",
    {},
    item.matchType ? el("strong", {}, `${nice(item.matchType)}: `) : null,
    item.text ? `${item.text} ` : null,
    item.quote ? el("blockquote", {}, `\u201c${item.quote}\u201d`) : null,
    where ? el("em", {}, `(${where})`) : null
  );
}

function aiWarnings(ai) {
  const warnings = [...ai.flags];
  if (ai.missingSources?.length) {
    warnings.push(
      `Source ${ai.missingSources.join(", ")} could not be read, so this rating uses only the other sources.`
    );
  }
  return warnings;
}

const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`;

function aiNote(ai) {
  const status =
    ai.review === "accepted" ? "Accepted by a human." : "Waiting for a human to accept it.";
  const took = ai.tookMs
    ? ` Took ${seconds(ai.tookMs.source)} to read the sources and ${seconds(ai.tookMs.ai)} for the AI.`
    : "";
  return `${status} ${formatTime(ai.at)}${took}`;
}

function verdictBlock(heading, verdict, note, warnings = []) {
  const evidence = verdict.evidence.map(evidenceItem);
  return el(
    "div",
    { class: "verdict" },
    el("h4", {}, heading),
    el("p", { class: "rating" }, nice(verdict.rating)),
    note ? el("p", { class: "note" }, note) : null,
    el("p", {}, verdict.reasoning || "No reasoning given."),
    evidence.length
      ? el("ul", {}, evidence)
      : el("p", { class: "note" }, "No evidence quotes."),
    warnings.length ? el("p", { class: "warning" }, `Warnings: ${warnings.join(" ")}`) : null
  );
}

export function verdictsFor(view) {
  const ai = view.ai;
  const aiHeading = ai ? `AI rating (${ai.model ? `${ai.client} \u00b7 ${ai.model}` : ai.client})` : "";
  return el(
    "div",
    { class: "verdicts" },
    view.human ? verdictBlock("Human rating", view.human) : null,
    ai ? verdictBlock(aiHeading, ai, aiNote(ai), aiWarnings(ai)) : null
  );
}

export function sourceList(claim, article) {
  return el(
    "ul",
    { class: "sources" },
    claim.sources.map((source) =>
      el(
        "li",
        {},
        `Source ${source.index}: `,
        source.url ? externalLink(source.url, hostOf(source.url)) : "no web address",
        source.archiveUrl ? [" \u00b7 ", externalLink(source.archiveUrl, "archived copy")] : null,
        " \u00b7 ",
        externalLink(referenceLink(article.title, article.revid, source.refId), "footnote in article"),
        el("span", { class: "note" }, source.hasText ? " \u00b7 text saved" : " \u00b7 not read yet")
      )
    )
  );
}

export function highlighted(context, sentence) {
  const at = context.indexOf(sentence);
  if (at === -1) return [context];
  return [context.slice(0, at), el("mark", {}, sentence), context.slice(at + sentence.length)];
}
