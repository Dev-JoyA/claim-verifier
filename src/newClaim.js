import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { fromRoot } from "./paths.js";

export function nextId(fileNames) {
  const numbers = fileNames
    .map((name) => /^claim-(\d+)\.json$/.exec(name))
    .filter((match) => match !== null)
    .map((match) => Number(match[1]));

  const highest = numbers.length > 0 ? Math.max(...numbers) : 0;
  return `claim-${String(highest + 1).padStart(3, "0")}`;
}

function main() {
  const flagPosition = process.argv.indexOf("--set");
  const group = flagPosition > -1 ? process.argv[flagPosition + 1] : "";
  if (!group) {
    console.error("Tell me the group: npm run new -- --set regular");
    process.exit(1);
  }

  const goldFolder = fromRoot("gold");
  const id = nextId(fs.readdirSync(goldFolder));

  const template = fs.readFileSync(`${goldFolder}/TEMPLATE.json`, "utf8");
  const entry = JSON.parse(template);
  entry.id = id;
  entry.set = group;
  entry.source_file = `sources/${id}.txt`;

  fs.writeFileSync(`${goldFolder}/${id}.json`, JSON.stringify(entry, null, 2) + "\n", "utf8");

  fs.mkdirSync(fromRoot("sources"), { recursive: true });
  const sourcePath = fromRoot("sources", `${id}.txt`);
  if (!fs.existsSync(sourcePath)) fs.writeFileSync(sourcePath, "", "utf8");

  console.log(`Created gold/${id}.json and sources/${id}.txt`);
  console.log("Fill in the gold file, then paste the source text into the .txt file.");
}

const startedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (startedDirectly) main();
