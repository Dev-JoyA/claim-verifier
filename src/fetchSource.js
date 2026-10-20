import { htmlToText } from "./htmlText.js";
import { USER_AGENT } from "./http.js";

const MIN_TEXT_LENGTH = 400;
const TIMEOUT_MS = 20000;

function failure(note) {
  return { ok: false, text: "", note };
}

export async function fetchSourceText(url, fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { "user-agent": USER_AGENT, accept: "text/html,text/plain" },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    return failure(`could not fetch (${error.message})`);
  }

  if (!response.ok) return failure(`HTTP ${response.status}`);

  const type = response.headers.get("content-type") ?? "";
  if (type.includes("pdf")) return failure("PDF (not supported yet)");

  const body = await response.text();
  const looksLikeHtml = type.includes("html") || body.trimStart().startsWith("<");
  const text = looksLikeHtml ? htmlToText(body) : body.trim();

  if (text.length < MIN_TEXT_LENGTH) {
    return failure("very little text extracted (paywall, login wall or JavaScript page?)");
  }
  return { ok: true, text, note: "" };
}
