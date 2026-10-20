import { pathToFileURL } from "node:url";
import { loadGold, readSource } from "./gold.js";
import { cleanText, RUBRIC } from "./verifier.js";

const REQUIRED_FIELDS = ["id", "set", "article_title", "sentence", "context", "my_rating"];

export function checkItem(item, sourceText, requireRating = true) {
  const errors = [];
  const warnings = [];

  const required = requireRating
    ? REQUIRED_FIELDS
    : REQUIRED_FIELDS.filter((field) => field !== "my_rating");

  for (const field of required) {
    if (!String(item[field] ?? "").trim()) errors.push(`missing "${field}"`);
  }

  if (item.id && item.file !== `${item.id}.json`) {
    errors.push(`id "${item.id}" does not match the file name ${item.file}`);
  }

  if (item.my_rating && !RUBRIC.labels.includes(item.my_rating)) {
    errors.push(`my_rating "${item.my_rating}" must be one of: ${RUBRIC.labels.join(", ")}`);
  }

  const sentenceIsInContext =
    item.sentence && item.context && cleanText(item.context).includes(cleanText(item.sentence));
  if (item.sentence && item.context && !sentenceIsInContext) {
    warnings.push("sentence not found inside context (copy the exact claim and the whole paragraph)");
  }

  const ratedUnavailable = item.my_rating === "source_unavailable";
  const hasSourceText = sourceText.trim().length > 0;
  if (!ratedUnavailable && !hasSourceText) {
    errors.push("source text is empty, but the rating is not source_unavailable");
  }
  if (ratedUnavailable && hasSourceText) {
    warnings.push("rated source_unavailable, but a source text exists");
  }

  return { errors, warnings };
}

export function checkAll(items, readSourceText = readSource, requireRating = true) {
  const seenIds = new Set();
  const report = [];

  for (const item of items) {
    const result = checkItem(item, readSourceText(item), requireRating);
    if (seenIds.has(item.id)) result.errors.push("duplicate id");
    seenIds.add(item.id);
    report.push({ file: item.file, ...result });
  }
  return report;
}

function main() {
  const requireRating = !process.argv.includes("--unrated");
  const items = loadGold();
  let errorCount = 0;

  for (const result of checkAll(items, readSource, requireRating)) {
    for (const error of result.errors) {
      console.log(`ERROR   ${result.file}: ${error}`);
      errorCount++;
    }
    for (const warning of result.warnings) {
      console.log(`warning ${result.file}: ${warning}`);
    }
  }

  console.log(`${items.length} gold file(s) checked, ${errorCount} error(s).`);
  process.exit(errorCount > 0 ? 1 : 0);
}

const startedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (startedDirectly) main();
