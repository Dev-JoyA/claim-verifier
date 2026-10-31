export function parseSelection(text, max) {
  const numbers = new Set();

  for (const rawPart of text.replace(/[\u2013\u2014]/g, "-").split(",")) {
    const part = rawPart.trim();
    if (!part) continue;

    const range = /^(\d+)\s*-\s*(\d+)$/.exec(part);
    const single = /^\d+$/.test(part);
    if (!range && !single) {
      throw new Error(`Cannot read "${part}". Use numbers like 1-5, 8.`);
    }

    const from = Number(range ? range[1] : part);
    const to = Number(range ? range[2] : part);
    if (from > to) throw new Error(`"${part}" goes backwards.`);
    if (from < 1 || to > max) throw new Error(`"${part}" is outside 1-${max}.`);

    for (let number = from; number <= to; number++) numbers.add(number);
  }
  return [...numbers].sort((a, b) => a - b);
}

export function pickRandom(numbers, count, random = Math.random) {
  const pool = [...numbers];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count).sort((a, b) => a - b);
}
