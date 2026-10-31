import { el, externalLink, showDialog } from "./dom.js";
import { nice } from "./summary.js";
import { decisionText, highlighted, sourceList, statusTag, verdictsFor } from "./views.js";

const cancelButton = (close) =>
  el("button", { class: "button secondary", onclick: () => close(null) }, "Cancel");

export function askForSources(claim, data) {
  return showDialog((close) => {
    const boxes = new Map();
    const fields = data.missing.map((entry) => {
      const box = el("textarea", { rows: 6, placeholder: "Paste the source text here (optional)" });
      boxes.set(entry.index, box);
      return el(
        "div",
        { class: "field" },
        el("h4", {}, `Source ${entry.index}`),
        entry.url ? el("p", {}, externalLink(entry.url, entry.url)) : el("p", { class: "note" }, "No web address."),
        entry.citeText ? el("p", { class: "note" }, entry.citeText) : null,
        el("p", { class: "note" }, entry.reason),
        box
      );
    });
    const problem = el("p", { id: "source-problem", class: "alert-text" });
    const pasted = () =>
      Object.fromEntries(
        [...boxes].filter(([, box]) => box.value.trim()).map(([index, box]) => [index, box.value])
      );

    return [
      el("h2", {}, `Claim #${claim.number}: some sources cannot be read`),
      el(
        "p",
        {},
        `${data.available} of ${data.total} sources could be read. The AI judges all sources together, so paste any text you can.`
      ),
      el("p", { class: "sentence" }, claim.sentence),
      ...fields,
      problem,
      el(
        "div",
        { class: "actions" },
        el(
          "button",
          {
            id: "use-pasted-source",
            class: "button",
            onclick: () => {
              const texts = pasted();
              if (Object.keys(texts).length === 0) {
                problem.textContent = "Paste text into at least one box, or choose another option.";
                return;
              }
              close({ action: "paste", texts });
            },
          },
          "Use pasted text and verify"
        ),
        data.available > 0
          ? el(
              "button",
              {
                id: "continue-without",
                class: "button secondary",
                onclick: () => close({ action: "continue", texts: pasted() }),
              },
              "Continue without these sources"
            )
          : null,
        el(
          "button",
          {
            id: "mark-unavailable",
            class: "button secondary",
            onclick: () => close({ action: "unavailable" }),
          },
          "Save as source unavailable"
        ),
        el("button", { class: "button secondary", onclick: () => close(null) }, "Skip")
      ),
    ];
  });
}

export function askForAiReply(claim, prompt) {
  return showDialog((close) => {
    const promptBox = el("textarea", { rows: 8, readonly: true });
    promptBox.value = prompt;
    const replyBox = el("textarea", { id: "ai-reply", rows: 8, placeholder: "Paste the AI's reply here" });
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(prompt);
      } catch {
        promptBox.select();
      }
    };

    return [
      el("h2", {}, `Claim #${claim.number}: ask an AI`),
      el("p", {}, "No AI is connected. Copy this prompt into any AI chat, then paste its reply below."),
      promptBox,
      el("div", { class: "actions" }, el("button", { class: "button secondary", onclick: copy }, "Copy prompt")),
      replyBox,
      el(
        "div",
        { class: "actions" },
        el(
          "button",
          {
            id: "use-ai-reply",
            class: "button",
            onclick: () => (replyBox.value.trim() ? close({ reply: replyBox.value }) : replyBox.focus()),
          },
          "Use this reply"
        ),
        el("button", { class: "button secondary", onclick: () => close(null) }, "Skip")
      ),
    ];
  });
}

