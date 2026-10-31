import { RUBRIC, INVALID_REPLY, buildPrompt, verify } from "../verifier.js";

const CONDITION = "full";

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function record(item, event) {
  item.history.push({ at: new Date().toISOString(), ...event });
}

const NO_ADDRESS_REASON = "This citation has no web address (a book or an offline source).";

function hostOf(address) {
  try {
    return new URL(address).hostname;
  } catch {
    return address;
  }
}

async function readFromWeb(source, fetchText) {
  const addresses = [source.url, source.archive_url].filter(
    (address, position, all) => address && all.indexOf(address) === position
  );

  const failures = [];
  for (const address of addresses) {
    const fetched = await fetchText(address);
    if (fetched.ok) return { ok: true, text: fetched.text };

    const where = address === source.url ? "" : `archived copy on ${hostOf(address)}: `;
    failures.push(`${where}${fetched.note}`);
  }
  return { ok: false, reason: `Could not read it: ${failures.join("; ")}.` };
}

async function gatherSources({ store, item, fetchText, sourceTexts, allowMissing }) {
  for (const [index, text] of Object.entries(sourceTexts ?? {})) {
    const source = item.sources.find((candidate) => String(candidate.index) === String(index));
    if (source && String(text).trim()) {
      store.writeSource(item, source, String(text).trim());
      store.writeShared(source.url, String(text).trim());
    }
  }

  const missing = [];
  for (const source of item.sources) {
    if (store.readSource(item, source).trim()) continue;

    const shared = store.readShared(source.url) || store.readShared(source.archive_url);
    if (shared.trim()) {
      store.writeSource(item, source, shared);
      continue;
    }

    const details = { index: source.index, url: source.url, citeText: source.cite_text };
    if (!source.url) {
      missing.push({ ...details, reason: NO_ADDRESS_REASON });
      continue;
    }
    if (allowMissing) {
      missing.push({ ...details, reason: "Not read." });
      continue;
    }

    const result = await readFromWeb(source, fetchText);
    if (result.ok) {
      store.writeSource(item, source, result.text);
      store.writeShared(source.url, result.text);
    } else {
      missing.push({ ...details, reason: result.reason });
    }
  }
  return missing;
}

export async function verifyClaim({
  store,
  article,
  claim,
  ai,
  fetchText,
  sourceTexts,
  allowMissing,
  aiReply,
}) {
  const item = store.ensure(article, claim);

  const sourceStart = Date.now();
  const missing = await gatherSources({ store, item, fetchText, sourceTexts, allowMissing });
  const sourceMs = Date.now() - sourceStart;

  const total = item.sources.length;
  const available = total - missing.length;
  if (available === 0 || (missing.length > 0 && !allowMissing)) {
    return { outcome: "needs_source", missing, available, total };
  }

  store.writeCombined(item);
  const text = store.combinedText(item);

  const manual = !ai.client;
  if (manual && !aiReply) {
    return { outcome: "needs_ai_reply", prompt: buildPrompt(item, text, CONDITION) };
  }

  const client = manual ? { complete: async () => aiReply } : ai.client;
  let result;
  const aiStart = Date.now();
  try {
    result = await verify(item, text, client, CONDITION, { retry: !manual });
  } catch (error) {
    return { outcome: "error", error: error.message };
  }
  if (result.label === INVALID_REPLY) {
    return { outcome: "error", error: result.flags.join("; ") };
  }

  const aiMs = Date.now() - aiStart;
  const hadAi = Boolean(item.ai);
  item.ai = {
    rating: result.label,
    reasoning: result.reasoning ?? "",
    intended_meaning: result.intended_meaning ?? "",
    subclaims: result.subclaims ?? [],
    flags: result.flags,
    missing_sources: missing.map((entry) => entry.index),
    source_count: total,
    client: ai.choice,
    model: ai.model ?? "",
    condition: CONDITION,
    took_ms: { source: sourceMs, ai: aiMs },
    at: new Date().toISOString(),
  };
  item.review = "pending";
  item.decision = null;
  record(item, {
    by: "ai",
    action: hadAi ? "reverify" : "verify",
    rating: result.label,
    client: ai.choice,
    model: ai.model ?? "",
  });
  store.save(item);
  return { outcome: "verified", item };
}

export function acceptAi(store, item) {
  if (!item?.ai) throw new HttpError(400, "There is no AI rating to accept yet.");
  item.review = "accepted";
  record(item, { by: "human", action: "accept", rating: item.ai.rating });
  store.save(item);
  return item;
}

function reasonFrom(value) {
  const reason = String(value ?? "").trim();
  if (!reason) throw new HttpError(400, "Please explain your decision.");
  return reason;
}

export function keepHuman(store, item, { reason } = {}) {
  if (!item?.ai || !item.my_rating) {
    throw new HttpError(400, "A human rating and an AI rating are both needed to decide.");
  }
  const why = reasonFrom(reason);
  item.decision = { choice: "human", at: new Date().toISOString(), rating: item.my_rating, reason: why };
  record(item, {
    by: "human",
    action: "decide",
    resolution: "human",
    rating: item.my_rating,
    reason: why,
  });
  store.save(item);
  return item;
}

export function rateByHuman(store, item, { rating, reasoning, evidence, resolution, reason }) {
  if (!RUBRIC.labels.includes(rating)) {
    throw new HttpError(400, `Rating must be one of: ${RUBRIC.labels.join(", ")}.`);
  }

  const quotes = (evidence ?? [])
    .map((line) => String(line).trim())
    .filter(Boolean)
    .map((quote) => ({ quote }));
  const unavailable = rating === "source_unavailable";
  const resolved = item.ai && ["ai", "new"].includes(resolution) ? resolution : null;
  const why = resolved ? reasonFrom(reason) : "";

  item.decision = resolved
    ? {
        choice: resolved,
        at: new Date().toISOString(),
        previous_rating: item.my_rating ?? "",
        reason: why,
      }
    : null;
  item.my_rating = rating;
  item.my_reasoning =
    String(reasoning ?? "").trim() || (unavailable ? "The source could not be accessed." : "");
  item.my_evidence = quotes;
  record(item, {
    by: "human",
    action: unavailable ? "mark_unavailable" : "rate",
    rating,
    ...(resolved ? { resolution: resolved, reason: why } : {}),
  });
  store.save(item);
  return item;
}
