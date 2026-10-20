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
  if (data.error) throw new Error(`Wikipedia API: ${data.error.info}`);
  return { title: data.parse.title, revid: data.parse.revid, html: data.parse.text };
}

export async function randomTitle(fetchImpl = fetch) {
  const data = await getJson(
    { action: "query", list: "random", rnnamespace: "0", rnlimit: "1" },
    fetchImpl
  );
  return data.query.random[0].title;
}
