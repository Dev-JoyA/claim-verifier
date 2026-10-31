export const $ = (selector) => document.querySelector(selector);

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "class") node.className = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else if (value === true) node.setAttribute(key, "");
    else if (value !== false && value != null) node.setAttribute(key, value);
  }
  for (const child of children.flat(Infinity)) {
    if (child != null && child !== false) node.append(child);
  }
  return node;
}

export async function request(url, body) {
  const options = body
    ? {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }
    : undefined;
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

export function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function formatTime(iso) {
  return iso ? new Date(iso).toLocaleString() : "";
}

export function externalLink(url, text) {
  return el(
    "a",
    { href: url, target: "_blank", rel: "noopener noreferrer", class: "external" },
    text,
    el("span", { class: "ext-icon", "aria-hidden": "true" }, " \u2197")
  );
}

export function showDialog(build) {
  const dialog = $("#dialog");
  return new Promise((resolve) => {
    const close = (value) => {
      dialog.close();
      resolve(value);
    };
    dialog.replaceChildren(...build(close).filter(Boolean));
    dialog.oncancel = () => resolve(null);
    dialog.showModal();
  });
}
