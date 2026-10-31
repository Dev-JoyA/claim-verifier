import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { fromRoot } from "./paths.js";

export class ManualClient {
  constructor(folder = fromRoot("results", "manual")) {
    this.dir = folder;
    fs.mkdirSync(this.dir, { recursive: true });
  }

  async complete(prompt, key) {
    const promptFile = path.join(this.dir, `${key}.prompt.txt`);
    const replyFile = path.join(this.dir, `${key}.reply.json`);

    if (!fs.existsSync(replyFile)) {
      fs.writeFileSync(promptFile, prompt, "utf8");
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      await rl.question(
        `\nPrompt saved: ${promptFile}\n` +
          `Paste it into a NEW chat, save the reply as:\n${replyFile}\n` +
          "Then press Enter..."
      );
      rl.close();

      if (!fs.existsSync(replyFile)) {
        throw new Error(
          `No reply file found at ${replyFile}\n` +
            "Save the AI's reply there, then run the command again."
        );
      }
    }
    return fs.readFileSync(replyFile, "utf8");
  }
}

const RETRY_WAITS_MS = [3000, 8000, 20000];
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504, 529]);
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function readableError(text) {
  try {
    return JSON.parse(text).error.message;
  } catch {
    return text.slice(0, 200);
  }
}

async function fetchWithRetries(fetchImpl, sleep, url, options) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetchImpl(url, options);
    const retry = RETRYABLE_STATUSES.has(response.status) && attempt < RETRY_WAITS_MS.length;
    if (!retry) return response;
    await sleep(RETRY_WAITS_MS[attempt]);
  }
}

async function failFrom(service, response) {
  const busy = RETRYABLE_STATUSES.has(response.status)
    ? " The service is busy. Wait a minute and try again."
    : "";
  const body = await response.text();
  return new Error(`${service} error ${response.status}: ${readableError(body)}${busy}`);
}

export class AnthropicClient {
  constructor(model, { fetchImpl = fetch, sleep = defaultSleep } = {}) {
    this.model = model;
    this.key = process.env.ANTHROPIC_API_KEY;
    if (!this.key) throw new Error("Set ANTHROPIC_API_KEY first.");
    this.fetchImpl = fetchImpl;
    this.sleep = sleep;
  }

  async complete(prompt) {
    const response = await fetchWithRetries(this.fetchImpl, this.sleep, "https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!response.ok) throw await failFrom("Claude API", response);
    const data = await response.json();
    return data.content[0].text;
  }
}

export class GeminiClient {
  constructor(model, { fetchImpl = fetch, sleep = defaultSleep } = {}) {
    this.key = process.env.GEMINI_API_KEY;
    if (!this.key) throw new Error("Set GEMINI_API_KEY first.");
    if (!model) throw new Error("Pass --model with a model name from Google AI Studio.");
    this.model = model;
    this.fetchImpl = fetchImpl;
    this.sleep = sleep;
  }

  async complete(prompt) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;
    const response = await fetchWithRetries(this.fetchImpl, this.sleep, url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": this.key },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    if (!response.ok) throw await failFrom("Gemini API", response);

    const data = await response.json();
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const text = parts.map((part) => part.text ?? "").join("");
    if (!text) throw new Error(`Gemini returned no text: ${JSON.stringify(data).slice(0, 300)}`);
    return text;
  }
}

export class CachedClient {
  constructor(inner, folder = fromRoot("results", "replies")) {
    this.inner = inner;
    this.dir = folder;
    fs.mkdirSync(this.dir, { recursive: true });
  }

  async complete(prompt, key) {
    const replyFile = path.join(this.dir, `${key}.reply.json`);
    if (fs.existsSync(replyFile)) return fs.readFileSync(replyFile, "utf8");

    const reply = await this.inner.complete(prompt, key);
    fs.writeFileSync(replyFile, reply, "utf8");
    return reply;
  }
}

export class OllamaClient {
  constructor(model, { fetchImpl = fetch, baseUrl = "http://localhost:11434" } = {}) {
    if (!model) throw new Error("Pass --model with a model name shown by `ollama list`.");
    this.model = model;
    this.fetchImpl = fetchImpl;
    this.baseUrl = baseUrl;
  }

  async complete(prompt) {
    let response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
          format: "json",
          options: { num_ctx: 8192 },
        }),
      });
    } catch (error) {
      throw new Error(`Could not reach Ollama at ${this.baseUrl}. Is it running? (${error.message})`);
    }

    if (!response.ok) throw new Error(`Ollama error ${response.status}: ${await response.text()}`);
    const data = await response.json();
    if (data.error) throw new Error(`Ollama error: ${data.error}`);
    if (!data.response) throw new Error("Ollama returned no text.");
    return data.response;
  }
}
