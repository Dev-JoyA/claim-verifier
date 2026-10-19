import fs from "node:fs";
import { fromRoot } from "./paths.js";

const rubricText = fs.readFileSync(fromRoot("rubric.json"), "utf8");
export const RUBRIC = JSON.parse(rubricText);

const SUPPORTED_MATCH_TYPES = new Set(RUBRIC.supportedMatchTypes);
const EDGE_CHARACTERS = /^[ ."']+|[ ."']+$/g;
const MIN_PIECE_LENGTH = 4;

export const INVALID_REPLY = "invalid_reply";

export function cleanText(text) {
  return text
    .normalize("NFKC")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function quoteInSource(quote, source) {
  const cleanSource = cleanText(source);

  const pieces = cleanText(quote)
    .split("...")
    .map((piece) => piece.replace(EDGE_CHARACTERS, ""))
    .filter((piece) => piece.length >= MIN_PIECE_LENGTH);

  if (pieces.length === 0) return false;
  return pieces.every((piece) => cleanSource.includes(piece));
}

const isSupported = (subclaim) => SUPPORTED_MATCH_TYPES.has(subclaim.match_type);
const isInferred = (subclaim) => subclaim.match_type === "inferred";
const isContradicted = (subclaim) => subclaim.match_type === "contradicted";

export function aggregate(subclaims) {
  const core = subclaims.filter((s) => (s.weight ?? "core") === "core");
  const peripheral = subclaims.filter((s) => s.weight === "peripheral");

  if (core.length === 0) return "not_supported";
  if (core.some(isContradicted)) return "contradicted";

  const strong = core.filter(isSupported);
  const weak = core.filter(isInferred);
  if (strong.length === 0 && weak.length === 0) return "not_supported";

  const peripheralAllSupported = peripheral.every(isSupported);
  const peripheralContradicted = peripheral.some(isContradicted);

  const everyCoreIsStrong = strong.length === core.length;
  if (everyCoreIsStrong) {
    if (peripheralContradicted) return "partially_supported";
    return peripheralAllSupported ? "fully_supported" : "mostly_supported";
  }

  const everyCoreIsAddressed = strong.length + weak.length === core.length;
  const atLeastHalfStrong = strong.length >= core.length / 2;
  if (everyCoreIsAddressed && atLeastHalfStrong && !peripheralContradicted) {
    return "mostly_supported";
  }
  return "partially_supported";
}

export function buildPrompt(item, source, condition) {
  const parts = [
    "You check whether a cited source supports a claim from a Wikipedia article.",
    "Judge only what the source says, not whether the claim is true in general.",
  ];

  if (condition === "context" || condition === "full") {
    parts.push(`Article: ${item.article_title ?? ""}`);
    parts.push(`Paragraph the claim appears in:\n${item.context ?? ""}`);
  }

  parts.push(`Claim:\n${item.sentence}`);
  parts.push(`Source text:\n${source}`);

  if (condition === "full") {
    const rules = RUBRIC.rules.map((rule) => `- ${rule}`).join("\n");
    parts.push(`Rules:\n${rules}`);
    parts.push(
      'Return JSON only: {"intended_meaning": str, "subclaims": [{"text": str, ' +
        '"origin": "claim|context", "weight": "core|peripheral", ' +
        `"match_type": one of ${JSON.stringify(RUBRIC.matchTypes)}, ` +
        '"evidence_quote": str, "location": str}], "reasoning": str}'
    );
  } else {
    const labels = JSON.stringify(RUBRIC.labels);
    parts.push(`Return JSON only: {"label": one of ${labels}, "reasoning": str}`);
  }

  return parts.join("\n\n");
}

export function parseJson(text) {
  const withoutFences = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  return JSON.parse(withoutFences);
}

function invalidReply(reason) {
  return { label: INVALID_REPLY, flags: [reason] };
}

export async function verify(item, source, client, condition = "full") {
  if (!source || !source.trim()) {
    return { label: "source_unavailable", flags: ["no_source_text"] };
  }

  const prompt = buildPrompt(item, source, condition);
  const reply = await client.complete(prompt, `${condition}_${item.id}`);

  let parsed;
  try {
    parsed = parseJson(reply);
  } catch (error) {
    return invalidReply(`reply is not valid JSON: ${error.message}`);
  }

  if (condition !== "full") {
    if (!RUBRIC.labels.includes(parsed.label)) {
      return invalidReply(`label "${parsed.label}" is not in the rubric`);
    }
    return { ...parsed, flags: [] };
  }

  if (!Array.isArray(parsed.subclaims)) {
    return invalidReply("reply has no subclaims list");
  }

  const flags = [];
  for (const subclaim of parsed.subclaims) {
    const needsEvidence = subclaim.match_type !== "absent";
    if (needsEvidence && !quoteInSource(subclaim.evidence_quote ?? "", source)) {
      flags.push(`quote_not_found: ${String(subclaim.text).slice(0, 40)}`);
      subclaim.match_type = "absent";
    }
    if (subclaim.origin === "context" && subclaim.weight === undefined) {
      subclaim.weight = "peripheral";
    }
  }

  return { ...parsed, label: aggregate(parsed.subclaims), flags };
}
