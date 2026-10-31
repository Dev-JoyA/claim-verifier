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

export function makeBareClient(choice, model) {
  if (choice === "gemini") return new GeminiClient(model);
  if (choice === "ollama") return new OllamaClient(model);
  if (choice === "anthropic") return new AnthropicClient(model);
  throw new Error(`Unknown client "${choice}". Use manual, ollama, gemini or anthropic.`);
}

export function makeClient() {
  const choice = getFlag("client", process.env.AI_CLIENT || "manual");
  if (choice === "manual") return new ManualClient();

  const model = getFlag("model", process.env.AI_MODEL);
  return new CachedClient(makeBareClient(choice, model));
}
