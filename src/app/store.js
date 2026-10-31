import fs from "node:fs";
import path from "node:path";
import { loadGold } from "../gold.js";
import { nextId } from "../newClaim.js";
import { cleanText, RUBRIC } from "../verifier.js";

const DEFAULTS = {
  ai: null,
  review: "none",
  decision: null,
  my_reasoning: "",
  my_evidence: [],
  history: [],
};

const POSITION = Object.fromEntries(RUBRIC.labelOrder.map((label, index) => [label, index]));

const EMPTY_VIEW = {
  id: "",
  status: "unverified",
  rating: "",
  by: "",
  ai: null,
  human: null,
  agreement: null,
  decision: null,
  needsDecision: false,
  history: [],
};

function withDefaults(item) {
  return {
    ...structuredClone(DEFAULTS),
    ...item,
    history: Array.isArray(item.history) ? item.history : [],
    my_evidence: Array.isArray(item.my_evidence) ? item.my_evidence : [],
  };
}

function evidenceOf(subclaims) {
  return (subclaims ?? []).map((subclaim) => ({
    text: subclaim.text ?? "",
    matchType: subclaim.match_type ?? "",
    quote: subclaim.evidence_quote ?? "",
    location: subclaim.location ?? "",
    source: Number(subclaim.source) > 0 ? Number(subclaim.source) : null,
  }));
}

export function agreementBetween(humanRating, aiRating) {
  if (humanRating === aiRating) return { state: "agree" };
  const bothOnScale = humanRating in POSITION && aiRating in POSITION;
  const oneStep = bothOnScale && Math.abs(POSITION[humanRating] - POSITION[aiRating]) <= 1;
  return { state: oneStep ? "close" : "differ" };
}

export function viewOf(item) {
  if (!item) return { ...EMPTY_VIEW };

  const ai = item.ai
    ? {
        rating: item.ai.rating,
        reasoning: item.ai.reasoning ?? "",
        intendedMeaning: item.ai.intended_meaning ?? "",
        evidence: evidenceOf(item.ai.subclaims),
        flags: item.ai.flags ?? [],
        missingSources: item.ai.missing_sources ?? [],
        client: item.ai.client ?? "",
        model: item.ai.model ?? "",
        at: item.ai.at ?? "",
        tookMs: item.ai.took_ms ?? null,
        review: item.review,
      }
    : null;

  const human = item.my_rating
    ? {
        rating: item.my_rating,
        reasoning: item.my_reasoning ?? "",
        evidence: item.my_evidence ?? [],
      }
    : null;

  let status = "unverified";
  let rating = "";
  let by = "";
  if (human) {
    status = "human";
    rating = human.rating;
    by = "human";
  } else if (ai && item.review === "accepted") {
    status = "ai_accepted";
    rating = ai.rating;
    by = "ai";
  } else if (ai) {
    status = "ai_pending";
    rating = ai.rating;
    by = "ai";
  }

  const agreement = human && ai ? agreementBetween(human.rating, ai.rating) : null;
  const decision = item.decision ?? null;
  const needsDecision = Boolean(agreement && agreement.state !== "agree" && !decision);

  return {
    id: item.id,
    status,
    rating,
    by,
    ai,
    human,
    agreement,
    decision,
    needsDecision,
    history: item.history ?? [],
  };
}

export function createStore({ goldDir, sourcesDir }) {
  const goldPath = (id) => path.join(goldDir, `${id}.json`);
  const combinedPath = (id) => path.join(sourcesDir, `${id}.txt`);
  const sourcePath = (source) => path.join(sourcesDir, source.file);

  const sourcesFor = (id, claimSources) =>
    claimSources.map((source) => ({
      index: source.index,
      ref_id: source.refId,
      url: source.url,
      archive_url: source.archiveUrl,
      cite_text: source.citeText,
      file: `${id}.s${source.index}.txt`,
    }));

  function save(item) {
    const { file, ...data } = item;
    fs.writeFileSync(goldPath(data.id), JSON.stringify(data, null, 2) + "\n", "utf8");
  }

  function find(article, claim) {
    const sentence = cleanText(claim.sentence);
    const matches = loadGold(goldDir).filter(
      (item) =>
        item.article_title === article.title &&
        Number(item.mw_rev_id) === Number(article.revid) &&
        cleanText(item.sentence ?? "") === sentence
    );
    const chosen = matches.find((item) => item.my_rating || item.ai) ?? matches[0];
    return chosen ? withDefaults(chosen) : undefined;
  }

  function create(article, claim) {
    const templatePath = path.join(goldDir, "TEMPLATE.json");
    const template = fs.existsSync(templatePath)
      ? JSON.parse(fs.readFileSync(templatePath, "utf8"))
      : {};
    const id = nextId(fs.readdirSync(goldDir));
    const first = claim.sources[0] ?? { refId: "", url: "", archiveUrl: "", citeText: "" };

    const item = {
      ...template,
      ...structuredClone(DEFAULTS),
      id,
      set: "app",
      article_title: article.title,
      mw_rev_id: article.revid,
      ref_id: `cite_note-${first.refId}`,
      source_url: first.url,
      source_file: `sources/${id}.txt`,
      sentence: claim.sentence,
      context: claim.context,
      cite_text: first.citeText,
      archive_url: first.archiveUrl,
      sources: sourcesFor(id, claim.sources),
      my_rating: "",
    };

    save(item);
    fs.mkdirSync(sourcesDir, { recursive: true });
    fs.writeFileSync(combinedPath(id), "", "utf8");
    return { ...item, file: `${id}.json` };
  }

  function migrateLegacyText(item, wanted) {
    if (item.sources) return;
    const legacy = combinedPath(item.id);
    if (!fs.existsSync(legacy)) return;

    const text = fs.readFileSync(legacy, "utf8");
    const target = wanted.find((source) => `cite_note-${source.ref_id}` === item.ref_id) ?? wanted[0];
    if (!text.trim() || !target) return;

    const file = sourcePath(target);
    if (!fs.existsSync(file)) fs.writeFileSync(file, text, "utf8");
  }

  function syncSources(item, claim) {
    const wanted = sourcesFor(item.id, claim.sources);
    if (JSON.stringify(item.sources ?? null) === JSON.stringify(wanted)) return item;

    fs.mkdirSync(sourcesDir, { recursive: true });
    migrateLegacyText(item, wanted);
    item.sources = wanted;
    save(item);
    return item;
  }

  function readSource(item, source) {
    const file = sourcePath(source);
    return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  }

  function writeSource(item, source, text) {
    fs.mkdirSync(sourcesDir, { recursive: true });
    fs.writeFileSync(sourcePath(source), text, "utf8");
  }

  function combinedText(item) {
    const texts = item.sources.map((source) => readSource(item, source).trim());
    if (texts.every((text) => !text)) return "";

    return item.sources
      .map((source, position) => {
        const label = source.url || source.cite_text || `citation ${source.ref_id}`;
        return `[Source ${source.index}] ${label}\n${texts[position] || "(this source could not be read)"}`;
      })
      .join("\n\n");
  }

  function writeCombined(item) {
    fs.mkdirSync(sourcesDir, { recursive: true });
    fs.writeFileSync(combinedPath(item.id), combinedText(item), "utf8");
  }

  return {
    find,
    ensure: (article, claim) => syncSources(find(article, claim) ?? create(article, claim), claim),
    save,
    readSource,
    writeSource,
    combinedText,
    writeCombined,
  };
}
