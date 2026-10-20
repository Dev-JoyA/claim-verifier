import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fetchArticle, randomTitle } from "./wikipedia.js";
import { extractClaims, extractReferences } from "./extract.js";
import { fetchSourceText } from "./fetchSource.js";
import { nextId } from "./newClaim.js";
import { getFlag } from "./cli.js";
import { fromRoot } from "./paths.js";
import { sleep } from "./http.js";

export function seededShuffle(items, seed) {
  let state = seed >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function chooseClaims(claims, { limit, pick, seed, maxRefs }) {
  const eligible = claims.filter((claim) => claim.refIds.length <= maxRefs);
  const ordered = pick === "random" ? seededShuffle(eligible, seed) : eligible;
  return ordered.slice(0, limit);
}

export async function importClaims({
  article,
  group,
  limit = 5,
  pick = "first",
  seed = 1,
  maxRefs = 1,
  fetchSources = true,
  goldDir = fromRoot("gold"),
  sourcesDir = fromRoot("sources"),
  fetchText = fetchSourceText,
  pauseMs = 500,
}) {
  const claims = chooseClaims(extractClaims(article.html), { limit, pick, seed, maxRefs });
  const references = extractReferences(article.html);
  const template = JSON.parse(fs.readFileSync(path.join(goldDir, "TEMPLATE.json"), "utf8"));
  fs.mkdirSync(sourcesDir, { recursive: true });

  const created = [];
  for (const claim of claims) {
    const refId = claim.refIds[0];
    const reference = references.get(refId) ?? { citeText: "", url: "", archiveUrl: "" };
    const id = nextId(fs.readdirSync(goldDir));

    let sourceText = "";
    let importNote = "";
    if (!reference.url) {
      importNote = "no URL in the reference (book or offline source)";
    } else if (!fetchSources) {
      importNote = "source not fetched (--no-fetch)";
    } else {
      const result = await fetchText(reference.url);
      sourceText = result.text;
      importNote = result.ok ? "" : `source not fetched: ${result.note}`;
      await sleep(pauseMs);
    }

    const entry = {
      ...template,
      id,
      set: group,
      article_title: article.title,
      mw_rev_id: article.revid ?? null,
      ref_id: `cite_note-${refId}`,
      source_url: reference.url,
      source_file: `sources/${id}.txt`,
      sentence: claim.sentence,
      context: claim.context,
      cite_text: reference.citeText,
      archive_url: reference.archiveUrl,
      import_note: importNote,
    };
    fs.writeFileSync(path.join(goldDir, `${id}.json`), JSON.stringify(entry, null, 2) + "\n");
    fs.writeFileSync(path.join(sourcesDir, `${id}.txt`), sourceText, "utf8");
    created.push({ id, sentence: claim.sentence, url: reference.url, note: importNote });
  }
  return created;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function main() {
  const group = getFlag("set");
  if (!group) fail('Tell me the group, for example: --set regular');

  const oldid = getFlag("oldid");
  const title = process.argv.includes("--random") ? await randomTitle() : getFlag("title");
  if (!title && !oldid) fail('Use --title "Article name", --oldid 123456 or --random');

  console.log(`Fetching ${title ?? `revision ${oldid}`} from Wikipedia...`);
  const article = await fetchArticle({ title, oldid });
  console.log(`Got "${article.title}" (revision ${article.revid}).`);

  const created = await importClaims({
    article,
    group,
    limit: Number(getFlag("limit", "5")),
    pick: getFlag("pick", "first"),
    seed: Number(getFlag("seed", "1")),
    maxRefs: Number(getFlag("max-refs", "1")),
    fetchSources: !process.argv.includes("--no-fetch"),
  });

  if (created.length === 0) {
    console.log("No sentences with a single citation found. Try another article or --max-refs 2.");
    return;
  }
  for (const entry of created) {
    const status = entry.note || "source text saved";
    console.log(`${entry.id}: ${entry.sentence.slice(0, 70)}\n   ${entry.url || "(no URL)"}\n   ${status}`);
  }
  console.log("\nNext: npm run validate -- --unrated");
}

const startedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (startedDirectly) {
  main().catch((error) => fail(error.message));
}