export function rateDialog(claim, labels) {
  const mine = claim.view.human;
  const ai = claim.view.ai;

  return showDialog((close) => {
    const select = el(
      "select",
      { id: "rating-select" },
      el("option", { value: "", disabled: true, selected: !mine }, "Choose a rating\u2026"),
      labels.map((label) => el("option", { value: label, selected: label === mine?.rating }, nice(label)))
    );
    const reasoning = el("textarea", { id: "rating-reasoning", rows: 5 });
    reasoning.value = mine?.reasoning ?? "";
    const evidence = el("textarea", {
      id: "rating-evidence",
      rows: 4,
      placeholder: "One quotation from the source per line",
    });
    evidence.value = (mine?.evidence ?? []).map((item) => item.quote).filter(Boolean).join("\n");
    const problem = el("p", { id: "rating-problem", class: "alert-text" });

    const useAiAnswer = () => {
      select.value = ai.rating;
      reasoning.value = ai.reasoning;
      evidence.value = ai.evidence.map((item) => item.quote).filter(Boolean).join("\n");
    };

    return [
      el("h2", {}, `Rate claim #${claim.number} yourself`),
      el("p", { class: "sentence" }, claim.sentence),
      !mine && ai
        ? el(
            "div",
            {},
            el("p", { class: "note" }, "This form starts empty so your rating is your own."),
            el("button", { id: "use-ai-answer", class: "button secondary", onclick: useAiAnswer }, "Start from the AI's answer")
          )
        : null,
      el("label", { class: "field" }, "Rating", select),
      el("label", { class: "field" }, "Reasoning", reasoning),
      el("label", { class: "field" }, "Evidence", evidence),
      problem,
      el(
        "div",
        { class: "actions" },
        el(
          "button",
          {
            id: "save-rating",
            class: "button",
            onclick: () => {
              if (!select.value) {
                problem.textContent = "Choose a rating first.";
                select.classList.add("invalid");
                return select.focus();
              }
              close({ rating: select.value, reasoning: reasoning.value, evidence: evidence.value.split("\n") });
            },
          },
          "Save my rating"
        ),
        cancelButton(close)
      ),
    ];
  });
}

export function decideDialog(claim, labels) {
  const view = claim.view;

  return showDialog((close) => {
    const option = (value, text) =>
      el("label", { class: "radio" }, el("input", { type: "radio", name: "choice", value, id: `choice-${value}` }), text);
    const select = el(
      "select",
      { id: "decide-rating" },
      el("option", { value: "", disabled: true, selected: true }, "Choose a rating\u2026"),
      labels.map((label) => el("option", { value: label }, nice(label)))
    );
    const reason = el("textarea", {
      id: "decide-reason",
      rows: 4,
      placeholder: "Why is this the right rating? Refer to the source.",
    });
    const problem = el("p", { id: "decide-problem", class: "alert-text" });

    const save = () => {
      const picked = document.querySelector('input[name="choice"]:checked')?.value;
      if (!picked) return void (problem.textContent = "Choose one of the options.");
      if (picked === "new" && !select.value) return void (problem.textContent = "Choose the new rating.");
      if (!reason.value.trim()) return void (problem.textContent = "Please explain your decision.");
      close({ choice: picked, rating: select.value, reason: reason.value });
    };

    return [
      el("h2", {}, `Decide claim #${claim.number}`),
      el("p", { class: "sentence" }, claim.sentence),
      el(
        "p",
        {},
        "The app cannot tell which rating is right. Read the source again, then choose. For an important claim, ask a second person. Your reason is saved with the claim."
      ),
      option("human", `Keep the human rating: ${nice(view.human.rating)}`),
      option("ai", `Use the AI's rating: ${nice(view.ai.rating)}`),
      option("new", "Choose a different rating:"),
      select,
      el("label", { class: "field" }, "Reason (required)", reason),
      problem,
      el(
        "div",
        { class: "actions" },
        el("button", { id: "save-decision", class: "button", onclick: save }, "Save decision"),
        cancelButton(close)
      ),
    ];
  });
}

export function detailsDialog(claim, article) {
  const view = claim.view;

  return showDialog((close) => {
    const history = view.history.map((event) =>
      el(
        "li",
        {},
        `${new Date(event.at).toLocaleString()} \u00b7 ${event.by === "ai" ? "AI" : "human"} \u00b7 ${nice(event.action)}` +
          (event.rating ? ` \u00b7 ${nice(event.rating)}` : "") +
          (event.reason ? ` \u00b7 ${event.reason}` : "")
      )
    );

    return [
      el("h2", {}, `Claim #${claim.number}`),
      statusTag(view),
      el("p", { class: "sentence" }, ...highlighted(claim.context, claim.sentence)),
      sourceList(claim, article),
      verdictsFor(view),
      view.decision ? el("p", { class: "note" }, decisionText(view.decision)) : null,
      history.length ? el("details", {}, el("summary", {}, "History"), el("ul", {}, history)) : null,
      el(
        "div",
        { class: "actions" },
        view.ai && view.ai.review === "pending"
          ? el("button", { id: "details-accept", class: "button", onclick: () => close("accept") }, "Accept AI rating")
          : null,
        view.needsDecision
          ? el("button", { id: "details-decide", class: "button", onclick: () => close("decide") }, "Decide between them")
          : null,
        el("button", { id: "details-reverify", class: "button secondary", onclick: () => close("reverify") }, "Verify again"),
        el("button", { id: "details-rerate", class: "button secondary", onclick: () => close("rerate") }, "Rate it myself"),
        el("button", { id: "details-close", class: "button secondary", onclick: () => close(null) }, "Close")
      ),
    ];
  });
}
