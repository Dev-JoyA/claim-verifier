import { decodeEntities, stripTags } from "./htmlText.js";

const CITE_OPEN = "\u0001";
const CITE_CLOSE = "\u0002";
const MARKER = /\u0001([^\u0002]*)\u0002/g;
const SUP_REFERENCE = /<sup\b[^>]*\bclass="[^"]*\breference\b[^"]*"[^>]*>[\s\S]*?<\/sup>/gi;
const PARAGRAPH = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
const BOUNDARY = /([.!?]["'\u201d\u2019)\]]*(?:\u0001[^\u0002]*\u0002)*)\s+(?=["\u201c\u2018(]?[A-Z0-9])/g;
const ABBREVIATION = /(?:\b[A-Z]|\b(?:Mr|Mrs|Ms|Dr|Prof|St|Mt|Jr|Sr|vs|No|Inc|Ltd|Co|Gen|Col|Sen|Rep|Gov|Lt|Capt|Rev|Hon))\.$/;
const REFERENCE_ITEM = /<li\b[^>]*\bid="cite_note-([^"]+)"[^>]*>([\s\S]*?)<\/li>/gi;
const LINK = /href="((?:https?:)?\/\/[^"]+)"/gi;
const ARCHIVE_HOSTS = ["web.archive.org", "archive.org", "archive.ph", "archive.today", "archive.is"];
const WIKI_HOSTS = ["wikipedia.org", "wikimedia.org", "wikidata.org", "mediawiki.org"];
const MIN_CLAIM_LENGTH = 25;

const withoutMarkers = (text) => text.replace(MARKER, "");
const tidy = (text) => text.replace(/\s+/g, " ").replace(/\s+([.,;:!?])/g, "$1").trim();

function markCitations(html) {
  return html.replace(SUP_REFERENCE, (sup) => {
    const id = /cite_note-([^"'\s>]+)/.exec(sup)?.[1];
    return id ? `${CITE_OPEN}${id}${CITE_CLOSE}` : "";
  });
}

export function splitSentences(text) {
  const sentences = [];
  let start = 0;

  for (const match of text.matchAll(BOUNDARY)) {
    const end = match.index + match[1].length;
    const candidate = text.slice(start, end);
    if (ABBREVIATION.test(withoutMarkers(candidate))) continue;
    sentences.push(candidate.trim());
    start = match.index + match[0].length;
  }

  const rest = text.slice(start).trim();
  if (rest) sentences.push(rest);
  return sentences;
}

export function extractClaims(html) {
  const claims = [];

  for (const paragraph of html.matchAll(PARAGRAPH)) {
    const marked = decodeEntities(stripTags(markCitations(paragraph[1])));
    const context = tidy(withoutMarkers(marked));

    for (const sentence of splitSentences(marked.replace(/\s+/g, " ").trim())) {
      const refIds = [...sentence.matchAll(MARKER)].map((match) => match[1]);
      const clean = tidy(withoutMarkers(sentence));
      if (refIds.length > 0 && clean.length >= MIN_CLAIM_LENGTH) {
        claims.push({ sentence: clean, context, refIds });
      }
    }
  }
  return claims;
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

const isOn = (url, hosts) => hosts.some((host) => hostOf(url) === host || hostOf(url).endsWith(`.${host}`));

export function extractReferences(html) {
  const references = new Map();

  for (const item of html.matchAll(REFERENCE_ITEM)) {
    const [, id, body] = item;
    const urls = [...body.matchAll(LINK)]
      .map((match) => decodeEntities(match[1]))
      .map((url) => (url.startsWith("//") ? `https:${url}` : url))
      .filter((url) => hostOf(url) && !isOn(url, WIKI_HOSTS));

    const archived = urls.filter((url) => isOn(url, ARCHIVE_HOSTS));
    const direct = urls.filter((url) => !isOn(url, ARCHIVE_HOSTS));
    references.set(id, {
      citeText: tidy(decodeEntities(stripTags(body))).replace(/^\^\s*/, ""),
      url: direct[0] ?? archived[0] ?? "",
      archiveUrl: archived[0] ?? "",
    });
  }
  return references;
}
