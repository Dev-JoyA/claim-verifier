import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadGold, readSource } from "./gold.js";
import { buildPrompt } from "./verifier.js";
import { getFlag } from "./cli.js";
import { fromRoot } from "./paths.js";

export function writePrompts(
  conditions,
  items = loadGold(),
  readSourceText = readSource,
  folder = fromRoot("results", "manual"),
  onlyUnrated = false
) {
  fs.mkdirSync(folder, { recursive: true });
  const pending = [];

  for (const condition of conditions) {
    for (const item of items) {
      if (onlyUnrated && String(item.my_rating ?? "").trim()) continue;

      const source = readSourceText(item);
      if (!source.trim()) continue;

      const key = `${condition}_${item.id}`;
      const promptName = `${key}.prompt.txt`;
      const replyName = `${key}.reply.json`;
      if (fs.existsSync(path.join(folder, replyName))) continue;

      const prompt = buildPrompt(item, source, condition);
      fs.writeFileSync(path.join(folder, promptName), prompt, "utf8");
      pending.push({ prompt: promptName, reply: replyName });
    }
  }
  return pending;
}

function main() {
  const conditions = getFlag("conditions", "full").split(",");
  const onlyUnrated = process.argv.includes("--unrated");
  const pending = writePrompts(conditions, loadGold(), readSource, undefined, onlyUnrated);

  if (pending.length === 0) {
    console.log("Nothing to do: every prompt already has a reply.");
    return;
  }
  console.log(`${pending.length} prompt(s) written to results\\manual. For each one:`);
  console.log("  open the prompt file, paste it into a NEW chat, save the AI's reply as the reply file.\n");
  pending.forEach((entry, index) => {
    console.log(`${index + 1}. ${entry.prompt}  ->  save reply as  ${entry.reply}`);
  });
}

const startedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (startedDirectly) main();
