import test from "node:test";
import assert from "node:assert/strict";
import { parseSelection, pickRandom } from "../public/selection.js";

test("parseSelection understands numbers, ranges and en dashes", () => {
  assert.deepEqual(parseSelection("1-3, 5", 10), [1, 2, 3, 5]);
  assert.deepEqual(parseSelection("4\u20136,5", 10), [4, 5, 6]);
  assert.deepEqual(parseSelection("", 10), []);
});

test("parseSelection explains bad input", () => {
  assert.throws(() => parseSelection("a-b", 10), /Cannot read/);
  assert.throws(() => parseSelection("5-2", 10), /backwards/);
  assert.throws(() => parseSelection("1-11", 10), /outside 1-10/);
  assert.throws(() => parseSelection("0", 10), /outside/);
});

test("pickRandom returns the requested count in order, from the pool only", () => {
  const picked = pickRandom([2, 4, 6, 8, 10], 3, () => 0.3);
  assert.equal(picked.length, 3);
  assert.deepEqual(picked, [...picked].sort((a, b) => a - b));
  assert.ok(picked.every((n) => [2, 4, 6, 8, 10].includes(n)));
  assert.equal(pickRandom([1, 2], 5).length, 2);
});
