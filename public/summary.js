export const RATING_TONES = {
  fully_supported: "success",
  mostly_supported: "success",
  partially_supported: "warning",
  not_supported: "danger",
  contradicted: "danger",
  source_unavailable: "info",
};

export const nice = (text) => String(text).replaceAll("_", " ");

export const isVerified = (view) => view.status === "human" || view.status === "ai_accepted";

export function articleLinks(title, revid) {
  const slug = encodeURIComponent(title.replaceAll(" ", "_"));
  return {
    revision: `https://en.wikipedia.org/w/index.php?title=${slug}&oldid=${revid}`,
    latest: `https://en.wikipedia.org/wiki/${slug}`,
  };
}

export function referenceLink(title, revid, refId) {
  return `${articleLinks(title, revid).revision}#cite_note-${refId}`;
}

export function countsOf(claims) {
  return {
    total: claims.length,
    verified: claims.filter((claim) => isVerified(claim.view)).length,
    review: claims.filter((claim) => claim.view.status === "ai_pending").length,
    unverified: claims.filter((claim) => claim.view.status === "unverified").length,
  };
}

export function ratedBy(view) {
  if (view.status === "human") {
    return view.decision?.choice === "ai" ? "human (adopted the AI's rating)" : "human";
  }
  if (view.status === "ai_accepted") return "AI rating, accepted by a human";
  if (view.status === "ai_pending") return "AI suggestion, not reviewed";
  return "";
}

export function groupClaims(claims, labels) {
  const groups = labels.map((label) => ({
    key: label,
    title: nice(label),
    tone: RATING_TONES[label] ?? "none",
    claims: claims.filter((claim) => isVerified(claim.view) && claim.view.rating === label),
  }));

  groups.push({
    key: "needs_review",
    title: "AI suggestion \u00b7 needs review",
    tone: "warning",
    claims: claims.filter((claim) => claim.view.status === "ai_pending"),
  });
  groups.push({
    key: "unverified",
    title: "Unverified",
    tone: "none",
    claims: claims.filter((claim) => claim.view.status === "unverified"),
  });
  return groups;
}

export function compareCounts(claims) {
  const both = claims.filter((claim) => claim.view.agreement);
  const count = (state) => both.filter((claim) => claim.view.agreement.state === state).length;
  return {
    compared: both.length,
    agree: count("agree"),
    close: count("close"),
    differ: count("differ"),
    waiting: both.filter((claim) => claim.view.needsDecision).length,
  };
}

export function disagreements(claims) {
  return claims.filter(
    (claim) => claim.view.agreement && claim.view.agreement.state !== "agree"
  );
}

function wikiUrl(url) {
  return url
    .replaceAll(" ", "%20")
    .replaceAll("[", "%5B")
    .replaceAll("]", "%5D")
    .replaceAll("|", "%7C");
}

function hostName(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function claimLine(claim) {
  const links = claim.sources
    .map((source) =>
      source.url ? `[${wikiUrl(source.url)} ${hostName(source.url)}]` : "(no web address)"
    )
    .join(", ");
  const by = claim.view.status === "human" ? " (human)" : claim.view.status === "ai_accepted" ? " (AI, accepted)" : "";
  return `#${claim.number}${by}: ${links}`;
}

export function toWikitext({ title, revid, groups }) {
  const rows = groups.map((group) => {
    const lines = group.claims.length ? group.claims.map(claimLine).join("<br />\n") : "none";
    return `|-\n| ${group.title} || ${group.claims.length} || ${lines}`;
  });
  return [
    '{| class="wikitable"',
    `|+ Verification summary: <nowiki>${title}</nowiki> (revision ${revid})`,
    "! Rating !! Claims !! Claim numbers and sources",
    ...rows,
    "|}",
  ].join("\n");
}

function csvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export function toCsv(claims) {
  const header = ["number", "status", "rating", "rated_by", "sentence", "source_urls"];
  const rows = claims.map((claim) =>
    [
      claim.number,
      claim.view.status,
      claim.view.rating,
      ratedBy(claim.view),
      claim.sentence,
      claim.sources.map((source) => source.url).filter(Boolean).join(" | "),
    ]
      .map(csvCell)
      .join(",")
  );
  return [header.join(","), ...rows].join("\n");
}
