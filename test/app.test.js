import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { createApp } from "../src/app/server.js";
import { importClaims } from "../src/importArticle.js";
import { loadGold } from "../src/gold.js";
import { PAGE, DIANA } from "./fixtures.js";

const GOOD_REPLY = JSON.stringify({
  intended_meaning: "The bridge opened in 1932.",
  subclaims: [
    {
      text: "opened in 1932",
      origin: "claim",
      weight: "core",
      match_type: "paraphrase",
      evidence_quote: "opened to traffic in 1932",
      location: "paragraph 1",
      source: 1,
    },
  ],
  reasoning: "The source gives the 1932 opening date in different words.",
});

const SOURCE_TEXT = "Archive notes: the bridge was opened to traffic in 1932. ".repeat(10);

async function start({ ai, fetchText, seed, html } = {}) {
  const goldDir = fs.mkdtempSync(path.join(os.tmpdir(), "app-gold-"));
  const sourcesDir = fs.mkdtempSync(path.join(os.tmpdir(), "app-sources-"));
  fs.copyFileSync("gold/TEMPLATE.json", path.join(goldDir, "TEMPLATE.json"));
  if (seed) await seed(goldDir, sourcesDir);

  const calls = { ai: 0, text: 0, prompts: [] };
  const server = createApp({
    goldDir,
    sourcesDir,
    publicDir: path.resolve("public"),
    fetchArticle: async ({ title }) => {
      if (title && title.replaceAll("_", " ") !== "Example Bridge") {
        throw Object.assign(new Error("The page you specified doesn't exist."), {
          code: "missingtitle",
        });
      }
      return { title: "Example Bridge", revid: 42, html: html ?? PAGE };
    },
    searchTitles: async (query) => (query.toLowerCase().includes("bridge") ? ["Example Bridge"] : []),
    suggestTitles: async (query) => [`${query} one`, `${query} two`],
    fetchText:
      fetchText ??
      (async (url) => {
        calls.text++;
        return url.includes("example.com")
          ? { ok: true, text: SOURCE_TEXT, note: "" }
          : { ok: false, text: "", note: "HTTP 403" };
      }),
    ai: ai ?? {
      choice: "fake",
      model: "fake-1",
      client: {
        complete: async (prompt) => {
          calls.ai++;
          calls.prompts.push(prompt);
          return GOOD_REPLY;
        },
      },
    },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const get = async (url) => (await fetch(base + url)).json();
  const post = async (url, body) => {
    const response = await fetch(base + url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  };
  return {
    base,
    get,
    post,
    calls,
    goldDir,
    sourcesDir,
    close: () => {
      server.closeAllConnections();
      server.close();
    },
  };
}

const LOAD = "/api/article?title=Example_Bridge";

test("config tells the page which AI is connected and how ratings are ordered", async (t) => {
  const app = await start();
  t.after(app.close);
  const config = await app.get("/api/config");
  assert.equal(config.aiChoice, "fake");
  assert.equal(config.manual, false);
  assert.ok(config.labels.includes("fully_supported"));
  assert.equal(config.labelOrder[0], "contradicted");
});

test("a sentence with two citations is one claim with two sources", async (t) => {
  const app = await start();
  t.after(app.close);
  const article = await app.get(LOAD);
  assert.equal(article.revid, 42);
  assert.equal(article.claims.length, 2);
  assert.deepEqual(
    article.claims.map((claim) => [claim.number, claim.sources.length, claim.view.status]),
    [
      [1, 1, "unverified"],
      [2, 2, "unverified"],
    ]
  );
  assert.deepEqual(
    article.claims[1].sources.map((source) => [source.index, source.refId, source.hasText]),
    [
      [1, "Smith-2", false],
      [2, "3", false],
    ]
  );
});

test("verifying a claim fetches the source, asks the AI and stores a pending AI rating", async (t) => {
  const app = await start();
  t.after(app.close);
  await app.get(LOAD);

  const { data } = await app.post("/api/verify", { revid: 42, number: 1 });
  assert.equal(data.outcome, "verified");
  assert.equal(data.view.status, "ai_pending");
  assert.equal(data.view.rating, "fully_supported");
  assert.equal(data.view.ai.evidence[0].quote, "opened to traffic in 1932");
  assert.equal(data.view.ai.evidence[0].source, 1);
  assert.equal(data.sources[0].hasText, true);
  assert.ok(app.calls.prompts[0].includes("Source text:"));
  assert.ok(!app.calls.prompts[0].includes("cites several sources"));

  const gold = loadGold(app.goldDir);
  assert.equal(gold.length, 1);
  assert.equal(gold[0].my_rating, "");
  const combined = fs.readFileSync(path.join(app.sourcesDir, "claim-001.txt"), "utf8");
  assert.ok(combined.startsWith("[Source 1] https://example.com"));
});

test("a claim with two sources is judged on both together, with one unreadable", async (t) => {
  const app = await start();
  t.after(app.close);
  await app.get(LOAD);

  const blocked = await app.post("/api/verify", { revid: 42, number: 2 });
  assert.equal(blocked.data.outcome, "needs_source");
  assert.equal(blocked.data.available, 0);
  assert.equal(blocked.data.total, 2);
  assert.deepEqual(
    blocked.data.missing.map((entry) => entry.index),
    [1, 2]
  );
  assert.ok(blocked.data.missing[0].reason.startsWith("Could not read it"));
  assert.ok(blocked.data.missing[1].reason.includes("no web address"));
  assert.equal(app.calls.ai, 0);

  const fetchedBefore = app.calls.text;
  const verified = await app.post("/api/verify", {
    revid: 42,
    number: 2,
    sourceTexts: { 1: "Pasted report: the bridge was opened to traffic in 1932." },
    allowMissing: true,
  });
  assert.equal(verified.data.outcome, "verified");
  assert.equal(app.calls.text, fetchedBefore);
  assert.deepEqual(verified.data.view.ai.missingSources, [2]);
  assert.deepEqual(
    verified.data.sources.map((source) => source.hasText),
    [true, false]
  );

  const prompt = app.calls.prompts[0];
  assert.ok(prompt.includes("cites several sources"));
  assert.ok(prompt.includes("[Source 1]"));
  assert.ok(prompt.includes("[Source 2]"));
  assert.ok(prompt.includes("(this source could not be read)"));
  assert.equal(loadGold(app.goldDir).length, 1);
});

test("both sources are given to the AI when both are available", async (t) => {
  const fetchText = async (url) => ({
    ok: true,
    text: url.includes("doi.org") ? "Second source: the army used it in 1940. ".repeat(12) : SOURCE_TEXT,
    note: "",
  });
  const app = await start({ fetchText });
  t.after(app.close);
  await app.get(LOAD);

  const first = await app.post("/api/verify", { revid: 42, number: 2 });
  assert.equal(first.data.outcome, "needs_source");
  assert.equal(first.data.available, 1);
  assert.deepEqual(
    first.data.missing.map((entry) => entry.index),
    [2]
  );

  const done = await app.post("/api/verify", {
    revid: 42,
    number: 2,
    sourceTexts: { 2: "Book page: army records show use in 1940." },
    allowMissing: true,
  });
  assert.equal(done.data.outcome, "verified");
  assert.deepEqual(done.data.view.ai.missingSources, []);

  const prompt = app.calls.prompts.at(-1);
  assert.ok(prompt.includes("Second source: the army used it in 1940."));
  assert.ok(prompt.includes("Book page: army records"));
  assert.ok(!prompt.includes("could not be read"));
});

test("a human can save a claim as source unavailable", async (t) => {
  const app = await start();
  t.after(app.close);
  const { data } = await app.post("/api/rate", {
    revid: 42,
    number: 2,
    rating: "source_unavailable",
    reasoning: "",
    evidence: [],
  });
  assert.equal(data.view.status, "human");
  assert.equal(data.view.rating, "source_unavailable");
  assert.match(data.view.human.reasoning, /could not be accessed/);
  assert.equal(data.view.history[0].action, "mark_unavailable");
});

test("accepting, re-verifying and re-rating keep who did what", async (t) => {
  const app = await start();
  t.after(app.close);
  await app.get(LOAD);
  await app.post("/api/verify", { revid: 42, number: 1 });

  const accepted = (await app.post("/api/accept", { revid: 42, number: 1 })).data.view;
  assert.equal(accepted.status, "ai_accepted");

  const again = (await app.post("/api/verify", { revid: 42, number: 1 })).data.view;
  assert.equal(again.status, "ai_pending");
  assert.equal(app.calls.ai, 2);

  const rated = (
    await app.post("/api/rate", {
      revid: 42,
      number: 1,
      rating: "not_supported",
      reasoning: "I read it differently.",
      evidence: ["opened to traffic in 1932", ""],
    })
  ).data.view;
  assert.equal(rated.status, "human");
  assert.equal(rated.ai.rating, "fully_supported");
  assert.deepEqual(rated.human.evidence, [{ quote: "opened to traffic in 1932" }]);
  assert.deepEqual(
    rated.history.map((event) => `${event.by}:${event.action}`),
    ["ai:verify", "human:accept", "ai:reverify", "human:rate"]
  );
  assert.equal(loadGold(app.goldDir)[0].my_rating, "not_supported");
});

test("human and AI ratings are compared and a disagreement needs a written decision", async (t) => {
  const app = await start();
  t.after(app.close);
  await app.get(LOAD);
  await app.post("/api/verify", { revid: 42, number: 1 });

  const differ = (
    await app.post("/api/rate", { revid: 42, number: 1, rating: "not_supported", reasoning: "x", evidence: [] })
  ).data.view;
  assert.equal(differ.agreement.state, "differ");
  assert.equal(differ.needsDecision, true);

  assert.equal((await app.post("/api/decide", { revid: 42, number: 1 })).status, 400);
  const kept = await app.post("/api/decide", { revid: 42, number: 1, reason: "The source is a summary." });
  assert.equal(kept.data.view.decision.choice, "human");
  assert.equal(kept.data.view.decision.reason, "The source is a summary.");
  assert.equal(kept.data.view.needsDecision, false);

  const noReason = await app.post("/api/rate", {
    revid: 42,
    number: 1,
    rating: "fully_supported",
    reasoning: "",
    evidence: [],
    resolution: "ai",
  });
  assert.equal(noReason.status, 400);

  const adopted = await app.post("/api/rate", {
    revid: 42,
    number: 1,
    rating: "fully_supported",
    reasoning: "",
    evidence: [],
    resolution: "ai",
    reason: "On re-reading, the AI is right.",
  });
  assert.equal(adopted.data.view.decision.choice, "ai");
  assert.equal(adopted.data.view.decision.previous_rating, "not_supported");
  assert.equal(adopted.data.view.agreement.state, "agree");

  const close = (
    await app.post("/api/rate", { revid: 42, number: 1, rating: "mostly_supported", reasoning: "x", evidence: [] })
  ).data.view;
  assert.equal(close.agreement.state, "close");
  assert.equal(close.needsDecision, true);
});

test("loading the article again shows saved verdicts", async (t) => {
  const app = await start();
  t.after(app.close);
  await app.get(LOAD);
  await app.post("/api/verify", { revid: 42, number: 1 });
  const article = await app.get(LOAD);
  assert.equal(article.claims[0].view.status, "ai_pending");
  assert.equal(article.claims[0].sources[0].hasText, true);
  assert.equal(article.claims[1].view.status, "unverified");
});

test("manual mode shows the prompt and accepts a pasted AI reply", async (t) => {
  const app = await start({ ai: { choice: "manual", model: "", client: null } });
  t.after(app.close);
  await app.get(LOAD);

  const first = await app.post("/api/verify", { revid: 42, number: 1 });
  assert.equal(first.data.outcome, "needs_ai_reply");
  assert.ok(first.data.prompt.includes("Claim:"));
  assert.ok(first.data.prompt.includes(SOURCE_TEXT.slice(0, 40)));

  const bad = await app.post("/api/verify", { revid: 42, number: 1, aiReply: "a story" });
  assert.equal(bad.data.outcome, "error");

  const good = await app.post("/api/verify", { revid: 42, number: 1, aiReply: GOOD_REPLY });
  assert.equal(good.data.outcome, "verified");
  assert.equal(good.data.view.ai.client, "manual");
});

test("an AI failure is reported without crashing", async (t) => {
  const failing = { choice: "fake", model: "", client: { complete: async () => "nonsense" } };
  const app = await start({ ai: failing });
  t.after(app.close);
  await app.get(LOAD);
  const { data } = await app.post("/api/verify", { revid: 42, number: 1 });
  assert.equal(data.outcome, "error");
  assert.match(data.error, /not valid JSON/);
});

test("bad requests get clear errors", async (t) => {
  const app = await start();
  t.after(app.close);
  await app.get(LOAD);
  assert.equal((await app.post("/api/verify", { revid: 42, number: 99 })).status, 400);
  assert.equal((await app.post("/api/verify", { number: 1 })).status, 400);
  const badRating = await app.post("/api/rate", { revid: 42, number: 1, rating: "great" });
  assert.equal(badRating.status, 400);
  assert.equal((await app.post("/api/accept", { revid: 42, number: 2 })).status, 400);
});

test("the page is served, and requests from other hosts are refused", async (t) => {
  const app = await start();
  t.after(app.close);
  const page = await fetch(`${app.base}/`);
  assert.equal(page.status, 200);
  assert.ok((await page.text()).includes("Claim verifier"));
  assert.equal((await fetch(`${app.base}/..%2fpackage.json`)).status, 404);

  const url = new URL(app.base);
  const foreign = await new Promise((resolve) => {
    http.get(
      { host: "127.0.0.1", port: url.port, path: "/api/config", headers: { host: "evil.example" } },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      }
    );
  });
  assert.equal(foreign, 403);
});

test("claim files made by the command-line importer still work", async (t) => {
  const app = await start({
    seed: (goldDir, sourcesDir) =>
      importClaims({
        article: { title: "Example Bridge", revid: 42, html: PAGE },
        group: "regular",
        maxRefs: 2,
        goldDir,
        sourcesDir,
        fetchText: async () => ({ ok: true, text: SOURCE_TEXT, note: "" }),
        pauseMs: 0,
      }),
  });
  t.after(app.close);
  assert.equal(loadGold(app.goldDir).length, 2);
  assert.equal(loadGold(app.goldDir)[0].history, undefined);

  await app.get(LOAD);
  const first = await app.post("/api/verify", { revid: 42, number: 1 });
  assert.equal(first.data.outcome, "verified");
  const second = await app.post("/api/verify", {
    revid: 42,
    number: 2,
    sourceTexts: { 2: "Book page: the army used it in 1940." },
    allowMissing: true,
  });
  assert.equal(second.data.outcome, "verified");
  assert.equal((await app.post("/api/accept", { revid: 42, number: 1 })).status, 200);
  assert.equal(loadGold(app.goldDir).length, 2);
});

test("a title that does not exist exactly opens the closest search match", async (t) => {
  const app = await start();
  t.after(app.close);
  const article = await app.get("/api/article?title=example%20bridg%20bridge");
  assert.equal(article.title, "Example Bridge");
  assert.equal(article.searchedFor, "example bridg bridge");
  assert.equal((await app.get(LOAD)).searchedFor, "");

  const missing = await fetch(`${app.base}/api/article?title=zzzz`);
  assert.equal(missing.status, 404);
});

test("title suggestions are returned, and short queries are ignored", async (t) => {
  const app = await start();
  t.after(app.close);
  assert.deepEqual(await app.get("/api/suggest?q=dia"), ["dia one", "dia two"]);
  assert.deepEqual(await app.get("/api/suggest?q=d"), []);
});

test("a verified claim records how long the source and the AI took", async (t) => {
  const app = await start();
  t.after(app.close);
  await app.get(LOAD);
  const { data } = await app.post("/api/verify", { revid: 42, number: 1 });
  assert.equal(typeof data.view.ai.tookMs.source, "number");
  assert.equal(typeof data.view.ai.tookMs.ai, "number");
});

const diana = (overrides = {}) => {
  const seen = [];
  const texts = {
    "https://sfgate.example/profile": { ok: false, text: "", note: "HTTP 403" },
    "https://web.archive.org/web/2010/https://sfgate.example/profile": {
      ok: true,
      text: "Archived profile: she really has no prejudgments and the bridge was opened to traffic in 1932. ".repeat(6),
      note: "",
    },
    "https://curve.example/humorless": { ok: true, text: SOURCE_TEXT, note: "" },
    ...overrides,
  };
  const fetchText = async (url) => {
    seen.push(url);
    return texts[url] ?? { ok: false, text: "", note: "HTTP 404" };
  };
  return { fetchText, seen };
};

test("the archived copy is used when the original page cannot be read", async (t) => {
  const { fetchText, seen } = diana();
  const app = await start({ html: DIANA, fetchText });
  t.after(app.close);
  await app.get(LOAD);

  const { data } = await app.post("/api/verify", { revid: 42, number: 3 });
  assert.equal(data.outcome, "verified");
  assert.deepEqual(seen, [
    "https://sfgate.example/profile",
    "https://web.archive.org/web/2010/https://sfgate.example/profile",
  ]);
});

test("a source read for one claim is reused for another claim that cites it", async (t) => {
  const { fetchText, seen } = diana();
  const app = await start({ html: DIANA, fetchText });
  t.after(app.close);
  const article = await app.get(LOAD);
  assert.equal(article.claims[2].sources[0].refId, article.claims[6].sources[1].refId);
  assert.deepEqual(article.claims[6].sources.map((source) => source.label), ["[9]", "[3]"]);

  await app.post("/api/verify", { revid: 42, number: 3 });
  const readBefore = seen.length;

  const second = await app.post("/api/verify", { revid: 42, number: 7 });
  assert.equal(second.data.outcome, "verified");
  const newFetches = seen.slice(readBefore);
  assert.deepEqual(newFetches, ["https://curve.example/humorless"]);
  assert.ok(app.calls.prompts.at(-1).includes("Archived profile"));
});

test("text pasted for a source is reused by later claims that cite the same source", async (t) => {
  const { fetchText, seen } = diana({
    "https://web.archive.org/web/2010/https://sfgate.example/profile": { ok: false, text: "", note: "HTTP 404" },
  });
  const app = await start({ html: DIANA, fetchText });
  t.after(app.close);
  await app.get(LOAD);

  const blocked = await app.post("/api/verify", { revid: 42, number: 3 });
  assert.equal(blocked.data.outcome, "needs_source");
  assert.match(blocked.data.missing[0].reason, /archived copy on web\.archive\.org: HTTP 404/);

  const pasted = await app.post("/api/verify", {
    revid: 42,
    number: 3,
    sourceTexts: { 1: "Pasted profile: the bridge was opened to traffic in 1932." },
    allowMissing: true,
  });
  assert.equal(pasted.data.outcome, "verified");

  const readBefore = seen.length;
  const later = await app.post("/api/verify", { revid: 42, number: 7 });
  assert.equal(later.data.outcome, "verified");
  assert.ok(!seen.slice(readBefore).some((url) => url.includes("sfgate")));
  assert.ok(app.calls.prompts.at(-1).includes("Pasted profile"));
});
