import fs from "node:fs";
import { fromRoot } from "./paths.js";

const rubricText = fs.readFileSync(fromRoot("rubric.json"), "utf8");
export const RUBRIC = JSON.parse(rubricText);

const SUPPORTED_MATCH_TYPES = new Set(RUBRIC.supportedMatchTypes);
const EDGE_CHARACTERS = /^[ ."']+|[ ."']+$/g;
const MIN_PIECE_LENGTH = 4;

export const INVALID_REPLY = "invalid_reply";

const FULL_EXAMPLE = {
  intended_meaning: "One sentence saying what the claim is meant to say.",
  subclaims: [
    {
      text: "One fact inside the claim",
      origin: "claim",
      weight: "core",
      match_type: "explicit",
      evidence_quote: "Exact words copied from the source",
      source: 1,
      location: "Where in the source",
      source: 1,
    },
  ],
  reasoning: "Two or three sentences explaining the judgement.",
};

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

function outputInstructions(condition) {
  if (condition === "full") {
    return [
      "Reply with only one JSON object shaped like this example. Use your own values:",
      JSON.stringify(FULL_EXAMPLE, null, 2),
      `origin is "claim" or "context". weight is "core" or "peripheral". ` +
        `match_type is one of ${JSON.stringify(RUBRIC.matchTypes)}.`,
      'Use "" for evidence_quote and location when match_type is "absent".',
      "source is the number N of the [Source N] that the evidence comes from. Use 0 when match_type is \"absent\".",
      "No code fences and no text before or after the JSON.",
    ].join("\n");
  }

  const example = { label: RUBRIC.labels[0], reasoning: "Two or three sentences explaining." };
  return [
    "Reply with only one JSON object shaped like this example. Use your own values:",
    JSON.stringify(example, null, 2),
    `label is one of ${JSON.stringify(RUBRIC.labels)}.`,
    "No code fences and no text before or after the JSON.",
  ].join("\n");
}

function sourceBlock(text) {
  const sourceCount = (text.match(/^\[Source \d+\]/gm) ?? []).length;
  if (sourceCount < 2) return `Source text:\n${text}`;

  const intro =
    "The claim cites several sources. Each one starts with [Source N]. Judge them together as a " +
    "whole: the claim can be supported by one source or by several together. Judge only the " +
    "sources that could be read. A source marked as unreadable is missing, so do not guess what " +
    "it says, and say in your reasoning if the claim might depend on it.";
  return `${intro}\n\n${text}`;
}

export function sourceSection(text, number) {
  const marks = [...text.matchAll(/^\[Source (\d+)\][^\n]*\n/gm)];
  const position = marks.findIndex((mark) => Number(mark[1]) === number);
  if (position === -1) return "";

  const start = marks[position].index + marks[position][0].length;
  const end = marks[position + 1]?.index ?? text.length;
  return text.slice(start, end);
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
  parts.push(sourceBlock(source));

  if (condition === "full") {
    const rules = RUBRIC.rules.map((rule) => `- ${rule}`).join("\n");
    parts.push(`Rules:\n${rules}`);
  }

  parts.push(outputInstructions(condition));
  return parts.join("\n\n");
}

export function parseJson(text) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch (firstError) {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end <= start) throw firstError;
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}

function invalidReply(reason) {
  return { label: INVALID_REPLY, flags: [reason] };
}

async function askForJson(client, prompt, key, retry) {
  const first = await client.complete(prompt, key);
  try {
    return { parsed: parseJson(first) };
  } catch (error) {
    if (!retry) return { failure: `reply is not valid JSON: ${error.message}` };

    const again =
      `${prompt}\n\nYour previous reply was not valid JSON (${error.message}). ` +
      "Reply again with only the JSON object.";
    const second = await client.complete(again, `${key}_retry`);
    try {
      return { parsed: parseJson(second) };
    } catch (secondError) {
      return { failure: `reply is not valid JSON: ${secondError.message}` };
    }
  }
}

export async function verify(item, source, client, condition = "full", { retry = true } = {}) {
  if (!source || !source.trim()) {
    return { label: "source_unavailable", flags: ["no_source_text"] };
  }

  const prompt = buildPrompt(item, source, condition);
  const { parsed, failure } = await askForJson(client, prompt, `${condition}_${item.id}`, retry);
  if (failure) return invalidReply(failure);

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
    const section = Number.isInteger(subclaim.source) ? sourceSection(source, subclaim.source) : "";
    const haystack = section.trim() ? section : source;
    const needsEvidence = subclaim.match_type !== "absent";
    if (needsEvidence && !quoteInSource(subclaim.evidence_quote ?? "", haystack)) {
      flags.push(`quote_not_found: ${String(subclaim.text).slice(0, 40)}`);
      subclaim.match_type = "absent";
    }
    if (subclaim.origin === "context" && subclaim.weight === undefined) {
      subclaim.weight = "peripheral";
    }
  }

  return { ...parsed, label: aggregate(parsed.subclaims), flags };
}
