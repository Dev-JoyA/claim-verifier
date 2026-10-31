import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { extractClaims, extractReferences } from "../extract.js";
import { RUBRIC } from "../verifier.js";
import { createStore, viewOf } from "./store.js";
import { verifyClaim, acceptAi, keepHuman, rateByHuman, HttpError } from "./pipeline.js";

const MAX_BODY_BYTES = 3 * 1024 * 1024;
const LOCAL_HOSTS = ["localhost", "127.0.0.1"];
const NOT_FOUND_CODES = ["missingtitle", "invalidtitle"];
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

export function claimsFrom(html) {
  const references = extractReferences(html);

  return extractClaims(html).map((claim, position) => ({
    number: position + 1,
    sentence: claim.sentence,
    context: claim.context,
    sources: claim.refIds.map((refId, index) => {
      const reference = references.get(refId) ?? { citeText: "", url: "", archiveUrl: "" };
      return {
        index: index + 1,
        refId,
        url: reference.url,
        archiveUrl: reference.archiveUrl,
        citeText: reference.citeText,
      };
    }),
  }));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, "That request is too large.");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new HttpError(400, "The request body is not valid JSON.");
  }
}

function sendJson(response, status, data) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(data));
}

function sendStatic(publicDir, pathname, response) {
  const relative = pathname === "/" ? "index.html" : pathname.slice(1);
  const file = path.normalize(path.join(publicDir, relative));
  const insidePublic = file.startsWith(path.normalize(publicDir + path.sep));

  if (!insidePublic || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return sendJson(response, 404, { error: "Not found." });
  }
  response.writeHead(200, {
    "content-type": MIME[path.extname(file)] ?? "application/octet-stream",
    "cache-control": "no-store",
  });
  response.end(fs.readFileSync(file));
}

export function createApp(deps) {
  const store = createStore(deps);
  const articles = new Map();

  function sourcesView(claim, item) {
    return claim.sources.map((source) => {
      const stored = item?.sources?.find((candidate) => candidate.index === source.index);
      const hasText = Boolean(stored && store.readSource(item, stored).trim());
      return { ...source, hasText };
    });
  }

  async function fetchByTitle(title) {
    try {
      return { fetched: await deps.fetchArticle({ title }) };
    } catch (error) {
      if (!NOT_FOUND_CODES.includes(error.code)) throw new HttpError(502, error.message);
    }

    const [closest] = await deps.searchTitles(title);
    if (!closest) throw new HttpError(404, `No Wikipedia article found for "${title}".`);
    try {
      return { fetched: await deps.fetchArticle({ title: closest }), searchedFor: title };
    } catch (error) {
      throw new HttpError(502, error.message);
    }
  }

  async function loadArticle({ title, revid }) {
    if (revid && articles.has(String(revid))) return articles.get(String(revid));

    let fetched;
    let searchedFor;
    if (revid) {
      try {
        fetched = await deps.fetchArticle({ oldid: revid });
      } catch (error) {
        throw new HttpError(502, error.message);
      }
    } else {
      ({ fetched, searchedFor } = await fetchByTitle(title));
    }

    const article = {
      title: fetched.title,
      revid: fetched.revid,
      claims: claimsFrom(fetched.html),
      searchedFor,
    };
    articles.set(String(article.revid), article);
    return article;
  }

  async function claimFromBody(body) {
    if (!body.revid) throw new HttpError(400, "Missing revid.");
    const article = await loadArticle({ revid: body.revid });
    const claim = article.claims[Number(body.number) - 1];
    if (!claim) throw new HttpError(400, `There is no claim number ${body.number}.`);
    return { article, claim };
  }

  const routes = {
    "GET /api/config": async () => ({
      aiChoice: deps.ai.choice,
      aiModel: deps.ai.model ?? "",
      manual: !deps.ai.client,
      labels: RUBRIC.labels,
      labelOrder: RUBRIC.labelOrder,
    }),

    "GET /api/article": async (url) => {
      const title = url.searchParams.get("title");
      const oldid = url.searchParams.get("oldid");
      if (!title && !oldid) throw new HttpError(400, "Give an article title or a revision id.");

      const article = await loadArticle({ title: oldid ? undefined : title, revid: oldid });
      return {
        title: article.title,
        revid: article.revid,
        searchedFor: article.searchedFor ?? "",
        claims: article.claims.map((claim) => {
          const item = store.find(article, claim);
          return { ...claim, sources: sourcesView(claim, item), view: viewOf(item) };
        }),
      };
    },

    "GET /api/suggest": async (url) => {
      const query = (url.searchParams.get("q") ?? "").trim();
      if (query.length < 2) return [];
      try {
        return await deps.suggestTitles(query);
      } catch {
        return [];
      }
    },

    "POST /api/verify": async (url, body) => {
      const { article, claim } = await claimFromBody(body);
      const result = await verifyClaim({
        store,
        article,
        claim,
        ai: deps.ai,
        fetchText: deps.fetchText,
        sourceTexts: body.sourceTexts,
        allowMissing: Boolean(body.allowMissing),
        aiReply: body.aiReply,
      });

      const item = result.item ?? store.find(article, claim);
      const sources = sourcesView(claim, item);
      if (result.outcome === "verified") {
        return { outcome: "verified", view: viewOf(result.item), sources };
      }
      return { ...result, sources };
    },

    "POST /api/accept": async (url, body) => {
      const { article, claim } = await claimFromBody(body);
      return { view: viewOf(acceptAi(store, store.find(article, claim))) };
    },

    "POST /api/rate": async (url, body) => {
      const { article, claim } = await claimFromBody(body);
      const item = rateByHuman(store, store.ensure(article, claim), body);
      return { view: viewOf(item) };
    },

    "POST /api/decide": async (url, body) => {
      const { article, claim } = await claimFromBody(body);
      return { view: viewOf(keepHuman(store, store.find(article, claim), body)) };
    },
  };

  return http.createServer(async (request, response) => {
    try {
      const host = (request.headers.host ?? "").split(":")[0];
      if (!LOCAL_HOSTS.includes(host)) throw new HttpError(403, "Local use only.");

      const url = new URL(request.url, "http://localhost");
      const handler = routes[`${request.method} ${url.pathname}`];

      if (handler) {
        const body = request.method === "POST" ? await readJson(request) : {};
        return sendJson(response, 200, await handler(url, body));
      }
      if (request.method === "GET" && !url.pathname.startsWith("/api/")) {
        return sendStatic(deps.publicDir, url.pathname, response);
      }
      throw new HttpError(404, "Not found.");
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      sendJson(response, status, { error: error.message });
    }
  });
}
