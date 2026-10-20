const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "\u2013",
  mdash: "\u2014",
  hellip: "\u2026",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201c",
  rdquo: "\u201d",
};

const NOISE_BLOCKS = /<(script|style|noscript|svg|nav|header|footer|aside|form|iframe)\b[\s\S]*?<\/\1>/gi;
const BLOCK_BREAKS = /<\/?(p|div|li|ul|ol|h[1-6]|tr|section|article|blockquote|br)\b[^>]*>/gi;
const MIN_MAIN_LENGTH = 400;

function fromCodePoint(codePoint) {
  return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : "";
}

export function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, number) => fromCodePoint(Number(number)))
    .replace(/&([a-z]+);/gi, (whole, name) => NAMED_ENTITIES[name.toLowerCase()] ?? whole);
}

export function stripTags(html) {
  return html.replace(/<[^>]+>/g, "");
}

function mainContent(html) {
  for (const tag of ["article", "main"]) {
    const match = new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}>`, "i").exec(html);
    if (match && stripTags(match[0]).length > MIN_MAIN_LENGTH) return match[0];
  }
  return html;
}

export function htmlToText(html) {
  const withoutNoise = html.replace(NOISE_BLOCKS, " ");
  const withBreaks = mainContent(withoutNoise).replace(BLOCK_BREAKS, "\n");
  return decodeEntities(stripTags(withBreaks))
    .split("\n")
    .map((line) => line.replace(/[ \t\u00a0]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}
