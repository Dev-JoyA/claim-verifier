import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { loadGold, readSource } from "./gold.js";
import { verify } from "./verifier.js";
import { getFlag, makeClient } from "./cli.js";
import { fromRoot } from "./paths.js";

export async function checkClaims(
  client,
  condition,
  items = loadGold(),
  readSourceText = readSource
) {
  const unrated = items.filter((item) => !String(item.my_rating ?? "").trim());
  const results = [];

  for (const item of unrated) {
    const result = await verify(item, readSourceText(item), client, condition);
    results.push({
      id: item.id,
      sentence: item.sentence,
      label: result.label,
      reasoning: result.reasoning ?? "",
      subclaims: result.subclaims ?? [],
      flags: result.flags,
    });
  }
  return results;
}

async function main() {
  const results = await checkClaims(makeClient(), getFlag("condition", "full"));

  fs.mkdirSync(fromRoot("results"), { recursive: true });
  fs.writeFileSync(fromRoot("results", "checked.json"), JSON.stringify(results, null, 2));

  if (results.length === 0) {
    console.log("No unrated claims found. Leave my_rating empty on claims you want checked.");
  }
  for (const result of results) {
    console.log(`${result.id}: ${result.label}`);
    if (result.reasoning) console.log(`   ${result.reasoning}`);
    for (const flag of result.flags) console.log(`   flag: ${flag}`);
  }
}

const startedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (startedDirectly) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
