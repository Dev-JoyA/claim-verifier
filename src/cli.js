import {
  ManualClient,
  AnthropicClient,
  GeminiClient,
  OllamaClient,
  CachedClient,
} from "./clients.js";

export function getFlag(name, fallback) {
  const position = process.argv.indexOf(`--${name}`);
  return position > -1 ? process.argv[position + 1] : fallback;
}

export function makeClient() {
  const choice = getFlag("client", process.env.AI_CLIENT || "manual");
  if (choice === "manual") return new ManualClient();

  const model = getFlag("model", process.env.AI_MODEL);
  if (choice === "gemini") return new CachedClient(new GeminiClient(model));
  if (choice === "ollama") return new CachedClient(new OllamaClient(model));
  if (choice === "anthropic") return new CachedClient(new AnthropicClient(model));
  throw new Error(`Unknown client "${choice}". Use manual, ollama, gemini or anthropic.`);
}
