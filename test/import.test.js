import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { decodeEntities, htmlToText } from "../src/htmlText.js";
import { extractClaims, extractReferences, splitSentences } from "../src/extract.js";
import { fetchSourceText } from "../src/fetchSource.js";
import { fetchArticle, randomTitle } from "../src/wikipedia.js";
import { importClaims, seededShuffle } from "../src/importArticle.js";

const PAGE = `
<div class="mw-parser-output">
<p><b>Example Bridge</b> is a steel arch bridge in Ohio. The bridge opened to traffic in 1932.<sup id="cite_ref-1" class="reference"><a href="#cite_note-1"><span class="cite-bracket">[</span>1<span class="cite-bracket">]</span></a></sup> The U.S. Army used it in 1940.<sup id="cite_ref-S_2-0" class="reference"><a href="#cite_note-Smith-2">[2]</a></sup><sup id="cite_ref-3" class="reference"><a href="#cite_note-3">[3]</a></sup> Locals loved it &amp; used it daily.</p>
<p>A short one.<sup class="reference"><a href="#cite_note-1">[1]</a></sup></p>
<ol class="references">
<li id="cite_note-1"><span class="mw-cite-backlink"><a href="#cite_ref-1">^</a></span> <span class="reference-text"><a class="external text" href="https://example.com/archive?id=1&amp;x=2">City Archives</a>. <a href="https://web.archive.org/web/2020/https://example.com/archive">Archived</a>. <a href="/wiki/Special:BookSources/123">ISBN</a></span></li>
<li id="cite_note-Smith-2"><span class="reference-text"><a class="external text" href="//doi.org/10.1/abc">Smith</a></span></li>
<li id="cite_note-3"><span class="reference-text">Jones, A Book. <a href="https://en.wikipedia.org/wiki/Special:BookSources/978">ISBN 978</a></span></li>
</ol>
</div>`;

const response = (body, { ok = true, status = 200, type = "text/html" } = {}) => ({
  ok,
  status,
  headers: { get: () => type },
  text: async () => body,
});

test("decodeEntities handles named and numeric entities", () => {
  assert.equal(decodeEntities("a &amp; b &#8217; &#x41; &unknown;"), "a & b \u2019 A &unknown;");
});

test("htmlToText drops scripts and menus and keeps the article text", () => {
  const long = "Real article sentence. ".repeat(30);
  const html = `<nav>Menu</nav><script>var x=1;</script><article><p>${long}</p><p>Second &amp; last.</p></article>`;
  const text = htmlToText(html);
  assert.ok(text.includes("Real article sentence."));
  assert.ok(text.includes("Second & last."));
  assert.ok(!text.includes("Menu") && !text.includes("var x"));
});

test("splitSentences does not split after U.S.", () => {
  const parts = splitSentences("The U.S. Army came. It left.");
  assert.deepEqual(parts, ["The U.S. Army came.", "It left."]);
});

test("extractClaims returns cited sentences with their paragraph and reference ids", () => {
  const claims = extractClaims(PAGE);
  assert.equal(claims.length, 2);
  assert.equal(claims[0].sentence, "The bridge opened to traffic in 1932.");
  assert.deepEqual(claims[0].refIds, ["1"]);
  assert.equal(claims[1].sentence, "The U.S. Army used it in 1940.");
  assert.deepEqual(claims[1].refIds, ["Smith-2", "3"]);
  assert.ok(claims[0].context.includes("Locals loved it & used it daily."));
  assert.ok(!claims[0].context.includes("["));
});

test("extractReferences finds source and archive URLs and skips Wikipedia links", () => {
  const references = extractReferences(PAGE);
  assert.equal(references.get("1").url, "https://example.com/archive?id=1&x=2");
  assert.equal(references.get("1").archiveUrl, "https://web.archive.org/web/2020/https://example.com/archive");
  assert.equal(references.get("Smith-2").url, "https://doi.org/10.1/abc");
  assert.equal(references.get("3").url, "");
});

