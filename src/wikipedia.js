import { USER_AGENT } from "./http.js";

const API_URL = "https://en.wikipedia.org/w/api.php";

async function getJson(params, fetchImpl) {
  const query = new URLSearchParams({ format: "json", formatversion: "2", ...params });
  const response = await fetchImpl(`${API_URL}?${query}`, {
    headers: { "user-agent": USER_AGENT },
  });
  if (!response.ok) throw new Error(`Wikipedia API error ${response.status}`);
  return response.json();
}

export async function fetchArticle({ title, oldid }, fetchImpl = fetch) {
  const which = oldid ? { oldid: String(oldid) } : { page: title };
  const data = await getJson(
    { action: "parse", prop: "text|revid", redirects: "1", ...which },
    fetchImpl
  );
  if (data.error) {
    const error = new Error(`Wikipedia API: ${data.error.info}`);
    error.code = data.error.code;
    throw error;
  }
  return { title: data.parse.title, revid: data.parse.revid, html: data.parse.text };
}

export async function randomTitle(fetchImpl = fetch) {
  const data = await getJson(
    { action: "query", list: "random", rnnamespace: "0", rnlimit: "1" },
    fetchImpl
  );
  return data.query.random[0].title;
}

export async function searchTitles(query, limit = 5, fetchImpl = fetch) {
  const data = await getJson(
    {
      action: "query",
      list: "search",
      srsearch: query,
      srnamespace: "0",
      srlimit: String(limit),
    },
    fetchImpl
  );
  return (data.query?.search ?? []).map((hit) => hit.title);
}

export async function suggestTitles(query, fetchImpl = fetch) {
  const data = await getJson(
    { action: "opensearch", search: query, limit: "8", namespace: "0" },
    fetchImpl
  );
  return Array.isArray(data) && Array.isArray(data[1]) ? data[1] : [];
}
