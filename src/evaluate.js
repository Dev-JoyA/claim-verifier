import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { loadGold, readSource } from "./gold.js";
import { verify, RUBRIC } from "./verifier.js";
import { getFlag, makeClient } from "./cli.js";
import { fromRoot } from "./paths.js";

const POSITION = Object.fromEntries(RUBRIC.labelOrder.map((label, index) => [label, index]));

export function agree(toolLabel, yourLabel) {
  if (toolLabel === yourLabel) return { exact: true, adjacent: true };

  const bothOnScale = toolLabel in POSITION && yourLabel in POSITION;
  const oneStepApart = bothOnScale && Math.abs(POSITION[toolLabel] - POSITION[yourLabel]) <= 1;
  return { exact: false, adjacent: oneStepApart };
}

export async function run(client, conditions, items = loadGold(), readSourceText = readSource) {
  const report = {};

  for (const condition of conditions) {
    const rows = [];
    for (const item of items) {
      const result = await verify(item, readSourceText(item), client, condition);
      rows.push({
        id: item.id,
        gold: item.my_rating,
        tool: result.label,
        ...agree(result.label, item.my_rating),
        flags: result.flags,
      });
    }

    const share = (key) => (rows.length ? rows.filter((r) => r[key]).length / rows.length : null);
    report[condition] = {
      n: rows.length,
      exact: share("exact"),
      adjacent: share("adjacent"),
      rows,
    };
  }
  return report;
}


async function main() {
  const client = makeClient();
  const conditions = getFlag("conditions", "baseline,context,full").split(",");

  const report = await run(client, conditions);

  fs.mkdirSync(fromRoot("results"), { recursive: true });
  fs.writeFileSync(fromRoot("results", "report.json"), JSON.stringify(report, null, 2));

  for (const [condition, result] of Object.entries(report)) {
    console.log(
      `${condition.padEnd(9)} n=${result.n} exact=${result.exact} adjacent=${result.adjacent}`
    );
    for (const row of result.rows.filter((r) => !r.exact)) {
      console.log(`   ${row.id}: you=${row.gold} tool=${row.tool} ${row.flags.join("; ")}`);
    }
  }
}

const startedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (startedDirectly) main();