test("fetchSourceText reports why a source could not be read", async () => {
  const long = `<article><p>${"Plenty of words here. ".repeat(40)}</p></article>`;
  assert.equal((await fetchSourceText("u", async () => response(long))).ok, true);
  assert.match((await fetchSourceText("u", async () => response("", { ok: false, status: 403 }))).note, /403/);
  assert.match((await fetchSourceText("u", async () => response("x", { type: "application/pdf" }))).note, /PDF/);
  assert.match((await fetchSourceText("u", async () => response("<p>Subscribe</p>"))).note, /very little text/);
  const broken = async () => {
    throw new Error("boom");
  };
  assert.match((await fetchSourceText("u", broken)).note, /boom/);
});

test("fetchArticle and randomTitle call the Wikipedia API", async () => {
  const urls = [];
  const fakeFetch = async (url) => {
    urls.push(url);
    const data = url.includes("list=random")
      ? { query: { random: [{ title: "Some Page" }] } }
      : { parse: { title: "Example", revid: 77, text: "<p>x</p>" } };
    return { ok: true, json: async () => data };
  };
  assert.deepEqual(await fetchArticle({ title: "Example" }, fakeFetch), {
    title: "Example",
    revid: 77,
    html: "<p>x</p>",
  });
  assert.equal(await randomTitle(fakeFetch), "Some Page");
  assert.ok(urls[0].includes("action=parse") && urls[0].includes("page=Example"));

  const errorFetch = async () => ({ ok: true, json: async () => ({ error: { info: "missing" } }) });
  await assert.rejects(() => fetchArticle({ title: "Nope" }, errorFetch), /missing/);
});

test("seededShuffle is repeatable and keeps every item", () => {
  const items = [1, 2, 3, 4, 5, 6];
  assert.deepEqual(seededShuffle(items, 7), seededShuffle(items, 7));
  assert.deepEqual([...seededShuffle(items, 7)].sort(), items);
});

test("importClaims writes gold files and source files", async () => {
  const goldDir = fs.mkdtempSync(path.join(os.tmpdir(), "gold-"));
  const sourcesDir = fs.mkdtempSync(path.join(os.tmpdir(), "sources-"));
  fs.copyFileSync("gold/TEMPLATE.json", path.join(goldDir, "TEMPLATE.json"));
  const article = { title: "Example Bridge", revid: 99, html: PAGE };
  const fetchText = async () => ({ ok: true, text: "Source says it opened in 1932.", note: "" });

  const created = await importClaims({
    article,
    group: "regular",
    maxRefs: 2,
    goldDir,
    sourcesDir,
    fetchText,
    pauseMs: 0,
  });

  assert.deepEqual(created.map((c) => c.id), ["claim-001", "claim-002"]);
  const first = JSON.parse(fs.readFileSync(path.join(goldDir, "claim-001.json"), "utf8"));
  assert.equal(first.mw_rev_id, 99);
  assert.equal(first.set, "regular");
  assert.equal(first.ref_id, "cite_note-1");
  assert.equal(first.my_rating, "");
  assert.equal(fs.readFileSync(path.join(sourcesDir, "claim-001.txt"), "utf8"), "Source says it opened in 1932.");

  const second = JSON.parse(fs.readFileSync(path.join(goldDir, "claim-002.json"), "utf8"));
  assert.equal(second.ref_id, "cite_note-Smith-2");
  assert.equal(second.source_url, "https://doi.org/10.1/abc");
});

test("importClaims records why a source is missing", async () => {
  const goldDir = fs.mkdtempSync(path.join(os.tmpdir(), "gold-"));
  const sourcesDir = fs.mkdtempSync(path.join(os.tmpdir(), "sources-"));
  fs.copyFileSync("gold/TEMPLATE.json", path.join(goldDir, "TEMPLATE.json"));
  const fetchText = async () => ({ ok: false, text: "", note: "HTTP 403" });

  await importClaims({
    article: { title: "T", revid: 1, html: PAGE },
    group: "regular",
    goldDir,
    sourcesDir,
    fetchText,
    pauseMs: 0,
  });

  const entry = JSON.parse(fs.readFileSync(path.join(goldDir, "claim-001.json"), "utf8"));
  assert.equal(entry.import_note, "source not fetched: HTTP 403");
  assert.equal(fs.readFileSync(path.join(sourcesDir, "claim-001.txt"), "utf8"), "");
});
