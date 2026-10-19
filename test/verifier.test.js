import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { aggregate, cleanText, quoteInSource, verify, INVALID_REPLY } from "../src/verifier.js";
import { nextId } from "../src/newClaim.js";
import { checkItem } from "../src/validate.js";
import { loadGold } from "../src/gold.js";
import { run, agree } from "../src/evaluate.js";
import { checkClaims } from "../src/check.js";

const sub = (match_type, weight = "core") => ({ match_type, weight, text: "x" });
const fakeAi = (reply) => ({
  complete: async () => (typeof reply === "string" ? reply : JSON.stringify(reply)),
});
const item = { id: "claim-001", sentence: "c", context: "c", article_title: "t" };

test("cleanText standardises quotes, ligatures, spacing and case", () => {
  assert.equal(cleanText("  \u201cHi\u201d  \uFB01ne "), '"hi" fine');
});

test("aggregate turns sub-claim match types into labels", () => {
  assert.equal(aggregate([sub("explicit"), sub("paraphrase")]), "fully_supported");
  assert.equal(aggregate([sub("explicit"), sub("absent", "peripheral")]), "mostly_supported");
  assert.equal(aggregate([sub("explicit"), sub("absent")]), "partially_supported");
  assert.equal(aggregate([sub("absent")]), "not_supported");
  assert.equal(aggregate([sub("contradicted")]), "contradicted");
  assert.equal(aggregate([]), "not_supported");
});

test("quoteInSource ignores curly quotes, spacing and ellipses", () => {
  const source = "The bill  \u201ccame closest to full passage\u201d in 2010.";
  assert.ok(quoteInSource('"came closest to full passage" in 2010', source));
  assert.ok(quoteInSource("...came closest... in 2010", source));
  assert.ok(!quoteInSource("never passed the House", source));
  assert.ok(!quoteInSource("", source));
});

test("an invented quote is downgraded to absent and flagged", async () => {
  const reply = {
    subclaims: [
      { text: "a", weight: "core", match_type: "explicit", evidence_quote: "not in source" },
    ],
  };
  const result = await verify(item, "some source text", fakeAi(reply), "full");
  assert.equal(result.label, "not_supported");
  assert.equal(result.flags.length, 1);
});

test("an empty source gives source_unavailable without calling the AI", async () => {
  const mustNotBeCalled = {
    complete: async () => {
      throw new Error("should not be called");
    },
  };
  const result = await verify(item, "  ", mustNotBeCalled, "full");
  assert.equal(result.label, "source_unavailable");
});

test("a broken AI reply gives invalid_reply instead of crashing", async () => {
  assert.equal((await verify(item, "src", fakeAi("not json"), "full")).label, INVALID_REPLY);
  assert.equal(
    (await verify(item, "src", fakeAi({ label: "great" }), "baseline")).label,
    INVALID_REPLY
  );
  assert.equal((await verify(item, "src", fakeAi({}), "full")).label, INVALID_REPLY);
});

test("nextId uses the highest existing number", () => {
  assert.equal(nextId(["TEMPLATE.json"]), "claim-001");
  assert.equal(nextId(["claim-001.json", "claim-002.json", "TEMPLATE.json"]), "claim-003");
  assert.equal(nextId(["claim-001.json", "claim-007.json"]), "claim-008");
});

test("validate catches missing fields and bad ratings", () => {
  const { errors } = checkItem(
    { file: "claim-001.json", id: "claim-001", my_rating: "great" },
    "text"
  );
  assert.ok(errors.some((e) => e.includes("my_rating")));
  assert.ok(errors.some((e) => e.includes("sentence")));
});

test("loadGold names the broken file", () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "gold-"));
  fs.writeFileSync(path.join(folder, "claim-001.json"), "{ broken");
  assert.throws(() => loadGold(folder), /claim-001\.json is not valid JSON/);
});

test("loadGold skips the template whatever its capitalisation", () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "gold-"));
  fs.writeFileSync(path.join(folder, "template.json"), "{}");
  fs.writeFileSync(path.join(folder, "claim-001.json"), '{"id": "claim-001"}');
  assert.deepEqual(
    loadGold(folder).map((gold) => gold.file),
    ["claim-001.json"]
  );
});

test("agree: source_unavailable only matches exactly", () => {
  assert.deepEqual(agree("fully_supported", "mostly_supported"), { exact: false, adjacent: true });
  assert.deepEqual(agree("source_unavailable", "not_supported"), { exact: false, adjacent: false });
  assert.deepEqual(agree("source_unavailable", "source_unavailable"), {
    exact: true,
    adjacent: true,
  });
});

test("evaluate compares tool labels with your labels", async () => {
  const items = [{ ...item, my_rating: "fully_supported" }];
  const reply = {
    subclaims: [
      { text: "a", weight: "core", match_type: "explicit", evidence_quote: "alpha beta" },
    ],
  };
  const report = await run(fakeAi(reply), ["full"], items, () => "alpha beta gamma");
  assert.equal(report.full.exact, 1);
});

test("checkClaims rates only claims without my_rating", async () => {
  const items = [
    { ...item, id: "claim-001", my_rating: "fully_supported" },
    { ...item, id: "claim-002" },
  ];
  const reply = {
    subclaims: [
      { text: "a", weight: "core", match_type: "paraphrase", evidence_quote: "alpha beta" },
    ],
    reasoning: "r",
  };
  const results = await checkClaims(fakeAi(reply), "full", items, () => "alpha beta gamma");
  assert.equal(results.length, 1);
  assert.equal(results[0].id, "claim-002");
  assert.equal(results[0].label, "fully_supported");
});

test("validate does not require my_rating in unrated mode", () => {
  const unrated = {
    file: "claim-002.json",
    id: "claim-002",
    set: "regular",
    article_title: "t",
    sentence: "s",
    context: "s",
    my_rating: "",
  };
  assert.equal(checkItem(unrated, "text", false).errors.length, 0);
  assert.ok(checkItem(unrated, "text", true).errors.some((e) => e.includes("my_rating")));
});