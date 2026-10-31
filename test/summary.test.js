import test from "node:test";
import assert from "node:assert/strict";
import {
  articleLinks,
  compareCounts,
  countsOf,
  disagreements,
  groupClaims,
  ratedBy,
  referenceLink,
  toCsv,
  toWikitext,
} from "../public/summary.js";

const LABELS = ["fully_supported", "not_supported", "source_unavailable"];

const view = (status, rating = "", extra = {}) => ({
  status,
  rating,
  agreement: null,
  decision: null,
  needsDecision: false,
  ...extra,
});

const source = (url, index = 1) => ({ index, refId: String(index), url, archiveUrl: "", hasText: true });

const CLAIMS = [
  { number: 1, sentence: "One.", sources: [source("https://a.example/x y")], view: view("human", "fully_supported") },
  {
    number: 2,
    sentence: 'Two "quoted".',
    sources: [source("https://b.example/p"), source("", 2)],
    view: view("ai_accepted", "not_supported"),
  },
  { number: 3, sentence: "Three.", sources: [source("https://c.example")], view: view("ai_pending", "fully_supported") },
  { number: 4, sentence: "Four.", sources: [source("https://d.example")], view: view("unverified") },
  { number: 5, sentence: "Five.", sources: [source("https://e.example")], view: view("human", "source_unavailable") },
];

test("article and reference links point at the exact revision", () => {
  const links = articleLinks("Diana Cage", 123);
  assert.equal(links.revision, "https://en.wikipedia.org/w/index.php?title=Diana_Cage&oldid=123");
  assert.equal(links.latest, "https://en.wikipedia.org/wiki/Diana_Cage");
  assert.equal(referenceLink("Diana Cage", 123, "Smith-2"), `${links.revision}#cite_note-Smith-2`);
});

test("countsOf separates verified, needs review and unverified", () => {
  assert.deepEqual(countsOf(CLAIMS), { total: 5, verified: 3, review: 1, unverified: 1 });
});

test("groupClaims lists every rating, then needs review, then unverified", () => {
  const groups = groupClaims(CLAIMS, LABELS);
  assert.deepEqual(
    groups.map((group) => [group.key, group.claims.map((claim) => claim.number)]),
    [
      ["fully_supported", [1]],
      ["not_supported", [2]],
      ["source_unavailable", [5]],
      ["needs_review", [3]],
      ["unverified", [4]],
    ]
  );
  assert.equal(groups[0].tone, "success");
  assert.equal(groups[1].tone, "danger");
  assert.equal(groups[2].tone, "info");
});

test("a pending AI rating is never counted as verified in a rating group", () => {
  const fully = groupClaims(CLAIMS, LABELS)[0];
  assert.deepEqual(fully.claims.map((claim) => claim.number), [1]);
});

test("ratedBy says who rated, and notes an adopted AI rating", () => {
  assert.equal(ratedBy(view("human", "x")), "human");
  assert.equal(ratedBy(view("human", "x", { decision: { choice: "ai" } })), "human (adopted the AI's rating)");
  assert.equal(ratedBy(view("ai_accepted", "x")), "AI rating, accepted by a human");
  assert.equal(ratedBy(view("unverified")), "");
});

test("compareCounts and disagreements use the agreement state", () => {
  const claims = [
    { number: 1, view: view("human", "a", { agreement: { state: "agree" } }) },
    { number: 2, view: view("human", "a", { agreement: { state: "close" }, needsDecision: true }) },
    { number: 3, view: view("human", "a", { agreement: { state: "differ" }, needsDecision: false }) },
    { number: 4, view: view("unverified") },
  ];
  assert.deepEqual(compareCounts(claims), { compared: 3, agree: 1, close: 1, differ: 1, waiting: 1 });
  assert.deepEqual(disagreements(claims).map((claim) => claim.number), [2, 3]);
});

test("toWikitext builds a table with links and no unsafe characters", () => {
  const text = toWikitext({ title: "Example", revid: 9, groups: groupClaims(CLAIMS, LABELS) });
  assert.ok(text.startsWith('{| class="wikitable"'));
  assert.ok(text.endsWith("|}"));
  assert.ok(text.includes("<nowiki>Example</nowiki> (revision 9)"));
  assert.ok(text.includes("#1 (human): [https://a.example/x%20y a.example]"));
  assert.ok(text.includes("#2 (AI, accepted): [https://b.example/p b.example], (no web address)"));
  assert.ok(text.includes("| unverified || 1 |") === false);
  assert.ok(text.includes("| Unverified || 1 || #4: [https://d.example d.example]"));
});

test("toCsv quotes every cell and doubles inner quotes", () => {
  const csv = toCsv(CLAIMS);
  const lines = csv.split("\n");
  assert.equal(lines[0], "number,status,rating,rated_by,sentence,source_urls");
  assert.ok(lines[2].includes('"Two ""quoted""."'));
  assert.ok(lines[2].includes('"https://b.example/p"'));
  assert.equal(lines.length, 6);
});
